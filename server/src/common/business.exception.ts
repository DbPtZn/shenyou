import type { ErrorCodeValue } from "@shenyou/shared";

/**
 * 类型化业务异常：由全局过滤器统一转成 { code, message, requestId }。
 * message 必须是面向用户的中文文案，不含任何内部细节。
 */
export class BusinessException extends Error {
  constructor(
    public readonly code: ErrorCodeValue,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "BusinessException";
  }
}
