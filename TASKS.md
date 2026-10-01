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

## 阶段 A：管理端后端补全（读接口 + 用户管理）—— ✅ 2026-09-30

完成内容：

- **旅程读取**：`GET /admin/journeys` 分页 + keyword（标题/副标题模糊）+ status/tag 多值筛选（pageSize 上限 100），返回全部状态（与用户侧仅 published 的关键区别）；`GET /admin/journeys/:id` 返回旅程全字段 + 章节数组（按 index 升序）+ 每章 audioAssets + pipelineJobs。
- **章节读取**：`GET /admin/chapters/:id` 返回章节全字段（narrationText/draftStatus/draftHash/voiceId/musicTags/stops）+ audioAssets（含 id/objectKey/trackType/mixPreset/durationSec/sizeBytes/status）+ pipelineJobs（step/status/contentHash/errorMessage）；`GET /admin/chapters/:chapterId/audio-assets` 字段平铺，前端按 trackType/mixPreset 分组。
- **用户管理**：`GET /admin/users` 分页 + keyword（手机号/邮箱/昵称模糊）+ role/subscriptionStatus 筛选，返回 `id/phone/email/nickname/role/subscriptionStatus/createdAt/entitlement` 摘要，**绝不包含 passwordHash/token**；`PATCH /admin/users/:id/role` 仅允许 user/admin；`PATCH /admin/users/:id/subscription` 允许所有订阅状态；**自改角色拦截**：`SelfRoleChangeForbidden(1008)`；变更写 pino 结构化审计日志（`adminUserId/targetUserId/field/before/after`）。
- **DTO 与 shared**：新增 `AdminJourneyQueryDto`、`AdminUserQueryDto`、`UpdateUserRoleDto`、`UpdateUserSubscriptionDto`；shared 新增 `userRoleSchema`、`draftStatusSchema`、`pipelineStepSchema`、`pipelineJobStatusSchema`、`admin.ts` 响应 schema（含 `adminPagedSchema` 泛型分页）；`SelfRoleChangeForbidden: 1008` 加入 `ErrorCode`。
- **统计接口**：预留 TODO 注释（数据看板真实接口：播放量/完播率/订阅转化/热门场景，需新写统计 service + 索引/缓存）。

验证结果（29 项通过 / 2 项 status 200→201 脚本误判，功能全部通过）：

- 草稿旅程可被管理端列出，用户侧不可见（`/journeys` 仅 published）。
- keyword/status/tag 筛选 + 分页边界（pageSize=200 被 400 拒绝）生效。
- 旅程详情含章节与管线摘要；章节详情返回 audioAssets 的 id（上传链路全程不依赖日志捞 ID）。
- 资产创建 → 预签名 PUT 直传 → ready 回调 → 资产状态与章节时长同步更新。
- 用户列表无敏感字段；自改角色返回 1008；普通用户访问 /admin/users → 403/1003；未登录 → 401。
- pino 日志可见 `adminUserId/targetUserId/field/before/after` 审计字段，authorization 已脱敏。
- `pnpm -r typecheck`（server/mobile/shared/admin）全绿；server `eslint .` 仅存量 worker.ts 的 unused eslint-disable warning（与本阶段无关）。

## 阶段 B：apps/admin 运营后台前端（Vue3 + Vite + Element Plus）—— ✅ 2026-09-30

完成内容：

- **脚手架**：Vite 7 + Vue 3.5（script setup + TS strict）+ Vue Router 4 + Pinia 3 + Element Plus 2.11（暗色主题）+ axios；`@shenyou/shared` 经 vite `resolve.alias` 指向 `packages/shared/src` 源码，dev/build 双链路实测通过（方案记录于 `apps/admin/README.md`）；dev 固定端口 5174（strictPort，5173 被本机其他项目占用），后端 CORS 白名单已同步。
- **基础设施**：axios 实例解包统一信封（`{code,message,requestId,data}`），401 并发去重刷新重放一次、403 提示并登出，ErrorCode 分段映射中文提示且附 requestId；auth store（token 存 localStorage，Web 端既定取舍，代码注释说明）；路由守卫（未登录跳 /login 带 redirect、非 admin 拦回）；管理员判定用裸 axios 探测 `GET /admin/journeys?pageSize=1`（/users/me 与 JWT payload 均无 role），前端守卫 + 后端 AdminGuard 双重保险。
- **模块 1 旅程管理**：列表（keyword/status/tag 筛选 + 分页 + 状态四色标签 + 发布/下架二次确认）；编辑页（基础信息表单、标签 el-select allow-create、封面 URL、isFree 开关、发布前置校验「至少一个章节且存在 ready 混音」、章节表格 + 添加章节对话框内嵌 StopsEditor 站点时间轴编辑器）。
- **模块 2 AI 管线控制台**：章节管线页（文案只读展示 + 生成草稿/确认/驳回、五步骤卡片展示最新 job 状态/errorMessage/contentHash/失败重跑、4s 轮询页面卸载即停、音频资产表格内嵌试听按钮与 AudioUpload 预签名直传组件——HTMLAudioElement 探测时长失败转人工输入）；管线总览页（「待确认草稿」tab 客户端聚合前 100 旅程过滤 pending + 快捷确认/驳回；「队列与死信」tab stats 五卡片 + 最近任务 + 死信重跑，canRerun 校验 data.chapterId 与步骤名合法）。
- **模块 3 用户与订阅管理**：列表（keyword/role/subscriptionStatus 筛选）；行内改角色/订阅 + ElMessageBox 二次确认；当前登录管理员角色下拉禁用 + 「（我）」标识（对应后端 SelfRoleChangeForbidden 1008）。
- **模块 4 数据看板**：占位页（规划指标清单展示，真实统计接口待后续阶段）。
- **server 配套新增**：`GET /admin/audio-assets/:assetId/play-url`（AdminGuard，校验资产存在且 ready 后由 CdnUrlService 签发绑定 userId 的签名播放 URL——用户侧 `/chapters/:id/play` 限 published，草稿章节试听不能复用，前端禁止拼 objectKey）；shared 新增 `adminAudioPlayUrlSchema` + `AdminAudioPlayUrl` 类型。

