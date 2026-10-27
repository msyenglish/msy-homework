// ============================================================
//  GRAMMAR TRANSLATION ENGINE — Vietnamese prompt in, English sentence out. Its own item table and
//  its own cooldown rows, but it moves the SAME per-point FSRS state as the quiz drill via
//  `applyPointMemory`. Grading is deterministic: no AI at request time.
// ============================================================
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  ITEM_COOLDOWN_DAYS,
  TRANSLATE_MODE,
  grammarItemPoints,
  isTranslateCorrect,
  translateAnswerKey,
  translateAnswerKeyExpanded,
  translateAnswerKeyExpandedNoArticles,
  translateAnswerKeyLoose,
  translateAnswerKeyNoArticles,
  type GrammarTranslateAnswer,
  type GrammarTranslateAvailability,
  type GrammarTranslateItem,
  type GrammarTranslateResult,
  type GrammarTranslateSessionInput,
  type Cefr,
  type GrammarTranslateVerdict,
} from "@msyen/shared";
import { schema, type Db } from "../db";
import { BIND_CHUNK, inChunks } from "./bind";
import { applyPointMemory, saveProgressRows, type PointAgg } from "./grammarMemory";

const DAY_MS = 24 * 3600 * 1000;

/** D1 caps bind params per statement; user_grammar_translate_items has 6 columns -> 12 rows. */
const ITEM_UPSERT_CHUNK = 12;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * First letter of every word, the rest masked: "My dad is a doctor." -> "M_ d__ i_ a d_____."
 * Trailing punctuation and apostrophes stay visible. Apostrophes are decorative in translation
 * practice, so revealing their position prevents a needless extra blank without giving away a letter.
 */
