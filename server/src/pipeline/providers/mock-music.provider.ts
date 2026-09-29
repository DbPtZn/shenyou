import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { join } from "node:path";
import { ENV, type Env } from "../../config/env";
import { PIPELINE_TMP_DIR } from "../pipeline.constants";
import type { MusicProvider, MusicResult } from "../pipeline.types";

const execFileAsync = promisify(execFile);

/**
 * Mock 音乐提供者：用 ffmpeg 生成低频正弦波 BGM（220Hz，模拟低音氛围），
 * 双声道、44.1kHz、AAC 128k。时长由 MOCK_MUSIC_DURATION_SEC 控制。
 */
@Injectable()
export class MockMusicProvider implements MusicProvider {
  readonly name = "mock";

  constructor(@Inject(ENV) private readonly env: Env) {}

  async generate(tags: string[], durationSec: number): Promise<MusicResult> {
    const targetDuration = durationSec > 0 ? durationSec : this.env.MOCK_MUSIC_DURATION_SEC;
    const outputPath = join(PIPELINE_TMP_DIR, `music-${randomUUID()}.m4a`);

    // 220Hz 低频 + 轻微颤音，模拟氛围 BGM
    const fadeOutStart = Math.max(0, targetDuration - 1);
    await execFileAsync("ffmpeg", [
      "-f", "lavfi",
      "-i", `sine=frequency=220:duration=${targetDuration}`,
      "-af", `volume=0.4,tremolo=f=2:d=0.3,afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOutStart}:d=1`,
      "-ar", "44100",
      "-ac", "2",
      "-c:a", "aac",
      "-b:a", "128k",
      "-y",
      outputPath,
    ]);

    // tags 仅用于未来真实厂商扩展，mock 不区分风格
    void tags;

    return { filePath: outputPath, durationSec: targetDuration };
  }
}
