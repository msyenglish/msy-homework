// ============================================================
//  OpenRouter — runtime model catalog.
//  OpenRouter resells 300+ models behind ONE key and ONE OpenAI-compatible endpoint, and the
//  list changes every week, so it cannot live in the static `MODELS` table. We fetch
//  GET /models (no auth required), normalise it to `ModelInfo` and cache the result in D1
//  (`settings.ai_openrouter_catalog`) so the hot path never hits the network.
// ============================================================
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";
import type { ModelInfo } from "./models";

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const SETTINGS_KEY = "ai_openrouter_catalog";

/** Refresh when the cache is older than this — the admin page can also force it. */
export const CATALOG_TTL_MS = 24 * 3600_000;

export type OpenRouterCatalog = { fetchedAt: string; models: ModelInfo[] };

type RawModel = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string; overrides?: unknown[] };
  supported_parameters?: string[];
  reasoning?: { mandatory?: boolean; default_enabled?: boolean };
};

const price = (v: string | undefined): number => {
  // OpenRouter quotes USD per token as a decimal string; the catalog is USD per 1M tokens.
  const n = Number(v);
  return Number.isFinite(n) ? n * 1_000_000 : 0;
};

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** Normalise one API row; returns null for models this gateway cannot drive. */
function toModelInfo(raw: RawModel): ModelInfo | null {
  const id = raw.id;
  if (!id) return null;

  const params = raw.supported_parameters ?? [];
  // Every task in this app demands a JSON answer validated by zod. A model that cannot be put
  // into JSON mode would fail schema validation on nearly every call — do not offer it.
  if (!params.includes("response_format")) return null;

  const outModalities = raw.architecture?.output_modalities ?? ["text"];
  if (!outModalities.includes("text")) return null;

  const inPrice = round(price(raw.pricing?.prompt));
  const outPrice = round(price(raw.pricing?.completion));
  const free = inPrice === 0 && outPrice === 0;
  const audio = (raw.architecture?.input_modalities ?? []).includes("audio");

  const notes: string[] = [];
  if (free) notes.push("Bản miễn phí của OpenRouter — có hạn mức lượt/ngày, dễ bị xếp hàng.");
  if (audio) notes.push("Nghe được audio.");
  // Reasoning tokens bill as output — the DeepSeek V4 Pro measurement (§5.1) showed a model with
  // a cheaper per-token price still costing 2.6x more per exercise because of them.
  if (raw.reasoning?.default_enabled) notes.push("Model suy luận — token suy luận tính tiền như output.");
  if (raw.pricing?.overrides?.length) notes.push("Giá bậc thang theo độ dài prompt.");
  if (raw.context_length) notes.push(`Ngữ cảnh ${Math.round(raw.context_length / 1000)}k token.`);

  return {
    id,
    provider: "openrouter",
    label: raw.name || id,
    inPrice,
    outPrice,
    audio,
    jsonSchema: params.includes("structured_outputs"),
    free,
    note: notes.join(" ") || undefined,
  };
}

/** Fetch + normalise the live list. Throws on network / non-200 so the caller can report it. */
export async function fetchOpenRouterModels(baseUrl?: string): Promise<ModelInfo[]> {
  const base = (baseUrl || OPENROUTER_BASE).replace(/\/$/, "");
  const res = await fetch(`${base}/models`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const data = (await res.json().catch(() => null)) as { data?: RawModel[] } | null;
  const rows = data?.data;
  if (!Array.isArray(rows) || !rows.length) throw new Error("OpenRouter trả danh sách model rỗng");

  const models = rows
    .map(toModelInfo)
    .filter((m): m is ModelInfo => !!m)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!models.length) throw new Error("Không model OpenRouter nào dùng được (thiếu chế độ JSON)");
  return models;
}

/** Read the cached catalog. Missing / corrupt row → null (caller falls back to an empty list). */
export async function getOpenRouterCatalog(db: Db): Promise<OpenRouterCatalog | null> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTINGS_KEY));
  return parseCatalog(row?.value);
}

export function parseCatalog(raw: string | null | undefined): OpenRouterCatalog | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v?.models)) return null;
    return { fetchedAt: String(v.fetchedAt ?? ""), models: v.models as ModelInfo[] };
  } catch {
    return null;
  }
}

/** Fetch the live list and store it. Returns the freshly stored catalog. */
export async function refreshOpenRouterCatalog(db: Db, baseUrl?: string): Promise<OpenRouterCatalog> {
  const models = await fetchOpenRouterModels(baseUrl);
  const catalog: OpenRouterCatalog = { fetchedAt: new Date().toISOString(), models };
  const value = JSON.stringify(catalog);
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  return catalog;
}

export const isStale = (c: OpenRouterCatalog | null): boolean =>
  !c || Date.now() - new Date(c.fetchedAt).getTime() > CATALOG_TTL_MS;