function skeletonOf(en: string): string {
  return en
    .split(/(\s+)/)
    .map((tok) => {
      const m = tok.match(/^([\p{L}\p{N}'-]+)(.*)$/u);
      if (!m) return tok;
      const [, word, rest] = m;
      // A one-letter word would be printed in full, which hands over the article on the very point
      // that teaches a/an. Mask it instead; the length is still a hint, the letter no longer is.
      if (word.length === 1) return "_" + rest;
      return [...word].map((ch, i) => (i === 0 || ch === "'" ? ch : "_")).join("") + rest;
    })
    .join("");
}

const sha256Hex = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Hash of every acceptable answer key, so the client can give live "correct" feedback while typing
 * without ever holding the English sentence. When the item forgives article choice, the
 * article-stripped keys go in too, so the client can check that variant the same way.
 */
async function answerHashes(
  en: string,
  accept: string[] | null,
  lenient: boolean,
): Promise<string[]> {
  const forms = [en, ...(accept ?? [])];
  const keys = new Set(forms.map((f) => translateAnswerKey(f)));
  if (lenient) for (const f of forms) keys.add(translateAnswerKeyNoArticles(f));
  // Apostrophe-insensitive keys, matching what the video dictation drill has always accepted.
  for (const f of forms) keys.add(translateAnswerKeyLoose(f));
  // Contractions spelled out, so "I'll" matches "I will" live as well as at grading.
  for (const f of forms) keys.add(lenient ? translateAnswerKeyExpandedNoArticles(f) : translateAnswerKeyExpanded(f));
  return Promise.all([...keys].filter(Boolean).map(sha256Hex));
}

/**
 * Hash of each word of the answer, in the answer's own order, so a boxed rung can mark one box
 * correct on its own. Keyed the same way as the whole sentence, so "Don't" and "don't" agree.
 */
async function wordHashes(en: string): Promise<string[]> {
  const words = translateAnswerKey(en).split(/\s+/).filter(Boolean);
  return Promise.all(words.map(sha256Hex));
}

/** The same words keyed without apostrophes, so a box accepts "doesnt" for "doesn't". */
async function wordHashesLoose(en: string): Promise<string[]> {
  const words = translateAnswerKeyLoose(en).split(/\s+/).filter(Boolean);
  return Promise.all(words.map(sha256Hex));
}

interface PoolRow {
  id: string;
  grammarId: string;
  cefr: string;
  tier: number;
  source: string;
  patternId: string | null;
  vi: string;
  en: string;
  accept: string[] | null;
  articleLenient: number;
  wordBank: string[] | null;
  clearedAt: string | null;
  lastSeenAt: string | null;
  wrongs: number;
}

/**
 * Gives template and authored context frames a softer chance after they have already appeared in a
 * session. This is deliberately a weighted draw, not a cap: a repeated frame remains available
 * when the point has a small bank or the learner's priority rows concentrate on it.
 */
function softlyDiversify(rows: PoolRow[]): PoolRow[] {
  const pending = shuffle(rows);
  const picked: PoolRow[] = [];
  const seen = new Map<string, number>();

  const frameOf = (row: PoolRow) =>
    row.patternId ? `pattern:${row.patternId}` : `${row.source}:${row.id}`;

  while (pending.length) {
    const weights = pending.map((row) => 1 / (1 + (seen.get(frameOf(row)) ?? 0)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;
    let index = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      cursor -= weights[i];
      if (cursor <= 0) {
        index = i;
        break;
      }
    }
    const [row] = pending.splice(index, 1);
    const frame = frameOf(row);
    seen.set(frame, (seen.get(frame) ?? 0) + 1);
    picked.push(row);
  }

  return picked;
}

/** Keeps learning priority intact while randomising ties with a soft preference for new frames. */
function diversifyRanked(rows: { row: PoolRow; rank: number }[]): PoolRow[] {
  const ordered = rows.slice().sort((a, b) => a.rank - b.rank);
  const result: PoolRow[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].rank === ordered[start].rank) end++;
    result.push(...softlyDiversify(ordered.slice(start, end).map((entry) => entry.row)));
    start = end;
  }
  return result;
}

/** Same ordering as the quiz drill (see grammarDrill.ts `priority`) — LOWER is served first. */
function priority(row: PoolRow, pointDue: boolean): number {
  if (!row.clearedAt) {
    if (row.wrongs > 0) return 0;
    return row.lastSeenAt ? 2 : 1;
  }
  if (!pointDue) return 5;
  return row.wrongs > 0 ? 3 : 4;
}

export interface TranslatePick {
  items: GrammarTranslateItem[];
  /** Points dropped because they have no translation sentences yet — the UI names them. */
  empty: string[];
}

/**
 * How many candidates the random-band draw pulls before ranking, as a multiple of the session size.
 * The sample is what priority (never cleared > got wrong > seen long ago) is applied to, so it has
 * to be wide enough to contain fresh sentences, and small enough that one session stays one page of
 * rows. 5x means a 20-sentence session ranks 100 candidates.
 */
const BAND_SAMPLE_FACTOR = 5;

/**
 * RANDOM MODE — draw sentences from every point in the chosen CEFR bands.
 *
 * Deliberately NOT the per-point round-robin below: the learner asked for a mixed bag, so the unit
 * of randomness is the SENTENCE. Which points show up is whatever the draw hits.
 * SQL does the sampling (`ORDER BY RANDOM() LIMIT`) rather than JS, so a three-band session ships
 * ~100 rows to the Worker instead of the couple of thousand that live in those bands.
 */
async function pickRandomByBand(
  db: Db,
  userId: string,
  input: GrammarTranslateSessionInput,
  bands: Cefr[],
  now: Date,
): Promise<TranslatePick> {
  const sample = await db
    .select({
      id: schema.grammarTranslateItems.id,
      grammarId: schema.grammarTranslateItems.grammarId,
      cefr: schema.grammarTranslateItems.cefr,
      tier: schema.grammarTranslateItems.tier,
      source: schema.grammarTranslateItems.source,
      patternId: schema.grammarTranslateItems.patternId,
      vi: schema.grammarTranslateItems.vi,
      en: schema.grammarTranslateItems.en,
      accept: schema.grammarTranslateItems.accept,
      articleLenient: schema.grammarTranslateItems.articleLenient,
      wordBank: schema.grammarTranslateItems.wordBank,
      clearedAt: schema.userGrammarTranslateItems.clearedAt,
      lastSeenAt: schema.userGrammarTranslateItems.lastSeenAt,
      wrongs: schema.userGrammarTranslateItems.wrongs,
    })
    .from(schema.grammarTranslateItems)
    .leftJoin(
      schema.userGrammarTranslateItems,
      and(
        eq(schema.userGrammarTranslateItems.itemId, schema.grammarTranslateItems.id),
        eq(schema.userGrammarTranslateItems.userId, userId),
      ),
    )
    .where(and(inArray(schema.grammarTranslateItems.cefr, bands), eq(schema.grammarTranslateItems.status, "live")))
    .orderBy(sql`RANDOM()`)
    .limit(input.count * BAND_SAMPLE_FACTOR);
  if (!sample.length) return { items: [], empty: [] };

  const grammarIds = [...new Set(sample.map((r) => r.grammarId))];
  const [points, progress] = await Promise.all([
    db
      .select({ id: schema.grammar.id, title: schema.grammar.title })
      .from(schema.grammar)
      .where(inArray(schema.grammar.id, grammarIds)),
    db
      .select({ grammarId: schema.userGrammarProgress.grammarId, dueAt: schema.userGrammarProgress.dueAt })
      .from(schema.userGrammarProgress)
      .where(and(eq(schema.userGrammarProgress.userId, userId), inArray(schema.userGrammarProgress.grammarId, grammarIds))),
  ]);
  const nowIso = now.toISOString();
  const dueByPoint = new Map(progress.map((p) => [p.grammarId, !!p.dueAt && p.dueAt <= nowIso]));
  const cooldownBefore = new Date(now.getTime() - ITEM_COOLDOWN_DAYS * DAY_MS).toISOString();

  const picked = diversifyRanked(sample
    .map((b) => {
      const row: PoolRow = { ...b, wrongs: b.wrongs ?? 0 };
      return {
        row,
        rank:
          priority(row, dueByPoint.get(row.grammarId) ?? false) +
          (row.lastSeenAt && row.lastSeenAt > cooldownBefore ? 10 : 0),
      };
    })
  ).slice(0, input.count);

  const titleById = new Map(points.map((p) => [p.id, p.title]));
  return { items: await Promise.all(shuffle(picked).map((row) => toClientItem(row, titleById))), empty: [] };
}

export async function pickTranslateItems(
  db: Db,
  userId: string,
  input: GrammarTranslateSessionInput,
  now: Date,
): Promise<TranslatePick> {
  if (input.bands?.length) return pickRandomByBand(db, userId, input, [...new Set(input.bands)], now);
  const ids = [...new Set(input.grammarIds)];
  const points = await db
    .select({ id: schema.grammar.id, title: schema.grammar.title })
    .from(schema.grammar)
    .where(inArray(schema.grammar.id, ids));
  if (!points.length) return { items: [], empty: ids };

  const progress = await db
    .select({ grammarId: schema.userGrammarProgress.grammarId, dueAt: schema.userGrammarProgress.dueAt })
    .from(schema.userGrammarProgress)
    .where(and(eq(schema.userGrammarProgress.userId, userId), inArray(schema.userGrammarProgress.grammarId, ids)));
  const nowIso = now.toISOString();
  const dueByPoint = new Map(progress.map((p) => [p.grammarId, !!p.dueAt && p.dueAt <= nowIso]));

  const bank = await db
    .select({
      id: schema.grammarTranslateItems.id,
      grammarId: schema.grammarTranslateItems.grammarId,
      cefr: schema.grammarTranslateItems.cefr,
      tier: schema.grammarTranslateItems.tier,
      source: schema.grammarTranslateItems.source,
      patternId: schema.grammarTranslateItems.patternId,
      vi: schema.grammarTranslateItems.vi,
      en: schema.grammarTranslateItems.en,
      accept: schema.grammarTranslateItems.accept,
      articleLenient: schema.grammarTranslateItems.articleLenient,
      wordBank: schema.grammarTranslateItems.wordBank,
      clearedAt: schema.userGrammarTranslateItems.clearedAt,
      lastSeenAt: schema.userGrammarTranslateItems.lastSeenAt,
      wrongs: schema.userGrammarTranslateItems.wrongs,
    })
    .from(schema.grammarTranslateItems)
    .leftJoin(
      schema.userGrammarTranslateItems,
      and(
        eq(schema.userGrammarTranslateItems.itemId, schema.grammarTranslateItems.id),
        eq(schema.userGrammarTranslateItems.userId, userId),
      ),
    )
    .where(and(inArray(schema.grammarTranslateItems.grammarId, ids), eq(schema.grammarTranslateItems.status, "live")));

  const cooldownBefore = new Date(now.getTime() - ITEM_COOLDOWN_DAYS * DAY_MS).toISOString();
  const byPoint = new Map<string, PoolRow[]>();
  for (const b of bank) {
    const row: PoolRow = { ...b, wrongs: b.wrongs ?? 0 };
    (byPoint.get(row.grammarId) ?? byPoint.set(row.grammarId, []).get(row.grammarId)!).push(row);
  }

  const queues = new Map<string, PoolRow[]>();
  const empty: string[] = [];
  for (const p of points) {
    const pool = byPoint.get(p.id) ?? [];
    const pointDue = dueByPoint.get(p.id) ?? false;
    const ranked = diversifyRanked(shuffle(pool)
      .map((row) => ({
        row,
        // Inside the cooldown window an item goes to the back, not out, so a session can still fill
        // when every remaining item was seen recently. This mattered most when the bank held 8 items
        // per point; it now holds 30-101, but the fallback is still what keeps a session from ending
        // early on a point the learner has drilled hard.
        rank: priority(row, pointDue) + (row.lastSeenAt && row.lastSeenAt > cooldownBefore ? 10 : 0),
      })));
    if (!ranked.length) empty.push(p.id);
    else queues.set(p.id, ranked);
  }

  const live = points.filter((p) => queues.has(p.id));
  if (!live.length) return { items: [], empty };

  const picked: PoolRow[] = [];
  const perPoint = Math.ceil(input.count / live.length);
  for (let round = 0; round < perPoint && picked.length < input.count; round++) {
    for (const p of live) {
      if (picked.length >= input.count) break;
      const next = queues.get(p.id)!.shift();
      if (next) picked.push(next);
    }
  }
  if (picked.length < input.count) {
    for (const p of live) {
      const q = queues.get(p.id)!;
      while (picked.length < input.count && q.length) picked.push(q.shift()!);
    }
  }

  const titleById = new Map(points.map((p) => [p.id, p.title]));
  return { items: await Promise.all(shuffle(picked).map((row) => toClientItem(row, titleById))), empty };
}

/**
 * The masked half of a translation prompt: everything the learner may see about the English sentence
 * without receiving it. Shared with the `translate` question type inside exercises, so a sentence
 * behaves identically whether it comes from the drill bank or from an exercise.
 */
export async function translateMask(
  en: string,
  accept: string[] | null,
  articleLenient: boolean,
): Promise<{ skeleton: string; hashes: string[]; word_hashes: string[]; word_hashes_loose: string[] }> {
  return {
    skeleton: skeletonOf(en),
    hashes: await answerHashes(en, accept, articleLenient),
    word_hashes: await wordHashes(en),
    word_hashes_loose: await wordHashesLoose(en),
  };
}

/** Shape one row for the learner. `en` and `accept` stay behind; only their hashes go out. */
async function toClientItem(
  row: Pick<PoolRow, "id" | "grammarId" | "cefr" | "tier" | "vi" | "en" | "accept" | "articleLenient" | "wordBank">,
  titleById: Map<string, string>,
): Promise<GrammarTranslateItem> {
  return {
    id: row.id,
    grammar_id: row.grammarId,
    grammar_title: titleById.get(row.grammarId) ?? row.grammarId,
    cefr: row.cefr,
    tier: Math.min(3, Math.max(1, row.tier)) as 1 | 2 | 3,
    vi: row.vi,
    // Shuffled: bank order must not spell out the answer's word order.
    word_bank: row.wordBank?.length ? shuffle(row.wordBank) : null,
    skeleton: skeletonOf(row.en),
    hashes: await answerHashes(row.en, row.accept, !!row.articleLenient),
    word_hashes: await wordHashes(row.en),
    word_hashes_loose: await wordHashesLoose(row.en),
    article_lenient: !!row.articleLenient,
  };
}

/** Rebuild a saved draft in the order it was drawn, without re-drawing from the bank. */
export async function resolveTranslateItems(db: Db, itemIds: string[]): Promise<GrammarTranslateItem[]> {
  if (!itemIds.length) return [];
  const rows = await inChunks(itemIds, (chunk) =>
    db
      .select({
        id: schema.grammarTranslateItems.id,
        grammarId: schema.grammarTranslateItems.grammarId,
        cefr: schema.grammarTranslateItems.cefr,
        tier: schema.grammarTranslateItems.tier,
        vi: schema.grammarTranslateItems.vi,
        en: schema.grammarTranslateItems.en,
        accept: schema.grammarTranslateItems.accept,
        articleLenient: schema.grammarTranslateItems.articleLenient,
        wordBank: schema.grammarTranslateItems.wordBank,
        title: schema.grammar.title,
      })
      .from(schema.grammarTranslateItems)
      .innerJoin(schema.grammar, eq(schema.grammar.id, schema.grammarTranslateItems.grammarId))
      .where(and(inArray(schema.grammarTranslateItems.id, chunk), eq(schema.grammarTranslateItems.status, "live"))),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const kept = itemIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  const titleById = new Map(kept.map((r) => [r.grammarId, r.title]));
  return Promise.all(kept.map((r) => toClientItem(r, titleById)));
}

/**
 * Grade a translation session. Correctness is a plain string match against the canonical sentence
 * plus its `accept` variants — `isFillCorrect` already ignores case, spacing, curly quotes and
 * trailing punctuation, so "she didnt finish it" still passes.
 */
export async function applyTranslateSession(
  db: Db,
  userId: string,
  answers: GrammarTranslateAnswer[],
  now: Date,
): Promise<GrammarTranslateResult> {
  const nowIso = now.toISOString();
  const itemIds = [...new Set(answers.map((a) => a.item_id))];

  const items = await inChunks(itemIds, (chunk) =>
    db
      .select({
        id: schema.grammarTranslateItems.id,
        grammarId: schema.grammarTranslateItems.grammarId,
        en: schema.grammarTranslateItems.en,
        accept: schema.grammarTranslateItems.accept,
        noteVi: schema.grammarTranslateItems.noteVi,
        articleLenient: schema.grammarTranslateItems.articleLenient,
      })
      .from(schema.grammarTranslateItems)
      .where(inArray(schema.grammarTranslateItems.id, chunk)),
  );
  const itemById = new Map(items.map((i) => [i.id, i]));
  const grammarIds = [...new Set(items.map((i) => i.grammarId))];

  const [prevItems, prevProgress, grammarRows] = await Promise.all([
    inChunks(itemIds, (chunk) =>
      db
        .select()
        .from(schema.userGrammarTranslateItems)
        .where(
          and(
            eq(schema.userGrammarTranslateItems.userId, userId),
            inArray(schema.userGrammarTranslateItems.itemId, chunk),
          ),
        ),
    ),
    db
      .select()
      .from(schema.userGrammarProgress)
      .where(
        and(eq(schema.userGrammarProgress.userId, userId), inArray(schema.userGrammarProgress.grammarId, grammarIds)),
      ),
    db
      .select({ id: schema.grammar.id, title: schema.grammar.title })
      .from(schema.grammar)
      .where(inArray(schema.grammar.id, grammarIds)),
  ]);
  const prevItemById = new Map(prevItems.map((r) => [r.itemId, r]));
  const prevProgressById = new Map(prevProgress.map((r) => [r.grammarId, r]));
  const titleById = new Map(grammarRows.map((g) => [g.id, g.title]));

  const verdicts: GrammarTranslateVerdict[] = [];
  const perPoint = new Map<string, PointAgg>();
  const itemRows: (typeof schema.userGrammarTranslateItems.$inferInsert)[] = [];
  let points = 0;
  let correctCount = 0;

  for (const a of answers) {
    const item = itemById.get(a.item_id);
    if (!item) continue;
    const accepted = [item.en, ...(item.accept ?? [])];
    // The same rule as a `translate` question inside an exercise (shared/grading.ts).
    const correct = isTranslateCorrect(a.answer, accepted, !!item.articleLenient);
    const prev = prevItemById.get(item.id);
    const pointRow = prevProgressById.get(item.grammarId);
    const wasDue = !!pointRow?.dueAt && pointRow.dueAt <= nowIso;

    // A first clear only counts when it was right on the first try in this session.
    const firstClear = correct && !prev?.clearedAt && !a.retried;
    const earned = grammarItemPoints({ credit: correct ? 1 : 0, firstClear, wasDue });
    points += earned;
    if (correct) correctCount += 1;

    const agg = perPoint.get(item.grammarId) ?? { seen: 0, credit: 0, correct: 0, effective: 0 };
    agg.seen += 1;
    agg.credit += correct ? 1 : 0;
    agg.correct += correct ? 1 : 0;
    if (!prev?.clearedAt || wasDue) agg.effective += 1;
    perPoint.set(item.grammarId, agg);

    verdicts.push({
      item_id: item.id,
      grammar_id: item.grammarId,
      correct,
      first_clear: firstClear,
      points: earned,
      answer: a.answer,
      correct_answer: item.en,
      also_accepted: item.accept ?? [],
      note: item.noteVi,
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

  const { pointsState, progressRows, tierPoints } = applyPointMemory(
    perPoint,
    prevProgressById,
    titleById,
    userId,
    now,
  );
  points += tierPoints;

  for (let i = 0; i < itemRows.length; i += ITEM_UPSERT_CHUNK) {
    await db
      .insert(schema.userGrammarTranslateItems)
      .values(itemRows.slice(i, i + ITEM_UPSERT_CHUNK))
      .onConflictDoUpdate({
        target: [schema.userGrammarTranslateItems.userId, schema.userGrammarTranslateItems.itemId],
        set: {
          clearedAt: sql`coalesce(${schema.userGrammarTranslateItems.clearedAt}, excluded.cleared_at)`,
          lastSeenAt: sql`excluded.last_seen_at`,
          attempts: sql`excluded.attempts`,
          wrongs: sql`excluded.wrongs`,
        },
      });
  }
  await saveProgressRows(db, progressRows);

  // Item quality counters (p-value): a sentence everyone fails is usually keyed too narrowly.
  const seenIds = verdicts.map((v) => v.item_id);
  for (let i = 0; i < seenIds.length; i += BIND_CHUNK) {
    await db
      .update(schema.grammarTranslateItems)
      .set({ seenCount: sql`${schema.grammarTranslateItems.seenCount} + 1` })
      .where(inArray(schema.grammarTranslateItems.id, seenIds.slice(i, i + BIND_CHUNK)));
  }
  const wrongIds = verdicts.filter((v) => !v.correct).map((v) => v.item_id);
  for (let i = 0; i < wrongIds.length; i += BIND_CHUNK) {
    await db
      .update(schema.grammarTranslateItems)
      .set({ wrongCount: sql`${schema.grammarTranslateItems.wrongCount} + 1` })
      .where(inArray(schema.grammarTranslateItems.id, wrongIds.slice(i, i + BIND_CHUNK)));
  }

  const total = verdicts.length;
  const result: GrammarTranslateResult = {
    id: "",
    correct: correctCount,
    total,
    score: total > 0 ? Math.round((correctCount / total) * 100) : 0,
    points,
    verdicts,
    points_state: pointsState,
  };

  const [sub] = await db
    .insert(schema.grammarSubmissions)
    .values({
      userId,
      grammarIds,
      mode: TRANSLATE_MODE,
      correct: correctCount,
      total,
      score: result.score,
      points,
      // The column is typed for the quiz result; the shapes differ only in the verdict list, and
      // the reader branches on `mode`.
      result: result as never,
    })
    .returning({ id: schema.grammarSubmissions.id });
  result.id = sub.id;
  return result;
}

/** How many translation sentences each point has, and how many this learner has already cleared. */
export async function translateAvailability(db: Db, userId: string): Promise<GrammarTranslateAvailability[]> {
  const rows = await db
    .select({
      grammarId: schema.grammarTranslateItems.grammarId,
      title: schema.grammar.title,
      cefr: schema.grammarTranslateItems.cefr,
      total: sql<number>`count(*)`,
      cleared: sql<number>`sum(case when ${schema.userGrammarTranslateItems.clearedAt} is not null then 1 else 0 end)`,
    })
    .from(schema.grammarTranslateItems)
    .innerJoin(schema.grammar, eq(schema.grammar.id, schema.grammarTranslateItems.grammarId))
    .leftJoin(
      schema.userGrammarTranslateItems,
      and(
        eq(schema.userGrammarTranslateItems.itemId, schema.grammarTranslateItems.id),
        eq(schema.userGrammarTranslateItems.userId, userId),
      ),
    )
    .where(eq(schema.grammarTranslateItems.status, "live"))
    .groupBy(schema.grammarTranslateItems.grammarId, schema.grammar.title, schema.grammarTranslateItems.cefr);
  return rows.map((r) => ({
    grammar_id: r.grammarId,
    title: r.title,
    cefr: r.cefr,
    total: Number(r.total ?? 0),
    cleared: Number(r.cleared ?? 0),
  }));
}
