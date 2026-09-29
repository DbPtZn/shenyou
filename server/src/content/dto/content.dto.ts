import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** 旅程列表查询参数 */
export class JourneyListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page 必须是整数" })
  @Min(1, { message: "page 从 1 开始" })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize 必须是整数" })
  @Min(1, { message: "pageSize 至少为 1" })
  @Max(50, { message: "pageSize 最大为 50" })
  pageSize?: number = 20;

  /** 按单个标签筛选 */
  @IsOptional()
  @IsString()
  tag?: string;
}

/** 断点续播上报 */
export class UpsertPlaybackDto {
  @Type(() => Number)
  @IsInt({ message: "播放位置必须是整数秒" })
  @Min(0, { message: "播放位置不能为负数" })
  positionSec!: number;
}

/** 断点续播查询参数 */
export class PlaybackListQueryDto {
  /** 传入则只返回该旅程下各章节的上次位置 */
  @IsOptional()
  @IsString()
  journeyId?: string;
}
