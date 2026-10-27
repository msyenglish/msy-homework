// ============================================================
//  SRS — spaced repetition memory model for vocabulary (FSRS-5, default weights).
//  Pure functions, no I/O: the API writes the state, the web only renders it.
//  ONE memory state per WORD (not per activity type)
// ============================================================
import type { VocabActivity, VocabDeckProgress, VocabResultWord } from "./types";

/**
 * FSRS-5 default parameters (community-trained on ~700M reviews). We do NOT train per user:
 * that needs tens of thousands of reviews per learner. Tuning = replace this array.
 */
export const FSRS_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81; // = 0.9^(1/DECAY) − 1, so R(S, S) = 0.9

/**
 * Desired retention — probability of recall at the moment a word comes due.
 * 0.90 is the FSRS default and the language-learning sweet spot: below ~0.85 words are
 * re-learnt too often to consolidate, above ~0.95 the review load grows exponentially for
 * very little extra knowledge. Our learners do 10-15 minutes a day, so we stay at the default.
 */
export const DESIRED_RETENTION = 0.9;

/** Stability (days) at which a word is considered `secure` on the knowledge ladder. */
export const SECURE_STABILITY_DAYS = 21;

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 365 * 3;

export type SrsRating = 1 | 2 | 3 | 4; // 1 Again · 2 Hard · 3 Good · 4 Easy

export interface MemoryState {
  stability: number; // S — days until recall probability drops to DESIRED_RETENTION
  difficulty: number; // D — 1..10
  reps: number; // graded reviews so far
  lapses: number; // times FORGOTTEN (wrong after having been right) — never reset
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Probability of recalling a word right now, given its stability and days since last review. */
export function retrievability(stability: number, elapsedDays: number): number {
  const s = Math.max(stability, 0.01);
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / s, DECAY);
}

/** Days to wait so that recall probability lands on `retention`. */
export function intervalFromStability(stability: number, retention = DESIRED_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(raw)));
}

const initialStability = (g: SrsRating) => Math.max(0.1, FSRS_W[g - 1]);
const initialDifficulty = (g: SrsRating) => clampD(FSRS_W[4] - Math.exp(FSRS_W[5] * (g - 1)) + 1);

/** D after a review: linear damping toward 10 + mean reversion toward the "Easy" baseline. */
function nextDifficulty(d: number, g: SrsRating): number {
  const delta = -FSRS_W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9;
  return clampD(FSRS_W[7] * initialDifficulty(4) + (1 - FSRS_W[7]) * damped);
}

/** S after a SUCCESSFUL review — grows most when the word was nearly forgotten (low R). */
function stabilityOnRecall(s: number, d: number, r: number, g: SrsRating): number {
  const hard = g === 2 ? FSRS_W[15] : 1;
  const easy = g === 4 ? FSRS_W[16] : 1;
  const inc =
    1 +
    Math.exp(FSRS_W[8]) *
      (11 - d) *
      Math.pow(s, -FSRS_W[9]) *
      (Math.exp(FSRS_W[10] * (1 - r)) - 1) *
      hard *
      easy;
  return Math.max(0.1, s * Math.max(1, inc));
}

/** S after a LAPSE — never above the old stability (forgetting cannot strengthen memory). */
function stabilityOnLapse(s: number, d: number, r: number): number {
  const next =
    FSRS_W[11] * Math.pow(d, -FSRS_W[12]) * (Math.pow(s + 1, FSRS_W[13]) - 1) * Math.exp(FSRS_W[14] * (1 - r));
  return Math.max(0.1, Math.min(s, next));
}

export interface SrsResult {
  state: MemoryState;
  interval: number; // days until next review
  retrievabilityBefore: number; // recall probability at the moment of this review (1 for new words)
}

/**
 * Schedule a word after one graded review.
 * `prev` null = first time; `elapsedDays` = days since the last review of THIS word.
 */
export function schedule(prev: MemoryState | null, rating: SrsRating, elapsedDays: number): SrsResult {
  if (!prev || prev.reps <= 0) {
    const state: MemoryState = {
      stability: initialStability(rating),
      difficulty: initialDifficulty(rating),
      reps: 1,
      lapses: rating === 1 ? 1 : 0,
    };
    return { state, interval: intervalFromStability(state.stability), retrievabilityBefore: 1 };
  }
  const r = retrievability(prev.stability, elapsedDays);
  const difficulty = nextDifficulty(prev.difficulty, rating);
  const stability =
    rating === 1 ? stabilityOnLapse(prev.stability, difficulty, r) : stabilityOnRecall(prev.stability, difficulty, r, rating);
  const state: MemoryState = {
    stability,
    difficulty,
    reps: prev.reps + 1,
    lapses: prev.lapses + (rating === 1 ? 1 : 0),
  };
  return { state, interval: intervalFromStability(stability), retrievabilityBefore: r };
}

// ============================================================
//  Mapping OUR activity types onto the 1..4 rating scale.
// ============================================================

