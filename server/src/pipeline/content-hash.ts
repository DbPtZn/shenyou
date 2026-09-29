import { createHash } from "node:crypto";

/**
 * 计算内容 hash（sha256 前 16 位），用于幂等键。
 * 输入为任意可序列化对象，自动 JSON 序列化后哈希。
 */
export function contentHash(input: unknown): string {
  const serialized = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}
