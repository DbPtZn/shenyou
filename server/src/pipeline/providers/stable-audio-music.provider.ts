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

/** Stable Audio 2 text-to-audio 端点（拼接于 STABILITY_BASE_URL 之后） */
const TEXT_TO_AUDIO_PATH = "/v2beta/audio/stable-audio-2/text-to-audio";
/** 厂商单次生成时长上限（秒），官方 hard limit 190 */
const MAX_GENERATION_SEC = 190;
/** BGM 结尾线性淡出时长（秒），与其他音乐提供者行为一致 */
const FADE_OUT_SEC = 3;
/** 开头淡入（秒），弱化循环接缝 */
const FADE_IN_SEC = 0.5;

/**
 * 中文助眠标签 → 英文 prompt 片段映射。
 * Stable Audio 2.5 仅支持英文 prompt（非法语言返回 422 invalid_language），
 * 章节 musicTags 为中文，必须在此映射；未命中的标签不向厂商透传。
 */
const TAG_TRANSLATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/雨/, "soft falling rain"],
  [/海浪|海边|大海|海洋/, "gentle ocean waves lapping the shore"],
  [/森林|雨林|树林/, "peaceful forest ambience"],
  [/钢琴/, "soft mellow piano"],
  [/篝火|火堆/, "warm crackling campfire"],
  [/溪流|溪水|小河/, "gentle flowing stream"],
  [/风/, "soft gentle wind"],
  [/虫|蝉/, "subtle crickets at night"],
  [/雷/, "distant soft thunder"],
  [/雪/, "quiet cold snowy wind"],
  [/风铃/, "soft wind chimes"],
  [/白噪/, "smooth white noise"],
  [/古风|古筝|琵琶|笛子/, "ethereal traditional plucked strings"],
];

interface StabilityErrorBody {
  id?: string;
  name?: string;
  errors?: string[];
}

interface FfprobeJson {
  format?: { duration?: string };
}

/**
 * Stability AI Stable Audio 音乐适配器（MUSIC_PROVIDER=stable-audio 时启用）。
 *
 * 流程：POST /v2beta/audio/stable-audio-2/text-to-audio
 * （multipart/form-data，accept: audio/* 直接收音频二进制）→
 * 中文 musicTags 经映射表转英文 prompt（官方仅支持英文）→
 * 请求时长 min(章节目标, 190) → ffmpeg `-stream_loop -1` 循环拼接/裁剪至章节时长
 * （章节常 10-30 分钟，厂商上限 190s，BGM 循环是助眠场景标准做法）→
 * 转码对齐「双声道 / 44.1kHz / AAC 128k m4a」（宪法 §7.9）→ ffprobe 取时长。
 *
 * 计费 20 credits/次（$0.20），与生成时长无关。
 */
@Injectable()
export class StableAudioMusicProvider implements MusicProvider {
  readonly name = "stable-audio";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async generate(tags: string[], durationSec: number): Promise<MusicResult> {
    const prompt = this.buildPrompt(tags);
    // 请求素材时长：目标小于上限时直接生成目标长度，否则取上限素材用于循环
    const requestDuration = Math.min(Math.max(1, Math.round(durationSec)), MAX_GENERATION_SEC);

    const rawPath = join(PIPELINE_TMP_DIR, `music-raw-${randomUUID()}.mp3`);
    const outputPath = join(PIPELINE_TMP_DIR, `music-${randomUUID()}.m4a`);

    try {
      await this.requestGeneration(prompt, requestDuration, rawPath);
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

  /** 中文标签 → 英文 prompt（官方仅支持英文），未命中标签忽略 */
  private buildPrompt(tags: string[]): string {
    const fragments: string[] = [];
    for (const tag of tags) {
      const hit = TAG_TRANSLATIONS.find(([re]) => re.test(tag));
      if (hit && !fragments.includes(hit[1])) fragments.push(hit[1]);
    }
    const style = fragments.length > 0 ? fragments.join(", ") : "calm ambient soundscape";
    return `${style}, calm ambient soundscape for deep sleep, soothing and peaceful, slow tempo, loopable instrumental background, no vocals`;
  }

  /** 调用 text-to-audio，成功时直接把音频二进制写入 rawPath */
  private async requestGeneration(
    prompt: string,
    requestDuration: number,
    rawPath: string,
  ): Promise<void> {
    const url = `${this.env.STABILITY_BASE_URL.replace(/\/+$/, "")}${TEXT_TO_AUDIO_PATH}`;

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("model", this.env.STABLE_AUDIO_MODEL);
    form.append("duration", String(requestDuration));
    form.append("output_format", "mp3");
    form.append("steps", String(this.env.STABLE_AUDIO_STEPS));
    form.append("cfg_scale", String(this.env.STABLE_AUDIO_CFG_SCALE));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.env.STABLE_AUDIO_TIMEOUT_SEC * 1000);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.STABILITY_API_KEY}`,
          Accept: "audio/*",
        },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(
        `Stable Audio 请求失败：${error instanceof Error && error.name === "AbortError" ? `超时（${this.env.STABLE_AUDIO_TIMEOUT_SEC}s）` : error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const body = (await resp.json().catch(() => null)) as StabilityErrorBody | null;
      const detail = body?.errors?.join("; ");
      throw new Error(
        `Stable Audio 生成失败：HTTP ${resp.status} [${body?.name ?? "—"}] ${detail ?? "未知错误"}（id=${body?.id ?? "—"}）`,
      );
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    await promisify(writeFile)(rawPath, buffer);
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
