---
name: pipeline-provider-integration
description: 指导向内容管线接入真实 TTS 或音乐厂商，将 mock provider 替换为真实适配器。用于新增 TTS/音乐 provider、厂商协议联调、凭证切换或跑通管线新步骤。不用于与厂商接入无关的功能开发。
---

# 内容管线真实厂商接入

把一个新的真实 AI 厂商（TTS 或音乐）接入 server 内容管线。严格按顺序执行；已在百炼 TTS、MiniMax、Stable Audio 三次接入中验证。

## 1. 协议调研（动手写代码前必须完成）

1. 查官方 API 文档，逐项确认并记录：
   - 完整端点 URL、HTTP 方法
   - 鉴权方式（Bearer / 自定义头 / 签名）
   - 请求格式：JSON 信封还是 multipart/form-data
   - 响应形态：JSON 带下载 URL（留意有效期）、音频二进制直返、还是 hex/base64 内联
   - 单次生成时长上限、输出编码格式、**语言限制**（如仅英文）
   - 计费口径（按次 / 按时长 / 按字符）
2. 交叉验证：优先官方 OpenAPI 规范或官方 SDK / ComfyUI 节点源码，不要只信文档页面文字。
3. 文档站是 SPA、WebFetch 抓不到正文时：
   - 从页面 JS bundle 中提取端点字符串与 spec 地址（如 `VITE_REST_API_SPEC_URL`）
   - 直接试 spec 端点，如 `https://api.stability.ai/v2alpha/openapi`
4. 发现服务可用性风险（如厂商已停止对新用户开放）时，**立即停下向用户汇报**，不要继续写无法上线的代码。

## 2. env 配置（[env.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/config/env.ts)）

1. 先在对应枚举加值：`TTS_PROVIDER` 或 `MUSIC_PROVIDER`。
2. 新增厂商变量，命名以厂商为前缀：
   - `<VENDOR>_API_KEY`：必须 `z.string().optional()`（无凭证开发期）
   - 模型名、网关 BASE_URL（`z.string().url()`，默认生产域名）、超时秒数，按需加步数/CFG 等模型参数
