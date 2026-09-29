import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue, type ConnectionOptions } from "bullmq";
import { ENV, type Env } from "../config/env";
import { PIPELINE_QUEUE, type PipelineStepName } from "./pipeline.constants";
import type { PipelineJobData } from "./pipeline.types";

/**
 * BullMQ 队列封装：负责管线任务的投递。
 * 请求处理器只通过此队列投递任务，不直接执行管线（CLAUDE.md §5）。
 */
@Injectable()
export class PipelineQueue implements OnModuleDestroy {
  private readonly queue: Queue<PipelineJobData>;

  constructor(@Inject(ENV) private readonly env: Env) {
    const connection = this.parseRedisUrl(env.REDIS_URL);
    this.queue = new Queue<PipelineJobData>(PIPELINE_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: env.PIPELINE_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }

  /**
   * 投递一个管线步骤任务。
   * 幂等：jobId = `${chapterId}:${step}:${contentHash}`，BullMQ 会拒绝重复 ID。
   * 若任务已存在（如重跑场景），先移除旧任务再投递。
   */
  async enqueue(
    step: PipelineStepName,
    data: PipelineJobData,
  ): Promise<{ jobId: string; duplicated: boolean }> {
    const jobId = `${data.chapterId}:${step}:${data.contentHash}`;
    try {
      const job = await this.queue.add(step, data, { jobId });
      return { jobId: job.id ?? jobId, duplicated: false };
    } catch {
      // 重复 jobId：先移除旧任务再重新投递（重跑场景）
      await this.queue.remove(jobId).catch(() => undefined);
      const job = await this.queue.add(step, data, { jobId });
      return { jobId: job.id ?? jobId, duplicated: true };
    }
  }

  /** 重跑指定步骤（用于管理端）：先移除旧任务再重新投递 */
  async rerun(step: PipelineStepName, data: PipelineJobData): Promise<string> {
    const jobId = `${data.chapterId}:${step}:${data.contentHash}`;
    await this.queue.remove(jobId).catch(() => undefined);
    const job = await this.queue.add(step, data, { jobId });
    return job.id ?? jobId;
  }

  /** 查询队列状态（管理端） */
  async getStats() {
    const [counts, jobs] = await Promise.all([
      this.queue.getJobCounts("active", "completed", "failed", "delayed", "waiting"),
      this.queue.getJobs(["active", "delayed", "waiting"], 0, 19),
    ]);
    return {
      counts,
      recent: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        state: j.getState(),
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
      })),
    };
  }

  /** 获取死信（失败且重试耗尽）的任务 */
  async getDeadLetters() {
    // BullMQ 重试耗尽后任务保留在队列中，状态为 failed，即可视作死信
    const jobs = await this.queue.getJobs(["failed"], 0, 99);
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      failedReason: j.failedReason,
      attemptsMade: j.attemptsMade,
    }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  private parseRedisUrl(url: string): ConnectionOptions {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: u.pathname && u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0,
    };
  }
}
