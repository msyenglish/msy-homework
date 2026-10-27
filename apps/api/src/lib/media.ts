// ============================================================
//  Media gateway: pronunciation scoring, TTS and transcription.
//   - Default: Azure Speech straight from the Worker (lib/azureSpeech.ts).
//   - Transcription: Deepgram straight from the Worker (uploads and direct media URLs).
//   No other service: everything runs from the Worker against Azure and Deepgram.
// ============================================================
import { HTTPException } from "hono/http-exception";
import type { AssessResult, AudioCues, CueWord, TtsProvider, VoiceGender } from "@msyen/shared";
import { TTS_ACCENT_LABEL, dialoguePools, dialogueStyle, findTtsVoice, pronounceVoice, ttsProviderOf, useVoice } from "@msyen/shared";
import type { Bindings } from "./env";
import {
  alignWords,
  assessShortWav,
  buildSsml,
  speechConfigured,
  synthesize,
  synthesizeTimed,
  type SsmlSegment,
} from "./azureSpeech";
import { alignHeard, asHttp, DeepgramError, dgSpeak, dgTranscribe, dgWordTimings, joinMp3 } from "./deepgram";
import { deepgramKeys, getTtsConfig, ttsReady } from "./tts";

export type { AssessResult } from "@msyen/shared";

const isWav = (contentType: string) => /wav/i.test(contentType);

/**
 * Pronunciation assessment of one recording on the server: short WAV clips, scored by Azure.
 * Long passages are scored in the browser (Speech SDK) and only merged here.
 */
export async function assessPronunciation(
  env: Bindings,
  args: { audio: ArrayBuffer; contentType: string; filename: string; referenceText: string; locale?: string },
): Promise<AssessResult> {
  if (isWav(args.contentType)) {
    return assessShortWav(env, { wav: args.audio, referenceText: args.referenceText, locale: args.locale });
  }
  throw new HTTPException(400, { message: "Bản ghi cần ở dạng WAV — hãy cập nhật trang và ghi lại nhé." });
}

export interface TranscribeCue {
  start: number; // seconds
  end: number;
  text: string;
  words?: CueWord[];
}
export interface TranscribeResult {
  cues: TranscribeCue[];
  lang?: string | null;
}

const isYoutubeUrl = (u: string) => /(?:youtube\.com\/|youtu\.be\/)/i.test(u);

/**
 * Media → timestamped cues with per-word timings and speaker labels, from Deepgram only.
 * Takes uploaded audio or a direct media URL (mp3/podcast). A YouTube link is refused with 501:
 * the Worker cannot pull audio out of YouTube, so its audio comes from the teacher (upload, or
 * `pnpm video:transcribe`) and is served from the transcript cache afterwards.
 */
export async function transcribeMedia(
  env: Bindings,
  args: { audio?: ArrayBuffer; contentType?: string; url?: string; lang?: string },
): Promise<TranscribeResult> {
  if (!args.audio && args.url && isYoutubeUrl(args.url)) {
    throw new HTTPException(501, {
      message: "Chưa có transcript của video này — bấm “Tải audio của video” (hoặc chạy pnpm video:transcribe <link>), hay dán transcript (SRT/VTT).",
    });
  }
  if (!(await deepgramKeys(env)).length) {
    throw new HTTPException(501, { message: "Chưa có key Deepgram — thêm key ở trang AI, hoặc dán transcript (SRT/VTT)." });
  }
  const lang = args.lang || "en";
  const media = args.audio ? { audio: args.audio, contentType: args.contentType || "audio/mpeg" } : { url: args.url! };
  try {
    return { cues: await withDeepgram(env, (key) => dgTranscribe(key, media, lang)), lang };
  } catch (e) {
    throw asHttp(e);
  }
}

type Synth = { bytes: ArrayBuffer; contentType: string; cues: AudioCues | null; provider: TtsProvider; voice: string };

/** Runs a Deepgram call over the key pool: an auth/credit/rate failure moves on to the next key. */
async function withDeepgram<T>(env: Bindings, fn: (key: string) => Promise<T>): Promise<T> {
  const keys = await deepgramKeys(env);
  if (!keys.length) throw new Error("Chưa có key Deepgram");
  let last: unknown;
  for (const key of keys) {
    try {
      return await fn(key);
    } catch (e) {
      last = e;
      if (!(e instanceof DeepgramError) || ![401, 402, 403, 429].includes(e.status)) break;
    }
  }
  throw last;
}

