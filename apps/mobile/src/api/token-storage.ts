import * as SecureStore from 'expo-secure-store';
import type { SubscriptionStatus } from './auth';

/**
 * Token 安全存储层（CLAUDE.md §6：token 只存 expo-secure-store，
 * 禁止 AsyncStorage / localStorage）。
 */

const KEYS = {
  accessToken: 'shenyou.at',
  refreshToken: 'shenyou.rt',
  user: 'shenyou.user',
} as const;

/** 当前登录的用户公开信息（与 server PublicUser 对齐） */
export interface StoredUser {
  id: string;
  phone: string | null;
  email: string | null;
  nickname: string | null;
  subscriptionStatus?: SubscriptionStatus;
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItem(KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItem(KEYS.refreshToken);
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItem(KEYS.accessToken, accessToken);
  await SecureStore.setItem(KEYS.refreshToken, refreshToken);
}

export async function saveUser(user: StoredUser): Promise<void> {
  await SecureStore.setItem(KEYS.user, JSON.stringify(user));
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await SecureStore.getItem(KEYS.user);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

export async function clearAll(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.accessToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
  await SecureStore.deleteItemAsync(KEYS.user);
}
