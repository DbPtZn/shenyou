import { IsIn } from "class-validator";
import { SUBSCRIPTION_STATUSES } from "@shenyou/shared";

export class DevSubscriptionDto {
  @IsIn(SUBSCRIPTION_STATUSES, { message: "无效的订阅状态" })
  status!: (typeof SUBSCRIPTION_STATUSES)[number];
}
