// ============================================================
//  VOCABULARY MEMORY — write FSRS state after each practice session, read stats + review queue.
//  ONE state per WORD (the bank and My vocab share one schedule).
// ============================================================
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import {
  DESIRED_RETENTION,
  nextTier,
  normalizeWordForCompare,
  ratingFromWord,
  retrievability,
  schedule,
  vocabDepth,
  vocabMemoryPoints,
  type MemoryState,
  type VocabDeckResult,
  type VocabResultWord,
  type VocabTier,
} from "@msyen/shared";
import { schema, type Db } from "../db";

const DAY_MS = 24 * 3600 * 1000;
const elapsedDays = (fromIso: string | null, now: Date) =>
  fromIso ? Math.max(0, (now.getTime() - new Date(fromIso).getTime()) / DAY_MS) : 0;

/** D1 allows ~100 bind params per statement; 19 params per row -> 5 rows per batch. */
const UPSERT_CHUNK = 5;

export interface SessionMemory {
  reviewed: number; // due words actually reviewed
  recalled: number; // of those, remembered (rating >= 3)
  tiersUp: number;
  points: number;
}

/**
 * Apply one session's result to the memory state. Reads the previous state ONCE, computes
 * everything in JS, then writes in BATCHES (it used to upsert word by word: 40-80 statements
 * for a 40-word session).
 */
