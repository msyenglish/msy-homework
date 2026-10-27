// Route GIÁO VIÊN — cổng gọi các tác vụ AI qua hub (Gemini + xoay key).
import { Hono } from "hono";
import { desc, eq, gt, ne, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { aiGenerateExerciseInputSchema, aiGenerateQuestionsInputSchema, aiGenerateReadingInputSchema, aiGenerateSpeakingInputSchema, type ExerciseInput } from "@msyen/shared";
import { getDb, schema, type Db } from "../db";
import { runAiTask } from "../lib/ai/hub";
import { AI_TASKS } from "../lib/ai/tasks";
import { grammarCatalog, grammarFocusText } from "../lib/grammarTag";
import { buildReadingUserPrompt, buildUserPrompt, buildWritingUserPrompt, composeQuizSystemPrompt, composeReadingSystemPrompt, composeWritingSystemPrompt } from "../lib/ai/prompts";
import { sanitizeExercise, sanitizeReading, sanitizeWriting } from "../lib/ai/postprocess";
import { getKeys, orderedCandidates } from "../lib/ai/keyring";
import { getRoutingConfig } from "../lib/ai/routing";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

// Nhóm 1: chấm & nhận xét bài viết/nói.
r.post("/feedback", async (c) => {
  const out = await runAiTask(c.env, "feedback", await c.req.json().catch(() => ({})));
  return c.json(out);
});

/**
 * Grammar context for the question generator, kept as SMALL as the request allows.
 *
 * The flat catalogue is 129 lines and used to go in whole on every grammar request — a few thousand
 * tokens of list the model mostly ignores. When the teacher names the points (or the CEFR bands),
 * send those only, plus the detailed description of the named ones.
 */
async function questionsGrammarContext(db: Db, body: Record<string, unknown>) {
  const ids = Array.isArray(body.grammar_ids) ? (body.grammar_ids as string[]) : [];
  const bands = Array.isArray(body.bands) ? (body.bands as string[]) : [];
  const full = await grammarCatalog(db);
  if (ids.length) {
    const want = new Set(ids);
    return { catalog: full.filter((g) => want.has(g.id)), focus: await grammarFocusText(db, ids) };
  }
  if (bands.length) {
    const want = new Set(bands);
    return { catalog: full.filter((g) => want.has(g.cefr)), focus: "" };
  }
  return { catalog: full, focus: "" };
}

// Nhóm 2: sinh câu hỏi bài tập (append vào bài đang soạn).
r.post("/questions", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { catalog, focus } = await questionsGrammarContext(getDb(c.env.DB), body);
  const out = await runAiTask(c.env, "generate_questions", { ...body, catalog, focus });
  return c.json(out);
});

// Xem trước prompt sinh CÂU HỎI (KHÔNG gọi model — 0 token). Cô copy sang AI ngoài rồi dán
// JSON trả về vào mục Câu hỏi.
r.post("/questions/prompt", async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = aiGenerateQuestionsInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const task = AI_TASKS.generate_questions;
  const { catalog, focus } = await questionsGrammarContext(getDb(c.env.DB), raw as Record<string, unknown>);
  const input = { ...parsed.data, catalog, focus };
  // `system` may be a builder for some tasks — resolve it, or the JSON ships "[object Function]".
  const system = typeof task.system === "function" ? task.system(input) : task.system;
  return c.json({ system, user: task.build(input) });
});

// Nhóm 2b: sinh TRỌN bài tập (AI Composer).
r.post("/exercise", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const db = getDb(c.env.DB);
  const catalog = await grammarCatalog(db);
  // GRAMMAR FOCUS (P1): dựng khối chi tiết từ các điểm ngữ pháp GV chọn → prompt bám sát, đáp án duy nhất đúng.
  const focus = await grammarFocusText(db, Array.isArray(body?.grammar_ids) ? body.grammar_ids : []);
  const out = await runAiTask<ExerciseInput>(c.env, "generate_exercise", { ...body, catalog, focus });
  const { exercise, dropped } = sanitizeExercise(out, new Set(catalog.map((g) => g.id)));
  // Gắn template (blueprint) theo lựa chọn của GV để bài mang đúng dạng khi lưu.
  if (typeof body?.template === "string" && body.template) exercise.template_id = body.template;
  return c.json({ exercise, dropped });
});

