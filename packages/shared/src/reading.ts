// ============================================================
//  Read-aloud display helpers. Scores are Azure Pronunciation Assessment's own numbers — no
//  re-weighting on top (see assess.ts for how a continuous take is merged).
// ============================================================
import type { ReadingWordResult } from "./types";

// Azure returns NARROW IPA with glyphs learners mistake for font errors: ɹ/ɻ → r, ɡ → g, ɫ → l,
// ɚ/ɝ → ər/ɜr, ʧ/ʤ → tʃ/dʒ, ᵻ → ɪ. Folded glyph by glyph because compound sounds (ɛɹ, aɪ…) exist.
const PHONEME_GLYPH: Record<string, string> = {
  "ɹ": "r", "ɻ": "r", "ɡ": "g", "ɫ": "l", "ɚ": "ər", "ɝ": "ɜr", "ʧ": "tʃ", "ʤ": "dʒ", "ᵻ": "ɪ",
};
/** One Azure phoneme symbol → its dictionary form. */
export const foldPhoneme = (p: string): string =>
  Array.from(p).map((ch) => PHONEME_GLYPH[ch] ?? ch).join("");

/** One-word verdict on a measured reading pace (words per minute), for the learner. */
export type PaceVerdict = {
  label: string;
  /** Which way to move: faster, slower, or neither. */
  move: "up" | "down" | "ok";
  /** Nothing to fix. A choppy take is `move: "ok"` but NOT good. */
  good: boolean;
};
export function paceVerdict(wpm: number, pausePct?: number | null): PaceVerdict {
  if (wpm < 75) return { label: "chậm quá", move: "up", good: false };
  if (wpm < 105) return { label: "hơi chậm", move: "up", good: false };
  if (wpm > 185) return { label: "nhanh quá", move: "down", good: false };
  if (wpm > 165) return { label: "hơi nhanh", move: "down", good: false };
  if (pausePct != null && pausePct >= 35) return { label: "ngắt vụn", move: "ok", good: false };
  return { label: "tốt", move: "ok", good: true };
}

/** Accuracy of one word (0-100) — Azure's own score. */
export function wordAccuracy(w: ReadingWordResult): number {
  return w.accuracy;
}

/** A phoneme read weakly across the whole take — systematic, not a one-off. */
export type WeakPhoneme = {
  phoneme: string; // IPA
  avg: number; // mean score of this sound (0-100)
  count: number; // occurrences counted
};

/**
 * Phonemes whose mean score over the take is below `threshold` (default 60) and that occur at
 * least `minOccur` times (default 2). Omitted and inserted words are skipped. Weakest first.
 */
export function collectWeakPhonemes(
  words: ReadingWordResult[],
  opts?: { threshold?: number; minOccur?: number },
): WeakPhoneme[] {
  const threshold = opts?.threshold ?? 60;
  const minOccur = opts?.minOccur ?? 2;
  const bucket = new Map<string, { sum: number; count: number }>();
  for (const w of words) {
    if (w.errorType === "Omission" || w.errorType === "Insertion") continue;
    for (const p of w.phonemes ?? []) {
      const key = foldPhoneme(p.phoneme);
      const b = bucket.get(key) ?? { sum: 0, count: 0 };
      b.sum += p.accuracy;
      b.count += 1;
      bucket.set(key, b);
    }
  }
  const out: WeakPhoneme[] = [];
  for (const [phoneme, b] of bucket) {
    const avg = b.sum / b.count;
    if (b.count >= minOccur && avg < threshold) out.push({ phoneme, avg: Math.round(avg), count: b.count });
  }
  return out.sort((a, b) => a.avg - b.avg);
}
