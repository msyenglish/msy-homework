// ============================================================
//  Live model lists straight from each provider — used by the "add model" picker and to check
//  that a key works (listing models is free, unlike a generation call).
// ============================================================
import type { ModelInfo, ProviderId } from "./models";
import { fetchOpenRouterModels, OPENROUTER_BASE } from "./openrouter";

export type BrowseModel = {
  id: string;
  label: string;
  /** Known only for OpenRouter, which publishes prices in its catalog. */
  inPrice?: number;
  outPrice?: number;
  audio?: boolean;
  jsonSchema?: boolean;
  free?: boolean;
  note?: string;
};

const DEFAULT_BASE: Record<ProviderId, string> = {
  google: "https://generativelanguage.googleapis.com/v1beta/models",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  openrouter: OPENROUTER_BASE,
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
};

/** Model ids that cannot answer a text prompt with JSON (image, speech, embeddings…). */
export const NON_CHAT = /(embed|tts|transcribe|whisper|dall-e|image|imagen|veo|lyria|audio|realtime|moderation|search|robotics|computer-use|banana|aqa|deep-research|antigravity|codex)/i;

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers } });
  const text = await res.text();
  if (!res.ok) {
    // Providers wrap the reason as {error: {message}} or {error: "…"}; show just that.
    let reason = text.slice(0, 200);
    try {
      const e = JSON.parse(text)?.error;
      reason = (typeof e === "string" ? e : e?.message) || reason;
    } catch {
      /* not JSON */
    }
    throw new Error(`${res.status} — ${reason}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Phản hồi không phải JSON");
  }
}

async function listGoogle(key: string, base: string): Promise<BrowseModel[]> {
  const data = await getJson(`${base.replace(/\/$/, "")}?pageSize=1000&key=${encodeURIComponent(key)}`, {});
  return ((data?.models ?? []) as any[])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => ({ id: String(m.name ?? "").replace(/^models\//, ""), label: m.displayName || m.name, audio: true, jsonSchema: true }))
    .filter((m) => m.id && !NON_CHAT.test(m.id));
}

async function listOpenAiCompat(base: string, key: string): Promise<BrowseModel[]> {
  const data = await getJson(`${base.replace(/\/$/, "")}/models`, { authorization: `Bearer ${key}` });
  return ((data?.data ?? []) as any[])
    .map((m) => ({ id: String(m.id ?? ""), label: String(m.id ?? "") }))
    .filter((m) => m.id && !NON_CHAT.test(m.id));
}

async function listAnthropic(base: string, key: string): Promise<BrowseModel[]> {
  const data = await getJson(`${base.replace(/\/$/, "")}/models?limit=1000`, {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  });
  return ((data?.data ?? []) as any[]).map((m) => ({ id: String(m.id), label: m.display_name || m.id, jsonSchema: true }));
}

const fromInfo = (m: ModelInfo): BrowseModel => ({
  id: m.id,
  label: m.label,
  inPrice: m.inPrice,
  outPrice: m.outPrice,
  audio: m.audio,
  jsonSchema: m.jsonSchema,
  free: m.free,
  note: m.note,
});

/**
 * Lists the models a provider offers. `key` is required except for OpenRouter (public catalog).
 * For Gemini behind a proxy the proxy is tried first, then Google directly.
 */
export async function listProviderModels(
  provider: ProviderId,
  key: string | undefined,
  baseUrl?: string,
): Promise<BrowseModel[]> {
  const base = baseUrl || DEFAULT_BASE[provider];
  if (provider === "openrouter") return (await fetchOpenRouterModels(baseUrl)).map(fromInfo);
  if (!key) throw new Error("Cần key để lấy danh sách model");
  if (provider === "google") {
    try {
      return await listGoogle(key, base);
    } catch (e) {
      if (base === DEFAULT_BASE.google) throw e;
      return listGoogle(key, DEFAULT_BASE.google);
    }
  }
  if (provider === "anthropic") return listAnthropic(base, key);
  return listOpenAiCompat(base, key);
}

/** Checks a key without spending tokens. Returns an error message, or null when the key works. */
export async function checkKey(provider: ProviderId, key: string, baseUrl?: string): Promise<string | null> {
  try {
    if (provider === "openrouter") {
      await getJson(`${(baseUrl || OPENROUTER_BASE).replace(/\/$/, "")}/key`, { authorization: `Bearer ${key}` });
      return null;
    }
    if (provider === "google") {
      // countTokens is free and a POST, so it also passes through a POST-only geo-proxy.
      const base = (baseUrl || DEFAULT_BASE.google).replace(/\/$/, "");
      const res = await fetch(`${base}/gemini-3.1-flash-lite:countTokens?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
      });
      if (!res.ok) {
        const text = await res.text();
        let reason = text.slice(0, 200);
        try {
          reason = JSON.parse(text)?.error?.message || reason;
        } catch {
          /* not JSON */
        }
        return `${res.status} — ${reason}`;
      }
      return null;
    }
    await listProviderModels(provider, key, baseUrl);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
