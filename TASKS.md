# TASKS · 神游 App 阶段进度与遗留问题

> 本文件由 AI 维护：记录各阶段完成情况、关键决策与遗留问题（见 CLAUDE.md §9）。

## 阶段 1：Monorepo 脚手架 —— ✅ 已完成（2026-09-28）

完成内容：

- `pnpm-workspace.yaml`：覆盖 `apps/*`、`server`、`packages/*`。
- `tsconfig.base.json`：TypeScript 5.x strict（含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax` 等），各子项目 `extends`。
- `packages/shared`（`@shenyou/shared`）：
  - `api-response.ts`：`apiResponseSchema(dataSchema)` 工厂 + `ApiResponse<T>`（`z.infer` 推导）；
  - `enums.ts`：`contentStatusSchema`（draft/reviewing/published/offline）、`subscriptionStatusSchema`（free/trial/active/expired/canceled），类型均由 schema 推导；
  - `error-codes.ts`：分段错误码常量（0 成功 / 1xxx 通用 / 2xxx 认证 / 3xxx 内容 / 4xxx 订阅）；
  - `tsc` 构建为 CJS + d.ts（`dist/`），供 server（NestJS CJS）与 apps（Metro/Vite）引用。
- 根目录 ESLint 9 flat config（`eslint.config.js`）+ Prettier：统一 ts/js/vue 规则，`eslint-config-prettier` 收尾关冲突。
- 根脚本：`pnpm typecheck` / `pnpm lint`（即 `pnpm -r run typecheck/lint`），另有 `build`、`format`、`format:check`。
- `.gitignore`（忽略真实 `.env`，保留 `.env.example`）+ 各子目录 `.env.example` 占位值。
- `apps/mobile`、`apps/admin`、`server` 仅占位（package.json + tsconfig + src 空模块），无业务代码。

关键决策：

- shared 包输出 CJS（NestJS 默认 CJS，Metro/Vite 均可消费），因此该包 tsconfig 关闭 `verbatimModuleSyntax`（与 CJS 输出冲突），其余严格项不变。
- 未引入 turborepo/nx/husky；未创建业务代码。

验证结果（2026-09-28）：

- `pnpm install`：5 个 workspace 项目解析成功。
- `pnpm -r typecheck`：4 个包全绿。
- `pnpm -r lint`：4 个包全绿。
- `pnpm -r build`：shared 构建成功；`node require` 冒烟测试通过（schema parse / 枚举 / 错误码均正常）。
- `pnpm format:check`：通过。

## 阶段 2：server NestJS 骨架与基础设施 —— ✅ 已完成（2026-09-28）

完成内容：

- 模块划分：`ConfigModule`（zod 校验全部环境变量，缺失/非法启动即 fast-fail）、全局 `PrismaModule`、`AuthModule`、`UsersModule`、`HealthModule`。
- 认证：手机号/邮箱（单 `account` 字段自动识别）+ 密码注册登录，argon2 哈希；JWT access 15 分钟 / refresh 30 天（仅存 SHA-256 哈希、一次一换、重放旧 token 触发全会话吊销、logout 吊销全部）；登录限流 5 次/分钟（注册 10、refresh 20）。
- 全局：`ValidationPipe`（whitelist + forbidNonWhitelisted）、`GlobalExceptionFilter`（统一 `{ code, message, requestId }`，5xx 不暴露细节）、`TransformInterceptor`（成功响应统一 `{ code, message, requestId, data }`，对齐 shared 的 `apiResponseSchema`）、nestjs-pino 结构化日志（requestId 贯穿 + 回写响应头，redact authorization/cookie）、helmet、CORS env 白名单。
- `main.ts`：全局管道/过滤器/拦截器、pino logger、优雅停机（enableShutdownHooks）；`/health`（存活）与 `/ready`（检查数据库，失败 503）。
- Prisma 初始 migration `20260927200054_init`：`User`（phone/email 唯一可空）、`RefreshToken`（tokenHash 唯一、userId 索引、级联删除）。
- 本地开发 PostgreSQL：Docker 容器 `shenyou-postgres`（postgres:16-alpine，端口 5432，账号/密码/库均为 shenyou）。

关键决策：

- 未用 @nestjs/config/passport：ConfigModule 手写 zod 校验 + `ENV` token 注入；JWT guard 直接用 @nestjs/jwt 实现，依赖更薄。
- `@nestjs/throttler` v6 的 `ttl` 单位是**毫秒**（文档易误读为秒），已按毫秒配置。
- `pnpm-workspace.yaml` 增加 `onlyBuiltDependencies`（argon2 原生编译、prisma 引擎下载需放行）。
- shared 错误码新增 `Unavailable: 1007`（/ready 失败用），已 rebuild。
- `dotenv` 显式按「server/.env 优先、根 .env 兜底」加载，不依赖进程 cwd。

验证结果（2026-09-28，curl 冒烟全过）：

- `POST /auth/register` → 201，返回 `{ user, tokens }`；重复注册 → 409（1005）；弱密码 → 400（1001，中文 DTO 文案）。
- `POST /auth/login` → 200；错误密码 → 401（1002，与用户不存在同文案防枚举）。
- `GET /users/me` 带 access token → 200；无 token → 401。
- `POST /auth/refresh` → 200 一次一换；重放旧 token → 401（2003）且全会话连坐吊销；logout 后 refresh → 401。
- 登录连发 8 次 → 前 5 次 401、第 6 次起 429（1006）。
- `GET /health` / `GET /ready` → 200；未知路由 → 404（1004）；所有错误响应无堆栈，含 requestId（响应头 `x-request-id` 同步）。
- `pnpm -r typecheck`、`pnpm -r lint`：全绿。

## 阶段 3：内容域模型与内容分发 API —— ✅ 已完成（2026-09-28）

完成内容：

- Prisma 模型（migration `20260927212520_content_domain`）：`Journey`（title/subtitle/coverUrl/tags[]/isFree/status/totalDurationSec 冗余）、`Chapter`（journeyId+index 唯一、stops 站点时间轴 JSON、durationSec 冗余）、`AudioAsset`（trackType/mixPreset/objectKey/durationSec/sizeBytes/status）、`PlaybackHistory`（userId+chapterId 复合主键）、`Favorite`（userId+journeyId 复合主键）；`User` 增加 `role`（user/admin）与 `subscriptionStatus`（默认 free）。
- `@shenyou/shared` 新增 `audioTrackTypeSchema`（narration/ambient/music/mixed）、`mixPresetSchema`、`audioAssetStatusSchema`（processing/ready）、`chapterStopSchema`（timeSec/title/subtitle?），均已 rebuild。
- `ContentModule`（server/src/content/）：
  - 用户侧：`GET /journeys`（分页+tag 筛选，select 显式取字段 + `_count` 聚合章节数，无 N+1）、`GET /journeys/:id`（详情含章节+stops+isFavorited）、`GET /chapters/:id/play`（签名 CDN URL + 断点位置）、`PUT /playback/:chapterId` + `GET /playback`（断点续播）、收藏三接口。
  - 管理端（JwtAuthGuard + AdminGuard 双守卫）：创建/更新旅程、添加章节、创建音频资产并签发 S3 预签名直传 URL、上传完成回调 `ready`（事务内同步章节时长并重算旅程总时长）。
  - `StorageService`（@aws-sdk/client-s3 + s3-request-presigner，forcePathStyle）与 `CdnUrlService`（HMAC-SHA256 签名绑定 objectKey+expires+userId，URL 带 expires/signature 参数）。
- docker-compose 新增 RustFS（本地 S3 兼容存储，端口 9000/9001）+ 一次性 init 容器创建 `shenyou-audio` bucket 并放开匿名下载（模拟 CDN 回源）；env schema 的 S3_*/CDN_* 转为必填并新增 `S3_PRESIGN_TTL_SEC`、`CDN_SIGNING_SECRET`、`CDN_URL_TTL_SEC`。
- 接口文档：`docs/api/content.md`（移动端阶段使用）。

关键决策：

- **MinIO 镜像被 docker 镜像源屏蔽（403）**，改用 RustFS（S3 API 完全兼容，Apache-2.0）；`mc` 客户端仍可复用做 bucket 初始化。
- 付费校验规则：`isFree=false` 时仅 `subscriptionStatus ∈ {trial, active}` 可播放，否则 `403 / 4001 SubscriptionRequired`；MVP 角色与订阅状态通过 SQL 直接提升。
- 播放 URL 签名含 userId，转借即失效；本地 RustFS 匿名下载会忽略多余 query 参数，正好模拟 CDN 行为。
- 依赖报备（CLAUDE.md §9.3）：`@aws-sdk/client-s3` ^3、`@aws-sdk/s3-request-presigner` ^3（Apache-2.0，S3 预签名直传签发）。

验证结果（2026-09-28，curl 全流程通过）：

- 管理员：创建旅程 → 添加章节（stops 时间轴入库）→ 创建 mixed 音频资产拿到预签名 URL → **真实 PUT 上传文件到 RustFS 成功（200）** → ready 回调（章节/旅程时长事务内更新为 1800s）→ 发布。
- 用户：列表/详情正常（中文无乱码，含 chapterCount/isFavorited）；免费用户访问付费内容 → **403 `{code:4001,...}` 统一错误结构**；提升订阅后播放签发 200，签名 URL 实际 GET 到文件（200，256B）。
- 断点续播：PUT positionSec=120 → GET /playback?journeyId= 返回该记录。
- 收藏：POST/GET/DELETE 幂等正常；非管理员访问 /admin → 403（1003）；未登录 → 401（1002）。
- `pnpm -r typecheck`、`pnpm -r lint`：全绿。

## 阶段 4：apps/mobile Expo 应用骨架 —— ✅ 已完成（2026-09-28）

完成内容：

- **Expo SDK 57 + expo-router**：基于 `create-expo-app` TypeScript 模板初始化，`expo-router/entry` 为入口，文件路由 `app/` 目录。
- **信息架构**（prototype-guide.md §1 路由映射）：
  - 四 Tab「发现 / 场景库 / 工坊 / 我的」—— `app/(tabs)/` 下 `index` / `library` / `studio` / `mine`，自定义 TabBar 样式（深色 + Ionicons 图标）。
  - 堆栈页：`journey/[id]`（旅程详情，站点时间轴 + 音景三轨比例 + 吸底 CTA）、`player`（呼吸圆环 + 进度条 + 控制按钮 + 定时/调音入口，modal 呈现）、`report`（睡眠报告柱状图 + 统计卡片）。
  - 认证页：`login` / `register`（对接阶段 2 的 `/auth` 接口，登录后 `router.replace('/(tabs)')`）。
  - 迷你播放条：全局组件 `MiniPlayer`，仅 Tab 页浮于 TabBar 上方（EQ 动画 + 渐变播放键）。
- **主题系统**（§8 + Design Tokens）：`src/theme/tokens.ts` 直译 prototype-guide.md §2 色板（bg #070B18/pBg #0A0F22/card/line/tx #EEF2FF/tx2/tx3/gold #F0CE8E/vio #8B9CFF/pink/green），`gradients`（primary 135° #8B9CFF→#C58BFF / gold #F0CE8E→#E8A87C），`shenyouTheme` 定制 DarkTheme。深色启动屏（splash 背景 #0A0F22）。
- **API 客户端**（§6）：
  - `src/api/client.ts`：fetch 封装，`EXPO_PUBLIC_API_BASE_URL` 驱动；自动附加 Bearer token（expo-secure-store 读取）；401 自动刷新重试一次（refresh 去重 mutex）；4xx 不重试；5xx 指数退避重试最多 3 次；fetch 失败置 `ui-store.isOffline` 并映射中文「网络连接失败，请检查网络后重试」；所有错误为 `ApiError`（code/message/requestId，无堆栈）。
  - `src/api/token-storage.ts`：token 只存 expo-secure-store（KEYS：`shenyou.at/rt/user`），禁止 AsyncStorage。
  - `src/api/auth.ts` / `content.ts`：对接 `/auth/*` 与 `/journeys` `/chapters/:id/play` `/playback` `/favorites` 等接口。
- **状态管理**（§2）：TanStack Query v5（服务端态，`queryClient` + 4xx 不重试/网络错误 1 次兜底）+ Zustand v5（客户端态：`auth-store` 含 initialize/login/register/logout/clearAuth + auth gate；`player-store` 骨架；`ui-store` 离线标记）。
- **全局组件**：`OfflineNotice`（200ms 滑入动画）、`GradientPlaceholder`（渐变占位代替外链图片，§8）、`ErrorBoundary`（expo-router 原生 + 中文文案）。
- **app.json**：名称「神游」、`userInterfaceStyle: dark`、iOS `UIBackgroundModes: ["audio"]`、Android `WAKE_LOCK` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`、expo-router + expo-splash-screen 插件、`typedRoutes: true`。
- **metro.config.js**：monorepo `watchFolders` + `nodeModulesPaths`（workspace 根）。

依赖报备（§9.3）：expo ~57、expo-router ~57、expo-secure-store ~57、expo-linear-gradient ~57、@tanstack/react-query ^5.104、zustand ^5.0.15、@expo/vector-icons ^15、react 19.2.3、react-native 0.86.3（均为宪法 §2 锁定技术栈，无新增第三方库）。

验证结果（2026-09-28）：`pnpm --filter @shenyou/mobile typecheck` + `lint` 全绿。待真机 development build 验收。

## 阶段 5：核心播放体验（expo-audio）—— ✅ 代码完成（2026-09-29），待真机验收

完成内容：

- **音频会话（§7.1/§7.2）**：根布局启动时调用一次 `setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'doNotMix' })`；`startChapter` 内兜底重配。
- **app.json**：改用 `expo-audio` config plugin，`microphonePermission: false`（iOS 移除麦克风描述）、`recordAudioAndroid: false`（Android 不加 RECORD_AUDIO）、`enableBackgroundPlayback: true`（后台模式/权限/播放服务由插件统一注入）。
- **player.service.ts（§7.4 全局单例）**：
  - `createAudioPlayer` 懒初始化、模块级单例（非 hook、不自动释放）；`playbackStatusUpdate` 统一同步 Zustand `{ chapter, isPlaying, positionSec, durationSec, volume }`。
  - 章节编排：签发地址 → replace 换源 → 等待加载 → 恢复断点 → `setActiveForLockScreen`（标题/艺术家「神游」/旅程名 + ±15s 控制）→ 播放；章末自动续下一章。
  - **中断状态机（§7.5）**：审计 iOS/Android 原生源码确认「中断结束自动续播」（iOS interruption shouldResume、Android AUDIOFOCUS_GAIN 均自动 play），JS 层识别外部暂停后，把紧随的外部播放立即重新暂停，只消费一次；用户主动续播（播放页/耳机键第二次）正常。拔耳机（route change）原生即暂停且不恢复。
  - **断点续播（§7.6）**：播放中每 10s 节流上报 `PUT /playback/:chapterId`，暂停/换章立即上报；进播放页由签发响应 `positionSec` 恢复。
- **sleep-timer.ts**：档位 15/30/45/60 分钟（默认 30，播放开始自动布防）、播完本章（章末停不续章）、不限时；到点后 60 秒、500ms 一帧线性渐弱至 0 再暂停（恢复音量属性）；运行中可取消（渐弱中取消立即恢复音量）。TimerSheet 档位文案与原型 sheet-timer 逐字一致。
- **音景调音台（D1）**：MixerSheet 只切换服务端预置成品（default 40/35/25、relax 25/50/25），客户端切换即重签发、换源并保持当前进度；**未做客户端三轨同步播放**。服务端 `GET /chapters/:id/play` 新增可选 `mixPreset` 参数（非法值 400、relax 缺失 404 中文提示）。
- **UI**：BreathingRings（三层、8s 周期、低透明度，仅播放中运行——宪法动画纪律允许例外）、StationDots（与 Chapter.stops 联动 done/cur/todo）、可拖拽 SeekBar；MiniPlayer 接真实章节标题与控制；发现页新增「继续收听」卡（取最近播放记录恢复）；详情页 CTA 改为先走 service 再跳播放页。
- 文档：`docs/api/content.md` 补 `mixPreset` 查询参数。

验证结果（2026-09-29）：mobile/server `typecheck` + mobile `lint` 全绿。**真机验收六项待执行（见汇报打勾表）**。

## 阶段 6：订阅付费与内容 Gating（RevenueCat）—— ✅ 沙盒闭环已验收（2026-09-29），真实商店沙盒待账号

完成内容：

- **`@shenyou/shared`**：`billing.ts` —— `ENTITLEMENT_ID="premium"`、store/environment/periodType/entitlementStatus schema、`entitlementDtoSchema`。
- **Prisma**（migration `20260929035551_add_billing`）：`Entitlement`（userId 唯一、status/environment/store/productId/periodType/willRenew/expirationAt/originalTransactionId/latestEventId，`@@index([status, expirationAt])`）、`BillingEventLog`（eventId 唯一幂等键、eventType/environment/payload Json/processed，按环境/类型建索引）。
- **server billing 模块**（`src/billing/`）：
  - `EntitlementService`：幂等状态机 —— 事件先落 `BillingEventLog`（P2002 冲突即 duplicated 不重复处理）；`EVENT_ACTION` 映射（INITIAL_PURCHASE/RENEWAL/UNCANCELLATION/PRODUCT_CHANGE→grant；CANCELLATION→keep-canceled，到期前不收回；EXPIRATION/REFUND/SUBSCRIPTION_REVOKED→revoke）；只认 entitlement_ids 含 premium；支持懒过期（播放签发时发现已过期自动收敛）。
  - `RevenueCatWebhookController`：`POST /billing/revenuecat/webhook` 公开端点，rawBody 验签（`rawBody: true`）→ 结构校验 → 归一化 → 状态机，快速 200 返回 `{received, duplicated}`。
  - `RevenueCatVerifier`：Authorization 共享密钥（Bearer/裸值均可，timing-safe）+ HMAC（`X-RevenueCat-Webhook-Signature: t=<ts>,v1=<hex>`，HMAC 内容 `${ts}.${rawBody}`，5 分钟容差）；未配置项自动跳过。
  - `RevenueCatApiService`：v1 REST `GET /v1/subscribers/:id`（购买/恢复后主动对账；secret 未配置→503，App 降级本地态+webhook 兜底）。
  - 用户侧（JWT）：`GET /billing/entitlement`、`POST /billing/revenuecat/sync`、`POST /billing/sandbox/simulate`（INITIAL_PURCHASE/CANCELLATION/EXPIRATION，非生产且 `BILLING_SANDBOX_ENABLED` 开启）。
  - **沙盒事件全量留日志**：完整事件入 `BillingEventLog.payload`，pino 结构化日志 `billingEvent` 字段逐字段记录；生产仅摘要。
- **内容 Gating**：`chapters.service` 播放签发前调 `hasActiveEntitlement` —— 从未订阅 `403/4001`、曾订阅已过期 `403/4002`（取代阶段 3 的内联状态校验）。
- **移动端**：
  - 依赖报备：`react-native-purchases@10.10.2`（MIT，RevenueCat 官方，Expo config plugin）。
  - 适配器双实现 + factory：`RevenueCatPurchases`（configure 平台公共 key、login 绑 userId、getPlans 价格来自商店、purchasePackage/restorePurchases、CustomerInfo 监听；用户取消不报错；购买后 best-effort 服务端对账）与 `MockPurchases`（Expo Go 可用，经 sandbox/simulate 驱动同一状态机）；`EXPO_PUBLIC_BILLING_PROVIDER` 切换，默认 mock。
  - `app/paywall.tsx`（modal）：平静不施压文案；权益清单；月度/年度方案卡（金色细边，年度显示节省）；自动续费说明；用户协议/隐私政策链接；**「恢复购买」独立入口**（App Store 3.1.2 / 审核硬要求）；购买成功携带 journeyId/chapterId 直接进播放器。
  - 接线：`_layout` 登录态 configure+login/logout；详情页 CTA「订阅后开启这段旅程」且 4001/4002 竞态直接跳 paywall；MixerSheet 订阅错误跳 paywall；mine 会员卡（到期时间/「了解神游会员」）+ DEV「模拟订阅到期」。
  - env：`EXPO_PUBLIC_BILLING_PROVIDER`、`EXPO_PUBLIC_REVENUECAT_IOS/ANDROID_API_KEY`、可选 `EXPO_PUBLIC_TERMS/PRIVACY_URL`。

关键决策：

- **不直连 StoreKit 2**：RevenueCat 统一管理 iOS/Google Play 订阅生命周期与服务端对账，符合宪法约束。
- 验收策略：本地无 Apple/Google/RevenueCat 账号且 IAP 需真机 dev build，故以「真实生产代码 + dev-only 沙盒模拟缝（与真实 webhook 同一归一化入口与状态机）」跑通闭环；真实商店沙盒购买为账号就绪后的外部验收项。
- `BILLING_SANDBOX_ENABLED` 必须用 zod preprocess（`z.coerce.boolean()` 会把字符串 "false" 转 true）。

验证结果（2026-09-29，HTTP 脚本 18 项全过）：

- 免费用户播放付费旅程 → **403/4001**；模拟 INITIAL_PURCHASE → 权益 active（SANDBOX）→ 播放地址签发 → **签名 URL Range GET 成功（206）**。
- webhook：无签名/错误签名 → **401**；正确 HMAC → 200；同一 eventId 重放 → **duplicated=true 幂等**。
- CANCELLATION → willRenew=false 但**到期前播放不受影响**；EXPIRATION → isActive=false → 播放 **403/4002**；过期后恢复查询无 active。
- `BillingEventLog` 三类沙盒事件 payload 完整可查；pino `billingEvent` 全字段日志确认。
- `pnpm -r typecheck`（server/mobile）、server `eslint src/billing` 与 mobile lint：全绿。

真实商店沙盒验收待办（账号就绪后）：RC dashboard 建 App/产品（月度/年度）/premium entitlement/webhook（HMAC+Authorization）→ EAS development build → App Store Connect/Play Console 添加沙盒测试员 → 真机执行 购买/取消/恢复/到期 全链路并核对 BillingEventLog。

## 阶段 7：上架与发布材料（EAS / 权限自检 / 法律页 / 合规文档）—— ✅ 配置与文档完成（2026-09-29），云构建真机冒烟待人工执行

完成内容：

- **EAS Build（`apps/mobile/eas.json`）**：cli ≥16.0.0、appVersionSource remote；三 profile——`development`（dev client + internal + channel development，mock billing）、`preview`（internal + channel preview，Android APK，mock billing）、`production`（channel production + autoIncrement，revenuecat provider，RC key 引用环境变量）；`submit.production.android.track=internal`。
- **app.json**：version 1.0.0 + `runtimeVersion.policy=appVersion`；iOS bundleIdentifier `com.shenyou.app`、buildNumber 1、`UIBackgroundModes:["audio"]`、supportsTablet；Android package `com.shenyou.app`、versionCode 1、adaptiveIcon 路径修正、permissions 仅 WAKE_LOCK + blockedPermissions 四项（READ/WRITE_EXTERNAL_STORAGE、SYSTEM_ALERT_WINDOW、VIBRATE）；expo-audio 插件 microphonePermission/recordAudioAndroid/enableBackgroundRecording 全 false、enableBackgroundPlayback true；splash 插件 imageWidth 180 + contain + #0A0F22。
- **成品资产**（纯 Node 生成器，无第三方依赖）：`assets/images/icon.png` 1024 RGB（iOS 无 alpha）、`favicon.png` 196、`adaptive-icon.png` 1024 RGBA（星点全部收进 Android 安全圈）、`splash-icon.png` 1024 RGBA；深蓝渐变 + 金色月牙 + 星点。
- **权限自检（有证据）**：`expo prebuild --platform android` 实测合并后 AndroidManifest——最终仅 INTERNET、WAKE_LOCK、MODIFY_AUDIO_SETTINGS、FOREGROUND_SERVICE、FOREGROUND_SERVICE_MEDIA_PLAYBACK（`com.android.vending.BILLING` 由 purchases-hybrid-common AAR 在 Gradle 合并阶段引入，构建后复核）；无 RECORD_AUDIO/POST_NOTIFICATIONS/定位/相机。iOS 经 `npx expo config --type prebuild` 评估插件链：Info.plist 仅 `UIBackgroundModes:["audio"]`，NSMicrophoneUsageDescription 被移除，无 ATT。
- **App 内法律页**：`src/components/LegalScreen.tsx`（返回头+离线可读的深色文档布局）+ `app/legal/privacy.tsx`（隐私政策：仅账号信息/播放进度收藏/订阅状态；明示不使用麦克风、支付经 Apple/Google、RevenueCat 第三方说明）+ `app/legal/terms.tsx`（用户协议：账号、自动续费与取消、知识产权、内容非医疗建议、法律适用）；`_layout` 注册路由；mine 增加「隐私政策/用户协议」分组入口；paywall 外链改为站内路由。
- **发布材料文档（`docs/release/`）**：`app-store-privacy-labels.md`（4 类数据逐题答案，不追踪/无 IDFA）、`testflight-play-internal.md`（TestFlight 内部/外部测试 + Play internal 100 人/新个人号 14 天 12 人政策/数据安全口径）、`compliance-checklist.md`（App 备案前置 ICP/主体、软著材料与周期、Apple/Google/国内安卓渠道材料、内容资质咨询提醒，全部人工办理）、`release-checklist.md`（安装/登录/播放/定时器/付费[mock+真实沙盒]/断网/合规入口冒烟用例逐项含勾选与签字位）。

验证结果：`pnpm -r typecheck` 全绿、mobile `eslint .` 无告警、typed routes 已含 `/legal/*`、临时 android 目录已清理。

人工执行项：`eas login` → `eas build --profile preview`（iOS/Android）→ TestFlight/Play internal 分发 → 按 `docs/release/release-checklist.md` 真机冒烟；备案/软著/账号材料按 `docs/release/compliance-checklist.md` 办理；法律文档【】项（运营主体/客服邮箱/云服务商/隐私政策托管网址）发布前补全。

## 遗留问题（后续阶段处理）

- ~~`server` 尚未接入 Redis/BullMQ（AI 管线 worker）~~ 已完成（2026-09-29）：BullMQ 管线（draft→tts→music→mix→upload），MockProvider 全链路跑通，TTS 失败重试+死信验证通过，混音双预置（default/relax）+ -16 LUFS + AAC 128k/44.1k。
- ~~`apps/mobile` 尚未初始化 Expo SDK 脚手架~~ 已完成阶段 4 骨架（SDK 57 + expo-router），~~下一步：expo-audio 全局单例播放器 + 呼吸圆环动画 + 睡眠定时器渐弱 + 断点续播（§7）~~ 已完成阶段 5 代码（2026-09-29），待真机逐项验收。
- `apps/admin` 尚未初始化 Vue3 + Vite + Element Plus。
- shared 包被 server/apps 引用时，需先在 shared 执行 `pnpm build`（或在消费方配置 alias 指向 `src`，阶段 4 定夺）。
- 管理端仅做了角色守卫（admin），更细的权限（如内容运营/审核分离）待运营后台阶段细化；角色/订阅状态目前靠 SQL 提升，需后台提供管理界面。
- CDN 签名目前是服务端 HMAC 模拟，接入真实 CDN（如 Cloudflare/又拍云）时替换为对应签名算法。
- ~~本地开发数据库依赖手工启动的 Docker 容器~~ 已补 `docker-compose.yml`（2026-09-28）：postgres 16（5432）+ redis 7.2（**6380**，因本机 6379 被既有 `my-redis` 容器占用）+ RustFS（9000/9001，S3 兼容），含健康检查与命名卷；根脚本 `pnpm db:up / db:down`；`server/.env(.example)` 的 `REDIS_URL` 为 6380、`S3_ENDPOINT` 为 `http://localhost:9000`。已验证：migrate deploy 重放成功、register 201、redis PONG、预签名 PUT 与匿名 GET 均 200。
