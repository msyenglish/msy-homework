// ============================================================
//  Teacher routes — AI gateway: routing, model registry, provider keys, usage.
//  Mounted behind requireTeacher (teacher.use("*") in index.ts).
// ============================================================
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Db } from "../db";
import { DEFAULT_MODELS, findModelIn, PROVIDER_IDS, PROVIDER_LABEL, type ModelInfo, type ProviderId } from "../lib/ai/models";
import { getOpenRouterCatalog, isStale, refreshOpenRouterCatalog } from "../lib/ai/openrouter";
import { getKeys, keyId, parseKeys } from "../lib/ai/keyring";
import { insertModels, listModels, upsertModel } from "../lib/ai/registry";
import { checkKey, listProviderModels, NON_CHAT, type BrowseModel } from "../lib/ai/providerModels";
import { encryptSecret, decryptSecret, keyHint } from "../lib/ai/secrets";
import { testModel } from "../lib/ai/hub";
import { envBaseUrl, getRoutingConfig, KEY_ENV, setRoutingConfig, type Route } from "../lib/ai/routing";
import { AI_TASKS, TASK_GROUP, TASK_LABEL, maxTokensFor, type AiTaskName } from "../lib/ai/tasks";
import { clearUsageErrors, usageSummary } from "../lib/ai/usage";
import { findTtsVoice, TTS_PROVIDER_LABEL, TTS_VOICES } from "@msyen/shared";
import { asHttp, dgCheckKey, dgSpeak } from "../lib/deepgram";
import { buildSsml, checkSpeechKey, forgetSpeechCreds, packSpeechKey, speechConfigured, synthesize, unpackSpeechKey } from "../lib/azureSpeech";
import { cleanTtsConfig, deepgramKeys, getTtsConfig, saveTtsConfig, ttsReady } from "../lib/tts";
import type { AppEnv } from "../lib/env";

type Env = AppEnv["Bindings"];

const r = new Hono<AppEnv>();

const providerSchema = z.enum(PROVIDER_IDS);

const routeSchema = z.object({
  provider: providerSchema,
  model: z.string().min(1),
});

const configSchema = z.object({
  default: routeSchema,
  routes: z.record(z.string(), routeSchema),
});

/** OpenRouter's vendor prefix for each direct provider. */
const OPENROUTER_VENDOR: Record<ProviderId, string> = {
  google: "google",
  openai: "openai",
  anthropic: "anthropic",
  openrouter: "",
  deepseek: "deepseek",
  xai: "x-ai",
};

/** Key owners: the AI providers plus the speech services. Keys of all of them share one table. */
type KeyProvider = ProviderId | "deepgram" | "azure";
const KEY_PROVIDERS: KeyProvider[] = [...PROVIDER_IDS, "azure", "deepgram"];
const keyProviderSchema = z.enum([...PROVIDER_IDS, "azure", "deepgram"]);
const keyLabel = (p: KeyProvider) => (p === "deepgram" ? "Deepgram" : p === "azure" ? "Azure Speech" : PROVIDER_LABEL[p]);
const keyEnvVar = (p: KeyProvider) =>
  p === "deepgram" ? "DEEPGRAM_API_KEYS" : p === "azure" ? "AZURE_SPEECH_KEY + AZURE_SPEECH_REGION" : String(KEY_ENV[p]);
const envKeyList = (env: Env, p: KeyProvider): string[] =>
  p === "deepgram"
    ? (env.DEEPGRAM_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean)
    : p === "azure"
      ? env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION
        ? [packSpeechKey(env.AZURE_SPEECH_REGION, env.AZURE_SPEECH_KEY)]
        : []
      : parseKeys(env, p);
/** The secret part shown and hashed for a stored value (Azure keeps its region in front). */
const bareKey = (p: KeyProvider, stored: string) => (p === "azure" ? unpackSpeechKey(stored)?.key ?? stored : stored);

