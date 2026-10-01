import { Inject, Injectable } from "@nestjs/common";
import { ENV, type Env } from "../../config/env";
import { AliyunTtsProvider } from "./aliyun-tts.provider";
import { MinimaxMusicProvider } from "./minimax-music.provider";
import { MockMusicProvider } from "./mock-music.provider";
import { MockTtsProvider } from "./mock-tts.provider";
import { StableAudioMusicProvider } from "./stable-audio-music.provider";
import { TencentMusicProvider } from "./tencent-music.provider";
import { TencentTtsProvider } from "./tencent-tts.provider";
import type { MusicProvider, TtsProvider } from "../pipeline.types";

/**
 * 厂商选择工厂：根据 env 选择 TTS / 音乐提供者。
 * 当前支持：mock（默认）、aliyun（百炼 CosyVoice）、tencent（长文本异步合成）、
 * minimax、stable-audio、tencent（MPS AIGC 音乐生成）。
 */
@Injectable()
export class ProviderFactory {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly mockTts: MockTtsProvider,
    private readonly aliyunTts: AliyunTtsProvider,
    private readonly tencentTts: TencentTtsProvider,
    private readonly mockMusic: MockMusicProvider,
    private readonly minimaxMusic: MinimaxMusicProvider,
    private readonly stableAudioMusic: StableAudioMusicProvider,
    private readonly tencentMusic: TencentMusicProvider,
  ) {}

  getTtsProvider(): TtsProvider {
    switch (this.env.TTS_PROVIDER) {
      case "mock":
        return this.mockTts;
      case "aliyun":
        return this.aliyunTts;
      case "tencent":
        return this.tencentTts;
      default:
        return this.mockTts;
    }
  }

  getMusicProvider(): MusicProvider {
    switch (this.env.MUSIC_PROVIDER) {
      case "mock":
        return this.mockMusic;
      case "minimax":
        return this.minimaxMusic;
      case "stable-audio":
        return this.stableAudioMusic;
      case "tencent":
        return this.tencentMusic;
      default:
        return this.mockMusic;
    }
  }
}
