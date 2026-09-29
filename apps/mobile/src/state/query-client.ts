import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query 配置（CLAUDE.md §2：服务端态用 TanStack Query）。
 * 重试策略与 api/client 对齐：4xx 不重试，网络错误做 1 次兜底重试。
 * 离线检测由 api/client 在 fetch 失败时设置 ui-store.isOffline，
 * 无需额外集成 onlineManager（RN 无 navigator.onLine）。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // 网络错误做 1 次兜底重试；HTTP/业务错误已由 api/client 处理
        if (error && typeof error === 'object' && 'isNetworkError' in error) {
          return failureCount < 1;
        }
        return false;
      },
      staleTime: 5 * 60 * 1000, // 5 分钟
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
