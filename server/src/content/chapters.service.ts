import { Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type MixPreset,
  mixPresetSchema,
} from "@shenyou/shared";
import { BusinessException } from "../common/business.exception";
import { EntitlementService } from "../billing/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { CdnUrlService } from "./cdn-url.service";

@Injectable()
export class ChaptersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cdnUrl: CdnUrlService,
    private readonly entitlements: EntitlementService,
  ) {}

  /**
   * 签发章节播放地址：
   * 1. 章节与所属旅程必须存在且已发布；
   * 2. 付费旅程要求用户订阅有效，否则 403 业务错误；
   * 3. 取 ready 的混音成品（可按 mixPreset 指定预置版本），签发带过期的签名 CDN URL，并附断点位置。
   */
  async getPlayInfo(chapterId: string, userId: string, mixPreset?: string) {
    let preset: MixPreset | undefined;
    if (mixPreset !== undefined) {
      const parsed = mixPresetSchema.safeParse(mixPreset);
      if (!parsed.success) {
        throw new BusinessException(
          ErrorCode.ValidationFailed,
          400,
          "混音版本不存在",
        );
      }
      preset = parsed.data;
    }

    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        durationSec: true,
        journey: {
          select: { id: true, title: true, status: true, isFree: true },
        },
        audioAssets: {
          where: {
            trackType: "mixed",
            status: "ready",
            ...(preset !== undefined ? { mixPreset: preset } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { id: true, objectKey: true, durationSec: true, mixPreset: true },
        },
      },
    });
    if (!chapter || chapter.journey.status !== "published") {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在或已下架");
    }

    if (!chapter.journey.isFree) {
      const { isActive, everSubscribed } =
        await this.entitlements.hasActiveEntitlement(userId);
      if (!isActive) {
        // 曾订阅已过期 → 4002；从未订阅 → 4001
        throw new BusinessException(
          everSubscribed ? ErrorCode.SubscriptionExpired : ErrorCode.SubscriptionRequired,
          403,
          everSubscribed
            ? "会员已到期，续费后继续这段旅程"
            : "该旅程为会员专属内容，订阅后即可畅听",
        );
      }
    }

    const asset = chapter.audioAssets[0];
    if (!asset) {
      throw new BusinessException(
        ErrorCode.ContentNotFound,
        404,
        preset === "relax"
          ? "放松混音还在准备中，稍后再来试试"
          : "音频还在准备中，请稍后再试",
      );
    }

    // 统一走 CDN HMAC 签名 URL。
    // 开发态 CDN_BASE_URL 指向本机 /audio 回源代理（AudioStreamController），
    // 由服务端用 S3 SDK 从 RustFS 拉取并流式返回；
    // 生产态 CDN_BASE_URL 指向真实 CDN，边缘按同一密钥校验签名。
    const { url, expiresAt } = this.cdnUrl.signPlaybackUrl(asset.objectKey, userId);
    const history = await this.prisma.playbackHistory.findUnique({
      where: { userId_chapterId: { userId, chapterId } },
      select: { positionSec: true },
    });

    return {
      chapterId: chapter.id,
      journeyId: chapter.journey.id,
      url,
      expiresAt,
      durationSec: asset.durationSec ?? chapter.durationSec,
      mixPreset: asset.mixPreset,
      positionSec: history?.positionSec ?? 0,
    };
  }
}
