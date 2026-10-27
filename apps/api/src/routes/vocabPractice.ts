// ============================================================
//  Vocabulary for signed-in learners (requireUser). Mount: /api/v1/account/vocab.
//   - Library: the teachers' sets (read-only).
//   - My words: the learner's own list (add / edit / delete, optional AI fill).
//   - Practice: build a session, resume it, submit the result (memory schedule + points).
// ============================================================
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import {
  myVocabAddSchema,
  normalizeWordForCompare,
  vocabItemInputSchema,
  vocabSessionPatchSchema,
  vocabSessionResolveSchema,
  vocabSessionStartSchema,
  vocabSessionScore,
  vocabSubmitSchema,
  type VocabDeckResult,
  type VocabItem,
  type VocabItemInput,
  type VocabSessionResolveInput,
} from "@msyen/shared";
import { requireUser } from "../middleware/userAuth";
import { enforceRateLimit } from "../lib/rateLimit";
import { getDb, schema, type Db } from "../db";
import { inChunks } from "../lib/bind";
import { vocabItemOut } from "../lib/serialize";
import { aiFillItems, itemRow } from "../lib/vocabSets";
import { applySessionMemory, dueKeys, dueSummary, vocabMemoryStats } from "../lib/vocabMemory";
import { resolveUnlockedId } from "./library";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();
r.use("*", requireUser);

/** Most words one learner may keep in their own list. */
export const MY_VOCAB_MAX_WORDS = 3000;

const uvp = schema.userVocabProgress;

/** Learner's progress joined onto a word (by normalised word, shared across sets and own words). */
type WordState = { learned: boolean; pronBest: number | null; dueAt: string | null; miss: number };
function withState(item: VocabItem, p: { learned: boolean | null; pronBest: number | null; dueAt: string | null; miss: number | null } | null) {
  return { ...item, learned: !!p?.learned, pronBest: p?.pronBest ?? null, dueAt: p?.dueAt ?? null, miss: p?.miss ?? 0 } as VocabItem & WordState;
}

async function setBySlug(db: Db, slug: string) {
  const [set] = await db
    .select()
    .from(schema.vocabSets)
    .where(and(eq(schema.vocabSets.slug, slug), eq(schema.vocabSets.active, true)))
    .limit(1);
  if (!set) throw new HTTPException(404, { message: "Không tìm thấy bộ từ" });
  return set;
}

// ============================================================
//  LIBRARY — teachers' sets
// ============================================================

// GET /sets?level=<levelId>&q= — active sets with the learner's learned count.
r.get("/sets", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const level = c.req.query("level");
  const q = (c.req.query("q") ?? "").trim();
  const conds = [eq(schema.vocabSets.active, true)];
  if (level) conds.push(eq(schema.vocabSets.levelId, level));
  if (q) conds.push(like(schema.vocabSets.name, `%${q}%`));
  const sets = await db
    .select({ set: schema.vocabSets, levelName: schema.levels.name })
    .from(schema.vocabSets)
    .leftJoin(schema.levels, eq(schema.levels.id, schema.vocabSets.levelId))
    .where(and(...conds))
    .orderBy(asc(schema.vocabSets.position), desc(schema.vocabSets.createdAt));
  const ids = sets.map((s) => s.set.id);
  const learned = ids.length
    ? await inChunks(ids, (chunk) =>
        db
          .select({ setId: schema.vocabItems.setId, n: sql<number>`count(*)` })
          .from(schema.vocabItems)
          .innerJoin(uvp, and(eq(uvp.userId, u.id), eq(uvp.word, schema.vocabItems.wordKey), eq(uvp.learned, true)))
          .where(inArray(schema.vocabItems.setId, chunk))
          .groupBy(schema.vocabItems.setId),
      )
    : [];
  const learnedBySet = new Map(learned.map((l) => [l.setId, l.n]));
  const covers = await setCovers(c.env.DB, ids);
  return c.json({
    items: sets.map(({ set, levelName }) => ({
      id: set.id,
      slug: set.slug,
      name: set.name,
      description: set.description,
      level: set.levelId ? { id: set.levelId, name: levelName ?? "" } : null,
      wordCount: set.wordCount,
      learned: learnedBySet.get(set.id) ?? 0,
      images: covers.images.get(set.id) ?? [],
      sample: covers.sample.get(set.id) ?? [],
    })),
  });
});

