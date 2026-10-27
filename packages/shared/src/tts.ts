// English voices for pronunciation (word · example sentence) and for listening / model-reading
// audio. Everything is synthesised by Azure Speech, which streams word boundaries, so karaoke
// subtitles come straight from the synthesis.
export type VoiceGender = "female" | "male";

// Provider tag stored with generated audio.
export const PRONOUNCE_PROVIDER = "azure";

// female = Jenny · male = Andrew.
export const PRONOUNCE_VOICES: Record<VoiceGender, string> = {
  female: "en-US-JennyNeural",
  male: "en-US-AndrewNeural",
};

/** gender → voice id; female by default. */
export function pronounceVoice(gender?: string | null): string {
  return gender === "male" ? PRONOUNCE_VOICES.male : PRONOUNCE_VOICES.female;
}

// ── Multi-speaker dialogue (listening scripts) ──────────────────────────────
// Standard neural voices that support speaking styles AND word boundaries. Each speaker gets a
// voice of their own gender; same-gender speakers are told apart by rotating the pool.
export const DIALOGUE_VOICES_FEMALE: string[] = ["en-US-JennyNeural", "en-US-AriaNeural", "en-US-SaraNeural", "en-US-NancyNeural"];
export const DIALOGUE_VOICES_MALE: string[] = ["en-US-GuyNeural", "en-US-DavisNeural", "en-US-JasonNeural", "en-US-TonyNeural"];

// Alternating female/male pool for speakers whose gender is unknown.
export const DIALOGUE_VOICES: string[] = [
  "en-US-JennyNeural",
  "en-US-GuyNeural",
  "en-US-AriaNeural",
  "en-US-DavisNeural",
  "en-US-SaraNeural",
  "en-US-JasonNeural",
];

export const DIALOGUE_PROVIDER = "azure";

/**
 * Project-level emotions used in dialogue scripts: `Ben (M) [worried]: ...`. Kept apart from Azure
 * style names so lesson content does not depend on one vendor's vocabulary.
 */
export const DIALOGUE_EMOTIONS = [
  "neutral", "happy", "excited", "sad", "worried", "angry",
  "surprised", "gentle", "calm", "hopeful", "serious", "confused", "embarrassed", "whisper",
  "jealous", "relieved", "regretful", "disgusted", "shouting",
] as const;

// Emotion → Azure style supported by the dialogue voices above. Unmapped emotions read neutral.
const EMOTION_STYLE: Record<string, string> = {
  happy: "cheerful",
  excited: "excited",
  sad: "sad",
  worried: "terrified",
  angry: "angry",
  gentle: "friendly",
  calm: "friendly",
  hopeful: "hopeful",
  serious: "unfriendly",
  whisper: "whispering",
  shouting: "shouting",
};

/** SSML style for an emotion tag; null = neutral delivery. */
export function dialogueStyle(emotion?: string | null): string | null {
  return emotion ? EMOTION_STYLE[emotion.trim().toLowerCase()] ?? null : null;
}

/**
 * Speaking rate per CEFR band, as an SSML `rate` multiplier: beginners get room to catch each
 * word, natural speed arrives at A2, and B1+ is a touch faster.
 */
export const DIALOGUE_RATE_BY_CEFR: Record<string, string> = {
  "pre-a1": "0.85",
  a1: "0.9",
  a2: "1.0",
  b1: "1.1",
  b2: "1.1",
  c1: "1.1",
  c2: "1.1",
};
export const DIALOGUE_RATE_DEFAULT = "1.0";

/**
 * SSML rate for a level name such as "Pre A1 Starters" or "B1 Preliminary".
 * "Pre A1" is tested before "A1", otherwise every Pre-A1 lesson would match the A1 rule.
 */
export function dialogueRateForLevel(level?: string | null): string {
  const s = (level ?? "").toLowerCase();
  if (/\bpre[\s-]*a1\b/.test(s)) return DIALOGUE_RATE_BY_CEFR["pre-a1"];
  for (const band of ["a1", "a2", "b1", "b2", "c1", "c2"]) {
    if (new RegExp(`\\b${band}\\b`).test(s)) return DIALOGUE_RATE_BY_CEFR[band];
  }
  return DIALOGUE_RATE_DEFAULT;
}

// ── Voice catalogue & per-use configuration ─────────────────────────────────
// Two providers: Azure (word boundaries, styles) and Deepgram Flux (natural single-narrator voices,
// regional accents). The teacher picks a provider and voices per use on /teacher/ai.

export type TtsProvider = "azure" | "deepgram";
export type TtsAccent = "US" | "UK" | "AU" | "IE" | "IN";
export type TtsUse = "pronounce" | "listening" | "dialogue";

export interface TtsVoice {
  id: string; // provider voice / model id
  provider: TtsProvider;
  name: string;
  accent: TtsAccent;
  gender: VoiceGender;
  /** Azure only: supports `mstts:express-as` speaking styles (dialogue emotions). */
  styles?: boolean;
}

const AZURE_STYLED = new Set([
  "en-US-JennyNeural", "en-US-AriaNeural", "en-US-AvaNeural", "en-US-SaraNeural", "en-US-NancyNeural",
  "en-US-GuyNeural", "en-US-DavisNeural", "en-US-JasonNeural", "en-US-TonyNeural", "en-GB-SoniaNeural", "en-GB-RyanNeural",
]);

const az = (id: string, accent: TtsAccent, gender: VoiceGender): TtsVoice => ({
  id,
  provider: "azure",
  styles: AZURE_STYLED.has(id),
  name: /^[a-z]{2}-[A-Z]{2}-([A-Za-z]+?)(?:Multilingual)?Neural$/.exec(id)?.[1] ?? id,
  accent,
  gender,
});
const dg = (name: string, accent: TtsAccent, gender: VoiceGender): TtsVoice => ({
  id: `flux-${name.toLowerCase()}-en`,
  provider: "deepgram",
  name,
  accent,
  gender,
});

