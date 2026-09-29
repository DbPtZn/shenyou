import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 收藏旅程（幂等） */
  async add(userId: string, journeyId: string) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, status: "published" },
      select: { id: true },
    });
    if (!journey) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "旅程不存在或已下架");
    }
    await this.prisma.favorite.upsert({
      where: { userId_journeyId: { userId, journeyId } },
      create: { userId, journeyId },
      update: {},
    });
    return { journeyId, favorited: true };
  }

  /** 取消收藏（幂等） */
  async remove(userId: string, journeyId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, journeyId } });
    return { journeyId, favorited: false };
  }

  /** 我的收藏列表（只含仍已发布的旅程） */
  async list(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, journey: { status: "published" } },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        journey: {
          select: {
            id: true,
            title: true,
            subtitle: true,
            coverUrl: true,
            tags: true,
            isFree: true,
            totalDurationSec: true,
          },
        },
      },
    });
    return favorites.map(({ createdAt, journey }) => ({ ...journey, favoritedAt: createdAt }));
  }
}
