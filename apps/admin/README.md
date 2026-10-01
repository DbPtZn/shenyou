# @shenyou/admin · 运营后台

Vue 3 + Vite + Element Plus（暗色主题）的 Web 运营后台，覆盖旅程管理、AI 管线控制台、用户与订阅管理、数据看板（占位）。

## 常用命令

```bash
pnpm --filter @shenyou/admin dev        # 开发服务器（固定端口 5174，strictPort）
pnpm --filter @shenyou/admin typecheck  # vue-tsc --noEmit
pnpm --filter @shenyou/admin lint       # eslint
pnpm --filter @shenyou/admin build      # 产物输出 dist/
```

开发前准备：

1. 启动基础设施：`pnpm db:up`（postgres 5432 / redis 6380 / RustFS 9000）。
2. 启动后端：`pnpm --filter @shenyou/server start:dev`（:3000）。
3. 本目录 `.env.development` 配置 `VITE_API_BASE_URL=http://localhost:3000`；后端 `CORS_ORIGINS` 需包含 `http://localhost:5174`。
4. 浏览器访问 http://localhost:5174 ，仅 `role=admin` 的账号可进入（登录后探测 `GET /admin/journeys` 判定，非管理员拒绝并登出）。

## @shenyou/shared 消费方案（dev / build 双链路）

**当前采用：vite resolve.alias 直接指向 shared 源码。**

```ts
// vite.config.ts
resolve: {
  alias: {
    "@shenyou/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
  },
},
```

- dev 链路：Vite dev server 直接编译 shared 的 TS 源码，改 shared 无需重新 build，HMR 即时生效。
- build 链路：`vite build`（Rollup）同样经 alias 打包源码，`vue-tsc` 类型检查走 tsconfig paths 同源解析。
- 双链路均已实测通过（2026-09-30）：`typecheck` / `lint` / `build` 全绿，dev 页面运行正常。

**对比方案（未采用）**：shared 先 `pnpm build` 产出 `dist/`（CJS + d.ts）再按包入口消费——server（NestJS CJS）正是这种方式。admin 侧选源码 alias 的原因是免去「改 shared → 手动 rebuild → 前端才生效」的中间环节；代价是 shared 的 TS 严格配置由 admin 的 tsconfig 继承覆盖（`tsconfig.base.json` 为共同基线，无冲突）。

> 注意：`@shenyou/shared` 在 package.json 中仍以 `workspace:*` 声明依赖，保证 pnpm 链接与类型解析正常；alias 只在 Vite 运行时/打包时接管模块解析。

## 关键实现说明

- **统一响应信封**：axios 响应拦截器解包 `{ code, message, requestId, data }`；业务错误按 ErrorCode 分段映射中文提示并附 requestId；401 自动刷新（并发去重）重放一次，失败清空会话跳登录；403 提示并登出。
- **管理员判定**：`/users/me` 与 JWT payload 均不含 role，登录后用裸 axios 探测 `GET /admin/journeys?pageSize=1`（成功即管理员），前端路由守卫 + 后端 AdminGuard 双重保险。
- **音频上传**：预签名直传三段式（创建资产拿 uploadUrl → 裸 axios PUT 直传 RustFS 带进度 → ready 回调）；时长用 HTMLAudioElement 探测，失败转人工输入。
- **管理端试听**：`GET /admin/audio-assets/:assetId/play-url` 签发 HMAC 签名播放 URL（绑定 objectKey+expires+userId），前端不拼 objectKey。
- **暗色主题**：`App.vue` 内 `ElConfigProvider`（组件级类型收窄绕过 element-plus 2.11 locale 类型声明 bug）+ `styles/main.css` 变量覆盖。
- **token 存储**：localStorage（Web 端既定取舍，XSS 面由全局转义与 CSP 待办兜底，见 `src/api/request.ts` 注释）。
