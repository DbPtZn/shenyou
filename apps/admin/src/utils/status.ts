/**
 * 状态标签统一映射：状态 → 文案 + 颜色。
 * 全局唯一定义处（UI 规范），颜色类名见 styles/main.css。
 */
import type {
  ContentStatus,
  DraftStatus,
  PipelineJobStatus,
  PipelineStep,
  SubscriptionStatus,
  UserRole,
  AudioTrackType,
  AudioAssetStatus,
} from "@shenyou/shared";

type TagType = "info" | "warning" | "success" | "danger" | "primary";

export const CONTENT_STATUS_MAP: Record<ContentStatus, { label: string; type: TagType }> = {
  draft: { label: "草稿", type: "info" },
  reviewing: { label: "审核中", type: "warning" },
  published: { label: "已发布", type: "success" },
  offline: { label: "已下架", type: "danger" },
};

export const DRAFT_STATUS_MAP: Record<DraftStatus, { label: string; type: TagType }> = {
  pending: { label: "待确认", type: "warning" },
  confirmed: { label: "已确认", type: "success" },
  rejected: { label: "已驳回", type: "danger" },
};

export const PIPELINE_STEP_MAP: Record<PipelineStep, string> = {
  draft: "草稿",
  tts: "TTS 合成",
  music: "音乐生成",
  mix: "混音",
  upload: "上传",
};

export const PIPELINE_JOB_STATUS_MAP: Record<PipelineJobStatus, { label: string; type: TagType }> =
  {
    pending: { label: "排队中", type: "info" },
    running: { label: "运行中", type: "warning" },
    completed: { label: "完成", type: "success" },
    failed: { label: "失败", type: "danger" },
    dead: { label: "死信", type: "danger" },
  };

export const SUBSCRIPTION_STATUS_MAP: Record<SubscriptionStatus, { label: string; type: TagType }> =
  {
    free: { label: "免费", type: "info" },
    trial: { label: "试用中", type: "warning" },
    active: { label: "订阅有效", type: "success" },
    expired: { label: "已过期", type: "danger" },
    canceled: { label: "已取消", type: "info" },
  };

export const USER_ROLE_MAP: Record<UserRole, { label: string; type: TagType }> = {
  user: { label: "用户", type: "info" },
  admin: { label: "管理员", type: "primary" },
};

export const AUDIO_TRACK_TYPE_MAP: Record<AudioTrackType, string> = {
  narration: "人声",
  ambient: "环境音",
  music: "音乐",
  mixed: "混音成品",
};

export const AUDIO_ASSET_STATUS_MAP: Record<AudioAssetStatus, { label: string; type: TagType }> = {
  processing: { label: "处理中", type: "warning" },
  ready: { label: "已就绪", type: "success" },
};
