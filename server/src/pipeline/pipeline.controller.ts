import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../content/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { PipelineQueue } from "./pipeline.queue";
import { PipelineService } from "./pipeline.service";
import { RerunStepDto } from "./pipeline.dto";

/**
 * AI 内容管线管理端接口：草稿生成/确认/驳回、步骤重跑、状态查询。
 * 全部要求 admin 角色。请求处理器只投递任务，不执行管线（CLAUDE.md §5）。
 */
@Controller("admin/pipeline")
@UseGuards(JwtAuthGuard, AdminGuard)
export class PipelineController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly queue: PipelineQueue,
  ) {}

  /** POST /admin/pipeline/chapters/:id/draft —— 触发 AI 草稿生成 */
  @Post("chapters/:id/draft")
  triggerDraft(@Param("id") chapterId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pipeline.triggerDraft(chapterId, user.userId);
  }

  /** POST /admin/pipeline/chapters/:id/draft/confirm —— 人工确认草稿，进入合成 */
  @Post("chapters/:id/draft/confirm")
  confirmDraft(@Param("id") chapterId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pipeline.confirmDraft(chapterId, user.userId);
  }

  /** POST /admin/pipeline/chapters/:id/draft/reject —— 驳回草稿 */
  @Post("chapters/:id/draft/reject")
  rejectDraft(@Param("id") chapterId: string) {
    return this.pipeline.rejectDraft(chapterId);
  }

  /** POST /admin/pipeline/chapters/:id/rerun —— 重跑指定步骤 */
  @Post("chapters/:id/rerun")
  rerunStep(
    @Param("id") chapterId: string,
    @Body() dto: RerunStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pipeline.rerunStep(chapterId, dto.step, user.userId);
  }

  /** GET /admin/pipeline/chapters/:id/status —— 查询章节管线状态 */
  @Get("chapters/:id/status")
  getChapterStatus(@Param("id") chapterId: string) {
    return this.pipeline.getChapterStatus(chapterId);
  }

  /** GET /admin/pipeline/queue/stats —— 队列状态统计 */
  @Get("queue/stats")
  getQueueStats() {
    return this.queue.getStats();
  }

  /** GET /admin/pipeline/dead-letters —— 死信队列任务 */
  @Get("dead-letters")
  getDeadLetters() {
    return this.queue.getDeadLetters();
  }
}