export const TTS_VOICES: TtsVoice[] = [
  az("en-US-JennyNeural", "US", "female"),
  az("en-US-AriaNeural", "US", "female"),
  az("en-US-AvaNeural", "US", "female"),
  az("en-US-EmmaNeural", "US", "female"),
  az("en-US-SaraNeural", "US", "female"),
  az("en-US-NancyNeural", "US", "female"),
  az("en-US-AndrewNeural", "US", "male"),
  az("en-US-BrianNeural", "US", "male"),
  az("en-US-GuyNeural", "US", "male"),
  az("en-US-DavisNeural", "US", "male"),
  az("en-US-JasonNeural", "US", "male"),
  az("en-US-TonyNeural", "US", "male"),
  az("en-GB-SoniaNeural", "UK", "female"),
  az("en-GB-LibbyNeural", "UK", "female"),
  az("en-GB-AbbiNeural", "UK", "female"),
  az("en-GB-BellaNeural", "UK", "female"),
  az("en-GB-RyanNeural", "UK", "male"),
  az("en-GB-ThomasNeural", "UK", "male"),
  az("en-GB-AlfieNeural", "UK", "male"),
  az("en-GB-ElliotNeural", "UK", "male"),
  az("en-AU-NatashaNeural", "AU", "female"),
  az("en-AU-WilliamNeural", "AU", "male"),
  az("en-IE-EmilyNeural", "IE", "female"),
  az("en-IE-ConnorNeural", "IE", "male"),

  dg("Hannah", "US", "female"),
  dg("Elise", "US", "female"),
  dg("Heather", "US", "female"),
  dg("Brooke", "US", "female"),
  dg("Haley", "US", "female"),
  dg("Kelsey", "US", "female"),
  dg("Meghan", "US", "female"),
  dg("Sienna", "US", "female"),
  dg("Marcus", "US", "male"),
  dg("Miles", "US", "male"),
  dg("Wade", "US", "male"),
  dg("Bruce", "US", "male"),
  dg("Drew", "US", "male"),
  dg("Cliff", "US", "male"),
  dg("Cole", "US", "male"),
  dg("Gemma", "UK", "female"),
  dg("Rufus", "UK", "male"),
  dg("Kit", "UK", "male"),
  dg("Jack", "UK", "male"),
  dg("Sean", "UK", "male"),
  dg("Tanner", "UK", "male"),
  dg("Colin", "UK", "male"),
  dg("Sharon", "AU", "female"),
  dg("Maeve", "IE", "female"),
  dg("Conor", "IE", "male"),
  dg("Priya", "IN", "female"),
  dg("Naveen", "IN", "male"),
];

export const TTS_ACCENT_LABEL: Record<TtsAccent, string> = { US: "Mỹ", UK: "Anh", AU: "Úc", IE: "Ireland", IN: "Ấn Độ" };
export const TTS_PROVIDER_LABEL: Record<TtsProvider, string> = { azure: "Azure Speech", deepgram: "Deepgram Flux" };

export const findTtsVoice = (id: string): TtsVoice | undefined => TTS_VOICES.find((v) => v.id === id);
/** Provider that owns a voice id (Deepgram ids are `flux-…`/`aura-…`). */
export const ttsProviderOf = (voice: string): TtsProvider => (/^(flux|aura)-/.test(voice) ? "deepgram" : "azure");

export interface TtsUseConfig {
  provider: TtsProvider;
  female: string;
  male: string;
}
export interface TtsDialogueConfig {
  provider: TtsProvider;
  /** Accents speakers are drawn from; each speaker keeps one voice for the whole script. */
  accents: TtsAccent[];
}
export interface TtsConfig {
  pronounce: TtsUseConfig;
  listening: TtsUseConfig;
  dialogue: TtsDialogueConfig;
}

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  pronounce: { provider: "azure", female: PRONOUNCE_VOICES.female, male: PRONOUNCE_VOICES.male },
  listening: { provider: "azure", female: PRONOUNCE_VOICES.female, male: PRONOUNCE_VOICES.male },
  dialogue: { provider: "azure", accents: ["US"] },
};

/** A voice for a use; falls back to the provider default when the stored id is unknown. */
export function useVoice(cfg: TtsUseConfig, gender?: string | null): string {
  const id = gender === "male" ? cfg.male : cfg.female;
  const v = findTtsVoice(id);
  if (v && v.provider === cfg.provider) return id;
  const pool = TTS_VOICES.filter((x) => x.provider === cfg.provider && x.gender === (gender === "male" ? "male" : "female"));
  return pool[0]?.id ?? pronounceVoice(gender);
}

/** Female / male voice pools for dialogue speakers. */
export function dialoguePools(cfg: TtsDialogueConfig): { female: string[]; male: string[] } {
  const pick = (g: VoiceGender) => {
    const inAccent = TTS_VOICES.filter((v) => v.provider === cfg.provider && v.gender === g && cfg.accents.includes(v.accent));
    return (inAccent.length ? inAccent : TTS_VOICES.filter((v) => v.provider === cfg.provider && v.gender === g)).map((v) => v.id);
  };
  // Interleave accents so two speakers of one gender also differ in accent when several are chosen.
  const spread = (ids: string[]) => {
    const by = new Map<string, string[]>();
    for (const id of ids) {
      const a = findTtsVoice(id)?.accent ?? "US";
      by.set(a, [...(by.get(a) ?? []), id]);
    }
    const lists = [...by.values()];
    const out: string[] = [];
    for (let i = 0; out.length < ids.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  };
  return { female: spread(pick("female")), male: spread(pick("male")) };
}
