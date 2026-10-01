import {
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
  adminAuditFieldSchema,
  type AdminAuditField,
  type SubscriptionStatus,
  type UserRole,
} from "@shenyou/shared";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** 管理端：用户列表查询参数 */
export class AdminUserQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page 必须是整数" })
  @Min(1, { message: "page 从 1 开始" })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize 必须是整数" })
  @Min(1, { message: "pageSize 至少为 1" })
  @Max(100, { message: "pageSize 最大为 100" })
  pageSize?: number = 20;

  /** 手机号/邮箱/昵称模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: "关键词最长 80 个字符" })
  keyword?: string;

  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[], { message: "角色取值不合法" })
  role?: UserRole;

  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES as unknown as string[], { message: "订阅状态不合法" })
  subscriptionStatus?: SubscriptionStatus;
}

/** 管理端：修改用户角色（仅 user/admin 两个取值） */
export class UpdateUserRoleDto {
  @IsIn(USER_ROLES as unknown as string[], { message: "角色仅允许 user/admin" })
  role!: UserRole;
}

/** 管理端：修改用户订阅状态 */
export class UpdateUserSubscriptionDto {
  @IsIn(SUBSCRIPTION_STATUSES as unknown as string[], { message: "订阅状态不合法" })
  status!: SubscriptionStatus;
}

/** 管理端：审计日志查询参数 */
export class AdminAuditLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page 必须是整数" })
  @Min(1, { message: "page 从 1 开始" })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize 必须是整数" })
  @Min(1, { message: "pageSize 至少为 1" })
  @Max(100, { message: "pageSize 最大为 100" })
  pageSize?: number = 20;

  /** 变更字段筛选：role / subscriptionStatus */
  @IsOptional()
  @IsIn(adminAuditFieldSchema.options as unknown as string[], { message: "变更字段不合法" })
  field?: AdminAuditField;

  /** 操作人/目标账号快照模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: "关键词最长 80 个字符" })
  keyword?: string;
}
