// ============================================================
//  SHARED MEMORY STEP for every grammar practice mode. One FSRS state per GRAMMAR POINT lives on
//  `user_grammar_progress`, so the quiz drill and the translation drill must move it identically —
//  two copies of this gating would drift apart silently.
// ============================================================
import { sql } from "drizzle-orm";
import {
  MIN_ITEMS_FOR_SCHEDULE,
  grammarTierPoints,
  nextGrammarTier,
  ratingFromRatio,
  schedule,
  type GrammarPointResult,
  type GrammarTier,
  type MemoryState,
} from "@msyen/shared";
import { schema, type Db } from "../db";

const DAY_MS = 24 * 3600 * 1000;

export const elapsedDays = (fromIso: string | null, now: Date) =>
  fromIso ? Math.max(0, (now.getTime() - new Date(fromIso).getTime()) / DAY_MS) : 0;

/** What one point accumulated during a session. `effective` drives whether the schedule may move. */
export interface PointAgg {
  seen: number;
  credit: number;
  correct: number;
  /**
   * Items that are real evidence about memory: never cleared before, or cleared and met while the
   * point was due. Replaying cleared items off-schedule is practice, not evidence — counting it
   * would let one perfect session, resubmitted, buy a whole tier.
   */
  effective: number;
}

type ProgressRow = typeof schema.userGrammarProgress.$inferSelect;

export interface PointMemoryOutcome {
  pointsState: GrammarPointResult[];
  progressRows: (typeof schema.userGrammarProgress.$inferInsert)[];
  /** Points awarded for crossing a tier, summed across every point in the session. */
  tierPoints: number;
}

/**
 * Turn per-point session aggregates into the next FSRS state. Pure: it reads the previous rows and
 * returns what to write, so both drill modes share one definition of "did this move the schedule".
 */
export function applyPointMemory(
  perPoint: Map<string, PointAgg>,
  prevProgressById: Map<string, ProgressRow>,
  titleById: Map<string, string>,
  userId: string,
  now: Date,
): PointMemoryOutcome {
  const nowIso = now.toISOString();
  const pointsState: GrammarPointResult[] = [];
  const progressRows: (typeof schema.userGrammarProgress.$inferInsert)[] = [];
  let tierPoints = 0;

  for (const [grammarId, agg] of perPoint) {
    const prev = prevProgressById.get(grammarId);
    const prevTier = (prev?.tier ?? 0) as GrammarTier;
    const ratio = agg.seen > 0 ? agg.credit / agg.seen : 0;
    const wasDue = !!prev?.dueAt && prev.dueAt <= nowIso;
    const title = titleById.get(grammarId) ?? grammarId;

    // Too little real evidence to judge a whole grammar point on — record the encounter, leave the
    // schedule and the tier exactly where they were.
    if (agg.effective < MIN_ITEMS_FOR_SCHEDULE) {
      pointsState.push({
        grammar_id: grammarId,
        title,
        seen: agg.seen,
        correct: agg.correct,
        prev_tier: prevTier,
        tier: prevTier,
        was_due: wasDue,
        due_at: null,
        points: 0,
      });
      continue;
    }

    const rating = ratingFromRatio(ratio, agg.seen);
    const prevState: MemoryState | null =
      prev && prev.stability != null && prev.difficulty != null
        ? { stability: prev.stability, difficulty: prev.difficulty, reps: prev.reps, lapses: prev.lapses }
        : null;
    const { state, interval } = schedule(prevState, rating, elapsedDays(prev?.lastReviewAt ?? null, now));
    const tier = nextGrammarTier(prevTier, ratio, { reps: state.reps, stability: state.stability });
    const pts = grammarTierPoints(prevTier, tier);
    tierPoints += pts;
    const dueAt = new Date(now.getTime() + interval * DAY_MS).toISOString();

    pointsState.push({
      grammar_id: grammarId,
      title,
      seen: agg.seen,
      correct: agg.correct,
      prev_tier: prevTier,
      tier,
      was_due: wasDue,
      due_at: dueAt,
      points: pts,
    });
    progressRows.push({
      userId,
      grammarId,
      learned: tier >= 1 || (prev?.learned ?? false),
      learnedAt: prev?.learnedAt ?? (tier >= 1 ? nowIso : null),
      marked: prev?.marked ?? false,
      markedAt: prev?.markedAt ?? null,
      stability: state.stability,
      difficulty: state.difficulty,
      dueAt,
      lastReviewAt: nowIso,
      reps: state.reps,
      lapses: state.lapses,
      tier,
      lastRating: rating,
      updatedAt: nowIso,
    });
  }

  return { pointsState, progressRows, tierPoints };
}

/** Persist the rows `applyPointMemory` produced. A tier never drops. */
export async function saveProgressRows(
  db: Db,
  rows: (typeof schema.userGrammarProgress.$inferInsert)[],
): Promise<void> {
  for (const row of rows) {
    await db
      .insert(schema.userGrammarProgress)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.userGrammarProgress.userId, schema.userGrammarProgress.grammarId],
        set: {
          learned: sql`excluded.learned`,
          learnedAt: sql`coalesce(${schema.userGrammarProgress.learnedAt}, excluded.learned_at)`,
          stability: sql`excluded.stability`,
          difficulty: sql`excluded.difficulty`,
          dueAt: sql`excluded.due_at`,
          lastReviewAt: sql`excluded.last_review_at`,
          reps: sql`excluded.reps`,
          lapses: sql`excluded.lapses`,
          tier: sql`max(excluded.tier, ${schema.userGrammarProgress.tier})`,
          lastRating: sql`excluded.last_rating`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}
