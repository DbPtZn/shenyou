import { z } from "zod";

/**
 * 统一 API 响应封装（见 CLAUDE.md §4：客户端永远只看到 { code, message, requestId }，成功时附带 data）。
 *
 * 用法：
 *   const JourneyListResponse = apiResponseSchema(z.array(journeySchema));
 *   type JourneyListResponse = ApiResponse<typeof journeySchema[]>;
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    /** 业务错误码，0 表示成功，其余见 ErrorCode */
    code: z.number().int(),
    /** 面向用户的中文提示文案 */
    message: z.string(),
    /** 链路追踪 ID，贯穿结构化日志 */
    requestId: z.string(),
    /** 业务数据载荷，类型由传入 schema 推导 */
    data: dataSchema,
  });

export type ApiResponse<T extends z.ZodTypeAny> = z.infer<ReturnType<typeof apiResponseSchema<T>>>;
