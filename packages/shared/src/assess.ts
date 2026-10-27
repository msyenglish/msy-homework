// ============================================================
//  Azure Pronunciation Assessment results → the app's AssessResult.
//   - mapAzureResult: one recognition result (REST, or one SDK segment).
//   - mergeContinuousAssessment: a long take scored by the browser SDK in continuous mode, which
//     returns one result per utterance. Scores are averaged by word count; the words are aligned
//     to the passage so skipped words show up as Omission (continuous mode has no miscue detection).
//  The server recomputes from the raw segments, so a browser cannot post its own totals.
// ============================================================
import type { ReadingWordResult } from "./types";

export type AssessResult = {
  pronScore: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  transcript: string;
  words: ReadingWordResult[];
  durationMs: number;
};

type ErrorType = ReadingWordResult["errorType"];
interface AzureScores {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  PronScore?: number;
  ProsodyScore?: number;
}
export interface AzureWord {
  Word: string;
  Offset?: number;
  Duration?: number;
  AccuracyScore?: number;
  ErrorType?: ErrorType;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: ErrorType };
  Phonemes?: { Phoneme: string; AccuracyScore?: number; PronunciationAssessment?: { AccuracyScore?: number } }[];
}
export interface AzureNBest extends AzureScores {
  Display?: string;
  PronunciationAssessment?: AzureScores;
  Words?: AzureWord[];
}
/** One recognition result as Azure returns it (REST body, or SDK SpeechServiceResponse_JsonResult). */
export interface AzureSegment {
  Duration?: number; // ticks (100 ns)
  Offset?: number;
  DisplayText?: string;
  NBest?: AzureNBest[];
}

const round = (n: number) => Math.round(n);
const ms = (ticks?: number) => (ticks == null ? null : round(ticks / 10_000));

function mapWord(w: AzureWord): ReadingWordResult {
  const errorType = w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? "None";
  const omitted = errorType === "Omission";
  return {
    word: w.Word,
    accuracy: round(w.PronunciationAssessment?.AccuracyScore ?? w.AccuracyScore ?? 0),
    errorType,
    phonemes: (w.Phonemes ?? []).map((p) => ({
      phoneme: p.Phoneme,
      accuracy: round(p.PronunciationAssessment?.AccuracyScore ?? p.AccuracyScore ?? 0),
    })),
    offsetMs: omitted ? null : ms(w.Offset),
    durationMs: omitted ? null : ms(w.Duration),
  };
}

/** One Azure result → AssessResult, scores untouched. */
export function mapAzureResult(nb: AzureNBest | undefined, durationTicks = 0): AssessResult {
  const pa = nb?.PronunciationAssessment ?? nb ?? {};
  return {
    pronScore: round(pa.PronScore ?? 0),
    accuracy: round(pa.AccuracyScore ?? 0),
    fluency: round(pa.FluencyScore ?? 0),
    completeness: round(pa.CompletenessScore ?? 0),
    prosody: pa.ProsodyScore == null ? null : round(pa.ProsodyScore),
    transcript: nb?.Display ?? "",
    words: (nb?.Words ?? []).map(mapWord),
    durationMs: round(durationTicks / 10_000),
  };
}

const norm = (w: string) => (w.toLowerCase().match(/[a-z0-9']+/g) ?? []).join("");

/** Passage → [display, normalised] tokens in order (bare punctuation dropped). */
function refTokens(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const raw of text.split(/\s+/)) {
    const n = norm(raw);
    if (n) out.push([raw.replace(/^[\s,.!?;:"'()[\]{}…“”‘’—–]+|[\s,.!?;:"'()[\]{}…“”‘’—–]+$/g, ""), n]);
  }
  return out;
}

/** Longest-common-subsequence alignment of passage tokens with heard words. */
function alignToReference(heard: ReadingWordResult[], reference: string): { words: ReadingWordResult[]; matched: number; total: number } {
  const ref = refTokens(reference);
  const hyp = heard.filter((w) => w.errorType !== "Omission");
  const a = ref.map((r) => r[1]);
  const b = hyp.map((w) => norm(w.word));
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const words: ReadingWordResult[] = [];
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      words.push({ ...hyp[j], word: ref[i][0] });
      matched++;
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      words.push({ ...hyp[j], errorType: "Insertion" });
      j++;
    } else {
      words.push({ word: ref[i][0], accuracy: 0, errorType: "Omission", phonemes: [], offsetMs: null, durationMs: null });
      i++;
    }
  }
  return { words, matched, total: n };
}

/**
 * Merges the per-utterance results of a continuous take into one AssessResult.
 * accuracy / fluency / prosody / pronScore = Azure's segment scores averaged by word count;
 * completeness = passage words actually read; pronScore is scaled by that completeness so stopping
 * halfway cannot score like a full reading.
 */
export function mergeContinuousAssessment(segments: AzureSegment[], referenceText: string, durationMs = 0): AssessResult {
  const scored = segments
    .map((s) => ({ seg: s, nb: s.NBest?.[0] }))
    .filter((x): x is { seg: AzureSegment; nb: AzureNBest } => !!x.nb);
  if (!scored.length) {
    return { pronScore: 0, accuracy: 0, fluency: 0, completeness: 0, prosody: null, transcript: "", words: [], durationMs };
  }
  let wSum = 0;
  let acc = 0;
  let flu = 0;
  let pron = 0;
  let prosW = 0;
  let pros = 0;
  const heard: ReadingWordResult[] = [];
  const transcript: string[] = [];
  for (const { seg, nb } of scored) {
    const pa = nb.PronunciationAssessment ?? nb;
    const weight = Math.max(1, nb.Words?.length ?? 0);
    wSum += weight;
    acc += weight * (pa.AccuracyScore ?? 0);
    flu += weight * (pa.FluencyScore ?? 0);
    pron += weight * (pa.PronScore ?? 0);
    if (pa.ProsodyScore != null) {
      prosW += weight;
      pros += weight * pa.ProsodyScore;
    }
    heard.push(...(nb.Words ?? []).map(mapWord));
    transcript.push(nb.Display ?? seg.DisplayText ?? "");
  }
  const aligned = referenceText.trim() ? alignToReference(heard, referenceText) : { words: heard, matched: heard.length, total: heard.length };
  const completeness = aligned.total ? (100 * aligned.matched) / aligned.total : 0;
  const last = scored[scored.length - 1].seg;
  const spanMs = last.Offset != null && last.Duration != null ? round((last.Offset + last.Duration) / 10_000) : 0;
  return {
    pronScore: round((pron / wSum) * Math.min(1, completeness / 100)),
    accuracy: round(acc / wSum),
    fluency: round(flu / wSum),
    completeness: round(completeness),
    prosody: prosW ? round(pros / prosW) : null,
    transcript: transcript.filter(Boolean).join(" ").trim(),
    words: aligned.words,
    durationMs: durationMs || spanMs,
  };
}

/** Reading pace from word timings: words per minute over the spoken span + share of it silent. */
export function readingPace(words: ReadingWordResult[]): { wpm: number; pausePct: number } | null {
  const timed = words.filter((w) => w.errorType !== "Omission" && w.offsetMs != null && w.durationMs != null);
  if (timed.length < 3) return null;
  const start = timed[0].offsetMs!;
  const end = timed[timed.length - 1].offsetMs! + timed[timed.length - 1].durationMs!;
  const span = end - start;
  if (span < 500) return null;
  const voiced = timed.reduce((s, w) => s + w.durationMs!, 0);
  return { wpm: round((timed.length * 60_000) / span), pausePct: round(Math.max(0, 100 * (1 - voiced / span))) };
}
