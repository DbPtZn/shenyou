import { Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { FavoritesService } from "./favorites.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  /** POST /journeys/:id/favorite —— 收藏 */
  @Post("journeys/:id/favorite")
  add(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.favoritesService.add(user.userId, id);
  }

  /** DELETE /journeys/:id/favorite —— 取消收藏 */
  @Delete("journeys/:id/favorite")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.favoritesService.remove(user.userId, id);
  }

  /** GET /favorites —— 我的收藏列表 */
  @Get("favorites")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.favoritesService.list(user.userId);
  }
}
