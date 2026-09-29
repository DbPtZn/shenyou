import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { join } from "node:path";
import { ENV, type Env } from "../../config/env";
import { PIPELINE_TMP_DIR } from "../pipeline.constants";
import type { TtsProvider, TtsResult } from "../pipeline.types";

const execFileAsync = promisify(execFile);

/**
 * Mock TTS 提供者：用 ffmpeg 生成一段带淡入淡出的正弦波"人声"，
 * 模拟真实 TTS 输出规格（单声道、44.1kHz、AAC 128k），用于打通全链路。
 * 时长由 MOCK_TTS_DURATION_SEC 控制。
 */
@Injectable()
export class MockTtsProvider implements TtsProvider {
  readonly name = "mock";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async synthesize(text: string, voiceId: string): Promise<TtsResult> {
    // 测试用：voiceId 为 "fail" 时抛错，验证重试与死信
    if (voiceId === "fail") {
      throw new Error("Mock TTS 合成失败（测试用）");
    }

    const durationSec = this.env.MOCK_TTS_DURATION_SEC;
    const outputPath = join(PIPELINE_TMP_DIR, `tts-${randomUUID()}.m4a`);

    // 440Hz 正弦波 + 淡入淡出，模拟"人声"波形
    const fadeOutStart = Math.max(0, durationSec - 0.5);
    await execFileAsync("ffmpeg", [
      "-f", "lavfi",
      "-i", `sine=frequency=440:duration=${durationSec}`,
      "-af", `volume=0.6,afade=t=in:st=0:d=0.05,afade=t=out:st=${fadeOutStart}:d=0.5`,
      "-ar", "44100",
      "-ac", "1",
      "-c:a", "aac",
      "-b:a", "128k",
      "-y",
      outputPath,
    ]);

    // text / voiceId 仅用于未来真实厂商扩展，mock 不区分
    void text;
    void voiceId;

    return { filePath: outputPath, durationSec };
  }
}
