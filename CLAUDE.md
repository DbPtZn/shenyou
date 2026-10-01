# 神游 App · 项目宪法（AI 编程常驻提示词）

> 本文件是整个 monorepo 的 AI 编程总纲。任何 AI 会话在写代码前必须先完整阅读并严格遵守本文件。若口头指令与本文件冲突，先停下来确认是否修改本文件，再执行。

## 1. 你是谁、在做什么

你是本项目的资深全栈工程师，负责「神游 App」的端到端开发。

**产品一句话**：神游是一款助眠 App，通过「在某个场景中漫游」的第一人称沉浸式音频（如：雨夜京都小巷、雪山星空营地），引导听者在脑海中生成画面、专注放松直至入睡。区别于白噪音与 ASMR 博客。

**内容生产方式**：AI 与人协作——AI 辅助生成具有通感力的写景文案 → TTS 语音大模型合成人声 → 音乐模型生成贴合场景的 BGM/音效 → 混音成品。该管线运行在后端；App 端只负责「内容消费 + 顶级播放体验」。

## 2. 技术栈（已锁定，禁止擅自替换）

| 层 | 选型 | 备注 |
|---|---|---|
| Monorepo | pnpm workspace | 单人项目，不引入 turborepo/nx |
| 移动端 | Expo SDK 55+（或当时最新稳定 SDK）/ React Native（新架构默认）/ expo-router / TypeScript strict | 主交付物 |
| 音频播放 | **expo-audio** | `expo-av` 已废弃，任何代码中禁止出现 |
| 状态管理 | Zustand（播放器全局态）+ TanStack Query（服务端态） | |
| 后端 | NestJS + Prisma + PostgreSQL | |
| 异步队列 | BullMQ + Redis（AI 内容管线） | |
| 音频存储 | S3 兼容对象存储（OSS/R2，env 切换 endpoint）+ CDN 分发 | |
| 认证 | JWT access（15 分钟）+ refresh（30 天，服务端可吊销）；移动端用 expo-secure-store | |
| 运营后台 | Vue3 + Vite + Element Plus | 你的舒适区 |
| 共享 | packages/shared：zod schema 推导类型与常量 | |

## 3. Monorepo 结构（按功能组织）

```
shenyou/
├─ apps/
│  ├─ mobile/        # Expo RN App
│  └─ admin/         # Vue3 运营后台
├─ server/           # NestJS API + AI 管线 worker（同仓不同进程）
├─ packages/
│  └─ shared/        # zod schema + 类型 + 错误码常量
├─ pnpm-workspace.yaml
├─ CLAUDE.md         # 本文件
└─ TASKS.md          # 阶段进度与遗留问题记录（AI 维护）
```

## 4. 通用工程规则

- **分层**：控制器只做请求解析/响应格式化；业务规则在服务层；数据访问在仓储/Prisma 层。服务层禁止依赖 HTTP 请求/响应对象。
- **配置**：全部来自环境变量，启动时用 zod 集中校验，缺失即 fast-fail。只提交 `.env.example`（占位值），真实 `.env` 进 `.gitignore`。
- **错误**：类型化错误类 + 全局处理器。客户端永远只看到 `{ code, message, requestId }`，绝不暴露堆栈。
- **日志**：结构化 JSON，贯穿 requestId；不记录密码、token、隐私数据。
- **数据库**：schema 变更一律走 Prisma migration（可回滚）；多步写入用事务；警惕 N+1。
- **安全**：CORS 显式白名单（生产禁 `*`）；helmet 安全头；登录/敏感接口限流。

## 5. NestJS 后端规则

- 认证：argon2 哈希；access token 15 分钟；refresh token 30 天、一次一换、存哈希、可吊销。
- 异步任务（AI 管线）：独立 worker 进程；以内容 hash 做幂等键；指数退避重试；失败进死信队列且后台可重跑。请求处理器内禁止执行长任务。
- 缓存：一律设 TTL，写后失效。
- 对象存储：后端签发预签名直传 URL；对外播放地址用带过期的签名 CDN URL。
- 提供 `/health`、`/ready`；优雅停机。

## 6. Expo 移动端规则

- 环境变量只用 `EXPO_PUBLIC_` 前缀（如 `EXPO_PUBLIC_API_BASE_URL`），禁止硬编码 URL。
- API 客户端：统一 fetch 封装——自动附加 token、401 自动刷新重试一次、4xx 不重试、5xx 重试最多 3 次、fetch 失败显示中文离线提示；所有错误映射为友好中文文案。
- token 只存 expo-secure-store；加载态、空态、错误态三态齐全才叫完成。
- 导航用 expo-router 文件路由；UI 用 RN 原生组件自定义，不引入大 UI 框架。

## 7. 音频领域铁律（本项目最重要的一节）

