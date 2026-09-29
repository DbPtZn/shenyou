import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { PlaybackListQueryDto, UpsertPlaybackDto } from "./dto/content.dto";
import { PlaybackService } from "./playback.service";

@Controller("playback")
@UseGuards(JwtAuthGuard)
export class PlaybackController {
  constructor(private readonly playbackService: PlaybackService) {}

  /** PUT /playback/:chapterId —— 记录章节播放进度（断点续播） */
  @Put(":chapterId")
  upsert(
    @Param("chapterId") chapterId: string,
    @Body() dto: UpsertPlaybackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.playbackService.upsert(user.userId, chapterId, dto.positionSec);
  }

  /** GET /playback?journeyId= —— 各章节上次位置；不传 journeyId 返回全部 */
  @Get()
  list(@Query() query: PlaybackListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.playbackService.list(user.userId, query.journeyId);
  }
}
