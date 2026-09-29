import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "./jwt-auth.guard";

/** 取当前登录用户：@CurrentUser() 取整个对象，@CurrentUser("userId") 取单个字段 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