// Xem trước system + user prompt (KHÔNG gọi model — 0 token).
r.post("/exercise/prompt", async (c) => {
  const raw = (await c.req.json().catch(() => ({}))) as { grammar_ids?: unknown };
  const parsed = aiGenerateExerciseInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const focus = await grammarFocusText(getDb(c.env.DB), Array.isArray(raw.grammar_ids) ? (raw.grammar_ids as string[]) : []);
  return c.json({ system: composeQuizSystemPrompt(parsed.data.template, null, focus), user: buildUserPrompt(parsed.data) });
});

// Nhóm 2b': sinh TRỌN bài ĐỌC TO (reading record) — cấu trúc khác quiz.
// Tự phiên âm IPA cho đoạn văn luôn (best effort) để bài có sẵn IPA song song.
r.post("/reading", async (c) => {
  const out = await runAiTask<Record<string, unknown>>(c.env, "generate_reading", await c.req.json().catch(() => ({})));
  const { exercise } = sanitizeReading(out);
  if (exercise.passage) {
    try {
      const ipa = await runAiTask<{ lines: { text: string; ipa: string }[] }>(c.env, "generate_ipa", { passage: exercise.passage });
      if (ipa.lines?.length) exercise.passage_ipa = ipa.lines;
    } catch {
      /* IPA lỗi thì bỏ qua, không chặn việc tạo bài */
    }
  }
  return c.json({ exercise });
});

// Xem trước prompt bài đọc to.
r.post("/reading/prompt", async (c) => {
  const parsed = aiGenerateReadingInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  return c.json({ system: composeReadingSystemPrompt(), user: buildReadingUserPrompt(parsed.data) });
});

// Group 2b''': generate a whole WRITING exercise — prompt + outline + sample answer.
r.post("/writing", async (c) => {
  const out = await runAiTask<Record<string, unknown>>(c.env, "generate_writing", await c.req.json().catch(() => ({})));
  const { exercise } = sanitizeWriting(out);
  return c.json({ exercise });
});

// Xem trước prompt bài viết.
r.post("/writing/prompt", async (c) => {
  const parsed = aiGenerateSpeakingInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  return c.json({ system: composeWritingSystemPrompt(), user: buildWritingUserPrompt(parsed.data) });
});

// Phiên âm IPA đoạn văn theo câu (cho bài đọc to).
r.post("/ipa", async (c) => {
  const out = await runAiTask(c.env, "generate_ipa", await c.req.json().catch(() => ({})));
  return c.json(out);
});

// Enhance yêu cầu cho bài ĐỌC TO (song song với /refine-prompt của bài quiz).
r.post("/reading/refine-prompt", async (c) => {
  const out = await runAiTask(c.env, "refine_reading_prompt", await c.req.json().catch(() => ({})));
  return c.json(out);
});

// Nâng cấp/chuẩn hóa yêu cầu thô của giáo viên thành prompt gạch đầu dòng (tiếng Anh).
// Gợi ý GỘP Context/setting + Target vocabulary theo metadata đã chọn.
r.post("/suggest-pair", async (c) => {
  const out = await runAiTask(c.env, "suggest_pair", await c.req.json().catch(() => ({})));
  return c.json(out);
});

// Enhance yêu cầu cho bài BỘ THẺ TỪ VỰNG (không câu hỏi — chỉ tiêu chí chọn từ).
r.post("/vocab/refine-prompt", async (c) => {
  const out = await runAiTask(c.env, "refine_vocab_prompt", await c.req.json().catch(() => ({})));
  return c.json(out);
});

r.post("/refine-prompt", async (c) => {
  const out = await runAiTask(c.env, "refine_prompt", await c.req.json().catch(() => ({})));
  return c.json(out);
});

// ---- Hàng chờ tạo bài bằng AI (Cloudflare Queues) ----

