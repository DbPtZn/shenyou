import { Injectable, Logger } from "@nestjs/common";
import {
  type EntitlementDto,
  type SubscriptionStatus,
} from "@shenyou/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  EVENT_ACTION,
  PREMIUM_ENTITLEMENT,
  type EntitlementAction,
} from "./billing.constants";
import type {
  ApplyEventResult,
  NormalizedBillingEvent,
} from "./billing.types";

/**
 * 权益状态机：服务端订阅事实来源。
 * - applyEvent：幂等处理归一化事件（webhook / 沙盒模拟同入口）；
 * - hasActiveEntitlement：内容签发前的统一校验（含懒过期）；
 * - getEntitlementDto：App 端查询当前权益。
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 幂等处理一个计费事件 */
  async applyEvent(event: NormalizedBillingEvent): Promise<ApplyEventResult> {
    // 1. 事件留痕（eventId 唯一约束保证幂等）
    try {
      await this.prisma.billingEventLog.create({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          environment: event.environment,
          payload: toJsonValue(event),
          processed: true,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.debug(`事件 ${event.eventId} 已处理，跳过（幂等）`);
        const current = await this.prisma.user.findUnique({
          where: { id: event.appUserId },
          select: { subscriptionStatus: true },
        });
        return { duplicated: true, subscriptionStatus: current?.subscriptionStatus ?? "free" };
      }
      throw error;
    }

    // 沙盒事件全量留日志（结构化；落库已在上一步完成）
    if (event.environment === "SANDBOX") {
      this.logger.log({ billingEvent: event }, `沙盒计费事件：${event.eventType}`);
    } else {
      this.logger.log(
        { eventId: event.eventId, type: event.eventType, userId: event.appUserId },
        `生产计费事件：${event.eventType}`,
      );
    }

    // 2. 用户必须存在；未知用户仅记录（RC 端仍返回 200，避免无意义重试）
    const user = await this.prisma.user.findUnique({
      where: { id: event.appUserId },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(`事件 ${event.eventId} 对应用户不存在：${event.appUserId}`);
      return { duplicated: false, subscriptionStatus: "free" };
    }

    // 3. 驱动状态机
    const action: EntitlementAction = EVENT_ACTION[event.eventType] ?? "ignore";
    const touchesPremium = event.entitlementIds.includes(PREMIUM_ENTITLEMENT);

    // revoke/grant/canceled 均只在涉及 premium 权益时改变状态
    if (action === "ignore" || !touchesPremium) {
      const current = await this.prisma.user.findUnique({
        where: { id: event.appUserId },
        select: { subscriptionStatus: true },
      });
      return { duplicated: false, subscriptionStatus: current?.subscriptionStatus ?? "free" };
    }

    const nextStatus = await this.runAction(event, action);
    return { duplicated: false, subscriptionStatus: nextStatus };
  }

  /** 执行状态机动作，返回用户新订阅状态 */
  private async runAction(
    event: NormalizedBillingEvent,
    action: EntitlementAction,
  ): Promise<SubscriptionStatus> {
    if (action === "revoke") {
      const updateData: Prisma.EntitlementUncheckedUpdateInput = {
        status: "expired",
        willRenew: false,
        latestEventId: event.eventId,
      };
      if (event.expirationAt) updateData.expirationAt = event.expirationAt;

      await this.prisma.$transaction([
        this.prisma.entitlement.upsert({
          where: { userId: event.appUserId },
          create: {
            userId: event.appUserId,
            status: "expired",
            environment: event.environment,
            store: event.store,
            productId: event.productId,
            periodType: event.periodType,
            willRenew: false,
            expirationAt: event.expirationAt,
            originalTransactionId: event.originalTransactionId,
            latestEventId: event.eventId,
          },
          update: updateData,
        }),
        this.prisma.user.update({
          where: { id: event.appUserId },
          data: { subscriptionStatus: "expired" },
        }),
      ]);
      return "expired";
    }

    // grant / keep-canceled
    const grantedStatus: SubscriptionStatus =
      action === "grant" && event.periodType === "TRIAL" ? "trial" : "active";

    // 到期时间已过（如延迟送达的旧事件）：直接收敛为 expired
    const expiredAlready = event.expirationAt !== null && event.expirationAt.getTime() <= Date.now();
    const entitlementStatus = expiredAlready ? "expired" : "active";
    const finalUserStatus: SubscriptionStatus = expiredAlready ? "expired" : grantedStatus;

    // 条件式构建 update（exactOptionalPropertyTypes：不写字段而非写 undefined）
    const updateData: Prisma.EntitlementUncheckedUpdateInput = {
      environment: event.environment,
      store: event.store,
      willRenew: event.willRenew,
      latestEventId: event.eventId,
    };
    // keep-canceled 时保留原状态（active/trial），仅更新 willRenew 与事件信息
    if (action !== "keep-canceled") updateData.status = entitlementStatus;
    if (event.productId) updateData.productId = event.productId;
    if (event.periodType) updateData.periodType = event.periodType;
    if (event.expirationAt) updateData.expirationAt = event.expirationAt;
    if (event.originalTransactionId) updateData.originalTransactionId = event.originalTransactionId;

    const userUpdate: Prisma.UserUncheckedUpdateInput = {};
    // keep-canceled 且未过期：不改变用户状态（保持 active/trial，继续可播放）
    if (!(action === "keep-canceled" && !expiredAlready)) {
      userUpdate.subscriptionStatus = finalUserStatus;
    }

    await this.prisma.$transaction([
      this.prisma.entitlement.upsert({
        where: { userId: event.appUserId },
        create: {
          userId: event.appUserId,
          status: entitlementStatus,
          environment: event.environment,
          store: event.store,
          productId: event.productId,
          periodType: event.periodType,
          willRenew: event.willRenew,
          expirationAt: event.expirationAt,
          originalTransactionId: event.originalTransactionId,
          latestEventId: event.eventId,
        },
        update: updateData,
      }),
      this.prisma.user.update({
        where: { id: event.appUserId },
        data: userUpdate,
      }),
    ]);

    if (action === "keep-canceled" && !expiredAlready) {
      const current = await this.prisma.user.findUnique({
        where: { id: event.appUserId },
        select: { subscriptionStatus: true },
      });
      return (current?.subscriptionStatus ?? finalUserStatus) as SubscriptionStatus;
    }
    return finalUserStatus;
  }

  /**
   * 当前用户是否有有效权益（内容 gating 统一入口）。
   * - 无记录：从未订阅；
   * - active/trial 但到期时间已过：懒过期落库；
   */
  async hasActiveEntitlement(userId: string): Promise<{ isActive: boolean; everSubscribed: boolean }> {
    const ent = await this.prisma.entitlement.findUnique({
      where: { userId },
      select: { status: true, expirationAt: true },
    });
    if (!ent) return { isActive: false, everSubscribed: false };

    const wasActive = ent.status === "active";
    if (!wasActive) return { isActive: false, everSubscribed: true };

    if (ent.expirationAt && ent.expirationAt.getTime() <= Date.now()) {
      await this.lazyExpire(userId, ent.expirationAt);
      return { isActive: false, everSubscribed: true };
    }
    return { isActive: true, everSubscribed: true };
  }

  /** 当前用户权益 DTO（App 端展示与判断） */
  async getEntitlementDto(userId: string): Promise<EntitlementDto> {
    const [user, ent] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionStatus: true },
      }),
      this.prisma.entitlement.findUnique({ where: { userId } }),
    ]);

    if (!ent) {
      return {
        isActive: false,
        status: "expired",
        subscriptionStatus: user?.subscriptionStatus ?? "free",
        environment: null,
        store: null,
        productId: null,
        periodType: null,
        willRenew: false,
        expirationAt: null,
      };
    }

    // 懒过期
    let status = ent.status;
    let isActive = ent.status === "active";
    if (isActive && ent.expirationAt && ent.expirationAt.getTime() <= Date.now()) {
      await this.lazyExpire(userId, ent.expirationAt);
      status = "expired";
      isActive = false;
    }

    return {
      isActive,
      status: status === "active" ? "active" : "expired",
      subscriptionStatus: isActive ? user?.subscriptionStatus ?? "free" : "expired",
      environment: (ent.environment as EntitlementDto["environment"]) ?? null,
      store: (ent.store as EntitlementDto["store"]) ?? null,
      productId: ent.productId,
      periodType: (ent.periodType as EntitlementDto["periodType"]) ?? null,
      willRenew: ent.willRenew,
      expirationAt: ent.expirationAt ? ent.expirationAt.toISOString() : null,
    };
  }

  /** 懒过期：权益行与用户状态同时置 expired */
  private async lazyExpire(userId: string, expirationAt: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.entitlement.update({
        where: { userId },
        data: { status: "expired", willRenew: false },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { subscriptionStatus: "expired" },
      }),
    ]);
    this.logger.log(`用户 ${userId} 权益已于 ${expirationAt.toISOString()} 到期，懒过期`);
  }
}

/** Prisma 唯一约束冲突判定 */
function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** 归一化事件 → 纯 JSON（Date 转 ISO 字符串），供 BillingEventLog.payload 落库 */
function toJsonValue(event: NormalizedBillingEvent): Prisma.InputJsonValue {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    appUserId: event.appUserId,
    environment: event.environment,
    store: event.store,
    productId: event.productId,
    periodType: event.periodType,
    entitlementIds: event.entitlementIds,
    willRenew: event.willRenew,
    expirationAt: event.expirationAt ? event.expirationAt.toISOString() : null,
    originalTransactionId: event.originalTransactionId,
  };
}
