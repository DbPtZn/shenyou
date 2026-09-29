# 订阅付费与内容 Gating 闭环 实施计划

## Repository Research

### 现状
- **数据层**：`User.subscriptionStatus`（free/trial/active/expired/canceled，默认 free）；`Journey.isFree`（false 为付费）。
- **内容 gating 已存在**：[chapters.service.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/content/chapters.service.ts#L66-L80) 在签发播放地址前校验 `subscriptionStatus ∈ {trial, active}`，失败抛 403 + `ErrorCode.SubscriptionRequired (4001)`。错误码 4002（SubscriptionExpired）已在 shared 定义但未使用。
- **播放链路**：App → `GET /chapters/:id/play` 签发 HMAC 签名 CDN URL → `/audio/*` 回源代理验签流式返回。
- **移动端**：详情页 CTA「开始这段旅程」→ `startChapter()`；`mine.tsx` 有会员卡片与 `__DEV__` 订阅切换；无任何支付相关代码。
- **原型**：无独立订阅引导页（仅 Mine 会员卡片），需按 Design Tokens 新设计（不构成冲突，属新增页面）。
- RevenueCat 2026 最新机制：webhook 支持 Authorization 头（dashboard 配置共享密钥）+ HMAC 签名头 `X-RevenueCat-Webhook-Signature: t=<ts>,v1=<hmac>`（HMAC 内容为 `${timestamp}.${rawBody}`）；事件含 `event.id`（幂等键）、`entitlement_ids`、`environment=SANDBOX/PRODUCTION`、`expiration_at_ms`、`period_type`。

### 环境约束（重要）
当前本地 Windows 环境没有 Apple Developer / Google Play / RevenueCat 账号与密钥，且 IAP 必须在真机 development build 上运行，无法在此执行真实沙盒购买。因此沿用本项目既有模式（同管线 MockProvider、dev-subscription 接口）：
- **真实接入代码全部实现**（RevenueCat webhook 验签 + react-native-purchases 真实 provider）；
- 增加**沙盒模拟缝**（dev-only），通过与真实 webhook 相同的内部处理函数驱动 entitlement 状态机，使验收全链路在本地可执行；
- 真实商店沙盒验收的前置条件与步骤会在汇报中列明，待账号就绪后仅需配置 env。

## Files and Modules

### packages/shared
- `src/billing.ts`（新增）：entitlement 常量（`ENTITLEMENT_ID = "premium"`、产品/环境常量）、`entitlementStatusSchema`（active/expired）、`EntitlementDto` zod schema（服务端/移动端共用响应类型）。
- `src/index.ts`：导出 billing。
- 需 `pnpm build`（消费方读 dist）。

### server — 新模块 `src/billing/`
- `billing.constants.ts`：事件类型集合（INITIAL_PURCHASE、RENEWAL、CANCELLATION、UNCANCELLATION、EXPIRATION、PRODUCT_CHANGE、BILLING_ISSUE、REFUND/REVOKE 等）、状态映射表、RC entitlement id。
- `billing.types.ts`：RC webhook 事件 TS 类型（按官方字段，partial 严格类型）。
- `entitlement.service.ts`：核心状态机——幂等处理一个归一化事件（event.id 去重）→ upsert `Entitlement` → 同步 `User.subscriptionStatus`；`hasActiveEntitlement(userId)`（含懒过期：expirationAt 已过则置 expired）。
- `revenuecat.webhook.controller.ts`：`POST /billing/revenuecat/webhook`（公开，无 JWT）。
- `revenuecat.verifier.ts`：Authorization 头校验 + HMAC 签名校验（timingSafeEqual、时间戳容差）。
- `revenuecat.api.service.ts`：RC REST API v1 `GET /subscribers/:appUserId`（用 secret key，可选配置；未配置则跳过），用于购买后主动对账。
- `billing.controller.ts`：`GET /billing/entitlement`（JWT，查当前权益）、`POST /billing/revenuecat/sync`（JWT，拉 RC REST 对账）、`POST /billing/sandbox/simulate`（JWT + 非 production，模拟购买/过期事件）。
- `billing.dto.ts`：zod/class DTO。
- `billing.module.ts`。

### server — 改动
- `prisma/schema.prisma`：
  - 新增 `Entitlement` 模型：`userId @unique`、status、environment、store、productId、periodType、willRenew、expirationAt、originalTransactionId、latestEventId、时间戳；
  - 新增 `BillingEventLog` 模型：`eventId @unique`（幂等）、eventType、environment、payload Json、processed、时间戳；
  - User 增加 relation。
  - 新迁移。
- `config/env.ts` + `.env.example`：`REVENUECAT_WEBHOOK_AUTH`（可选）、`REVENUECAT_WEBHOOK_SIGNING_SECRET`（可选）、`REVENUECAT_SECRET_KEY`（可选）、`REVENUECAT_API_BASE_URL`（默认 https://api.revenuecat.com）、`BILLING_SANDBOX_ENABLED`（default true，生产校验拦截）。
- `main.ts`：`NestFactory.create(..., { rawBody: true })`（HMAC 需原始 body）。
- `app.module.ts`：注册 BillingModule。
- `content/chapters.service.ts`：内联订阅校验替换为 `entitlementService.hasActiveEntitlement()`；从未订阅→4001，曾订阅已过期→4002。
- `content/content.module.ts`：import BillingModule（或仅注册 EntitlementService 为 exports）。

### apps/mobile
- 新依赖：**`react-native-purchases@10.10.2`（MIT，RevenueCat 官方；含 Expo config plugin）** —— 宪法 §9.3 报备，待批准后安装。
- `src/purchases/purchases.types.ts`：`PurchasesService` 接口（configure/login/logout/purchase/restore/getEntitlement/addListener）与 DTO。
- `src/purchases/providers/revenuecat.purchases.ts`：真实 provider（Purchases.configure 平台选 key、logIn(user.id)、purchase offering、restorePurchases、CustomerInfo 监听 → 触发服务端 sync + 失效查询）。
- `src/purchases/providers/mock.purchases.ts`：本地 provider（purchase → `/billing/sandbox/simulate` INITIAL_PURCHASE；restore → `/billing/entitlement` 查询，无记录则提示「没有找到可恢复的购买」）。
- `src/purchases/purchases.factory.ts`：按 `EXPO_PUBLIC_BILLING_PROVIDER`（revenuecat/mock，默认 mock）选择。
- `src/api/billing.ts`：`getEntitlement()`、`syncRevenueCat()`、`sandboxSimulate()`。
- `app/paywall.tsx`（新增路由）：订阅引导页（见下）。
- `app/_layout.tsx`：注册 paywall 路由（modal）；登录态变化时 configure + login/logout。
- `app/journey/[id].tsx`：付费且无权益时 CTA 文案「订阅后开启这段旅程」→ 打开 paywall（携带 journeyId，购买成功返回后继续）。
- `src/audio/player.service.ts`：`getPlayUrl` 401/402 错误码不弹通用 Alert，交由调用方跳 paywall。
- `app/(tabs)/mine.tsx`：会员卡片增加入口（已会员显示权益/到期时间；未会员「了解会员」→ paywall）。
- `.env(.example)`：`EXPO_PUBLIC_BILLING_PROVIDER`、`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`、`EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`。

### 订阅引导页设计（平静、不施压，App Store 3.1.2 合规）
- 标题：「让更多旅程，陪你慢慢入梦」；权益清单（全部沉浸旅程畅听、default/relax 两种混音、新旅程优先收听、随时取消）；
- 方案卡：月度 / 年度（含试用说明），展示**价格与周期**，选中态用金色细边；无倒计时、无折扣逼迫；
- 底部：隐私政策 / 用户协议（含自动续费说明）链接；「恢复购买」文字按钮（审核硬要求）；右上角关闭。

## Implementation Steps
1. shared：billing 常量与 schema → build。
2. Prisma：Entitlement / BillingEventLog 模型 → 迁移。
3. server env + .env.example + main.ts rawBody。
4. EntitlementService 状态机 + BillingEventLog 落库（幂等）。
5. webhook verifier + webhook controller（raw body → 验签 → 幂等处理 → 快速 200）。
6. RC REST API service + 应用端 entitlement/sync 接口 + sandbox simulate 接口。
7. chapters.service gating 接入 EntitlementService（4001/4002）。
8. mobile 安装 react-native-purchases；purchases 接口 + 两个 provider + factory。
9. mobile billing API + paywall 页 + 路由/登录态接线。
10. 详情页 CTA / player 错误链路接线；mine 页入口。
11. 全量 typecheck + lint；端到端验收（见下）。

## Dependencies and Considerations
- `react-native-purchases@10.10.2`（MIT）：原生模块，仅在 development build 真机可用；Expo Go 下走 mock provider。
- webhook 两个密钥均设为**可选**：未配置的校验项自动跳过（本地开发），生产环境部署文档要求至少启用 HMAC。
- CANCELLATION 语义：取消自动续费但到期前仍有权益（willRenew=false，状态保持 active/trial），EXPIRATION 才收回——与 RC 官方建议一致。
- BILLING_ISSUE：宽限期内保留权益，仅记录日志。
- 幂等：BillingEventLog.eventId 唯一约束 + 捕获唯一冲突返回 200；重复 webhook 不重复发放。
- 身份映射：`app_user_id` 必须等于本系统 User.id（登录后 Purchases.logIn）；未知用户记日志但仍返回 200（RC 不再重试）。

## Validation
本地端到端（mock 缝，HTTP 脚本驱动，等同真实 webhook 处理路径）：
1. 新注册用户（free）；确认一条付费旅程（isFree=false）。
2. 请求 play → **403 / 4001**。
3. 模拟购买（INITIAL_PURCHASE）→ entitlement active；请求 play → 签名 URL，GET 音频 **200 可播**。
4. 模拟恢复：重复 INITIAL_PURCHASE（幂等不重复入账）+ restore 查询 → 仍 active。
5. 模拟 EXPIRATION → play → **403 / 4002**。
6. webhook 验签：正确 HMAC 事件处理成功；错误签名 → 401；重放 event.id → 幂等。
7. 沙盒事件在 BillingEventLog 全量可查（payload 完整）。
8. `pnpm -r typecheck` + server/mobile lint 全绿。

## Risks
- **无法本地真实购买**：以 mock provider + 真实内部状态机覆盖验收；真实沙盒（Apple/Google tester + EAS dev build）列为待外部条件就绪的验收项，汇报中给出操作清单。
- **BullMQ worker 不涉及**：entitlement 由 webhook 同步驱动，无需队列；REST 对账失败不影响 gating（lazy expiry 兜底）。
- **旧 dev-subscription 接口保留**：避免无关改动；生产环境本身已 404。
