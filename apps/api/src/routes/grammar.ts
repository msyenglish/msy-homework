// Teacher routes for the grammar handbook (CRUD) and each point's practice bank:
// drill items (copied from tagged exercise questions) and Vietnamese → English sentences.
// Learners read the handbook through GET /grammar (public.ts). `id` is the author's slug.
import { Hono } from "hono";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { grammarDrillItemSchema, grammarDrillItemsSchema, grammarInputSchema, grammarTranslateItemsSchema, type GrammarDrillItemInput, type Question } from "@msyen/shared";
import { getDb, schema } from "../db";
import { grammarOut } from "../lib/serialize";
import { BIND_CHUNK } from "../lib/bind";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const [rows, drill, translate] = await Promise.all([
    db.select().from(schema.grammar).orderBy(asc(schema.grammar.position), asc(schema.grammar.createdAt)),
    db
      .select({ id: schema.grammarItems.grammarId, n: count() })
      .from(schema.grammarItems)
      .where(eq(schema.grammarItems.status, "live"))
      .groupBy(schema.grammarItems.grammarId),
    db
      .select({ id: schema.grammarTranslateItems.grammarId, n: count() })
      .from(schema.grammarTranslateItems)
      .where(eq(schema.grammarTranslateItems.status, "live"))
      .groupBy(schema.grammarTranslateItems.grammarId),
  ]);
  const drillBy = new Map(drill.map((d) => [d.id, d.n]));
  const translateBy = new Map(translate.map((d) => [d.id, d.n]));
  return c.json({
    items: rows.map((g) => ({ ...grammarOut(g), drill_count: drillBy.get(g.id) ?? 0, translate_count: translateBy.get(g.id) ?? 0 })),
  });
});

// Create or update (upsert by slug id). Used both by the editor and by seeding.
r.post("/", async (c) => {
  const parsed = grammarInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const v = parsed.data;
  const db = getDb(c.env.DB);
  const values = {
    id: v.id,
    title: v.title.trim(),
    category: v.category.trim(),
    cefr: v.cefr,
    summary: v.summary.trim(),
    forms: v.forms,
    signals: v.signals ?? null,
    usage: v.usage,
    spelling: v.spelling ?? null,
    examples: v.examples,
    mistakes: v.mistakes ?? null,
    tips: v.tips ?? null,
    compare: v.compare ?? null,
    related: v.related ?? null,
    keywords: v.keywords ?? null,
    bank: v.bank ?? null,
    position: v.position ?? 0,
  };
  const existing = await db.query.grammar.findFirst({ where: eq(schema.grammar.id, v.id) });
  if (existing) {
    const { id: _id, ...rest } = values;
    await db.update(schema.grammar).set(rest).where(eq(schema.grammar.id, v.id));
  } else {
    await db.insert(schema.grammar).values(values);
  }
  return c.json({ id: v.id });
});

r.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.grammar).where(eq(schema.grammar.id, c.req.param("id")));
  return c.json({ ok: true });
});

/** Question-shaped payload for a drill item authored on this page. */
function drillPayload(q: GrammarDrillItemInput, grammarId: string): Question {
  return {
    position: 0,
    type: q.type,
    question: q.question,
    options: q.type === "multiple_choice" ? q.options : null,
    answer: q.type === "fill_blank" ? null : q.answer,
    accept: q.accept?.length ? q.accept : null,
    tokens: q.type === "ordering" ? q.tokens : null,
    word_bank: q.word_bank?.length ? q.word_bank : null,
    explanation: q.explanation?.trim() || null,
    grammar_id: grammarId,
  };
}

// GET /:id/practice — the point's drill items and translation sentences.
r.get("/:id/practice", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const [drill, translate] = await Promise.all([
    db
      .select({
        id: schema.grammarItems.id,
        type: schema.grammarItems.type,
        payload: schema.grammarItems.payload,
        source: schema.grammarItems.source,
        createdAt: schema.grammarItems.createdAt,
        exerciseSlug: schema.exercises.exerciseId,
        exerciseTitle: schema.exercises.title,
      })
      .from(schema.grammarItems)
      .leftJoin(schema.questions, eq(schema.questions.id, schema.grammarItems.questionId))
      .leftJoin(schema.exercises, eq(schema.exercises.id, schema.questions.exerciseId))
      .where(and(eq(schema.grammarItems.grammarId, id), eq(schema.grammarItems.status, "live")))
      .orderBy(desc(schema.grammarItems.createdAt)),
    db
      .select()
      .from(schema.grammarTranslateItems)
      .where(and(eq(schema.grammarTranslateItems.grammarId, id), eq(schema.grammarTranslateItems.status, "live")))
      .orderBy(desc(schema.grammarTranslateItems.createdAt)),
  ]);
  return c.json({
    drill: drill.map((d) => ({
      id: d.id,
      type: d.type,
      question: d.payload.question,
      answer: d.payload.answer ?? d.payload.accept?.[0] ?? null,
      options: d.payload.options ?? null,
      accept: d.payload.accept ?? null,
      tokens: d.payload.tokens ?? null,
      explanation: d.payload.explanation ?? null,
      source: d.source,
      createdAt: d.createdAt,
      exercise: d.exerciseSlug ? { slug: d.exerciseSlug, title: d.exerciseTitle ?? d.exerciseSlug } : null,
    })),
    translate: translate.map((t) => ({ id: t.id, vi: t.vi, en: t.en, accept: t.accept ?? [], noteVi: t.noteVi, createdAt: t.createdAt })),
  });
});