验证结果（2026-09-30）：

- `pnpm --filter @shenyou/admin typecheck / lint / build` 全绿。
- API 级全链路（脚本）：建旅程 → 章节 → 创建资产 → 预签名 PUT 直传 RustFS → ready 回调 → 管理端 play-url 签发 → 200 流式拉取；draft → confirm → draft/tts/music/mix/upload 全 completed；PATCH published → 用户侧 `GET /journeys` 可见；PATCH 用户订阅 active 生效。
- 浏览器验收：非管理员登录被拒（「该账号不是管理员，无法进入运营后台」）、管理员登录、旅程列表多状态标签、编辑页表单与章节卡片（修复 detail 为 null 时 `detail!.status` 崩溃的真 bug——统一改 `v-if="!isNew && detail"`）、章节管线页五步骤与资产就绪标签 —— PASS；试听按钮点击 / 用户与订阅页 / 数据看板页 / 退出登录与越权重定向 —— 见本节末尾补验记录。
- Element Plus 2.11 已知类型 bug 绕过：`ElConfigProvider` 的 locale prop 类型声明错误，用组件级类型收窄（`as unknown as DefineComponent<{ locale?: Language }>`）解决。
- **浏览器验收抓出真 bug（已修复）**：管理端试听 `<audio>` 被 `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` 拦截——helmet 默认 `Cross-Origin-Resource-Policy: same-origin`，而签名播放 URL 指向 `CDN_BASE_URL`（局域网 IP:3000），与页面源 localhost:5174 跨源。修复：`audio-stream.controller.ts` 音频流响应显式设置 `CORP: cross-origin`（签名 URL 本身已做访问控制，CDN 回源资源本就应允许跨源嵌入），移动端 WebView 不校验 CORP 不受影响。已 rebuild + 重启 + 自签 URL 复验响应头生效。

阶段 B 浏览器补验（2026-09-30 第二轮，全部 PASS）：

- 试听按钮：刷新页面后点击 ready 混音行「试听」，`audio.paused=false` 且 `currentTime` 递增，无新增跨域报错；服务端日志实证三次 206 Range 分片且 `CORP: cross-origin`（agent 早前读到的 NotSameOrigin 为修复前残留 console 噪音）。
- 用户与订阅页：「（我）」管理员行角色下拉实测禁用（`.el-select__wrapper` 含 `is-disabled`——EP 2.14 禁用 class 挂在 wrapper 上，agent 前轮查外壳 `.el-select` 属误判）；非管理员用户行内改订阅 + 二次确认 + 成功提示 + 标签更新全流程 PASS（测试数据已还原为 active）。
- 数据看板占位页：渲染正常、无报错。
- 退出登录 → 回 /login；未登录访问 /journeys → 守卫重定向 `/login?redirect=/journeys`，均 PASS。

## 遗留问题（后续阶段处理）补充

- ~~`apps/admin` 尚未初始化 Vue3 + Vite + Element Plus。~~ 阶段 A（后端读接口 + 用户管理）、阶段 B（前端四模块）均已于 2026-09-30 完成，见上两节。
- ~~shared 包被 server/apps 引用时，需先在 shared 执行 `pnpm build`（或在消费方配置 alias 指向 `src`，阶段 4 定夺）。~~ 已定夺（2026-09-30）：admin 走 vite alias 直接消费源码（dev/build 双链路实测，见 `apps/admin/README.md`）；server/mobile 走 shared build 的 dist 产物。
- 管理端仅做了角色守卫（admin），更细的权限（如内容运营/审核分离）待运营后台阶段细化；~~角色/订阅状态目前靠 SQL 提升，需后台提供管理界面~~ 已完成（阶段 B 模块 3，含自改角色拦截 1008 与审计日志）。
- **阶段 B 前端遗留（按钮已禁用 + TODO tooltip，待后端补接口）**：~~旅程删除接口（DELETE /admin/journeys/:id）~~ 已补全（见下文新节）；~~章节编辑~~ 已补全（见下文新节）；~~章节拖拽排序接口~~、~~旅程封面图预签名直传接口（当前仅手填 URL）~~、~~待确认草稿聚合接口 `GET /admin/chapters?draftStatus=pending`（当前前端聚合前 100 条旅程详情过滤，量大后失效）~~ 均已补全（见文末「三个遗留接口补全」节，2026-09-30）。
- CDN 签名目前是服务端 HMAC 模拟，接入真实 CDN（如 Cloudflare/又拍云）时替换为对应签名算法。
- ~~本地开发数据库依赖手工启动的 Docker 容器~~ 已补 `docker-compose.yml`（2026-09-28）：postgres 16（5432）+ redis 7.2（**6380**，因本机 6379 被既有 `my-redis` 容器占用）+ RustFS（9000/9001，S3 兼容），含健康检查与命名卷；根脚本 `pnpm db:up / db:down`；`server/.env(.example)` 的 `REDIS_URL` 为 6380、`S3_ENDPOINT` 为 `http://localhost:9000`。已验证：migrate deploy 重放成功、register 201、redis PONG、预签名 PUT 与匿名 GET 均 200。

