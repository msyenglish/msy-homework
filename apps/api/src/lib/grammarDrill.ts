// ============================================================
//  GRAMMAR DRILL ENGINE — pick sentences from the bank, grade a session, move the memory state.
//  ONE FSRS state per GRAMMAR POINT (user_grammar_progress); per-item rows only carry the
//  cooldown and the one-time "cleared" flag.
// ============================================================
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  DEFAULT_DRILL_TYPES,
  DESIRED_RETENTION,
  GRAMMAR_TIER_LABEL,
  ITEM_COOLDOWN_DAYS,
  correctAnswerText,
  creditForAnswer,
  grammarItemPoints,
  grammarMastery,
  retrievability,
  type GrammarDrillAnswer,
  type GrammarDrillItem,
  type GrammarDrillVerdict,
  type GrammarMastery,
  type GrammarSessionInput,
  type GrammarSessionResult,
  type GrammarForm,
  type GrammarTier,
  type Question,
  type QuestionType,
} from "@msyen/shared";
import { schema, type Db } from "../db";
import { publicGrammarQuestion } from "./serialize";
import { BIND_CHUNK, inChunks } from "./bind";
import { applyPointMemory, elapsedDays, saveProgressRows, type PointAgg } from "./grammarMemory";

const DAY_MS = 24 * 3600 * 1000;

/** D1 caps bind params per statement; user_grammar_items has 6 columns -> 12 rows is safe. */
const ITEM_UPSERT_CHUNK = 12;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface PoolRow {
  id: string;
  grammarId: string;
  cefr: string;
  tier: number;
  type: QuestionType;
  payload: Question;
  clearedAt: string | null;
  lastSeenAt: string | null;
  wrongs: number;
}

/**
 * Priority of one candidate — LOWER is served first. This IS the session mix; the learner never
 * picks a mode, because choosing between "review" and "often wrong" is a scheduling decision the
 * memory model can make better than a beginner can. The order encodes three goals at once:
 * fix what is failing, cover what is untouched, then honour the review schedule.
 *
 *  0  wrong before and still not cleared  — the weakest spot, always first
 *  1  never served                        — breadth of coverage
 *  2  served but never cleared            — still unfinished
 *  3  cleared, was wrong before, point due — the review most likely to have decayed
 *  4  cleared, point due                  — ordinary scheduled review
 *  5  cleared, point NOT due              — last resort; re-serving these earns nothing anyway
 */
function priority(row: PoolRow, pointDue: boolean): number {
  if (!row.clearedAt) {
    if (row.wrongs > 0) return 0;
    return row.lastSeenAt ? 2 : 1;
  }
  if (!pointDue) return 5;
  return row.wrongs > 0 ? 3 : 4;
}

export interface SessionPick {
  items: GrammarDrillItem[];
  /** Points that were dropped because their bank is empty — the UI warns about them. */
  empty: string[];
}

/**
 * Build one session. Spreads `count` evenly across the requested points, then fills any shortfall
 * from the points that still have candidates, so a thin bank never shortens the whole session.
 */
