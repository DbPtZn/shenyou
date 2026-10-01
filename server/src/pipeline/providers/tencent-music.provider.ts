import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { mps } from "tencentcloud-sdk-nodejs-mps";
import { ENV, type Env } from "../../config/env";
import { PIPELINE_TMP_DIR } from "../pipeline.constants";
import type { MusicProvider, MusicResult } from "../pipeline.types";

const execFileAsync = promisify(execFile);

/** BGM 结尾线性淡出时长（秒），与其他音乐适配器行为一致 */
const FADE_OUT_SEC = 3;
/** 循环素材开头淡入（秒），弱化循环接缝 */
const FADE_IN_SEC = 0.5;
/** 单次 SDK HTTP 调用超时（秒）；整体等待受 TENCENT_MUSIC_TIMEOUT_SEC 约束 */
const SDK_REQUEST_TIMEOUT_SEC = 60;

interface FfprobeJson {
  format?: { duration?: string };
}

/** 解析 SDK 抛出的业务/网络错误，归一化为中文报错（保留 code 便于追溯） */
function describeSdkError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { code?: string; message?: string; requestId?: string };
  return [e.code, e.message].filter(Boolean).join(": ") || "未知错误";
}

/**
 * 腾讯云 MPS（媒体处理）AIGC 音乐生成适配器（MUSIC_PROVIDER=tencent 时启用）。
 *
 * 流程：CreateAigcAudioTask（SceneType=music，TC3-HMAC-SHA256 签名由官方 SDK
 * tencentcloud-sdk-nodejs-mps 完成）→ DescribeAigcAudioTask 轮询
 * （WAIT/RUN → DONE/FAIL）→ 下载结果音频（URL 12 小时有效）→
 * ffmpeg `-stream_loop -1` 循环拼接/裁剪至章节目标时长（厂商按首生成，章节常
 * 10-30 分钟，BGM 循环是助眠场景标准做法）→ 转码对齐「双声道 / 44.1kHz /
 * AAC 128k m4a」（宪法 §7.9）→ ffprobe 取时长。
 *
 * 凭证复用腾讯 TTS 的 TENCENT_SECRET_ID/TENCENT_SECRET_KEY（需先开通 MPS 服务）。
 * 模型默认 MiniMaxMusic 2.6 纯音乐（is_instrumental 经 AdditionalParameters 透传），
 * 官方聚合模型 GL/EL/Mureka 可通过 env 切换。Prompt 官方示例支持中文，无语言限制。
 */
@Injectable()
export class TencentMusicProvider implements MusicProvider {
  readonly name = "tencent";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async generate(tags: string[], durationSec: number): Promise<MusicResult> {
    const prompt = this.buildPrompt(tags);
    const audioUrl = await this.generateRemote(prompt);

    const rawPath = join(PIPELINE_TMP_DIR, `music-raw-${randomUUID()}.mp3`);
    const outputPath = join(PIPELINE_TMP_DIR, `music-${randomUUID()}.m4a`);

    try {
      await this.download(audioUrl, rawPath);
      await this.loopAndTranscode(rawPath, outputPath, durationSec);
      const probed = await this.probeDuration(outputPath);
      return { filePath: outputPath, durationSec: probed > 0 ? probed : durationSec };
    } catch (error) {
      // 失败时清理已生成的目标文件，避免临时目录残留
      await unlink(outputPath).catch(() => undefined);
      throw error;
    } finally {
      await unlink(rawPath).catch(() => undefined);
    }
  }

  /** 风格标签 → 厂商 prompt（纯音乐助眠场景；官方 Prompt 上限 2000 字符） */
  private buildPrompt(tags: string[]): string {
    const style = tags.length > 0 ? tags.join("，") : "舒缓氛围";
    return `${style}，助眠氛围，舒缓平静，慢节奏，无歌词纯音乐背景`;
  }

  /** 创建异步任务并轮询至完成，成功返回结果音频 URL（12 小时有效） */
  private async generateRemote(prompt: string): Promise<string> {
    const client = new mps.v20190612.Client(this.buildClientConfig());

    let taskId: string;
    try {
      const createResp = await client.CreateAigcAudioTask({
        ModelName: this.env.TENCENT_MUSIC_MODEL_NAME,
        ModelVersion: this.env.TENCENT_MUSIC_MODEL_VERSION,
        SceneType: "music",
        Prompt: prompt,
        // MiniMaxMusic 纯音乐开关与音质参数经 AdditionalParameters 透传（JSON 字符串）
        AdditionalParameters: JSON.stringify({
          is_instrumental: true,
          sample_rate: 44100,
          bitrate: 256000,
        }),
        ExtraParameters: { OutputAudioFormat: "mp3" },
        Operator: "shenyou-pipeline",
      });
      if (!createResp.TaskId) throw new Error("响应缺少 TaskId");
      taskId = createResp.TaskId;
    } catch (error) {
      throw new Error(`腾讯音乐创建生成任务失败：${describeSdkError(error)}`);
    }

    const deadline = Date.now() + this.env.TENCENT_MUSIC_TIMEOUT_SEC * 1000;

    for (;;) {
      let statusResp;
      try {
        statusResp = await client.DescribeAigcAudioTask({ TaskId: taskId });
      } catch (error) {
        throw new Error(`腾讯音乐查询任务状态失败：${describeSdkError(error)}`);
      }

      switch (statusResp.Status) {
        case "DONE": {
          const audioUrl = statusResp.AudioInfos?.[0]?.Url;
          if (!audioUrl) {
            throw new Error("腾讯音乐任务成功但响应缺少 AudioInfos[0].Url");
          }
          return audioUrl;
        }
        case "FAIL":
          throw new Error(
            `腾讯音乐生成失败：${statusResp.Message || "未知原因"}（TaskId=${taskId}）`,
          );
        // WAIT / RUN：继续轮询
        default: {
          if (Date.now() >= deadline) {
            throw new Error(
              `腾讯音乐生成超时（${this.env.TENCENT_MUSIC_TIMEOUT_SEC}s，TaskId=${taskId}，状态=${statusResp.Status ?? "未知"}）`,
            );
          }
          await new Promise((resolve) =>
            setTimeout(resolve, this.env.TENCENT_MUSIC_POLL_INTERVAL_MS),
          );
        }
      }
    }
  }

  /**
   * 构造官方 SDK 客户端配置；
   * TENCENT_MUSIC_ENDPOINT 支持带协议前缀（http://localhost:8794），默认走官方 HTTPS 域名。
   */
  private buildClientConfig(): ConstructorParameters<typeof mps.v20190612.Client>[0] {
    const rawEndpoint = this.env.TENCENT_MUSIC_ENDPOINT?.trim();
    let protocol: "https://" | "http://" = "https://";
    let endpoint = "mps.tencentcloudapi.com";
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
        "MUSIC_PROVIDER=tencent 但缺少 TENCENT_SECRET_ID/TENCENT_SECRET_KEY（请在 server/.env 配置）",
      );
    }

    return {
      credential: { secretId, secretKey },
      // MPS AIGC 接口 Region 非必填（官方文档），留空由 SDK 默认
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
      this.env.TENCENT_MUSIC_TIMEOUT_SEC * 1000,
    );
    try {
      const resp = await fetch(audioUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`下载腾讯音乐音频失败：HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      await promisify(writeFile)(outputPath, buffer);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`下载腾讯音乐音频超时（${this.env.TENCENT_MUSIC_TIMEOUT_SEC}s）`);
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