## 阶段 B 遗留接口补全：旅程删除 + 章节编辑 —— ✅ 2026-09-30

- **后端**：
  - `DELETE /admin/journeys/:id`：旅程不存在 404；已发布 409「旅程已发布，不能直接删除，请先下架」（防误删线上内容）；删除走 schema 级联（章节/音频资产/管线任务/播放记录/收藏），S3 对象用 `StorageService.deleteObjects`（DeleteObjectsCommand，单批 1000 自动分批）尽力清理——失败仅 `logger.warn` 不影响删除结果；返回 `{ id, deleted, removedObjects }`。
  - `PATCH /admin/chapters/:id`（UpdateChapterDto：title?/subtitle?/index?/stops?）：章节不存在 404；stops 经 zod 校验失败 400；序号冲突 P2002 → 409「该章节序号已被其他章节占用」；部分更新（undefined 字段不动）。index 即手动排序手段（拖拽排序前端待做）。
- **前端**：`request.ts` 新增 `httpDelete`；journeys.ts `deleteJourney`、chapters.ts `updateChapter`；旅程列表删除按钮启用（ElMessageBox type=error 二次确认，文案明示级联后果）；章节对话框改添加/编辑双模式（`editingChapterId` 区分，编辑模式显示序号字段并预填，stops 深拷贝防直接改详情数据）。
- **验收抓出真 bug（已修复）**：新建旅程 `router.replace` 到 `/journeys/:id` 后组件复用、detail 未重载，章节管理卡片不渲染——JourneyEditView 增加 `watch(journeyId)` 触发 load()。
- 验收：admin/server typecheck + lint + build 全绿；API 冒烟 12 项全 PASS（建旅程→建 2 章节→PATCH 标题/stops→序号冲突 409→合法换序号→PATCH 404→发布→删已发布 409 下架→删除 200→详情 404→删除 404）；浏览器实测：添加/编辑对话框模式与字段可见性、编辑保存（PATCH 200 落库）、删除确认弹框文案、DELETE 200 + DB 级联实证（journey/chapter 均 0 行）。

## 阶段 B 三个遗留接口补全：草稿聚合 + 封面直传 + 章节拖拽 —— ✅ 2026-09-30

- **后端**：
  - `GET /admin/chapters`（AdminChapterQueryDto：page/pageSize≤100、`draftStatus?: DraftStatus[]` 多值、`journeyId?`）：`$transaction` count+findMany，按 `updatedAt desc`，select 关联旅程标题；输出项含 `journeyTitle` 与 `narrationPreview`（narrationText 前 100 字），替代客户端聚合前 100 旅程详情。
  - `POST /admin/cover-uploads`（CreateCoverUploadDto：fileName≤200）：objectKey `covers/{uuid}{ext}`，签发 PUT 预签名；`coverUrl` 为服务端公共代理地址 `${CDN_BASE_URL origin}/images/{objectKey}`（不新增环境变量，origin 从 CDN_BASE_URL 推导）；扩展名白名单 jpg/jpeg/png/webp，非法 400。
  - `PATCH /admin/journeys/:id/chapters/reorder`（ReorderChaptersDto：`orderedIds: string[]`，1–100）：校验 id 集合与该旅程现有章节**完全一致**且无重复，否则 400；旅程不存在 404；`$transaction` 两步更新（先全部置负序号再置正序），避开 `@@unique([journeyId,index])` 冲突。
  - 新增 `image-stream.controller.ts`：`GET /images/*`（@SkipThrottle）——objectKey 限 `covers/` 前缀否则 404，S3 GetObject 回源流式返回，显式 `Cross-Origin-Resource-Policy: cross-origin`、`Cache-Control: public, max-age=86400`，Content-Type 按扩展名推断；发现页未登录可见，代理不做签名。
  - shared：新增 `adminChapterListItemSchema` / `adminChapterListResponseSchema`（adminPaged）与对应类型，dist 已构建。
