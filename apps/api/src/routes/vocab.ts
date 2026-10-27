// ============================================================
//  Teacher vocabulary sets (requireTeacher). Mount: /api/v1/teacher/vocab.
//  A set is a named, ordered word list; the editor saves the whole list at once.
// ============================================================
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { asc, desc, eq } from "drizzle-orm";
import { normalizeWordForCompare, vocabItemInputSchema, vocabSetInputSchema, vocabSetItemsSchema } from "@msyen/shared";
import { z } from "zod";
import { runAiTask } from "../lib/ai/hub";
import { getDb, schema } from "../db";
import { vocabItemOut } from "../lib/serialize";
import { aiFillItems, replaceSetItems, uniqueSetSlug } from "../lib/vocabSets";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

const setOut = (s: typeof schema.vocabSets.$inferSelect, levelName?: string | null) => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  description: s.description,
  levelId: s.levelId,
  levelName: levelName ?? null,
  active: s.active,
  wordCount: s.wordCount,
  updatedAt: s.updatedAt,
});

// GET /sets — every set (active or not), newest first.
r.get("/sets", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ s: schema.vocabSets, levelName: schema.levels.name })
    .from(schema.vocabSets)
    .leftJoin(schema.levels, eq(schema.levels.id, schema.vocabSets.levelId))
    .orderBy(asc(schema.vocabSets.position), desc(schema.vocabSets.updatedAt));
  return c.json({ items: rows.map(({ s, levelName }) => setOut(s, levelName)) });
});

// POST /sets — create or update a set's details (not its words).
r.post("/sets", async (c) => {
  const parsed = vocabSetInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const v = parsed.data;
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();
  const slug = await uniqueSetSlug(db, v.slug?.trim() || v.name, v.id);
  const values = {
    name: v.name.trim(),
    slug,
    description: v.description?.trim() || null,
    levelId: v.levelId || null,
    ...(v.active !== undefined ? { active: v.active } : {}),
    updatedAt: now,
  };
  if (v.id) {
    const [row] = await db.update(schema.vocabSets).set(values).where(eq(schema.vocabSets.id, v.id)).returning();
    if (!row) throw new HTTPException(404, { message: "Không tìm thấy bộ từ" });
    return c.json({ set: setOut(row) });
  }
  const [row] = await db.insert(schema.vocabSets).values({ ...values, teacherId: c.get("teacher")?.id ?? null }).returning();
  return c.json({ set: setOut(row) });
});

// DELETE /sets/:id — removes the set and its words.
r.delete("/sets/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.vocabSets).where(eq(schema.vocabSets.id, c.req.param("id")));
  return c.json({ ok: true });
});

// GET /items — every word of every set, ordered by set then position.
r.get("/items", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ v: schema.vocabItems })
    .from(schema.vocabItems)
    .innerJoin(schema.vocabSets, eq(schema.vocabSets.id, schema.vocabItems.setId))
    .orderBy(asc(schema.vocabSets.position), desc(schema.vocabSets.updatedAt), asc(schema.vocabItems.position));
  return c.json({ items: rows.map(({ v }) => ({ ...vocabItemOut(v), setId: v.setId! })) });
});

// GET /sets/:id/items — the set's words, in order.
r.get("/sets/:id/items", async (c) => {
  const db = getDb(c.env.DB);
  const [set] = await db.select().from(schema.vocabSets).where(eq(schema.vocabSets.id, c.req.param("id"))).limit(1);
  if (!set) throw new HTTPException(404, { message: "Không tìm thấy bộ từ" });
  const rows = await db.select().from(schema.vocabItems).where(eq(schema.vocabItems.setId, set.id)).orderBy(asc(schema.vocabItems.position));
  return c.json({ set: setOut(set), items: rows.map(vocabItemOut) });
});

// PUT /sets/:id/items — replace the whole word list (rows keep their id when it is sent back).
r.put("/sets/:id/items", async (c) => {
  const parsed = vocabSetItemsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const [set] = await db.select({ id: schema.vocabSets.id }).from(schema.vocabSets).where(eq(schema.vocabSets.id, c.req.param("id"))).limit(1);
  if (!set) throw new HTTPException(404, { message: "Không tìm thấy bộ từ" });
  const count = await replaceSetItems(db, set.id, parsed.data.items);
  return c.json({ ok: true, wordCount: count });
});

const fillSchema = z.object({
  // Either bare words, or rows already in the editor (their filled fields are kept unless overwrite).
  words: z.array(z.string().min(1)).max(60).optional(),
  items: z.array(vocabItemInputSchema).max(60).optional(),
  context: z.string().max(200).nullish(),
  instruction: z.string().max(500).nullish(),
  overwrite: z.boolean().default(false),
});

// POST /ai-fill — AI completes entries (returned, not saved).
r.post("/ai-fill", async (c) => {
  const parsed = fillSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const v = parsed.data;
  const items = v.items?.length ? v.items : (v.words ?? []).map((word) => ({ word }));
  if (!items.length) throw new HTTPException(400, { message: "Chưa có từ nào để điền" });
  const out = await aiFillItems(c.env, items, v.context, { overwrite: v.overwrite, instruction: v.instruction });
  return c.json({ items: out });
});

const suggestSchema = z.object({
  prompt: z.string().trim().min(2, "Mô tả bộ từ cần tạo").max(1000),
  count: z.number().int().min(1).max(40).default(15),
  form: z.enum(["word", "phrase", "both"]).default("word"),
  exclude: z.array(z.string()).max(3000).default([]),
  context: z.string().max(200).nullish(),
});

// POST /ai-suggest — AI picks new words for a topic / description, then writes full entries.
r.post("/ai-suggest", async (c) => {
  const parsed = suggestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const v = parsed.data;
  const source = v.context ? `${v.prompt}\nLearner: ${v.context}` : v.prompt;
  const list = await runAiTask<{ wordlist: { word: string }[] }>(c.env, "generate_wordlist", {
    source,
    count: v.count,
    form: v.form,
    // The task takes at most 300 (the prompt lists no more); the full list still filters below.
    exclude: v.exclude.slice(0, 300),
  });
  const seen = new Set(v.exclude.map((w) => normalizeWordForCompare(w)));
  const words = (list.wordlist ?? [])
    .map((w) => w.word.trim())
    .filter((w) => w && !seen.has(normalizeWordForCompare(w)) && (seen.add(normalizeWordForCompare(w)), true));
  if (!words.length) return c.json({ items: [] });
  const items = await aiFillItems(c.env, words.map((word) => ({ word })), v.context, { instruction: v.prompt });
  return c.json({ items });
});

export default r;
