import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { JourneyListQueryDto } from "./dto/content.dto";
import { JourneysService } from "./journeys.service";

/** 控制器只做请求解析/响应格式化（CLAUDE.md §4） */
@Controller("journeys")
@UseGuards(JwtAuthGuard)
export class JourneysController {
  constructor(private readonly journeysService: JourneysService) {}

  /** GET /journeys?page=1&pageSize=20&tag=雨夜 */
  @Get()
  list(@Query() query: JourneyListQueryDto) {
    return this.journeysService.listPublished(query);
  }

  /** GET /journeys/:id —— 详情含章节列表与站点时间轴 */
  @Get(":id")
  detail(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.journeysService.getDetail(id, user.userId);
  }
}