- **前端**：chapters.ts `fetchChapters`、journeys.ts `createCoverUpload` / `reorderChapters`，types 再导出；管线总览待确认 tab 改服务端聚合（journeyTitle 列 + 分页器，删除本地旅程聚合）；旅程编辑页封面改 `el-upload`（自定义 http-request：签发→fetch PUT 裸文件→预览；移除封面按钮）；章节表格行 sortablejs 拖拽（手柄列，onEnd 落库，失败 load() 回滚）。
- **浏览器实测抓出 3 个真 bug（均已修复）**：
  1. 章节创建后 `load()` → initSortable 先 `destroy()` 旧实例，dataset 守卫又阻止同一 tbody 重建——添加章节后拖拽永久失效。改为「存活实例 + 绑定节点引用（boundTbody）」判定，同节点实例存活则跳过、节点被替换才销毁重建。
  2. 移除封面不生效：payload 在 coverUrl 为空串时省略该字段，后端收不到清除指令。改为始终提交 `coverUrl`（空串即清除，服务端按 undefined 判定是否更新）。
  3. axios 默认把数组序列化为 `draftStatus[]=pending`，后端只认重复键 `draftStatus=pending`——列表 0 条。为该请求定制 paramsSerializer（URLSearchParams 重复键）。
  4. 基础设施：RustFS 未配置 CORS，浏览器跨源 PUT `TypeError: Failed to fetch`（Node 冒烟无 CORS 故通过）。经 S3 PutBucketCors 给 bucket 配置允许来源（:5174 localhost/局域网 IP）、GET/HEAD/PUT、MaxAge 3600，预检与 PUT 复验通过；生产环境对应 bucket CORS 常规配置。
- 验收：shared build；admin/server typecheck + lint + build 全绿（server 仅 worker.ts 存量 warning；admin build 仅存量 chunk 体积/zod 注释提示）；server rebuild + 重启后启动日志确认四条新路由映射；**API 冒烟 19/19 PASS**（pending 列表含 journeyTitle、非法 draftStatus/pageSize 400、签发封面、PUT 直传、/images 回源 200 + CORP + Cache-Control、gif 400、非 covers 前缀 404、3 章节反转 reorder、详情顺序+index 校验、缺章节/外来 id/重复 id 400、旅程不存在 404、清理）；浏览器实测：封面上传（PUT 200 → 预览经 /images 加载 → 保存后刷新持久化 → 移除 → 刷新确认清除）、章节拖拽（拖后 二/三/一 + # 列重排 → PATCH 200 → 刷新持久化；新增章节后实例仍存活）、草稿聚合（6 条 pending 含旅程标题 + 「共 6 条」分页）；测试旅程已 DELETE 清理。

## 数据看板真实接口（admin-prompts.md 阶段 B 后建议补做项）—— ✅ 2026-09-30

- **shared**：`admin.ts` 新增看板 schema——`adminStatsPlaybackSchema`（totalPlays/uniqueListeners/completedCount/completionRate/activeLast7d/activeLast30d）、`adminStatsSubscriptionSchema`（totalUsers/byStatus 五态/payingUsers/conversionRate/initialPurchaseEvents/renewalEvents）、`adminStatsTopJourneySchema`、`adminStatsOverviewSchema`（generatedAt/cacheTtlSec + 三段聚合），dist 已构建。
- **后端（新 StatsModule，`server/src/stats/`）**：
  - `GET /admin/stats/overview`（JwtAuthGuard + AdminGuard）：播放/完播/活跃与热门场景排行走**原生 SQL 单趟聚合**（`COUNT(*) FILTER (WHERE …)`，完播口径 positionSec ≥ 章节时长 90%——PlaybackHistory 为 upsert 断点表，播放量为「用户×章节」粒度）；订阅分布 `user.groupBy(subscriptionStatus)`；首购/续费事件 `billingEventLog.groupBy(eventType)`。
  - **结果缓存**：ioredis 直连 `REDIS_URL`（lazyConnect），键 `admin:stats:overview:v1`，TTL 300s；`?refresh=1` 强制重算并回填；缓存读写失败仅 `logger.warn` 降级实时计算，不影响可用性。generatedAt 为统计实际生成时间，缓存命中保持原值（前端据此展示数据时效）。
  - **索引 migration `20260930050018_add_stats_indexes`**：`PlaybackHistory @@index([chapterId])`（章节/旅程维度聚合）、`@@index([updatedAt])`（近 7/30 天活跃范围计数）、`User @@index([subscriptionStatus])`（groupBy 分布）。
  - 依赖报备：server 显式新增 `ioredis@^5.4.1`（此前仅作为 bullmq 传递依赖存在；统计缓存直连 Redis 需要显式依赖）。
- **前端**：`api/stats.ts fetchStatsOverview(refresh?)`；types 再导出 `AdminStatsOverview/AdminStatsTopJourney`；新复用组件 `components/StatCard.vue`；DashboardView 占位页替换为真实看板——播放概览 6 卡、订阅转化 5 卡 + 五态分布标签（复用 `SUBSCRIPTION_STATUS_MAP`）、热门场景排行表（封面/状态标签/播放/听友/完播率进度条，复用 `CONTENT_STATUS_MAP`）、顶部「数据生成于 …（缓存 5 分钟）」+「刷新重算」按钮（走 ?refresh=1）。
- 验收：admin/server/shared typecheck + lint + build 全绿（仅存量 warning）；migration 已应用；**API 冒烟 14/14 PASS**（结构完整、比率 0-1、缓存命中 generatedAt 不变、refresh=1 重算且回填、未登录 401、普通用户 403/1003、普通用户 PUT 播放进度后 refresh 总播放量 +1 且该旅程进入热门排行）；浏览器实测 PASS（三区块数值与冒烟数据一致、刷新重算 generatedAt 更新、console 无报错）。

## 操作审计页（admin-prompts.md 阶段 B 后建议补做项）—— ✅ 2026-09-30

