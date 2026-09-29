import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageService } from "../content/storage.service";
import { MixService } from "./mix.service";
import { PipelineController } from "./pipeline.controller";
import { PipelineQueue } from "./pipeline.queue";
import { PipelineService } from "./pipeline.service";
import { PipelineWorker } from "./pipeline.worker";
import { MockMusicProvider } from "./providers/mock-music.provider";
import { MockTtsProvider } from "./providers/mock-tts.provider";
import { ProviderFactory } from "./providers/provider.factory";

/**
 * AI 内容管线模块：草稿生成 → TTS → 音乐 → 混音 → 上传。
 *
 * - API 进程：注册 Controller 与 Queue（只投递任务）
 * - Worker 进程：注册 Worker（消费队列执行任务），通过 ROLE=worker 启动
 */
@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [PipelineController],
  providers: [
    PipelineService,
    PipelineQueue,
    PipelineWorker,
    MixService,
    ProviderFactory,
    MockTtsProvider,
    MockMusicProvider,
    StorageService,
  ],
  exports: [PipelineService, PipelineQueue],
})
export class PipelineModule {}