export async function pickSessionItems(
  db: Db,
  userId: string,
  input: GrammarSessionInput,
  now: Date,
): Promise<SessionPick> {
  const ids = [...new Set(input.grammarIds)];
  const points = await db
    .select({
      id: schema.grammar.id,
      title: schema.grammar.title,
      cefr: schema.grammar.cefr,
      drillTypes: schema.grammar.drillTypes,
    })
    .from(schema.grammar)
    .where(inArray(schema.grammar.id, ids));
  if (!points.length) return { items: [], empty: ids };

  const progress = await db
    .select({
      grammarId: schema.userGrammarProgress.grammarId,
      dueAt: schema.userGrammarProgress.dueAt,
      tier: schema.userGrammarProgress.tier,
    })
    .from(schema.userGrammarProgress)
    .where(and(eq(schema.userGrammarProgress.userId, userId), inArray(schema.userGrammarProgress.grammarId, ids)));
  const nowIso = now.toISOString();
  const dueByPoint = new Map(progress.map((p) => [p.grammarId, !!p.dueAt && p.dueAt <= nowIso]));

  // One pass over the bank of every requested point, joined with this learner's item history.
  const bank = await db
    .select({
      id: schema.grammarItems.id,
      grammarId: schema.grammarItems.grammarId,
      cefr: schema.grammarItems.cefr,
      tier: schema.grammarItems.tier,
      type: schema.grammarItems.type,
      payload: schema.grammarItems.payload,
      clearedAt: schema.userGrammarItems.clearedAt,
      lastSeenAt: schema.userGrammarItems.lastSeenAt,
      wrongs: schema.userGrammarItems.wrongs,
    })
    .from(schema.grammarItems)
    .leftJoin(
      schema.userGrammarItems,
      and(eq(schema.userGrammarItems.itemId, schema.grammarItems.id), eq(schema.userGrammarItems.userId, userId)),
    )
    .where(and(inArray(schema.grammarItems.grammarId, ids), eq(schema.grammarItems.status, "live")));

  const typeFilter = input.types?.length ? new Set(input.types) : null;
  const cooldownBefore = new Date(now.getTime() - ITEM_COOLDOWN_DAYS * DAY_MS).toISOString();

  const byPoint = new Map<string, PoolRow[]>();
  for (const b of bank) {
    const row: PoolRow = {
      id: b.id,
      grammarId: b.grammarId,
      cefr: b.cefr,
      tier: b.tier,
      type: b.type,
      payload: b.payload,
      clearedAt: b.clearedAt,
      lastSeenAt: b.lastSeenAt,
      wrongs: b.wrongs ?? 0,
    };
    const allowed = typeFilter ? typeFilter.has(row.type) : (points.find((p) => p.id === row.grammarId)?.drillTypes ?? DEFAULT_DRILL_TYPES).includes(row.type);
    if (!allowed) continue;
    (byPoint.get(row.grammarId) ?? byPoint.set(row.grammarId, []).get(row.grammarId)!).push(row);
  }

  // Order each point's candidates: priority, then cooldown (fresh first), then random inside a rank.
  const queues = new Map<string, PoolRow[]>();
  const empty: string[] = [];
  for (const p of points) {
    const pool = byPoint.get(p.id) ?? [];
    const pointDue = dueByPoint.get(p.id) ?? false;
    const ranked = shuffle(pool)
      .map((row) => ({
        row,
        // An item served inside the cooldown window drops to the back rather than out of the pool:
        // running out of sentences must never end a session early.
        rank: priority(row, pointDue) + (row.lastSeenAt && row.lastSeenAt > cooldownBefore ? 10 : 0),
      }))
      .sort((a, b) => a.rank - b.rank || a.row.tier - b.row.tier)
      .map((x) => x.row);
    if (!ranked.length) empty.push(p.id);
    else queues.set(p.id, ranked);
  }

  const live = points.filter((p) => queues.has(p.id));
  if (!live.length) return { items: [], empty };

  // Round-robin so a session that spans several points interleaves them instead of blocking.
  const picked: PoolRow[] = [];
  const perPoint = Math.ceil(input.count / live.length);
  for (let round = 0; round < perPoint && picked.length < input.count; round++) {
    for (const p of live) {
      if (picked.length >= input.count) break;
      const q = queues.get(p.id)!;
      const next = q.shift();
      if (next) picked.push(next);
    }
  }
  // Shortfall (thin banks): top up from whoever still has candidates.
  if (picked.length < input.count) {
    for (const p of live) {
      const q = queues.get(p.id)!;
      while (picked.length < input.count && q.length) picked.push(q.shift()!);
    }
  }

  const titleById = new Map(points.map((p) => [p.id, p.title]));
  return {
    items: shuffle(picked).map((row) => ({
      id: row.id,
      grammar_id: row.grammarId,
      grammar_title: titleById.get(row.grammarId) ?? row.grammarId,
      cefr: row.cefr,
      tier: Math.min(3, Math.max(1, row.tier)) as 1 | 2 | 3,
      question: publicGrammarQuestion(row.payload),
    })),
    empty,
  };
}

