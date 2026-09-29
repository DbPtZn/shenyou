import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import { BusinessException } from "../common/business.exception";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlaybackService {
  constructor(private readonly prisma: PrismaService) {}

  /** 记录播放进度（断点续播；节流由客户端负责，服务端幂等 upsert） */
  async upsert(userId: string, chapterId: string, positionSec: number) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }
    return this.prisma.playbackHistory.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      create: { userId, chapterId, positionSec },
      update: { positionSec },
      select: { chapterId: true, positionSec: true, updatedAt: true },
    });
  }

  /** 各章节上次播放位置；传 journeyId 则只返回该旅程下的记录 */
  async list(userId: string, journeyId?: string) {
    return this.prisma.playbackHistory.findMany({
      where: {
        userId,
        ...(journeyId ? { chapter: { journeyId } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        chapterId: true,
        positionSec: true,
        updatedAt: true,
        chapter: { select: { journeyId: true, index: true, title: true } },
      },
    });
  }
}
