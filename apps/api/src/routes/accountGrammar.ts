// ============================================================
//  GRAMMAR DRILL for public users (requireUser) — build a session, grade it, read mastery.
//  Mount: /api/v1/account/grammar. Everything is POST for the two heavy endpoints so the edge
//  cache never sees them (Gotcha #4).
// ============================================================
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  DRILL_MODE,
  TRANSLATE_MODE,
  grammarSessionSchema,
  grammarSubmitSchema,
  grammarTranslateSessionSchema,
  grammarTranslateSubmitSchema,
} from "@msyen/shared";
import { requireUser } from "../middleware/userAuth";
import { enforceRateLimit } from "../lib/rateLimit";
import { getDb, schema } from "../db";
import {
  applyDrillSession,
  grammarMasteryState,
  grammarMemoryStats,
  pickSessionItems,
  resolveSessionItems,
} from "../lib/grammarDrill";
import {
  applyTranslateSession,
  pickTranslateItems,
  resolveTranslateItems,
  translateAvailability,
} from "../lib/grammarTranslate";
import { BIND_CHUNK } from "../lib/bind";
import type { AppEnv } from "../lib/env";

/** How many unfinished drills to keep per learner. Older ones are pruned when a new drill starts. */
const DRAFT_KEEP = 10;

const r = new Hono<AppEnv>();
r.use("*", requireUser);

// POST /session — resolve the drill. Answers are stripped from every item before it goes out.
r.post("/session", async (c) => {
  await enforceRateLimit(c, c.env.RL_DATA, "grammar");
  const u = c.get("user");
  const parsed = grammarSessionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Cấu hình không hợp lệ" });
  const db = getDb(c.env.DB);
  const input = parsed.data;

  const { items, empty } = await pickSessionItems(db, u.id, input, new Date());
  if (!items.length) throw new HTTPException(400, { message: "Chưa có câu luyện nào cho điểm ngữ pháp này." });

  // Housekeeping before adding one more: drop drafts the learner never answered (opened and
  // abandoned — nothing to resume), then keep only the newest DRAFT_KEEP.
  await db
    .delete(schema.grammarPracticeSessions)
    .where(and(eq(schema.grammarPracticeSessions.userId, u.id), eq(schema.grammarPracticeSessions.answers, {})));
  // Sliced in JS, not with `.offset()`: SQLite rejects OFFSET without a LIMIT, and Drizzle drops
  // `.limit(-1)`, so a bare offset emits invalid SQL and 500s the whole endpoint. One learner's
  // drafts are a handful of rows.
  const drafts = await db
    .select({ id: schema.grammarPracticeSessions.id })
    .from(schema.grammarPracticeSessions)
    .where(eq(schema.grammarPracticeSessions.userId, u.id))
    .orderBy(desc(schema.grammarPracticeSessions.updatedAt));
  const stale = drafts.slice(DRAFT_KEEP - 1);
  // Chunked: pruning may have never run before, so `stale` can exceed D1's bind budget.
  for (let i = 0; i < stale.length; i += BIND_CHUNK) {
    const part = stale.slice(i, i + BIND_CHUNK).map((s) => s.id);
    await db.delete(schema.grammarPracticeSessions).where(inArray(schema.grammarPracticeSessions.id, part));
  }

  // Persist the drawn session immediately: the items' cooldown is already spent, so if the
  // learner closes the tab we must be able to hand the SAME items back rather than burn them.
  const [saved] = await db.insert(schema.grammarPracticeSessions).values({
    userId: u.id,
    label: [...new Set(items.map((i) => i.grammar_title))].join(" · ").slice(0, 200),
    grammarIds: input.grammarIds,
    itemIds: items.map((i) => i.id),
    answers: {},
    total: items.length,
  }).returning({ id: schema.grammarPracticeSessions.id });

  return c.json({
    session_id: saved.id,
    items,
    config: input,
    empty,
  });
});

// POST /submit — grade server-side, move the memory state, award the non-farmable points.
r.post("/submit", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { session_id?: string };
  const parsed = grammarSubmitSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Thiếu bài làm" });
  const db = getDb(c.env.DB);
  const result = await applyDrillSession(db, u.id, parsed.data.answers, DRILL_MODE, new Date());
  // The draft is spent once the session is graded.
  if (body.session_id) {
    await db.delete(schema.grammarPracticeSessions).where(
      and(eq(schema.grammarPracticeSessions.id, body.session_id), eq(schema.grammarPracticeSessions.userId, u.id)),
    );
  }
  return c.json(result);
});

