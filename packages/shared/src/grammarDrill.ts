// ============================================================
//  GRAMMAR DRILL — practice sessions over a bank of sentences, one memory state per
//  GRAMMAR POINT (not per sentence). Pure logic, shared by web + api.
//  The API is the source of truth; the web only renders what it returns.
// ============================================================
import type { PublicQuestion, QuestionType } from "./types";
import type { SrsRating } from "./srs";

/** How many grammar points one session may span. Below ~3 items/point FSRS input is noise. */
export const MAX_SESSION_POINTS = 5;
/** Minimum items a point must receive in a session before its memory state is rescheduled. */
export const MIN_ITEMS_FOR_SCHEDULE = 3;
/** Item count presets offered in the setup modal. */
export const DRILL_COUNTS = [10, 20, 30, 40] as const;
export const DEFAULT_DRILL_COUNT = 20;
/** Days an item stays out of the pool after being served. */
export const ITEM_COOLDOWN_DAYS = 7;

/** Difficulty band inside a single grammar point. */
export type DrillTier = 1 | 2 | 3;
export const DRILL_TIER_LABEL: Record<DrillTier, string> = {
  1: "Nhận biết",
  2: "Vận dụng",
  3: "Vận dụng cao",
};

/** Which activity types a grammar point can be drilled with. Reuses the exercise question types. */
export const DEFAULT_DRILL_TYPES: QuestionType[] = ["multiple_choice", "fill_blank"];

/**
 * There is no learner-facing mode picker. Asking a beginner to choose between "review" and
 * "often wrong" pushes a scheduling decision onto the person least able to make it, and the
 * memory model already knows the answer. The server mixes each session itself — see
 * `pickSessionItems`: items the learner got wrong first, then unseen ones for coverage, then
 * whatever is due, round-robin across the chosen points with a cooldown so nothing repeats soon.
 */
export const DRILL_MODE = "auto";

/** One bank sentence as sent to the learner — answers already stripped by the API. */
export interface GrammarDrillItem {
  id: string;
  grammar_id: string;
  grammar_title: string;
  cefr: string;
  tier: DrillTier;
  question: PublicQuestion;
}

export interface GrammarSessionConfig {
  grammar_ids: string[];
  count: number;
  types?: QuestionType[] | null;
}

/** One answered item on the way back to the server. */
export interface GrammarDrillAnswer {
  item_id: string;
  /** Raw answer string, same encoding the quiz grader expects (JSON map for matching/categorize). */
  answer: string;
  /** True when the learner only got it right after seeing it again inside THIS session. */
  retried?: boolean;
}

/** Per-item verdict returned after grading. */
export interface GrammarDrillVerdict {
  item_id: string;
  grammar_id: string;
  credit: number; // 0..1
  correct: boolean;
  first_clear: boolean; // earned the one-time clear reward
  points: number;
  correct_answer: string;
  explain: string | null;
}

/** Per-point memory movement in a session. */
export interface GrammarPointResult {
  grammar_id: string;
  title: string;
  seen: number;
  correct: number;
  prev_tier: GrammarTier;
  tier: GrammarTier;
  was_due: boolean;
  /** Null when the point got fewer than MIN_ITEMS_FOR_SCHEDULE items (not rescheduled). */
  due_at: string | null;
  points: number;
}

export interface GrammarSessionResult {
  id: string;
  correct: number;
  total: number;
  score: number; // percentage
  points: number;
  verdicts: GrammarDrillVerdict[];
  points_state: GrammarPointResult[];
}

// ── Translation mode (Vietnamese -> English). Separate table, separate session; the memory state
// it moves is the SAME per-point FSRS row. ──

export const TRANSLATE_MODE = "translate";

/** Lower than DRILL_COUNTS: every sentence here is typed out in full, so 20 is already a long sit. */
export const TRANSLATE_COUNTS = [5, 10, 15, 20] as const;
export const DEFAULT_TRANSLATE_COUNT = 10;