async function checkAnyKey(env: Env, p: KeyProvider, stored: string): Promise<string | null> {
  if (p === "deepgram") return dgCheckKey(stored);
  if (p === "azure") {
    const creds = unpackSpeechKey(stored);
    return creds ? checkSpeechKey(creds.key, creds.region) : "thiếu vùng (region)";
  }
  const baseUrl = envBaseUrl(env, p);
  return checkKey(p, stored, baseUrl);
}

const bad = (message: string) => new HTTPException(400, { message });

/** Number of usable keys per provider (D1 + Worker secret). */
async function keyCounts(env: Env, db: Db): Promise<Record<ProviderId, number>> {
  const out = {} as Record<ProviderId, number>;
  for (const p of PROVIDER_IDS) out[p] = (await getKeys(env, db, p)).length;
  return out;
}

/**
 * Server-side route guard — never trust the UI:
 *  - the model must be registered under that provider
 *  - the provider must have a key
 *  - audio tasks need a model that listens; provider-pinned tasks keep their provider
 */
function assertRoute(route: Route, models: ModelInfo[], counts: Record<ProviderId, number>, taskName?: AiTaskName) {
  const m = findModelIn(models, route.provider, route.model);
  if (!m) throw bad(`Model ${route.model} chưa có trong danh sách model của ${PROVIDER_LABEL[route.provider]}`);
  const only = taskName ? AI_TASKS[taskName]?.onlyProviders : undefined;
  if (only && !only.includes(route.provider)) {
    throw bad(
      `Tác vụ "${TASK_LABEL[taskName!]}" chỉ dùng được ` +
        `${only.map((p) => PROVIDER_LABEL[p as ProviderId]).join(" hoặc ")} — không dùng ${PROVIDER_LABEL[route.provider]}.`,
    );
  }
  if (!counts[route.provider]) throw bad(`Chưa có key cho ${PROVIDER_LABEL[route.provider]} — thêm key ở tab Key rồi hãy chọn.`);
  if (taskName && AI_TASKS[taskName]?.needsAudio && !m.audio) {
    throw bad(`Tác vụ "${TASK_LABEL[taskName]}" cần model nghe được audio — ${m.label} không hỗ trợ.`);
  }
}

// ── Routing ──────────────────────────────────────────────────────────────────

/** Everything the page needs: registry, tasks, routing, provider status. */
r.get("/config", async (c) => {
  const db = getDb(c.env.DB);
  const [cfg, counts] = await Promise.all([getRoutingConfig(db), keyCounts(c.env, db)]);
  const names = Object.keys(AI_TASKS) as AiTaskName[];
  return c.json({
    catalog: cfg.models,
    providers: PROVIDER_IDS.map((id) => ({
      id,
      label: PROVIDER_LABEL[id],
      keyCount: counts[id],
      hasBaseUrl: !!envBaseUrl(c.env, id),
      envVar: KEY_ENV[id],
    })),
    tasks: names.map((name) => ({
      name,
      label: TASK_LABEL[name],
      group: TASK_GROUP[name],
      needs_audio: !!AI_TASKS[name].needsAudio,
      graded: !!AI_TASKS[name].graded,
      max_output_tokens: maxTokensFor(name),
    })),
    default: cfg.default,
    routes: cfg.routes,
  });
});

