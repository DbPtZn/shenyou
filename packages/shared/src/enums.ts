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
