import { create } from 'zustand';

/**
 * 客户端 UI 全局态（Zustand）。
 * 目前管理：离线状态（由 API client 网络错误触发）。
 */
interface UIState {
  /** 网络离线标记，由 api/client 在 fetch 失败时置 true、成功时置 false */
  isOffline: boolean;
  setOffline: (value: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isOffline: false,
  setOffline: (value) => set({ isOffline: value }),
}));
