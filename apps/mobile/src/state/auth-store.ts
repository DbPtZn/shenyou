import { create } from 'zustand';
import { login as apiLogin, register as apiRegister, logout as apiLogout } from '@/api/auth';
import { setAuthExpiredHandler } from '@/api/client';
import {
  clearAll,
  getAccessToken,
  getStoredUser,
  saveTokens,
  saveUser,
  type StoredUser,
} from '@/api/token-storage';

/**
 * 认证状态（Zustand 客户端态）。
 * token 只存 expo-secure-store（CLAUDE.md §6 / §10），不存 AsyncStorage。
 */

interface AuthState {
  user: StoredUser | null;
  isAuthenticated: boolean;
  /** secure-store 异步加载完成标记（root layout 用作 auth gate） */
  isHydrated: boolean;

  /** 启动时从 secure-store 恢复登录态 */
  initialize: () => Promise<void>;
  /** 登录 */
  login: (account: string, password: string) => Promise<void>;
  /** 注册 */
  register: (account: string, password: string, nickname?: string) => Promise<void>;
  /** 退出登录（调用 /auth/logout 吊销 refresh token） */
  logout: () => Promise<void>;
  /** token 失效时清除本地态（由 api/client 的 onAuthExpired 回调触发） */
  clearAuth: () => Promise<void>;
  /** 本地更新用户资料（dev 订阅切换用） */
  updateUser: (user: StoredUser) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  // 注册 token 过期回调（API client refresh 失败时调用，避免循环依赖）
  setAuthExpiredHandler(async () => {
    set({ user: null, isAuthenticated: false });
  });

  return {
    user: null,
    isAuthenticated: false,
    isHydrated: false,

    initialize: async () => {
      const user = await getStoredUser();
      const token = await getAccessToken();
      set({
        user,
        isAuthenticated: !!user && !!token,
        isHydrated: true,
      });
    },

    login: async (account, password) => {
      const { user, tokens } = await apiLogin(account, password);
      await saveTokens(tokens.accessToken, tokens.refreshToken);
      await saveUser(user);
      set({ user, isAuthenticated: true });
    },

    register: async (account, password, nickname) => {
      const { user, tokens } = await apiRegister(account, password, nickname);
      await saveTokens(tokens.accessToken, tokens.refreshToken);
      await saveUser(user);
      set({ user, isAuthenticated: true });
    },

    logout: async () => {
      try {
        await apiLogout();
      } catch {
        // 即使 /auth/logout 失败也清除本地态
      }
      await clearAll();
      set({ user: null, isAuthenticated: false });
    },

    clearAuth: async () => {
      await clearAll();
      set({ user: null, isAuthenticated: false });
    },

    updateUser: async (user) => {
      await saveUser(user);
      set({ user });
    },
  };
});
