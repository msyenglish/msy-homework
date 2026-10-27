// ============================================================
//  Text-to-speech settings: which provider and voices each use takes (settings.tts_config),
//  and the Deepgram keys (D1, encrypted, plus the optional DEEPGRAM_API_KEYS secret).
// ============================================================
import { eq } from "drizzle-orm";
import {
  DEFAULT_TTS_CONFIG,
  TTS_VOICES,
  type TtsAccent,
  type TtsConfig,
  type TtsProvider,
  type TtsUseConfig,
} from "@msyen/shared";
import { getDb, schema } from "../db";
import { dbKeys } from "./ai/keyring";
import { speechConfigured } from "./azureSpeech";
import type { Bindings } from "./env";

const SETTINGS_KEY = "tts_config";
const TTL_MS = 60_000;

let cache: { at: number; cfg: TtsConfig } | null = null;

const isProvider = (v: unknown): v is TtsProvider => v === "azure" || v === "deepgram";
const isAccent = (v: unknown): v is TtsAccent => typeof v === "string" && TTS_VOICES.some((x) => x.accent === v);

function cleanUse(raw: unknown, fallback: TtsUseConfig): TtsUseConfig {
  const r = (raw ?? {}) as Partial<TtsUseConfig>;
  const provider = isProvider(r.provider) ? r.provider : fallback.provider;
  const ok = (id: unknown) => typeof id === "string" && TTS_VOICES.some((v) => v.id === id && v.provider === provider);
  const first = (g: "female" | "male") => TTS_VOICES.find((v) => v.provider === provider && v.gender === g)!.id;
  return {
    provider,
    female: ok(r.female) ? (r.female as string) : provider === fallback.provider ? fallback.female : first("female"),
    male: ok(r.male) ? (r.male as string) : provider === fallback.provider ? fallback.male : first("male"),
  };
}

/** Normalises a stored or submitted config: unknown voices fall back, never throw. */
export function cleanTtsConfig(raw: unknown): TtsConfig {
  const r = (raw ?? {}) as Partial<TtsConfig>;
  const d = DEFAULT_TTS_CONFIG;
  const accents = Array.isArray(r.dialogue?.accents) ? r.dialogue!.accents.filter(isAccent) : [];
  return {
    pronounce: cleanUse(r.pronounce, d.pronounce),
    listening: cleanUse(r.listening, d.listening),
    dialogue: {
      provider: isProvider(r.dialogue?.provider) ? r.dialogue!.provider : d.dialogue.provider,
      accents: accents.length ? [...new Set(accents)] : d.dialogue.accents,
    },
  };
}

export async function getTtsConfig(env: Bindings): Promise<TtsConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const [row] = await getDb(env.DB).select().from(schema.settings).where(eq(schema.settings.key, SETTINGS_KEY));
  let parsed: unknown = null;
  try {
    parsed = row?.value ? JSON.parse(row.value) : null;
  } catch {
    /* corrupt → defaults */
  }
  const cfg = cleanTtsConfig(parsed);
  cache = { at: Date.now(), cfg };
  return cfg;
}

export async function saveTtsConfig(env: Bindings, cfg: TtsConfig): Promise<void> {
  const value = JSON.stringify(cfg);
  await getDb(env.DB)
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  cache = { at: Date.now(), cfg };
}

/** Deepgram keys: D1 first, then the secret, deduplicated. */
export async function deepgramKeys(env: Bindings): Promise<string[]> {
  const fromEnv = (env.DEEPGRAM_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  return [...new Set([...(await dbKeys(env, getDb(env.DB), "deepgram")), ...fromEnv])];
}

/** Providers that can synthesise right now. */
export async function ttsReady(env: Bindings): Promise<Record<TtsProvider, boolean>> {
  return { azure: await speechConfigured(env), deepgram: (await deepgramKeys(env)).length > 0 };
}
