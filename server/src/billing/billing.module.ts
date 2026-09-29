import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { EntitlementService } from "./entitlement.service";
import { RevenueCatApiService } from "./revenuecat.api.service";
import { RevenueCatVerifier } from "./revenuecat.verifier";
import { RevenueCatWebhookController } from "./revenuecat.webhook.controller";

/**
 * 订阅计费域：RevenueCat webhook 接收、权益状态机、REST 对账、沙盒模拟。
 * EntitlementService 导出供内容域 gating 使用。
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [BillingController, RevenueCatWebhookController],
  providers: [
    BillingService,
    EntitlementService,
    RevenueCatApiService,
    RevenueCatVerifier,
  ],
  exports: [EntitlementService],
})
export class BillingModule {}
