import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { BillingService } from "./billing.service";
import { SandboxSimulateDto } from "./billing.dto";

/**
 * 计费应用端接口（JWT）：权益查询、RevenueCat 对账、沙盒模拟。
 * 请求处理器只做投递/查询，无任何长任务（CLAUDE.md §5）。
 */
@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /** 当前用户权益（App 启动/进详情页时查询） */
  @Get("entitlement")
  getEntitlement(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getEntitlement(user.userId);
  }

  /** 购买/恢复后主动拉 RevenueCat 对账 */
  @Post("revenuecat/sync")
  syncFromRevenueCat(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.syncFromRevenueCat(user.userId);
  }

  /** 沙盒模拟（生产环境 404） */
  @Post("sandbox/simulate")
  simulateSandbox(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SandboxSimulateDto,
  ) {
    return this.billingService.simulateSandbox(user.userId, dto);
  }
}