/** Tạo job → đẩy vào hàng chờ → trả về ngay (không đợi AI). */
r.post("/jobs", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new HTTPException(400, { message: "Thiếu yêu cầu" });
  const published = body?.published !== false; // mặc định đăng
  const kind =
    body?.kind === "reading" ? "reading"
    : body?.kind === "writing" ? "writing"
    : body?.kind === "deck" ? "deck"
    : "quiz";
  const template = typeof body?.template === "string" && body.template ? body.template : null; // blueprint id (bài quiz)
  const assignIds: string[] = Array.isArray(body?.assign_ids) ? body.assign_ids.filter((x: unknown) => typeof x === "string") : [];
  const tagId = typeof body?.tag_id === "string" && body.tag_id ? body.tag_id : null;
  const topicId = typeof body?.topic_id === "string" && body.topic_id ? body.topic_id : null;
  const layer = body?.layer === "academic" ? "academic" : null;
  const grammarIds: string[] = Array.isArray(body?.grammar_ids) ? body.grammar_ids.filter((x: unknown) => typeof x === "string") : [];
  const genConfig = body?.gen_config && typeof body.gen_config === "object" ? (body.gen_config as Record<string, unknown>) : null;
  const overwriteId = typeof body?.exercise_id === "string" && body.exercise_id ? body.exercise_id : null;

  // Bài BỘ THẺ: teacherId do SERVER gắn (ngân hàng từ thuộc về GV đang đăng nhập) —
  // không nhận từ client, tránh nạp từ vào kho của người khác.
  if (kind === "deck" && genConfig && typeof genConfig.deckJob === "object" && genConfig.deckJob) {
    (genConfig.deckJob as Record<string, unknown>).teacherId = c.get("teacher").id;
  }

  const db = getDb(c.env.DB);
  const [job] = await db
    .insert(schema.genJobs)
    .values({ status: "queued", kind, template, grammarIds: grammarIds.length ? grammarIds : null, genConfig, overwriteId, prompt, published, assignIds: assignIds.length ? assignIds : null, tagId, topicId, layer })
    .returning({ id: schema.genJobs.id });
  await c.env.AI_QUEUE.send({ jobId: job.id });
  return c.json({ id: job.id, status: "queued" });
});

/** Danh sách job ĐANG hoạt động (queued/generating/error) để hiện card hàng chờ. */
r.get("/jobs", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.genJobs.id,
      status: schema.genJobs.status,
      title: schema.genJobs.title,
      error: schema.genJobs.error,
      exercise_id: schema.genJobs.exerciseId,
      dropped: schema.genJobs.dropped,
      created_at: schema.genJobs.createdAt,
    })
    .from(schema.genJobs)
    // Finished jobs normally drop off the list; one that lost questions stays until acknowledged,
    // otherwise the teacher never learns the exercise came out short.
    .where(or(ne(schema.genJobs.status, "done"), gt(schema.genJobs.dropped, 0)))
    .orderBy(desc(schema.genJobs.createdAt));
  return c.json({ items: rows });
});

/** Đã xem thông báo "AI bỏ N câu" → gỡ card khỏi hàng chờ. */
r.post("/jobs/:id/seen", async (c) => {
  const db = getDb(c.env.DB);
  await db.update(schema.genJobs).set({ dropped: 0 }).where(eq(schema.genJobs.id, c.req.param("id")));
  return c.json({ ok: true });
});

/** Thử lại một job lỗi. */
r.post("/jobs/:id/retry", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  await db.update(schema.genJobs).set({ status: "queued", error: null, updatedAt: new Date().toISOString() }).where(eq(schema.genJobs.id, id));
  await c.env.AI_QUEUE.send({ jobId: id });
  return c.json({ ok: true });
});

/** Xóa job khỏi hàng chờ. */
r.delete("/jobs/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.genJobs).where(eq(schema.genJobs.id, c.req.param("id")));
  return c.json({ ok: true });
});

// Nhóm 3: sinh wordlist / từ vựng.
r.post("/wordlist", async (c) => {
  const out = await runAiTask(c.env, "generate_wordlist", await c.req.json().catch(() => ({})));
  return c.json(out);
});

// Trạng thái xoay key GEMINI (chẩn đoán nhanh, dùng bởi smoke test deploy) — không lộ key thật.
// Cái nhìn đầy đủ cho MỌI provider ở GET /teacher/ai/keys (trang Cổng AI).
r.get("/status", async (c) => {
  const db = getDb(c.env.DB);
  const keys = await getKeys(c.env, db, "google");
  const configured = keys.length;
  const { default: def } = await getRoutingConfig(db);
  if (!configured) return c.json({ configured: 0, model: def.model, keys: [] });
  const order = await orderedCandidates(db, keys);
  const rows = await db.select().from(schema.aiKeyUsage);
  const byId = new Map(rows.map((x) => [x.keyId, x]));
  const now = new Date().toISOString();
  return c.json({
    configured,
    model: def.model,
    // Thứ tự sẽ dùng (key kế tiếp ở đầu), che key thật.
    keys: order.map((cand, i) => {
      const u = byId.get(cand.id);
      return {
        ref: `#${i + 1}`,
        last_used_at: u?.lastUsedAt ?? null,
        fail_count: u?.failCount ?? 0,
        cooling: !!(u?.cooldownUntil && u.cooldownUntil > now),
        cooldown_until: u?.cooldownUntil ?? null,
      };
    }),
  });
});

export default r;
