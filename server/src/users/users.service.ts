import { Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type SubscriptionStatus,
  subscriptionStatusSchema,
} from "@shenyou/shared";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 当前用户资料：绝不返回 passwordHash */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(ErrorCode.NotFound, 404, "用户不存在");
    }
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      nickname: user.nickname,
      subscriptionStatus: user.subscriptionStatus as SubscriptionStatus,
      createdAt: user.createdAt,
    };
  }

  /** 开发态专用：直接切换当前用户订阅状态（生产环境一律 404） */
  async updateDevSubscription(userId: string, status: string) {
    if (process.env.NODE_ENV === "production") {
      throw new BusinessException(ErrorCode.NotFound, 404, "接口不存在");
    }
    const parsed = subscriptionStatusSchema.safeParse(status);
    if (!parsed.success) {
      throw new BusinessException(ErrorCode.ValidationFailed, 400, "无效的订阅状态");
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: parsed.data },
    });
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      nickname: user.nickname,
      subscriptionStatus: user.subscriptionStatus as SubscriptionStatus,
      createdAt: user.createdAt,
    };
  }
}
