import { api } from './client';

// ── 类型定义（与 server content API 文档对齐） ──

/** 章节站点时间轴单元 */
export interface ChapterStop {
  timeSec: number;
  title: string;
  subtitle?: string;
}

/** 旅程列表项 */
export interface JourneyListItem {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  tags: string[];
  isFree: boolean;
  totalDurationSec: number;
  chapterCount: number;
}

/** 分页列表 */
export interface PaginatedList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** 章节 */
export interface Chapter {
  id: string;
  index: number;
  title: string;
  subtitle: string | null;
  durationSec: number;
  stops: ChapterStop[];
}

/** 旅程详情 */
export interface JourneyDetail extends JourneyListItem {
  chapters: Chapter[];
  isFavorited: boolean;
}

/** 播放地址签发响应 */
export interface PlayUrlResponse {
  chapterId: string;
  journeyId: string;
  url: string;
  expiresAt: string;
  durationSec: number;
  mixPreset: string;
  positionSec: number;
}

/** 播放进度记录 */
export interface PlaybackRecord {
  chapterId: string;
  positionSec: number;
  updatedAt: string;
  chapter: { journeyId: string; index: number; title: string };
}

// ── API 函数 ──

/** 旅程列表（只返回 published） */
export function getJourneys(params?: {
  page?: number;
  pageSize?: number;
  tag?: string;
}): Promise<PaginatedList<JourneyListItem>> {
  return api.get<PaginatedList<JourneyListItem>>('/journeys', params);
}

/** 旅程详情（含章节站点时间轴 + isFavorited） */
export function getJourneyDetail(id: string): Promise<JourneyDetail> {
  return api.get<JourneyDetail>(`/journeys/${id}`);
}

/**
 * 播放地址签发（签名 CDN URL + 上次位置）。
 * 可选 mixPreset：default / relax，服务端按预置混音版本取成品。
 */
export function getPlayUrl(
  chapterId: string,
  mixPreset?: string,
): Promise<PlayUrlResponse> {
  return api.get<PlayUrlResponse>(
    `/chapters/${chapterId}/play`,
    mixPreset ? { mixPreset } : undefined,
  );
}

/** 上报播放进度（节流由客户端负责） */
export function updatePlayback(chapterId: string, positionSec: number): Promise<{
  chapterId: string;
  positionSec: number;
  updatedAt: string;
}> {
  return api.put(`/playback/${chapterId}`, { positionSec });
}

/** 查询上次位置（传 journeyId 返回该旅程各章节位置） */
export function getPlayback(journeyId?: string): Promise<PlaybackRecord[]> {
  return api.get<PlaybackRecord[]>('/playback', journeyId ? { journeyId } : undefined);
}

/** 收藏旅程 */
export function favoriteJourney(journeyId: string): Promise<{ journeyId: string; favorited: boolean }> {
  return api.post(`/journeys/${journeyId}/favorite`);
}

/** 取消收藏 */
export function unfavoriteJourney(journeyId: string): Promise<{ journeyId: string; favorited: boolean }> {
  return api.delete(`/journeys/${journeyId}/favorite`);
}

/** 我的收藏列表 */
export function getFavorites(): Promise<PaginatedList<JourneyListItem>> {
  return api.get<PaginatedList<JourneyListItem>>('/favorites');
}
