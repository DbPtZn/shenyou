import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ErrorCode } from "@shenyou/shared";
import type { Request } from "express";
import { BusinessException } from "../common/business.exception";
import { ENV, type Env } from "../config/env";

export interface AuthenticatedUser {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new BusinessException(ErrorCode.Unauthorized, 401, "请先登录");
    }
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; typ?: string }>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      if (payload.typ !== "access") {
        throw new Error("unexpected token type");
      }
      request.user = { userId: payload.sub };
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "TokenExpiredError") {
        throw new BusinessException(ErrorCode.AccessTokenExpired, 401, "登录已过期，请重新登录");
      }
      throw new BusinessException(ErrorCode.TokenInvalid, 401, "凭证无效，请重新登录");
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}
