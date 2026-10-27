// ============================================================
//  AI model catalog types + the DEFAULT model list.
//  The live list lives in D1 (`ai_models`, see registry.ts): seeded from DEFAULT_MODELS once,
//  then the teacher adds/removes models on /teacher/ai. Prices are USD per 1M tokens (10/2026).
// ============================================================

export const PROVIDER_IDS = ["google", "openai", "anthropic", "openrouter", "deepseek", "xai"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  google: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  xai: "xAI Grok",
};

export type ModelInfo = {
  id: string; // model id gửi cho API
  provider: ProviderId;
  label: string; // hiện ở trang admin
  inPrice: number; // USD / 1M token vào
  outPrice: number; // USD / 1M token ra
  audio: boolean; // nhận audio input? (chấm bài nói bằng cách NGHE)
  jsonSchema: boolean; // có JSON schema nghiêm ngặt?
  free: boolean; // có free tier?
  note?: string; // cảnh báo hiện kèm ở dropdown admin
  /**
   * Optional detail for models with cache and long-context pricing. `inPrice`/`outPrice`
   * remain the normal (short-context, uncached) list rates used by the usage estimate.
   */
  pricing?: {
    cachedInput: number;
    cacheWrite: number;
    /** A request whose input is above this threshold is billed at these rates in full. */
    longContext?: {
      thresholdTokens: number;
      inPrice: number;
      cachedInput: number;
      cacheWrite: number;
      outPrice: number;
    };
  };
};

const m = (
  provider: ProviderId,
  id: string,
  label: string,
  inPrice: number,
  outPrice: number,
  extra: Partial<ModelInfo> = {},
): ModelInfo => ({ id, provider, label, inPrice, outPrice, audio: false, jsonSchema: true, free: false, ...extra });

export const DEFAULT_MODELS: ModelInfo[] = [
  // Google: the only provider that listens to audio, so the audio tasks are pinned here.
  m("google", "gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite", 0.25, 1.5, { audio: true, free: true, note: "Mặc định — rẻ, nghe được audio." }),
  m("google", "gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", 0.3, 2.5, { audio: true, free: true }),
  m("google", "gemini-3.8-flash", "Gemini 3.8 Flash", 0.825, 4.125, { audio: true, free: true }),
  m("google", "gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)", 2, 12, { audio: true, note: "Giá bậc thang khi prompt > 200k token." }),
  m("google", "gemini-4-argon", "Gemini 4 Argon", 2, 10, { audio: true, note: "Đời mới nhất của Google." }),

  m("openai", "gpt-6-luna", "GPT-6 Luna", 0.1, 0.5, { note: "Rẻ nhất OpenAI." }),
  m("openai", "gpt-6.1-terra", "GPT-6.1 Terra", 1, 5),
  m("openai", "gpt-6.1-sol", "GPT-6.1 Sol", 2, 10),
  m("openai", "gpt-6-astra", "GPT-6 Astra", 10, 50, { note: "Flagship — đắt, chỉ đáng dùng cho tác vụ khó." }),

  m("anthropic", "claude-haiku-5-5", "Claude Haiku 5.5", 0.1, 0.5),
  m("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", 2, 10),
  m("anthropic", "claude-opus-5-5", "Claude Opus 5.5", 4, 20),
  m("anthropic", "claude-fable-5-1", "Claude Fable 5.1", 10, 50, { note: "Mạnh nhất của Anthropic — rất đắt." }),

  m("deepseek", "deepseek-v4-flash", "DeepSeek V4 Flash", 0.14, 0.28, { jsonSchema: false, note: "Dữ liệu qua server Trung Quốc." }),
  m("deepseek", "deepseek-v4-pro", "DeepSeek V4 Pro", 0.955, 1.911, { jsonSchema: false, note: "Model suy luận — chậm. Dữ liệu qua server Trung Quốc." }),

  m("xai", "grok-4.3", "Grok 4.3", 1.25, 2.5),
  m("xai", "grok-4.7", "Grok 4.7", 2, 6),
];

const BY_ID = new Map(DEFAULT_MODELS.map((x) => [x.id, x]));

/** Finds a model of a provider in a list (ids are only unique per provider). */
export const findModelIn = (list: readonly ModelInfo[], provider: ProviderId, id: string): ModelInfo | undefined =>
  list.find((x) => x.provider === provider && x.id === id);

export const isProviderId = (v: unknown): v is ProviderId =>
  typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);

/** Cost of one call at LIST price (snapshotted when called — see schema.aiUsage.costUsd). */
export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  return costWith(BY_ID.get(model), inputTokens, outputTokens);
}

/** Same as `costOf` but for a model resolved elsewhere (runtime catalog has no entry in BY_ID). */
export function costWith(m: ModelInfo | undefined, inputTokens: number, outputTokens: number): number {
  if (!m) return 0;
  // GPT-5.6 charges the long-context rate for the FULL request once its input crosses the
  // provider threshold. Cache token details are not persisted in ai_usage yet, so this remains
  // a conservative uncached estimate.
  const long = m.pricing?.longContext;
  const rate = long && inputTokens > long.thresholdTokens ? long : m;
  return (inputTokens / 1_000_000) * rate.inPrice + (outputTokens / 1_000_000) * rate.outPrice;
}
