import { httpGet, httpPatch } from "./request";
import type {
  AdminUserListItem,
  UserRole,
  SubscriptionStatus,
} from "@/types/api";

export function fetchUsers(params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: UserRole;
  subscriptionStatus?: SubscriptionStatus;
}) {
  return httpGet<{ items: AdminUserListItem[]; total: number; page: number; pageSize: number }>(
    "/admin/users",
    params as Record<string, unknown>,
  );
}

export function updateUserRole(userId: string, role: UserRole) {
  return httpPatch<AdminUserListItem>(`/admin/users/${userId}/role`, { role });
}

export function updateUserSubscription(userId: string, status: SubscriptionStatus) {
  return httpPatch<AdminUserListItem>(`/admin/users/${userId}/subscription`, { status });
}
