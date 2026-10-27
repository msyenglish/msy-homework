// ============================================================
//  Azure Speech, called straight from the Worker (no media service in between).
//   - issueSpeechToken: 10-minute token for the browser Speech SDK (long read-aloud).
//   - assessShortWav:   pronunciation assessment over REST — WAV 16 kHz mono, at most 30 s.
//   - synthesize:       TTS over the Speech WebSocket, which also yields word boundaries.
//  Credentials: keys saved on the AI page (D1, encrypted, stored as "region|key") first, then the
//  AZURE_SPEECH_KEY + AZURE_SPEECH_REGION secrets. Missing → the features answer 503.
// ============================================================
import { HTTPException } from "hono/http-exception";
import { mapAzureResult, type AssessResult, type AudioCues, type AudioCueWord, type AzureNBest } from "@msyen/shared";
import { getDb } from "../db";
import { dbKeys } from "./ai/keyring";
import type { Bindings } from "./env";

/** REST pronunciation assessment rejects longer audio; longer clips go through the browser SDK. */
export const SHORT_ASSESS_MAX_SECONDS = 30;

export type SpeechCreds = { key: string; region: string };

/** Packs a stored Azure Speech key: the region travels with the key inside the encrypted value. */
export const packSpeechKey = (region: string, key: string) => `${region.trim().toLowerCase()}|${key.trim()}`;

export function unpackSpeechKey(stored: string): SpeechCreds | null {
  const i = stored.indexOf("|");
  if (i <= 0) return null;
  return { region: stored.slice(0, i), key: stored.slice(i + 1) };
}

let credsCache: { at: number; creds: SpeechCreds | null } | null = null;
const CREDS_TTL = 60_000;

/** Drops the per-isolate credential cache after keys change. */
export function forgetSpeechCreds() {
  credsCache = null;
  cachedToken = null;
}

/** First usable credentials: an enabled D1 key, else the Worker secrets. Cached per isolate for a minute. */
export async function speechCreds(env: Bindings): Promise<SpeechCreds | null> {
  if (credsCache && Date.now() - credsCache.at < CREDS_TTL) return credsCache.creds;
  let creds: SpeechCreds | null = null;
  try {
    for (const stored of await dbKeys(env, getDb(env.DB), "azure")) {
      creds = unpackSpeechKey(stored);
      if (creds) break;
    }
  } catch {
    /* table unavailable → fall back to the secrets */
  }
  if (!creds && env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION) creds = { key: env.AZURE_SPEECH_KEY, region: env.AZURE_SPEECH_REGION };
  credsCache = { at: Date.now(), creds };
  return creds;
}

export async function speechConfigured(env: Bindings): Promise<boolean> {
  return !!(await speechCreds(env));
}

async function requireSpeech(env: Bindings): Promise<SpeechCreds> {
  const creds = await speechCreds(env);
  if (!creds) throw new HTTPException(503, { message: "Chưa cấu hình Azure Speech — thêm key ở trang AI → Key." });
  return creds;
}

/** Checks a key + region by asking for a token; returns an error message or null when it works. */
export async function checkSpeechKey(key: string, region: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (res.ok) return null;
    return res.status === 401 ? "key hoặc vùng (region) không đúng" : `Azure trả về lỗi ${res.status}`;
  } catch {
    return `không kết nối được vùng "${region}"`;
  }
}

// ---------- Token for the browser SDK ----------

let cachedToken: { token: string; region: string; expiresAt: number } | null = null;

/** Short-lived authorization token; cached per isolate for 9 of its 10 minutes. */
export async function issueSpeechToken(env: Bindings): Promise<{ token: string; region: string; expiresAt: number }> {
  const { key, region } = await requireSpeech(env);
  if (cachedToken && cachedToken.region === region && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken;
  const res = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key },
  });
  if (!res.ok) throw new HTTPException(502, { message: `Azure Speech từ chối cấp token (${res.status})` });
  cachedToken = { token: await res.text(), region, expiresAt: Date.now() + 9 * 60_000 };
  return cachedToken;
}

