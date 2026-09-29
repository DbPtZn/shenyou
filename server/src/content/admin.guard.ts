import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/jwt-auth.guard";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";

/**
 * 管理端角色校验：须与 JwtAuthGuard 串联使用（@UseGuards(JwtAuthGuard, AdminGuard)）。
 * MVP 阶段角色通过数据库直接提升（user.role = 'admin'）。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new BusinessException(ErrorCode.Unauthorized, 401, "请先登录");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== "admin") {
      throw new BusinessException(ErrorCode.Forbidden, 403, "没有权限执行此操作");
    }
    return true;
  }
}
