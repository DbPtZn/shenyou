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
  MUSIC_PROVIDER: z.enum(["mock", "stable-audio"]).default("mock"),
  /** Mock TTS 生成音频的目标时长（秒），用于联调 */
  MOCK_TTS_DURATION_SEC: z.coerce.number().int().positive().default(30),
  /** Mock 音乐生成音频的目标时长（秒） */
  MOCK_MUSIC_DURATION_SEC: z.coerce.number().int().positive().default(30),
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
});

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
