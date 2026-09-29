import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

/** 沙盒模拟事件类型（仅开放验收需要的三种） */
export const SANDBOX_SIMULATABLE = ["INITIAL_PURCHASE", "CANCELLATION", "EXPIRATION"] as const;
export type SandboxSimulatableEvent = (typeof SANDBOX_SIMULATABLE)[number];

/** 沙盒模拟产品 */
export const SANDBOX_PLANS = ["monthly", "yearly"] as const;
export type SandboxPlan = (typeof SANDBOX_PLANS)[number];

export class SandboxSimulateDto {
  @IsIn(SANDBOX_SIMULATABLE, { message: "不支持的模拟事件类型" })
  eventType!: SandboxSimulatableEvent;

  @IsOptional()
  @IsIn(SANDBOX_PLANS, { message: "无效的订阅方案" })
  plan?: SandboxPlan;

  /** 订阅有效期（秒），默认 30 天；短时长可直接观察到期懒过期 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31_536_000)
  expiresInSec?: number;
}
