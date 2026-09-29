/**
 * 通用错误码常量。
 * 客户端永远只看到 { code, message, requestId }，绝不暴露堆栈（CLAUDE.md §4）。
 * 分段约定：0 成功；1xxx 通用；2xxx 认证；3xxx 内容；4xxx 订阅。
 */
export const ErrorCode = {
  Success: 0,

  // 通用 1xxx
  Unknown: 1000,
  ValidationFailed: 1001,
  Unauthorized: 1002,
  Forbidden: 1003,
  NotFound: 1004,
  Conflict: 1005,
  RateLimited: 1006,
  Unavailable: 1007,

  // 认证 2xxx
  AccessTokenExpired: 2001,
  TokenInvalid: 2002,
  RefreshTokenRevoked: 2003,

  // 内容 3xxx
  ContentNotFound: 3001,
  ContentOffline: 3002,

  // 订阅 4xxx
  SubscriptionRequired: 4001,
  SubscriptionExpired: 4002,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