/**
 * Fallback explanation when an item has no `explain_vi`: build it from the grammar point itself,
 * so identical rules are not duplicated across sixty sentences. Vietnamese — shown to the learner.
 */
function fallbackExplain(g: { forms?: GrammarForm[] | null; tips?: string[] | null; summary: string } | undefined): string | null {
  if (!g) return null;
  const formula = g.forms?.[0]?.formula;
  const tip = g.tips?.[0];
  return [formula ? `Công thức: ${formula}` : null, tip ?? g.summary].filter(Boolean).join(" — ") || null;
}

/**
 * Rebuild a saved draft's items, in the SAME order they were drawn. Reopening a draft must not
 * re-draw from the bank: those items already spent their cooldown, and the learner may have
 * answered half of them. Items retired since the draft was made are dropped.
 */
export async function resolveSessionItems(db: Db, itemIds: string[]): Promise<GrammarDrillItem[]> {
  if (!itemIds.length) return [];
  const rows = await inChunks(itemIds, (chunk) =>
    db
      .select({
        id: schema.grammarItems.id,
        grammarId: schema.grammarItems.grammarId,
        cefr: schema.grammarItems.cefr,
        tier: schema.grammarItems.tier,
        payload: schema.grammarItems.payload,
        title: schema.grammar.title,
      })
      .from(schema.grammarItems)
      .innerJoin(schema.grammar, eq(schema.grammar.id, schema.grammarItems.grammarId))
      .where(and(inArray(schema.grammarItems.id, chunk), eq(schema.grammarItems.status, "live"))),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return itemIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      id: r.id,
      grammar_id: r.grammarId,
      grammar_title: r.title,
      cefr: r.cefr,
      tier: Math.min(3, Math.max(1, r.tier)) as 1 | 2 | 3,
      question: publicGrammarQuestion(r.payload),
    }));
}

/**
 * Grade a submitted session and move the memory state.
 * Points come only from places that cannot be farmed:
 * first clear of an item, reviewing a cleared item while its point is due, and crossing a tier.
 */
