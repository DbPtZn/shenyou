/** 仅本项目特有的请求/响应类型；通用枚举与响应类型一律来自 @shenyou/shared */
import type {
  AdminJourneyListItem,
  AdminJourneyDetail,
  AdminJourneyChapter,
  AdminChapterDetail,
  AdminChapterListItem,
  AdminChapterListResponse,
  AdminAudioAsset,
  AdminPipelineJob,
  AdminUserListItem,
  AdminAudioPlayUrl,
  AdminStatsOverview,
  AdminStatsTopJourney,
  AdminAuditLogItem,
  AdminAuditLogListResponse,
  AdminAuditField,
  ContentStatus,
  AudioTrackType,
  DraftStatus,
  MixPreset,
  SubscriptionStatus,
  UserRole,
  PipelineStep,
} from "@shenyou/shared";

export type {
  AdminJourneyListItem,
  AdminJourneyDetail,
  AdminJourneyChapter,
  AdminChapterDetail,
  AdminChapterListItem,
  AdminChapterListResponse,
  AdminAudioAsset,
  AdminPipelineJob,
  AdminUserListItem,
  AdminAudioPlayUrl,
  AdminStatsOverview,
  AdminStatsTopJourney,
  AdminAuditLogItem,
  AdminAuditLogListResponse,
  AdminAuditField,
  ContentStatus,
  AudioTrackType,
  DraftStatus,
  MixPreset,
  SubscriptionStatus,
  UserRole,
  PipelineStep,
};

/** 登录响应载荷 */
export interface LoginData {
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    nickname: string | null;
    subscriptionStatus: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: "Bearer";
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
  };
}

/** 当前用户资料 */
export interface ProfileData {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  subscriptionStatus: string;
  createdAt: string;
}

/** 创建音频资产响应（预签名直传） */
export interface CreateAudioAssetData {
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  uploadExpiresInSec: number;
}

/** 管线状态查询响应 */
export interface PipelineStatusData {
  chapter: {
    id: string;
    title: string;
    narrationText: string | null;
    draftStatus: string;
    draftHash: string | null;
    voiceId: string;
    musicTags: string[];
  };
  jobs: AdminPipelineJob[];
}

/** 队列统计响应 */
export interface QueueStatsData {
  counts: {
    active?: number;
    completed?: number;
    failed?: number;
    delayed?: number;
    waiting?: number;
  };
  recent: Array<{
    id?: string;
    name?: string;
    data?: Record<string, unknown>;
    attemptsMade?: number;
    failedReason?: string;
  }>;
}

/** 死信任务 */
export interface DeadLetterItem {
  id?: string;
  name?: string;
  data?: Record<string, unknown>;
  failedReason?: string;
  attemptsMade?: number;
}
