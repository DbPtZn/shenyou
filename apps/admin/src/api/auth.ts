import axios from "axios";
import { httpPost, httpGet, BASE_URL, getAccessToken } from "./request";
import type { LoginData, ProfileData } from "@/types/api";

export function login(account: string, password: string) {
  return httpPost<LoginData>("/auth/login", { account, password });
}

export function fetchProfile() {
  return httpGet<ProfileData>("/users/me");
}

export function logout() {
  return httpPost<{ success: boolean }>("/auth/logout");
}

/**
 * 管理员角色探测：/users/me 不返回 role、JWT 载荷也不含角色，
 * 因此登录后用一个管理端只读接口试探权限（前端守卫 + 后端 AdminGuard 双重保险）。
 * 使用裸 axios，避开实例拦截器的 403 自动登出副作用。
 */
export async function probeAdmin(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  try {
    await axios.get(`${BASE_URL}/admin/journeys`, {
      params: { page: 1, pageSize: 1 },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}