/** Saves routing. `routes` holds ONLY the tasks that override the default. */
r.put("/config", async (c) => {
  const parsed = configSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw bad(parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ");

  const db = getDb(c.env.DB);
  const [models, counts] = await Promise.all([listModels(db), keyCounts(c.env, db)]);
  assertRoute(parsed.data.default, models, counts);

  const routes: Partial<Record<AiTaskName, Route>> = {};
  for (const [task, route] of Object.entries(parsed.data.routes)) {
    if (!(task in AI_TASKS)) throw bad(`Tác vụ không tồn tại: ${task}`);
    assertRoute(route, models, counts, task as AiTaskName);
    routes[task as AiTaskName] = route;
  }

  await setRoutingConfig(db, { default: parsed.data.default, routes });
  return c.json({ ok: true });
});

// ── Model registry ───────────────────────────────────────────────────────────

const modelSchema = z.object({
  provider: providerSchema,
  id: z.string().trim().min(1, "Cần mã model").max(200),
  label: z.string().trim().max(120).optional(),
  inPrice: z.number().min(0).max(1000).default(0),
  outPrice: z.number().min(0).max(1000).default(0),
  audio: z.boolean().default(false),
  jsonSchema: z.boolean().default(false),
  free: z.boolean().default(false),
  note: z.string().trim().max(300).optional(),
});

/** Adds a model, or updates it when it is already registered. */
r.post("/models", async (c) => {
  const parsed = modelSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw bad(parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ");
  const v = parsed.data;
  if (v.audio && !["google", "openrouter"].includes(v.provider)) {
    throw bad("Chỉ model Gemini (hoặc qua OpenRouter) mới nghe được audio.");
  }
  await upsertModel(getDb(c.env.DB), { ...v, label: v.label || v.id, note: v.note || undefined });
  return c.json({ ok: true });
});

/** Removes a model. Refused while the default or any task still routes to it. */
r.delete("/models", async (c) => {
  const provider = providerSchema.safeParse(c.req.query("provider"));
  const id = c.req.query("id");
  if (!provider.success || !id) throw bad("Thiếu provider hoặc mã model");
  const db = getDb(c.env.DB);
  const cfg = await getRoutingConfig(db);
  const uses = (r: Route) => r.provider === provider.data && r.model === id;
  if (uses(cfg.default)) throw bad("Model này đang là mặc định chung — chọn mặc định khác ở tab Điều phối trước.");
  const tasks = Object.entries(cfg.routes)
    .filter(([, route]) => route && uses(route))
    .map(([t]) => TASK_LABEL[t as AiTaskName] ?? t);
  if (tasks.length) throw bad(`Model đang được dùng cho: ${tasks.join(", ")}. Đổi các tác vụ này sang model khác trước.`);
  await db
    .delete(schema.aiModels)
    .where(and(eq(schema.aiModels.provider, provider.data), eq(schema.aiModels.modelId, id)));
  return c.json({ ok: true });
});

/** Re-adds any default model the teacher removed. Existing rows are left untouched. */
r.post("/models/restore-defaults", async (c) => {
  const db = getDb(c.env.DB);
  const before = (await listModels(db)).length;
  await insertModels(db, DEFAULT_MODELS);
  const after = (await listModels(db)).length;
  return c.json({ added: after - before });
});

/** Live list of models a provider offers, flagged with whether each is already registered. */
r.get("/models/browse", async (c) => {
  const provider = providerSchema.safeParse(c.req.query("provider"));
  if (!provider.success) throw bad("Provider không hợp lệ");
  const p = provider.data;
  const db = getDb(c.env.DB);
  const baseUrl = envBaseUrl(c.env, p);

  let list: BrowseModel[];
  if (p === "openrouter") {
    // Cached in D1 for a day — the public catalog is ~300 models and changes weekly.
    let catalog = await getOpenRouterCatalog(db);
    if (isStale(catalog)) {
      catalog = await refreshOpenRouterCatalog(db, baseUrl).catch((e) => {
        if (!catalog) throw new HTTPException(502, { message: `Không tải được danh sách OpenRouter: ${(e as Error).message}` });
        return catalog;
      });
    }
    list = catalog!.models.map((m) => ({ ...m }));
  } else {
    const keys = await getKeys(c.env, db, p);
    if (!keys.length) throw bad(`Thêm key ${PROVIDER_LABEL[p]} trước để lấy danh sách model.`);
    try {
      list = await listProviderModels(p, keys[0], baseUrl);
    } catch (e) {
      // Google's list endpoint is geo-blocked from some Worker regions and the Gemini proxy only
      // forwards POST: fall back to the same vendor's models in the OpenRouter catalog.
      const catalog = (await getOpenRouterCatalog(db)) ?? (await refreshOpenRouterCatalog(db).catch(() => null));
      const prefix = `${OPENROUTER_VENDOR[p]}/`;
      list = (catalog?.models ?? [])
        .filter((m) => m.id.startsWith(prefix) && !m.id.includes(":") && !NON_CHAT.test(m.id))
        .map((m) => ({ ...m, id: m.id.slice(prefix.length), label: m.label.replace(/^[^:]+:\s*/, "") }));
      if (!list.length) {
        throw new HTTPException(502, { message: `Không lấy được danh sách model từ ${PROVIDER_LABEL[p]}: ${(e as Error).message}` });
      }
    }
  }

  const registered = new Set((await listModels(db)).filter((m) => m.provider === p).map((m) => m.id));
  // Providers do not publish prices in their model lists: take them from the defaults, else from
  // the cached OpenRouter catalog, which resells the same models under "<vendor>/<id>".
  const known = new Map(DEFAULT_MODELS.filter((m) => m.provider === p).map((m) => [m.id, m]));
  const norm = (id: string) => id.toLowerCase().replace(/\./g, "-");
  const resold = new Map<string, ModelInfo>();
  if (p !== "openrouter") {
    const prefix = `${OPENROUTER_VENDOR[p]}/`;
    const catalog = (await getOpenRouterCatalog(db)) ?? (await refreshOpenRouterCatalog(db).catch(() => null));
    for (const m of catalog?.models ?? []) {
      if (m.id.startsWith(prefix) && !m.id.includes(":")) resold.set(norm(m.id.slice(prefix.length)), m);
    }
  }
  return c.json({
    items: list.map((m) => {
      const d = known.get(m.id) ?? resold.get(norm(m.id));
      return { ...m, inPrice: m.inPrice ?? d?.inPrice, outPrice: m.outPrice ?? d?.outPrice, added: registered.has(m.id) };
    }),
  });
});

/** Sends one tiny request to a model and reports latency / errors. */
r.post("/models/test", async (c) => {
  const parsed = routeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw bad("Thiếu provider hoặc model");
  return c.json(await testModel(c.env, parsed.data.provider, parsed.data.model));
});

// ── Provider keys ────────────────────────────────────────────────────────────

/** Keys per provider: D1 keys (editable) and Worker-secret keys (read-only), with rotation health. */
r.get("/keys", async (c) => {
  const db = getDb(c.env.DB);
  const [usage, stored] = await Promise.all([db.select().from(schema.aiKeyUsage), db.select().from(schema.aiProviderKeys)]);
  const byId = new Map(usage.map((x) => [x.keyId, x]));
  const now = new Date().toISOString();
  const health = (id: string) => {
    const u = byId.get(id);
    return {
      last_used_at: u?.lastUsedAt ?? null,
      fail_count: u?.failCount ?? 0,
      cooling: !!(u?.cooldownUntil && u.cooldownUntil > now),
      cooldown_until: u?.cooldownUntil ?? null,
    };
  };

  const providers = [];
  for (const p of KEY_PROVIDERS) {
    const rows = stored.filter((k) => k.provider === p);
    const dbIds = new Set(rows.map((k) => k.keyId));
    const fromEnv = await Promise.all(envKeyList(c.env, p).map(async (k) => ({ key: bareKey(p, k), id: await keyId(bareKey(p, k)) })));
    // A stored row the current secret cannot decrypt is shown so the teacher can re-enter it.
    const readable = await Promise.all(rows.map(async (k) => !!(await decryptSecret(c.env, k.cipher))));
    providers.push({
      id: p,
      label: keyLabel(p),
      envVar: keyEnvVar(p),
      hasBaseUrl: p !== "deepgram" && p !== "azure" && !!envBaseUrl(c.env, p),
      keys: [
        ...rows.map((k, i) => ({
          id: k.id,
          source: "db" as const,
          label: k.label,
          hint: k.hint,
          key_id: k.keyId,
          enabled: k.enabled,
          readable: readable[i],
          created_at: k.createdAt,
          ...health(k.keyId),
        })),
        ...fromEnv
          .filter((k) => !dbIds.has(k.id))
          .map((k) => ({
            id: `env:${k.id}`,
            source: "env" as const,
            label: null,
            hint: keyHint(k.key),
            key_id: k.id,
            enabled: true,
            readable: true,
            created_at: null,
            ...health(k.id),
          })),
      ],
    });
  }
  return c.json({ providers });
});

const keyInputSchema = z.object({
  provider: keyProviderSchema,
  key: z.string().trim().min(8, "Key quá ngắn").max(500),
  label: z.string().trim().max(60).optional(),
  // Azure Speech only: the resource's region, e.g. "southeastasia".
  region: z.string().trim().toLowerCase().regex(/^[a-z0-9]+$/, "Vùng (region) chỉ gồm chữ thường và số, vd southeastasia").optional(),
  check: z.boolean().default(true),
});

/** Stores a key (encrypted). Checks it against the provider first unless `check` is false. */
r.post("/keys", async (c) => {
  const parsed = keyInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw bad(parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ");
  const { provider, key, label, region, check } = parsed.data;
  if (provider === "azure" && !region) throw bad("Cần nhập vùng (region) của Azure Speech, vd southeastasia.");
  const stored = provider === "azure" ? packSpeechKey(region!, key) : key;
  const db = getDb(c.env.DB);
  const id = await keyId(key);
  const [dup] = await db.select({ id: schema.aiProviderKeys.id }).from(schema.aiProviderKeys).where(eq(schema.aiProviderKeys.keyId, id));
  if (dup) throw bad("Key này đã có trong danh sách.");

  if (check) {
    const err = await checkAnyKey(c.env, provider, stored);
    if (err) throw bad(`Key không dùng được với ${keyLabel(provider)}: ${err}`);
  }

  await db.insert(schema.aiProviderKeys).values({
    provider,
    label: label || (provider === "azure" ? region! : null),
    cipher: await encryptSecret(c.env, stored),
    hint: keyHint(key),
    keyId: id,
  });
  if (provider === "azure") forgetSpeechCreds();
  return c.json({ ok: true });
});

/** Renames / enables / disables a stored key. */
r.patch("/keys/:id", async (c) => {
  const parsed = z
    .object({ label: z.string().trim().max(60).nullable().optional(), enabled: z.boolean().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw bad("Dữ liệu không hợp lệ");
  const set: Partial<typeof schema.aiProviderKeys.$inferInsert> = {};
  if (parsed.data.label !== undefined) set.label = parsed.data.label || null;
  if (parsed.data.enabled !== undefined) set.enabled = parsed.data.enabled;
  if (!Object.keys(set).length) return c.json({ ok: true });
  await getDb(c.env.DB).update(schema.aiProviderKeys).set(set).where(eq(schema.aiProviderKeys.id, c.req.param("id")));
  forgetSpeechCreds();
  return c.json({ ok: true });
});

r.delete("/keys/:id", async (c) => {
  await getDb(c.env.DB).delete(schema.aiProviderKeys).where(eq(schema.aiProviderKeys.id, c.req.param("id")));
  forgetSpeechCreds();
  return c.json({ ok: true });
});

/** Checks one key (stored or from the Worker secret) without spending tokens. */
r.post("/keys/:id/check", async (c) => {
  const db = getDb(c.env.DB);
  const ref = c.req.param("id");
  let provider: KeyProvider | undefined;
  let key: string | null = null;
  if (ref.startsWith("env:")) {
    const hash = ref.slice(4);
    for (const p of KEY_PROVIDERS) {
      for (const k of envKeyList(c.env, p)) {
        if ((await keyId(bareKey(p, k))) === hash) {
          provider = p;
          key = k;
        }
      }
    }
  } else {
    const [row] = await db.select().from(schema.aiProviderKeys).where(eq(schema.aiProviderKeys.id, ref));
    if (row && KEY_PROVIDERS.includes(row.provider as KeyProvider)) {
      provider = row.provider as KeyProvider;
      key = await decryptSecret(c.env, row.cipher);
      if (!key) return c.json({ ok: false, error: "Không giải mã được key (secret đã đổi?) — xoá và nhập lại." });
    }
  }
  if (!provider || !key) throw new HTTPException(404, { message: "Không tìm thấy key" });
  const err = await checkAnyKey(c.env, provider, key);
  return c.json(err ? { ok: false, error: err } : { ok: true });
});

// ── Text-to-speech ───────────────────────────────────────────────────────────

/** Voice catalogue, current per-use choice and which providers can speak right now. */
r.get("/tts", async (c) => {
  const [config, ready] = await Promise.all([getTtsConfig(c.env), ttsReady(c.env)]);
  return c.json({ config, ready, voices: TTS_VOICES });
});

r.put("/tts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cfg = cleanTtsConfig(body?.config);
  const ready = await ttsReady(c.env);
  for (const [use, label] of [["pronounce", "Phát âm"], ["listening", "Bài nghe"], ["dialogue", "Hội thoại"]] as const) {
    const p = cfg[use].provider;
    if (!ready[p]) throw bad(`${label}: ${TTS_PROVIDER_LABEL[p]} chưa được cấu hình${p === "deepgram" ? " — thêm key Deepgram ở tab Key" : " — thêm key Azure Speech ở tab Key"}.`);
  }
  await saveTtsConfig(c.env, cfg);
  return c.json({ ok: true, config: cfg });
});

/** Reads a sample with one voice and returns the mp3 (no fallback: a failure is reported). */
r.post("/tts/preview", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const voice = findTtsVoice(String(body?.voice ?? ""));
  if (!voice) throw bad("Giọng không hợp lệ");
  const text = String(body?.text ?? "").trim().slice(0, 300) || "Hello! This is how I sound when I read your lessons aloud.";
  let bytes: ArrayBuffer;
  try {
    if (voice.provider === "deepgram") {
      const keys = await deepgramKeys(c.env);
      if (!keys.length) throw bad("Chưa có key Deepgram — thêm ở tab Key.");
      bytes = await dgSpeak(keys[0], voice.id, text);
    } else {
      if (!(await speechConfigured(c.env))) throw bad("Chưa có key Azure Speech — thêm ở tab Key.");
      bytes = (await synthesize(c.env, buildSsml([{ voice: voice.id, text }]))).bytes;
    }
  } catch (e) {
    throw asHttp(e);
  }
  return new Response(bytes, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
});

// ── Usage ────────────────────────────────────────────────────────────────────

/** Cost summary. from/to are ISO (default: last 30 days). */
r.get("/usage", async (c) => {
  const to = c.req.query("to") || new Date().toISOString();
  const from = c.req.query("from") || new Date(Date.now() - 30 * 86_400_000).toISOString();
  const summary = await usageSummary(getDb(c.env.DB), from, to);
  return c.json({ from, to, ...summary });
});

/** Clears failed calls from the log: every failure since ?from=, or all of them without it. */
r.delete("/usage/errors", async (c) => {
  const removed = await clearUsageErrors(getDb(c.env.DB), { from: c.req.query("from") || undefined });
  return c.json({ ok: true, removed });
});

r.delete("/usage/errors/:id", async (c) => {
  const removed = await clearUsageErrors(getDb(c.env.DB), { id: c.req.param("id") });
  return c.json({ ok: true, removed });
});

export default r;
