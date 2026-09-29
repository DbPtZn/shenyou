import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV, type Env } from "../config/env";

/** webhook 签名头格式：t=<unix_timestamp>,v1=<hmac_sha256_hex> */
const SIGNATURE_HEADER_PATTERN = /(?:^|,\s*)t=(\d+),v1=([0-9a-f]+)/;

/** 签名时间戳容差：超过 5 分钟视为重放攻击 */
const TIMESTAMP_TOLERANCE_MS = 5 * 60_000;

/**
 * RevenueCat webhook 验签：
 * 1. Authorization 头共享密钥（dashboard 配置）；
 * 2. HMAC 签名（X-RevenueCat-Webhook-Signature），HMAC 内容 `${timestamp}.${rawBody}`。
 * 两个密钥均可通过 env 配置；未配置的校验项自动跳过（本地开发）。
 */
@Injectable()
export class RevenueCatVerifier {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** 执行全部已启用的校验；任一失败抛 Error */
  verify(
    rawBody: Buffer,
    headers: { authorization?: string | undefined; signature?: string | undefined },
  ): void {
    this.verifyAuthorization(headers.authorization);
    this.verifyHmac(rawBody, headers.signature);
  }

  private verifyAuthorization(authorization: string | undefined): void {
    const expected = this.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected) return; // 未配置 → 跳过
    if (!authorization) {
      throw new Error("缺少 Authorization 头");
    }
    // 允许 "Bearer <secret>" 或裸 secret 两种形式
    const presented = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : authorization;
    if (!safeEqual(presented, expected)) {
      throw new Error("Authorization 校验失败");
    }
  }

  private verifyHmac(rawBody: Buffer, signatureHeader: string | undefined): void {
    const secret = this.env.REVENUECAT_WEBHOOK_SIGNING_SECRET;
    if (!secret) return; // 未配置 → 跳过
    if (!signatureHeader) {
      throw new Error("缺少签名头");
    }

    const match = SIGNATURE_HEADER_PATTERN.exec(signatureHeader);
    if (!match) {
      throw new Error("签名头格式无效");
    }
    const timestamp = match[1]!;
    const presentedSig = match[2]!;

    // 时间戳新鲜度
    const tsMs = Number(timestamp) * 1000;
    if (Math.abs(Date.now() - tsMs) > TIMESTAMP_TOLERANCE_MS) {
      throw new Error("签名时间戳超出容差");
    }

    const expectedSig = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest("hex");

    if (!safeEqual(presentedSig, expectedSig)) {
      throw new Error("HMAC 签名校验失败");
    }
  }
}

/** 等长字符串的 timing-safe 比较；长度不等直接失败 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
