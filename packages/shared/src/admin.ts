import { z } from "zod";
import {
  audioAssetStatusSchema,
  audioTrackTypeSchema,
  chapterStopSchema,
  contentStatusSchema,
  draftStatusSchema,
  pipelineJobStatusSchema,
  pipelineStepSchema,
  subscriptionStatusSchema,
  userRoleSchema,
} from "./enums";

/**
 * 管理端 API 响应 schema：apps/admin 前端与 server 共用的单一事实来源。
 * 注意：日期字段为 ISO 字符串（JSON 序列化后的形态），服务端不重复定义这些类型。
 */

/** 分页响应包装：items + total + page + pageSize */
export const adminPagedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });

/** 管理端旅程列表项（含草稿等全部状态，与用户侧仅 published 的关键区别） */
export const adminJourneyListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  coverUrl: z.string().nullable(),
  tags: z.array(z.string()),
  isFree: z.boolean(),
  status: contentStatusSchema,
  totalDurationSec: z.number().int().nonnegative(),
  /** 章节数（_count 聚合，不加载章节行） */
  chapterCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminJourneyListItem = z.infer<typeof adminJourneyListItemSchema>;

export const adminJourneyListResponseSchema = adminPagedSchema(adminJourneyListItemSchema);
export type AdminJourneyListResponse = z.infer<typeof adminJourneyListResponseSchema>;

