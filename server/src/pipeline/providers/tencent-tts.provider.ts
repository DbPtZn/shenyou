import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { tts } from "tencentcloud-sdk-nodejs-tts";
import { ENV, type Env } from "../../config/env";
import { PIPELINE_TMP_DIR } from "../pipeline.constants";
import type { TtsProvider, TtsResult } from "../pipeline.types";

const execFileAsync = promisify(execFile);

/** 向厂商请求的原始格式（mp3 压缩传输），落库前统一转码对齐宪法规格 */
const SOURCE_FORMAT = "mp3";
/** 长文本接口仅支持 16000/8000 Hz，取 16k 再由 ffmpeg 上采样 */
const SOURCE_SAMPLE_RATE = 16000;
/** 单次 SDK HTTP 调用超时（秒）；整体等待受 TENCENT_TTS_TIMEOUT_SEC 约束 */
const SDK_REQUEST_TIMEOUT_SEC = 60;

interface FfprobeJson {
  format?: { duration?: string };
}

/** 解析 SDK 抛出的业务/网络错误，归一化为中文报错（保留 code/requestId 便于追溯） */
function describeSdkError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { code?: string; message?: string; requestId?: string };
  return [e.code, e.message].filter(Boolean).join(": ") || "未知错误";
}

/**
 * 腾讯云语音合成 TTS 适配器：长文本异步合成（CreateTtsTask / DescribeTtsTaskStatus）。
 *
 * 流程：提交长文本任务（TC3-HMAC-SHA256 签名由官方 SDK tencentcloud-sdk-nodejs-tts 完成）→
 * 轮询任务状态（0 等待 / 1 执行中 / 2 成功 / 3 失败）→ 下载 COS ResultUrl（24h 有效）→
 * ffmpeg 转码对齐「单声道 / 44.1kHz / AAC 128k m4a」（宪法 §7.9）→ ffprobe 取时长。
 *
 * voiceId 约定：章节 voiceId="default" 时映射为 env.TENCENT_TTS_VOICE_TYPE；
 * 其余值须为腾讯音色 ID（整数，如 101008）原样透传。
 * 文本单次上限 10 万字符（官方限制），章节文案远小于此，不做分片。
 */
@Injectable()
export class TencentTtsProvider implements TtsProvider {
  readonly name = "tencent";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async synthesize(text: string, voiceId: string): Promise<TtsResult> {
    const voiceType = this.resolveVoiceType(voiceId);
    const audioUrl = await this.synthesizeRemote(text, voiceType);

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

  /** 章节 voiceId 到腾讯 VoiceType（整数）的映射与校验 */
  private resolveVoiceType(voiceId: string): number {
    if (voiceId === "default") return this.env.TENCENT_TTS_VOICE_TYPE;
    const parsed = Number(voiceId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `腾讯 TTS 音色 ID 非法：「${voiceId}」不是有效的音色编号（应为正整数，如 101008）`,
      );
    }
    return parsed;
  }

  /** 提交异步任务并轮询至完成，成功返回 COS 音频地址 */
  private async synthesizeRemote(text: string, voiceType: number): Promise<string> {
    const client = new tts.v20190823.Client(this.buildClientConfig());

    let taskId: string;
    try {
      const createResp = await client.CreateTtsTask({
        Text: text,
        ModelType: 1,
        VoiceType: voiceType,
        PrimaryLanguage: 1,
        SampleRate: SOURCE_SAMPLE_RATE,
        Codec: SOURCE_FORMAT,
      });
      const id = createResp.Data?.TaskId;
      if (!id) throw new Error("响应缺少 Data.TaskId");
      taskId = id;
    } catch (error) {
      throw new Error(`腾讯 TTS 提交合成任务失败：${describeSdkError(error)}`);
    }

    const deadline = Date.now() + this.env.TENCENT_TTS_TIMEOUT_SEC * 1000;

    for (;;) {
      let statusResp;
      try {
        statusResp = await client.DescribeTtsTaskStatus({ TaskId: taskId });
      } catch (error) {
        throw new Error(`腾讯 TTS 查询任务状态失败：${describeSdkError(error)}`);
      }

      const data = statusResp.Data;
      switch (data?.Status) {
        case 2: {
          const resultUrl = data?.ResultUrl;
          if (!resultUrl) throw new Error("腾讯 TTS 任务成功但响应缺少 ResultUrl");
          return resultUrl;
        }
        case 3:
          throw new Error(
            `腾讯 TTS 合成失败：${data.ErrorMsg || "未知原因"}（TaskId=${taskId}）`,
          );
        // 0 等待 / 1 执行中：继续轮询
        default: {
          if (Date.now() >= deadline) {
            throw new Error(
              `腾讯 TTS 合成超时（${this.env.TENCENT_TTS_TIMEOUT_SEC}s，TaskId=${taskId}，状态=${data?.StatusStr ?? "未知"}）`,
            );
          }
          await new Promise((resolve) =>
            setTimeout(resolve, this.env.TENCENT_TTS_POLL_INTERVAL_MS),
          );
        }
      }
    }
  }

  /**
   * 构造官方 SDK 客户端配置；
   * TENCENT_TTS_ENDPOINT 支持带协议前缀（http://localhost:8793），默认走官方 HTTPS 域名。
   */
  private buildClientConfig(): ConstructorParameters<typeof tts.v20190823.Client>[0] {
    const rawEndpoint = this.env.TENCENT_TTS_ENDPOINT?.trim();
    let protocol: "https://" | "http://" = "https://";
    let endpoint = "tts.tencentcloudapi.com";
    if (rawEndpoint) {
      const match = /^(https?):\/\/(.+)$/i.exec(rawEndpoint);
      const scheme = match?.[1]?.toLowerCase();
      const host = match?.[2];
      if (host && (scheme === "http" || scheme === "https")) {
        protocol = scheme === "http" ? "http://" : "https://";
        endpoint = host;
      } else {
        endpoint = rawEndpoint;
      }
    }

    const secretId = this.env.TENCENT_SECRET_ID;
    const secretKey = this.env.TENCENT_SECRET_KEY;
    if (!secretId || !secretKey) {
      throw new Error(
        "TTS_PROVIDER=tencent 但缺少 TENCENT_SECRET_ID/TENCENT_SECRET_KEY（请在 server/.env 配置）",
      );
    }

    return {
      credential: { secretId, secretKey },
      region: this.env.TENCENT_TTS_REGION,
      profile: {
        httpProfile: { endpoint, protocol, reqTimeout: SDK_REQUEST_TIMEOUT_SEC },
      },
    };
  }

  /** 下载厂商音频到本地（同样受超时控制） */
  private async download(audioUrl: string, outputPath: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.env.TENCENT_TTS_TIMEOUT_SEC * 1000,
    );
    try {
      const resp = await fetch(audioUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`下载 TTS 音频失败：HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      await promisify(writeFile)(outputPath, buffer);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`下载 TTS 音频超时（${this.env.TENCENT_TTS_TIMEOUT_SEC}s）`);
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
