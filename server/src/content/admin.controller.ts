import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";
import {
  CreateAudioAssetDto,
  CreateChapterDto,
  CreateJourneyDto,
  MarkAudioReadyDto,
  UpdateJourneyDto,
} from "./dto/admin.dto";

/**
 * 管理端内容接口：旅程/章节/音频资产维护 + 预签名直传签发。
 * 全部要求 admin 角色（JwtAuthGuard 认证 → AdminGuard 鉴权）。
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

  /** POST /admin/journeys/:id/chapters —— 添加章节（含站点时间轴） */
  @Post("journeys/:id/chapters")
  createChapter(@Param("id") id: string, @Body() dto: CreateChapterDto) {
    return this.adminService.createChapter(id, dto);
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
