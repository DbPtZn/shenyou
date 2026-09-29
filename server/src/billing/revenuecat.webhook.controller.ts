import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { BusinessException } from "../common/business.exception";
import { EntitlementService } from "./entitlement.service";
import { normalizeWebhookEvent } from "./billing.mapper";
import type {
  RevenueCatEvent,
  RevenueCatWebhookPayload,
} from "./billing.types";
import { RevenueCatVerifier } from "./revenuecat.verifier";

/**
 * RevenueCat webhook 接收端（服务端到服务端，无 JWT）。
 * 链路：原始 body → 验签（Authorization + HMAC）→ 结构校验 → 归一化 → 幂等状态机。
 * 必须快速返回 200；其余状态码 RC 会按 5/10/20/40/80 分钟重试 5 次。
 */
@Controller("billing/revenuecat")
export class RevenueCatWebhookController {
  constructor(
    private readonly verifier: RevenueCatVerifier,
    private readonly entitlements: EntitlementService,
  ) {}

  @Post("webhook")
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("authorization") authorization?: string,
    @Headers("x-revenuecat-webhook-signature") signature?: string,
  ): Promise<{ received: true; duplicated: boolean }> {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BusinessException(ErrorCode.ValidationFailed, 400, "请求体为空");
    }

    // ── 验签（失败统一返回 401，不泄露具体失败项）──
    try {
      this.verifier.verify(rawBody, { authorization, signature });
    } catch {
      throw new BusinessException(ErrorCode.Unauthorized, 401, "Webhook 验签失败");
    }

    // ── 解析与结构校验 ──
    const payload = parsePayload(rawBody);

    // ── 归一化 → 幂等处理 ──
    const result = await this.entitlements.applyEvent(normalizeWebhookEvent(payload));
    return { received: true, duplicated: result.duplicated };
  }
}

/** 解析 webhook payload 并做最小结构校验（不逐条校验业务字段，保持前向兼容） */
function parsePayload(rawBody: Buffer): RevenueCatWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new BusinessException(ErrorCode.ValidationFailed, 400, "请求体不是有效的 JSON");
  }

  const event = (parsed as { event?: RevenueCatEvent }).event;
  if (
    !event ||
    typeof event !== "object" ||
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    typeof event.app_user_id !== "string"
  ) {
    throw new BusinessException(
      ErrorCode.ValidationFailed,
      400,
      "事件结构缺少必要字段",
    );
  }

  return { event, api_version: (parsed as RevenueCatWebhookPayload).api_version };
}
