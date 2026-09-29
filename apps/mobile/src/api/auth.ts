import { api } from './client';

/** 认证令牌（与 server AuthTokens 对齐） */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

/** 订阅状态（与 server User.subscriptionStatus 对齐） */
export type SubscriptionStatus = 'free' | 'trial' | 'active' | 'expired' | 'canceled';

/** 对外暴露的用户信息（与 server PublicUser 对齐） */
export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  subscriptionStatus: SubscriptionStatus;
}

/** 登录/注册响应 */
export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

/** 注册：手机号或邮箱 + 密码 */
export function register(account: string, password: string, nickname?: string): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/register', { account, password, nickname }, { skipAuth: true });
}

/** 登录 */
export function login(account: string, password: string): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/login', { account, password }, { skipAuth: true });
}

/** 退出登录：吊销当前用户全部 refresh token */
export function logout(): Promise<{ success: boolean }> {
  return api.post<{ success: boolean }>('/auth/logout');
}

/** 获取当前用户资料 */
export function getMe(): Promise<AuthUser> {
  return api.get<AuthUser>('/users/me');
}

/** 开发态专用：切换订阅状态（server 生产环境返回 404） */
export function updateDevSubscription(status: SubscriptionStatus): Promise<AuthUser> {
  return api.post<AuthUser>('/users/me/dev-subscription', { status });
}
