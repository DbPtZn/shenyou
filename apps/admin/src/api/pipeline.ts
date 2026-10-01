import { httpGet, httpPost } from "./request";
import type { PipelineStatusData, QueueStatsData, DeadLetterItem, PipelineStep } from "@/types/api";

export function triggerDraft(chapterId: string) {
  return httpPost<unknown>(`/admin/pipeline/chapters/${chapterId}/draft`);
}

export function confirmDraft(chapterId: string) {
  return httpPost<unknown>(`/admin/pipeline/chapters/${chapterId}/draft/confirm`);
}

export function rejectDraft(chapterId: string) {
  return httpPost<unknown>(`/admin/pipeline/chapters/${chapterId}/draft/reject`);
}

export function rerunStep(chapterId: string, step: PipelineStep) {
  return httpPost<unknown>(`/admin/pipeline/chapters/${chapterId}/rerun`, { step });
}

export function fetchPipelineStatus(chapterId: string) {
  return httpGet<PipelineStatusData>(`/admin/pipeline/chapters/${chapterId}/status`);
}

export function fetchQueueStats() {
  return httpGet<QueueStatsData>("/admin/pipeline/queue/stats");
}

export function fetchDeadLetters() {
  return httpGet<DeadLetterItem[]>("/admin/pipeline/dead-letters");
}