// ── Graded sessions: history list + one report ──

// GET /submissions — the history drawer on /u/grammar.
r.get("/submissions", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.grammarSubmissions.id,
      mode: schema.grammarSubmissions.mode,
      grammarIds: schema.grammarSubmissions.grammarIds,
      correct: schema.grammarSubmissions.correct,
      total: schema.grammarSubmissions.total,
      score: schema.grammarSubmissions.score,
      points: schema.grammarSubmissions.points,
      submittedAt: schema.grammarSubmissions.submittedAt,
    })
    .from(schema.grammarSubmissions)
    .where(eq(schema.grammarSubmissions.userId, u.id))
    .orderBy(desc(schema.grammarSubmissions.submittedAt))
    .limit(50);
  const ids = [...new Set(rows.flatMap((r) => r.grammarIds ?? []))];
  const titles = new Map<string, string>();
  if (ids.length) {
    for (const g of await db.select({ id: schema.grammar.id, title: schema.grammar.title }).from(schema.grammar).where(inArray(schema.grammar.id, ids))) {
      titles.set(g.id, g.title);
    }
  }
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      label: (r.grammarIds ?? []).map((g) => titles.get(g) ?? g).join(" · "),
      correct: r.correct,
      total: r.total,
      score: r.score,
      points: r.points,
      submitted_at: r.submittedAt,
    })),
  });
});

// GET /submissions/:id — one graded session, with the sentences resolved so the report can show
// the question next to each verdict. The stored `result` only keeps item ids.
r.get("/submissions/:id", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const row = await db.query.grammarSubmissions.findFirst({
    where: and(eq(schema.grammarSubmissions.id, c.req.param("id")), eq(schema.grammarSubmissions.userId, u.id)),
  });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy lượt luyện này." });
  const result = row.result;
  const ids = (result?.verdicts ?? []).map((v) => v.item_id);
  // Branch on mode: the two drills keep their sentences in different tables, and the id spaces are
  // disjoint. Resolving a translation session against `grammar_items` silently returned an empty
  // list, so the report rendered with no prompts at all.
  const translate = row.mode === TRANSLATE_MODE;
  // A report needs the prompt, not the scaffolding — resolve at the rung that adds none.
  const items = translate ? [] : await resolveSessionItems(db, ids);
  const translateItems = translate ? await resolveTranslateItems(db, ids) : [];
  return c.json({
    id: row.id,
    mode: row.mode,
    submitted_at: row.submittedAt,
    correct: row.correct,
    total: row.total,
    score: row.score,
    points: row.points,
    result,
    items,
    translate_items: translateItems,
  });
});

// ── Unfinished drills ──

// GET /sessions — the resume list shown under the item-count slider.
r.get("/sessions", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.grammarPracticeSessions.id,
      label: schema.grammarPracticeSessions.label,
      grammarIds: schema.grammarPracticeSessions.grammarIds,
      answers: schema.grammarPracticeSessions.answers,
      total: schema.grammarPracticeSessions.total,
      updatedAt: schema.grammarPracticeSessions.updatedAt,
    })
    .from(schema.grammarPracticeSessions)
    .where(and(eq(schema.grammarPracticeSessions.userId, u.id), eq(schema.grammarPracticeSessions.mode, DRILL_MODE)))
    .orderBy(desc(schema.grammarPracticeSessions.updatedAt))
    .limit(DRAFT_KEEP);
  return c.json({
    // A draft with zero answers is just an abandoned open — nothing to pick up.
    items: rows.filter((r) => Object.keys(r.answers ?? {}).length > 0).map((r) => ({
      id: r.id,
      label: r.label,
      grammar_ids: r.grammarIds,
      answered: Object.keys(r.answers ?? {}).length,
      total: r.total,
      updated_at: r.updatedAt,
    })),
  });
});

// GET /sessions/:id — reopen a draft with the SAME items in the SAME order.
r.get("/sessions/:id", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const row = await db.query.grammarPracticeSessions.findFirst({
    where: and(
      eq(schema.grammarPracticeSessions.id, c.req.param("id")),
      eq(schema.grammarPracticeSessions.userId, u.id),
      eq(schema.grammarPracticeSessions.mode, DRILL_MODE),
    ),
  });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy buổi luyện đang dở." });
  const items = await resolveSessionItems(db, row.itemIds);
  if (!items.length) throw new HTTPException(410, { message: "Các câu của buổi này không còn nữa." });
  return c.json({ session_id: row.id, items, answers: row.answers ?? {} });
});

