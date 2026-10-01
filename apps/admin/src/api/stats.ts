import { httpGet } from "./request";
import type { AdminStatsOverview } from "@/types/api";

/** 数据看板总览；refresh=true 时服务端绕过缓存重算并回填 */
export function fetchStatsOverview(refresh = false) {
  return httpGet<AdminStatsOverview>(
    "/admin/stats/overview",
    refresh ? { refresh: 1 } : undefined,
  );
}
