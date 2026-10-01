import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import {
  AdminChapterQueryDto,
  AdminJourneyQueryDto,
  CreateAudioAssetDto,
  CreateChapterDto,
  CreateCoverUploadDto,
  CreateJourneyDto,
  MarkAudioReadyDto,
  ReorderChaptersDto,
  UpdateChapterDto,
  UpdateJourneyDto,
} from "./dto/admin.dto";

/**
 * 管理端内容接口：旅程/章节/音频资产维护 + 预签名直传签发。
 * 全部要求 admin 角色（JwtAuthGuard 认证 → AdminGuard 鉴权）。
 * 读取接口返回全部状态（含草稿），与用户侧仅 published 不同。
 * 数据看板统计接口在 StatsModule（/admin/stats）。
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** GET /admin/journeys —— 旅程列表（分页 + keyword/status/tag 筛选，含全部状态） */
  @Get("journeys")
  listJourneys(@Query() query: AdminJourneyQueryDto) {
    return this.adminService.listJourneys(query);
  }

  /** GET /admin/journeys/:id —— 旅程详情（章节 + 每章资产与管线摘要，编辑页一次性上下文） */
  @Get("journeys/:id")
  getJourneyDetail(@Param("id") id: string) {
    return this.adminService.getJourneyDetail(id);
  }

  /**
   * GET /admin/chapters —— 章节列表（草稿聚合 / 按文案状态筛选，分页，带旅程标题）。
   * 审核动线专用，替代客户端聚合旅程详情。
   */
  @Get("chapters")
  listChapters(@Query() query: AdminChapterQueryDto) {
    return this.adminService.listChapters(query);
  }

  /** GET /admin/chapters/:id —— 章节详情（含文案/审核状态与音频资产 ID） */
  @Get("chapters/:id")
  getChapterDetail(@Param("id") id: string) {
    return this.adminService.getChapterDetail(id);
  }

  /** GET /admin/chapters/:chapterId/audio-assets —— 章节音频资产列表 */
  @Get("chapters/:chapterId/audio-assets")
  listChapterAudioAssets(@Param("chapterId") chapterId: string) {
    return this.adminService.listChapterAudioAssets(chapterId);
  }

  /**
   * GET /admin/audio-assets/:assetId/play-url —— 管理端试听：签发 HMAC 签名播放地址。
   * 前端禁止用 objectKey 直接拼 URL；签名绑定 objectKey + 过期时间 + 管理员 userId。
   */
  @Get("audio-assets/:assetId/play-url")
  signAssetPlayUrl(
    @Param("assetId") assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminService.signAssetPlayUrl(assetId, user.userId);
  }

  /** POST /admin/journeys —— 创建旅程（草稿） */
  @Post("journeys")
  createJourney(@Body() dto: CreateJourneyDto) {
    return this.adminService.createJourney(dto);
  }

  /** PATCH /admin/journeys/:id —— 更新旅程 / 发布（status=published）/ 下架 */
  @Patch("journeys/:id")
  updateJourney(@Param("id") id: string, @Body() dto: UpdateJourneyDto) {
    return this.adminService.updateJourney(id, dto);
  }

  /** DELETE /admin/journeys/:id —— 删除旅程（已发布须先下架；级联删除 + 对象存储清理） */
  @Delete("journeys/:id")
  deleteJourney(@Param("id") id: string) {
    return this.adminService.deleteJourney(id);
  }

  /** PATCH /admin/chapters/:id —— 更新章节（标题/副标题/序号/站点时间轴） */
  @Patch("chapters/:id")
  updateChapter(@Param("id") id: string, @Body() dto: UpdateChapterDto) {
    return this.adminService.updateChapter(id, dto);
  }

  /** PATCH /admin/journeys/:id/chapters/reorder —— 章节拖拽排序（orderedIds 为完整新顺序） */
  @Patch("journeys/:id/chapters/reorder")
  reorderChapters(@Param("id") id: string, @Body() dto: ReorderChaptersDto) {
    return this.adminService.reorderChapters(id, dto);
  }

  /** POST /admin/journeys/:id/chapters —— 添加章节（含站点时间轴） */
  @Post("journeys/:id/chapters")
  createChapter(@Param("id") id: string, @Body() dto: CreateChapterDto) {
    return this.adminService.createChapter(id, dto);
  }

  /** POST /admin/cover-uploads —— 封面图预签名直传签发（返回 uploadUrl + 稳定 coverUrl） */
  @Post("cover-uploads")
  createCoverUpload(@Body() dto: CreateCoverUploadDto) {
    return this.adminService.createCoverUpload(dto);
  }

  /** POST /admin/chapters/:chapterId/audio-assets —— 创建音频资产并签发预签名直传 URL */
  @Post("chapters/:chapterId/audio-assets")
  createAudioAsset(@Param("chapterId") chapterId: string, @Body() dto: CreateAudioAssetDto) {
    return this.adminService.createAudioAsset(chapterId, dto);
  }

  /** POST /admin/audio-assets/:assetId/ready —— 上传完成回调，标记 ready */
  @Post("audio-assets/:assetId/ready")
  markAudioReady(@Param("assetId") assetId: string, @Body() dto: MarkAudioReadyDto) {
    return this.adminService.markAudioReady(assetId, dto);
  }
}
