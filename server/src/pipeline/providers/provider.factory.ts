import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";
import { MockMusicProvider } from "./mock-music.provider";
import { MockTtsProvider } from "./mock-tts.provider";
import type { MusicProvider, TtsProvider } from "../pipeline.types";

/**
 * 厂商选择工厂：根据 env 选择 TTS / 音乐提供者。
 * 当前仅实现 Mock，真实厂商（阿里云 TTS、Stable Audio 等）后续接入。
 */
@Injectable()
export class ProviderFactory {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly mockTts: MockTtsProvider,
    private readonly mockMusic: MockMusicProvider,
  ) {}

  getTtsProvider(): TtsProvider {
    switch (this.env.TTS_PROVIDER) {
      case "mock":
        return this.mockTts;
      // case "aliyun": return this.aliyunTts;
      // case "tencent": return this.tencentTts;
      default:
        return this.mockTts;
    }
  }

  getMusicProvider(): MusicProvider {
    switch (this.env.MUSIC_PROVIDER) {
      case "mock":
        return this.mockMusic;
      // case "stable-audio": return this.stableAudio;
      default:
        return this.mockMusic;
    }
  }
}
