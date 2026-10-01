import { httpGet } from "./request";
import type { AdminAuditField, AdminAuditLogListResponse } from "@/types/api";

/** 操作审计日志列表：分页 + field（role/subscriptionStatus）+ keyword（操作人/目标账号模糊） */
export function fetchAuditLogs(params: {
  page?: number;
  pageSize?: number;
  field?: AdminAuditField | undefined;
  keyword?: string | undefined;
}) {
  return httpGet<AdminAuditLogListResponse>(
    "/admin/audit-logs",
    params as Record<string, unknown>,
  );
}