export async function applyDrillSession(
  db: Db,
  userId: string,
  answers: GrammarDrillAnswer[],
  mode: string,
  now: Date,
): Promise<GrammarSessionResult> {
  const nowIso = now.toISOString();
  const itemIds = [...new Set(answers.map((a) => a.item_id))];

  const items = await inChunks(itemIds, (chunk) =>
    db
      .select({
        id: schema.grammarItems.id,
        grammarId: schema.grammarItems.grammarId,
        type: schema.grammarItems.type,
        payload: schema.grammarItems.payload,
        explainVi: schema.grammarItems.explainVi,
      })
      .from(schema.grammarItems)
      .where(inArray(schema.grammarItems.id, chunk)),
  );
  const itemById = new Map(items.map((i) => [i.id, i]));
  const grammarIds = [...new Set(items.map((i) => i.grammarId))];

  const [prevItems, prevProgress, grammarRows] = await Promise.all([
    inChunks(itemIds, (chunk) =>
      db
        .select()
        .from(schema.userGrammarItems)
        .where(and(eq(schema.userGrammarItems.userId, userId), inArray(schema.userGrammarItems.itemId, chunk))),
    ),
    db
      .select()
      .from(schema.userGrammarProgress)
      .where(and(eq(schema.userGrammarProgress.userId, userId), inArray(schema.userGrammarProgress.grammarId, grammarIds))),
    db
      .select({
        id: schema.grammar.id,
        title: schema.grammar.title,
        summary: schema.grammar.summary,
        forms: schema.grammar.forms,
        tips: schema.grammar.tips,
      })
      .from(schema.grammar)
      .where(inArray(schema.grammar.id, grammarIds)),
  ]);
  const prevItemById = new Map(prevItems.map((r) => [r.itemId, r]));
  const prevProgressById = new Map(prevProgress.map((r) => [r.grammarId, r]));
  const grammarById = new Map(grammarRows.map((g) => [g.id, g]));

  const verdicts: GrammarDrillVerdict[] = [];
  const perPoint = new Map<string, PointAgg>();
  const itemRows: (typeof schema.userGrammarItems.$inferInsert)[] = [];
  let points = 0;
  let totalCredit = 0;

  for (const a of answers) {
    const item = itemById.get(a.item_id);
    if (!item) continue;
    const q = { ...item.payload, position: 0, type: item.type };
    const credit = creditForAnswer(q, a.answer);
    const correct = credit >= 1;
    const prev = prevItemById.get(item.id);
    const pointRow = prevProgressById.get(item.grammarId);
    const wasDue = !!pointRow?.dueAt && pointRow.dueAt <= nowIso;

    // A first clear only counts when the answer was right FIRST TRY in this session: otherwise
    // guessing, reading the correction, then retyping would mint points.
    const firstClear = correct && !prev?.clearedAt && !a.retried;
    const earned = grammarItemPoints({ credit, firstClear, wasDue });
    points += earned;
    totalCredit += credit;

    const agg = perPoint.get(item.grammarId) ?? { seen: 0, credit: 0, correct: 0, effective: 0 };
    agg.seen += 1;
    agg.credit += credit;
    agg.correct += correct ? 1 : 0;
    // Only NEW sentences, or cleared ones met while the point is due, are evidence about memory.
    // Replaying already-cleared items off-schedule is practice: it must not move the schedule or
    // the ladder, otherwise resubmitting one perfect session twice would buy a whole tier.
    if (!prev?.clearedAt || wasDue) agg.effective += 1;
    perPoint.set(item.grammarId, agg);

    verdicts.push({
      item_id: item.id,
      grammar_id: item.grammarId,
      credit: Math.round(credit * 100) / 100,
      correct,
      first_clear: firstClear,
      points: earned,
      correct_answer: correctAnswerText(q),
      explain: item.explainVi ?? fallbackExplain(grammarById.get(item.grammarId)),
    });

    itemRows.push({
      userId,
      itemId: item.id,
      clearedAt: prev?.clearedAt ?? (correct ? nowIso : null),
      lastSeenAt: nowIso,
      attempts: (prev?.attempts ?? 0) + 1,
      wrongs: (prev?.wrongs ?? 0) + (correct ? 0 : 1),
    });
  }

  // ---- Memory state, one row per grammar point (shared with the translation drill) ----
  const { pointsState, progressRows, tierPoints } = applyPointMemory(
    perPoint,
    prevProgressById,
    new Map(grammarRows.map((g) => [g.id, g.title])),
    userId,
    now,
  );
  points += tierPoints;

  for (let i = 0; i < itemRows.length; i += ITEM_UPSERT_CHUNK) {
    await db
      .insert(schema.userGrammarItems)
      .values(itemRows.slice(i, i + ITEM_UPSERT_CHUNK))
      .onConflictDoUpdate({
        target: [schema.userGrammarItems.userId, schema.userGrammarItems.itemId],
        set: {
          clearedAt: sql`coalesce(${schema.userGrammarItems.clearedAt}, excluded.cleared_at)`,
          lastSeenAt: sql`excluded.last_seen_at`,
          attempts: sql`excluded.attempts`,
          wrongs: sql`excluded.wrongs`,
        },
      });
  }
  await saveProgressRows(db, progressRows);

  // Item quality counters (p-value): spot miskeyed or broken sentences later.
  const seenIds = verdicts.map((v) => v.item_id);
  for (let i = 0; i < seenIds.length; i += BIND_CHUNK) {
    await db
      .update(schema.grammarItems)
      .set({ seenCount: sql`${schema.grammarItems.seenCount} + 1` })
      .where(inArray(schema.grammarItems.id, seenIds.slice(i, i + BIND_CHUNK)));
  }
  const wrongIds = verdicts.filter((v) => !v.correct).map((v) => v.item_id);
  for (let i = 0; i < wrongIds.length; i += BIND_CHUNK) {
    await db
      .update(schema.grammarItems)
      .set({ wrongCount: sql`${schema.grammarItems.wrongCount} + 1` })
      .where(inArray(schema.grammarItems.id, wrongIds.slice(i, i + BIND_CHUNK)));
  }

  const total = verdicts.length;
  const correct = Math.round(totalCredit * 10) / 10;
  const result: GrammarSessionResult = {
    id: "",
    correct,
    total,
    score: total > 0 ? Math.round((totalCredit / total) * 100) : 0,
    points,
    verdicts,
    points_state: pointsState,
  };

  const [sub] = await db
    .insert(schema.grammarSubmissions)
    .values({
      userId,
      grammarIds,
      mode,
      correct,
      total,
      score: result.score,
      points,
      result,
    })
    .returning({ id: schema.grammarSubmissions.id });
  result.id = sub.id;
  return result;
}

