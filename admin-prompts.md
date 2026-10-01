# 神游 App · 运营后台阶段提示词（阶段 A / B）

补齐 `apps/admin`（Vue3 + Vite + Element Plus）与配套管理端接口。这两个阶段接在 phase-prompts.md 的 8 阶段之后，编号为**阶段 A（后端补全）**与**阶段 B（前端建设）**。

> **背景审计结论（2026-09-29）**：admin 后端**写接口已完整**（创建旅程/章节/音频资产预签名直传/ready 回调、管线草稿触发-确认-驳回-重跑-状态-队列统计-死信列表），`User.role` 与 `AdminGuard` 已就绪。**缺口是：管理端无任何 `@Get` 读接口、无用户管理接口、无统计接口；`apps/admin` 仅有占位文件。**
>
> 因此顺序必须是 **A → B**：前端没有读接口就无法列出草稿旅程，也无法得知创建后的资产 ID。

## 已知项目约束（写提示词时需一并告知 AI）

- shared 包输出 **CJS**（`dist/index.js`），`exports` 仅暴露 `.`；Vite 消费需在 `vite.config.ts` 配置 `optimizeDeps.include` / `resolve.alias` 或用 `build` 产物 + `preserveSymlinks` 处理，避免 ESM/CJS 互操作报错。
- 根 `package.json` 是 `"type": "module"`；`apps/admin` 应为 ESM。
- 复用现有 `ErrorCode`（`@shenyou/shared`）与统一响应结构 `{ code, message, requestId, data }`（`TransformInterceptor` 包裹，错误由 `GlobalExceptionFilter` 归一化）。
- 现有写接口路径：`/admin/journeys`、`/admin/journeys/:id`、`/admin/journeys/:id/chapters`、`/admin/chapters/:chapterId/audio-assets`、`/admin/audio-assets/:assetId/ready`、`/admin/pipeline/**`。
- `.env.example` 位于 `apps/admin/.env.example`；前端需 `VITE_API_BASE_URL`。
- CORS 白名单来自 server env（`CORS_ORIGINS`），本地开发需把 admin dev server 源加入。

---

## 阶段 A · admin 后端补全（读接口 + 用户管理）

````text
【任务】补全服务端管理端接口缺口：新增读取类接口与用户管理接口。不修改任何已有写接口的路径与语义。

【背景】
现有 AdminController 只有写接口（POST/PATCH），没有任何 @Get。前端无法列出草稿旅程、无法查询章节详情与音频资产 ID、无法查看管线任务明细，也无法管理用户角色与订阅状态。管理员目前靠手写 SQL 提升角色/订阅。

【要求】

1. 旅程读取（AdminContentController 或扩展 AdminController，统一 /admin 前缀 + @UseGuards(JwtAuthGuard, AdminGuard)）
   - GET /admin/journeys
     · 查询参数：page（默认1）、pageSize（默认20，上限100）、keyword（标题/副标题模糊）、status（draft/reviewing/published/offline，可多值）、tag（可多值）
     · 返回：items + total + page + pageSize
     · **必须包含所有状态**（与用户侧 /journeys 只返回 published 的区别要明确）
     · 每项 select 显式字段：id/title/subtitle/coverUrl/tags/isFree/status/totalDurationSec/createdAt/updatedAt + _count.chapters，禁止 N+1
   - GET /admin/journeys/:id
     · 返回旅程全部字段 + 章节数组（按 index 升序）+ 每章音频资产摘要 + 该旅程的管线任务摘要
     · 用途：后台编辑页一次性拿到完整上下文

2. 章节读取
   - GET /admin/chapters/:id
     · 返回章节全字段（含 narrationText、draftStatus、draftHash、voiceId、musicTags、stops）
     · 附 audioAssets（含 id/objectKey/trackType/mixPreset/durationSec/sizeBytes/status）——**前端上传后需要资产 ID 才能调 ready 回调，这是关键缺口**
     · 附 pipelineJobs（step/status/contentHash/createdAt/updatedAt + 失败原因摘要字段若存在）

3. 音频资产读取
   - GET /admin/chapters/:chapterId/audio-assets —— 列出该章所有资产（按 trackType/mixPreset 分组视图所需字段平铺返回）

4. 用户管理（新建 AdminUsersController，路径 /admin/users）
   - GET /admin/users
     · 查询参数：page、pageSize（默认20/上限100）、keyword（phone/email/nickname 模糊）、role、subscriptionStatus
     · 返回：id/phone/email/nickname/role/subscriptionStatus/createdAt + 权益摘要（entitlement.status/environment/expirationAt，可为 null）
     · 仅 admin 可见；**响应中禁止出现 passwordHash 与任何 token 字段**
   - PATCH /admin/users/:id/role —— 修改 role（仅允许 user/admin 两个取值，用 shared 常量校验）
   - PATCH /admin/users/:id/subscription —— 修改 subscriptionStatus（free/trial/active/expired/canceled）
   - 两条写接口均需：禁止管理员修改自己的 role（防止误操作把自己降级，返回业务错误码）；变更写 pino 结构化审计日志（adminUserId、targetUserId、field、before、after）

