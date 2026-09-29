import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getFavorites,
  getJourneyDetail,
  getJourneys,
  type JourneyDetail,
  type JourneyListItem,
  type PaginatedList,
} from '@/api/content';
import { useAuthStore } from '@/state/auth-store';

/**
 * TanStack Query hooks（CLAUDE.md §2：服务端态）。
 * 认证类 mutation 直接调用 auth-store 的 action，
 * store 内部负责 token / user 的持久化（secure-store）与状态更新。
 */

/** 旅程列表 */
export function useJourneyList(params?: { page?: number; tag?: string }) {
  return useQuery({
    queryKey: ['journeys', params] as const,
    queryFn: (): Promise<PaginatedList<JourneyListItem>> => getJourneys(params),
  });
}

/** 旅程详情（id 为空时不请求） */
export function useJourneyDetail(id: string) {
  return useQuery({
    queryKey: ['journey', id] as const,
    queryFn: (): Promise<JourneyDetail> => getJourneyDetail(id),
    enabled: !!id,
  });
}

/** 我的收藏 */
export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'] as const,
    queryFn: (): Promise<PaginatedList<JourneyListItem>> => getFavorites(),
  });
}

/** 登录（store 负责保存 token / user） */
export function useLogin() {
  return useMutation({
    mutationFn: (variables: { account: string; password: string }) =>
      useAuthStore.getState().login(variables.account, variables.password),
  });
}

/** 注册（store 负责保存 token / user） */
export function useRegister() {
  return useMutation({
    mutationFn: (variables: { account: string; password: string; nickname?: string }) =>
      useAuthStore.getState().register(
        variables.account,
        variables.password,
        variables.nickname,
      ),
  });
}

/** 退出登录（store 负责清除本地态） */
export function useLogout() {
  return useMutation({
    mutationFn: () => useAuthStore.getState().logout(),
  });
}
