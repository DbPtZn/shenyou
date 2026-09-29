import { useUIStore } from '@/state/ui-store';
import { clearAll, getAccessToken, getRefreshToken, saveTokens } from './token-storage';

/**
 * API 客户端（CLAUDE.md §6）：
 * - fetch 封装，EXPO_PUBLIC_API_BASE_URL
 * - 自动附加 Authorization: Bearer <accessToken>
 * - 401 自动刷新重试一次（refresh 一次一换）
 * - 4xx 不重试；5xx 重试最多 3 次（指数退避）
 * - fetch 失败显示中文离线提示
 * - 所有错误映射为友好中文文案，绝不暴露堆栈
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
if (!API_BASE_URL) {
  throw new Error('请在 apps/mobile/.env 中配置 EXPO_PUBLIC_API_BASE_URL');
}

/** 统一响应结构（与 server apiResponseSchema 对齐） */
export interface ApiResponse<T> {
  code: number;
  message: string;
  requestId: string;
  data: T;
}

/** 客户端统一错误类：只包含面向用户的中文文案，不暴露堆栈 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly statusCode: number,
    readonly requestId?: string,
    readonly isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── auth 过期回调（auth-store 注册，避免循环依赖） ──

let onAuthExpired: (() => void) | null = null;

/** auth-store 初始化时调用，注册 token 失效后的清理逻辑 */
export function setAuthExpiredHandler(handler: () => void): void {
  onAuthExpired = handler;
}

// ── token 刷新去重（并发 401 时只刷一次） ──

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;

      const json: ApiResponse<{ tokens: { accessToken: string; refreshToken: string } }> =
        await res.json();
      if (json.code !== 0 || !json.data) return null;

      const { accessToken, refreshToken: newRefresh } = json.data.tokens;
      await saveTokens(accessToken, newRefresh);
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── 辅助函数 ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** HTTP 状态码 → 中文文案（server 未提供 message 时的兜底） */
function mapHttpStatusToMessage(status: number): string {
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 403) return '暂无权限执行此操作';
  if (status === 404) return '请求的资源不存在';
  if (status === 429) return '操作过于频繁，请稍后再试';
  if (status >= 500) return '服务器暂时无法响应，请稍后再试';
  return '请求失败，请稍后再试';
}

// ── 核心请求 ──

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  /** 跳过 Authorization 头（login/register 用） */
  skipAuth?: boolean;
  /** 跳过 5xx 重试（refresh 端点本身用，避免循环） */
  skipRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, skipAuth = false, skipRetry = false } = options;

  // 构建 URL + query
  const url = new URL(`${API_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  // 构建请求头
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!skipAuth) {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  return executeRequest<T>(url.toString(), init, { skipAuth, skipRetry, hasRetriedAuth: false });
}

async function executeRequest<T>(
  url: string,
  init: RequestInit,
  ctx: { skipAuth: boolean; skipRetry: boolean; hasRetriedAuth: boolean },
): Promise<T> {
  let retryCount = 0;
  const maxRetries = ctx.skipRetry ? 0 : 3;

  while (true) {
    try {
      const res = await fetch(url, init);

      // 成功通信 → 清除离线标记
      useUIStore.getState().setOffline(false);

      // 401 → 刷新 + 重试一次
      if (res.status === 401 && !ctx.hasRetriedAuth && !ctx.skipAuth) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          const headers = { ...init.headers, Authorization: `Bearer ${newToken}` };
          return executeRequest<T>(url, { ...init, headers }, { ...ctx, hasRetriedAuth: true });
        }
        // 刷新失败 → 清除 token、通知 auth store
        await clearAll();
        onAuthExpired?.();
        throw new ApiError('登录已过期，请重新登录', 2002, 401);
      }

      // 解析响应体
      const json: ApiResponse<T> | null = await res.json().catch(() => null);

      // HTTP 错误（4xx / 5xx）
      if (!res.ok) {
        const message = json?.message ?? mapHttpStatusToMessage(res.status);
        throw new ApiError(message, json?.code ?? 1000, res.status, json?.requestId);
      }

      // 业务错误（code !== 0）
      if (json && json.code !== 0) {
        throw new ApiError(json.message || '请求失败', json.code, res.status, json.requestId);
      }

      return json?.data as T;
    } catch (error) {
      // ApiError → 5xx 重试
      if (error instanceof ApiError) {
        if (error.statusCode >= 500 && retryCount < maxRetries && !ctx.skipRetry) {
          retryCount++;
          await delay(retryCount * 1000);
          continue;
        }
        throw error;
      }

      // 网络错误（TypeError: Failed to fetch / Network request failed）
      useUIStore.getState().setOffline(true);
      throw new ApiError('网络连接失败，请检查网络后重试', 1007, 0, undefined, true);
    }
  }
}

// ── 便捷方法 ──

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    request<T>(path, { method: 'GET', params }),

  post: <T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }) =>
    request<T>(path, { method: 'POST', body, skipAuth: opts?.skipAuth }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