/** Card art per set: its first 4 word images and first 6 words (window query, chunked by bind limit). */
async function setCovers(d1: D1Database, ids: string[]) {
  const images = new Map<string, string[]>();
  const sample = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const marks = chunk.map(() => "?").join(",");
    const [img, words] = await d1.batch<{ set_id: string; v: string }>([
      d1.prepare(
        `SELECT set_id, image AS v FROM (SELECT set_id, image, ROW_NUMBER() OVER (PARTITION BY set_id ORDER BY position) rn
           FROM vocab_items WHERE set_id IN (${marks}) AND image IS NOT NULL AND image <> '') WHERE rn <= 4`,
      ).bind(...chunk),
      d1.prepare(
        `SELECT set_id, word AS v FROM (SELECT set_id, word, ROW_NUMBER() OVER (PARTITION BY set_id ORDER BY position) rn
           FROM vocab_items WHERE set_id IN (${marks})) WHERE rn <= 6`,
      ).bind(...chunk),
    ]);
    img.results.forEach((r) => push(images, r.set_id, r.v));
    words.results.forEach((r) => push(sample, r.set_id, r.v));
  }
  return { images, sample };
}

/** Words per page on the set detail page. */
const SET_PAGE_SIZE = 100;

// GET /sets/:slug?offset=&limit=&q= — one set + a page of its words with the learner's progress,
// plus whole-set counts (learned, not yet in My words) for the hero.
r.get("/sets/:slug", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const set = await setBySlug(db, c.req.param("slug"));
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || SET_PAGE_SIZE, 1), 200);
  const q = (c.req.query("q") ?? "").trim();
  const vi = schema.vocabItems;
  const conds = [eq(vi.setId, set.id)];
  if (q) conds.push(or(like(vi.word, `%${q}%`), like(vi.meaning, `%${q}%`))!);
  const mineKeys = db.select({ k: vi.wordKey }).from(vi).where(eq(vi.userId, u.id));

  const [rows, [counts], mine] = await Promise.all([
    db
      .select({ w: vi, learned: uvp.learned, pronBest: uvp.pronBest, dueAt: uvp.dueAt, miss: uvp.missCount })
      .from(vi)
      .leftJoin(uvp, and(eq(uvp.userId, u.id), eq(uvp.word, vi.wordKey)))
      .where(and(...conds))
      .orderBy(asc(vi.position))
      .limit(limit)
      .offset(offset),
    db
      .select({
        total: sql<number>`count(*)`,
        learned: sql<number>`count(${uvp.word})`,
        unsaved: sql<number>`sum(case when ${vi.wordKey} in ${mineKeys} then 0 else 1 end)`,
      })
      .from(vi)
      .leftJoin(uvp, and(eq(uvp.userId, u.id), eq(uvp.word, vi.wordKey), eq(uvp.learned, true)))
      .where(eq(vi.setId, set.id)),
    db.select({ wordKey: vi.wordKey }).from(vi).where(eq(vi.userId, u.id)),
  ]);
  const [{ matching }] = q
    ? await db.select({ matching: sql<number>`count(*)` }).from(vi).where(and(...conds))
    : [{ matching: counts.total }];
  const saved = new Set(mine.map((m) => m.wordKey));
  const next = offset + rows.length;
  return c.json({
    set: { id: set.id, slug: set.slug, name: set.name, description: set.description, wordCount: set.wordCount },
    words: rows.map((row) => ({ ...withState(vocabItemOut(row.w), row), saved: saved.has(row.w.wordKey) })),
    total: matching,
    learned: counts.learned,
    unsaved: counts.unsaved ?? 0,
    nextOffset: next < matching ? next : null,
  });
});