/**
 * Bank size and cleared count per point, ACROSS BOTH DRILLS. Translation sentences are part of a
 * point's material, so leaving them out understated "how far through the bank" and made translation
 * work invisible to the progress bar. Note this slightly dilutes existing mastery percentages: the
 * denominator grew by however many translation sentences a point has.
 */
async function bankAndCleared(db: Db, userId: string) {
  const [banks, cleared, tBanks, tCleared] = await Promise.all([
    db
      .select({ grammarId: schema.grammarItems.grammarId, n: sql<number>`count(*)` })
      .from(schema.grammarItems)
      .where(eq(schema.grammarItems.status, "live"))
      .groupBy(schema.grammarItems.grammarId),
    db
      .select({ grammarId: schema.grammarItems.grammarId, n: sql<number>`count(*)` })
      .from(schema.userGrammarItems)
      .innerJoin(schema.grammarItems, eq(schema.userGrammarItems.itemId, schema.grammarItems.id))
      .where(and(eq(schema.userGrammarItems.userId, userId), isNotNull(schema.userGrammarItems.clearedAt)))
      .groupBy(schema.grammarItems.grammarId),
    db
      .select({ grammarId: schema.grammarTranslateItems.grammarId, n: sql<number>`count(*)` })
      .from(schema.grammarTranslateItems)
      .where(eq(schema.grammarTranslateItems.status, "live"))
      .groupBy(schema.grammarTranslateItems.grammarId),
    db
      .select({ grammarId: schema.grammarTranslateItems.grammarId, n: sql<number>`count(*)` })
      .from(schema.userGrammarTranslateItems)
      .innerJoin(
        schema.grammarTranslateItems,
        eq(schema.userGrammarTranslateItems.itemId, schema.grammarTranslateItems.id),
      )
      .where(
        and(
          eq(schema.userGrammarTranslateItems.userId, userId),
          isNotNull(schema.userGrammarTranslateItems.clearedAt),
        ),
      )
      .groupBy(schema.grammarTranslateItems.grammarId),
  ]);
  const sum = (rows: { grammarId: string; n: number }[][]) => {
    const m = new Map<string, number>();
    for (const set of rows) for (const r of set) m.set(r.grammarId, (m.get(r.grammarId) ?? 0) + Number(r.n ?? 0));
    return m;
  };
  return { bankBy: sum([banks, tBanks]), clearedBy: sum([cleared, tCleared]) };
}

/** Mastery of every grammar point this learner has touched + the size of each bank. */
export async function grammarMasteryState(db: Db, userId: string, now: Date): Promise<GrammarMastery[]> {
  const nowIso = now.toISOString();
  const [progress, counts] = await Promise.all([
    db
      .select()
      .from(schema.userGrammarProgress)
      .where(eq(schema.userGrammarProgress.userId, userId)),
    bankAndCleared(db, userId),
  ]);
  const { bankBy, clearedBy } = counts;

  // Points with a bank but no progress row still deserve a 0% entry so the UI can show the bar.
  const ids = new Set<string>([...bankBy.keys(), ...progress.map((p) => p.grammarId)]);
  const progressBy = new Map(progress.map((p) => [p.grammarId, p]));
  return [...ids].map((id) => {
    const p = progressBy.get(id);
    const tier = (p?.tier ?? 0) as GrammarTier;
    const bank = bankBy.get(id) ?? 0;
    const done = clearedBy.get(id) ?? 0;
    return {
      grammar_id: id,
      tier,
      mastery: grammarMastery(tier, done, bank),
      cleared: done,
      bank,
      due: !!p?.dueAt && p.dueAt <= nowIso,
      due_at: p?.dueAt ?? null,
      marked: p?.marked ?? false,
    };
  });
}

