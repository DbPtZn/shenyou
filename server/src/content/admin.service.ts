import { Inject, Injectable, Logger } from "@nestjs/common";
import { ErrorCode, chapterStopSchema } from "@shenyou/shared";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BusinessException } from "../common/business.exception";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type {
  AdminChapterQueryDto,
  AdminJourneyQueryDto,
  CreateAudioAssetDto,
  CreateChapterDto,
  CreateCoverUploadDto,
  CreateJourneyDto,
  MarkAudioReadyDto,
  ReorderChaptersDto,
  UpdateChapterDto,
  UpdateJourneyDto,
} from "./dto/admin.dto";
import { CdnUrlService } from "./cdn-url.service";
import { StorageService } from "./storage.service";

const stopsArraySchema = z.array(chapterStopSchema);

/** 管理端旅程列表显式取字段（避免 N+1，CLAUDE.md §4）；章节数用 _count 聚合 */
const adminJourneyListSelect = {
  id: true,
  title: true,
  subtitle: true,
  coverUrl: true,
  tags: true,
  isFree: true,
  status: true,
  totalDurationSec: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { chapters: true } },
} satisfies Prisma.JourneySelect;

/** 音频资产摘要字段（前端上传后需用 id 调 ready 回调，id 必须透出） */
const audioAssetSummarySelect = {
  id: true,
  trackType: true,
  mixPreset: true,
  objectKey: true,
  durationSec: true,
  sizeBytes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AudioAssetSelect;

/** 管线任务摘要字段（含失败原因 errorMessage） */
const pipelineJobSummarySelect = {
  id: true,
  step: true,
  status: true,
  contentHash: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PipelineJobSelect;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cdnUrl: CdnUrlService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * 管理端旅程列表：返回全部状态（与用户侧仅 published 的关键区别）。
   * keyword 模糊匹配标题/副标题；status/tag 支持多值筛选。
   */
  async listJourneys(query: AdminJourneyQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.JourneyWhereInput = {
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: "insensitive" } },
              { subtitle: { contains: query.keyword, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.tag?.length ? { tags: { hasSome: query.tag } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.journey.count({ where }),
      this.prisma.journey.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: adminJourneyListSelect,
      }),
    ]);
    return {
      items: rows.map(({ _count, ...journey }) => ({
        ...journey,
        chapterCount: _count.chapters,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 管理端旅程详情：旅程全字段 + 章节数组（按 index 升序）+ 每章资产/管线摘要 */
  async getJourneyDetail(journeyId: string) {
    const journey = await this.prisma.journey.findUnique({
      where: { id: journeyId },
      select: {
        id: true,
        title: true,
        subtitle: true,
        coverUrl: true,
        tags: true,
        isFree: true,
        status: true,
        totalDurationSec: true,
        createdAt: true,
        updatedAt: true,
        chapters: {
          orderBy: { index: "asc" },
          select: {
            id: true,
            index: true,
            title: true,
            subtitle: true,
            stops: true,
            durationSec: true,
            draftStatus: true,
            audioAssets: {
              orderBy: [{ trackType: "asc" }, { mixPreset: "asc" }],
              select: audioAssetSummarySelect,
            },
            pipelineJobs: {
              orderBy: { createdAt: "asc" },
              select: pipelineJobSummarySelect,
            },
          },
        },
      },
    });
    if (!journey) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "旅程不存在");
    }
    return journey;
  }

  /** 管理端章节详情：全字段（含文案/审核状态/音色/BGM 标签）+ 资产 + 管线任务 */
  async getChapterDetail(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        journeyId: true,
        index: true,
        title: true,
        subtitle: true,
        stops: true,
        durationSec: true,
        narrationText: true,
        draftStatus: true,
        draftHash: true,
        voiceId: true,
        musicTags: true,
        createdAt: true,
        updatedAt: true,
        audioAssets: {
          orderBy: [{ trackType: "asc" }, { mixPreset: "asc" }],
          select: audioAssetSummarySelect,
        },
        pipelineJobs: {
          orderBy: { createdAt: "asc" },
          select: pipelineJobSummarySelect,
        },
      },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }
    return chapter;
  }

  /** 章节音频资产列表（字段平铺，trackType/mixPreset 分组视图由前端组装） */
  async listChapterAudioAssets(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }
    return this.prisma.audioAsset.findMany({
      where: { chapterId },
      orderBy: [{ trackType: "asc" }, { mixPreset: "asc" }],
      select: audioAssetSummarySelect,
    });
  }

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

  /** 更新章节（标题/副标题/序号/站点时间轴）；序号与既有章节冲突返回 409 */
  async updateChapter(chapterId: string, dto: UpdateChapterDto) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true },
    });
    if (!chapter) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "章节不存在");
    }

    let stops: Prisma.InputJsonValue | undefined;
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

    try {
      return await this.prisma.chapter.update({
        where: { id: chapterId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle } : {}),
          ...(dto.index !== undefined ? { index: dto.index } : {}),
          ...(stops !== undefined ? { stops } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BusinessException(ErrorCode.Conflict, 409, "该章节序号已被其他章节占用");
      }
      throw error;
    }
  }

  /**
   * 删除旅程：已发布须先下架（防误删线上内容）。
   * DB 按 schema 级联删除章节/音频资产/管线任务/播放记录/收藏；
   * 对象存储中的音频文件尽力清理——失败不影响删除结果（残留对象可后续 GC），记 warning。
   */
  async deleteJourney(journeyId: string) {
    const journey = await this.prisma.journey.findUnique({
      where: { id: journeyId },
      select: {
        id: true,
        status: true,
        chapters: { select: { audioAssets: { select: { objectKey: true } } } },
      },
    });
    if (!journey) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "旅程不存在");
    }
    if (journey.status === "published") {
      throw new BusinessException(ErrorCode.Conflict, 409, "旅程已发布，不能直接删除，请先下架");
    }

    const objectKeys = journey.chapters.flatMap((c) => c.audioAssets.map((a) => a.objectKey));
    await this.prisma.journey.delete({ where: { id: journeyId } });

    if (objectKeys.length > 0) {
      try {
        await this.storage.deleteObjects(objectKeys);
      } catch (error) {
        this.logger.warn({ journeyId, objectCount: objectKeys.length, err: error }, "旅程已删除，但对象存储清理失败");
      }
    }
    return { id: journeyId, deleted: true as const, removedObjects: objectKeys.length };
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

  /**
   * 管理端试听：校验资产存在后签发 HMAC 签名播放地址（绑定管理员 userId，防盗链）。
   * 复用与用户侧一致的 CdnUrlService，不绕过签名机制。
   */
  async signAssetPlayUrl(assetId: string, adminUserId: string) {
    const asset = await this.prisma.audioAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        objectKey: true,
        status: true,
        durationSec: true,
        mixPreset: true,
      },
    });
    if (!asset) {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "音频资产不存在");
    }
    if (asset.status !== "ready") {
      throw new BusinessException(ErrorCode.ContentNotFound, 404, "音频还未就绪，暂不能试听");
    }
    const { url, expiresAt } = this.cdnUrl.signPlaybackUrl(asset.objectKey, adminUserId);
    return {
      url,
      expiresAt,
      durationSec: asset.durationSec,
      mixPreset: asset.mixPreset,
    };
  }

  /**
   * 章节列表（草稿聚合 / 章节检索）：直接按条件查章节，带旅程标题。
   * narrationPreview 为服务端截断的前 100 字符；完整文案走章节详情。
   */
  async listChapters(query: AdminChapterQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ChapterWhereInput = {
      ...(query.draftStatus?.length ? { draftStatus: { in: query.draftStatus } } : {}),
      ...(query.journeyId ? { journeyId: query.journeyId } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.chapter.count({ where }),
      this.prisma.chapter.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          journeyId: true,
          index: true,
          title: true,
          subtitle: true,
          draftStatus: true,
          durationSec: true,
          updatedAt: true,
          narrationText: true,
          journey: { select: { title: true } },
        },
      }),
    ]);
    return {
      items: rows.map(({ narrationText, journey, ...chapter }) => ({
        ...chapter,
        journeyTitle: journey.title,
        narrationPreview: narrationText ? narrationText.slice(0, 100) : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 封面图预签名直传：服务端只签发，浏览器直传 S3（文件不经后端）。
   * 返回的 coverUrl 是经公共图片代理 /images 的稳定地址（基址取 CDN_BASE_URL 的 origin）。
   */
  async createCoverUpload(dto: CreateCoverUploadDto) {
    const ext = coverImageExtension(dto.fileName);
    const objectKey = `covers/${randomUUID()}${ext}`;
    const uploadUrl = await this.storage.createPresignedUploadUrl(objectKey);
    const origin = new URL(this.env.CDN_BASE_URL).origin;
    return {
      objectKey,
      uploadUrl,
      coverUrl: `${origin}/images/${objectKey}`,
      expiresInSec: this.env.S3_PRESIGN_TTL_SEC,
    };
  }

  /**
   * 章节拖拽排序：orderedIds 必须与旅程现有章节集合完全一致（防并发漏排）。
   * 两步更新（先全部置负序号再置最终序号），避开 @@unique([journeyId, index]) 冲突。
   */
  async reorderChapters(journeyId: string, dto: ReorderChaptersDto) {
    await this.mustGetJourney(journeyId);

    const chapters = await this.prisma.chapter.findMany({
      where: { journeyId },
      select: { id: true },
    });
    const existingIds = new Set(chapters.map((c) => c.id));
    const orderedIds = dto.orderedIds;
    const sameSet =
      orderedIds.length === chapters.length && orderedIds.every((id) => existingIds.has(id));
    const noDuplicates = new Set(orderedIds).size === orderedIds.length;
    if (!sameSet || !noDuplicates) {
      throw new BusinessException(
        ErrorCode.ValidationFailed,
        400,
        "章节列表与旅程现有章节不一致，请刷新后重试",
      );
    }

    await this.prisma.$transaction([
      ...orderedIds.map((id, i) =>
        this.prisma.chapter.update({ where: { id }, data: { index: -(i + 1) } }),
      ),
      ...orderedIds.map((id, i) =>
        this.prisma.chapter.update({ where: { id }, data: { index: i + 1 } }),
      ),
    ]);
    return { orderedIds };
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

/** 封面图扩展名白名单：仅 jpg/jpeg/png/webp，非法类型 400 */
function coverImageExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  const ext = match ? match[1]!.toLowerCase() : "";
  const allowed: Record<string, string> = {
    jpg: ".jpg",
    jpeg: ".jpeg",
    png: ".png",
    webp: ".webp",
  };
  const normalized = allowed[ext];
  if (!normalized) {
    throw new BusinessException(
      ErrorCode.ValidationFailed,
      400,
      "封面仅支持 JPG / PNG / WebP 格式",
    );
  }
  return normalized;
}