5. 分页与响应规范
   - 分页参数用 class-validator DTO 校验（@Type(() => Number)、@IsInt、@Min、@Max）
   - 所有响应走既有 TransformInterceptor，无新格式

6. DTO 与 shared
   - 新增 admin 查询 DTO（AdminJourneyQueryDto、AdminUserQueryDto、UpdateUserRoleDto、UpdateUserSubscriptionDto）
   - 若需新增错误码（如「不能修改自己的角色」）→ 加到 packages/shared/src/error-codes.ts 的 1xxx 段并 rebuild shared
   - 列表响应类型建议在 packages/shared 中定义 schema（admin 与前端共用），保持单一事实来源

7. 统计接口：**本阶段不做**。功能设计时预留 controller 位置与 TODO 注释即可。

【禁止】
- 不改动任何已有写接口的路径/请求体/响应语义
- 不在 controller 内写业务逻辑（分层见 CLAUDE.md §4）
- 不新增 Prisma 表（role/subscriptionStatus/entitlement 均已存在）
- 不返回 passwordHash、tokenHash、refresh token 等敏感字段

【验收】按顺序 curl 全流程：
1. 管理员登录 → GET /admin/journeys 能看到**草稿状态**旅程（用户侧看不到，对比验证）
2. keyword 与 status 筛选、分页边界（pageSize=200 被拒绝或裁剪为 100）生效
3. GET /admin/journeys/:id 返回章节与管线摘要；GET /admin/chapters/:id 返回 audioAssets 的 id
4. 用返回的资产 id 走「创建资产 → 真机 PUT → ready 回调」链路，全程无需手写 SQL 或从日志捞 ID
5. GET /admin/users 列表正常，响应中**无** passwordHash/token 字段（逐字段核对）
6. PATCH role/subscription 生效；管理员改自己 role → 业务错误码；普通用户访问 /admin/users → 403（1003）
7. pino 日志中可见审计字段（adminUserId/targetUserId/before/after）
8. pnpm -r typecheck、pnpm -r lint 全绿
````

**验收清单**
- [ ] 草稿旅程可被管理端列出，用户侧不可见
- [ ] 上传链路全程可从前端拿到资产 ID（不再依赖日志）
- [ ] 用户列表无敏感字段泄露
- [ ] 审计日志可查
- [ ] 全仓 typecheck / lint 通过

---

## 阶段 B · apps/admin 前端（Vue3 + Vite + Element Plus）

````text
【任务】在 apps/admin 初始化 Vue3 运营后台前端，并实现四个功能模块。

【技术要求】
1. 脚手架：Vite 7 + Vue 3.5（<script setup> + TS strict）+ Vue Router 4 + Pinia + Element Plus + axios。
   · Vue SFC 统一 Composition API；不使用 Options API
   · Element Plus 暗色主题（class="dark"），整体观感与 App 的深色基调协调（深色底、克制点缀色）
2. shared 复用（关键）：
   · 引用 @shenyou/shared 的 ErrorCode、枚举常量、zod schema 与本阶段 A 新增的管理端响应类型——不要在前端重复定义这些常量
   · shared 是 CJS 产物：在 vite.config.ts 中通过 resolve.alias 指向 packages/shared/src（推荐，获得源码级 HMR）或 optimizeDeps.include；**必须实测 dev 与 build 两条链路都能跑通**，并在 README 记录所选方案
   · 由于根 package.json 为 "type": "module"，确认构建产物格式无冲突
3. 环境变量：VITE_API_BASE_URL（.env.example 补充）；禁止硬编码地址
4. 代码组织（按功能）：
   src/
   ├─ api/         # axios 实例（request.ts）+ 各模块请求函数
   ├─ router/      # 路由 + 全局前置守卫（权限）
   ├─ stores/      # Pinia：auth（token 持久化）、ui
   ├─ layouts/     # 主布局（侧边导航 + 顶栏 + 用户菜单）
   ├─ views/       # 页面
   ├─ components/  # 复用组件
   ├─ utils/       # 工具（含统一错误提示）
   └─ types/       # 仅本项目特有类型（通用类型来自 shared）
5. axios 封装：请求拦截注入 Authorization: Bearer <access token>；响应拦截解析 { code, message, requestId, data }；按 ErrorCode 分段映射中文提示（ElMessage）；401 → 清登录态并跳登录页；403 → 提示无权限；错误必须展示 requestId 便于排查
6. token 存储：localStorage（Web 端可接受，与移动端 expo-secure-store 策略不同）——需在代码注释中说明这是 Web 端既定取舍
7. 登录页：对接 POST /auth/login（account + password）；登录成功后 GET /users/me 校验角色，**非 admin 直接拒绝进入并给出明确提示**（前端守卫 + 后端 403 双重保险）
8. 路由守卫：未登录跳 /login；非 admin 跳 403 页

【功能模块】

