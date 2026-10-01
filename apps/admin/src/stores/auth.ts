import { defineStore } from "pinia";
import { login as apiLogin, fetchProfile, logout as apiLogout, probeAdmin } from "@/api/auth";
import {
  setTokens,
  clearTokens,
  getAccessToken,
  getStoredProfile,
  setStoredProfile,
  getStoredIsAdmin,
} from "@/api/request";
import type { ProfileData } from "@/types/api";

/**
 * 认证全局态。
 * token 存 localStorage：Web 端既定取舍（浏览器无硬件安全存储，跨域无法用 HttpOnly Cookie），
 * 由短 TTL access token + 401 自动登出 + 全站 HTTPS 缓解风险。
 */
export const useAuthStore = defineStore("auth", {
  state: () => ({
    profile: null as ProfileData | null,
    isAdmin: false,
    ready: false,
  }),
  getters: {
    isLoggedIn: () => !!getAccessToken(),
    displayName: (s) => s.profile?.nickname || s.profile?.phone || s.profile?.email || "管理员",
  },
  actions: {
    /** 启动时从 localStorage 恢复登录态 */
    restore() {
      const raw = getStoredProfile();
      if (raw) {
        try {
          this.profile = JSON.parse(raw) as ProfileData;
          this.isAdmin = getStoredIsAdmin();
        } catch {
          clearTokens();
        }
      }
      this.ready = true;
    },

    /**
     * 登录：账号密码 → 探测管理权限 → 拉取资料。
     * 非 admin 直接拒绝进入（前端守卫 + 后端 AdminGuard 双重保险）。
     */
    async login(account: string, password: string) {
      const data = await apiLogin(account, password);
      setTokens(data.tokens.accessToken, data.tokens.refreshToken);

      const ok = await probeAdmin();
      if (!ok) {
        clearTokens();
        throw new Error("该账号不是管理员，无法进入运营后台");
      }

      this.profile = await fetchProfile();
      this.isAdmin = true;
      setStoredProfile(JSON.stringify(this.profile), true);
    },

    /** 退出登录：吊销服务端 refresh token 后清本地态 */
    async logout() {
      try {
        await apiLogout();
      } catch {
        // 即使服务端失败也要清本地态
      }
      clearTokens();
      this.profile = null;
      this.isAdmin = false;
      window.location.href = "/login";
    },
  },
});
