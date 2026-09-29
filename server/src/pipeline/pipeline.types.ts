import type { MixPresetConfig } from "./pipeline.constants";

/**
 * TTS 厂商适配器接口：所有真实厂商（阿里云、腾讯等）与 Mock 均实现此接口。
 * 只负责合成，不负责上传（上传由管线统一处理）。
 */
export interface TtsProvider {
  readonly name: string;
  /**
   * 合成人声。
   * @param text 旁白文案
   * @param voiceId 音色 ID
   * @returns 本地临时音频文件路径与时长（秒）
   */
  synthesize(text: string, voiceId: string): Promise<TtsResult>;
}

export interface TtsResult {
  /** 合成后的本地临时文件路径 */
  filePath: string;
  /** 音频时长（秒） */
  durationSec: number;
}

/**
 * 音乐厂商适配器接口：BGM/音效生成。
 */
export interface MusicProvider {
  readonly name: string;
  /**
   * 生成 BGM。
   * @param tags 风格标签（如 ["雨夜", "钢琴"]）
   * @param durationSec 目标时长（秒）
   * @returns 本地临时音频文件路径
   */
  generate(tags: string[], durationSec: number): Promise<MusicResult>;
}

export interface MusicResult {
  /** 生成后的本地临时文件路径 */
  filePath: string;
  /** 实际时长（秒） */
  durationSec: number;
}

/** 管线步骤的 BullMQ 任务数据 */
export interface PipelineJobData {
  chapterId: string;
  /** 步骤输入内容的 hash（幂等键组成部分） */
  contentHash: string;
  /** mix 步骤专用：混音预置 */
  preset?: MixPresetConfig["name"] | undefined;
  /** 触发者 ID（管理端用户），用于日志 */
  triggeredBy?: string | undefined;
  /** upload 步骤专用：混音成品本地路径（由 mix 步骤传入） */
  mixedFilePath?: string | undefined;
  /** upload 步骤专用：混音成品时长（秒） */
  durationSec?: number | undefined;
}
