import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminGuard } from "../content/admin.guard";
import { AdminStatsController } from "./admin-stats.controller";
import { AdminStatsService } from "./admin-stats.service";

/** 数据看板统计域：大表聚合 + Redis 结果缓存 */
@Module({
  // JwtAuthGuard 依赖 JwtService（与 UsersModule 同模式）；AdminGuard 依赖全局 PrismaService
  imports: [JwtModule.register({})],
  controllers: [AdminStatsController],
  providers: [AdminStatsService, AdminGuard],
})
export class StatsModule {}