/** Deepgram clip + cues from a transcription of that clip, aligned to our own text. */
async function deepgramTimed(env: Bindings, text: string, voice: string, speed?: number): Promise<{ bytes: ArrayBuffer; cues: AudioCues | null }> {
  return withDeepgram(env, async (key) => {
    const bytes = await dgSpeak(key, voice, text, speed);
    const heard = await dgWordTimings(key, bytes).catch((e) => {
      console.error("[tts] deepgram timings failed:", (e as Error).message);
      return [];
    });
    const words = alignHeard(text, heard);
    return { bytes, cues: words.length ? { text, words } : null };
  });
}

/** Voice for word / sentence pronunciation (the R2 cache is keyed by it). */
export async function pronounceVoiceFor(env: Bindings, gender?: string | null): Promise<string> {
  const cfg = await getTtsConfig(env);
  if (cfg.pronounce.provider === "deepgram" && !(await ttsReady(env)).deepgram) return pronounceVoice(gender);
  return useVoice(cfg.pronounce, gender);
}

/** Model-reading audio (mp3) for a word or sentence. A Deepgram failure falls back to Azure. */
export async function synthesizeSpeech(
  env: Bindings,
  args: { text: string; voice?: string },
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const voice = args.voice || pronounceVoice(null);
  if (ttsProviderOf(voice) === "deepgram") {
    try {
      return { bytes: await withDeepgram(env, (key) => dgSpeak(key, voice, args.text)), contentType: "audio/mpeg" };
    } catch (e) {
      if (!(await speechConfigured(env))) throw asHttp(e);
      console.error("[tts] deepgram failed, falling back to azure:", (e as Error).message);
      const g = findTtsVoice(voice)?.gender;
      const { bytes } = await synthesize(env, buildSsml([{ voice: pronounceVoice(g), text: args.text }]));
      return { bytes, contentType: "audio/mpeg" };
    }
  }
  const { bytes } = await synthesize(env, buildSsml([{ voice, text: args.text }]));
  return { bytes, contentType: "audio/mpeg" };
}

/** Listening / model-reading audio with word-level karaoke cues. Female voice by default. */
export async function synthesizeKaraoke(env: Bindings, args: { text: string; gender?: VoiceGender | null }): Promise<Synth> {
  const cfg = await getTtsConfig(env);
  const ready = await ttsReady(env);
  if (cfg.listening.provider === "deepgram" && ready.deepgram) {
    const voice = useVoice(cfg.listening, args.gender);
    try {
      const { bytes, cues } = await deepgramTimed(env, args.text, voice);
      return { bytes, contentType: "audio/mpeg", cues, provider: "deepgram", voice };
    } catch (e) {
      if (!ready.azure) throw asHttp(e);
      console.error("[tts] deepgram listening failed, falling back to azure:", (e as Error).message);
    }
  }
  const voice = cfg.listening.provider === "azure" ? useVoice(cfg.listening, args.gender) : pronounceVoice(args.gender);
  const { bytes, cues } = await synthesizeTimed(env, { text: args.text, voice });
  return { bytes, contentType: "audio/mpeg", cues, provider: "azure", voice };
}

/** Female / male voice pools for dialogue speakers, from the settings (Azure when Deepgram has no key). */
export async function dialoguePoolsFor(env: Bindings): Promise<{ female: string[]; male: string[] }> {
  const cfg = await getTtsConfig(env);
  const provider = cfg.dialogue.provider === "deepgram" && !(await ttsReady(env)).deepgram ? "azure" : cfg.dialogue.provider;
  return dialoguePools({ ...cfg.dialogue, provider });
}

// Speaker label at the start of a line: "Ben (M) [worried]: text".
const TURN_RE = /^\s*([^:\n]{1,40}?)\s*:\s*(.*)$/;
const EMOTION_RE = /\[\s*([A-Za-z][\w -]{0,24})\s*\]\s*$/;

