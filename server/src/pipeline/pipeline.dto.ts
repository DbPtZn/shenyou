import { IsIn, IsOptional, IsString } from "class-validator";
import { PIPELINE_STEPS } from "./pipeline.constants";

/** 重跑指定步骤 */
export class RerunStepDto {
  @IsIn(PIPELINE_STEPS as unknown as string[], { message: "管线步骤不合法" })
  step!: (typeof PIPELINE_STEPS)[number];
}

/** 更新章节文案配置（音色、BGM 标签） */
export class UpdateChapterConfigDto {
  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString({ each: true })
  musicTags?: string[];
}