// ---------- Pronunciation assessment (short audio) ----------

/** Seconds of audio in a PCM WAV (reads the RIFF header; 0 when it is not one). */
export function wavSeconds(wav: ArrayBuffer): number {
  const v = new DataView(wav);
  if (wav.byteLength < 44 || v.getUint32(0, false) !== 0x52494646) return 0; // "RIFF"
  const byteRate = v.getUint32(28, true);
  return byteRate ? (wav.byteLength - 44) / byteRate : 0;
}

/**
 * Pronunciation assessment of a short WAV clip (16 kHz, 16-bit, mono — what the web recorder
 * produces). Azure's own scores are used as-is.
 */
export async function assessShortWav(
  env: Bindings,
  args: { wav: ArrayBuffer; referenceText: string; locale?: string },
): Promise<AssessResult> {
  const { key, region } = await requireSpeech(env);
  if (wavSeconds(args.wav) > SHORT_ASSESS_MAX_SECONDS) {
    throw new HTTPException(400, { message: `Bản ghi dài quá ${SHORT_ASSESS_MAX_SECONDS} giây — đọc ngắn lại nhé.` });
  }
  const params = {
    ReferenceText: args.referenceText,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true,
    EnableProsodyAssessment: true,
    PhonemeAlphabet: "IPA",
  };
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(args.locale ?? "en-US")}&format=detailed`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": btoa(unescape(encodeURIComponent(JSON.stringify(params)))),
        Accept: "application/json",
      },
      body: args.wav,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new HTTPException(502, { message: `Không gọi được Azure Speech: ${(e as Error).message}` });
  }
  if (!res.ok) throw new HTTPException(res.status === 400 ? 400 : 502, { message: `Azure Speech lỗi ${res.status}` });
  const json = (await res.json()) as { RecognitionStatus?: string; Duration?: number; NBest?: AzureNBest[] };
  if (json.RecognitionStatus !== "Success") {
    throw new HTTPException(400, { message: "Không nghe rõ giọng đọc — em thử ghi lại gần micro hơn nhé." });
  }
  return mapAzureResult(json.NBest?.[0], json.Duration ?? 0);
}

// ---------- Text to speech (WebSocket, with word boundaries) ----------

export interface SsmlSegment {
  voice: string;
  text: string;
  rate?: string; // SSML prosody rate multiplier, e.g. "0.9"
  style?: string | null; // mstts:express-as style, e.g. "cheerful"
  pauseMsAfter?: number;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** One SSML document; every segment is its own <voice> so a dialogue needs a single request. */
export function buildSsml(segments: SsmlSegment[], lang = "en-US"): string {
  const body = segments
    .map((s) => {
      let inner = xmlEscape(s.text);
      if (s.rate && s.rate !== "1" && s.rate !== "1.0") inner = `<prosody rate="${s.rate}">${inner}</prosody>`;
      if (s.style) inner = `<mstts:express-as style="${s.style}">${inner}</mstts:express-as>`;
      if (s.pauseMsAfter) inner += `<break time="${s.pauseMsAfter}ms"/>`;
      return `<voice name="${s.voice}">${inner}</voice>`;
    })
    .join("");
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">${body}</speak>`
  );
}

export interface WordBoundary {
  text: string;
  offset: number; // seconds from the start of the audio
  duration: number; // seconds
}

const wsHeader = (path: string, requestId: string, contentType: string) =>
  `Path: ${path}\r\nX-RequestId: ${requestId}\r\nX-Timestamp: ${new Date().toISOString()}\r\nContent-Type: ${contentType}\r\n\r\n`;

