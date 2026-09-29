import {
  AUDIO_TRACK_TYPES,
  CONTENT_STATUSES,
  MIX_PRESETS,
  type AudioTrackType,
  type ContentStatus,
  type MixPreset,
} from "@shenyou/shared";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

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