// POST /sets/:slug/save — copy every word of the set the learner does not have yet into My words.
r.post("/sets/:slug/save", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const set = await setBySlug(db, c.req.param("slug"));
  const src = await db.select().from(schema.vocabItems).where(eq(schema.vocabItems.setId, set.id)).orderBy(asc(schema.vocabItems.position));
  return c.json(await addToMyWords(db, u.id, src.map(copyOfItem)));
});

// ============================================================
//  MY WORDS — the learner's own list
// ============================================================

// GET /my?q= — own words, newest first, with progress.
r.get("/my", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const q = (c.req.query("q") ?? "").trim();
  const conds = [eq(schema.vocabItems.userId, u.id)];
  if (q) conds.push(or(like(schema.vocabItems.word, `%${q}%`), like(schema.vocabItems.meaning, `%${q}%`))!);
  const rows = await db
    .select({ w: schema.vocabItems, learned: uvp.learned, pronBest: uvp.pronBest, dueAt: uvp.dueAt, miss: uvp.missCount })
    .from(schema.vocabItems)
    .leftJoin(uvp, and(eq(uvp.userId, u.id), eq(uvp.word, schema.vocabItems.wordKey)))
    .where(and(...conds))
    .orderBy(desc(schema.vocabItems.createdAt));
  return c.json({ words: rows.map((row) => withState(vocabItemOut(row.w), row)), total: rows.length, max: MY_VOCAB_MAX_WORDS });
});

// POST /my — add words (typed items, or copies of a set's words). Duplicates are skipped.
r.post("/my", async (c) => {
  const u = c.get("user");
  const parsed = myVocabAddSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  let incoming: VocabItemInput[] = parsed.data.items ?? [];
  if (parsed.data.fromItemIds?.length) {
    const src = await inChunks(parsed.data.fromItemIds, (chunk) =>
      db.select().from(schema.vocabItems).where(and(inArray(schema.vocabItems.id, chunk), isNull(schema.vocabItems.userId))),
    );
    incoming = incoming.concat(src.map(copyOfItem));
  }
  return c.json(await addToMyWords(db, u.id, incoming));
});

const copyOfItem = (s: typeof schema.vocabItems.$inferSelect): VocabItemInput => ({
  word: s.word, pos: s.pos, ipa: s.ipa, meaning: s.meaning, example: s.example, synonyms: s.synonyms, image: s.image,
});

/** Adds words to a learner's own list, skipping ones already there; enforces MY_VOCAB_MAX_WORDS. */
async function addToMyWords(db: Db, userId: string, incoming: VocabItemInput[]) {
  const u = { id: userId };
  const existing = await db.select({ wordKey: schema.vocabItems.wordKey }).from(schema.vocabItems).where(eq(schema.vocabItems.userId, u.id));
  const have = new Set(existing.map((e) => e.wordKey));
  const fresh: VocabItemInput[] = [];
  for (const it of incoming) {
    const key = normalizeWordForCompare(it.word);
    if (!key || have.has(key)) continue;
    have.add(key);
    fresh.push(it);
  }
  if (existing.length + fresh.length > MY_VOCAB_MAX_WORDS) {
    throw new HTTPException(400, { message: `Danh sách của em tối đa ${MY_VOCAB_MAX_WORDS.toLocaleString("vi-VN")} từ. Xoá bớt từ cũ rồi thêm tiếp nhé.` });
  }
  // Up to ~22 bound columns per row → 4 rows per statement stays under D1's ~100 bind parameters.
  for (let i = 0; i < fresh.length; i += 4) {
    await db.insert(schema.vocabItems).values(fresh.slice(i, i + 4).map((it) => ({ ...itemRow(it, 0), userId: u.id })));
  }
  return { added: fresh.length, skipped: incoming.length - fresh.length };
}

// POST /my/fill — AI fills meaning / IPA / example for words the learner typed (not saved yet).
r.post("/my/fill", async (c) => {
  await enforceRateLimit(c, c.env.RL_AI, "vocab-fill");
  const body = (await c.req.json().catch(() => ({}))) as { words?: unknown };
  const words = (Array.isArray(body.words) ? body.words : [])
    .filter((w): w is string => typeof w === "string" && !!w.trim())
    .slice(0, 30);
  if (!words.length) throw new HTTPException(400, { message: "Cần từ để điền" });
  const items = await aiFillItems(c.env, words.map((word) => ({ word })));
  return c.json({ items });
});

