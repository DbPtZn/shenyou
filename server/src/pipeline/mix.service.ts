import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { join } from "node:path";
import { MIX_PRESETS, MIX_SPEC, PIPELINE_TMP_DIR, type MixPresetConfig } from "./pipeline.constants";

const execFileAsync = promisify(execFile);

/**
 * 混音服务：将人声与 BGM 按预置比例混合，输出符合宪法 §7.9 规格的成品。
 *
 * 规格：
 * - BGM 比人声低 12-18 dB
 * - 成品 -16 LUFS 归一化
 * - AAC 128kbps / 44.1kHz
 *
 * 预置（导读 D1）：
 * - default 40/35/25 → 人声主导，BGM -15dB
 * - relax   25/50/25 → 音乐相对提升，BGM -10dB
 */
@Injectable()
export class MixService {
  private readonly logger = new Logger(MixService.name);

  /** 获取所有需要渲染的预置 */
  getPresets(): MixPresetConfig[] {
    return MIX_PRESETS;
  }

  /**
   * 执行人声 + BGM 混音。
   * @param narrationPath 人声音频文件路径
   * @param musicPath BGM 音频文件路径
   * @param preset 混音预置
   * @returns 混音成品本地路径与时长（秒）
   */
  async mix(
    narrationPath: string,
    musicPath: string,
    preset: MixPresetConfig,
  ): Promise<{ filePath: string; durationSec: number }> {
    const outputPath = join(PIPELINE_TMP_DIR, `mix-${preset.name}-${randomUUID()}.m4a`);

    // 预置 → dB 映射（满足宪法 §7.9：BGM 比人声低 12-18dB）
    const { narrationDb, musicDb } = this.presetToDb(preset);

    this.logger.debug(
      `混音 preset=${preset.name} narration=${narrationDb}dB music=${musicDb}dB`,
    );

    // ffmpeg 混音：
    // [0] narration → volume 调整
    // [1] music → volume 调整 → amix 混合 → loudnorm 归一化 → AAC 输出
    await execFileAsync("ffmpeg", [
      "-i", narrationPath,
      "-i", musicPath,
      "-filter_complex",
      [
        `[0:a]volume=${narrationDb}dB,aresample=${MIX_SPEC.sampleRate}[narration]`,
        `[1:a]volume=${musicDb}dB,aresample=${MIX_SPEC.sampleRate}[music]`,
        `[narration][music]amix=inputs=2:duration=longest:dropout_transition=0[mixed]`,
        `[mixed]loudnorm=I=${MIX_SPEC.targetLufs}:TP=-1.5:LRA=11[norm]`,
      ].join(";"),
      "-map", "[norm]",
      "-c:a", MIX_SPEC.codec,
      "-b:a", MIX_SPEC.bitrate,
      "-ar", String(MIX_SPEC.sampleRate),
      "-ac", "2",
      "-y",
      outputPath,
    ]);

    // 读取成品时长
    const durationSec = await this.readDuration(outputPath);
    return { filePath: outputPath, durationSec };
  }

  /**
   * 预置占比 → dB 换算。
   * 以 narration 为 0dB 基准，music 按预置比例衰减，确保落在 12-18dB 区间。
   */
  private presetToDb(preset: MixPresetConfig): { narrationDb: number; musicDb: number } {
    // 用 (narration / music) 比例计算相对衰减
    const ratio = preset.narration / Math.max(1, preset.ambient + preset.music);
    let musicAttenuation = -20 * Math.log10(ratio);

    // 钳制到宪法要求的 12-18 dB 区间
    const { min, max } = MIX_SPEC.bgmAttenuationDb;
    musicAttenuation = Math.min(max, Math.max(min, musicAttenuation));

    // relax 预置音乐占比更高，衰减更小（更靠近 12dB）
    // default 预置人声主导，衰减更大（更靠近 18dB）
    if (preset.name === "relax") {
      musicAttenuation = Math.min(musicAttenuation, 12);
    } else {
      musicAttenuation = Math.max(musicAttenuation, 15);
    }

    return { narrationDb: 0, musicDb: -musicAttenuation };
  }

  /** 用 ffprobe 读取音频时长（秒） */
  private async readDuration(filePath: string): Promise<number> {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) ? Math.round(duration) : 0;
  }
}
