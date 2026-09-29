import { Inject, Injectable } from "@nestjs/common";
import {
  type EntitlementDto,
  ENTITLEMENT_ID,
} from "@shenyou/shared";
import { randomUUID } from "node:crypto";
import { BusinessException } from "../common/business.exception";
import { ErrorCode } from "@shenyou/shared";
import { ENV, type Env } from "../config/env";
import { SANDBOX_PRODUCTS } from "./billing.constants";
import type { SandboxSimulateDto } from "./billing.dto";
import { EntitlementService } from "./entitlement.service";
import type { NormalizedBillingEvent } from "./billing.types";
import {
  type RestSubscriber,
  RevenueCatApiService,
  normalizeRestPeriodType,
  normalizeRestStore,
} from "./revenuecat.api.service";

const MONTH_SEC = 30 * 24 * 60 * 60;
const YEAR_SEC = 365 * 24 * 60 * 60;

/**
 * 计费应用服务：
 * - 查询当前权益；
 * - RevenueCat REST 主动对账（购买/恢复后调用）；
 * - 沙盒事件模拟（仅本地/非生产，且 BILLING_SANDBOX_ENABLED 开启）。
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly entitlements: EntitlementService,
    private readonly rcApi: RevenueCatApiService,
  ) {}

  /** 当前用户权益 */
  getEntitlement(userId: string): Promise<EntitlementDto> {
    return this.entitlements.getEntitlementDto(userId);
  }

  /**
   * 拉取 RevenueCat 最新 Customer Info 并对账。
   * secret key 未配置时返回 503（App 静默降级为仅本地状态 + webhook）。
   */
  async syncFromRevenueCat(userId: string): Promise<EntitlementDto> {
    if (!this.rcApi.isConfigured()) {
      throw new BusinessException(ErrorCode.Unavailable, 503, "订阅对账暂不可用");
    }

    const subscriber = await this.rcApi.getSubscriber(userId).catch(() => {
      throw new BusinessException(ErrorCode.Unavailable, 502, "订阅服务暂时无法连接");
    });

    const event = this.buildReconcileEvent(userId, subscriber);
    await this.entitlements.applyEvent(event);
    return this.entitlements.getEntitlementDto(userId);
  }

  /** 沙盒模拟：驱动与真实 webhook 完全相同的状态机入口 */
  async simulateSandbox(userId: string, dto: SandboxSimulateDto): Promise<EntitlementDto> {
    if (this.env.NODE_ENV === "production" || !this.env.BILLING_SANDBOX_ENABLED) {
      throw new BusinessException(ErrorCode.NotFound, 404, "接口不存在");
    }

    const event = this.buildSandboxEvent(userId, dto);
    await this.entitlements.applyEvent(event);
    return this.entitlements.getEntitlementDto(userId);
  }

  /**
   * 将 REST subscriber 转换为单个归一化事件：
   * premium 有效（含宽限期）→ RENEWAL（grant）；否则 → EXPIRATION（revoke）。
   * eventId 由交易号+到期时间派生：重复对账幂等，续费后自动产生新事件。
   */
  private buildReconcileEvent(userId: string, subscriber: RestSubscriber): NormalizedBillingEvent {
    const premium = subscriber.entitlements[ENTITLEMENT_ID];
    const sub = premium ? subscriber.subscriptions[premium.product_identifier] : undefined;

    const effectiveExpiry =
      premium?.grace_period_expires_date ?? premium?.expires_date ?? null;
    const isActive = effectiveExpiry !== null && new Date(effectiveExpiry).getTime() > Date.now();

    if (premium && isActive) {
      const txId = String(sub?.store_transaction_id ?? premium.product_identifier);
      return {
        eventId: `rest_${txId}_${effectiveExpiry}`,
        eventType: "RENEWAL",
        appUserId: userId,
        environment: sub?.is_sandbox ? "SANDBOX" : "PRODUCTION",
        store: normalizeRestStore(sub?.store),
        productId: premium.product_identifier,
        periodType: normalizeRestPeriodType(sub?.period_type),
        entitlementIds: [ENTITLEMENT_ID],
        willRenew: !sub?.unsubscribe_detected_at,
        expirationAt: new Date(effectiveExpiry!),
        originalTransactionId: txId,
      };
    }

    return {
      eventId: `rest_exp_${userId}_${effectiveExpiry ?? "none"}`,
      eventType: "EXPIRATION",
      appUserId: userId,
      environment: sub?.is_sandbox ? "SANDBOX" : "PRODUCTION",
      store: normalizeRestStore(sub?.store),
      productId: premium?.product_identifier ?? null,
      periodType: normalizeRestPeriodType(sub?.period_type),
      entitlementIds: [ENTITLEMENT_ID],
      willRenew: false,
      expirationAt: effectiveExpiry ? new Date(effectiveExpiry) : null,
      originalTransactionId: sub?.store_transaction_id ? String(sub.store_transaction_id) : null,
    };
  }

  /** 构造沙盒模拟事件 */
  private buildSandboxEvent(userId: string, dto: SandboxSimulateDto): NormalizedBillingEvent {
    const plan = dto.plan ?? "monthly";
    const productId = SANDBOX_PRODUCTS[plan];
    const ttlSec = dto.expiresInSec ?? (plan === "yearly" ? YEAR_SEC : MONTH_SEC);
    const expirationAt = new Date(Date.now() + ttlSec * 1000);
    const originalTransactionId = `sandbox-tx-${userId}`;

    if (dto.eventType === "EXPIRATION") {
      return {
        eventId: `sandbox_exp_${randomUUID()}`,
        eventType: "EXPIRATION",
        appUserId: userId,
        environment: "SANDBOX",
        store: "app_store",
        productId,
        periodType: "NORMAL",
        entitlementIds: [ENTITLEMENT_ID],
        willRenew: false,
        expirationAt: new Date(),
        originalTransactionId,
      };
    }

    if (dto.eventType === "CANCELLATION") {
      return {
        eventId: `sandbox_cancel_${randomUUID()}`,
        eventType: "CANCELLATION",
        appUserId: userId,
        environment: "SANDBOX",
        store: "app_store",
        productId,
        periodType: "NORMAL",
        entitlementIds: [ENTITLEMENT_ID],
        willRenew: false, // 到期前仍有效
        expirationAt,
        originalTransactionId,
      };
    }

    return {
      eventId: `sandbox_purchase_${randomUUID()}`,
      eventType: "INITIAL_PURCHASE",
      appUserId: userId,
      environment: "SANDBOX",
      store: "app_store",
      productId,
      periodType: "NORMAL",
      entitlementIds: [ENTITLEMENT_ID],
      willRenew: true,
      expirationAt,
      originalTransactionId,
    };
  }
}
