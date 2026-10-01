import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ENV, type Env } from "../../config/env";
import { PIPELINE_TMP_DIR } from "../pipeline.constants";
import type { TtsProvider, TtsResult } from "../pipeline.types";

const execFileAsync = promisify(execFile);

/** 百炼非实时 TTS 端点（拼接于 DASHSCOPE_BASE_URL 之后） */
const TTS_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer";
/** 向厂商请求的原始格式（mp3 压缩传输），落库前统一转码对齐宪法规格 */
const SOURCE_FORMAT = "mp3";
const SOURCE_SAMPLE_RATE = 44100;

interface SynthesizerResponse {
  request_id?: string;
  output?: {
    finish_reason?: string | null;
    audio?: { url?: string; id?: string; expires_at?: number };
  };
  usage?: { characters?: number };
  /** 错误响应字段（成功响应不出现） */
  code?: string;
  message?: string;
}

interface FfprobeJson {
  format?: { duration?: string };
}

/**
 * 阿里云百炼 CosyVoice TTS 适配器：非实时语音合成 HTTP API。
 *
 * 流程：POST 合成 → 响应取 audio.url（24h 有效）→ 下载原始 mp3 →
 * ffmpeg 转码对齐「单声道 / 44.1kHz / AAC 128k m4a」（宪法 §7.9，保证混音链路规格统一）→
 * ffprobe 取时长。
 *
 * voiceId 约定：章节 voiceId="default" 时映射为 env.ALIYUN_TTS_VOICE；
 * 其余值原样透传（管理端可直接填百炼音色 ID）。
 * 文本单次上限 20000 字符（官方限制），章节文案远小于此，不做分片。
 */
@Injectable()
export class AliyunTtsProvider implements TtsProvider {
  readonly name = "aliyun";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async synthesize(text: string, voiceId: string): Promise<TtsResult> {
    const voice = voiceId === "default" ? this.env.ALIYUN_TTS_VOICE : voiceId;
    const audioUrl = await this.requestSynthesis(text, voice);

    const rawPath = join(PIPELINE_TMP_DIR, `tts-raw-${randomUUID()}.${SOURCE_FORMAT}`);
    const outputPath = join(PIPELINE_TMP_DIR, `tts-${randomUUID()}.m4a`);

    try {
      await this.download(audioUrl, rawPath);
      await this.transcode(rawPath, outputPath);
      const durationSec = await this.probeDuration(outputPath);
      return { filePath: outputPath, durationSec };
    } catch (error) {
      // 失败时清理已生成的目标文件，避免临时目录残留
      await unlink(outputPath).catch(() => undefined);
      throw error;
    } finally {
      await unlink(rawPath).catch(() => undefined);
    }
  }

  /** 调用 SpeechSynthesizer，成功返回音频下载 URL */
  private async requestSynthesis(text: string, voice: string): Promise<string> {
    const url = `${this.env.DASHSCOPE_BASE_URL.replace(/\/+$/, "")}${TTS_PATH}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.ALIYUN_TTS_TIMEOUT_SEC * 1000);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.env.ALIYUN_TTS_MODEL,
          input: {
            text,
            voice,
            format: SOURCE_FORMAT,
            sample_rate: SOURCE_SAMPLE_RATE,
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `阿里云 TTS 请求失败：${error instanceof Error && error.name === "AbortError" ? `超时（${this.env.ALIYUN_TTS_TIMEOUT_SEC}s）` : error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const body = (await resp.json().catch(() => null)) as SynthesizerResponse | null;

    if (!resp.ok || body?.code || body?.output?.finish_reason !== "stop") {
      const reason = body
        ? [body.code, body.message].filter(Boolean).join(": ") || "未知错误"
        : `HTTP ${resp.status}`;
      throw new Error(
        `阿里云 TTS 合成失败：${reason}（request_id=${body?.request_id ?? "—"}）`,
      );
    }

    const audioUrl = body.output.audio?.url;
    if (!audioUrl) throw new Error("阿里云 TTS 响应缺少 audio.url");
    return audioUrl;
  }

  /** 下载厂商音频到本地（同样受超时控制） */
  private async download(audioUrl: string, outputPath: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.ALIYUN_TTS_TIMEOUT_SEC * 1000);
    try {
      const resp = await fetch(audioUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`下载 TTS 音频失败：HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      await promisify(writeFile)(outputPath, buffer);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`下载 TTS 音频超时（${this.env.ALIYUN_TTS_TIMEOUT_SEC}s）`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 转码对齐管线规格：单声道 / 44.1kHz / AAC 128k */
  private async transcode(rawPath: string, outputPath: string): Promise<void> {
    await execFileAsync("ffmpeg", [
      "-i", rawPath,
      "-ar", "44100",
      "-ac", "1",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ]);
  }

  /** ffprobe 读取时长（秒），失败返回 0 不阻断主流程（下游时长以混音成品为准） */
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