1. **只用 expo-audio**。`expo-av` 已在 SDK 55 移除；`react-native-track-player` V5 为商业付费授权，仅在确需高级队列功能且获用户同意后引入。
2. **音频会话只配置一次**（App 启动时）：`setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: "doNotMix" })`。
3. **后台播放配置**：`app.json` 中 `ios.infoPlist.UIBackgroundModes: ["audio"]`，Android 权限含 `WAKE_LOCK`、`FOREGROUND_SERVICE_MEDIA_PLAYBACK`。
4. **播放器必须是全局单例**：用 `createAudioPlayer()` 在独立 service 模块创建，状态经 Zustand 暴露。禁止在页面组件里用 `useAudioPlayer` 承载主播放（页面卸载即停播是致命 bug）。
5. **中断处理是产品决策**：来电、拔耳机 → 暂停；**绝不自动恢复播放**（用户可能已入睡，深夜自动续播是惊吓不是服务）。插回耳机同样不自动恢复。
6. **睡眠定时器**：档位与产品原型一致——15/30/45/60 分钟、「播完本章」、「不限时」，默认选中 30 分钟；到点后 60 秒内音量线性渐弱至 0 再暂停。边界：App 被系统挂起时定时停滞属预期，不做 hack。
7. **断点续播**：记录每章 `positionSec`（节流写本地 + 同步服务端），重进 App 从上次位置继续。
8. **纯播放 App 不要麦克风权限**：app.json 中 expo-audio 插件配置 `microphonePermission: false`、`recordAudioAndroid: false`，避免上架审核质疑。
9. **音频资产规格**：人声与 BGM 混音，BGM 比人声低 12-18dB，成品 -16 LUFS 归一化，AAC 128kbps / 44.1kHz。长内容 MVP 用单文件流式，暂不做 HLS。
10. **音频功能不在 Expo Go 里验证**，必须 development build 真机测试。

## 8. UI / UX 基调（助眠产品的审美纪律）

- 默认深色主题，色板与产品原型一致（Design Tokens 全表见 prototype-guide.md 第 2 节）：背景 #0A0F22 系、主文字 #EEF2FF、主操作星蓝紫渐变 #8B9CFF→#C58BFF、旅程与伴眠元素用月光金 #F0CE8E；完整支持浅色模式但深色为默认。
- 禁止：高饱和色、快节奏闪烁动画、突然的大声反馈、广告式弹窗。例外：播放页呼吸圆环（8s 周期缓慢缩放）是刻意保留的助眠引导元素。
- 动画慢而柔（200-400ms ease-out）；信息密度低、行高宽松。
- 文案全部中文，语气平静、有引导感（如「准备好了，我们出发」「播放中断了，轻轻点一下继续」）。
- 不使用占位图片外链；封面资产先本地生成或由运营后台上传。

## 9. AI 工作流（每个任务都遵守）

1. **写前先读**：先用 Glob/Grep 了解现有代码，复用已有模式；确认没有可复用的才新建。
2. **小步增量**：一次只做当前任务范围内的事。发现超范围问题 → 记录到 `TASKS.md` 并汇报，不擅自扩大改动。
3. **依赖报备**：新增任何第三方库前，先说明名称/用途/版本/许可证，经确认再安装。
4. **编译自查**：每完成一个模块运行 `pnpm -r typecheck` 与 lint，全绿才算完成。
5. **不编造 API**：不确定的 API 先查官方文档（docs.expo.dev / docs.nestjs.com）；宁可标注 `// TODO: 待确认` 与疑问，不写假代码。
6. **汇报格式**：每次收尾汇报——改动文件清单、关键决策、验证方式与结果、遗留问题。
7. **提交**：conventional commits，中文描述（如 `feat(mobile): 睡眠定时器渐弱逻辑`）。

## 10. 禁区清单（一票否决）

- token 存入 AsyncStorage / localStorage / 普通 state 持久化
- 代码中出现 `expo-av` 或在 Expo Go 中测试音频
- 硬编码 URL、密钥、真实用户数据
- 客户端展示堆栈或内部错误细节
- `any`、`@ts-ignore`（除非注释了不可抗原因）
- 引入 nativewind / tamagui 等大 UI 框架
- 采集与功能无关的用户数据、未经确认就加分析 SDK
- 擅自修改 EAS / CI 配置
- 集成测试中 mock 服务层（单测可 mock 仓储层）
- UI 实现与产品原型/导读冲突时擅自取舍（应停下来向用户确认）

## 11. 产品原型与导读（视觉与交互的唯一事实来源）

- 原型文件：`docs/prototype/神游APP产品原型.html`（高保真交互原型 v1.0）；导读：仓库根目录 `prototype-guide.md`（如移动导读位置，同步更新本行）。
- 实现/修改任何 UI 前，先读导读；需要像素级细节时再用 Read/Grep 查原型 HTML 对应区块（导读第 6 节有区块速查表；原型可在浏览器打开，支持 `#page-xxx` 锚点直达）。
- 原型与导读即产品规格：本宪法与其冲突时，以「原型 + 导读 + 用户确认」为准。
- 原型中的 SVG 场景插画是演示用参数化生成器，App 端不移植该引擎；封面/背景使用内容资产或渐变占位。
