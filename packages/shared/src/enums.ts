import { z } from "zod";

/**
 * 领域枚举：值同时是 zod schema（可校验）与 TS 类型（z.infer 推导）。
 * 命名用 camelCase 字符串值，与 API 载荷 / 数据库枚举保持一致。
 */

/** 内容状态机：draft 草稿 → reviewing 审核中 → published 已发布 → offline 已下架 */
export const contentStatusSchema = z.enum(["draft", "reviewing", "published", "offline"]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;
export const CONTENT_STATUSES = contentStatusSchema.options;

/** 订阅状态：free 免费 / trial 试用中 / active 订阅有效 / expired 已过期 / canceled 已取消（到期失效） */
export const subscriptionStatusSchema = z.enum(["free", "trial", "active", "expired", "canceled"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export const SUBSCRIPTION_STATUSES = subscriptionStatusSchema.options;

/** 音频轨道类型：narration 人声 / ambient 环境音 / music 音乐 / mixed 混音成品 */
export const audioTrackTypeSchema = z.enum(["narration", "ambient", "music", "mixed"]);
export type AudioTrackType = z.infer<typeof audioTrackTypeSchema>;
export const AUDIO_TRACK_TYPES = audioTrackTypeSchema.options;

/** 预置混音组合标识（如 default / relax），具体配比由 AI 管线维护 */
export const mixPresetSchema = z.enum(["default", "relax"]);
export type MixPreset = z.infer<typeof mixPresetSchema>;
export const MIX_PRESETS = mixPresetSchema.options;

/** 音频资产状态机：processing 上传/处理中 → ready 可分发 */
export const audioAssetStatusSchema = z.enum(["processing", "ready"]);
export type AudioAssetStatus = z.infer<typeof audioAssetStatusSchema>;
export const AUDIO_ASSET_STATUSES = audioAssetStatusSchema.options;

/** 章节站点时间轴（stops JSON）的单站结构：时刻（秒）/ 标题 / 副题 */
export const chapterStopSchema = z.object({
  timeSec: z.number().int().nonnegative(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
});
export type ChapterStop = z.infer<typeof chapterStopSchema>;

/** 用户角色：user 普通用户 / admin 运营管理员（Prisma User.role 为 string，取值由此约束） */
export const userRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;
export const USER_ROLES = userRoleSchema.options;

/** 章节文案审核状态（与 Prisma DraftStatus 枚举一致）：pending 待确认 → confirmed 可合成 → rejected 需重写 */
export const draftStatusSchema = z.enum(["pending", "confirmed", "rejected"]);
export type DraftStatus = z.infer<typeof draftStatusSchema>;
export const DRAFT_STATUSES = draftStatusSchema.options;

/** AI 管线步骤（与 Prisma PipelineStep 枚举一致） */
export const pipelineStepSchema = z.enum(["draft", "tts", "music", "mix", "upload"]);
export type PipelineStep = z.infer<typeof pipelineStepSchema>;
export const PIPELINE_STEPS = pipelineStepSchema.options;

/** 管线任务状态（与 Prisma PipelineJobStatus 枚举一致） */
export const pipelineJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "dead",
]);
export type PipelineJobStatus = z.infer<typeof pipelineJobStatusSchema>;
export const PIPELINE_JOB_STATUSES = pipelineJobStatusSchema.options;