export async function applySessionMemory(
  db: Db,
  userId: string,
  result: VocabDeckResult,
  now: Date,
): Promise<SessionMemory> {
  const nowIso = now.toISOString();
  const out: SessionMemory = { reviewed: 0, recalled: 0, tiersUp: 0, points: 0 };

  // Dedupe by normalized key — one word met in several activity types is still ONE state.
  const byKey = new Map<string, VocabResultWord>();
  for (const w of result.perWord ?? []) {
    const key = w.word ? normalizeWordForCompare(w.word) : "";
    if (key) byKey.set(key, w);
  }
  const keys = [...byKey.keys()];
  if (!keys.length) return out;

  const prevRows: (typeof schema.userVocabProgress.$inferSelect)[] = [];
  for (let i = 0; i < keys.length; i += 90) {
    const found = await db
      .select()
      .from(schema.userVocabProgress)
      .where(and(eq(schema.userVocabProgress.userId, userId), inArray(schema.userVocabProgress.word, keys.slice(i, i + 90))));
    prevRows.push(...found);
  }
  const prevByKey = new Map(prevRows.map((r) => [r.word, r]));

  const rows = keys.map((key) => {
    const w = byKey.get(key)!;
    const prev = prevByKey.get(key);
    const prevTier = (prev?.tier ?? 0) as VocabTier;
    // Points are paid against the PEAK ever reached, not the current tier. Unmarking a word resets
    // its tier (the learner's call), and without this a mark/unmark loop would re-earn every tier.
    const peak = Math.max(prevTier, prev?.tierMax ?? 0);
    const rating = ratingFromWord(w);
    const base = {
      userId,
      word: key,
      updatedAt: nowIso,
    };

    // Words met ONLY through flashcards (self-rated "Got it") count as "seen" but never enter the
    // schedule and earn no points: self-assessment is not a test. Memory columns stay null so the
    // upsert's coalesce keeps whatever schedule already exists.
    if (rating == null) {
      const tier = Math.max(prevTier, 1) as VocabTier;
      if (tier > prevTier) out.tiersUp += 1;
      return {
        ...base,
        learned: prev?.learned ?? false,
        learnedAt: prev?.learnedAt ?? null,
        learnedSource: prev?.learnedSource ?? null,
        tierMax: Math.max(peak, tier),
        missCount: prev?.missCount ?? 0,
        lastWrongAt: prev?.lastWrongAt ?? null,
        stability: null,
        difficulty: null,
        dueAt: null,
        lastReviewAt: null,
        reps: prev?.reps ?? 0,
        lapses: prev?.lapses ?? 0,
        tier,
        lastRating: prev?.lastRating ?? null,
      };
    }

    const depth = vocabDepth(w.seen);
    const prevState: MemoryState | null =
      prev && prev.stability != null && prev.difficulty != null
        ? { stability: prev.stability, difficulty: prev.difficulty, reps: prev.reps, lapses: prev.lapses }
        : null;
    const wasDue = !!prev?.dueAt && prev.dueAt <= nowIso;
    const { state, interval } = schedule(prevState, rating, elapsedDays(prev?.lastReviewAt ?? null, now));
    const tier = nextTier(prevTier, rating, depth, state.stability);

    if (wasDue) {
      out.reviewed += 1;
      if (rating >= 3) out.recalled += 1;
    }
    if (tier > prevTier) out.tiersUp += 1;
    out.points += vocabMemoryPoints(peak, tier, { wasDue, rating });

    // "Often wrong" is a short-term signal: +1 on a miss, -1 on a hit (never reset to 0) —
    // `lapses` is the long-term history.
    const missCount = rating === 1 ? (prev?.missCount ?? 0) + 1 : Math.max(0, (prev?.missCount ?? 0) - 1);
    return {
      ...base,
      learned: tier >= 2, // "learned" (as shown in Library / My vocab) = at least recognisable
      learnedAt: prev?.learnedAt ?? (tier >= 2 ? nowIso : null),
      // Earned through a graded activity — the flag a self-declaration can never set.
      learnedSource: tier >= 2 ? "drill" : (prev?.learnedSource ?? null),
      tierMax: Math.max(peak, tier),
      missCount,
      lastWrongAt: rating === 1 ? nowIso : (prev?.lastWrongAt ?? null),
      stability: state.stability,
      difficulty: state.difficulty,
      dueAt: new Date(now.getTime() + interval * DAY_MS).toISOString(),
      lastReviewAt: nowIso,
      reps: state.reps,
      lapses: state.lapses,
      tier,
      lastRating: rating,
    };
  });

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await db
      .insert(schema.userVocabProgress)
      .values(rows.slice(i, i + UPSERT_CHUNK))
      .onConflictDoUpdate({
        target: [schema.userVocabProgress.userId, schema.userVocabProgress.word],
        set: {
          learned: sql`excluded.learned`,
          learnedAt: sql`excluded.learned_at`, // JS already carried the old timestamp over
          missCount: sql`excluded.miss_count`,
          lastWrongAt: sql`excluded.last_wrong_at`,
          // coalesce: ungraded rows (flashcard) send null -> keep the existing schedule.
          stability: sql`coalesce(excluded.stability, ${schema.userVocabProgress.stability})`,
          difficulty: sql`coalesce(excluded.difficulty, ${schema.userVocabProgress.difficulty})`,
          dueAt: sql`coalesce(excluded.due_at, ${schema.userVocabProgress.dueAt})`,
          lastReviewAt: sql`coalesce(excluded.last_review_at, ${schema.userVocabProgress.lastReviewAt})`,
          reps: sql`excluded.reps`,
          lapses: sql`excluded.lapses`,
          tier: sql`max(excluded.tier, ${schema.userVocabProgress.tier})`, // never drops mid-session
          tierMax: sql`max(excluded.tier_max, ${schema.userVocabProgress.tierMax})`,
          learnedSource: sql`excluded.learned_source`,
          lastRating: sql`coalesce(excluded.last_rating, ${schema.userVocabProgress.lastRating})`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
  return out;
}

/**
 * Queue summary for the badge + how many new words to take on today. The new-word cap is ADVICE,
 * not a block: a learner who opens a set on purpose should be able to study it.
 */
export async function dueSummary(db: Db, userId: string, now: Date): Promise<{ due: number; new_today: number; new_allowed: number }> {
  const nowIso = now.toISOString();
  const [row] = await db
    .select({
      due: sql<number>`sum(case when ${schema.userVocabProgress.dueAt} is not null and ${schema.userVocabProgress.dueAt} <= ${nowIso} then 1 else 0 end)`,
      newToday: sql<number>`sum(case when ${schema.userVocabProgress.reps} <= 1 and substr(${schema.userVocabProgress.lastReviewAt}, 1, 10) = ${nowIso.slice(0, 10)} then 1 else 0 end)`,
    })
    .from(schema.userVocabProgress)
    .where(eq(schema.userVocabProgress.userId, userId));
  const due = row?.due ?? 0;
  const newToday = row?.newToday ?? 0;
  return {
    due,
    new_today: newToday,
    new_allowed: due > QUEUE_OVERLOAD ? 0 : Math.max(0, NEW_PER_DAY - newToday),
  };
}

/** A best score below this still needs work — same line the card colours amber/red at. */
export const PRON_WEAK = 80;
/** Ceiling on the weak list sent to the client. */
export const PRON_WEAK_LIMIT = 100;

export interface VocabMemoryStats {
  tracked: number; // words that have entered the schedule
  remembering: number; // recall probability >= desired retention
  due: number; // due right now
  urgent: number; // badly overdue (recall probability < 0.7) — about to be lost
  retention30: { reviewed: number; recalled: number; rate: number | null }; // true retention, 30 days
  tiers: { tier: number; count: number }[]; // knowledge pyramid (0..4)
  forecast: { date: string; count: number }[]; // review load for the next 14 days
  soon: { word: string; retrievability: number; dueAt: string; tier: number }[]; // about to forget
  new_today: number; // new words already taken on today (capped by NEW_PER_DAY)
  /** Pronunciation: how many words carry a score, how good, and which ones still need work. */
  pron: {
    scored: number;
    avg: number | null;
    weak: number;
    weakest: { word: string; score: number }[];
  };
}

/** Daily NEW-word cap — an overloaded queue is the #1 quit reason in every SRS. */
export const NEW_PER_DAY = 12;
/** Above this queue size, stop taking new words and clear the backlog first. */
export const QUEUE_OVERLOAD = 60;
const SOON_LIMIT = 12;
const FORECAST_DAYS = 14;

/** Memory stats for the dashboard. Scans ONE user's progress rows (a few thousand at most). */
export async function vocabMemoryStats(db: Db, userId: string, now: Date): Promise<VocabMemoryStats> {
  const nowIso = now.toISOString();
  const rows = await db
    .select({
      word: schema.userVocabProgress.word,
      tier: schema.userVocabProgress.tier,
      stability: schema.userVocabProgress.stability,
      dueAt: schema.userVocabProgress.dueAt,
      lastReviewAt: schema.userVocabProgress.lastReviewAt,
      reps: schema.userVocabProgress.reps,
    })
    .from(schema.userVocabProgress)
    .where(eq(schema.userVocabProgress.userId, userId));

  // Best pronunciation score per word (kept on the progress row by the Pronounce card).
  const pronRows = await db
    .select({ word: schema.userVocabProgress.word, best: schema.userVocabProgress.pronBest })
    .from(schema.userVocabProgress)
    .where(and(eq(schema.userVocabProgress.userId, userId), isNotNull(schema.userVocabProgress.pronBest)));
  const pronScores = pronRows.map((r) => ({ word: r.word, score: r.best ?? 0 }));

  const tiers = [0, 0, 0, 0, 0];
  const forecastMap = new Map<string, number>();
  const scored: { word: string; r: number; dueAt: string; tier: number }[] = [];
  let tracked = 0;
  let remembering = 0;
  let due = 0;
  let urgent = 0;
  let newToday = 0;
  const todayIso = nowIso.slice(0, 10);

  for (const p of rows) {
    tiers[Math.min(4, Math.max(0, p.tier))] += 1;
    if (p.stability == null || !p.dueAt) continue;
    tracked += 1;
    const r = retrievability(p.stability, elapsedDays(p.lastReviewAt, now));
    if (r >= DESIRED_RETENTION) remembering += 1;
    if (p.dueAt <= nowIso) {
      due += 1;
      if (r < 0.7) urgent += 1;
      scored.push({ word: p.word, r, dueAt: p.dueAt, tier: p.tier });
    } else {
      const day = p.dueAt.slice(0, 10);
      forecastMap.set(day, (forecastMap.get(day) ?? 0) + 1);
    }
    if (p.reps <= 1 && p.lastReviewAt?.slice(0, 10) === todayIso) newToday += 1; // first review = new word
  }

  // 30-day true retention: sum the per-session memory summaries instead of keeping a review log.
  const from = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const subs = await db
    .select({ result: schema.vocabSubmissions.result })
    .from(schema.vocabSubmissions)
    .where(and(eq(schema.vocabSubmissions.userId, userId), gte(schema.vocabSubmissions.submittedAt, from)));
  let reviewed = 0;
  let recalled = 0;
  for (const s of subs) {
    reviewed += s.result?.memory?.reviewed ?? 0;
    recalled += s.result?.memory?.recalled ?? 0;
  }

  const forecast: VocabMemoryStats["forecast"] = [];
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const day = new Date(now.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    forecast.push({ date: day, count: (i === 0 ? due : 0) + (forecastMap.get(day) ?? 0) });
  }

  return {
    tracked,
    remembering,
    due,
    urgent,
    retention30: { reviewed, recalled, rate: reviewed > 0 ? Math.round((recalled / reviewed) * 100) : null },
    tiers: tiers.map((count, tier) => ({ tier, count })),
    forecast,
    soon: scored
      .sort((a, b) => a.r - b.r)
      .slice(0, SOON_LIMIT)
      .map((s) => ({ word: s.word, retrievability: Math.round(s.r * 100), dueAt: s.dueAt, tier: s.tier })),
    new_today: newToday,
    pron: {
      scored: pronScores.length,
      avg: pronScores.length
        ? Math.round(pronScores.reduce((a, x) => a + x.score, 0) / pronScores.length)
        : null,
      weak: pronScores.filter((x) => x.score < PRON_WEAK).length,
      // Worst first, capped: this is a practice list, not an export. The UI shows a dozen and
      // expands into the rest.
      weakest: pronScores
        .filter((x) => x.score < PRON_WEAK)
        .sort((a, b) => a.score - b.score)
        .slice(0, PRON_WEAK_LIMIT),
    },
  };
}

/** A user's DUE words (key + due date), longest overdue first. Builds the review queue. */
export async function dueKeys(db: Db, userId: string, limit: number, now: Date): Promise<{ word: string; dueAt: string }[]> {
  const rows = await db
    .select({ word: schema.userVocabProgress.word, dueAt: schema.userVocabProgress.dueAt })
    .from(schema.userVocabProgress)
    .where(
      and(
        eq(schema.userVocabProgress.userId, userId),
        isNotNull(schema.userVocabProgress.dueAt),
        lte(schema.userVocabProgress.dueAt, now.toISOString()),
      ),
    )
    .orderBy(schema.userVocabProgress.dueAt)
    .limit(limit);
  return rows.map((r) => ({ word: r.word, dueAt: r.dueAt! }));
}
