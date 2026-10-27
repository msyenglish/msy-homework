// Branding read from `settings`, cached per isolate for a minute (it changes rarely, and the AI hub
// and error handler read it on every call).
import { inArray } from "drizzle-orm";
import { BRAND_SETTING_KEYS, brandFromSettings, type Brand } from "@msyen/shared";
import { getDb, schema } from "../db";
import type { Bindings } from "./env";

const TTL_MS = 60_000;
let cached: { brand: Brand; at: number } | null = null;

export async function getBrand(env: Bindings): Promise<Brand> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.brand;
  const rows = await getDb(env.DB)
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, Object.values(BRAND_SETTING_KEYS)));
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const brand = brandFromSettings((k) => m.get(k));
  cached = { brand, at: Date.now() };
  return brand;
}

/** Drops the cache after the teacher saves new branding (this isolate only; others expire in a minute). */
export function forgetBrand() {
  cached = null;
}
