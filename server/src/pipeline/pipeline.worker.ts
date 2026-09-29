import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Job, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../content/storage.service";
import { MixService } from "./mix.service";
import { PIPELINE_QUEUE, type PipelineStepName } from "./pipeline.constants";
import { PipelineQueue } from "./pipeline.queue";
import { PipelineService } from "./pipeline.service";
import { ProviderFactory } from "./providers/provider.factory";
import type { PipelineJobData } from "./pipeline.types";

/**
 * BullMQ Worker：执行管线各步骤的实际耗时操作。
 * 独立进程运行（pnpm start:worker），与 API 进程隔离（CLAUDE.md §5）。
 *
 * 步骤流转：
 *   draft → [人工确认] → tts + music（并行）→ mix（每预置一版）→ upload
 */
@Injectable()
export class PipelineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineWorker.name);
  private worker: Worker<PipelineJobData> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly providers: ProviderFactory,
    private readonly mix: MixService,
    private readonly pipeline: PipelineService,
    private readonly queue: PipelineQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    // 仅在 worker 进程启动 BullMQ Worker（API 进程不消费队列）
    if (process.env.ROLE !== "worker") {
      this.logger.log("当前为 API 进程，管线 Worker 不启动");
      return;
    }

    const connection = this.parseRedisUrl(this.env.REDIS_URL);
    this.worker = new Worker<PipelineJobData>(
      PIPELINE_QUEUE,
      async (job) => this.process(job),
      {
        connection,
        concurrency: this.env.PIPELINE_CONCURRENCY,
        // 重试耗尽后移入死信队列
        removeOnFail: { count: 500 },
      },
    );

    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `任务失败 step=${job?.name} id=${job?.id} attempt=${job?.attemptsMade} err=${err.message}`,
      );
    });

    this.logger.log(`管线 Worker 已启动，并发=${this.env.PIPELINE_CONCURRENCY}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  /** 任务分发：按 job.name（步骤名）路由到对应处理器 */
  private async process(job: Job<PipelineJobData>): Promise<void> {
    const step = job.name as PipelineStepName;
    const { chapterId, contentHash } = job.data;
    this.logger.log(`开始处理 step=${step} chapter=${chapterId} attempt=${job.attemptsMade}`);

    // 更新 DB 状态为 running
    await this.markJobRunning(chapterId, step, contentHash, job.id ?? "");

    try {
      switch (step) {
        case "draft":
          await this.handleDraft(job);
          break;
        case "tts":
          await this.handleTts(job);
          break;
        case "music":
          await this.handleMusic(job);
          break;
        case "mix":
          await this.handleMix(job);
          break;
        case "upload":
          await this.handleUpload(job);
          break;
      }
      await this.markJobCompleted(chapterId, step, contentHash);
      this.logger.log(`步骤完成 step=${step} chapter=${chapterId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.markJobFailed(chapterId, step, contentHash, message);
      throw err; // 让 BullMQ 负责重试 / 死信
    }
  }

  // —— 步骤处理器 ——

  /** draft：AI 生成写景文案（Mock 实现） */
  private async handleDraft(job: Job<PipelineJobData>): Promise<void> {
    const { chapterId } = job.data;
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, title: true, subtitle: true, journey: { select: { title: true, tags: true } } },
    });
    if (!chapter) throw new Error(`章节不存在: ${chapterId}`);

    // Mock AI：基于旅程标题、标签、章节标题生成写景文案
    const tags = chapter.journey.tags.join("、");
    const narration = this.mockDraftNarration(chapter.journey.title, chapter.title, tags);

    await this.prisma.chapter.update({
      where: { id: chapterId },
      data: { narrationText: narration, draftStatus: "pending" },
    });
  }

  /** tts：合成人声 → 上传 S3 → 创建 AudioAsset */
  private async handleTts(job: Job<PipelineJobData>): Promise<void> {
    const { chapterId } = job.data;
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, narrationText: true, voiceId: true },
    });
    if (!chapter?.narrationText) throw new Error(`章节 ${chapterId} 无文案`);

    const provider = this.providers.getTtsProvider();
    const result = await provider.synthesize(chapter.narrationText, chapter.voiceId);

    const objectKey = PipelineService.makeObjectKey(chapterId, "narration");
    const { sizeBytes } = await this.storage.uploadFile(objectKey, result.filePath, "audio/mp4");

    const asset = await this.prisma.audioAsset.create({
      data: {
        chapterId,
        trackType: "narration",
        objectKey,
        durationSec: result.durationSec,
        sizeBytes,
        status: "ready",
      },
    });

    await this.cleanupTemp(result.filePath);
    await this.updateJobResult(chapterId, "tts", job.data.contentHash, asset.id);

    // 检查是否可进入混音
    await this.pipeline.onSourceTrackReady(chapterId);
  }

  /** music：生成 BGM → 上传 S3 → 创建 AudioAsset */
  private async handleMusic(job: Job<PipelineJobData>): Promise<void> {
    const { chapterId } = job.data;
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, musicTags: true, durationSec: true },
    });
    if (!chapter) throw new Error(`章节不存在: ${chapterId}`);

    const provider = this.providers.getMusicProvider();
    const duration = chapter.durationSec > 0 ? chapter.durationSec : 30;
    const result = await provider.generate(chapter.musicTags, duration);

    const objectKey = PipelineService.makeObjectKey(chapterId, "music");
    const { sizeBytes } = await this.storage.uploadFile(objectKey, result.filePath, "audio/mp4");

    const asset = await this.prisma.audioAsset.create({
      data: {
        chapterId,
        trackType: "music",
        objectKey,
        durationSec: result.durationSec,
        sizeBytes,
        status: "ready",
      },
    });

    await this.cleanupTemp(result.filePath);
    await this.updateJobResult(chapterId, "music", job.data.contentHash, asset.id);

    // 检查是否可进入混音
    await this.pipeline.onSourceTrackReady(chapterId);
  }

  /** mix：按预置混音 → 存本地路径到 resultData → 投递 upload */
  private async handleMix(job: Job<PipelineJobData>): Promise<void> {
    const { chapterId, preset } = job.data;
    if (!preset) throw new Error("mix 步骤缺少 preset 参数");

    const [narration, music] = await Promise.all([
      this.prisma.audioAsset.findFirst({
        where: { chapterId, trackType: "narration", status: "ready" },
        select: { objectKey: true, id: true },
      }),
      this.prisma.audioAsset.findFirst({
        where: { chapterId, trackType: "music", status: "ready" },
        select: { objectKey: true, id: true },
      }),
    ]);
    if (!narration) throw new Error(`章节 ${chapterId} 无人声音频`);
    if (!music) throw new Error(`章节 ${chapterId} 无 BGM 音频`);

    // 从 S3 下载到本地临时文件进行混音
    const narrationLocal = await this.downloadToTemp(narration.objectKey, "narration");
    const musicLocal = await this.downloadToTemp(music.objectKey, "music");

    try {
      const presetConfig = this.mix.getPresets().find((p) => p.name === preset);
      if (!presetConfig) throw new Error(`未知预置: ${preset}`);

      const { filePath, durationSec } = await this.mix.mix(narrationLocal, musicLocal, presetConfig);

      // 将混音成品路径存入 resultData，供 upload 步骤使用
      await this.updateJobResult(chapterId, "mix", job.data.contentHash, undefined, {
        mixedFilePath: filePath,
        durationSec,
        preset,
      });

      // 投递对应 preset 的 upload 任务（通过 service 创建 PipelineJob 记录）
      await this.pipeline.enqueueUploadForPreset(chapterId, preset, filePath, durationSec);
    } finally {
      await this.cleanupTemp(narrationLocal).catch(() => undefined);
      await this.cleanupTemp(musicLocal).catch(() => undefined);
    }
  }

  /** upload：上传混音成品到 S3 → 创建 mixed AudioAsset → 更新章节/旅程时长 */
  private async handleUpload(job: Job<PipelineJobData>): Promise<void> {
    const { chapterId, preset, mixedFilePath, durationSec } = job.data;
    if (!preset) throw new Error("upload 步骤缺少 preset 参数");
    if (!mixedFilePath) throw new Error(`章节 ${chapterId} 无混音成品文件路径`);

    const objectKey = PipelineService.makeObjectKey(chapterId, `mixed-${preset}`);
    const { sizeBytes } = await this.storage.uploadFile(objectKey, mixedFilePath, "audio/mp4");

    const dur = durationSec ?? 0;

    // 事务：创建 mixed AudioAsset + 更新章节时长 + 重算旅程总时长
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.audioAsset.create({
        data: {
          chapterId,
          trackType: "mixed",
          mixPreset: preset,
          objectKey,
          durationSec: dur,
          sizeBytes,
          status: "ready",
        },
      });

      // default 预置作为章节主时长
      if (preset === "default") {
        await tx.chapter.update({
          where: { id: chapterId },
          data: { durationSec: dur },
        });
        const chapter = await tx.chapter.findUnique({
          where: { id: chapterId },
          select: { journeyId: true },
        });
        if (chapter) {
          const sum = await tx.chapter.aggregate({
            where: { journeyId: chapter.journeyId },
            _sum: { durationSec: true },
          });
          await tx.journey.update({
            where: { id: chapter.journeyId },
            data: { totalDurationSec: sum._sum.durationSec ?? 0 },
          });
        }
      }

      await this.updateJobResult(chapterId, "upload", job.data.contentHash, asset.id);
    });

    await this.cleanupTemp(mixedFilePath).catch(() => undefined);
  }

  // —— 工具方法 ——

  /** 从 S3 下载到本地临时文件 */
  private async downloadToTemp(objectKey: string, prefix: string): Promise<string> {
    const output = await this.storage.send(new GetObjectCommand({
      Bucket: this.env.S3_BUCKET,
      Key: objectKey,
    }));
    const body = output.Body as NodeJS.ReadableStream | undefined;
    if (!body) throw new Error(`S3 对象为空: ${objectKey}`);

    const tmpPath = join(
      process.env.PIPELINE_TMP_DIR ?? tmpdir(),
      `${prefix}-${randomUUID()}.m4a`,
    );
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(tmpPath);
      body.pipe(ws);
      ws.on("finish", () => resolve());
      ws.on("error", reject);
      body.on("error", reject);
    });
    return tmpPath;
  }

  private async cleanupTemp(filePath: string): Promise<void> {
    await unlink(filePath).catch(() => undefined);
  }

  private mockDraftNarration(journeyTitle: string, chapterTitle: string, tags: string): string {
    return [
      `欢迎来到「${journeyTitle}」。`,
      `此刻，你正行走在${chapterTitle}。`,
      tags ? `空气中弥漫着${tags}的气息。` : "",
      "闭上眼睛，让呼吸慢慢放慢。",
      "每一次呼气，都带走一分疲惫；每一次吸气，都带来一分宁静。",
      "在这里，时间仿佛慢了下来，只剩下你和这片风景。",
      "继续往前走，脚步声轻柔地落在地面上。",
      "远处的声音若隐若现，像是在低语着什么。",
      "你感到身体越来越轻，意识越来越柔。",
      "就这样，慢慢地，慢慢地，沉入梦乡。",
    ].filter(Boolean).join("\n");
  }

  // —— DB 状态更新 ——

  private async markJobRunning(chapterId: string, step: PipelineStepName, hash: string, bullJobId: string) {
    await this.prisma.pipelineJob.update({
      where: { chapterId_step_contentHash: { chapterId, step, contentHash: hash } },
      data: { status: "running", bullJobId, attempts: { increment: 1 } },
    }).catch(() => undefined);
  }

  private async markJobCompleted(chapterId: string, step: PipelineStepName, hash: string) {
    await this.prisma.pipelineJob.update({
      where: { chapterId_step_contentHash: { chapterId, step, contentHash: hash } },
      data: { status: "completed", errorMessage: null },
    }).catch(() => undefined);
  }

  private async markJobFailed(chapterId: string, step: PipelineStepName, hash: string, error: string) {
    await this.prisma.pipelineJob.update({
      where: { chapterId_step_contentHash: { chapterId, step, contentHash: hash } },
      data: { status: "failed", errorMessage: error.slice(0, 1000) },
    }).catch(() => undefined);
  }

  private async updateJobResult(
    chapterId: string,
    step: PipelineStepName,
    hash: string,
    assetId?: string,
    resultData?: Record<string, unknown>,
  ) {
    const data: Record<string, unknown> = {};
    if (assetId) data.resultAssetId = assetId;
    if (resultData) data.resultData = resultData;
    await this.prisma.pipelineJob.update({
      where: { chapterId_step_contentHash: { chapterId, step, contentHash: hash } },
      data,
    }).catch(() => undefined);
  }

  private parseRedisUrl(url: string) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: u.pathname && u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
    };
  }
}