// PATCH /sessions/:id — autosave answers as the learner works.
r.patch("/sessions/:id", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { answers?: Record<string, string> };
  const db = getDb(c.env.DB);
  await db
    .update(schema.grammarPracticeSessions)
    .set({ answers: body.answers ?? {}, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.grammarPracticeSessions.id, c.req.param("id")), eq(schema.grammarPracticeSessions.userId, u.id)));
  return c.json({ ok: true });
});

r.delete("/sessions/:id", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  await db
    .delete(schema.grammarPracticeSessions)
    .where(and(eq(schema.grammarPracticeSessions.id, c.req.param("id")), eq(schema.grammarPracticeSessions.userId, u.id)));
  return c.json({ ok: true });
});

// GET /state — mastery + due badge for the grammar handbook page.
r.get("/state", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const now = new Date();
  const items = await grammarMasteryState(db, u.id, now);
  return c.json({
    items,
    due: items.filter((i) => i.due).length,
    marked: items.filter((i) => i.marked).length,
  });
});

// GET /stats — memory panel on /u/progress (twin of /account/vocab/stats).
r.get("/stats", async (c) => {
  const u = c.get("user");
  return c.json(await grammarMemoryStats(getDb(c.env.DB), u.id, new Date()));
});

// ── Translation drill (Vietnamese -> English). Separate bank, shared memory state.
// ──

// GET /translate/state — which points have translation sentences, for the entry point.
r.get("/translate/state", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const items = await translateAvailability(db, u.id);
  return c.json({
    items,
    total: items.reduce((a, i) => a + i.total, 0),
  });
});

// POST /translate/session — draw a session. The English answers never leave the server.
r.post("/translate/session", async (c) => {
  await enforceRateLimit(c, c.env.RL_DATA, "grammar");
  const u = c.get("user");
  const parsed = grammarTranslateSessionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Cấu hình không hợp lệ" });
  const db = getDb(c.env.DB);
  const input = parsed.data;

  const { items, empty } = await pickTranslateItems(db, u.id, input, new Date());
  if (!items.length) {
    throw new HTTPException(400, {
      message: input.bands?.length
        ? "Chưa có câu dịch nào ở cấp độ em chọn."
        : "Chưa có câu dịch nào cho điểm ngữ pháp này.",
    });
  }

  await db
    .delete(schema.grammarPracticeSessions)
    .where(and(eq(schema.grammarPracticeSessions.userId, u.id), eq(schema.grammarPracticeSessions.answers, {})));

  const [saved] = await db.insert(schema.grammarPracticeSessions).values({
    userId: u.id,
    mode: TRANSLATE_MODE,
    level: input.level,
    // A random session can span 15+ points, so listing their titles would fill the resume row with
    // an unreadable string. Name it by what the learner actually chose: the bands.
    label: input.bands?.length
      ? `Ngẫu nhiên · ${input.bands.join(" · ")}`.slice(0, 200)
      : [...new Set(items.map((i) => i.grammar_title))].join(" · ").slice(0, 200),
    // Random mode has no chosen points — record the ones the draw landed on, so a resumed draft and
    // the report still know which points the session covered.
    grammarIds: input.bands?.length ? [...new Set(items.map((i) => i.grammar_id))] : input.grammarIds,
    itemIds: items.map((i) => i.id),
    answers: {},
    total: items.length,
  }).returning({ id: schema.grammarPracticeSessions.id });

  return c.json({
    session_id: saved.id,
    items,
    config: input,
    empty,
  });
});

// GET /translate/sessions — unfinished translation drafts. Its own list: /sessions is filtered to
// the quiz mode, so a translation draft was previously only reachable by its URL.
r.get("/translate/sessions", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.grammarPracticeSessions.id,
      label: schema.grammarPracticeSessions.label,
      grammarIds: schema.grammarPracticeSessions.grammarIds,
      answers: schema.grammarPracticeSessions.answers,
      total: schema.grammarPracticeSessions.total,
      updatedAt: schema.grammarPracticeSessions.updatedAt,
    })
    .from(schema.grammarPracticeSessions)
    .where(and(eq(schema.grammarPracticeSessions.userId, u.id), eq(schema.grammarPracticeSessions.mode, TRANSLATE_MODE)))
    .orderBy(desc(schema.grammarPracticeSessions.updatedAt))
    .limit(DRAFT_KEEP);
  return c.json({
    // A draft with zero answers is just an abandoned open — nothing to pick up.
    items: rows.filter((r) => Object.keys(r.answers ?? {}).length > 0).map((r) => ({
      id: r.id,
      label: r.label,
      grammar_ids: r.grammarIds,
      answered: Object.keys(r.answers ?? {}).length,
      total: r.total,
      updated_at: r.updatedAt,
    })),
  });
});

