// Per-phoneme reading scores (`words`, ~14KB/row) live in R2, not D1
// This module is the ONLY place that reads/writes them; nowhere else should touch the R2 key or the
// D1 `words` column directly.
//
// Compatibility: legacy rows still carry `words` inline in D1. loadReadingWords() serves those from
// D1 and everything newer from R2, so no data backfill is required for correctness.
import { wordAccuracy, type ReadingErrorWord, type ReadingWordResult } from "@msyen/shared";
import { readingAssessKey } from "./files";
import type { Bindings } from "./env";

/** Compact the mispronounced words for D1 (weak-word stats + AI-feedback regen never need phonemes). */
export function errorWordsOf(words: ReadingWordResult[]): ReadingErrorWord[] {
  return words
    .filter((w) => w.errorType !== "None")
    .map((w) => ({ word: w.word, errorType: w.errorType, accuracy: Math.round(wordAccuracy(w)) }));
}

/** The mispronounced words of a submission, from D1 `errorWords`, falling back to legacy inline `words`. */
export function subErrorWords(sub: {
  errorWords: ReadingErrorWord[] | null;
  words: ReadingWordResult[];
}): ReadingErrorWord[] {
  return sub.errorWords ?? errorWordsOf(sub.words ?? []);
}

/** Push full phoneme scores to R2. Call AFTER insert so the key can key off the submission id. */
export async function storeReadingWords(
  env: Bindings,
  submissionId: string,
  words: ReadingWordResult[],
): Promise<void> {
  await env.AUDIO.put(readingAssessKey(submissionId), JSON.stringify(words), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** Full phoneme scores for display: legacy inline `words` if present, else the R2 blob (empty on miss). */
export async function loadReadingWords(
  env: Bindings,
  sub: { id: string; words: ReadingWordResult[] },
): Promise<ReadingWordResult[]> {
  if (sub.words?.length) return sub.words; // legacy row — still inline in D1
  const obj = await env.AUDIO.get(readingAssessKey(sub.id));
  if (!obj) return [];
  try {
    return (await obj.json()) as ReadingWordResult[];
  } catch {
    return [];
  }
}
