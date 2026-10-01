import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../content/admin.guard";
import { AdminStatsService } from "./admin-stats.service";

/**
 * 管理端数据看板统计接口（播放量/完播率/订阅转化/热门场景）。
 * 聚合结果由 Redis 缓存 5 分钟；?refresh=1 强制重算。
 */
@Controller("admin/stats")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminStatsController {
  constructor(private readonly statsService: AdminStatsService) {}

  /** GET /admin/stats/overview —— 看板总览（播放/订阅/热门场景），支持 ?refresh=1 绕过缓存 */
  @Get("overview")
  getOverview(@Query("refresh") refresh?: string) {
    const forceRefresh = refresh === "1" || refresh === "true";
    return this.statsService.getOverview(forceRefresh);
  }
}
