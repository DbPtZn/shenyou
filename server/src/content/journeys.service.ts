import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import type { Prisma } from "@prisma/client";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import type { JourneyListQueryDto } from "./dto/content.dto";

/** 列表项显式取字段（避免 N+1，CLAUDE.md §4）；章节数用 _count 聚合，不加载章节行 */
const journeyListSelect = {
  id: true,
  title: true,
  subtitle: true,
  coverUrl: true,
  tags: true,
  isFree: true,
  totalDurationSec: true,
  _count: { select: { chapters: true } },
} satisfies Prisma.JourneySelect;

@Injectable()
export class JourneysService {
  constructor(private readonly prisma: PrismaService) {}

  /** 已发布旅程列表（分页，可按标签筛选） */
  async listPublished(query: JourneyListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.JourneyWhereInput = {
      status: "published",
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.journey.count({ where }),
      this.prisma.journey.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: journeyListSelect,
      }),
    ]);
    return {
      items: rows.map(({ _count, ...journey }) => ({
        ...journey,
        chapterCount: _count.chapters,
      })),
      page,
      pageSize,
      total,
    };
  }

  /** 旅程详情：含章节时间轴与当前用户收藏状态 */
  async getDetail(journeyId: string, userId: string) {
    const journey = await this.prisma.journey.findFirst({
      where: { id: journeyId, status: "published" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        coverUrl: true,
        tags: true,
        isFree: true,
        totalDurationSec: true,
        chapters: {
          orderBy: { index: "asc" },
          select: {
            id: true,
            index: true,
            title: true,
            subtitle: true,
            durationSec: true,
            stops: true,
          },
        },
        favorites: { where: { userId }, select: { userId: true } },
      },
    });
    if (!journey) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "旅程不存在或已下架");
    }
    const { favorites, ...rest } = journey;
    return { ...rest, isFavorited: favorites.length > 0 };
  }
}
