import {
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
  Catch,
  HttpException,
} from "@nestjs/common";
import { ErrorCode, type ErrorCodeValue } from "@shenyou/shared";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { BusinessException } from "./business.exception";

const HTTP_STATUS_TO_CODE: Record<number, ErrorCodeValue> = {
  400: ErrorCode.ValidationFailed,
  401: ErrorCode.Unauthorized,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  409: ErrorCode.Conflict,
  429: ErrorCode.RateLimited,
};

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "请求参数有误",
  401: "请先登录",
  403: "没有权限执行此操作",
  404: "请求的内容不存在",
  409: "数据冲突，请刷新后重试",
  429: "操作太频繁了，请稍后再试",
};

/**
 * 全局异常过滤器：客户端永远只看到 { code, message, requestId }，绝不暴露堆栈（CLAUDE.md §4）。
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    // body 解析失败等早期错误发生在 pino 中间件之前，此时 req.id 尚未生成
    const requestId = request.id ?? randomUUID();

    let httpStatus = 500;
    let code: ErrorCodeValue = ErrorCode.Unknown;
    let message = "服务器开小差了，请稍后再试";

    if (exception instanceof BusinessException) {
      httpStatus = exception.httpStatus;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      code = HTTP_STATUS_TO_CODE[httpStatus] ?? ErrorCode.Unknown;
      message = this.extractHttpMessage(exception) ?? DEFAULT_MESSAGES[httpStatus] ?? message;
    }

    if (httpStatus >= 500) {
      // 5xx 不向外暴露任何细节；完整错误只进结构化日志
      this.logger.error({ err: exception, requestId }, "Unhandled exception");
    } else {
      this.logger.warn({ code, requestId }, message);
    }

    response.status(httpStatus).json({ code, message, requestId });
  }

  /** ValidationPipe 抛出的 BadRequestException，message 是 DTO 上的中文校验文案数组 */
  private extractHttpMessage(exception: HttpException): string | undefined {
    const body = exception.getResponse();
    if (typeof body === "object" && body !== null && "message" in body) {
      const msg = (body as { message?: unknown }).message;
      if (Array.isArray(msg)) {
        return msg.filter((m): m is string => typeof m === "string").join("；") || undefined;
      }
      if (typeof msg === "string" && !msg.startsWith("Cannot ")) return msg;
    }
    return undefined;
  }
}