/**
 * How much scaffolding the prompt carries. Same ladder shape as dictation, but here each rung takes
 * support AWAY rather than adding blanks:
 *
 *   easy     full lemma bank — vocabulary given, learner supplies inflection and word order
 *   medium   content words only — function words (articles, prepositions, pronouns) removed
 *   hard     no bank, first letter of each word instead
 *   hardest  the Vietnamese sentence and nothing else
 *
 * Grading gets STRICTER as support drops, not looser: `accept` was authored assuming the bank pins
 * the lexical choice, so a learner on `hardest` who writes a fair synonym can still be marked wrong.
 *
 */
export const TRANSLATE_LEVELS = ["easy", "medium", "hard", "hardest"] as const;
export type TranslateLevel = (typeof TRANSLATE_LEVELS)[number];
export const DEFAULT_TRANSLATE_LEVEL: TranslateLevel = "easy";

/** One translation prompt as sent to the learner: the English answer never leaves the server. */
export interface GrammarTranslateItem {
  id: string;
  grammar_id: string;
  grammar_title: string;
  cefr: string;
  tier: DrillTier;
  /** The Vietnamese sentence to render into English. */
  vi: string;
  /**
   * Lemma bank. Supplies the vocabulary while leaving inflection and word order to the learner,
   * and pins WHICH of several valid renderings is wanted.
   */
  word_bank: string[] | null;
  /**
   * First letter of each word ("M_ d__ i_ a d_____."). Derived from the answer, so it is built
   * server-side — `en` itself never leaves the server. Shipped for every rung, not just `hard`, so
   * the learner can change difficulty mid-session the way the dictation drill does. It is a hint,
   * not the answer: it gives away word count and initials, nothing more.
   */
  skeleton: string | null;
  /**
   * SHA-256 of every acceptable answer key, so the client can mark an answer correct AS IT IS TYPED
   * without holding the sentence. Includes the article-stripped keys when `article_lenient`.
   * The server still regrades on submit — this is feedback, not scoring.
   */
  hashes: string[];
  /**
   * SHA-256 of each WORD of the answer, in order, so the boxed rungs can turn a single box green
   * the moment its word is right. Same trade as `skeleton`: it confirms a word the learner already
   * typed, it does not spell one out.
   */
  word_hashes: string[];
  /**
   * The same per-word hashes keyed WITHOUT apostrophes, so a box accepts "doesnt" for "doesn't" —
   * the video dictation drill has always graded that way.
   */
  word_hashes_loose: string[];
  /** True when a difference of only a/an/the is forgiven; the client mirrors the same rule. */
  article_lenient: boolean;
}

/**
 * One typing box, parsed from `skeleton`. `lead`/`trail` are the punctuation printed either side of
 * the box; `len` is how many characters it takes; `initial` is revealed only on the `hard` rung.
 */
export interface TranslateSlot {
  lead: string;
  trail: string;
  /** Masked word body from the skeleton; apostrophes remain visible in this frame. */
  body: string;
  len: number;
  initial: string;
}

/**
 * Split a skeleton ("M_ d__ i_ a d_____.") into one slot per word. Word count and lengths come from
 * the skeleton, which the API already ships for every rung.
 */
