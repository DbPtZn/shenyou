import http from "./request";
import { httpGet, httpPost, httpPatch } from "./request";
import type {
  AdminChapterDetail,
  AdminChapterListResponse,
  AdminAudioAsset,
  AdminAudioPlayUrl,
  CreateAudioAssetData,
  AudioTrackType,
  DraftStatus,
  MixPreset,
} from "@/types/api";

/**
 * 章节列表（草稿聚合 / 按文案状态筛选），带旅程标题。
 * 数组参数必须序列化为重复键（?draftStatus=pending&draftStatus=confirmed），
 * axios 默认的 `draftStatus[]=...` 后端不识别。
 */
export function fetchChapters(params: {
  page?: number;
  pageSize?: number;
  draftStatus?: DraftStatus[];
  journeyId?: string;
}) {
  return http.get<unknown, AdminChapterListResponse>("/admin/chapters", {
    params,
    paramsSerializer: {
      serialize: (query: Record<string, unknown>) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
          if (value === undefined || value === null) continue;
          if (Array.isArray(value)) {
            value.forEach((item) => search.append(key, String(item)));
          } else {
            search.append(key, String(value));
          }
        }
        return search.toString();
      },
    },
  });
}

export function fetchChapterDetail(id: string) {
  return httpGet<AdminChapterDetail>(`/admin/chapters/${id}`);
}

export function fetchChapterAudioAssets(chapterId: string) {
  return httpGet<AdminAudioAsset[]>(`/admin/chapters/${chapterId}/audio-assets`);
}

export function createChapter(
  journeyId: string,
  data: {
    title: string;
    subtitle?: string;
    index?: number;
    stops?: Array<{ timeSec: number; title: string; subtitle?: string }>;
  },
) {
  return httpPost<AdminChapterDetail>(`/admin/journeys/${journeyId}/chapters`, data);
}

/** 更新章节（标题/副标题/序号/站点时间轴）；序号冲突后端返回 409 */
export function updateChapter(
  id: string,
  data: Partial<{
    title: string;
    subtitle: string;
    index: number;
    stops: Array<{ timeSec: number; title: string; subtitle?: string }>;
  }>,
) {
  return httpPatch<AdminChapterDetail>(`/admin/chapters/${id}`, data);
}

/** 创建音频资产并获取预签名直传 URL */
export function createAudioAsset(
  chapterId: string,
  data: { trackType: AudioTrackType; mixPreset?: MixPreset; fileName: string },
) {
  return httpPost<CreateAudioAssetData>(`/admin/chapters/${chapterId}/audio-assets`, data);
}

/** 上传完成回调，标记 ready */
export function markAudioReady(assetId: string, data: { durationSec: number; sizeBytes?: number }) {
  return httpPost<{ assetId: string; status: "ready" }>(
    `/admin/audio-assets/${assetId}/ready`,
    data,
  );
}

/** 管理端试听：签发 HMAC 签名播放地址 */
export function fetchAudioPlayUrl(assetId: string) {
  return httpGet<AdminAudioPlayUrl>(`/admin/audio-assets/${assetId}/play-url`);
}
