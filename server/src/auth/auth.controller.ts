import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto, RefreshTokenDto, RegisterDto } from "./dto/auth.dto";
import { JwtAuthGuard, type AuthenticatedUser } from "./jwt-auth.guard";

/** 控制器只做请求解析/响应格式化，业务规则全在 AuthService（CLAUDE.md §4） */
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** 注册：手机号/邮箱 + 密码；POST 默认 201 */
  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** 登录：敏感接口限流 5 次/分钟（CLAUDE.md §4） */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** 刷新令牌：一次一换，旧 refresh token 立即作废 */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** 退出登录：吊销当前用户全部 refresh token（可吊销） */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.userId);
    return { success: true };
  }
}
