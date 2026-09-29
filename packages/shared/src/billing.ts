import { z } from "zod";

/**
 * 订阅计费域常量与 schema（服务端 webhook/状态机与移动端共享）。
 * 对应 RevenueCat：以 entitlement 为中心，产品 → entitlement 的映射在 RC dashboard 配置。
 */

/** RevenueCat 中的权益标识：神游会员（RC dashboard entitlement id） */
export const ENTITLEMENT_ID = "premium";

/** 商店标识（RevenueCat event.store） */
export const billingStoreSchema = z.enum(["app_store", "play_store", "stripe", "unknown"]);
export type BillingStore = z.infer<typeof billingStoreSchema>;

/** 购买环境（RevenueCat event.environment） */
export const billingEnvironmentSchema = z.enum(["SANDBOX", "PRODUCTION"]);
export type BillingEnvironment = z.infer<typeof billingEnvironmentSchema>;

/** 周期类型（RevenueCat event.period_type） */
export const billingPeriodTypeSchema = z.enum([
  "NORMAL",
  "TRIAL",
  "INTRO",
  "PROMOTIONAL",
]);
export type BillingPeriodType = z.infer<typeof billingPeriodTypeSchema>;

/**
 * 权益对外状态：仅区分 active / expired。
 * 细分订阅形态（试用/正式）由 User.subscriptionStatus 表达。
 */
export const entitlementStatusSchema = z.enum(["active", "expired"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

/**
 * 当前用户权益 DTO（GET /billing/entitlement 响应）。
 * 移动端据此决定是否展示订阅引导与是否可播放付费内容。
 */
export const entitlementDtoSchema = z.object({
  /** 是否当前有效（active 且未到 expirationAt） */
  isActive: z.boolean(),
  status: entitlementStatusSchema,
  /** 用户级订阅状态：free/trial/active/expired/canceled */
  subscriptionStatus: z.string(),
  environment: billingEnvironmentSchema.nullable(),
  store: billingStoreSchema.nullable(),
  productId: z.string().nullable(),
  periodType: billingPeriodTypeSchema.nullable(),
  /** 是否仍会续费（取消自动续费时为 false，到期前仍有效） */
  willRenew: z.boolean(),
  expirationAt: z.string().nullable(),
});
export type EntitlementDto = z.infer<typeof entitlementDtoSchema>;
