import { Inject, Injectable, Logger } from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import { randomUUID } from "node:crypto";
import { BusinessException } from "../common/business.exception";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { contentHash } from "./content-hash";
import {
  MIX_PRESETS,
  type PipelineStepName,
} from "./pipeline.constants";
import { PipelineQueue } from "./pipeline.queue";
import type { PipelineJobData } from "./pipeline.types";

/**
 * 管线编排服务：负责任务投递、幂等控制、状态机流转。
 * 不执行任何耗时操作（AI 合成、ffmpeg），只投递 BullMQ 任务（CLAUDE.md §5）。
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PipelineQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * 触发 AI 草稿生成：生成写景文案（draft 步骤）。
   * 幂等：同一章节 + draft + 输入 hash 只生成一次。
   */
  async triggerDraft(chapterId: string, triggeredBy?: string): Promise<{ jobId: string }> {
    const chapter = await this.mustGetChapter(chapterId);
    // 输入内容 = 章节标题 + 副标题 + 旅程标题（用于生成写景文案）
    const draftInput = `${chapter.journey.title}|${chapter.title}|${chapter.subtitle ?? ""}`;
    const hash = contentHash(draftInput);

    const job = await this.findOrCreateJob(chapterId, "draft", hash);
    if (job.status === "completed") {
      return { jobId: job.bullJobId ?? job.id };
    }

    const data: PipelineJobData = { chapterId, contentHash: hash, triggeredBy };
    const { jobId } = await this.queue.enqueue("draft", data);
    await this.prisma.pipelineJob.update({
      where: { id: job.id },
      data: { bullJobId: jobId, status: "pending" },
    });
    return { jobId };
  }

  /**
   * 人工确认草稿：draftStatus → confirmed，并触发 tts + music 并行合成。
   * 未确认不消耗合成额度（宪法要求）。
   */
  async confirmDraft(chapterId: string, triggeredBy?: string): Promise<void> {
    const chapter = await this.mustGetChapter(chapterId);
    if (!chapter.narrationText) {
      throw new BusinessException(
        ErrorCode.ValidationFailed,
        400,
        "章节暂无 AI 草稿，请先生成草稿",
      );
    }
    if (chapter.draftStatus === "confirmed") {
      // 已确认：幂等，直接触发后续（若尚未执行）
      this.logger.log(`章节 ${chapterId} 草稿已确认，检查后续步骤`);
    }

    await this.prisma.chapter.update({
      where: { id: chapterId },
      data: {
        draftStatus: "confirmed",
        draftHash: contentHash(chapter.narrationText),
      },
    });

    // 并行触发 tts + music
    await Promise.all([
      this.enqueueTts(chapterId, triggeredBy),
      this.enqueueMusic(chapterId, triggeredBy),
    ]);
  }

  /** 驳回草稿：draftStatus → rejected，需重新生成 */
  async rejectDraft(chapterId: string): Promise<void> {
    await this.mustGetChapter(chapterId);
    await this.prisma.chapter.update({
      where: { id: chapterId },
      data: { draftStatus: "rejected" },
    });
  }

  /**
   * 重跑指定步骤（管理端）：清除该步骤及其下游的完成状态，重新投递。
   */
  async rerunStep(chapterId: string, step: PipelineStepName, triggeredBy?: string): Promise<string> {
    await this.mustGetChapter(chapterId);

    // 清除该步骤及下游步骤的完成记录，使幂等键重新生效
    const downstream = this.downstreamSteps(step);
    await this.prisma.pipelineJob.deleteMany({
      where: { chapterId, step: { in: [step, ...downstream] } },
    });

    switch (step) {
      case "draft":
        return (await this.triggerDraft(chapterId, triggeredBy)).jobId;
      case "tts":
        return this.enqueueTts(chapterId, triggeredBy);
      case "music":
        return this.enqueueMusic(chapterId, triggeredBy);
      case "mix":
        return this.enqueueMix(chapterId, triggeredBy);
      case "upload":
        // upload 依赖 mix 的临时文件，重跑 upload 需重新混音
        return this.enqueueMix(chapterId, triggeredBy);
    }
  }

  /** 查询章节管线状态：所有步骤的任务记录 */
  async getChapterStatus(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        title: true,
        narrationText: true,
        draftStatus: true,
        draftHash: true,
        voiceId: true,
        musicTags: true,
      },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }
    const jobs = await this.prisma.pipelineJob.findMany({
      where: { chapterId },
      orderBy: { createdAt: "asc" },
    });
    return { chapter, jobs };
  }

  // —— 内部：步骤投递 ——

  private async enqueueTts(chapterId: string, triggeredBy?: string): Promise<string> {
    const chapter = await this.mustGetChapter(chapterId);
    if (!chapter.narrationText) {
      throw new BusinessException(ErrorCode.ValidationFailed, 400, "章节无文案");
    }
    const hash = contentHash(`${chapter.narrationText}|${chapter.voiceId}`);
    const job = await this.findOrCreateJob(chapterId, "tts", hash);
    const data: PipelineJobData = { chapterId, contentHash: hash, triggeredBy };
    const { jobId } = await this.queue.enqueue("tts", data);
    await this.prisma.pipelineJob.update({
      where: { id: job.id },
      data: { bullJobId: jobId, status: "pending" },
    });
    return jobId;
  }

  private async enqueueMusic(chapterId: string, triggeredBy?: string): Promise<string> {
    const chapter = await this.mustGetChapter(chapterId);
    const hash = contentHash(`${chapter.musicTags.join(",")}|${chapter.durationSec || 30}`);
    const job = await this.findOrCreateJob(chapterId, "music", hash);
    const data: PipelineJobData = { chapterId, contentHash: hash, triggeredBy };
    const { jobId } = await this.queue.enqueue("music", data);
    await this.prisma.pipelineJob.update({
      where: { id: job.id },
      data: { bullJobId: jobId, status: "pending" },
    });
    return jobId;
  }

  /**
   * 当 tts 或 music 完成时调用：若两者均完成，则投递所有预置的 mix 任务。
   */
  async onSourceTrackReady(chapterId: string): Promise<void> {
    const [narration, music] = await Promise.all([
      this.prisma.audioAsset.findFirst({
        where: { chapterId, trackType: "narration", status: "ready" },
        select: { id: true },
      }),
      this.prisma.audioAsset.findFirst({
        where: { chapterId, trackType: "music", status: "ready" },
        select: { id: true },
      }),
    ]);

    if (narration && music) {
      this.logger.log(`章节 ${chapterId} 人声+BGM 均就绪，投递混音任务`);
      await this.enqueueMix(chapterId);
    }
  }

  private async enqueueMix(chapterId: string, triggeredBy?: string): Promise<string> {
    // 为每个预置投递一个 mix 任务（幂等键含 preset 名）
    const presets = MIX_PRESETS.map((p) => p.name);
    let lastJobId = "";
    for (const preset of presets) {
      const hash = contentHash(`${chapterId}|mix|${preset}`);
      const job = await this.findOrCreateJob(chapterId, "mix", hash);
      const data: PipelineJobData = { chapterId, contentHash: hash, preset, triggeredBy };
      const { jobId } = await this.queue.enqueue("mix", data);
      await this.prisma.pipelineJob.update({
        where: { id: job.id },
        data: { bullJobId: jobId, status: "pending" },
      });
      lastJobId = jobId;
    }
    return lastJobId;
  }

  /** 投递单个预置的 upload 任务（worker 在 mix 完成后调用） */
  async enqueueUploadForPreset(
    chapterId: string,
    preset: "default" | "relax",
    mixedFilePath: string,
    durationSec: number,
    triggeredBy?: string,
  ): Promise<string> {
    const hash = contentHash(`${chapterId}|upload|${preset}`);
    const job = await this.findOrCreateJob(chapterId, "upload", hash);
    const data: PipelineJobData = {
      chapterId,
      contentHash: hash,
      preset,
      mixedFilePath,
      durationSec,
      triggeredBy,
    };
    const { jobId } = await this.queue.enqueue("upload", data);
    await this.prisma.pipelineJob.update({
      where: { id: job.id },
      data: { bullJobId: jobId, status: "pending" },
    });
    return jobId;
  }

  // —— 内部：幂等与工具 ——

  /**
   * 幂等查找或创建 PipelineJob 记录。
   * 已完成的任务直接返回（不重复投递）。
   */
  private async findOrCreateJob(chapterId: string, step: PipelineStepName, contentHash: string) {
    const existing = await this.prisma.pipelineJob.findUnique({
      where: { chapterId_step_contentHash: { chapterId, step, contentHash } },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.pipelineJob.create({
      data: { chapterId, step, contentHash, status: "pending" },
    });
  }

  private downstreamSteps(step: PipelineStepName): PipelineStepName[] {
    const order: PipelineStepName[] = ["draft", "tts", "music", "mix", "upload"];
    const idx = order.indexOf(step);
    return idx >= 0 ? order.slice(idx + 1) : [];
  }

  private async mustGetChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        title: true,
        subtitle: true,
        narrationText: true,
        draftStatus: true,
        voiceId: true,
        musicTags: true,
        durationSec: true,
        journey: { select: { title: true } },
      },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }
    return chapter;
  }

  /** 生成临时 objectKey（供 worker 上传时使用） */
  static makeObjectKey(chapterId: string, trackType: string, ext = ".m4a"): string {
    return `audio/${chapterId}/${trackType}-${randomUUID()}${ext}`;
  }
}
