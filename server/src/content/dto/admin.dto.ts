import {
  AUDIO_TRACK_TYPES,
  CONTENT_STATUSES,
  DRAFT_STATUSES,
  MIX_PRESETS,
  type AudioTrackType,
  type ContentStatus,
  type DraftStatus,
  type MixPreset,
} from "@shenyou/shared";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/** 查询串单值归一化为数组（?status=draft → ["draft"]），多值原生透传 */
const toArray = ({ value }: { value: unknown }): unknown[] | undefined =>
  value === undefined || value === null ? undefined : Array.isArray(value) ? value : [value];

/** 管理端：旅程列表查询参数（含全部状态，与用户侧仅 published 不同） */
export class AdminJourneyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page 必须是整数" })
  @Min(1, { message: "page 从 1 开始" })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize 必须是整数" })
  @Min(1, { message: "pageSize 至少为 1" })
  @Max(100, { message: "pageSize 最大为 100" })
  pageSize?: number = 20;

  /** 标题/副标题模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: "关键词最长 80 个字符" })
  keyword?: string;

  /** 状态筛选，可多值（?status=draft&status=published） */
  @IsOptional()
  @Transform(toArray)
  @IsIn(CONTENT_STATUSES as unknown as string[], { each: true, message: "内容状态不合法" })
  status?: ContentStatus[];

  /** 标签筛选，可多值（命中任一即返回） */
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true, message: "标签必须是字符串" })
  tag?: string[];
}

/** 管理端：创建旅程（初始为 draft） */
export class CreateJourneyDto {
  @IsString()
  @IsNotEmpty({ message: "请输入旅程标题" })
  @MaxLength(80, { message: "标题最长 80 个字符" })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "副标题最长 120 个字符" })
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "封面地址最长 500 个字符" })
  coverUrl?: string;

  @IsOptional()
  @IsArray({ message: "标签必须是数组" })
  @ArrayMaxSize(10, { message: "标签最多 10 个" })
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean({ message: "isFree 必须是布尔值" })
  isFree?: boolean;
}

/** 管理端：更新旅程（含发布/下架） */
export class UpdateJourneyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "标题不能为空" })
  @MaxLength(80, { message: "标题最长 80 个字符" })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "副标题最长 120 个字符" })
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "封面地址最长 500 个字符" })
  coverUrl?: string;

  @IsOptional()
  @IsArray({ message: "标签必须是数组" })
  @ArrayMaxSize(10, { message: "标签最多 10 个" })
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean({ message: "isFree 必须是布尔值" })
  isFree?: boolean;

  @IsOptional()
  @IsIn(CONTENT_STATUSES as unknown as string[], { message: "内容状态不合法" })
  status?: ContentStatus;
}

/** 管理端：创建章节；stops 由服务层用 zod 二次校验结构 */
export class CreateChapterDto {
  /** 不传则自动排在旅程末尾 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "章节序号必须是整数" })
  @Min(1, { message: "章节序号从 1 开始" })
  index?: number;

  @IsString()
  @IsNotEmpty({ message: "请输入章节标题" })
  @MaxLength(80, { message: "标题最长 80 个字符" })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "副标题最长 120 个字符" })
  subtitle?: string;

  /** 站点时间轴：[{ timeSec, title, subtitle? }] */
  @IsOptional()
  stops?: unknown;
}

/** 管理端：更新章节；stops 由服务层用 zod 二次校验结构 */
export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "标题不能为空" })
  @MaxLength(80, { message: "标题最长 80 个字符" })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "副标题最长 120 个字符" })
  subtitle?: string;

  /** 旅程内序号（换序号即手动排序；与既有章节冲突返回 409） */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "章节序号必须是整数" })
  @Min(1, { message: "章节序号从 1 开始" })
  index?: number;

  /** 站点时间轴：[{ timeSec, title, subtitle? }] */
  @IsOptional()
  stops?: unknown;
}

/** 管理端：为章节创建音频资产并签发预签名直传 URL */
export class CreateAudioAssetDto {
  @IsIn(AUDIO_TRACK_TYPES as unknown as string[], { message: "音频轨道类型不合法" })
  trackType!: AudioTrackType;

  @IsOptional()
  @IsIn(MIX_PRESETS as unknown as string[], { message: "混音预置不合法" })
  mixPreset?: MixPreset;

  /** 原始文件名（仅用于推导扩展名） */
  @IsString()
  @IsNotEmpty({ message: "请提供文件名" })
  @MaxLength(200, { message: "文件名最长 200 个字符" })
  fileName!: string;
}

/** 上传完成回调：标记音频 ready */
export class MarkAudioReadyDto {
  @Type(() => Number)
  @IsInt({ message: "时长必须是整数秒" })
  @Min(1, { message: "时长至少 1 秒" })
  durationSec!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "文件大小必须是整数" })
  @Min(0, { message: "文件大小不能为负数" })
  sizeBytes?: number;
}

/**
 * 管理端：章节列表查询参数（草稿聚合 / 章节检索）。
 * draftStatus 可多值（?draftStatus=pending&draftStatus=rejected）。
 */
export class AdminChapterQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page 必须是整数" })
  @Min(1, { message: "page 从 1 开始" })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize 必须是整数" })
  @Min(1, { message: "pageSize 至少为 1" })
  @Max(100, { message: "pageSize 最大为 100" })
  pageSize?: number = 20;

  /** 文案审核状态筛选，可多值 */
  @IsOptional()
  @Transform(toArray)
  @IsIn(DRAFT_STATUSES as unknown as string[], { each: true, message: "文案状态不合法" })
  draftStatus?: DraftStatus[];

  /** 限定旅程（可选） */
  @IsOptional()
  @IsString()
  journeyId?: string;
}

/** 管理端：封面图预签名直传（对齐音频资产直传：服务端签发，浏览器直传 S3） */
export class CreateCoverUploadDto {
  /** 原始文件名：推导扩展名 + 限定图片类型（jpg/jpeg/png/webp） */
  @IsString()
  @IsNotEmpty({ message: "请提供文件名" })
  @MaxLength(200, { message: "文件名最长 200 个字符" })
  fileName!: string;
}

/** 管理端：章节拖拽排序后的完整顺序（旅程内全部章节 id，按新顺序排列） */
export class ReorderChaptersDto {
  @IsArray({ message: "orderedIds 必须是数组" })
  @ArrayMinSize(1, { message: "至少包含 1 个章节" })
  @ArrayMaxSize(100, { message: "单次最多 100 个章节" })
  @IsString({ each: true })
  orderedIds!: string[];
}
