import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ErrorCode } from "@shenyou/shared";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";

/** 探针接口：部署探活用，不参与限流 */
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** 存活探针：进程活着即 200 */
  @Get("health")
  health() {
    return { status: "ok" };
  }

  /** 就绪探针：数据库可达才 200，否则 503 */
  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", database: "up" };
    } catch {
      throw new BusinessException(ErrorCode.Unavailable, 503, "服务暂未就绪，请稍后再试");
    }
  }
}
