import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { ErrorCode } from "@shenyou/shared";
import type { Request } from "express";
import { map, type Observable } from "rxjs";

/**
 * 成功响应统一封装为 { code, message, requestId, data }，
 * 与 packages/shared 的 apiResponseSchema 对齐。
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { id?: string }>();
    return next.handle().pipe(
      map((data: unknown) => ({
        code: ErrorCode.Success,
        message: "ok",
        requestId: request.id ?? "unknown",
        data: data ?? null,
      })),
    );
  }
}
