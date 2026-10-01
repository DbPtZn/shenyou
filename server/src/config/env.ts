import { z } from "zod";

/**
 * 环境变量集中校验（CLAUDE.md §4）：启动时用 zod 校验，缺失/非法即 fast-fail。
 * 新增变量：先改这里，再补 .env.example。
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL 不能为空"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET 至少 32 个字符"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET 至少 32 个字符"),
  /** access token 有效期（秒），默认 15 分钟 */
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
  /** refresh token 有效期（秒），默认 30 天 */
  JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive().default(2592000),
  /** CORS 显式白名单，逗号分隔（生产禁止 *） */
  CORS_ORIGINS: z
    .string()
    .min(1, "CORS_ORIGINS 不能为空")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  // —— 异步队列（AI 内容管线）——
  REDIS_URL: z.string().min(1, "REDIS_URL 不能为空"),
  /** BullMQ 并发 worker 数 */
  PIPELINE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  /** 管线任务最大重试次数 */
  PIPELINE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // —— AI 厂商选择（先 mock 打通全链路，真实厂商后续接入）——
  TTS_PROVIDER: z.enum(["mock", "aliyun", "tencent"]).default("mock"),
  MUSIC_PROVIDER: z.enum(["mock", "minimax", "stable-audio", "tencent"]).default("mock"),
  /** Mock TTS 生成音频的目标时长（秒），用于联调 */
  MOCK_TTS_DURATION_SEC: z.coerce.number().int().positive().default(30),
  /** Mock 音乐生成音频的目标时长（秒） */
  MOCK_MUSIC_DURATION_SEC: z.coerce.number().int().positive().default(30),
  // —— 阿里云百炼 CosyVoice（TTS_PROVIDER=aliyun 时启用）——
  /** 百炼 API Key（sk- 前缀，仅服务端持有）；TTS_PROVIDER=aliyun 时必填 */
  DASHSCOPE_API_KEY: z.string().optional(),
  /** CosyVoice 模型（音色必须与模型匹配，见百炼音色列表） */
  ALIYUN_TTS_MODEL: z.string().default("cosyvoice-v3-flash"),
  /** 章节 voiceId="default" 时映射的真实音色 */
  ALIYUN_TTS_VOICE: z.string().default("longanyang"),
  /**
   * 百炼网关地址：默认北京地域公共域名；
   * 可指向业务空间专属域名或本地模拟服务器（无凭证联调）。
   */
  DASHSCOPE_BASE_URL: z.string().url().default("https://dashscope.aliyuncs.com"),
  /** TTS HTTP 请求/下载超时（秒） */
  ALIYUN_TTS_TIMEOUT_SEC: z.coerce.number().int().positive().default(60),
  // —— 腾讯云语音合成（TTS_PROVIDER=tencent 时启用，官方 SDK 处理 TC3 签名）——
  /** 腾讯云 SecretId（仅服务端持有，https://console.cloud.tencent.com/cam/capi） */
  TENCENT_SECRET_ID: z.string().optional(),
  /** 腾讯云 SecretKey（仅服务端持有） */
  TENCENT_SECRET_KEY: z.string().optional(),
  /** 长文本语音合成地域（长文本接口 Region 非必填，SDK 默认取广州） */
  TENCENT_TTS_REGION: z.string().default("ap-guangzhou"),
  /** 默认音色 ID：10510000 智逍遥（旁白阅读风格男声，官方长文本示例同款） */
  TENCENT_TTS_VOICE_TYPE: z.coerce.number().int().positive().default(10510000),
  /** SDK HTTP endpoint 覆盖（仅本地模拟联调用，如 localhost:8793），留空走官方域名 */
  TENCENT_TTS_ENDPOINT: z.string().optional(),
  /** 合成/下载整体超时（秒），长文本官方称 3 小时内完成，默认 600 */
  TENCENT_TTS_TIMEOUT_SEC: z.coerce.number().int().positive().default(600),
  /** 任务轮询间隔（毫秒） */
  TENCENT_TTS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  // —— MiniMax 音乐生成（MUSIC_PROVIDER=minimax 时启用）——
  /** MiniMax API Key（仅服务端持有）；MUSIC_PROVIDER=minimax 时必填 */
  MINIMAX_API_KEY: z.string().optional(),
  /** 音乐生成模型（music-3.0 推荐；音色/模型搭配见官方文档） */
  MINIMAX_MUSIC_MODEL: z.string().default("music-3.0"),
  /** MiniMax 网关地址：默认 https://api.minimaxi.com；可指向本地模拟服务器（无凭证联调） */
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com"),
  /** 音乐生成 HTTP 请求/下载超时（秒），官方称生成约 30-60s，留足余量 */
  MINIMAX_MUSIC_TIMEOUT_SEC: z.coerce.number().int().positive().default(180),
  // —— Stability AI Stable Audio（MUSIC_PROVIDER=stable-audio 时启用）——
  /** Stability API Key（sk- 前缀，仅服务端持有）；MUSIC_PROVIDER=stable-audio 时必填 */
  STABILITY_API_KEY: z.string().optional(),
  /** 模型：stable-audio-2.5（3 分钟/20 credits）或 stable-audio-2 */
  STABLE_AUDIO_MODEL: z.string().default("stable-audio-2.5"),
  /** Stability 网关地址：默认 https://api.stability.ai；可指向本地模拟服务器 */
  STABILITY_BASE_URL: z.string().url().default("https://api.stability.ai"),
  /** 扩散步数：2.5 接受 4-8（默认 8），2.0 接受 30-100 */
  STABLE_AUDIO_STEPS: z.coerce.number().int().positive().default(8),
  /** CFG 强度：2.5 默认 1，2.0 默认 7 */
  STABLE_AUDIO_CFG_SCALE: z.coerce.number().positive().default(1),
  /** 生成 HTTP 超时（秒） */
  STABLE_AUDIO_TIMEOUT_SEC: z.coerce.number().int().positive().default(300),
  // —— 腾讯云 MPS AIGC 音乐生成（MUSIC_PROVIDER=tencent 时启用，复用上方 TENCENT_SECRET_ID/KEY）——
  /** 模型名称：MiniMaxMusic / GL / EL / Mureka（官方聚合，见 MPS 创建AIGC生音频任务文档） */
  TENCENT_MUSIC_MODEL_NAME: z.string().default("MiniMaxMusic"),
  /** 模型版本：MiniMaxMusic 支持 2.0/2.5/2.6/3.0 */
  TENCENT_MUSIC_MODEL_VERSION: z.string().default("2.6"),
  /** SDK endpoint 覆盖（仅本地模拟联调用，如 localhost:8794），留空走官方域名 */
  TENCENT_MUSIC_ENDPOINT: z.string().optional(),
  /** 创建+轮询整体超时（秒），官方称生成按首计费、异步任务 */
  TENCENT_MUSIC_TIMEOUT_SEC: z.coerce.number().int().positive().default(600),
  /** 任务轮询间隔（毫秒），官方示例为 5000 */
  TENCENT_MUSIC_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  // —— 对象存储（S3 兼容：本地 MinIO，生产 OSS/R2 换 endpoint）——
  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT 不能为空"),
  /**
   * 预签名 URL 对外暴露的 endpoint（供手机/CDN 回源访问）。
   * 真机调试时必须设为开发机局域网 IP（如 http://192.168.1.4:9000），
   * 否则预签名 URL 里的 host 是 localhost，手机连不上。
   * 默认回退到 S3_ENDPOINT。
   */
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET 不能为空"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID 不能为空"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY 不能为空"),
  /** 预签名直传 URL 有效期（秒），默认 15 分钟 */
  S3_PRESIGN_TTL_SEC: z.coerce.number().int().positive().default(900),
  // —— CDN 分发（播放地址签名）——
  CDN_BASE_URL: z.string().min(1, "CDN_BASE_URL 不能为空"),
  /** 播放 URL 的 HMAC 签名密钥 */
  CDN_SIGNING_SECRET: z.string().min(32, "CDN_SIGNING_SECRET 至少 32 个字符"),
  /** 播放 URL 有效期（秒），默认 1 小时 */
  CDN_URL_TTL_SEC: z.coerce.number().int().positive().default(3600),
  // —— RevenueCat 订阅计费（密钥可选：未配置项跳过校验，生产要求至少启用 HMAC）——
  /** webhook Authorization 头共享密钥（RC dashboard 配置） */
  REVENUECAT_WEBHOOK_AUTH: z.string().optional(),
  /** webhook HMAC 签名密钥（RC dashboard webhook integration signing secret） */
  REVENUECAT_WEBHOOK_SIGNING_SECRET: z.string().optional(),
  /** RevenueCat secret API key（sk_ 前缀，REST 对账用，仅服务端持有） */
  REVENUECAT_SECRET_KEY: z.string().optional(),
  /** RevenueCat API base URL */
  REVENUECAT_API_BASE_URL: z.string().url().default("https://api.revenuecat.com"),
  /** 是否允许沙盒模拟接口（本地联调；生产强制关闭） */
  BILLING_SANDBOX_ENABLED: z
    .preprocess(
      (value) => value === undefined || value === "" || value === "true" || value === "1",
      z.boolean(),
    )
    .default(true),
})
  // TTS_PROVIDER=aliyun 时必须提供 API Key（启动时 fast-fail，避免管线跑到 tts 才报错）
  .refine((cfg) => cfg.TTS_PROVIDER !== "aliyun" || Boolean(cfg.DASHSCOPE_API_KEY), {
    message: "TTS_PROVIDER=aliyun 时 DASHSCOPE_API_KEY 必填",
    path: ["DASHSCOPE_API_KEY"],
  })
  // TTS_PROVIDER=tencent 时必须提供 SecretId/SecretKey
  .refine(
    (cfg) =>
      cfg.TTS_PROVIDER !== "tencent" ||
      (Boolean(cfg.TENCENT_SECRET_ID) && Boolean(cfg.TENCENT_SECRET_KEY)),
    {
      message: "TTS_PROVIDER=tencent 时 TENCENT_SECRET_ID/TENCENT_SECRET_KEY 必填",
      path: ["TENCENT_SECRET_ID"],
    },
  )
  // MUSIC_PROVIDER=minimax 时必须提供 API Key
  .refine((cfg) => cfg.MUSIC_PROVIDER !== "minimax" || Boolean(cfg.MINIMAX_API_KEY), {
    message: "MUSIC_PROVIDER=minimax 时 MINIMAX_API_KEY 必填",
    path: ["MINIMAX_API_KEY"],
  })
  // MUSIC_PROVIDER=stable-audio 时必须提供 API Key
  .refine(
    (cfg) => cfg.MUSIC_PROVIDER !== "stable-audio" || Boolean(cfg.STABILITY_API_KEY),
    {
      message: "MUSIC_PROVIDER=stable-audio 时 STABILITY_API_KEY 必填",
      path: ["STABILITY_API_KEY"],
    },
  )
  // MUSIC_PROVIDER=tencent 时必须提供 SecretId/SecretKey（与腾讯 TTS 复用同一对密钥）
  .refine(
    (cfg) =>
      cfg.MUSIC_PROVIDER !== "tencent" ||
      (Boolean(cfg.TENCENT_SECRET_ID) && Boolean(cfg.TENCENT_SECRET_KEY)),
    {
      message: "MUSIC_PROVIDER=tencent 时 TENCENT_SECRET_ID/TENCENT_SECRET_KEY 必填",
      path: ["TENCENT_SECRET_ID"],
    },
  );

export type Env = z.infer<typeof envSchema>;

/** DI token：通过 @Inject(ENV) 注入校验后的配置 */
export const ENV = Symbol("ENV");

export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`环境变量校验失败，请检查 .env：\n${issues}`);
  }
  return result.data;
}
