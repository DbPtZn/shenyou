import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { ChaptersService } from "./chapters.service";

@Controller("chapters")
@UseGuards(JwtAuthGuard)
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  /**
   * GET /chapters/:id/play —— 签发带过期的签名 CDN 播放地址（含断点位置）。
   * 可选 mixPreset（default/relax）：服务端按预置混音版本取成品。
   */
  @Get(":id/play")
  play(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query("mixPreset") mixPreset?: string,
  ) {
    return this.chaptersService.getPlayInfo(id, user.userId, mixPreset);
  }
}