export function translateSlots(skeleton: string | null): TranslateSlot[] {
  if (!skeleton) return [];
  return skeleton
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const m = tok.match(/^([^\p{L}\p{N}_'-]*)([\p{L}\p{N}_'-]+)([^\p{L}\p{N}_'-]*)$/u);
      if (!m) return { lead: "", trail: "", body: tok, len: tok.length, initial: "" };
      const [, lead, body, trail] = m;
      // A masked one-letter word is "_": the length is a hint, the letter is deliberately withheld.
      return { lead, trail, body, len: body.length, initial: body[0] === "_" ? "" : body[0] };
    });
}

/** What the learner is shown at a given rung. Every rung types into the same per-word boxes. */
export interface TranslateScaffold {
  /** Lemma bank, or null when the rung withholds it. */
  bank: string[] | null;
  /** Print the first letter of every word without being asked. */
  initials: boolean;
  /** Mark the sentence as it is typed. Off on `hardest`: there, Check is a deliberate act. */
  liveCheck: boolean;
}

/**
 * The ladder, one support removed per rung:
 *   easy    bank + initials + live marking
 *   medium  bank, no initials
 *   hard    nothing given, still marked as you type
 *   hardest nothing given, nothing marked until Check
 *
 * The bank is never thinned. Dropping function words from it made `medium` identical to `easy` on
 * any sentence built only from content words, which is most short ones.
 */
/**
 * Deterministic shuffle of the bank chips, seeded by the item id.
 *
 * The bank is stored in answer order, and several generated patterns list the whole sentence word by
 * word — displayed as stored, the chips spell out the answer, which is the opposite of what the drill
 * asks, since the on-screen instruction tells the learner to work out the order. Seeding on the item
 * id keeps the order stable across re-renders and retries,
 * so the chips do not jump around while the learner is typing.
 */
export function shuffleBank(bank: string[], seed: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...bank];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const j = ((h >>> 0) % (i + 1)) | 0;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function translateScaffold(level: TranslateLevel, wordBank: string[] | null): TranslateScaffold {
  const bank = wordBank?.length ? wordBank : null;
  if (level === "easy") return { bank, initials: true, liveCheck: true };
  if (level === "medium") return { bank, initials: false, liveCheck: true };
  if (level === "hard") return { bank: null, initials: false, liveCheck: true };
  return { bank: null, initials: false, liveCheck: false };
}

/**
 * How far the hint may go for a word of `len` characters. A hint that fills in every letter is not
 * a hint — level 2 alone would spell out "is" — so the reveal always stops one short.
 * Level 1 = first letter · 2 = + last · 3 = + second.
 */
export function maxHintLevel(len: number): number {
  // A one-letter word has nowhere to hide, and it is usually the article the point is teaching —
  // the skeleton already masks those on purpose.
  if (len <= 1) return 0;
  if (len <= 2) return 1;
  if (len <= 3) return 2;
  return 3;
}

export interface GrammarTranslateAnswer {
  item_id: string;
  answer: string;
  retried?: boolean;
}

/** Per-item verdict. Binary: partial credit would reward an ungrammatical word-salad overlap. */
export interface GrammarTranslateVerdict {
  item_id: string;
  grammar_id: string;
  correct: boolean;
  first_clear: boolean;
  points: number;
  /** What the learner actually wrote — empty when they skipped the sentence. */
  answer: string;
  /** The canonical English sentence, revealed only after grading. */
  correct_answer: string;
  /** Other renderings the grader also accepted, so the learner sees their version was fine. */
  also_accepted: string[];
  note: string | null;
}

export interface GrammarTranslateResult {
  id: string;
  correct: number;
  total: number;
  score: number; // percentage
  points: number;
  verdicts: GrammarTranslateVerdict[];
  points_state: GrammarPointResult[];
}

/** How many translation sentences each point has ready — drives the entry point on /u/grammar. */
export interface GrammarTranslateAvailability {
  grammar_id: string;
  title: string;
  cefr: string;
  total: number;
  cleared: number;
}

/** Mastery of one grammar point for the current learner (drives the progress bar + badges). */
export interface GrammarMastery {
  grammar_id: string;
  tier: GrammarTier;
  /** 0..100 — blends tier reached with how much of the bank is cleared. */
  mastery: number;
  cleared: number;
  bank: number;
  due: boolean;
  due_at: string | null;
  marked: boolean;
}

// ============================================================
//  Knowledge ladder for a grammar point — cumulative, never drops (same rule as vocab).
// ============================================================

export type GrammarTier = 0 | 1 | 2 | 3;

export const GRAMMAR_TIER_LABEL: Record<GrammarTier, string> = {
  0: "Chưa học",
  1: "Nhận ra",
  2: "Vững",
  3: "Nhớ chắc",
};

export const GRAMMAR_TIER_LABEL_EN: Record<GrammarTier, string> = {
  0: "Not started",
  1: "Recognised",
  2: "Solid",
  3: "Secure",
};

/** Stability (days) at which a grammar point counts as `secure`. */
export const GRAMMAR_SECURE_STABILITY_DAYS = 30;
/** Accuracy needed in a session to reach each tier. */
const TIER1_RATIO = 0.6;
const TIER2_RATIO = 0.8;
const TIER3_RATIO = 0.85;

/**
 * New tier for a grammar point after one session. Monotonic — a bad day never takes a tier back;
 * the review queue handles decay instead (a `secure` point still comes due).
 * Tier 2 additionally needs a SECOND good session (reps >= 2), so one lucky run cannot jump ahead.
 */
export function nextGrammarTier(
  prev: GrammarTier,
  ratio: number,
  opts: { reps: number; stability: number },
): GrammarTier {
  let tier = prev;
  if (ratio >= TIER1_RATIO) tier = Math.max(tier, 1) as GrammarTier;
  if (ratio >= TIER2_RATIO && opts.reps >= 2) tier = Math.max(tier, 2) as GrammarTier;
  if (tier >= 2 && ratio >= TIER3_RATIO && opts.stability >= GRAMMAR_SECURE_STABILITY_DAYS) tier = 3;
  return tier;
}

/** A perfect run only counts as "Easy" once it rests on this many items. */
export const EASY_MIN_ITEMS = 8;

/**
 * FSRS rating for one grammar point from its accuracy in a session.
 * "Easy" is deliberately hard to reach: a flawless run on 5 recognition-tier sentences would
 * otherwise push the very first review 16 days out, long past the point of forgetting.
 */
export function ratingFromRatio(ratio: number, seen: number): SrsRating {
  if (ratio < 0.4) return 1; // Again
  if (ratio < TIER2_RATIO) return 2; // Hard
  if (ratio >= 0.95 && seen >= EASY_MIN_ITEMS) return 4; // Easy
  return 3; // Good
}

/**
 * Mastery 0..100 of a grammar point: how far up the ladder, tempered by how much of the bank
 * has actually been cleared. A learner who cleared 4 of 60 sentences is not "solid" yet even
 * if those 4 went perfectly.
 */
export function grammarMastery(tier: GrammarTier, cleared: number, bank: number): number {
  const ladder = (tier / 3) * 70;
  const coverage = bank > 0 ? Math.min(1, cleared / bank) * 30 : 0;
  return Math.round(ladder + coverage);
}

// ============================================================
//  Points — only where farming is impossible.
// ============================================================

/**
 * First time an item is answered correctly. Once per item, for life. 4 (not 1) so a 20-item
 * session lands near 11 dpm, matching quiz and vocab — at 1 point per item grammar drilling
 * would pay a quarter of everything else and nobody would touch it.
 */
export const GRAMMAR_CLEAR_POINTS = 4;
/** Re-answering a cleared item correctly while its grammar point is DUE. */
export const GRAMMAR_REVIEW_POINTS = 1;
/** Reaching a new tier on a grammar point — once per tier, for life. */
export const GRAMMAR_TIER_POINTS: Record<GrammarTier, number> = { 0: 0, 1: 10, 2: 25, 3: 50 };

/**
 * Points for one answered item. `firstClear` is decided by the server (an item cleared earlier,
 * or one only fixed on a retry inside the same session, earns nothing).
 */
export function grammarItemPoints(opts: { credit: number; firstClear: boolean; wasDue: boolean }): number {
  if (opts.credit < 1) return 0;
  if (opts.firstClear) return GRAMMAR_CLEAR_POINTS;
  return opts.wasDue ? GRAMMAR_REVIEW_POINTS : 0;
}

/** Points for the tiers a grammar point crossed in this session. */
export function grammarTierPoints(prevTier: GrammarTier, newTier: GrammarTier): number {
  let pts = 0;
  for (let t = Math.max(0, prevTier) + 1; t <= newTier; t++) pts += GRAMMAR_TIER_POINTS[t as GrammarTier] ?? 0;
  return pts;
}