/** Answering a multiple-choice / matching card proves RECOGNITION only. */
export const VOCAB_RECEPTIVE: VocabActivity[] = ["matching", "listen_choice", "paraphrase"];
/** Writing / typing / spelling the word proves RECALL (productive knowledge). */
export const VOCAB_PRODUCTIVE: VocabActivity[] = ["recall", "spelling", "dictation"];

/**
 * Is this activity a TEST? `flashcard` is a self-rating and `pronounce` lives on its own score
 * axis, so neither counts as a right/wrong attempt — they must stay out of the session score and
 * out of `correct`/`total`, which feed the review scheduler.
 */
export function vocabActivityGraded(a: VocabActivity): boolean {
  return VOCAB_RECEPTIVE.includes(a) || VOCAB_PRODUCTIVE.includes(a);
}

/**
 * Score (0-100) of one vocab-deck session — the single rule the deck engine shows and the API stores.
 *
 * Share of CORRECT graded answers. Graded cards still open at submit count as wrong answers, so
 * stopping after 2 of 15 words cannot score 100%. A deck with no graded activity at all (flashcards
 * / pronunciation only) scores by completion: share of its cards the learner went through.
 * Per-word counts are re-derived from `attempts` when present rather than trusted as sent.
 */
export function vocabSessionScore(
  perWord: Pick<VocabResultWord, "correct" | "total" | "attempts">[],
  progress?: Partial<VocabDeckProgress> | null,
): { score: number; right: number; answers: number } {
  let right = 0;
  let answers = 0;
  for (const w of perWord) {
    if (Array.isArray(w.attempts)) {
      for (const a of w.attempts) {
        if (!vocabActivityGraded(a.activity)) continue;
        answers++;
        if (a.correct) right++;
      }
    } else {
      const total = Math.max(0, Math.round(Number(w.total) || 0));
      answers += total;
      right += Math.min(total, Math.max(0, Math.round(Number(w.correct) || 0)));
    }
  }
  const nonNeg = (n: unknown) => Math.max(0, Math.round(Number(n) || 0));
  const unanswered = nonNeg(progress?.unanswered);
  if (answers + unanswered > 0) {
    return { score: Math.round((right / (answers + unanswered)) * 100), right, answers: answers + unanswered };
  }
  const cards = nonNeg(progress?.cards);
  const open = Math.min(cards, nonNeg(progress?.open));
  return { score: cards ? Math.round(((cards - open) / cards) * 100) : 0, right: 0, answers: 0 };
}

/** 0 = not graded (flashcard / pronounce only) · 1 = receptive · 2 = productive. */
export function vocabDepth(seen: VocabActivity[] | undefined): 0 | 1 | 2 {
  if (!Array.isArray(seen)) return 0;
  if (seen.some((a) => VOCAB_PRODUCTIVE.includes(a))) return 2;
  if (seen.some((a) => VOCAB_RECEPTIVE.includes(a))) return 1;
  return 0;
}

/**
 * Rating for one word in a session. Null = nothing to schedule (flashcard-only: self-rated
 * "Got it" is a re-encounter, not a test). Pronunciation stays on its own axis (`pronBest`).
 */
export function ratingFromWord(w: VocabResultWord): SrsRating | null {
  const depth = vocabDepth(w.seen);
  if (!depth || !w.total || w.total <= 0) return null;
  if (w.correct <= 0) return 1;
  if (w.correct < w.total) return 2; // sai rồi sửa được → Hard
  // "Easy" phải hiếm, không thì khoảng cách ôn phóng lên hàng năm sau vài buổi: chỉ cho khi từ
  // được tái tạo đúng ở ÍT NHẤT HAI dạng khác nhau trong cùng buổi (viết + nghe-chép chẳng hạn).
  const productive = (w.seen ?? []).filter((a) => VOCAB_PRODUCTIVE.includes(a)).length;
  return depth === 2 && productive >= 2 ? 4 : 3;
}

// ============================================================
//  Knowledge ladder — cumulative achievement, NEVER drops.
//  The review queue is dynamic instead: a `secure` word still shows up in "due today".
// ============================================================

export const VOCAB_TIERS = ["new", "seen", "recognised", "recalled", "secure"] as const;
export type VocabTier = 0 | 1 | 2 | 3 | 4;

export const VOCAB_TIER_LABEL: Record<VocabTier, string> = {
  0: "Chưa gặp",
  1: "Đã gặp",
  2: "Nhận ra",
  3: "Nhớ ra",
  4: "Nhớ chắc",
};

/** English tier labels — the public user pages are in English. */
export const VOCAB_TIER_LABEL_EN: Record<VocabTier, string> = {
  0: "Not seen",
  1: "Seen",
  2: "Recognised",
  3: "Recalled",
  4: "Secure",
};

/** New tier after a review — monotonic, so achievement is never taken back. */
export function nextTier(prev: VocabTier, rating: SrsRating | null, depth: 0 | 1 | 2, stability: number): VocabTier {
  let tier: VocabTier = (Math.max(prev, 1) as VocabTier);
  if (rating != null && rating >= 3) tier = Math.max(tier, depth === 2 ? 3 : 2) as VocabTier;
  if (tier >= 3 && rating != null && rating >= 3 && stability >= SECURE_STABILITY_DAYS) tier = 4;
  return tier;
}