// ============================================================
//  Memory stats for the progress dashboard — the grammar twin of vocabMemoryStats.
//  Same three questions: what is in memory, what is due, how far through the bank.
// ============================================================

export interface GrammarMemoryStats {
  tracked: number; // points that have entered the schedule
  remembering: number; // recall probability >= desired retention
  due: number; // due right now
  urgent: number; // badly overdue (recall probability < 0.7)
  points_total: number; // points that have a live bank at all
  points_started: number; // of those, ones the learner has practised
  cleared: number; // bank sentences cleared
  bank: number; // live bank sentences behind the points the learner started
  tiers: { tier: number; count: number }[]; // knowledge ladder 0..3
  forecast: { date: string; count: number }[]; // review load, next 14 days
  soon: { grammar_id: string; title: string; cefr: string; retrievability: number; due_at: string; tier: number }[];
}

const GRAMMAR_SOON_LIMIT = 10;
const GRAMMAR_FORECAST_DAYS = 14;

export async function grammarMemoryStats(db: Db, userId: string, now: Date): Promise<GrammarMemoryStats> {
  const nowIso = now.toISOString();
  const [progress, counts, points] = await Promise.all([
    db.select().from(schema.userGrammarProgress).where(eq(schema.userGrammarProgress.userId, userId)),
    bankAndCleared(db, userId),
    db.select({ id: schema.grammar.id, title: schema.grammar.title, cefr: schema.grammar.cefr }).from(schema.grammar),
  ]);

  const { bankBy, clearedBy } = counts;
  const pointBy = new Map(points.map((p) => [p.id, p]));

  const tiers = [0, 0, 0, 0];
  const forecastMap = new Map<string, number>();
  const scored: { id: string; r: number; dueAt: string; tier: number }[] = [];
  let tracked = 0;
  let remembering = 0;
  let due = 0;
  let urgent = 0;
  let clearedTotal = 0;
  let bankTotal = 0;

  for (const p of progress) {
    // Only points that still have a live bank belong on this dashboard.
    if (!bankBy.has(p.grammarId)) continue;
    tiers[Math.min(3, Math.max(0, p.tier))] += 1;
    clearedTotal += clearedBy.get(p.grammarId) ?? 0;
    bankTotal += bankBy.get(p.grammarId) ?? 0;
    if (p.stability == null || !p.dueAt) continue;
    tracked += 1;
    const r = retrievability(p.stability, elapsedDays(p.lastReviewAt, now));
    if (r >= DESIRED_RETENTION) remembering += 1;
    if (p.dueAt <= nowIso) {
      due += 1;
      if (r < 0.7) urgent += 1;
      scored.push({ id: p.grammarId, r, dueAt: p.dueAt, tier: p.tier });
    } else {
      const day = p.dueAt.slice(0, 10);
      forecastMap.set(day, (forecastMap.get(day) ?? 0) + 1);
    }
  }

  const forecast: GrammarMemoryStats["forecast"] = [];
  for (let i = 0; i < GRAMMAR_FORECAST_DAYS; i++) {
    const day = new Date(now.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    forecast.push({ date: day, count: (i === 0 ? due : 0) + (forecastMap.get(day) ?? 0) });
  }

  return {
    tracked,
    remembering,
    due,
    urgent,
    points_total: bankBy.size,
    points_started: progress.filter((p) => bankBy.has(p.grammarId)).length,
    cleared: clearedTotal,
    bank: bankTotal,
    tiers: tiers.map((count, tier) => ({ tier, count })),
    forecast,
    soon: scored
      .sort((a, b) => a.r - b.r)
      .slice(0, GRAMMAR_SOON_LIMIT)
      .map((s) => ({
        grammar_id: s.id,
        title: pointBy.get(s.id)?.title ?? s.id,
        cefr: pointBy.get(s.id)?.cefr ?? "",
        retrievability: Math.round(s.r * 100),
        due_at: s.dueAt,
        tier: s.tier,
      })),
  };
}

export { GRAMMAR_TIER_LABEL };
