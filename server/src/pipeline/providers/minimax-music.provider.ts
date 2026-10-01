import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ENV, type Env } from "../../config/env";
import { PIPELINE_TMP_DIR } from "../pipeline.constants";
import type { MusicProvider, MusicResult } from "../pipeline.types";

const execFileAsync = promisify(execFile);

/** MiniMax 音乐生成端点（拼接于 MINIMAX_BASE_URL 之后） */
const MUSIC_PATH = "/v1/music_generation";
/** BGM 结尾线性淡出时长（秒），与 mock 行为一致 */
const FADE_OUT_SEC = 3;
/** 循环素材开头淡入（秒），弱化循环接缝 */
const FADE_IN_SEC = 0.5;

interface MusicGenerationResponse {
  data?: {
    /** 1: 合成中 2: 已完成（非流式请求应直接为 2） */
    status?: number;
    /** output_format=url 时为下载地址（24h 有效） */
    audio?: string;
  };
  extra_info?: { music_duration?: number; music_channel?: number; music_size?: number };
  trace_id?: string;
  base_resp?: { status_code?: number; status_msg?: string };
}

interface FfprobeJson {
  format?: { duration?: string };
}

/** MiniMax 常见业务错误码 → 中文提示（官方错误码表） */
const ERROR_CODE_HINTS: Record<number, string> = {
  1002: "触发限流，请稍后再试",
  1004: "账号鉴权失败，请检查 API Key",
  1008: "账号余额不足",
  2013: "传入参数异常",
  2049: "无效的 API Key",
};

/**
 * MiniMax 音乐生成适配器（MUSIC_PROVIDER=minimax 时启用）。
 *
 * 流程：POST /v1/music_generation（is_instrumental 纯音乐，output_format=url）→
 * 下载生成音频 → ffmpeg `-stream_loop -1` 循环拼接/裁剪至章节目标时长
 * （厂商单次生成时长有限，章节常 10-30 分钟，BGM 循环是助眠场景标准做法）→
 * 转码对齐「双声道 / 44.1kHz / AAC 128k m4a」（宪法 §7.9）→ ffprobe 取时长。
 *
 * prompt 由章节 musicTags 拼接助眠场景后缀构成；官方单次生成约 30-60s，
 * 超时由 MINIMAX_MUSIC_TIMEOUT_SEC 控制（默认 180s）。
 */
@Injectable()
export class MinimaxMusicProvider implements MusicProvider {
  readonly name = "minimax";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async generate(tags: string[], durationSec: number): Promise<MusicResult> {
    const prompt = this.buildPrompt(tags);
    const audioUrl = await this.requestGeneration(prompt);

    const rawPath = join(PIPELINE_TMP_DIR, `music-raw-${randomUUID()}.mp3`);
    const outputPath = join(PIPELINE_TMP_DIR, `music-${randomUUID()}.m4a`);

    try {
      await this.download(audioUrl, rawPath);
      await this.loopAndTranscode(rawPath, outputPath, durationSec);
      const probed = await this.probeDuration(outputPath);
      return { filePath: outputPath, durationSec: probed > 0 ? probed : durationSec };
    } catch (error) {
      await unlink(outputPath).catch(() => undefined);
      throw error;
    } finally {
      await unlink(rawPath).catch(() => undefined);
    }
  }

  /** 风格标签 → 厂商 prompt（纯音乐助眠场景） */
  private buildPrompt(tags: string[]): string {
    const style = tags.length > 0 ? tags.join("，") : "舒缓氛围";
    return `${style}，助眠氛围，舒缓平静，慢节奏，无歌词纯音乐背景`;
  }

  /** 调用 music_generation，成功返回音频下载 URL（24h 有效） */
  private async requestGeneration(prompt: string): Promise<string> {
    const url = `${this.env.MINIMAX_BASE_URL.replace(/\/+$/, "")}${MUSIC_PATH}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.MINIMAX_MUSIC_TIMEOUT_SEC * 1000);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.MINIMAX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.env.MINIMAX_MUSIC_MODEL,
          prompt,
          is_instrumental: true,
          output_format: "url",
          audio_setting: { sample_rate: 44100, bitrate: 128000, format: "mp3" },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `MiniMax 音乐生成请求失败：${error instanceof Error && error.name === "AbortError" ? `超时（${this.env.MINIMAX_MUSIC_TIMEOUT_SEC}s）` : error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const body = (await resp.json().catch(() => null)) as MusicGenerationResponse | null;

    const statusCode = body?.base_resp?.status_code;
    if (!resp.ok || statusCode !== 0 || body?.data?.status !== 2) {
      const hint = statusCode !== undefined ? (ERROR_CODE_HINTS[statusCode] ?? "") : "";
      const reason = body
        ? [`status_code=${statusCode ?? "—"}`, body.base_resp?.status_msg, hint]
            .filter(Boolean)
            .join(" ")
        : `HTTP ${resp.status}`;
      throw new Error(
        `MiniMax 音乐生成失败：${reason}（trace_id=${body?.trace_id ?? "—"}）`,
      );
    }

    const audioUrl = body.data.audio;
    if (!audioUrl) throw new Error("MiniMax 音乐生成响应缺少 data.audio");
    return audioUrl;
  }

  /** 下载厂商音频到本地（同样受超时控制） */
  private async download(audioUrl: string, outputPath: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.MINIMAX_MUSIC_TIMEOUT_SEC * 1000);
    try {
      const resp = await fetch(audioUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`下载 MiniMax 音频失败：HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      await promisify(writeFile)(outputPath, buffer);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`下载 MiniMax 音频超时（${this.env.MINIMAX_MUSIC_TIMEOUT_SEC}s）`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 循环拼接/裁剪至目标时长并转码对齐：双声道 / 44.1kHz / AAC 128k m4a。
   * -stream_loop -1 + -t target：素材短于目标时无缝循环，长于目标时裁剪；
   * 结尾 3s 线性淡出（助眠体验），开头 0.5s 淡入弱化循环接缝。
   */
  private async loopAndTranscode(
    rawPath: string,
    outputPath: string,
    targetDurationSec: number,
  ): Promise<void> {
    const fadeOutStart = Math.max(0, targetDurationSec - FADE_OUT_SEC);
    await execFileAsync("ffmpeg", [
      "-stream_loop", "-1",
      "-i", rawPath,
      "-t", String(targetDurationSec),
      "-af", `afade=t=in:st=0:d=${FADE_IN_SEC},afade=t=out:st=${fadeOutStart}:d=${FADE_OUT_SEC}`,
      "-ar", "44100",
      "-ac", "2",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);
  }

  /** ffprobe 读取时长（秒），失败返回 0 由调用方回退为目标时长 */
  private async probeDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        filePath,
      ]);
      const parsed = JSON.parse(stdout) as FfprobeJson;
      const duration = Number(parsed.format?.duration);
      return Number.isFinite(duration) ? Math.round(duration) : 0;
    } catch {
      return 0;
    }
  }
}
