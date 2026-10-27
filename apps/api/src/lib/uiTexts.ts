// Teacher overrides of interface copy (settings.ui_text_overrides). Core updates replace the built-in
// catalogs; these overrides stay. Each override keeps the catalog text it was written against
// (`base`) so the editor can flag overrides whose original has since changed.
import { eq } from "drizzle-orm";
import { isUiLang, type UiLang } from "@msyen/shared";
import { getDb, schema } from "../db";
import type { Bindings } from "./env";

export const UI_TEXTS_KEY = "ui_text_overrides";
export const KEY_RE = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+$/;

export type UiTextOverride = { text: string; base: string; at: string };
export type UiTextOverrides = Partial<Record<UiLang, Record<string, UiTextOverride>>>;

export async function getUiTexts(env: Bindings): Promise<UiTextOverrides> {
  const [row] = await getDb(env.DB).select().from(schema.settings).where(eq(schema.settings.key, UI_TEXTS_KEY));
  try {
    const v = row?.value ? (JSON.parse(row.value) as UiTextOverrides) : {};
    const out: UiTextOverrides = {};
    for (const [lang, map] of Object.entries(v ?? {})) if (isUiLang(lang) && map && typeof map === "object") out[lang] = map;
    return out;
  } catch {
    return {};
  }
}

export async function saveUiTexts(env: Bindings, v: UiTextOverrides): Promise<void> {
  const value = JSON.stringify(v);
  await getDb(env.DB)
    .insert(schema.settings)
    .values({ key: UI_TEXTS_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/** Text-only view for the SPA: { vi: { key: text }, en: {...} }. */
export const publicUiTexts = (v: UiTextOverrides) =>
  Object.fromEntries(Object.entries(v).map(([lang, map]) => [lang, Object.fromEntries(Object.entries(map ?? {}).map(([k, o]) => [k, o.text]))]));