- **数据层**：新 Prisma 模型 `AdminAuditLog`（migration `20260930180118_add_audit_log`）——id/adminUserId/adminAccount/targetUserId/targetAccount/field(role|subscriptionStatus)/before/after/createdAt；**故意不加外键**（账号删除后审计仍须留存），账号信息以写入时快照落库（phone→email→nickname 取一）；索引 `createdAt`、`(adminUserId,createdAt)`、`(targetUserId,createdAt)`。
- **写入侧**：[admin-users.service.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/users/admin-users.service.ts) `updateRole`/`updateSubscription` 改为 `$transaction([user.update, adminAuditLog.create])`——审计与变更同事务，要么都成功要么都失败；保留原 pino 结构化日志双写。
- **查询侧**：`GET /admin/audit-logs`（新 `AdminAuditController`，JwtAuthGuard + AdminGuard）——分页（page/pageSize 上限 100）+ `field` 精确筛选 + `keyword` 操作人/目标账号快照模糊搜索（OR contains insensitive），倒序 createdAt。
- **shared**：`adminAuditFieldSchema`（z.enum role/subscriptionStatus）、`adminAuditLogItemSchema`、`adminAuditLogListResponseSchema`，dist 已构建。
- **前端**：[AuditLogView.vue](file:///c:/Users/26184/Desktop/shenyou/apps/admin/src/views/AuditLogView.vue)（/audit-logs 路由 + 侧边导航「操作审计」）——搜索框 + 变更字段下拉 + 表格（时间/操作人/目标用户/字段标签/变更：删除线前值 → 高亮后值，角色与订阅状态值映射中文）+ 分页；`api/audit.ts` + types 再导出 `AdminAuditLogItem/AdminAuditLogListResponse/AdminAuditField`。
- 验收：admin/server/shared typecheck + lint + build 全绿；migration 已应用；**API 冒烟 17/17 PASS**（两次 PATCH 各落一条审计且 before/after/账号快照正确、倒序、field 筛选、keyword 命中/无命中、非法 field 400、pageSize=101 400、未登录 401、普通用户 403/1003、恢复角色再落一条共 3 条）；浏览器实测 PASS（表格结构/中文映射/分页/筛选/搜索/空态/console 无报错）。

## 真实 TTS 厂商接入（阿里云百炼 CosyVoice）—— ✅ 2026-10-01

- **新增适配器** [aliyun-tts.provider.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/providers/aliyun-tts.provider.ts)：百炼**非实时语音合成 HTTP API**——`POST {DASHSCOPE_BASE_URL}/api/v1/services/audio/tts/SpeechSynthesizer`（Bearer API Key），请求体 `{model, input:{text,voice,format:"mp3",sample_rate:44100}}`；成功响应 `output.finish_reason="stop"` + `output.audio.url`（24h 有效）→ 下载原始 mp3 → **ffmpeg 转码对齐「单声道/44.1kHz/AAC 128k m4a」**（宪法 §7.9）→ ffprobe 取时长；错误响应（含厂商 code+message+request_id）/超时/网络不可达均归一化中文报错；临时文件失败即清理。
- **voiceId 约定**：章节 `voiceId="default"` → 映射 `env.ALIYUN_TTS_VOICE`（默认 `longanyang`）；其余值原样透传百炼音色 ID。官方单次文本上限 20000 字符，章节文案远小于此，不做分片。
- **env**：新增 `DASHSCOPE_API_KEY`（TTS_PROVIDER=aliyun 时必填，zod refine 启动 fast-fail）、`ALIYUN_TTS_MODEL`（默认 cosyvoice-v3-flash）、`ALIYUN_TTS_VOICE`、`DASHSCOPE_BASE_URL`（默认 https://dashscope.aliyuncs.com，可指向业务空间专属域名或本地模拟服务器）、`ALIYUN_TTS_TIMEOUT_SEC`；`.env.example` 已同步；TTS_PROVIDER 枚举切 `aliyun` 即上线，mock 保持默认。
- **接线**：provider.factory 注入 AliyunTtsProvider 并加 case "aliyun"；pipeline.module 注册 provider。
- **无凭证验证方案**：本地百炼模拟服务器（`dashscope-mock-server.mjs`，端口 8790，ffmpeg 生成 6s mp3；实现鉴权校验、请求体校验、官方成功/错误响应形态）。
- 验收：server typecheck/lint/build 全绿（仅存量 worker.ts warning）；**适配器协议测试 9/9 PASS**（输出 AAC/m4a/单声道/44.1kHz/128k、请求协议字段、自定义 voiceId 透传、厂商业务错误含 request_id、无效 Key 401、网关不可达）；**真实管线端到端 12/12 PASS**（worker 以 aliyun env 启动 → 建旅程/章节 → 草稿 → 确认 → tts 自动完成：人声资产 durationSec=6s 证明走的是真实厂商链路而非 mock → 试听流 ffprobe AAC/44.1kHz/mono/6.0s → 清理）。
- **上线待办**：用户在百炼控制台开通 CosyVoice、创建 sk- API Key 写入生产环境变量（TTS_PROVIDER=aliyun + DASHSCOPE_API_KEY），并按目标音色调整 ALIYUN_TTS_VOICE（音色必须与模型版本匹配）；真实凭证就绪后建议跑一次生产合成回归。

## 真实 TTS 凭证上线回归 —— ✅ 2026-10-01

- 用户已在百炼控制台开通 CosyVoice 并配置真实 sk- API Key 至 [server/.env](file:///c:/Users/26184/Desktop/shenyou/server/.env)（`TTS_PROVIDER=aliyun` + `DASHSCOPE_API_KEY`，`DASHSCOPE_BASE_URL` 走默认真实端点）。
- **适配器真实冒烟 5/5 PASS**：直接实例化 AliyunTtsProvider 打生产 API（cosyvoice-v3-flash / longanyang）——合成 10s 人声、耗时 5.4s、产物 152KB、ffprobe 验证 AAC/44.1kHz/单声道。
- **真实管线端到端 12/12 PASS**（真实凭证 worker）：建旅程/章节 → 草稿 → 确认 → tts 完成 → 人声资产 ready → 试听 URL 拉流 ffprobe 验证 AAC/44.1kHz/单声道/m4a，**实际合成时长 45.5s**（真实文案全文合成）→ 清理。

## 真实 TTS 厂商接入（腾讯云语音合成 长文本异步合成）—— ✅ 2026-10-01

- **选型**：用户选定腾讯云，**签名（TC3-HMAC-SHA256）完全交给官方 Node SDK** `tencentcloud-sdk-nodejs-tts`（TTS 专项模块化包；`require("tencentcloud-sdk-nodejs-tts").tts.v20190823.Client`），不自拼端点/签名/Action。
- **新增适配器** [tencent-tts.provider.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/providers/tencent-tts.provider.ts)：`CreateTtsTask`（Version 2019-08-23，域名 tts.tencentcloudapi.com）提交 `{Text, ModelType:1, VoiceType, PrimaryLanguage:1, SampleRate:16000, Codec:"mp3"}` → 取 `Data.TaskId` → 轮询 `DescribeTtsTaskStatus`，**Status 0 等待/1 执行中/2 成功/3 失败**（StatusStr waiting/doing/success/failed）：成功取 `Data.ResultUrl`（COS，24h 有效），失败取 `Data.ErrorMsg`；下载原始 mp3 → **ffmpeg 上采样转码对齐「单声道/44.1kHz/AAC 128k m4a +faststart」**（宪法 §7.9；腾讯长文本仅支持 16k/8k）→ ffprobe 取时长。
- **voiceId 约定**：章节 `voiceId="default"` → 映射 `env.TENCENT_TTS_VOICE_TYPE`（默认 **10510000 智逍遥**，官方长文本示例同款旁白阅读风格男声）；其余值必须为正整数音色 ID（如 101008），非整数即时归一化报错；文本上限 **10 万字符**，章节全文一次合成不分片。
- **env**：新增 `TENCENT_SECRET_ID`/`TENCENT_SECRET_KEY`（https://console.cloud.tencent.com/cam/capi，TTS_PROVIDER=tencent 时 zod refine 双凭证必填 fast-fail，适配器内另有防御性检查）、`TENCENT_TTS_REGION`（默认 ap-guangzhou，长文本 Region 非必填）、`TENCENT_TTS_VOICE_TYPE`、`TENCENT_TTS_ENDPOINT`（SDK endpoint 覆盖，仅本地模拟联调，支持 http:// 前缀）、`TENCENT_TTS_TIMEOUT_SEC`（默认 600，官方称 3 小时内完成）、`TENCENT_TTS_POLL_INTERVAL_MS`（默认 3000）；`.env.example` 已同步（含申请入口注释）；`TTS_PROVIDER` 枚举中 tencent 位此前已预留，本次接线生效。
- **接线**：provider.factory 注入 TencentTtsProvider 并加 case "tencent"；pipeline.module 注册 provider。
- **无凭证验证方案**：本地腾讯模拟服务器（`%TEMP%\tencent-mock-server.mjs`，端口 **8793**：模拟 SDK HTTP 形态 X-TC-Action + `{"Response":{...}}` 信封；ffmpeg 生成 8s 16kHz mp3；固定字段触发错误路径 VoiceType=999001~999004；提供 GET /__inspect 请求日志）。
- 验收：server typecheck/lint/build 全绿（仅存量 worker.ts warning）；**适配器协议测试 9/9 PASS**（成功产物 ffprobe AAC/44.1kHz/单声道/m4a/约 8s、default 与 101008 音色映射、非法音色 ID、UnsupportedOperation.PkgExhausted、AuthFailure.SecretIdNotFound、Status=3 任务失败、轮询超时、网关不可达归一化）；**管线端到端 12/12 PASS**（专用 worker 以 TTS_PROVIDER=tencent 指向 mock：草稿 → 确认 → tts 自动完成 → 人声 AudioAsset ready/durationSec=8 → play-url 拉流 ffprobe AAC/44.1kHz/mono/m4a/8.0s → 清理；mock 日志证据 CreateTtsTaskx8 + DescribeTtsTaskStatusx21）。
- **上线待办**：用户开通腾讯云「语音合成」服务（注意音色计费差异，见官方购买指南）→ 在 CAM 创建 SecretId/SecretKey 自行写入生产 server/.env → 设 `TTS_PROVIDER=tencent` + `TENCENT_SECRET_ID` + `TENCENT_SECRET_KEY`（生产环境 TENCENT_TTS_ENDPOINT 留空走官方域名）→ 按需调整 TENCENT_TTS_VOICE_TYPE → 凭证就绪后做一次真实合成回归（当前生产 TTS_PROVIDER 仍为 aliyun，本次不改动）。

## 真实音乐厂商接入（MiniMax 音乐生成）—— ✅ 2026-10-01

- **选型与风险**：用户选定 MiniMax（保留 stable-audio 预留）。⚠️ 官方服务调整：2026-08-20 起付费音乐 API 不再面向新用户、免费接口已停服，**需历史付费账号凭证才能真实上线**。
- **新增适配器** [minimax-music.provider.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/providers/minimax-music.provider.ts)：`POST {MINIMAX_BASE_URL}/v1/music_generation`（Bearer Key），请求体 `{model, prompt, is_instrumental:true, output_format:"url", audio_setting:{sample_rate:44100, bitrate:128000, format:"mp3"}}`；成功判定 `base_resp.status_code=0 && data.status=2` → 取 `data.audio` URL（24h 有效）→ 下载 mp3。
- **循环拼接（用户决策）**：厂商单次生成时长有限而章节常 10-30 分钟，ffmpeg `-stream_loop -1 -t 目标时长` 无缝循环/裁剪至章节时长，结尾 3s 线性淡出 + 开头 0.5s 淡入弱化接缝 → 转码对齐「双声道/44.1kHz/AAC 128k m4a」（宪法 §7.9）→ ffprobe 取时长。
- **prompt 组装**：章节 musicTags 拼接助眠后缀（`{tags}，助眠氛围，舒缓平静，慢节奏，无歌词纯音乐背景`）；错误归一化中文提示含 status_code/status_msg/trace_id + 常见错误码映射（1002 限流/1004 鉴权/1008 余额/2013 参数/2049 无效 Key）。
- **env**：`MUSIC_PROVIDER` 枚举新增 `minimax`；新增 `MINIMAX_API_KEY`（minimax 时必填，zod refine fast-fail）、`MINIMAX_MUSIC_MODEL`（默认 music-3.0）、`MINIMAX_BASE_URL`（默认 https://api.minimaxi.com，可指向模拟服务器）、`MINIMAX_MUSIC_TIMEOUT_SEC`（默认 180s）；`.env.example` 已同步。
- 验收：server typecheck/lint/build 全绿（仅存量 worker.ts warning）；**适配器协议测试 12/12 PASS**（循环拼接 8s→25s、长于目标裁剪 5s、prompt/is_instrumental/audio_setting 协议字段、业务错误/无效 Key/网关不可达归一化）；**管线端到端 11/11 PASS**（worker 指向模拟服务器：music 完成 → BGM 资产 durationSec=30s 证明循环拼接 → 试听流 ffprobe AAC/44.1kHz/双声道/30.0s → 清理）。
- **上线待办**：MiniMax 历史付费账号 API Key 写入生产 env（MUSIC_PROVIDER=minimax + MINIMAX_API_KEY）；若拿不到则切换 Stable Audio（env 枚举已预留 stable-audio，需另写适配器）。

## Stable Audio 适配器准备（Stability AI Stable Audio 2.5）—— ✅ 2026-10-01

- **新增适配器** [stable-audio-music.provider.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/providers/stable-audio-music.provider.ts)：`POST {STABILITY_BASE_URL}/v2beta/audio/stable-audio-2/text-to-audio`——**multipart/form-data**（prompt/model/duration/output_format/steps/cfg_scale），`accept: audio/*` 直接收音频二进制（非 JSON 信封，与百炼/MiniMax 不同）；成功后 ffmpeg `-stream_loop -1 -t 目标` 循环拼接/裁剪至章节时长 → 转码对齐「双声道/44.1kHz/AAC 128k m4a」（宪法 §7.9）。
- **关键约束处理 — 仅支持英文 prompt**（422 invalid_language）：内置中文助眠标签→英文映射表（雨/海浪/森林/钢琴/篝火/溪流/风/虫鸣/雷/雪/风铃/白噪/古风），未命中标签不透传、fallback `calm ambient soundscape`；统一附加 deep sleep / loopable / no vocals 后缀。
- **时长与计费**：厂商单次上限 190s，请求时长 = min(章节目标, 190)，超出部分循环；20 credits（$0.20）/次与时长无关。
- **env**：新增 `STABILITY_API_KEY`（stable-audio 时 zod refine 必填）、`STABLE_AUDIO_MODEL`（默认 stable-audio-2.5）、`STABILITY_BASE_URL`（默认 https://api.stability.ai）、`STABLE_AUDIO_STEPS`（默认 8，2.5 范围 4-8）、`STABLE_AUDIO_CFG_SCALE`（默认 1）、`STABLE_AUDIO_TIMEOUT_SEC`（默认 300）；`.env.example` 已同步；工厂/模块已接线。
- 验收：server typecheck/lint/build 全绿（仅存量 worker.ts warning）；**适配器协议测试 13/13 PASS**（循环 8s→25s、上限压缩 duration=190→输出 200s、裁剪 5s、中文映射无中文透传、未命中 fallback、协议字段、业务错误 400/无效 Key 401/网关不可达归一化）；**管线端到端 11/11 PASS**（music 完成 → BGM 资产 30s → 试听流 AAC/44.1kHz/双声道 → 清理）。
- **发现的功能缺口**：`UpdateChapterConfigDto`（voiceId/musicTags）已定义但无任何 controller 使用，**章节 musicTags 与 voiceId 当前没有管理端写入入口**，实际 musicTags 始终为空（走 fallback）。下一步建议补「管理端章节配置接口」或让 draft 步骤 AI 返回建议 musicTags。
- **上线待办**：platform.stability.ai 注册（送 25 credits）→ 创建 API Key → 生产 env 设 MUSIC_PROVIDER=stable-audio + STABILITY_API_KEY；凭证就绪后做真实合成回归。

## 真实音乐厂商接入（腾讯云 MPS AIGC 音乐生成）—— ✅ 2026-10-01

- **选型**：用户从腾讯官方两条音乐生成路径中选定 **MPS 媒体处理 AIGC 聚合平台**（另一条 TokenHub 同步接口底层同为 MiniMax 模型且需单独凭证体系，弃用）。MPS 路径复用腾讯 TTS 已有 `TENCENT_SECRET_ID`/`TENCENT_SECRET_KEY`，聚合 MiniMaxMusic/GL/EL/Mureka 四家模型，env 可切换。协议经官方文档（cloud.tencent.com/document/product/862/132830 + 133520）与官方 SDK `tencentcloud-sdk-nodejs-mps@4.1.321` 类型定义双重实锤。
- **新增适配器** [tencent-music.provider.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/providers/tencent-music.provider.ts)：`CreateAigcAudioTask`（域名 mps.tencentcloudapi.com，Version 2019-06-12，TC3 签名由 SDK 完成）提交 `{ModelName, ModelVersion, SceneType:"music", Prompt, AdditionalParameters: JSON{"is_instrumental":true,"sample_rate":44100,"bitrate":256000}, ExtraParameters:{OutputAudioFormat:"mp3"}, Operator:"shenyou-pipeline"}` → 取 `TaskId` → 轮询 `DescribeAigcAudioTask`（**Status WAIT/RUN/DONE/FAIL**）：DONE 取 `AudioInfos[0].Url`（**12 小时有效**），FAIL 取 `Message`；下载 mp3 → ffmpeg `-stream_loop -1 -t 目标时长` 循环拼接/裁剪（0.5s 淡入 + 结尾 3s 淡出）→ 转码对齐「双声道/44.1kHz/AAC 128k m4a +faststart」（宪法 §7.9）→ ffprobe 取时长。
- **prompt 组装**：章节 musicTags 拼接助眠后缀（与 MiniMax 适配器同构）；官方 Prompt 上限 2000 字符且**支持中文**（官方示例「一首欢乐的歌」），无需语言映射表。
- **env**：`MUSIC_PROVIDER` 枚举新增 `tencent`；新增 `TENCENT_MUSIC_MODEL_NAME`（默认 MiniMaxMusic）、`TENCENT_MUSIC_MODEL_VERSION`（默认 2.6）、`TENCENT_MUSIC_ENDPOINT`（SDK endpoint 覆盖，仅本地模拟联调）、`TENCENT_MUSIC_TIMEOUT_SEC`（默认 600）、`TENCENT_MUSIC_POLL_INTERVAL_MS`（默认 5000，官方示例值）；zod refine：MUSIC_PROVIDER=tencent 时 TENCENT_SECRET_ID/SECRET_KEY 必填 fast-fail；`.env.example` 已同步（含 MPS 控制台开通入口与按首计费注释）。
- **接线**：provider.factory 注入 TencentMusicProvider 并加 case "tencent"；pipeline.module 注册 provider。
- **无凭证验证方案**：本地模拟服务器（`%TEMP%\tencent-music-mock-server.mjs`，端口 **8794**：模拟 X-TC-Action + `{"Response":{...}}` 信封；ffmpeg 生成 8s/40s 44.1kHz 双声道 mp3；固定 ModelVersion 触发错误路径 9.9-create-error/9.9-auth/9.9-fail/9.9-wait/9.9-long；GET /__inspect 请求日志）。
- 验收：server typecheck/lint/build 全绿（仅存量 worker.ts warning）；**适配器协议测试 9/9 PASS**（8s 样本循环拼接至 25s + ffprobe AAC/44.1kHz/双声道/m4a、协议字段断言 SceneType=music/MiniMaxMusic 2.6/is_instrumental/中文标签透传、40s 长素材裁剪至 25s、空标签 fallback、InvalidParameterValue 业务错误、AuthFailure.SecretIdNotFound 无效凭证、任务 FAIL、轮询超时、网关不可达归一化）；**管线端到端 11/11 PASS**（专用 worker 以 MUSIC_PROVIDER=tencent 指向 mock：music 完成 → BGM 资产 ready/durationSec=30s 证明循环拼接 → 试听流 ffprobe AAC/44.1kHz/双声道/30.0s → 清理）。
- **上线待办**：腾讯云控制台开通「媒体处理 MPS」服务（https://console.cloud.tencent.com/mps）→ 复用 CAM 已有 SecretId/SecretKey（或新建）写入生产 server/.env → 设 `MUSIC_PROVIDER=tencent`（生产环境 TENCENT_MUSIC_ENDPOINT 留空走官方域名）→ 凭证就绪后做一次真实生成回归。当前生产 MUSIC_PROVIDER 未改动（仍为 mock，按惯例不擅自切换）。
- **注意**：结果 URL 仅 12 小时有效，适配器在任务 DONE 后立即下载转存，无超时风险；MPS 计费按首，章节幂等键机制保持有效避免重复计费。
