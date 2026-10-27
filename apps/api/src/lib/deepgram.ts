// ============================================================
//  Deepgram: Flux text-to-speech (/v2/speak) and word timings via speech-to-text (/v1/listen).
//  TTS returns audio only, so karaoke cues come from transcribing the finished clip and placing
//  each heard word on OUR script (the words stay ours, only the timings come from the machine).
// ============================================================
import { HTTPException } from "hono/http-exception";
import type { AudioCueWord } from "@msyen/shared";
import type { WordBoundary } from "./azureSpeech";

const API = "https://api.deepgram.com";

/** REST speak takes at most 2000 characters per call. */
const MAX_CHARS = 1800;

export class DeepgramError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function failure(res: Response, what: string): Promise<DeepgramError> {
  const text = await res.text().catch(() => "");
  let reason = text.slice(0, 200);
  try {
    const j = JSON.parse(text);
    reason = j.err_msg || j.message || j.reason || reason;
  } catch {
    /* not JSON */
  }
  const hint = res.status === 402 ? " (hết credit)" : res.status === 401 ? " (key sai)" : "";
  return new DeepgramError(res.status, `Deepgram ${what} ${res.status}${hint}: ${reason}`);
}

/** Splits text into pieces under the REST limit, at sentence (then word) boundaries. */
export function splitForSpeak(text: string, max = MAX_CHARS): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  const sentences = t.match(/[^.!?\n]+[.!?]*["')\]]*\s*|\n+/g) ?? [t];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur.trim()) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (const w of s.split(/(\s+)/)) {
        if ((cur + w).length > max && cur.trim()) {
          out.push(cur.trim());
          cur = "";
        }
        cur += w;
      }
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const concat = (parts: ArrayBuffer[]): ArrayBuffer => {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), pos);
    pos += p.byteLength;
  }
  return out.buffer;
};