// PATCH /my/:id — edit one own word.
r.patch("/my/:id", async (c) => {
  const u = c.get("user");
  const parsed = vocabItemInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const { position: _position, ...values } = itemRow(parsed.data, 0);
  await db
    .update(schema.vocabItems)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.vocabItems.id, c.req.param("id")), eq(schema.vocabItems.userId, u.id)));
  return c.json({ ok: true });
});

// DELETE /my/:id — remove one own word (its progress stays, keyed by the word).
r.delete("/my/:id", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  await db.delete(schema.vocabItems).where(and(eq(schema.vocabItems.id, c.req.param("id")), eq(schema.vocabItems.userId, u.id)));
  return c.json({ ok: true });
});

// ============================================================
//  PRACTICE
// ============================================================

// POST /submit — store a session result + update the memory schedule.
// The score is recomputed here with the shared rule (`vocabSessionScore`); the client's is ignored.
r.post("/submit", async (c) => {
  const u = c.get("user");
  const parsed = vocabSubmitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Kết quả buổi luyện không hợp lệ" });
  const { exerciseId: slug, sessionId, result: input } = parsed.data;
  const db = getDb(c.env.DB);

  // A deck exercise must be one the learner may open (assigned, or unlocked on their path) —
  // otherwise any slug could be marked done. vocab_submissions.exercise_id references exercises.id.
  let exId: string | null = null;
  if (slug) {
    exId = await resolveUnlockedId(db, u.id, slug);
    const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, exId), columns: { vocabDeck: true } });
    if (!ex?.vocabDeck) throw new HTTPException(400, { message: "Bài này không phải bộ thẻ từ vựng" });
  }

  // Re-send of a result already stored (the response was lost): the session it closed is gone and
  // a submission for the same exercise landed moments ago → answer with that one, write nothing.
  if (sessionId) {
    const [open] = await db
      .select({ id: schema.vocabPracticeSessions.id })
      .from(schema.vocabPracticeSessions)
      .where(and(eq(schema.vocabPracticeSessions.id, sessionId), eq(schema.vocabPracticeSessions.userId, u.id)))
      .limit(1);
    if (!open) {
      const since = new Date(Date.now() - 10 * 60_000).toISOString();
      const [dup] = await db
        .select({ id: schema.vocabSubmissions.id, points: schema.vocabSubmissions.points, result: schema.vocabSubmissions.result })
        .from(schema.vocabSubmissions)
        .where(
          and(
            eq(schema.vocabSubmissions.userId, u.id),
            exId ? eq(schema.vocabSubmissions.exerciseId, exId) : isNull(schema.vocabSubmissions.exerciseId),
            sql`${schema.vocabSubmissions.submittedAt} >= ${since}`,
          ),
        )
        .orderBy(desc(schema.vocabSubmissions.submittedAt))
        .limit(1);
      const same = dup && dup.result.total === Math.max(input.total, input.perWord.length) && dup.result.perWord.length === input.perWord.length;
      if (dup && same) return c.json({ id: dup.id, points: dup.points ?? 0, memory: dup.result.memory ?? null, duplicate: true });
    }
  }

  const { score } = vocabSessionScore(input.perWord, input.progress);
  const result: VocabDeckResult = { ...input, score, total: Math.max(input.total, input.perWord.length) };

  // Memory first: the session's points are the memory progress it made, measured against the old state.
  const memory = await applySessionMemory(db, u.id, result, new Date());
  const [sub] = await db
    .insert(schema.vocabSubmissions)
    .values({
      exerciseId: exId,
      userId: u.id,
      score,
      total: result.total,
      result: { ...result, memory },
      points: memory.points,
    })
    .returning({ id: schema.vocabSubmissions.id });

  // Close the resume session server-side, so a lost client DELETE cannot leave a finished deck
  // showing as half-done on the library card (or resuming into an already submitted attempt).
  const closeConds = [eq(schema.vocabPracticeSessions.userId, u.id)];
  if (sessionId && slug) {
    closeConds.push(
      or(
        eq(schema.vocabPracticeSessions.id, sessionId),
        and(eq(schema.vocabPracticeSessions.scope, "exercise"), eq(schema.vocabPracticeSessions.scopeKey, slug)),
      )!,
    );
  } else if (sessionId) {
    closeConds.push(eq(schema.vocabPracticeSessions.id, sessionId));
  } else if (slug) {
    closeConds.push(eq(schema.vocabPracticeSessions.scope, "exercise"), eq(schema.vocabPracticeSessions.scopeKey, slug));
  }
  if (closeConds.length > 1) await db.delete(schema.vocabPracticeSessions).where(and(...closeConds));

  return c.json({ id: sub.id, points: memory.points, memory, score });
});

