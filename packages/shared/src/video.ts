// Bài học qua VIDEO (YouTube) — tiện ích DÙNG CHUNG cho web + api:
//  • bóc id video từ URL,
//  • phân tích transcript SRT/VTT/text → đoạn luyện có timestamp,
//  • che đáp án khi gửi client (theo chế độ), và chấm nghe-viết.
import { normalize, stripPunct } from "./grading";
import type { CueWord, PublicVideoSegment, VideoMode, VideoSegment, WordAlts } from "./types";

/** Bóc id 11 ký tự từ mọi dạng URL YouTube (watch, youtu.be, embed, shorts) hoặc trả về chính id. */
export function extractYoutubeId(input: string): string | null {
  const s = (input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

/** "00:01:02,500" | "00:01:02.500" | "1:02.5" → giây. */
function parseTimecode(tc: string): number {
  const clean = tc.trim().replace(",", ".");
  const parts = clean.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

interface Cue {
  start: number;
  end: number;
  text: string;
  words?: CueWord[]; // per-word timings when the source is STT (subtitles carry none)
}

const TIME_LINE = /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}|\d{1,2}:\d{2}(?::\d{2})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}|\d{1,2}:\d{2}(?::\d{2})?)/;

/** Phân tích SRT hoặc WebVTT (tự nhận diện) → danh sách cue. Bỏ tag <...>, số thứ tự, header WEBVTT. */
export function parseSubtitles(raw: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = raw.replace(/\r/g, "").replace(/^WEBVTT.*?\n\n/s, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) continue;
    const timeIdx = lines.findIndex((l) => TIME_LINE.test(l));
    if (timeIdx === -1) continue;
    const m = lines[timeIdx].match(TIME_LINE);
    if (!m) continue;
    const start = parseTimecode(m[1]);
    const end = parseTimecode(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const text = lines
      .slice(timeIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "") // bỏ tag định dạng/karaoke
      .replace(/\s+/g, " ")
      .trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

/**
 * Joins cues of one sentence (a cue not ending in . ! ? absorbs the next) so each line is a whole
 * sentence. Word timings ride along, otherwise the karaoke highlight stops halfway through a joined line.
 * Speaker labels are NOT checked here: mid-sentence is where diarization errs most, and a turn
 * change is cut later by `splitLongSegments` from the per-word labels.
 */
export function mergeIntoSentences(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    // Unpunctuated captions (YouTube auto-subs) never close a sentence: a long pause or the word
    // cap ends the join, or the whole video would become one line. Without punctuation nothing
    // later can cut the line again, so the cap is tighter there.
    const cap = prev && /[,.!?;]/.test(prev.text) ? 30 : 16;
    const prevOpen =
      prev &&
      !/[.!?]["')\]]?$/.test(prev.text) &&
      c.start - prev.end < 1.5 &&
      splitWords(prev.text).length + splitWords(c.text).length <= cap;
    if (prevOpen) {
      prev.text = `${prev.text} ${c.text}`.replace(/\s+/g, " ").trim();
      prev.end = c.end;
      if (c.words?.length) prev.words = [...(prev.words ?? []), ...c.words];
    } else {
      out.push({ ...c, words: c.words ? [...c.words] : undefined });
    }
  }
  return out;
}

/**
 * Gộp câu NGẮN với câu liền kề để mỗi đoạn luyện đủ dài mà nghe.
 *
 * STT trả utterance cắt theo CHỖ NGƯNG GIỌNG, nên hội thoại chậm ra rất nhiều mẩu 1-3 từ
 * ("Wait." · "Socks here."). `mergeIntoSentences` không cứu được vì chúng đã trọn câu — đủ dấu
 * chấm. Gộp phải làm ở đây, nơi còn TIMESTAMP: khoảng lặng dài giữa hai câu là ranh giới thật
 * (đổi người nói / đổi cảnh) nên không bao giờ vượt qua.
 */
export interface PackOpts {
  /** Dưới ngưỡng này thì cố gộp thêm câu sau. */
  minWords?: number;
  /** Trần cứng — gộp xong không được dài quá (còn gõ lại được). */
  maxWords?: number;
  /** Khoảng lặng (giây) coi là ranh giới: quá mốc này thì KHÔNG gộp. */
  maxGap?: number;
  /** Trần thời lượng một đoạn (giây) — dài quá thì nghe xong đã quên đầu câu. */
  maxDur?: number;
}
export function packSegments(segs: VideoSegment[], opts: PackOpts = {}): VideoSegment[] {
  // Mặc định CỐ Ý dè dặt: chỉ dính lại những mẩu rơi rớt trong cùng một hơi thở. Việc gộp cho ra
  // câu luyện tử tế giao cho AI (`video_group`) vì nó đọc được AI ĐANG NÓI — luật số-từ + khoảng
  // lặng thì không, và gộp tay quá đà sẽ xoá mất ranh giới mà AI cần để cắt đúng.
  const minWords = opts.minWords ?? 4;
  const maxWords = opts.maxWords ?? 12;
  const maxGap = opts.maxGap ?? 1;
  const maxDur = opts.maxDur ?? 14;
  const wc = (t: string) => splitWords(t).length;
  const out: VideoSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    const gap = prev ? s.start - prev.end : Infinity;
    const total = prev ? wc(prev.text) + wc(s.text) : 0;
    // Gộp khi: câu trước còn NGẮN, hoặc câu này quá ngắn để đứng một mình (mẩu rơi rớt).
    const wants = prev && (wc(prev.text) < minWords || wc(s.text) <= 2);
    // Two whole lines in two different voices are two turns: never glue a one-word reply
    // ("Exactly.") back onto the line it answers.
    const a = prev ? voiceOf(prev) : null;
    const b = voiceOf(s);
    const sameVoice = a == null || b == null || a === b;
    const fits = prev && sameVoice && total <= maxWords && s.end - prev.start <= maxDur && gap <= maxGap;
    if (wants && fits) {
      prev.text = `${prev.text} ${s.text}`.replace(/\s+/g, " ").trim();
      prev.end = s.end;
      // Bản dịch nối theo, không thì gộp xong mất nửa nghĩa.
      prev.vi = [prev.vi, s.vi].filter(Boolean).join(" ").trim() || null;
      const carried = [...(prev.words ?? []), ...(s.words ?? [])];
      prev.words = carried.length ? carried : null;
      prev.blanks = []; // chỉ số từ đã lệch sau khi gộp (trang luyện tự chọn ô khoét theo mức)
    } else {
      out.push({ ...s });
    }
  }
  return out.map((s, i) => ({ ...s, i }));
}

/** Cue → VideoSegment[] (gắn chỉ số i theo thứ tự). */
export function cuesToSegments(cues: Cue[]): VideoSegment[] {
  return cues.map((c, i) => ({ i, start: c.start, end: c.end, text: c.text }));
}

/** Splits text into words (kept verbatim — scoring indexes into this list). */
export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** The single speaker of a line, or null when it is unknown or mixed. */
function voiceOf(seg: { words?: CueWord[] | null }): number | null {
  const v = new Set((seg.words ?? []).map((w) => w.sp).filter((n): n is number => n != null));
  return v.size === 1 ? [...v][0] : null;
}

const ENDS_SENTENCE = /[.!?]["')\]]?$/;
const ENDS_CLAUSE = /[,;:—–-]["')\]]?$/;
/** Words that open a new clause — a natural place to breathe inside a long sentence. */
const CLAUSE_OPENER = /^(and|but|or|so|because|which|who|that|when|while|where|if|before|after|until|since|although|though)$/i;

/** Silence before a sentence end that marks somebody else's reaction (one speaker breathes less). */
const REACTION_MIN_GAP = 0.4;

/** Silence at each sentence boundary inside one line, read off the word timings. */
function sentenceGaps(words: CueWord[]): number[] {
  const out: number[] = [];
  for (let k = 0; k < words.length - 1; k++) {
    if (ENDS_SENTENCE.test(words[k].w) && /^["'(]?[A-Z]/.test(words[k + 1].w)) out.push(words[k + 1].s - words[k].e);
  }
  return out;
}

/**
 * Word indices where a new speaker starts inside one line (the first word never counts).
 * A run must be 2+ words, or one word that closes a sentence ("Exactly."): diarization often
 * mislabels a single word mid-sentence, and cutting a line at a misheard "yeah" is worse than
 * leaving it whole.
 */
export function speakerTurns(words: CueWord[] | null | undefined): number[] {
  if (!words?.length || words.some((w) => w.sp == null)) return [];
  const cuts: number[] = [];
  let runStart = 0;
  for (let i = 1; i <= words.length; i++) {
    if (i < words.length && words[i].sp === words[runStart].sp) continue;
    const len = i - runStart;
    if (runStart > 0 && (len >= 2 || (len === 1 && ENDS_SENTENCE.test(words[i - 1].w)))) cuts.push(runStart);
    runStart = i;
  }
  return cuts;
}

/**
 * Where to cut one over-long sentence: between two words, each side at least `minSide` words,
 * preferring a clause mark (comma, semicolon, dash) and a real pause. Returns null when no point
 * is a plausible breath — a line left long beats one broken mid-phrase.
 */
function clauseCut(words: CueWord[], minSide: number): number | null {
  let best: number | null = null;
  let bestScore = 0;
  const mid = words.length / 2;
  for (let k = minSide; k <= words.length - minSide; k++) {
    const gap = Math.max(0, words[k].s - words[k - 1].e);
    // A comma next to another comma is a list item ("fast, targeted, flexible"), not a clause end.
    const inList = ENDS_CLAUSE.test(words[k].w) || (k >= 2 && ENDS_CLAUSE.test(words[k - 2].w));
    const clause = ENDS_CLAUSE.test(words[k - 1].w) && !inList;
    const joint = CLAUSE_OPENER.test(words[k].w) && gap >= 0.08;
    if (!clause && !joint && gap < 0.25) continue;
    // A pause is the strongest evidence, a clause mark next; closeness to the middle breaks ties.
    const score = Math.min(gap, 1) + (clause ? 0.35 : 0) + (joint ? 0.2 : 0) - (Math.abs(k - mid) / words.length) * 0.3;
    if (best == null || score > bestScore) {
      best = k;
      bestScore = score;
    }
  }
  return best;
}

/** Splits `count` words at `cuts` (ascending word indices) into consecutive ranges. */
const rangesAt = (count: number, cuts: number[]): [number, number][] => {
  const bounds = [0, ...cuts, count];
  const out: [number, number][] = [];
  for (let k = 0; k < bounds.length - 1; k++) if (bounds[k + 1] > bounds[k]) out.push([bounds[k], bounds[k + 1]]);
  return out;
};

export interface SplitOpts {
  /** A line longer than this (words) is cut at sentence ends, then at clause breaths. */
  maxWords?: number;
  /** A line longer than this (seconds) is cut the same way. */
  maxSeconds?: number;
}

/**
 * Cuts lines that are too long to practise. STT cuts on utterances, not sentences, and
 * `mergeIntoSentences` then joins every utterance up to a full stop — a 39-word, 12-second line
 * that nobody can type back. Cuts, in order of trust:
 *   1. a change of speaker (per-word diarization labels),
 *   2. sentence ends — when the line is too long, or a short reaction follows a real pause,
 *   3. inside one long sentence, at a comma or a breath (needs word timings).
 * Each piece's clock comes from its own words when the transcriber sent them; without timings
 * (pasted subtitles) it is placed by character share and flagged `estimated`.
 */
export function splitLongSegments(segments: VideoSegment[], opts: SplitOpts = {}): VideoSegment[] {
  const maxWords = opts.maxWords ?? 16;
  const maxSeconds = opts.maxSeconds ?? 9;
  const out: VideoSegment[] = [];

  for (const seg of segments) {
    const tokens = splitWords(seg.text);
    // Word timings are usable only when they line up one-to-one with the text tokens.
    const timed = !!seg.words?.length && seg.words.length === tokens.length ? seg.words : null;
    const tooLong = (n: number, from: number, to: number) => n > maxWords || to - from > maxSeconds;

    let cuts = speakerTurns(timed);
    if (!cuts.length) {
      const ends: number[] = [];
      tokens.forEach((t, k) => k + 1 < tokens.length && ENDS_SENTENCE.test(t) && ends.push(k + 1));
      const sentenceLens = rangesAt(tokens.length, ends).map(([a, b]) => b - a);
      const hasReaction = ends.length > 0 && sentenceLens.some((n) => n <= 2);
      const heardAPause = timed ? sentenceGaps(timed).some((g) => g >= REACTION_MIN_GAP) : true;
      if (ends.length && (tooLong(tokens.length, seg.start, seg.end) || (hasReaction && heardAPause))) cuts = ends;
    }

    // A piece still too long is cut again inside its sentence, where a breath was heard.
    if (timed) {
      const refined: number[] = [];
      const cutRange = (a: number, b: number) => {
        const ws = timed.slice(a, b);
        if (!tooLong(b - a, ws[0].s, ws[ws.length - 1].e)) return;
        const k = clauseCut(ws, 4);
        if (k == null) return;
        cutRange(a, a + k);
        refined.push(a + k);
        cutRange(a + k, b);
      };
      for (const [a, b] of rangesAt(tokens.length, cuts)) {
        cutRange(a, b);
        if (b < tokens.length) refined.push(b);
      }
      cuts = refined.sort((x, y) => x - y);
    }

    if (!cuts.length) {
      out.push({ ...seg, i: out.length });
      continue;
    }

    const span = seg.end - seg.start;
    const chars = seg.text.length || 1;
    let charCursor = 0;
    rangesAt(tokens.length, cuts).forEach(([a, b], k) => {
      const text = tokens.slice(a, b).join(" ");
      const mine = timed ? timed.slice(a, b) : null;
      const from = seg.start + (charCursor / chars) * span;
      charCursor += text.length + 1;
      const to = seg.start + (Math.min(charCursor, chars) / chars) * span;
      out.push({
        i: out.length,
        start: round3(mine ? mine[0].s : from),
        end: round3(mine ? mine[mine.length - 1].e : to),
        text,
        vi: null, // the gloss described the whole block; the AI pass writes one per piece
        ipa: null,
        blanks: [],
        words: mine,
        estimated: mine ? false : k > 0,
      });
    });
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Widens each line into the silence around it. A word timestamp is only accurate to a few tens of
 * milliseconds — the length of an initial consonant — so a clip cut exactly at its first and last
 * word starts clipped and leaks its first sound into the end of the line before. Each side takes at
 * most 45% of the gap, so neighbours never overlap; with no gap the cut moves slightly earlier
 * (losing a final release costs less than losing an initial consonant).
 */
export function easeSegmentEdges(
  segments: VideoSegment[],
  opts: { tail?: number; head?: number; lead?: number } = {},
): VideoSegment[] {
  const tail = opts.tail ?? 0.2;
  const head = opts.head ?? 0.15;
  const lead = opts.lead ?? 0.06;
  if (!segments.length) return segments;
  const segs = segments.map((s) => ({ ...s }));
  for (let k = 0; k + 1 < segs.length; k++) {
    const cur = segs[k];
    const next = segs[k + 1];
    const gap = next.start - cur.end;
    if (gap > 0.02) {
      cur.end = round3(cur.end + Math.min(tail, gap * 0.45));
      next.start = round3(next.start - Math.min(head, gap * 0.45));
    } else {
      // Never cut into this line's own last word.
      const floor = (cur.words?.length ? cur.words[cur.words.length - 1].s : cur.start) + 0.05;
      const cut = round3(Math.max(Math.min(cur.end, next.start) - lead, floor));
      cur.end = cut;
      next.start = cut;
    }
  }
  segs[0].start = round3(Math.max(0, segs[0].start - head));
  const last = segs[segs.length - 1];
  last.end = round3(last.end + tail);
  for (const s of segs) if (s.end <= s.start) s.end = round3(s.start + 0.3);
  return segs;
}

// ── NUMBERS: one spelling in the text, several accepted from the learner ────────────────────

/** Letters and digits only — "twenty-four" ≈ "twenty four" ≈ "twentyfour", "771,000" ≈ "771000". */
export const compactWord = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** True when `typed` is one of the accepted alternatives of a word. */
export function altMatches(alts: string[] | null | undefined, typed: string): boolean {
  const t = compactWord(typed);
  return !!t && !!alts?.some((a) => compactWord(a) === t);
}

/**
 * Whole-line answer check where a word may also be typed as one of its alternatives — which can be
 * several words ("2024" ↔ "twenty twenty four"). Hyphens count as spaces on both sides, so
 * "twenty-two" ≈ "twenty two" and "24 hour" ≈ "24-hour". `same` compares one word to one typed word.
 */
export function matchWithAlts(
  expected: string[],
  typed: string[],
  alts: WordAlts | null | undefined,
  same: (want: string, got: string) => boolean,
): boolean {
  const parts = (s: string) => s.split(/[\s\-–—]+/).filter((p) => compactWord(p));
  const got = typed.flatMap(parts);
  const memo = new Map<string, boolean>();
  const go = (e: number, t: number): boolean => {
    if (e === expected.length) return t === got.length;
    const key = `${e}:${t}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    let ok = false;
    const options = [expected[e], ...(alts?.[e] ?? [])].map(parts);
    // A token with no letters or digits (a stray dash) asks for nothing.
    if (!options[0].length) ok = go(e + 1, t);
    for (const want of options) {
      if (ok) break;
      if (!want.length || t + want.length > got.length) continue;
      if (want.every((p, k) => same(p, got[t + k]))) ok = go(e + 1, t + want.length);
    }
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}

/** Counts said as one word that stay words in the text ("one mom", "two days"). */
const SMALL_NUMBER = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/;

/** A number expression the AI found in a line: its exact words, one canonical token, other forms. */
export interface NumberSpelling {
  text: string;
  canon: string;
  alts?: string[] | null;
}

/**
 * Writes each number of a line in its canonical form (one token, e.g. "2024") and records what else
 * a learner may type for it. The AI only names the spans; the replacement is done here, on whole
 * words, and a span that is not found word for word is ignored — the text never drifts from the audio
 * in any other way. Returns the new text and its alternatives keyed by word index.
 */
export function applyNumberSpellings(text: string, numbers: NumberSpelling[] | null | undefined): { text: string; alts: WordAlts | null } {
  let tokens = splitWords(text);
  let alts: Record<number, string[]> = {};
  let cursor = 0;
  for (let n of numbers ?? []) {
    const canon = n.canon?.trim();
    const want = splitWords(n.text || "").map(compactWord).filter(Boolean);
    if (!canon || /\s/.test(canon) || !want.length) continue;
    // The AI lists numbers in reading order: look after the previous one first ("one mom, one child").
    const found = (from: number) =>
      tokens.findIndex((_, k) => k >= from && want.every((w, j) => compactWord(tokens[k + j] ?? "") === w));
    const at = found(cursor) >= 0 ? found(cursor) : found(0);
    if (at < 0) continue;
    cursor = at + 1;
    const run = tokens.slice(at, at + want.length);
    // Keep the punctuation around the run: "four," → "2024,".
    const lead = run[0].match(/^["'(\[“‘]*/u)?.[0] ?? "";
    const trail = run[run.length - 1].match(/[^\p{L}\p{N}%]*$/u)?.[0] ?? "";
    let coreCanon = canon.replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, "");
    const spokenCore = run.join(" ").replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, "");
    // Already digits ("771,000") or a small count said as a word ("one mom", "two days"): the line
    // keeps its own spelling and the other form is only accepted.
    if (compactWord(spokenCore) === compactWord(coreCanon) || (want.length === 1 && SMALL_NUMBER.test(want[0]))) {
      n = { ...n, alts: [coreCanon, ...(n.alts ?? [])] };
      coreCanon = spokenCore;
    }
    tokens = [...tokens.slice(0, at), `${lead}${coreCanon}${trail}`, ...tokens.slice(at + want.length)];
    // Indices after the run move back by the words it lost.
    const shift = want.length - 1;
    const moved: Record<number, string[]> = {};
    for (const [k, v] of Object.entries(alts)) moved[Number(k) > at ? Number(k) - shift : Number(k)] = v;
    alts = moved;
    const spoken = run.join(" ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, "");
    const options = [spoken, ...(n.alts ?? [])]
      .map((x) => x.trim())
      .filter((x) => x && compactWord(x) !== compactWord(coreCanon));
    const uniq = [...new Map(options.map((x) => [compactWord(x), x])).values()].slice(0, 8);
    if (uniq.length) alts[at] = uniq;
  }
  const keys = Object.keys(alts);
  return { text: tokens.join(" "), alts: keys.length ? Object.fromEntries(keys.map((k) => [k, alts[Number(k)]])) : null };
}

/** Alternatives of lines joined into one, re-keyed by each part's word offset. */
export function joinAlts(parts: { text: string; alts?: WordAlts | null }[]): WordAlts | null {
  const out: WordAlts = {};
  let offset = 0;
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.alts ?? {})) out[String(Number(k) + offset)] = v;
    offset += splitWords(p.text).length;
  }
  return Object.keys(out).length ? out : null;
}

/** Packing used after splitting: tighter than `packSegments`' defaults so it cannot undo a cut. */
export const PRACTICE_PACK: PackOpts = { minWords: 5, maxWords: 14, maxGap: 0.6, maxDur: 9 };

/**
 * Timed cues (STT or subtitles) → practice lines. The order matters: join utterances into
 * sentences → cut what is too long or changes speaker → glue leftover scraps → widen the edges.
 * Packing before joining sentences would cut mid-sentence ("Mom, Just five" / "more minutes.").
 */
export function buildPracticeLines(cues: { start: number; end: number; text: string; words?: CueWord[] }[]): VideoSegment[] {
  const sentences = mergeIntoSentences(cues).map((c, i) => ({
    i,
    start: c.start,
    end: c.end,
    text: c.text,
    words: c.words?.length ? c.words : null,
  }));
  const lines = packSegments(splitLongSegments(sentences), PRACTICE_PACK).filter((s) => s.text.trim());
  return easeSegmentEdges(lines).map((s, i) => ({ ...s, i }));
}

// ── KARAOKE: word timings ───────────────────────────────────────────────────
// STT returns a span per recognised word, but the practice text is CLEANED afterwards
// (punctuation, mis-hearings repaired, fillers dropped), so the two word lists rarely line up
// one-to-one. Alignment therefore happens at render time, not at build time: raw recognised words
// stay in the segment where they can be re-aligned or inspected later.

/** Span of one text word, in seconds relative to the START of its segment. */
export interface WordTime {
  s: number;
  e: number;
}

/** Bare lowercase form of a word, for matching recognised text against cleaned text. */
const bareWord = (w: string): string => stripPunct(normalize(w));

/**
 * Assigns a time span to every word of `text` from the recognised `words`.
 *
 * Walks both lists together, matching bare forms and allowing a small look-ahead so a dropped
 * filler ("uh") or a repaired mis-hearing does not throw the rest of the line out of sync. Words
 * left unmatched are interpolated between their matched neighbours, so the highlight keeps moving
 * instead of freezing. Times come back RELATIVE to `start` (the caller knows the media clock).
 *
 * Returns null when there is nothing to align — the caller then simply renders no highlight.
 */
export function alignWordTimes(
  text: string,
  words: CueWord[] | null | undefined,
  start: number,
  end: number,
): WordTime[] | null {
  const target = splitWords(text);
  if (!target.length || !words?.length) return null;

  const LOOKAHEAD = 3;
  const hit: (WordTime | null)[] = target.map(() => null);
  let w = 0;
  for (let t = 0; t < target.length && w < words.length; t++) {
    const want = bareWord(target[t]);
    if (!want) continue;
    for (let k = w; k < Math.min(words.length, w + 1 + LOOKAHEAD); k++) {
      if (bareWord(words[k].w) !== want) continue;
      hit[t] = { s: words[k].s - start, e: words[k].e - start };
      w = k + 1;
      break;
    }
  }

  // Interpolate the gaps: split the span between the surrounding anchors evenly.
  const span = Math.max(0.2, end - start);
  const out: WordTime[] = [];
  for (let t = 0; t < target.length; t++) {
    if (hit[t]) {
      out.push(hit[t]!);
      continue;
    }
    let prev = t - 1;
    while (prev >= 0 && !hit[prev]) prev--;
    let next = t + 1;
    while (next < target.length && !hit[next]) next++;
    const from = prev >= 0 ? hit[prev]!.e : 0;
    const to = next < target.length ? hit[next]!.s : span;
    const slots = next - prev - 1; // untimed words between the two anchors
    const step = (to - from) / Math.max(1, slots);
    const at = t - prev - 1;
    out.push({ s: from + step * at, e: from + step * (at + 1) });
  }
  return out;
}

/**
 * Hands each segment the recognised words that fall inside its span. Used after cues have been
 * merged, packed or regrouped by AI: boundaries move, so words are matched by TIME rather than
 * carried through every transform. A word belongs to the segment its midpoint lands in.
 */
export function attachWordTimings(segs: VideoSegment[], words: CueWord[]): VideoSegment[] {
  if (!words.length) return segs;
  const sorted = [...words].sort((a, b) => a.s - b.s);
  return segs.map((seg) => {
    const mine = sorted.filter((x) => {
      const mid = (x.s + x.e) / 2;
      return mid >= seg.start && mid <= seg.end;
    });
    return mine.length ? { ...seg, words: mine } : seg;
  });
}

/** Every recognised word carried by a list of cues, in order. */
export const cueWords = (cues: { words?: CueWord[] }[]): CueWord[] => cues.flatMap((c) => c.words ?? []);

/**
 * Đoạn gửi client theo chế độ. Đây là bài LUYỆN THÂN THIỆN (không phải quiz chấm điểm):
 *  • shadowing → giữ nguyên text (đọc theo).
 *  • dictation → gửi ĐÁP ÁN đầy đủ (`text`) + `blanks` để client tô/nhảy ô TỨC THÌ như demo.
 *    `blanks` rỗng = chế độ VIẾT CẢ CÂU (client coi mọi từ là ô trống). Server vẫn chấm lại để ghi tiến độ.
 * (CỐ Ý khác nguyên tắc "đáp án không rời server" của quiz — đổi lấy trải nghiệm luyện tức thì.)
 */
export function publicSegment(seg: VideoSegment, mode: VideoMode): PublicVideoSegment {
  const base: PublicVideoSegment = { i: seg.i, start: seg.start, end: seg.end, vi: seg.vi ?? null, ipa: seg.ipa ?? null };
  if (mode === "shadowing") return { ...base, text: seg.text, words: seg.words ?? null };
  const words = splitWords(seg.text);
  const blanks = (seg.blanks || []).filter((n) => n >= 0 && n < words.length);
  return { ...base, text: seg.text, blanks, word_count: words.length, alts: seg.alts ?? null };
}

/** Bỏ dấu câu 2 đầu + chuẩn hoá để so 1 từ (dùng cho điền từ). */
function normWord(w: string): string {
  return stripPunct(normalize(w));
}

export interface DictationAnswer {
  segment: number;
  sentence?: string | null; // chế độ viết cả câu
  blanks?: string[] | null; // chế độ điền từ — theo thứ tự seg.blanks
}

/** Chấm 1 đoạn nghe-viết (server-side, authoritative). */
export function gradeDictation(seg: VideoSegment, ans: DictationAnswer) {
  const words = splitWords(seg.text);
  const blanks = (seg.blanks || []).filter((n) => n >= 0 && n < words.length);
  if (!blanks.length) {
    // viết cả câu: so toàn câu (bỏ dấu câu, không phân biệt hoa thường)
    const ok = normWord(ans.sentence || "") === normWord(seg.text);
    return { segment: seg.i, correct: ok, expected: seg.text, per_blank: null as null };
  }
  const given = ans.blanks || [];
  const per_blank = blanks.map((idx, k) => {
    const expected = words[idx];
    const ok = normWord(given[k] || "") === normWord(expected);
    return { index: idx, ok, expected };
  });
  return {
    segment: seg.i,
    correct: per_blank.every((b) => b.ok),
    expected: seg.text,
    per_blank,
  };
}

/** Bỏ dấu câu 2 đầu để lấy phần "lõi" 1 từ (cho hint/skeleton) — giữ chữ, bỏ .,!?; hai đầu. */
function coreWord(w: string): string {
  return w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
}

/**
 * Check tức thì 1 đoạn — CHỈ trả đúng/sai (per-blank), KHÔNG lộ đáp án (để user tự sửa & thử lại).
 * `reveal=true` (khi user bỏ cuộc) mới trả `expected`.
 */
export function checkDictation(seg: VideoSegment, ans: DictationAnswer, reveal = false) {
  const g = gradeDictation(seg, ans);
  return {
    segment: seg.i,
    correct: g.correct,
    per_blank: g.per_blank ? g.per_blank.map((b) => ({ index: b.index, ok: b.ok })) : null,
    expected: reveal || g.correct ? seg.text : null, // lộ khi đã đúng hoặc user xin đáp án
  };
}

/** Chỉ số TỪ cần điền của 1 đoạn (blank = từ khoét; không blank = mọi từ, chế độ viết cả câu). */
export function dictationTargets(seg: VideoSegment): number[] {
  const words = splitWords(seg.text);
  const blanks = (seg.blanks || []).filter((n) => n >= 0 && n < words.length);
  return blanks.length ? blanks : words.map((_, i) => i);
}

/**
 * Escalating hint: `level` leading characters of each target word plus its length, so a client can
 * draw a skeleton ("Hel___"). With `word`, only that target word is returned.
 */
export function dictationHint(seg: VideoSegment, level: number, word?: number) {
  const words = splitWords(seg.text);
  const targets = dictationTargets(seg);
  const n = Math.max(1, level);
  const asked = word == null ? targets : targets.filter((idx) => idx === word);
  return asked.map((idx) => {
    const core = coreWord(words[idx]);
    return { index: idx, prefix: core.slice(0, n), len: core.length };
  });
}

/** One word's hint state: `n` = levels paid for (price), `upTo` = leading letters shown (display). */
export interface WordHint {
  n: number;
  upTo: number;
}

/**
 * The next hint on one word: one press opens ONE letter — the first one the learner has not got right
 * yet — and costs one level. Letters already typed correctly are never charged for. Returns null once
 * the word is fully open or `max` levels were used.
 */
export function nextWordHint(word: string, typed: string, prev: WordHint | undefined, max: number): WordHint | null {
  const answer = word ?? "";
  if (!answer) return null;
  const was = prev ?? { n: 0, upTo: 0 };
  if (was.n >= max) return null;
  const got = typed ?? "";
  let firstBad = 0;
  while (
    firstBad < got.length &&
    firstBad < answer.length &&
    got[firstBad].toLowerCase() === answer[firstBad].toLowerCase()
  ) {
    firstBad++;
  }
  const upTo = Math.min(answer.length, Math.max(was.upTo + 1, firstBad + 1));
  if (upTo <= was.upTo) return null;
  return { n: was.n + 1, upTo };
}
