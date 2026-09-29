import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { DevSubscriptionDto } from "./dto/users.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.userId);
  }

  @Post("me/dev-subscription")
  @UseGuards(JwtAuthGuard)
  updateDevSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DevSubscriptionDto,
  ) {
    return this.usersService.updateDevSubscription(user.userId, dto.status);
  }
}