// GET /due — words due for review (badge).
r.get("/due", async (c) => {
  const u = c.get("user");
  return c.json(await dueSummary(getDb(c.env.DB), u.id, new Date()));
});

// GET /stats — memory numbers for the progress dashboard.
r.get("/stats", async (c) => {
  const u = c.get("user");
  return c.json(await vocabMemoryStats(getDb(c.env.DB), u.id, new Date()));
});

type PoolItem = { item: VocabItem; learned: boolean; miss: number; due: string | null };

/** Words of one scope with the learner's progress, before the mode filter. */
async function sessionPool(db: Db, userId: string, input: VocabSessionResolveInput): Promise<PoolItem[]> {
  const toPool = (row: { w: typeof schema.vocabItems.$inferSelect; learned: boolean | null; miss: number | null; due: string | null }): PoolItem => ({
    item: vocabItemOut(row.w),
    learned: !!row.learned,
    miss: row.miss ?? 0,
    due: row.due ?? null,
  });
  const cols = { w: schema.vocabItems, learned: uvp.learned, miss: uvp.missCount, due: uvp.dueAt };
  const progress = and(eq(uvp.userId, userId), eq(uvp.word, schema.vocabItems.wordKey));
  if (input.scope === "set") {
    const set = await setBySlug(db, input.scopeKey ?? "");
    const rows = await db.select(cols).from(schema.vocabItems).leftJoin(uvp, progress)
      .where(eq(schema.vocabItems.setId, set.id)).orderBy(asc(schema.vocabItems.position));
    return rows.map(toPool);
  }
  if (input.scope === "my") {
    const rows = await db.select(cols).from(schema.vocabItems).leftJoin(uvp, progress)
      .where(eq(schema.vocabItems.userId, userId)).orderBy(desc(schema.vocabItems.createdAt));
    return rows.map(toPool);
  }
  // "due": the review queue. Content comes from the learner's own words first, then any set word.
  const due = await dueKeys(db, userId, 90, new Date());
  if (!due.length) return [];
  const keys = due.map((d) => d.word);
  const rows = await db.select().from(schema.vocabItems)
    .where(and(inArray(schema.vocabItems.wordKey, keys), or(eq(schema.vocabItems.userId, userId), isNull(schema.vocabItems.userId))));
  const byKey = new Map<string, typeof rows[number]>();
  for (const row of rows) if (row.userId || !byKey.has(row.wordKey)) byKey.set(row.wordKey, row);
  const out: PoolItem[] = [];
  for (const d of due) {
    const w = byKey.get(d.word);
    if (w) out.push({ item: vocabItemOut(w), learned: true, miss: 0, due: d.dueAt });
  }
  return out;
}

/** Mode filter + order + count cap. */
function applyMode(pool: PoolItem[], mode: string, count: number): { items: VocabItem[]; available: number } {
  let f = pool;
  if (mode === "unlearned") f = pool.filter((p) => !p.learned);
  else if (mode === "review") f = pool.filter((p) => p.learned);
  else if (mode === "wrong") f = pool.filter((p) => p.miss > 0).sort((a, b) => b.miss - a.miss);
  else if (mode === "due") {
    const nowIso = new Date().toISOString();
    f = pool.filter((p) => p.due && p.due <= nowIso).sort((a, b) => a.due!.localeCompare(b.due!));
  }
  return { items: f.slice(0, count).map((p) => p.item), available: f.length };
}

