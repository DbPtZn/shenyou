import { tmpdir } from "node:os";

/**
 * AI 内容管线常量：队列名、步骤名、混音预置。
 */

/** BullMQ 队列名：所有管线步骤共用一个队列，用 job.name 区分步骤 */
export const PIPELINE_QUEUE = "content-pipeline";

/** 死信队列名：重试耗尽后迁入 */
export const PIPELINE_DLQ = `${PIPELINE_QUEUE}:dlq`;

/** 管线步骤（与 Prisma PipelineStep 枚举一致） */
export const PIPELINE_STEPS = ["draft", "tts", "music", "mix", "upload"] as const;
export type PipelineStepName = (typeof PIPELINE_STEPS)[number];

/**
 * 混音预置（与导读决策 D1 一致）：
 * - default 40/35/25（旁白/环境音/配乐）
 * - relax   25/50/25
 * 数值为相对音量百分比，mix.service 内换算为 dB。
 */
export interface MixPresetConfig {
  name: "default" | "relax";
  /** 旁白音量占比 */
  narration: number;
  /** 环境音音量占比（当前管线不单独生成环境音，暂预留） */
  ambient: number;
  /** 配乐音量占比 */
  music: number;
}

export const MIX_PRESETS: MixPresetConfig[] = [
  { name: "default", narration: 40, ambient: 35, music: 25 },
  { name: "relax", narration: 25, ambient: 50, music: 25 },
];

/** 混音输出规格（宪法 §7.9） */
export const MIX_SPEC = {
  sampleRate: 44100,
  bitrate: "128k",
  codec: "aac",
  /** 目标响度（LUFS） */
  targetLufs: -16,
  /** BGM 相对人声的衰减范围（dB） */
  bgmAttenuationDb: { min: 12, max: 18 },
} as const;

/** 临时工作目录（ffmpeg 中间文件） */
export const PIPELINE_TMP_DIR = process.env.PIPELINE_TMP_DIR ?? tmpdir();