// POST /:id/drill — add drill items authored here (not tied to an exercise question).
r.post("/:id/drill", async (c) => {
  const parsed = grammarDrillItemsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const point = await db.query.grammar.findFirst({ where: eq(schema.grammar.id, id) });
  if (!point) throw new HTTPException(404, { message: "Không tìm thấy điểm ngữ pháp" });
  const rows = parsed.data.items.map((q) => ({ grammarId: id, cefr: point.cefr, type: q.type, payload: drillPayload(q, id), status: "live", source: "teacher" }));
  // Few columns per row, but stay well under D1's bind-parameter cap.
  for (let i = 0; i < rows.length; i += 10) await db.insert(schema.grammarItems).values(rows.slice(i, i + 10));
  return c.json({ ok: true, count: rows.length });
});

// PUT /:id/drill/:itemId — edit one drill item authored here; exercise-copied items are edited in their exercise.
r.put("/:id/drill/:itemId", async (c) => {
  const parsed = grammarDrillItemSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const where = and(eq(schema.grammarItems.id, c.req.param("itemId")), eq(schema.grammarItems.grammarId, id));
  const item = await db.query.grammarItems.findFirst({ where });
  if (!item) throw new HTTPException(404, { message: "Không tìm thấy câu drill" });
  if (item.questionId) throw new HTTPException(400, { message: "Câu này lấy từ bài tập — hãy sửa trong bài gốc" });
  await db.update(schema.grammarItems).set({ type: parsed.data.type, payload: drillPayload(parsed.data, id) }).where(where);
  return c.json({ ok: true });
});

// DELETE /:id/drill/:itemId — drop one drill item (its exercise question stays).
r.delete("/:id/drill/:itemId", async (c) => {
  const db = getDb(c.env.DB);
  await db
    .delete(schema.grammarItems)
    .where(and(eq(schema.grammarItems.id, c.req.param("itemId")), eq(schema.grammarItems.grammarId, c.req.param("id"))));
  return c.json({ ok: true });
});

// PUT /:id/translate — replace the point's translation sentences (rows keep their id when sent back).
r.put("/:id/translate", async (c) => {
  const parsed = grammarTranslateItemsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const point = await db.query.grammar.findFirst({ where: eq(schema.grammar.id, id) });
  if (!point) throw new HTTPException(404, { message: "Không tìm thấy điểm ngữ pháp" });
  const items = parsed.data.items;
  const keep = new Set(items.map((i) => i.id).filter((x): x is string => !!x));
  const existing = await db.select({ id: schema.grammarTranslateItems.id }).from(schema.grammarTranslateItems).where(eq(schema.grammarTranslateItems.grammarId, id));
  const drop = existing.map((e) => e.id).filter((x) => !keep.has(x));
  for (let i = 0; i < drop.length; i += BIND_CHUNK) {
    await db.delete(schema.grammarTranslateItems).where(inArray(schema.grammarTranslateItems.id, drop.slice(i, i + BIND_CHUNK)));
  }
  for (const it of items) {
    const values = {
      vi: it.vi,
      en: it.en,
      accept: it.accept?.length ? it.accept : null,
      noteVi: it.noteVi?.trim() || null,
    };
    if (it.id) {
      await db.update(schema.grammarTranslateItems).set(values).where(and(eq(schema.grammarTranslateItems.id, it.id), eq(schema.grammarTranslateItems.grammarId, id)));
    } else {
      await db.insert(schema.grammarTranslateItems).values({ ...values, grammarId: id, cefr: point.cefr, status: "live", source: "teacher" });
    }
  }
  return c.json({ ok: true, count: items.length });
});

export default r;