// POST /session/resolve — words for (scope, mode), capped at count, plus how many are available.
r.post("/session/resolve", async (c) => {
  const u = c.get("user");
  await enforceRateLimit(c, c.env.RL_DATA, "vocab");
  const parsed = vocabSessionResolveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Cấu hình không hợp lệ" });
  const pool = await sessionPool(getDb(c.env.DB), u.id, parsed.data);
  const { items, available } = applyMode(pool, parsed.data.mode, parsed.data.count);
  return c.json({ items, available, poolTotal: pool.length });
});

// GET /session/active?scope=&scopeKey= — the unfinished session (if any) + its words to hydrate.
r.get("/session/active", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const scope = c.req.query("scope");
  const scopeKey = c.req.query("scopeKey") ?? null;
  const conds = [eq(schema.vocabPracticeSessions.userId, u.id)];
  if (scope) conds.push(eq(schema.vocabPracticeSessions.scope, scope));
  if (scopeKey) conds.push(eq(schema.vocabPracticeSessions.scopeKey, scopeKey));
  const [s] = await db.select().from(schema.vocabPracticeSessions).where(and(...conds)).orderBy(desc(schema.vocabPracticeSessions.updatedAt)).limit(1);
  if (!s) return c.json({ session: null });
  const rows = await inChunks(s.itemIds, (ids) =>
    db.select().from(schema.vocabItems)
      .where(and(inArray(schema.vocabItems.id, ids), or(isNull(schema.vocabItems.userId), eq(schema.vocabItems.userId, u.id)))),
  );
  const byId = new Map(rows.map((w) => [w.id, vocabItemOut(w)]));
  const items = s.itemIds.map((id) => byId.get(id)).filter(Boolean) as VocabItem[];
  const remaining = Math.max(0, s.state.queue.length - s.state.pos);
  return c.json({ session: { id: s.id, label: s.label, config: s.config, state: s.state, items, remaining, updatedAt: s.updatedAt } });
});

// POST /session — start/save a session (replaces the learner's previous one for the same scope).
r.post("/session", async (c) => {
  const u = c.get("user");
  const parsed = vocabSessionStartSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const b = parsed.data;
  const del = [eq(schema.vocabPracticeSessions.userId, u.id), eq(schema.vocabPracticeSessions.scope, b.scope)];
  if (b.scopeKey) del.push(eq(schema.vocabPracticeSessions.scopeKey, b.scopeKey));
  await db.delete(schema.vocabPracticeSessions).where(and(...del));
  const [row] = await db
    .insert(schema.vocabPracticeSessions)
    .values({ userId: u.id, scope: b.scope, scopeKey: b.scopeKey || null, label: b.label, config: b.config, itemIds: b.itemIds, state: b.state })
    .returning({ id: schema.vocabPracticeSessions.id });
  return c.json({ id: row.id });
});

// PATCH /session/:id — progress update (fire-and-forget from the client).
r.patch("/session/:id", async (c) => {
  const u = c.get("user");
  const parsed = vocabSessionPatchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  await db
    .update(schema.vocabPracticeSessions)
    .set({ state: parsed.data.state, updatedAt: sql`datetime('now')` })
    .where(and(eq(schema.vocabPracticeSessions.id, c.req.param("id")), eq(schema.vocabPracticeSessions.userId, u.id)));
  return c.json({ ok: true });
});

// DELETE /session/:id — finished or abandoned.
r.delete("/session/:id", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  await db
    .delete(schema.vocabPracticeSessions)
    .where(and(eq(schema.vocabPracticeSessions.id, c.req.param("id")), eq(schema.vocabPracticeSessions.userId, u.id)));
  return c.json({ ok: true });
});

export default r;