// GET /translate/sessions/:id — reopen a draft with the SAME sentences in the SAME order.
r.get("/translate/sessions/:id", async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const row = await db.query.grammarPracticeSessions.findFirst({
    where: and(
      eq(schema.grammarPracticeSessions.id, c.req.param("id")),
      eq(schema.grammarPracticeSessions.userId, u.id),
      eq(schema.grammarPracticeSessions.mode, TRANSLATE_MODE),
    ),
  });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy buổi luyện đang dở." });
  // The rung is a display choice the learner can change mid-session, so the draft only carries it
  // as the level to OPEN at; the item payload itself is rung-independent.
  const items = await resolveTranslateItems(db, row.itemIds);
  if (!items.length) throw new HTTPException(410, { message: "Các câu của buổi này không còn nữa." });
  return c.json({ session_id: row.id, level: row.level ?? "easy", items, answers: row.answers ?? {} });
});

/**
 * POST /translate/sessions/:id/answer — the English sentence for ONE item of ONE session.
 *
 * The drill colours each character the learner types, which cannot be done from a hash. Handing the
 * sentence over one at a time, only for the item the learner has actually opened, keeps a whole
 * session's answers from arriving in a single payload. POST so the edge cache never sees it
 * (see CLAUDE.md gotcha #4).
 */
r.post("/translate/sessions/:id/answer", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { item_id?: string };
  const itemId = typeof body.item_id === "string" ? body.item_id : "";
  if (!itemId) throw new HTTPException(400, { message: "Thiếu mã câu." });
  const db = getDb(c.env.DB);
  const row = await db.query.grammarPracticeSessions.findFirst({
    where: and(
      eq(schema.grammarPracticeSessions.id, c.req.param("id")),
      eq(schema.grammarPracticeSessions.userId, u.id),
      eq(schema.grammarPracticeSessions.mode, TRANSLATE_MODE),
    ),
  });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy buổi luyện." });
  // Only items this session actually drew: the id alone must not open the whole bank.
  if (!row.itemIds.includes(itemId)) throw new HTTPException(403, { message: "Câu này không thuộc buổi luyện." });
  const item = await db.query.grammarTranslateItems.findFirst({
    where: eq(schema.grammarTranslateItems.id, itemId),
  });
  if (!item) throw new HTTPException(404, { message: "Câu này không còn nữa." });
  return c.json({ item_id: itemId, en: item.en });
});

// POST /translate/submit — grade server-side, move the shared per-point memory state.
r.post("/translate/submit", async (c) => {
  const u = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { session_id?: string };
  const parsed = grammarTranslateSubmitSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Thiếu bài làm" });
  const db = getDb(c.env.DB);
  let answers = parsed.data.answers;
  const session = body.session_id
    ? await db.query.grammarPracticeSessions.findFirst({
        where: and(
          eq(schema.grammarPracticeSessions.id, body.session_id),
          eq(schema.grammarPracticeSessions.userId, u.id),
          eq(schema.grammarPracticeSessions.mode, TRANSLATE_MODE),
        ),
      })
    : null;
  if (session) {
    // A skipped sentence is a wrong sentence: grade every item the session drew, not just the ones
    // that came back. Otherwise doing 1 of 8 and submitting would score 100%.
    const sent = new Map(answers.map((a) => [a.item_id, a]));
    answers = session.itemIds.map((id) => sent.get(id) ?? { item_id: id, answer: "" });
  }
  const result = await applyTranslateSession(db, u.id, answers, new Date());
  if (session) {
    await db.delete(schema.grammarPracticeSessions).where(
      and(eq(schema.grammarPracticeSessions.id, session.id), eq(schema.grammarPracticeSessions.userId, u.id)),
    );
  }
  return c.json(result);
});

export default r;