模块 1 · 旅程管理（最先做，打通链路）
- 列表页：表格 + 分页 + keyword 搜索 + status/tag 筛选；列含标题、状态标签（草稿/审核中/已发布/已下架，四色区分）、章节数、是否免费、总时长、更新时间；行操作：编辑/发布/下架/删除（删除需二次确认）
- 编辑页（新建 + 编辑复用）：
  · 基础信息表单（title/subtitle/tags 多标签输入/isFree 开关/coverUrl）
  · **封面图上传**：走服务端预签名直传（如阶段 A 未提供封面直传接口，先支持填 URL 并标注 TODO）
  · 章节管理：章节列表（可拖拽排序 index）、新增/编辑章节、**stops 站点时间轴编辑器**（每站 timeSec/title/subtitle，支持增删改，时间用秒数输入并展示 mm:ss）
  · 发布/下架操作（状态流转，含前置校验提示：无章节或无 ready 音频时不允许发布）

模块 2 · AI 管线控制台（核心价值）
- 章节详情页内含管线面板：
  · 展示章节的 narrationText（可编辑）+ draftStatus 状态标签
  · 操作按钮：生成草稿（POST .../draft）、确认草稿（.../draft/confirm）、驳回（.../draft/reject）
  · 步骤进度：按 PipelineStep 顺序展示 草稿→TTS→音乐→混音→上传 的每步状态（pending/运行中/完成/失败），运行中轮询 GET .../status（建议 3-5s 间隔，页面卸载即停）
  · 失败步骤：「重跑此步」按钮（POST .../rerun），展示失败原因与 contentHash
  · 队列概览页：GET /admin/pipeline/queue/stats 展示各状态计数；GET /admin/pipeline/dead-letters 展示死信任务并支持重跑
  · **试听**：资产 ready 后，用 audio 元素播放（播放地址请先用后端签发的可访问 URL；若签名 URL 与来源绑定，标注 TODO 并说明取用方式）——禁止把 objectKey 直接拼成 URL
- 审核动线设计：草稿列表集中展示待确认章节，减少跳转来回

模块 3 · 用户与订阅管理
- 用户列表：分页 + keyword 搜索 + role/subscriptionStatus 筛选；列含账号（手机/邮箱）、昵称、角色、订阅状态、权益到期时间、注册时间
- 行操作：修改角色（下拉，二次确认）、修改订阅状态（下拉，二次确认）；**对自己所在行禁用角色修改**并给出提示
- 前端不给「查看密码」等入口；不展示任何敏感字段

模块 4 · 数据看板
- **本阶段只做占位页**：路由 /dashboard 存在，展示「即将上线」的空状态与规划说明（播放量、完播率、订阅转化、热门场景），不接任何接口。避免阻塞 A/B 阶段交付。

【UI 规范】
- 表格/表单用 Element Plus 默认组件，不引入额外 UI 库
- 状态标签统一定义一处（映射 status → 文案 + 颜色），草稿灰、审核中黄、已发布绿、已下架红
- 危险操作（下架/删除/降级角色）一律二次确认（ElMessageBox）
- 空状态、加载态、错误态齐全（表格 loading、空列表 ElEmpty、请求失败展示 requestId）
- 所有面向用户的文案为中文

【禁止】
- 不在前端重复定义 shared 已有的枚举/错误码
- 不硬编码 API 地址、不在代码中写死 token
- 不用 any（tsconfig strict）；不用 @ts-ignore
- 不实现阶段 A 未提供的接口（缺的写 TODO 并在 TASKS.md 记录）
- 不擅自引入状态持久化以外的大型依赖（如需新增依赖按 CLAUDE.md §9.3 报备）

【验收】
1. pnpm --filter @shenyou/admin typecheck 与 lint 全绿；pnpm --filter @shenyou/admin build 成功
2. dev 与 build 两条链路都能正确消费 @shenyou/shared（实测并记录方案）
3. 完整走通：登录（非 admin 被拒）→ 新建旅程 → 添加章节与 stops → 上传音频（预签名直传）→ ready → 触发 AI 草稿 → 确认 → 观察管线跑完 → 试听 → 发布 → 在 App 端可见
4. 用户管理：改角色/订阅状态生效；对自己禁用角色修改
5. 断网/接口报错时展示中文提示与 requestId，不白屏
6. 权限：越权访问受保护路由被守卫拦截
````

**验收清单**
- [ ] 后台可独立完成「从 0 到发布一条旅程」全流程（不依赖 SQL、不依赖日志捞 ID）
- [ ] 管线控制台可触发、观察、重跑、查看死信
- [ ] 用户角色/订阅可在界面维护，敏感字段不泄露
- [ ] dev + build 双链路消费 shared 正常
- [ ] typecheck / lint / build 全绿

---

## 阶段 B 完成后建议补做（不进本轮）

- **数据看板真实接口**：播放量、完播率（`PlaybackHistory` 聚合）、订阅转化（`Entitlement` + `BillingEventLog`）、热门场景（Journey 维度播放排行）。需新写统计 service，注意大表聚合要加索引与结果缓存。
- **审核角色细分**：当前 `AdminGuard` 只校验 `role = 'admin'`；若要内容运营与审核分离，需扩充角色枚举（TASKS.md 已记录此遗留项）。
- **封面图直传接口**：对齐音频资产的预签名直传方案。
- **操作审计页**：把阶段 A 的审计日志做成可查询界面。
