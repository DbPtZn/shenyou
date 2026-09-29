import { Inject, Injectable } from "@nestjs/common";
import { ErrorCode, chapterStopSchema } from "@shenyou/shared";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BusinessException } from "../common/business.exception";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateAudioAssetDto,
  CreateChapterDto,
  CreateJourneyDto,
  MarkAudioReadyDto,
  UpdateJourneyDto,
} from "./dto/admin.dto";
import { StorageService } from "./storage.service";

const stopsArraySchema = z.array(chapterStopSchema);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 创建旅程（初始为草稿） */
  createJourney(dto: CreateJourneyDto) {
    return this.prisma.journey.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle ?? null,
        coverUrl: dto.coverUrl ?? null,
        tags: dto.tags ?? [],
        isFree: dto.isFree ?? false,
      },
    });
  }

  /** 更新旅程（含发布/下架） */
  async updateJourney(journeyId: string, dto: UpdateJourneyDto) {
    await this.mustGetJourney(journeyId);
    return this.prisma.journey.update({
      where: { id: journeyId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.isFree !== undefined ? { isFree: dto.isFree } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /** 创建章节；不传 index 自动排在旅程末尾；stops 用 zod 校验结构 */
  async createChapter(journeyId: string, dto: CreateChapterDto) {
    await this.mustGetJourney(journeyId);

    let stops: Prisma.InputJsonValue = [];
    if (dto.stops !== undefined) {
      const parsed = stopsArraySchema.safeParse(dto.stops);
      if (!parsed.success) {
        throw new BusinessException(
          ErrorCode.ValidationFailed,
          400,
          "站点时间轴格式不正确（应为 [{ timeSec, title, subtitle? }]）",
        );
      }
      stops = parsed.data;
    }

    const index =
      dto.index ??
      ((await this.prisma.chapter.aggregate({
        where: { journeyId },
        _max: { index: true },
      }))._max.index ?? 0) + 1;

    try {
      return await this.prisma.chapter.create({
        data: {
          journeyId,
          index,
          title: dto.title,
          subtitle: dto.subtitle ?? null,
          stops,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BusinessException(ErrorCode.Conflict, 409, "该章节序号已存在");
      }
      throw error;
    }
  }

  /** 创建音频资产（processing）并签发 S3 预签名直传 URL */
  async createAudioAsset(chapterId: string, dto: CreateAudioAssetDto) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }
    const objectKey = `audio/${chapterId}/${randomUUID()}${safeExtension(dto.fileName)}`;
    const asset = await this.prisma.audioAsset.create({
      data: {
        chapterId,
        trackType: dto.trackType,
        mixPreset: dto.mixPreset ?? "default",
        objectKey,
      },
    });
    const uploadUrl = await this.storage.createPresignedUploadUrl(objectKey);
    return {
      assetId: asset.id,
      objectKey,
      uploadUrl,
      uploadExpiresInSec: this.env.S3_PRESIGN_TTL_SEC,
    };
  }

  /**
   * 上传完成回调：标记 ready；混音成品就绪时同步章节时长，
   * 并在事务内重算旅程总时长（多步写入用事务，CLAUDE.md §4）。
   */
  async markAudioReady(assetId: string, dto: MarkAudioReadyDto) {
    const asset = await this.prisma.audioAsset.findUnique({
      where: { id: assetId },
      select: { id: true, chapterId: true, trackType: true, status: true },
    });
    if (!asset) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "音频资产不存在");
    }
    if (asset.status === "ready") {
      return { assetId, status: "ready" as const };
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.audioAsset.update({
        where: { id: assetId },
        data: {
          status: "ready",
          durationSec: dto.durationSec,
          ...(dto.sizeBytes !== undefined ? { sizeBytes: dto.sizeBytes } : {}),
        },
        select: { id: true, status: true },
      });

      if (asset.trackType === "mixed") {
        await tx.chapter.update({
          where: { id: asset.chapterId },
          data: { durationSec: dto.durationSec },
        });
        const chapter = await tx.chapter.findUnique({
          where: { id: asset.chapterId },
          select: { journeyId: true },
        });
        if (chapter) {
          const sum = await tx.chapter.aggregate({
            where: { journeyId: chapter.journeyId },
            _sum: { durationSec: true },
          });
          await tx.journey.update({
            where: { id: chapter.journeyId },
            data: { totalDurationSec: sum._sum.durationSec ?? 0 },
          });
        }
      }
      return { assetId: updated.id, status: updated.status };
    });
  }

  private async mustGetJourney(journeyId: string) {
    const journey = await this.prisma.journey.findUnique({
      where: { id: journeyId },
      select: { id: true },
    });
    if (!journey) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "旅程不存在");
    }
  }
}

/** 从原始文件名提取安全的扩展名（仅字母数字，最长 8 位），无扩展名则用 .bin */
function safeExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  return match ? `.${match[1]!.toLowerCase()}` : ".bin";
}