3. 在 schema 链尾追加 `.refine`：`PROVIDER=x 时 KEY 必填`，message 中文、`path` 指向 KEY 字段 —— 启动 fast-fail，避免管线跑到该步骤才报错。
4. 同步 [.env.example](file:///c:/Users/26184/Desktop/shenyou/server/.env.example)，注释写明获取 Key 的控制台入口与计费。

## 3. 适配器实现（server/src/pipeline/providers/<vendor>-*.provider.ts）

1. 实现 [pipeline.types.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/pipeline.types.ts) 的 `TtsProvider` 或 `MusicProvider` 接口；`readonly name` 与枚举值一致；构造函数 `@Inject(ENV) private readonly env: Env`。
2. 标准流程：请求厂商 → 取音频（下载 URL / 解析 hex）→ ffmpeg 处理 → ffprobe 取时长。
3. ffmpeg 输出规格必须对齐宪法 §7.9：
   - TTS：`-ar 44100 -ac 1 -c:a aac -b:a 128k`，m4a 容器加 `-movflags +faststart`
   - 音乐：双声道（`-ac 2`），其余同上
4. 音乐循环（章节常 10-30 分钟，厂商单次有时长上限）：
   `-stream_loop -1 -i 素材 -t 章节目标时长`，叠加开头淡入（约 0.5s）与结尾线性淡出（约 3s）。
5. 请求时长策略：`min(章节目标, 厂商上限)`；目标小于上限时直接生成目标长度。
6. 语言限制：厂商不支持中文时，在适配器内置「中文标签 → 目标语言」映射表，未命中标签不透传并 fallback 通用氛围 prompt。
7. 错误处理全部归一化中文：HTTP 状态 + 厂商错误码/错误名 + 错误详情 + 请求 ID（request_id / trace_id / id）；请求与下载都用 `AbortController` 做超时；临时文件在 `finally` 中清理，产物文件在 catch 中清理。

## 4. 接线

1. [provider.factory.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/providers/provider.factory.ts)：import 适配器 → 构造函数注入 → switch 增加 case。
2. [pipeline.module.ts](file:///c:/Users/26184/Desktop/shenyou/server/src/pipeline/pipeline.module.ts)：providers 数组注册。
3. 若发现承载字段无写入入口（DTO 已定义但无 controller 使用），不要自行扩大改动，记录为功能缺口写入 TASKS.md 并向用户汇报。

## 5. 静态验收

在 server 目录依次执行：`pnpm typecheck`、`pnpm lint`、`pnpm build`。存量 warning 可接受，新增 error 必须清零。

## 6. 无凭证验证：本地模拟服务器

用户暂无凭证时，在 `%TEMP%` 写 `<vendor>-mock-server.mjs`：

1. 独立端口（已占用：8790 dashscope / 8791 minimax / 8792 stable-audio，新厂商顺延）。
2. 启动时用 ffmpeg 生成**短于目标时长**的样本（如 8s mp3），用于验证循环拼接。
3. 实现与官方一致的成功/错误响应形态；校验 Bearer Key、必填字段、语言限制；提供错误触发路径。
4. 提供 `GET /__inspect` 返回最后一次请求体，供协议断言使用。
5. 错误触发不要依赖会被适配器映射/丢弃的标签内容，优先用固定字段值（如 `duration=13`）触发。

## 7. 适配器协议测试

在 `%TEMP%` 写测试脚本打模拟服务器，至少覆盖：

- 成功路径 + ffprobe 验证完整规格（编码/采样率/声道/容器）
- 循环拼接（8s 样本 → 25s 目标）、超上限（请求压到上限、输出仍为章节时长）、长素材裁剪
- `/__inspect` 断言请求协议字段、语言映射结果（无中文透传）、未命中 fallback
- 错误路径：厂商业务错误、无效 Key（401）、网关不可达；可选超时

Windows 注意事项：

- ESM 脚本动态 import server/dist 时，绝对路径需用 `pathToFileURL(...).href`
- `%TEMP%` 下脚本没有项目 node_modules，不能 import dotenv，需手动读 .env 逐行注入 `process.env`

## 8. 管线端到端验证

1. 启动专用 worker（后台）：用环境变量覆盖指向模拟服务器，例如
   PowerShell 中 `$env:MUSIC_PROVIDER="..."; $env:<VENDOR>_API_KEY="test-key"; $env:<VENDOR>_BASE_URL="http://localhost:PORT"; node dist/worker.js`
2. e2e 脚本流程：管理员登录 → 建旅程 → 建章节 → POST draft → 轮询 draft completed → POST confirm → 轮询目标步骤 completed → 查章节详情验证 AudioAsset（trackType/status/durationSec）→ 管理端 play-url 拉流 ffprobe 验证规格 → DELETE 旅程清理。
3. NestJS `@Post` 默认返回 **201** 不是 200，断言两者都接受。
4. 结束后必须停掉专用 worker 与模拟服务器。

## 9. 收尾

1. 在 [TASKS.md](file:///c:/Users/26184/Desktop/shenyou/TASKS.md) 追加段落：选型与风险、交付文件、协议要点、验收记录（静态/协议测试/e2e 的通过数）、发现的缺口、上线待办。
2. 向用户汇报：交付清单、验收结果、上线步骤（注册 → 创建 Key → 生产 env 切换 PROVIDER → 真实合成回归）。
3. 按用户工作习惯，完成后停下等指示，不主动进入下一任务。

## 关键坑位速查

- 创建/更新章节 DTO 不含 musicTags/voiceId；写入前先 grep 确认字段真实入口，别假设 DTO 全字段可写。
- 中文标签映射注意误匹配（如「风格」含「风」会命中风/天气映射），测试用无关造词验证 fallback。
- provider 是适配器接口隔离 + env 选择，禁止在 worker 里写厂商判断分支。
- 请求处理器只投递任务不执行管线；worker 才是调用 provider 的地方。
- 每次真实厂商调用都花钱：幂等键（章节 ID + 步骤 + 内容 hash）必须保持有效，测试脚本只跑必要次数。
