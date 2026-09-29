import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { ErrorCode } from "@shenyou/shared";
import * as argon2 from "argon2";
import { createHash, randomUUID } from "node:crypto";
import { BusinessException } from "../common/business.exception";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { LoginDto, RegisterDto } from "./dto/auth.dto";

const CN_PHONE_PATTERN = /^1[3-9]\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** access token 有效期（秒） */
  accessTokenExpiresIn: number;
  /** refresh token 有效期（秒） */
  refreshTokenExpiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 注册：手机号/邮箱 + 密码（argon2 哈希），成功即签发令牌 */
  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const accountField = detectAccountField(dto.account);
    if (accountField === null) {
      throw new BusinessException(ErrorCode.ValidationFailed, 400, "请输入正确的手机号或邮箱");
    }
    const existing = await this.findByAccount(dto.account);
    if (existing) {
      throw new BusinessException(ErrorCode.Conflict, 409, "该账号已注册，请直接登录");
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        [accountField]: dto.account,
        passwordHash,
        nickname: dto.nickname ?? null,
      },
    });
    const tokens = await this.issueTokens(user.id);
    return { user: toPublicUser(user), tokens };
  }

  /** 登录：用户不存在与密码错误返回同一文案，避免账号枚举 */
  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: AuthTokens }> {
    const user = await this.findByAccount(dto.account);
    if (!user) {
      throw new BusinessException(ErrorCode.Unauthorized, 401, "账号或密码不正确");
    }
    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new BusinessException(ErrorCode.Unauthorized, 401, "账号或密码不正确");
    }
    const tokens = await this.issueTokens(user.id);
    return { user: toPublicUser(user), tokens };
  }

  /** 刷新令牌：一次一换（旧 token 立即作废）；重放旧 token 视为泄露，吊销全部会话 */
  async refresh(refreshToken: string): Promise<{ tokens: AuthTokens }> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.userId !== payload.sub) {
      throw new BusinessException(ErrorCode.TokenInvalid, 401, "凭证无效，请重新登录");
    }
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new BusinessException(ErrorCode.RefreshTokenRevoked, 401, "登录状态异常，请重新登录");
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new BusinessException(ErrorCode.AccessTokenExpired, 401, "登录已过期，请重新登录");
    }

    const tokens = await this.signTokens(stored.userId);
    // 一次一换的两步写入放在事务里（CLAUDE.md §4）
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + this.env.JWT_REFRESH_TTL_SEC * 1000),
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
    });
    return { tokens };
  }

  /** 退出登录：吊销当前用户全部未失效的 refresh token */
  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 签发一对 token 并持久化 refresh token 哈希（注册/登录用） */
  private async issueTokens(userId: string): Promise<AuthTokens> {
    const tokens = await this.signTokens(userId);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(tokens.refreshToken),
        expiresAt: new Date(Date.now() + this.env.JWT_REFRESH_TTL_SEC * 1000),
      },
    });
    return tokens;
  }

  private async signTokens(userId: string): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, typ: "access" },
        { secret: this.env.JWT_ACCESS_SECRET, expiresIn: this.env.JWT_ACCESS_TTL_SEC },
      ),
      this.jwtService.signAsync(
        { sub: userId, typ: "refresh", jti: randomUUID() },
        { secret: this.env.JWT_REFRESH_SECRET, expiresIn: this.env.JWT_REFRESH_TTL_SEC },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      accessTokenExpiresIn: this.env.JWT_ACCESS_TTL_SEC,
      refreshTokenExpiresIn: this.env.JWT_REFRESH_TTL_SEC,
    };
  }

  private async verifyRefreshToken(token: string): Promise<{ sub: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; typ?: string }>(token, {
        secret: this.env.JWT_REFRESH_SECRET,
      });
      if (payload.typ !== "refresh") {
        throw new Error("unexpected token type");
      }
      return payload;
    } catch {
      throw new BusinessException(ErrorCode.TokenInvalid, 401, "凭证无效，请重新登录");
    }
  }

  private findByAccount(account: string): Promise<User | null> {
    const field = detectAccountField(account);
    if (field === "phone") return this.prisma.user.findUnique({ where: { phone: account } });
    if (field === "email") return this.prisma.user.findUnique({ where: { email: account } });
    return Promise.resolve(null);
  }
}

/** 对外暴露的用户信息：绝不包含 passwordHash */
export interface PublicUser {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  subscriptionStatus: string;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    nickname: user.nickname,
    subscriptionStatus: user.subscriptionStatus,
  };
}

function detectAccountField(account: string): "phone" | "email" | null {
  if (CN_PHONE_PATTERN.test(account)) return "phone";
  if (EMAIL_PATTERN.test(account)) return "email";
  return null;
}

/** refresh token 只存 SHA-256 哈希，泄露数据库也无法伪造会话 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
