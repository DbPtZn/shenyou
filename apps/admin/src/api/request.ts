/**
 * 统一请求封装（axios）。
 * - 请求拦截：注入 Authorization: Bearer <accessToken>
 * - 响应拦截：解析统一信封 { code, message, requestId, data }
 * - 错误处理：按 ErrorCode 分段映射中文提示；401 刷新重试一次；403 提示无权限；展示 requestId
 *
 * token 存储说明：Web 端使用 localStorage 是既定取舍（与移动端 expo-secure-store 策略不同），
 * 因为浏览器没有等效的硬件安全存储；风险通过 HttpOnly Cookie 不可行（跨域），
 * 由短 TTL + 401 自动登出 + HTTPS 缓解。
 */
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { ElMessage } from "element-plus";
import { ErrorCode } from "@shenyou/shared";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const TOKEN_KEY = "shenyou_admin_access_token";
const REFRESH_TOKEN_KEY = "shenyou_admin_refresh_token";
const PROFILE_KEY = "shenyou_admin_profile";
const IS_ADMIN_KEY = "shenyou_admin_is_admin";

/** 内存态，避免刷新并发重复请求 */
let refreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}
/** 清空登录态（token + 缓存的资料/角色标记） */
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(IS_ADMIN_KEY);
}
export function getStoredProfile(): string | null {
  return localStorage.getItem(PROFILE_KEY);
}
export function setStoredProfile(json: string, isAdmin: boolean): void {
  localStorage.setItem(PROFILE_KEY, json);
  localStorage.setItem(IS_ADMIN_KEY, isAdmin ? "1" : "0");
}
export function getStoredIsAdmin(): boolean {
  return localStorage.getItem(IS_ADMIN_KEY) === "1";
}

const instance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

instance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** 刷新 token（并发去重） */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;
    try {
      const resp = await axios.post(
        `${BASE_URL}/auth/refresh`,
        { refreshToken },
        { headers: { "Content-Type": "application/json" } },
      );
      const envelope = resp.data as {
        code: number;
        data?: { tokens?: { accessToken: string; refreshToken: string } };
      };
      const tokens = envelope?.data?.tokens;
      if (envelope.code === ErrorCode.Success && tokens) {
        setTokens(tokens.accessToken, tokens.refreshToken);
        return tokens.accessToken;
      }
    } catch {
      // 刷新失败，回落到登出
    }
    clearTokens();
    return null;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

/** 错误码 → 中文提示（CLAUDE.md §4 错误映射） */
function mapErrorMessage(code: number, fallback: string): string {
  switch (code) {
    case ErrorCode.Unauthorized:
      return "登录已过期，请重新登录";
    case ErrorCode.Forbidden:
      return "无权限执行此操作";
    case ErrorCode.NotFound:
      return "请求的资源不存在";
    case ErrorCode.ValidationFailed:
      return "参数校验失败";
    case ErrorCode.SubscriptionRequired:
      return "该内容需要订阅";
    case ErrorCode.SubscriptionExpired:
      return "订阅已过期";
    case ErrorCode.RateLimited:
      return "请求过于频繁，请稍后再试";
    case ErrorCode.SelfRoleChangeForbidden:
      return "不能修改自己的角色";
    default:
      return fallback || "请求失败，请稍后再试";
  }
}

instance.interceptors.response.use(
  (response: AxiosResponse) => {
    // 2xx 必为成功：解包统一信封，直接返回业务数据载荷
    const envelope = response.data as { code: number; data: unknown };
    return envelope?.data !== undefined ? envelope.data : response.data;
  },
  async (error: AxiosError) => {
    const originalConfig = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;
    const status = error.response?.status;
    const data = error.response?.data as
      | { code?: number; message?: string; requestId?: string }
      | undefined;
    const requestId = data?.requestId || "";
    const code = data?.code ?? ErrorCode.Unknown;

    // 401 且未重试过 → 尝试刷新后重放一次
    if (status === 401 && originalConfig && !originalConfig._retried) {
      originalConfig._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return instance(originalConfig);
      }
      // 刷新失败 → 清登录态并跳登录
      clearTokens();
      if (!window.location.pathname.startsWith("/login")) {
        ElMessage.error("登录已过期，请重新登录");
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    // 其余错误统一提示
    const message = mapErrorMessage(code, data?.message || error.message);
    ElMessage.error({
      message: requestId ? `${message}（ID: ${requestId}）` : message,
      duration: 5000,
    });

    if (status === 403 && !window.location.pathname.startsWith("/login")) {
      // 权限不足且已登录 → 可能是角色被降级，登出回到登录页
      clearTokens();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);

export default instance;

// —— 类型化请求助手（响应拦截器已解包信封，直接返回 data 载荷类型） ——
export function httpGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return instance.get(url, { params }) as unknown as Promise<T>;
}
export function httpPost<T>(url: string, data?: unknown): Promise<T> {
  return instance.post(url, data) as unknown as Promise<T>;
}
export function httpPatch<T>(url: string, data?: unknown): Promise<T> {
  return instance.patch(url, data) as unknown as Promise<T>;
}
export function httpDelete<T>(url: string): Promise<T> {
  return instance.delete(url) as unknown as Promise<T>;
}
