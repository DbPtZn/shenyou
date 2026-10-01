import { httpGet, httpPost, httpPatch, httpDelete } from "./request";
import type {
  AdminJourneyListItem,
  AdminJourneyDetail,
  ContentStatus,
} from "@/types/api";

/** 管理端旅程列表（含全部状态） */
export function fetchJourneys(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ContentStatus[];
  tag?: string[];
}) {
  return httpGet<{ items: AdminJourneyListItem[]; total: number; page: number; pageSize: number }>(
    "/admin/journeys",
    params as Record<string, unknown>,
  );
}

export function fetchJourneyDetail(id: string) {
  return httpGet<AdminJourneyDetail>(`/admin/journeys/${id}`);
}

export function createJourney(data: {
  title: string;
  subtitle?: string;
  coverUrl?: string;
  tags?: string[];
  isFree?: boolean;
}) {
  return httpPost<AdminJourneyDetail>("/admin/journeys", data);
}

export function updateJourney(
  id: string,
  data: Partial<{
    title: string;
    subtitle: string;
    coverUrl: string;
    tags: string[];
    isFree: boolean;
    status: ContentStatus;
  }>,
) {
  return httpPatch<AdminJourneyDetail>(`/admin/journeys/${id}`, data);
}

/** 删除旅程（已发布会被后端 409 拒绝，须先下架） */
export function deleteJourney(id: string) {
  return httpDelete<{ id: string; deleted: boolean; removedObjects: number }>(
    `/admin/journeys/${id}`,
  );
}

/** 封面图预签名直传：拿到 uploadUrl 后浏览器直接 PUT 文件，coverUrl 为稳定地址 */
export function createCoverUpload(fileName: string) {
  return httpPost<{
    objectKey: string;
    uploadUrl: string;
    coverUrl: string;
    expiresInSec: number;
  }>("/admin/cover-uploads", { fileName });
}

/** 章节拖拽排序：orderedIds 为旅程全部章节按新顺序的 id 列表 */
export function reorderChapters(journeyId: string, orderedIds: string[]) {
  return httpPatch<{ orderedIds: string[] }>(
    `/admin/journeys/${journeyId}/chapters/reorder`,
    { orderedIds },
  );
}