/** 音频资产摘要：前端上传完成后需用 id 调 ready 回调，id 必须透出 */
export const adminAudioAssetSchema = z.object({
  id: z.string(),
  trackType: audioTrackTypeSchema,
  mixPreset: z.string(),
  objectKey: z.string(),
  durationSec: z.number().int().nullable(),
  sizeBytes: z.number().int().nullable(),
  status: audioAssetStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminAudioAsset = z.infer<typeof adminAudioAssetSchema>;

/** 管线任务摘要（含失败原因 errorMessage） */
export const adminPipelineJobSchema = z.object({
  id: z.string(),
  step: pipelineStepSchema,
  status: pipelineJobStatusSchema,
  contentHash: z.string(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminPipelineJob = z.infer<typeof adminPipelineJobSchema>;

/** 旅程详情中的章节：编辑页一次性拿到完整上下文（含站点时间轴与资产/管线摘要） */
export const adminJourneyChapterSchema = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string().nullable(),
  stops: z.array(chapterStopSchema),
  durationSec: z.number().int().nonnegative(),
  draftStatus: draftStatusSchema,
  audioAssets: z.array(adminAudioAssetSchema),
  pipelineJobs: z.array(adminPipelineJobSchema),
});
export type AdminJourneyChapter = z.infer<typeof adminJourneyChapterSchema>;

/** 管理端旅程详情：旅程全字段 + 章节数组（按 index 升序） */
export const adminJourneyDetailSchema = z.object({
  ...adminJourneyListItemSchema.omit({ chapterCount: true }).shape,
  chapters: z.array(adminJourneyChapterSchema),
});
export type AdminJourneyDetail = z.infer<typeof adminJourneyDetailSchema>;

/** 管理端章节详情：全字段（含文案/审核状态/音色/BGM 标签）+ 资产 + 管线任务 */
export const adminChapterDetailSchema = z.object({
  id: z.string(),
  journeyId: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string().nullable(),
  stops: z.array(chapterStopSchema),
  durationSec: z.number().int().nonnegative(),
  narrationText: z.string().nullable(),
  draftStatus: draftStatusSchema,
  draftHash: z.string().nullable(),
  voiceId: z.string(),
  musicTags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  audioAssets: z.array(adminAudioAssetSchema),
  pipelineJobs: z.array(adminPipelineJobSchema),
});
export type AdminChapterDetail = z.infer<typeof adminChapterDetailSchema>;

/**
 * 管理端章节列表项（草稿聚合 / 章节检索）：带所属旅程标题，文案仅给预览片段。
 * narrationPreview 为 narrationText 前 100 字符的服务端截断，完整文案走章节详情。
 */
export const adminChapterListItemSchema = z.object({
  id: z.string(),
  journeyId: z.string(),
  journeyTitle: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string().nullable(),
  draftStatus: draftStatusSchema,
  narrationPreview: z.string().nullable(),
  durationSec: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type AdminChapterListItem = z.infer<typeof adminChapterListItemSchema>;

export const adminChapterListResponseSchema = adminPagedSchema(adminChapterListItemSchema);
export type AdminChapterListResponse = z.infer<typeof adminChapterListResponseSchema>;

/** 管理端用户列表项的权益摘要（无权益记录时为 null） */
export const adminUserEntitlementSummarySchema = z.object({
  status: z.string(),
  environment: z.string().nullable(),
  expirationAt: z.string().nullable(),
});
export type AdminUserEntitlementSummary = z.infer<typeof adminUserEntitlementSummarySchema>;

/** 管理端用户列表项：绝不含 passwordHash / token 等敏感字段 */
export const adminUserListItemSchema = z.object({
  id: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  nickname: z.string().nullable(),
  role: userRoleSchema,
  subscriptionStatus: subscriptionStatusSchema,
  entitlement: adminUserEntitlementSummarySchema.nullable(),
  createdAt: z.string(),
});
export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;

export const adminUserListResponseSchema = adminPagedSchema(adminUserListItemSchema);
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

/**
 * 管理端音频试听地址：由服务端 HMAC 签名（绑定 objectKey + expires + userId），
 * 禁止前端用 objectKey 直接拼接 URL。
 */
export const adminAudioPlayUrlSchema = z.object({
  url: z.string(),
  /** ISO 时间字符串 */
  expiresAt: z.string(),
  durationSec: z.number().int().nullable(),
  mixPreset: z.string(),
});
export type AdminAudioPlayUrl = z.infer<typeof adminAudioPlayUrlSchema>;

/* —— 数据看板统计（GET /admin/stats/overview）—— */

/**
 * 播放与完播概览。
 * 说明：PlaybackHistory 是「每用户每章节一条」的断点表（upsert 语义），
 * 因此播放量为「用户×章节」粒度记录数；完播判定为 positionSec ≥ 章节时长 90%（MVP 口径）。
 */
export const adminStatsPlaybackSchema = z.object({
  /** 播放记录总数（用户×章节粒度） */
  totalPlays: z.number().int().nonnegative(),
  /** 去重听友数（distinct userId） */
  uniqueListeners: z.number().int().nonnegative(),
  /** 完播记录数（positionSec ≥ 90% 章节时长） */
  completedCount: z.number().int().nonnegative(),
  /** 完播率 0-1（completedCount / totalPlays，无播放记录时为 0） */
  completionRate: z.number().min(0).max(1),
  /** 近 7 天有播放行为的记录数（按 updatedAt） */
  activeLast7d: z.number().int().nonnegative(),
  /** 近 30 天有播放行为的记录数（按 updatedAt） */
  activeLast30d: z.number().int().nonnegative(),
});
export type AdminStatsPlayback = z.infer<typeof adminStatsPlaybackSchema>;

/** 订阅转化概览：用户订阅状态分布 + 计费事件漏斗计数 */
export const adminStatsSubscriptionSchema = z.object({
  /** 注册用户总数 */
  totalUsers: z.number().int().nonnegative(),
  /** 各订阅状态用户数（缺省状态补 0） */
  byStatus: z.object({
    free: z.number().int().nonnegative(),
    trial: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    canceled: z.number().int().nonnegative(),
  }),
  /** 付费中用户数（trial + active） */
  payingUsers: z.number().int().nonnegative(),
  /** 付费转化率 0-1（payingUsers / totalUsers，无用户时为 0） */
  conversionRate: z.number().min(0).max(1),
  /** 累计首购事件数（BillingEventLog INITIAL_PURCHASE） */
  initialPurchaseEvents: z.number().int().nonnegative(),
  /** 累计续费事件数（BillingEventLog RENEWAL） */
  renewalEvents: z.number().int().nonnegative(),
});
export type AdminStatsSubscription = z.infer<typeof adminStatsSubscriptionSchema>;

/** 热门场景：Journey 维度播放排行项 */
export const adminStatsTopJourneySchema = z.object({
  journeyId: z.string(),
  title: z.string(),
  coverUrl: z.string().nullable(),
  status: contentStatusSchema,
  isFree: z.boolean(),
  /** 播放记录数（用户×章节粒度） */
  playCount: z.number().int().nonnegative(),
  /** 去重听友数 */
  uniqueListeners: z.number().int().nonnegative(),
  /** 完播率 0-1 */
  completionRate: z.number().min(0).max(1),
});
export type AdminStatsTopJourney = z.infer<typeof adminStatsTopJourneySchema>;

/** 数据看板总览响应：服务端 Redis 缓存（generatedAt 为统计生成时间，缓存命中时保持原值） */
export const adminStatsOverviewSchema = z.object({
  generatedAt: z.string(),
  /** 服务端缓存 TTL（秒），供前端提示数据时效 */
  cacheTtlSec: z.number().int().positive(),
  playback: adminStatsPlaybackSchema,
  subscription: adminStatsSubscriptionSchema,
  topJourneys: z.array(adminStatsTopJourneySchema),
});
export type AdminStatsOverview = z.infer<typeof adminStatsOverviewSchema>;

/* —— 操作审计日志（GET /admin/audit-logs）—— */

/** 审计字段：role 角色 / subscriptionStatus 订阅状态 */
export const adminAuditFieldSchema = z.enum(["role", "subscriptionStatus"]);
export type AdminAuditField = z.infer<typeof adminAuditFieldSchema>;

/**
 * 审计日志项：adminAccount/targetAccount 为写入时的账号快照（phone/email/nickname 取一），
 * 不做外键关联——账号删除后审计仍完整留存。
 */
export const adminAuditLogItemSchema = z.object({
  id: z.string(),
  adminUserId: z.string(),
  adminAccount: z.string(),
  targetUserId: z.string(),
  targetAccount: z.string(),
  field: adminAuditFieldSchema,
  /** 变更前值（枚举原始值，如 free → active；展示层负责映射中文） */
  before: z.string(),
  after: z.string(),
  createdAt: z.string(),
});
export type AdminAuditLogItem = z.infer<typeof adminAuditLogItemSchema>;

export const adminAuditLogListResponseSchema = adminPagedSchema(adminAuditLogItemSchema);
export type AdminAuditLogListResponse = z.infer<typeof adminAuditLogListResponseSchema>;