/** One REST call (≤2000 chars) → mp3. */
async function speakOnce(key: string, voice: string, text: string, speed?: number): Promise<ArrayBuffer> {
  const version = voice.startsWith("aura-") ? "v1" : "v2";
  const q = `model=${encodeURIComponent(voice)}&encoding=mp3${speed && speed !== 1 ? `&speed=${speed}` : ""}`;
  const res = await fetch(`${API}/${version}/speak?${q}`, {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw await failure(res, "TTS");
  return res.arrayBuffer();
}

/** Text → mp3. Long text is read in sentence-aligned pieces whose mp3 frames are joined. */
export async function dgSpeak(key: string, voice: string, text: string, speed?: number): Promise<ArrayBuffer> {
  const parts: ArrayBuffer[] = [];
  for (const piece of splitForSpeak(text)) parts.push(await speakOnce(key, voice, piece, speed));
  return concat(parts);
}

/** Several clips (e.g. dialogue turns, each in its own voice) → one mp3. */
export const joinMp3 = concat;

/** Transcribes an mp3 and returns each heard word with its timing (seconds). */
export async function dgWordTimings(key: string, mp3: ArrayBuffer): Promise<WordBoundary[]> {
  const res = await fetch(`${API}/v1/listen?model=nova-3&language=en&punctuate=false&smart_format=false`, {
    method: "POST",
    headers: { authorization: `Token ${key}`, "content-type": "audio/mpeg" },
    body: mp3,
  });
  if (!res.ok) throw await failure(res, "STT");
  const data = (await res.json().catch(() => null)) as {
    results?: { channels?: { alternatives?: { words?: { word: string; start: number; end: number }[] }[] }[] };
  } | null;
  const words = data?.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  return words.map((w) => ({ text: w.word, offset: w.start, duration: Math.max(0, w.end - w.start) }));
}

type DgWord = { word: string; punctuated_word?: string; start: number; end: number; speaker?: number };
export type DgCue = { start: number; end: number; text: string; speaker?: number; words: { w: string; s: number; e: number; sp?: number }[] };

const dgWords = (words: DgWord[] | undefined) =>
  (words ?? [])
    .map((w) => ({ w: (w.punctuated_word || w.word || "").trim(), s: w.start, e: w.end, ...(w.speaker != null ? { sp: w.speaker } : {}) }))
    .filter((w) => w.w);

/**
 * Media → timed cues (one per utterance) with per-word timings and speaker labels. Same options as
 * v3: punctuated, cased, numbers formatted, and diarized on every call — a
 * dialogue heard as one voice cannot be split back into turns without paying for the audio again.
 */
export async function dgTranscribe(
  key: string,
  media: { audio: ArrayBuffer; contentType: string } | { url: string },
  lang = "en",
): Promise<DgCue[]> {
  const q = new URLSearchParams({
    model: "nova-3",
    language: lang,
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    diarize: "true",
  });
  const res = await fetch(`${API}/v1/listen?${q}`, {
    method: "POST",
    headers:
      "url" in media
        ? { authorization: `Token ${key}`, "content-type": "application/json" }
        : { authorization: `Token ${key}`, "content-type": media.contentType || "audio/mpeg" },
    body: "url" in media ? JSON.stringify({ url: media.url }) : media.audio,
  });
  if (!res.ok) throw await failure(res, "STT");
  const data = (await res.json().catch(() => null)) as {
    results?: {
      utterances?: { start: number; end: number; transcript: string; speaker?: number; words?: DgWord[] }[];
      channels?: { alternatives?: { transcript?: string; words?: DgWord[] }[] }[];
    };
  } | null;
  const cues: DgCue[] = (data?.results?.utterances ?? [])
    .filter((u) => u.transcript?.trim())
    .map((u) => ({
      start: u.start,
      end: u.end,
      text: u.transcript.trim(),
      ...(u.speaker != null ? { speaker: u.speaker } : {}),
      words: dgWords(u.words),
    }));
  if (cues.length) return cues;
  // No utterances: one cue for the whole channel.
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const words = dgWords(alt?.words);
  const text = alt?.transcript?.trim();
  return text && words.length ? [{ start: words[0].s, end: words[words.length - 1].e, text, words }] : [];
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, "");

/**
 * Places heard words on the script. Tokens of the script are matched in order against the
 * transcript (case and punctuation ignored, small look-ahead both ways), so a misheard or dropped
 * word only loses its own cue instead of shifting every cue after it.
 */
export function alignHeard(text: string, heard: WordBoundary[]): AudioCueWord[] {
  const tokens: { s: number; e: number; n: string }[] = [];
  for (const m of text.matchAll(/[A-Za-z0-9’']+(?:[-–][A-Za-z0-9’']+)*/g)) {
    tokens.push({ s: m.index!, e: m.index! + m[0].length, n: norm(m[0]) });
  }
  const out: AudioCueWord[] = [];
  let h = 0;
  for (let i = 0; i < tokens.length && h < heard.length; i++) {
    const tok = tokens[i];
    let hit = -1;
    for (let k = h; k < Math.min(heard.length, h + 4); k++) {
      if (norm(heard[k].text) === tok.n) {
        hit = k;
        break;
      }
    }
    if (hit < 0) {
      // A hyphenated script word ("well-known") is heard as two words.
      const joined = h + 1 < heard.length ? norm(heard[h].text) + norm(heard[h + 1].text) : "";
      if (joined && joined === tok.n.replace(/[-–]/g, "")) {
        const a = heard[h];
        const b = heard[h + 1];
        out.push({ s: tok.s, e: tok.e, t: round(a.offset), d: round(b.offset + b.duration - a.offset) });
        h += 2;
      }
      continue;
    }
    const w = heard[hit];
    out.push({ s: tok.s, e: tok.e, t: round(w.offset), d: round(w.duration) });
    h = hit + 1;
  }
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Checks a key without spending credit. Returns an error message, or null when it works. */
export async function dgCheckKey(key: string): Promise<string | null> {
  const res = await fetch(`${API}/v1/projects`, { headers: { authorization: `Token ${key}` } });
  if (res.ok) return null;
  return (await failure(res, "key")).message;
}

export const asHttp = (e: unknown): HTTPException =>
  e instanceof HTTPException ? e : new HTTPException(502, { message: (e as Error).message });
