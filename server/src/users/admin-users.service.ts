import { Injectable, Logger } from "@nestjs/common";
import { ErrorCode, type SubscriptionStatus, type UserRole } from "@shenyou/shared";
import type { Prisma } from "@prisma/client";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import type { AdminAuditLogQueryDto, AdminUserQueryDto } from "./dto/admin-users.dto";

/**
 * 管理端用户列表显式取字段：绝不包含 passwordHash 与任何 token 字段。
 * 权益摘要透传 status/environment/expirationAt，无记录时为 null。
 */
const adminUserSelect = {
  id: true,
  phone: true,
  email: true,
  nickname: true,
  role: true,
  subscriptionStatus: true,
  createdAt: true,
  entitlement: {
    select: { status: true, environment: true, expirationAt: true },
  },
} satisfies Prisma.UserSelect;

/** 管理端用户管理：列表查询、角色与订阅状态维护（变更写结构化审计日志） */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 用户列表：分页 + keyword（手机号/邮箱/昵称模糊）+ role/subscriptionStatus 筛选 */
  async listUsers(query: AdminUserQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {
      ...(query.keyword
        ? {
            OR: [
              { phone: { contains: query.keyword, mode: "insensitive" } },
              { email: { contains: query.keyword, mode: "insensitive" } },
              { nickname: { contains: query.keyword, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.subscriptionStatus ? { subscriptionStatus: query.subscriptionStatus } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: adminUserSelect,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  /** 修改用户角色；禁止修改自己（防误操作把自己降级）；审计日志与变更同事务落库 */
  async updateRole(adminUserId: string, targetUserId: string, role: UserRole) {
    if (adminUserId === targetUserId) {
      throw new BusinessException(
        ErrorCode.SelfRoleChangeForbidden,
        403,
        "不能修改自己的角色",
      );
    }
    const target = await this.mustGetUser(targetUserId);
    const adminAccount = await this.getAccountLabel(adminUserId);
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { role },
        select: adminUserSelect,
      }),
      this.prisma.adminAuditLog.create({
        data: {
          adminUserId,
          adminAccount,
          targetUserId,
          targetAccount: accountLabel(target),
          field: "role",
          before: target.role,
          after: role,
        },
      }),
    ]);
    this.logger.log(
      { adminUserId, targetUserId, field: "role", before: target.role, after: role },
      "管理员变更用户角色",
    );
    return updated;
  }

  /** 修改用户订阅状态；审计日志与变更同事务落库 */
  async updateSubscription(
    adminUserId: string,
    targetUserId: string,
    status: SubscriptionStatus,
  ) {
    const target = await this.mustGetUser(targetUserId);
    const adminAccount = await this.getAccountLabel(adminUserId);
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { subscriptionStatus: status },
        select: adminUserSelect,
      }),
      this.prisma.adminAuditLog.create({
        data: {
          adminUserId,
          adminAccount,
          targetUserId,
          targetAccount: accountLabel(target),
          field: "subscriptionStatus",
          before: target.subscriptionStatus,
          after: status,
        },
      }),
    ]);
    this.logger.log(
      {
        adminUserId,
        targetUserId,
        field: "subscriptionStatus",
        before: target.subscriptionStatus,
        after: status,
      },
      "管理员变更用户订阅状态",
    );
    return updated;
  }

  /** 审计日志列表：分页 + field 筛选 + keyword（操作人/目标账号快照模糊） */
  async listAuditLogs(query: AdminAuditLogQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.field ? { field: query.field } : {}),
      ...(query.keyword
        ? {
            OR: [
              { adminAccount: { contains: query.keyword, mode: "insensitive" } },
              { targetAccount: { contains: query.keyword, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  private async mustGetUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        subscriptionStatus: true,
        phone: true,
        email: true,
        nickname: true,
      },
    });
    if (!user) {
      throw new BusinessException(ErrorCode.NotFound, 404, "用户不存在");
    }
    return user;
  }

  /** 操作管理员账号快照；账号行缺失时回退「未知账号」（审计不阻断主流程） */
  private async getAccountLabel(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, email: true, nickname: true },
    });
    return user ? accountLabel(user) : "未知账号";
  }
}

/** 账号快照口径：手机号优先，其次邮箱、昵称 */
function accountLabel(user: {
  phone: string | null;
  email: string | null;
  nickname: string | null;
}): string {
  return user.phone ?? user.email ?? user.nickname ?? "未知账号";
}
