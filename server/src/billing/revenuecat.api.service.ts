import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type BillingPeriodType,
  type BillingStore,
} from "@shenyou/shared";
import { ENV, type Env } from "../config/env";

/**
 * RevenueCat REST API v1 客户端（仅服务端持有 secret key）。
 * 用途：购买/恢复后主动对账（GET /v1/subscribers/:appUserId），
 * 与 webhook 互补——即使 webhook 延迟，App 也能即时拿到正确权益。
 */

/** v1 entitlement 对象（仅声明消费字段） */
interface RestEntitlement {
  expires_date: string | null;
  grace_period_expires_date: string | null;
  product_identifier: string;
  purchase_date: string;
}

/** v1 subscription 对象（仅声明消费字段） */
interface RestSubscription {
  expires_date: string | null;
  is_sandbox?: boolean;
  period_type?: string;
  store?: string;
  store_transaction_id?: string | number;
  unsubscribe_detected_at?: string | null;
}

export interface RestSubscriber {
  entitlements: Record<string, RestEntitlement>;
  subscriptions: Record<string, RestSubscription>;
}

@Injectable()
export class RevenueCatApiService {
  private readonly logger = new Logger(RevenueCatApiService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** 是否已配置 secret key（控制器据此决定 200 还是 503） */
  isConfigured(): boolean {
    return this.env.REVENUECAT_SECRET_KEY !== undefined;
  }

  /** GET /v1/subscribers/:appUserId */
  async getSubscriber(appUserId: string): Promise<RestSubscriber> {
    if (!this.env.REVENUECAT_SECRET_KEY) {
      throw new Error("REVENUECAT_SECRET_KEY 未配置");
    }

    const base = this.env.REVENUECAT_API_BASE_URL.replace(/\/+$/, "");
    const url = `${base}/v1/subscribers/${encodeURIComponent(appUserId)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.env.REVENUECAT_SECRET_KEY}`,
      },
    });

    if (!res.ok) {
      this.logger.warn(`RevenueCat getSubscriber 失败：HTTP ${res.status}`);
      throw new Error(`RevenueCat API 返回 ${res.status}`);
    }

    const body = (await res.json()) as { subscriber?: RestSubscriber };
    if (!body.subscriber) {
      throw new Error("RevenueCat 响应缺少 subscriber");
    }
    return body.subscriber;
  }
}

/** v1 store 字符串 → 内部 BillingStore */
export function normalizeRestStore(store: string | undefined): BillingStore {
  switch (store) {
    case "app_store":
    case "mac_app_store":
      return "app_store";
    case "play_store":
      return "play_store";
    case "stripe":
      return "stripe";
    default:
      return "unknown";
  }
}

/** v1 period_type（小写）→ 内部大写枚举 */
export function normalizeRestPeriodType(period: string | undefined): BillingPeriodType | null {
  switch (period) {
    case "normal":
      return "NORMAL";
    case "trial":
      return "TRIAL";
    case "intro":
      return "INTRO";
    case "promotional":
      return "PROMOTIONAL";
    default:
      return null;
  }
}