type Turn = { voice: string; rate?: string; text: string; style: string | null };

function parseTurns(script: string, cast: Record<string, { voice: string; rate?: string }>): Turn[] {
  const castByKey = new Map(Object.entries(cast).map(([label, c]) => [label.toUpperCase(), c]));
  const turns: Turn[] = [];
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = TURN_RE.exec(line);
    let label = m?.[1] ?? "";
    const emotion = EMOTION_RE.exec(label);
    if (emotion) label = label.slice(0, emotion.index).trim();
    const c = m ? castByKey.get(label.toUpperCase()) : undefined;
    if (c && m) {
      turns.push({ voice: c.voice, rate: c.rate, text: m[2].trim(), style: dialogueStyle(emotion?.[1]) });
    } else if (turns.length) {
      turns[turns.length - 1].text += ` ${line}`; // continuation line joins the open turn
    }
  }
  return turns.filter((t) => t.text);
}

/**
 * Multi-speaker dialogue → one mp3 + karaoke cues. Azure reads it in a single SSML request (one
 * <voice> per turn); Deepgram reads each turn in its speaker's voice and the clips are joined.
 * Cue text = the turns WITHOUT their labels, joined by "\n" (the audio never reads a label).
 */
export async function synthesizeDialogue(
  env: Bindings,
  args: { script: string; cast: Record<string, { voice: string; rate?: string }>; gapMs?: number },
): Promise<{ bytes: ArrayBuffer; contentType: string; cues: AudioCues | null; voices: string[]; provider: TtsProvider }> {
  const spoken = parseTurns(args.script, args.cast);
  if (spoken.length === 0) throw new HTTPException(400, { message: "Kịch bản hội thoại không có lượt thoại nào" });
  const text = spoken.map((t) => t.text).join("\n");
  const voices = [...new Set(spoken.map((t) => t.voice))];

  if (spoken.every((t) => ttsProviderOf(t.voice) === "deepgram")) {
    const { bytes, words } = await withDeepgram(env, async (key) => {
      const clips: ArrayBuffer[] = [];
      for (const t of spoken) clips.push(await dgSpeak(key, t.voice, t.text, t.rate ? Number(t.rate) : undefined));
      const joined = joinMp3(clips);
      const heard = await dgWordTimings(key, joined).catch(() => []);
      return { bytes: joined, words: alignHeard(text, heard) };
    });
    return { bytes, contentType: "audio/mpeg", cues: words.length ? { text, words } : null, voices, provider: "deepgram" };
  }

  const segments: SsmlSegment[] = spoken.map((t, i) => ({
    voice: t.voice,
    text: t.text,
    rate: t.rate,
    // Styles only on voices that support them; the rest read the line neutrally.
    style: findTtsVoice(t.voice)?.styles === false ? null : t.style,
    pauseMsAfter: i < spoken.length - 1 ? args.gapMs ?? 350 : 0,
  }));
  const { bytes, words } = await synthesize(env, buildSsml(segments));
  const aligned = alignWords(text, words);
  return { bytes, contentType: "audio/mpeg", cues: aligned.length ? { text, words: aligned } : null, voices, provider: "azure" };
}

/** Technical "provider / voice" tag stored with the exercise and shown in the editor. */
export function ttsVoiceInfo(r: { provider: string; voice: string }): string {
  return `${r.provider} / ${r.voice}`;
}

/** Readable voice label, e.g. "azure · Jenny (Mỹ)". */
export function ttsLabel(provider: string, voice: string): string {
  const v = findTtsVoice(voice);
  if (v) return `${provider} · ${v.name} (${TTS_ACCENT_LABEL[v.accent]})`;
  const m = /^[a-z]{2}-[A-Z]{2}-([A-Za-z]+?)(?:Neural)?$/.exec(voice);
  return m ? `${provider} · ${m[1]}` : `${provider} · ${voice}`;
}

/** customMetadata stored on the R2 audio object. */
export function ttsAudioMeta(r: { provider: string; voice: string }): Record<string, string> {
  return { ttsProvider: r.provider, ttsVoice: r.voice, ttsLabel: ttsLabel(r.provider, r.voice) };
}