/** Synthesises SSML to mp3 and collects the word boundaries Azure streams alongside the audio. */
export async function synthesize(env: Bindings, ssml: string): Promise<{ bytes: ArrayBuffer; words: WordBoundary[] }> {
  const { key, region } = await requireSpeech(env);
  const requestId = crypto.randomUUID().replace(/-/g, "");
  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1?X-ConnectionId=${requestId}`,
    { headers: { Upgrade: "websocket", "Ocp-Apim-Subscription-Key": key } },
  );
  const ws = res.webSocket;
  if (!ws) throw new HTTPException(502, { message: `Azure TTS không mở được kết nối (${res.status})` });
  ws.accept();

  const chunks: Uint8Array[] = [];
  const words: WordBoundary[] = [];
  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Azure TTS quá thời gian")), 120_000);
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        const sep = ev.data.indexOf("\r\n\r\n");
        const head = ev.data.slice(0, sep);
        const path = /Path:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim();
        if (path === "audio.metadata") {
          const meta = JSON.parse(ev.data.slice(sep + 4)) as {
            Metadata: { Type: string; Data: { Offset: number; Duration: number; text?: { Text?: string } } }[];
          };
          for (const m of meta.Metadata) {
            if (m.Type === "WordBoundary" && m.Data.text?.Text) {
              words.push({ text: m.Data.text.Text, offset: m.Data.Offset / 1e7, duration: m.Data.Duration / 1e7 });
            }
          }
        } else if (path === "turn.end") {
          clearTimeout(timer);
          resolve();
        }
      } else {
        const buf = new Uint8Array(ev.data as ArrayBuffer);
        const headLen = (buf[0] << 8) | buf[1];
        const head = new TextDecoder().decode(buf.subarray(2, 2 + headLen));
        if (/Path:\s*audio/i.test(head) && buf.length > 2 + headLen) chunks.push(buf.slice(2 + headLen));
      }
    });
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Azure TTS lỗi kết nối"));
    });
  });

  ws.send(
    wsHeader("speech.config", requestId, "application/json") +
      JSON.stringify({ context: { system: { name: "SpeechSDK", version: "1.0", build: "JavaScript", lang: "JavaScript" } } }),
  );
  ws.send(
    wsHeader("synthesis.context", requestId, "application/json") +
      JSON.stringify({
        synthesis: {
          audio: {
            metadataOptions: {
              bookmarkEnabled: false,
              punctuationBoundaryEnabled: false,
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: true,
              visemeEnabled: false,
            },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
          language: { autoDetection: false },
        },
      }),
  );
  ws.send(wsHeader("ssml", requestId, "application/ssml+xml") + ssml);

  try {
    await done;
  } catch (e) {
    throw new HTTPException(502, { message: (e as Error).message });
  } finally {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new HTTPException(502, { message: "Azure TTS không trả audio" });
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return { bytes: out.buffer, words };
}

/**
 * Places each word boundary on its character range inside `text`. Boundaries carry the bare word
 * (no punctuation), so the search walks forward to keep punctuation highlighted with its word.
 */
export function alignWords(text: string, words: WordBoundary[], timeShift = 0, charBase = 0): AudioCueWord[] {
  const out: AudioCueWord[] = [];
  let pos = 0;
  for (const w of words) {
    let idx = text.indexOf(w.text, pos);
    if (idx < 0) idx = text.indexOf(w.text);
    if (idx < 0) continue;
    const e = idx + w.text.length;
    out.push({ s: charBase + idx, e: charBase + e, t: Math.round((w.offset + timeShift) * 1000) / 1000, d: Math.round(w.duration * 1000) / 1000 });
    pos = e;
  }
  return out;
}

/** Plain text → mp3 + karaoke cues on that exact text. */
export async function synthesizeTimed(
  env: Bindings,
  args: { text: string; voice: string; rate?: string },
): Promise<{ bytes: ArrayBuffer; cues: AudioCues | null }> {
  const { bytes, words } = await synthesize(env, buildSsml([{ voice: args.voice, text: args.text, rate: args.rate }]));
  const aligned = alignWords(args.text, words);
  return { bytes, cues: aligned.length ? { text: args.text, words: aligned } : null };
}
