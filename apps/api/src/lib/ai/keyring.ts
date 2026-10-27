// ============================================================
//  Keyring — quản lý & xoay vòng nhiều key cho TỪNG provider (Gemini free tier, …).
//  Chiến lược: chọn key "last-used lâu nhất" còn khả dụng.
//  Trạng thái xoay key lưu ở D1 (bảng ai_key_usage) vì Worker stateless
//  → các request chia sẻ được last_used_at / cooldown.
//  D1 CHỈ lưu hash của key + metadata, KHÔNG lưu key thật.
//  Khoá là SHA-256(key) nên các provider vốn đã tách biệt nhau — không cần phân vùng.
// ============================================================
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";
import type { Bindings } from "../env";
import type { ProviderId } from "./models";
import { envKeys } from "./routing";
import { decryptSecret } from "./secrets";

export type Candidate = { id: string; key: string };

/** Keys of a provider set as a Worker secret (comma-separated). */
export function parseKeys(env: Bindings, provider: ProviderId): string[] {
  return envKeys(env, provider)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Enabled keys stored in D1 for a provider (AI or speech), decrypted. Unreadable rows are skipped. */
export async function dbKeys(env: Bindings, db: Db, provider: string): Promise<string[]> {
  const rows = await db
    .select({ cipher: schema.aiProviderKeys.cipher })
    .from(schema.aiProviderKeys)
    .where(and(eq(schema.aiProviderKeys.provider, provider), eq(schema.aiProviderKeys.enabled, true)));
  const keys = await Promise.all(rows.map((r) => decryptSecret(env, r.cipher)));
  return keys.filter((k): k is string => !!k);
}

/** Every usable key of a provider: D1 keys first, then Worker-secret keys, deduplicated. */
export async function getKeys(env: Bindings, db: Db, provider: ProviderId): Promise<string[]> {
  return [...new Set([...(await dbKeys(env, db, provider)), ...parseKeys(env, provider)])];
}

/** Định danh ổn định cho 1 key: SHA-256 rút gọn (không thể suy ngược ra key). */
export async function keyId(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Xếp key theo thứ tự ưu tiên dùng:
 *  1) Key KHÔNG trong cooldown đứng trước key đang cooldown.
 *  2) Trong mỗi nhóm: last_used_at cũ nhất trước (chưa dùng bao giờ = ưu tiên nhất).
 * Trả về mảng đã sắp — hub sẽ thử lần lượt để fallback.
 */
export async function orderedCandidates(db: Db, keys: string[]): Promise<Candidate[]> {
  const ids = await Promise.all(keys.map(async (key) => ({ key, id: await keyId(key) })));
  const rows = ids.length
    ? await db
        .select()
        .from(schema.aiKeyUsage)
        .where(
          inArray(
            schema.aiKeyUsage.keyId,
            ids.map((i) => i.id),
          ),
        )
    : [];
  const byId = new Map(rows.map((r) => [r.keyId, r]));
  const now = new Date().toISOString();

  const scored = ids.map((i) => {
    const u = byId.get(i.id);
    return {
      id: i.id,
      key: i.key,
      lastUsedAt: u?.lastUsedAt ?? "", // "" < mọi ISO → chưa dùng đứng đầu
      cooling: !!(u?.cooldownUntil && u.cooldownUntil > now),
    };
  });

  scored.sort((a, b) => {
    if (a.cooling !== b.cooling) return a.cooling ? 1 : -1;
    if (a.lastUsedAt < b.lastUsedAt) return -1;
    if (a.lastUsedAt > b.lastUsedAt) return 1;
    return 0;
  });

  return scored.map(({ id, key }) => ({ id, key }));
}

/** Đánh dấu key vừa dùng THÀNH CÔNG → cập nhật last_used, xóa cooldown + fail. */
export async function markUsed(db: Db, id: string, provider?: ProviderId): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(schema.aiKeyUsage)
    .values({ keyId: id, lastUsedAt: now, failCount: 0, cooldownUntil: null, provider: provider ?? null })
    .onConflictDoUpdate({
      target: schema.aiKeyUsage.keyId,
      set: { lastUsedAt: now, failCount: 0, cooldownUntil: null, provider: provider ?? null },
    });
}

/**
 * Đánh dấu key vừa LỖI (quota/429/5xx). Tăng fail_count, đặt cooldown để
 * tạm bỏ qua key này. Vẫn cập nhật last_used để LRU không quay lại ngay.
 */
export async function markFailed(
  db: Db,
  id: string,
  cooldownMs: number,
  provider?: ProviderId,
): Promise<void> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cooldownUntil = cooldownMs > 0 ? new Date(now + cooldownMs).toISOString() : null;
  await db
    .insert(schema.aiKeyUsage)
    .values({ keyId: id, lastUsedAt: nowIso, failCount: 1, cooldownUntil, provider: provider ?? null })
    .onConflictDoUpdate({
      target: schema.aiKeyUsage.keyId,
      set: {
        lastUsedAt: nowIso,
        failCount: sql`${schema.aiKeyUsage.failCount} + 1`,
        cooldownUntil,
        provider: provider ?? null,
      },
    });
}
