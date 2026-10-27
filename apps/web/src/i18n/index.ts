// Interface translation. Catalogs live in ./vi (source of truth) and ./en, one file per namespace;
// `t("ns.key", params)` looks the key up in the active language, falls back to Vietnamese, then to
// the key itself. Vietnamese copy is written in the default persona and goes through `tt()`.
import { DEFAULT_BRAND, isUiLang, type UiLang } from "@msyen/shared";
import { getBrand, tt } from "../lib/brand";
import { EN, VI } from "./registry";

type Catalog = typeof VI;
export type TKey = { [N in keyof Catalog]: `${N & string}.${Extract<keyof Catalog[N], string>}` }[keyof Catalog];
export type TParams = Record<string, string | number>;

const STORE_KEY = "ui_lang";
let overrides: Partial<Record<UiLang, Record<string, string>>> = {};

/** Active language: the person's own choice, else the install default. */
export function getLang(): UiLang {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (isUiLang(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return getBrand().language ?? DEFAULT_BRAND.language;
}

/** Switches the language for this browser and reloads so every screen re-renders. */
export function setLang(lang: UiLang) {
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  location.reload();
}

const OVERRIDES_STORE = "ui_texts_v1";

/**
 * Marks the document language and applies teacher-edited copy. The last copy is kept locally so a
 * boot never waits on the network; a fresh copy is fetched for the next render.
 */
export function bootLang() {
  document.documentElement.lang = getLang();
  try {
    const raw = localStorage.getItem(OVERRIDES_STORE);
    if (raw) overrides = JSON.parse(raw);
  } catch {
    /* corrupt or unavailable */
  }
  void fetch("/api/v1/ui-texts", { cache: "no-cache", signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((o) => {
      if (!o) return;
      overrides = o;
      try {
        localStorage.setItem(OVERRIDES_STORE, JSON.stringify(o));
      } catch {
        /* storage unavailable */
      }
    })
    .catch(() => {});
}

/** Every built-in key with its catalog text in both languages (for the copy editor). */
export function catalogEntries(): { key: string; ns: string; vi: string; en: string }[] {
  const out: { key: string; ns: string; vi: string; en: string }[] = [];
  for (const [ns, table] of Object.entries(VI) as [keyof Catalog, Record<string, string>][]) {
    const en = EN[ns] as Record<string, string>;
    for (const [k, vi] of Object.entries(table)) out.push({ key: `${ns}.${k}`, ns, vi, en: en[k] ?? "" });
  }
  return out;
}

/** Drops the cached overrides so the next load shows freshly saved copy. */
export function forgetOverrides() {
  try {
    localStorage.removeItem(OVERRIDES_STORE);
  } catch {
    /* storage unavailable */
  }
}

function lookup(lang: UiLang, key: string): string | undefined {
  const o = overrides[lang]?.[key];
  if (o) return o;
  const dot = key.indexOf(".");
  const ns = key.slice(0, dot) as keyof Catalog;
  const k = key.slice(dot + 1);
  const table = (lang === "en" ? EN : VI)[ns] as Record<string, string> | undefined;
  return table?.[k];
}

/**
 * Translates a key. `{name}` placeholders are filled from `params`; a value of the form
 * "one|many" picks by `params.n` (1 → first form).
 */
export function t(key: TKey, params?: TParams): string {
  const lang = getLang();
  let s = lookup(lang, key) ?? lookup("vi", key) ?? key;
  if (params && s.includes("|") && typeof params.n === "number") {
    const [one, many] = s.split("|");
    s = params.n === 1 ? one : many ?? one;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, p: string) => (params[p] != null ? String(params[p]) : m));
  return lang === "vi" ? tt(s) : s.replaceAll(DEFAULT_BRAND.teacherName, getBrand().teacherName);
}

export const LANG_LABEL: Record<UiLang, string> = { vi: "Tiếng Việt", en: "English" };
