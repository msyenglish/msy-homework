// Route GIÁO VIÊN — quản lý Thư viện bài tập (yêu cầu đăng nhập).
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  correctAnswerText,
  exerciseInputSchema,
  exerciseIssues,
  gradeSubmission,
  publicSegment,
  type Skill,
  type PublicExercise,
  type PublicVideoLesson,
  type VideoMode,
} from "@msyen/shared";
import { getDb, schema } from "../db";
import {
  exerciseOut,
  fullQuestion,
  levelOut,
  publicQuestion,
} from "../lib/serialize";
import { inChunks } from "../lib/bind";
import { grammarNotesFor } from "../lib/grammarNotes";
import { dictationPublicFields } from "../lib/dictation";
import { resolveVocabDeck } from "../lib/vocabResolve";
import { saveExercise } from "../lib/saveExercise";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

/**
 * Danh sách bài (kèm số câu). LỌC + PHÂN TRANG Ở SERVER — thư viện có thể lên hàng nghìn bài,
 * tải hết một lượt vừa nặng D1 vừa nghẽn trang. Không truyền `per_page` → trả TẤT CẢ.
 * `fields=pick`: every exercise with only what an assign picker shows — no topic join, no
 * per-exercise counts (those group over the whole submissions/assignments tables).
 * Query: q · skill · status(published|draft) · level · topic_id · tag_id · page · per_page · fields.
 */
r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const qs = c.req.query();
  const kw = (qs.q ?? "").trim().toLowerCase();
  const perPage = Math.min(Math.max(Number(qs.per_page) || 0, 0), 200);
  const page = Math.max(Number(qs.page) || 1, 1);

  // Điều kiện lọc dùng CHUNG cho truy vấn trang và truy vấn đếm.
  const filters: SQL[] = [isNull(schema.exercises.deletedAt)];
  if (qs.skill) filters.push(eq(schema.exercises.skill, qs.skill as Skill));
  if (qs.status === "published") filters.push(eq(schema.exercises.published, true));
  if (qs.status === "draft") filters.push(eq(schema.exercises.published, false));
  if (qs.level) filters.push(eq(schema.exercises.level, qs.level));
  // Topic filter covers the whole branch: an exercise stores ONE topic_id (often a child), so
  // filtering by a parent must also return the exercises tagged with its children.
  if (qs.topic_id)
    filters.push(
      sql`(${schema.exercises.topicId} = ${qs.topic_id} or ${schema.exercises.topicId} in (
        select id from topics where parent_id = ${qs.topic_id}
      ))`,
    );
  if (qs.tag_id) filters.push(eq(schema.exercises.tagId, qs.tag_id));
  // Tìm theo tiêu đề HOẶC từ khoá trong cột tags (JSON) — khớp cách tìm cũ ở client.
  if (kw)
    filters.push(
      sql`(lower(${schema.exercises.title}) like ${"%" + kw + "%"} or exists (
        select 1 from json_each(${schema.exercises.tags}) where lower(json_each.value) like ${"%" + kw + "%"}
      ))`,
    );
  if (qs.fields === "pick") {
    const items = await db
      .select({
        exercise_id: schema.exercises.exerciseId,
        title: schema.exercises.title,
        skill: schema.exercises.skill,
        level: schema.exercises.level,
        published: schema.exercises.published,
      })
      .from(schema.exercises)
      .where(and(...filters))
      .orderBy(desc(schema.exercises.createdAt));
    return c.json({ items });
  }
  const rows = await db
    .select({
      id: schema.exercises.id,
      exercise_id: schema.exercises.exerciseId,
      title: schema.exercises.title,
      published: schema.exercises.published,
      skill: schema.exercises.skill,
      level: schema.exercises.level,
      tags: schema.exercises.tags,
      // Chủ đề (join topics) — dùng cho badge + filter ở thư viện giáo viên.
      topic_id: schema.exercises.topicId,
      // NHÃN của cô — cần cho badge + bộ lọc nhãn ở thư viện (thiếu thì lọc ra rỗng).
      tag_id: schema.exercises.tagId,
      topic_name: schema.topics.name,
      topic_color: schema.topics.color,
      topic_icon: schema.topics.icon,
      read_aloud: schema.exercises.readAloud,
      video: schema.exercises.video,
      template_id: schema.exercises.templateId,
      wordlist: schema.exercises.wordlist,
      created_at: schema.exercises.createdAt,
      // Video lessons (dictation/shadowing) have no `questions` — their unit is the segment.
      segment_count: sql<number | null>`case when ${schema.exercises.videoSegments} is null then null
        else json_array_length(${schema.exercises.videoSegments}) end`,
      // Bài VIẾT: đề bài là nội dung duy nhất → thẻ bài cần nó để biết bài đã có nội dung chưa
      // và suy ra số từ yêu cầu. Chỉ trả cho skill=writing cho nhẹ payload.
      speaking_prompt: sql<
        string | null
      >`case when ${schema.exercises.skill} = 'writing' then ${schema.exercises.speakingPrompt} end`,
      // Bài BỘ THẺ từ vựng không có câu hỏi → thẻ bài phải đếm TỪ. Nguồn "fixed" đếm wordIds;
      // nguồn "filter" (bốc ngẫu nhiên trong kho) lấy số từ mỗi lượt. NULL = không phải bộ thẻ.
      deck_words: sql<number | null>`case when ${schema.exercises.vocabDeck} is null then null else coalesce(
        json_array_length(json_extract(${schema.exercises.vocabDeck}, '$.wordIds')),
        json_extract(${schema.exercises.vocabDeck}, '$.filter.count'),
        0) end`,
    })
    .from(schema.exercises)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.exercises.topicId))
    .where(and(...filters))
    .orderBy(desc(schema.exercises.createdAt))
    .limit(perPage || -1)
    .offset(perPage ? (page - 1) * perPage : 0);

  // Per-exercise aggregates, scoped to the ids ON THIS PAGE. Joining them as grouped subqueries
  // made every list load group over the whole `questions` / `user_assignments` / `submissions`
  // tables regardless of pagination. `null` slice = caller asked for the entire library, where
  // the id list would blow past D1's bound-parameter budget, so group over the table instead.
  const pageIds = rows.map((x) => x.id);
  const perPageScope = perPage ? pageIds : null;
  const scopedAgg = async <T>(run: (ids: string[] | null) => Promise<T[]>): Promise<T[]> =>
    perPageScope ? inChunks(perPageScope, (slice) => run(slice)) : run(null);

  const [qRows, aRows, cRows, sRows, vRows] = await Promise.all([
    scopedAgg((ids) =>
      db
        .select({ exerciseId: schema.questions.exerciseId, n: sql<number>`count(*)` })
        .from(schema.questions)
        .where(ids ? inArray(schema.questions.exerciseId, ids) : undefined)
        .groupBy(schema.questions.exerciseId),
    ),
    // Counts learners this exercise was assigned to INDIVIDUALLY (user_assignments). Class-wide
    // assignments are excluded on purpose — those show up in the classroom drawer instead.
    scopedAgg((ids) =>
      db
        .select({
          exerciseId: schema.userAssignments.exerciseId,
          n: sql<number>`count(*)`,
          // Names joined into one "|"-separated string (D1/SQLite has no arrays); client splits it.
          names: sql<string | null>`group_concat(coalesce(${schema.users.name}, ${schema.users.email}), '|')`,
        })
        .from(schema.userAssignments)
        .innerJoin(schema.users, eq(schema.users.id, schema.userAssignments.userId))
        .where(ids ? inArray(schema.userAssignments.exerciseId, ids) : undefined)
        .groupBy(schema.userAssignments.exerciseId),
    ),
    // Classes the exercise was assigned to as a WHOLE (class_assignments) — a separate channel from
    // the per-learner one above, and the only place a class-wide assignment is visible on the card.
    scopedAgg((ids) =>
      db
        .select({
          exerciseId: schema.classAssignments.exerciseId,
          n: sql<number>`count(*)`,
          names: sql<string | null>`group_concat(${schema.classes.name}, '|')`,
        })
        .from(schema.classAssignments)
        .innerJoin(schema.classes, eq(schema.classes.id, schema.classAssignments.classId))
        .where(ids ? inArray(schema.classAssignments.exerciseId, ids) : undefined)
        .groupBy(schema.classAssignments.exerciseId),
    ),
    scopedAgg((ids) =>
      db
        .select({
          exerciseId: schema.submissions.exerciseId,
          attempts: sql<number>`count(*)`,
          avgPct: sql<
            number | null
          >`round(avg(${schema.submissions.score} * 100.0 / nullif(${schema.submissions.total}, 0)))`,
        })
        .from(schema.submissions)
        .where(ids ? inArray(schema.submissions.exerciseId, ids) : undefined)
        .groupBy(schema.submissions.exerciseId),
    ),
    // Vocab-deck exercises submit to vocab_submissions; `score` is already a percentage.
    scopedAgg((ids) =>
      db
        .select({
          exerciseId: sql<string>`${schema.vocabSubmissions.exerciseId}`,
          attempts: sql<number>`count(*)`,
          avgPct: sql<number | null>`round(avg(${schema.vocabSubmissions.score}))`,
        })
        .from(schema.vocabSubmissions)
        .where(ids ? inArray(schema.vocabSubmissions.exerciseId, ids) : isNotNull(schema.vocabSubmissions.exerciseId))
        .groupBy(schema.vocabSubmissions.exerciseId),
    ),
  ]);
  const qById = new Map(qRows.map((x) => [x.exerciseId, x.n]));
  const aById = new Map(aRows.map((x) => [x.exerciseId, x]));
  const cById = new Map(cRows.map((x) => [x.exerciseId, x]));
  const sById = new Map(sRows.map((x) => [x.exerciseId, x]));
  // Fold deck sessions into the same attempts / average (weighted by attempts).
  for (const v of vRows) {
    const q = sById.get(v.exerciseId);
    const n = (q?.attempts ?? 0) + v.attempts;
    const avg = ((q?.avgPct ?? 0) * (q?.attempts ?? 0) + (v.avgPct ?? 0) * v.attempts) / (n || 1);
    sById.set(v.exerciseId, { exerciseId: v.exerciseId, attempts: n, avgPct: Math.round(avg) });
  }

  // Total AFTER filtering (for the pager) + whole-library stats (for the hero — unaffected by
  // filters). Counted separately so they never touch the page query.
  const [[cnt], [all]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.exercises).where(and(...filters)),
    db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${schema.exercises.published} then 1 else 0 end)`,
      })
      .from(schema.exercises)
      .where(isNull(schema.exercises.deletedAt)),
  ]);
  const [sub] = await db
    .select({
      attempts: sql<number>`count(*)`,
      avgPct: sql<number | null>`round(avg(${schema.submissions.score} * 100.0 / nullif(${schema.submissions.total}, 0)))`,
    })
    .from(schema.submissions)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.submissions.exerciseId))
    .where(isNull(schema.exercises.deletedAt));
  // Folds the topic columns into one compact object (null when unset) and attaches the aggregates.
  const items = rows.map(({ topic_id, topic_name, topic_color, topic_icon, ...rest }) => {
    const assignee = aById.get(rest.id);
    const klass = cById.get(rest.id);
    const stat = sById.get(rest.id);
    return {
      ...rest,
      question_count: qById.get(rest.id) ?? 0,
      assignee_count: assignee?.n ?? 0,
      assignee_names: assignee?.names ? assignee.names.split("|").filter(Boolean) : [],
      class_count: klass?.n ?? 0,
      class_names: klass?.names ? klass.names.split("|").filter(Boolean) : [],
      attempts: stat?.attempts ?? 0,
      avg_pct: stat?.attempts ? (stat.avgPct ?? null) : null,
      topic_id: topic_id ?? null,
      topic: topic_id && topic_name ? { id: topic_id, name: topic_name, color: topic_color ?? "#06b6d4", icon: topic_icon ?? null } : null,
    };
  });
  return c.json({
    items,
    total: cnt?.n ?? items.length,
    page: perPage ? page : 1,
    per_page: perPage || (cnt?.n ?? items.length),
    stats: {
      total: all?.total ?? 0,
      published: all?.published ?? 0,
      attempts: sub?.attempts ?? 0,
      avg_pct: sub?.avgPct ?? 0,
    },
  });
});

/** Danh sách bài trong thùng rác (rút gọn — đủ để nhận diện + khôi phục).
 *  Khai báo TRƯỚC "/:slug" để route tĩnh không bị param nuốt. */
r.get("/trash", async (c) => {
  const db = getDb(c.env.DB);
  const qCount = db
    .select({
      exerciseId: schema.questions.exerciseId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(schema.questions)
    .groupBy(schema.questions.exerciseId)
    .as("qc");
  const rows = await db
    .select({
      id: schema.exercises.id,
      exercise_id: schema.exercises.exerciseId,
      title: schema.exercises.title,
      skill: schema.exercises.skill,
      level: schema.exercises.level,
      read_aloud: schema.exercises.readAloud,
      video: schema.exercises.video,
      template_id: schema.exercises.templateId,
      created_at: schema.exercises.createdAt,
      deleted_at: schema.exercises.deletedAt,
      question_count: sql<number>`coalesce(${qCount.n}, 0)`,
      deck_words: sql<number | null>`case when ${schema.exercises.vocabDeck} is null then null else coalesce(
        json_array_length(json_extract(${schema.exercises.vocabDeck}, '$.wordIds')),
        json_extract(${schema.exercises.vocabDeck}, '$.filter.count'),
        0) end`,
    })
    .from(schema.exercises)
    .leftJoin(qCount, eq(qCount.exerciseId, schema.exercises.id))
    .where(isNotNull(schema.exercises.deletedAt))
    .orderBy(desc(schema.exercises.deletedAt));
  return c.json({ items: rows });
});

/** 1 bài đầy đủ (CÓ đáp án) để sửa. */
r.get("/:slug", async (c) => {
  const db = getDb(c.env.DB);
  const key = c.req.param("slug");
  // Nhận DIỆN theo id (UUID — dùng cho URL sửa) HOẶC exercise_id (slug — link cũ vẫn chạy).
  const ex = await db.query.exercises.findFirst({
    where: or(eq(schema.exercises.id, key), eq(schema.exercises.exerciseId, key)),
  });
  if (!ex) throw new HTTPException(404, { message: "Không tìm thấy bài" });
  const qs = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.exerciseId, ex.id))
    .orderBy(schema.questions.position);
  return c.json({ ...exerciseOut(ex), questions: qs.map(fullQuestion) });
});

/** Tạo/cập nhật bài + thay toàn bộ câu hỏi. */
r.post("/", async (c) => {
  const parsed = exerciseInputSchema.safeParse(
    await c.req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ",
    });
  }
  const v = parsed.data;
  // Validate CHẶT theo dạng câu (zod cố tình lỏng) — chặn bài hỏng lọt DB, báo lỗi tiếng Việt.
  const issues = exerciseIssues(v);
  if (issues.length) throw new HTTPException(400, { message: issues[0] });
  const db = getDb(c.env.DB);
  const { exerciseId, id, untagged } = await saveExercise(db, v);
  // Có lời thoại mà chưa có audio → sinh audio NỀN (xem lib/ttsJob.ts: bài nghe không có
  // audio là bài không làm được, học sinh không được xem script trước khi nộp).
  if (v.template_id !== "dictation" && !v.read_aloud && v.skill !== "mixed" && v.audio_script?.trim() && !v.audio_url?.trim()) {
    c.executionCtx.waitUntil(
      c.env.AI_QUEUE.send({ jobId: id, type: "tts" }).catch((e) => console.error("Enqueue tạo audio lỗi:", e)),
    );
  }
  // DICTATION: LUÔN sinh lại audio từ các câu (force) — sửa câu thì audio đọc-từng-câu phải khớp.
  if (v.template_id === "dictation" && v.questions?.length) {
    c.executionCtx.waitUntil(
      c.env.AI_QUEUE.send({ jobId: id, type: "tts", force: true }).catch((e) => console.error("Enqueue tạo audio dictation lỗi:", e)),
    );
  }
  // Còn câu chưa có nhãn ngữ pháp → gắn NỀN bằng AI (đừng bắt giáo viên chờ Gemini lúc Lưu).
  // Lỗi hàng chờ không được làm hỏng việc lưu bài.
  if (untagged > 0) {
    c.executionCtx.waitUntil(
      c.env.AI_QUEUE.send({ jobId: id, type: "grammar" }).catch((e) => console.error("Enqueue gắn ngữ pháp lỗi:", e)),
    );
  }
  return c.json({ exercise_id: exerciseId });
});

r.patch("/:slug/publish", async (c) => {
  const { published } = await c.req.json().catch(() => ({ published: false }));
  const db = getDb(c.env.DB);
  await db
    .update(schema.exercises)
    .set({ published: !!published })
    .where(eq(schema.exercises.exerciseId, c.req.param("slug")));
  return c.json({ ok: true });
});

// ---- THÙNG RÁC: xóa mềm → khôi phục / dọn hẳn (giáo viên tự dọn) ----
//
// Xóa = chuyển vào thùng rác (deleted_at = now) + gỡ xuất bản (published = false) để bài
// KHÔNG lọt tới học sinh khi đang nằm trong thùng. Khôi phục đưa về lại (vẫn ở dạng nháp,
// cô tự xuất bản lại). Dọn hẳn mới thực sự xóa DB (kèm cascade câu hỏi/lượt nộp/bài giao).
// (GET /trash khai báo TRƯỚC GET /:slug — xem trên — để không bị "/:slug" nuốt.)

/** Xóa mềm: chuyển vào thùng rác + gỡ xuất bản. */
r.delete("/:slug", async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db
    .update(schema.exercises)
    .set({ deletedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`, published: false })
    .where(and(eq(schema.exercises.exerciseId, c.req.param("slug")), isNull(schema.exercises.deletedAt)))
    .returning({ id: schema.exercises.id });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy bài" });
  return c.json({ ok: true });
});

/** Khôi phục từ thùng rác (về dạng nháp — cô tự xuất bản lại). */
r.post("/:slug/restore", async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db
    .update(schema.exercises)
    .set({ deletedAt: null })
    .where(and(eq(schema.exercises.exerciseId, c.req.param("slug")), isNotNull(schema.exercises.deletedAt)))
    .returning({ id: schema.exercises.id });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy bài trong thùng rác" });
  return c.json({ ok: true });
});

/** Dọn hẳn: xóa thật khỏi DB (chỉ bài đang ở thùng rác). Không thể hoàn tác. */
r.delete("/:slug/purge", async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db
    .delete(schema.exercises)
    .where(and(eq(schema.exercises.exerciseId, c.req.param("slug")), isNotNull(schema.exercises.deletedAt)))
    .returning({ id: schema.exercises.id });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy bài trong thùng rác" });
  return c.json({ ok: true });
});

// ---- XEM THỬ: giáo viên mở đúng giao diện học sinh để kiểm bài ----
//
// Vì sao có route riêng thay vì dùng /practice/:slug của học sinh: bản học sinh đòi 3 điều
// kiện (đăng nhập + published + được giao) — cô không thoả cái nào, và bài đang soạn
// thường còn NHÁP. Ở đây bỏ qua cả 3, đổi lại requireTeacher đã chặn ở ngoài (index.ts).
// Vẫn lược đáp án qua publicQuestion: cô xem đúng thứ học sinh thấy, không hơn.

/** Đề dạng học sinh (đã ẩn đáp án + audio_script) — không cần mã, chạy cả khi còn nháp. */
r.get("/:slug/preview", async (c) => {
  const { db, ex } = await findExercise(c);
  const qs = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.exerciseId, ex.id))
    .orderBy(schema.questions.position);

  const dict = await dictationPublicFields(ex, qs);
  const out: PublicExercise = {
    exercise_id: ex.exerciseId,
    title: ex.title,
    skill: ex.skill ?? null,
    passage: ex.passage ?? null,
    passage_ipa: ex.passageIpa ?? null,
    audio_url: ex.audioUrl ?? null,
    audio_cues: dict.audio_cues,
    dictation: dict.dictation,
    read_aloud: ex.readAloud ?? false,
    // Writing has no flag column — it is skill=writing carrying a prompt (like /library/:slug/record).
    writing: ex.skill === "writing" && !!ex.speakingPrompt?.trim(),
    speaking_prompt: ex.speakingPrompt ?? null,
    speaking_framework: ex.speakingFramework ?? null,
    speaking_image: ex.speakingImage ?? null,
    video: ex.video ?? false,
    wordlist: ex.wordlist ?? null,
    translate_level: ex.translateLevel ?? null,
    template_id: ex.templateId ?? null,
    questions: await Promise.all(qs.map(publicQuestion)),
  };
  // Bộ THẺ từ vựng: resolve luôn danh sách từ như bản học sinh (/library/:slug) — thiếu bước
  // này thì bài không có câu hỏi rơi vào <Quiz> và cô thấy màn trắng / giao diện cũ.
  if (ex.vocabDeck) {
    out.vocab_deck = ex.vocabDeck;
    out.vocab_items = await resolveVocabDeck(c.env, ex.vocabDeck);
  }
  return c.json(out);
});

/**
 * The English sentence of ONE translate question — the preview twin of
 * /library/:slug/translate-answer, so the teacher sees the same letter-by-letter marking the learner
 * gets. No gate of its own: requireTeacher already guards this router (index.ts).
 */
r.post("/:slug/preview/translate-answer", async (c) => {
  const { db, ex } = await findExercise(c);
  const body = (await c.req.json().catch(() => ({}))) as { position?: unknown };
  const position = Number(body.position);
  if (!Number.isFinite(position)) throw new HTTPException(400, { message: "Thiếu số thứ tự câu." });
  const q = await db.query.questions.findFirst({
    where: and(eq(schema.questions.exerciseId, ex.id), eq(schema.questions.position, position)),
  });
  if (!q || q.type !== "translate") throw new HTTPException(404, { message: "Câu này không phải câu dịch." });
  return c.json({ position, en: q.answer ?? "" });
});

/**
 * PREVIEW grading — identical to the real pass (the same `gradeSubmission` from packages/shared) but
 * NOTHING is written to `submissions`: a teacher's preview must not leak into learner stats or the
 * leaderboard. No `submission_id` comes back, so the web shows the result in place instead of /s/:id.
 */
r.post("/:slug/preview/grade", async (c) => {
  const { db, ex } = await findExercise(c);
  const body = await c.req.json().catch(() => ({}));
  const answers = (body?.answers ?? {}) as Record<string, string>;

  const qs = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.exerciseId, ex.id))
    .orderBy(schema.questions.position);

  const answerMap: Record<number, string> = {};
  for (const [k, v] of Object.entries(answers)) answerMap[Number(k)] = v;

  const { score, total, details } = gradeSubmission(
    qs.map((q) => ({
      position: q.position,
      type: q.type,
      answer: q.answer,
      accept: q.accept,
      pairs: q.pairs,
      items: q.items,
      article_lenient: q.articleLenient,
    })),
    answerMap,
  );
  const review = qs.map((q) => ({ position: q.position, correctAnswer: correctAnswerText(q) }));
  const grammar = await grammarNotesFor(db, qs, details.filter((d) => !d.correct).map((d) => d.position));
  return c.json({ score, total, details, review, grammar, audio_script: ex.audioScript ?? null });
});

/**
 * XEM THỬ bài Nghe & Nói (video/audio theo đoạn). Cùng payload với /library/:slug/video của
 * học sinh nhưng bỏ gate (published/level/Pro) và KHÔNG ghi tiến độ — tiến độ nghe-viết gắn
 * với danh tính người học. Chấm shadowing cũng không có ở đây (tốn Azure + cần người học thật).
 */
r.post("/:slug/preview/video", async (c) => {
  const { ex } = await findExercise(c);
  if (!ex.video) throw new HTTPException(400, { message: "Bài này không phải bài Nghe & Nói" });
  const segments = (ex.videoSegments ?? []).filter((s) => s && s.text?.trim());
  const source = ex.mediaSource ?? (ex.youtubeId ? "video" : "audio");
  const hasMedia = source === "audio" ? !!ex.audioUrl : !!ex.youtubeId;
  if (!segments.length || !hasMedia)
    throw new HTTPException(400, { message: "Bài Nghe & Nói chưa có nội dung" });

  const modes: VideoMode[] = ex.videoModes?.length ? ex.videoModes : ["dictation", "shadowing"];
  const body = (await c.req.json().catch(() => ({}))) as { mode?: VideoMode };
  const mode: VideoMode = body.mode && modes.includes(body.mode) ? body.mode : modes[0];

  const out: PublicVideoLesson = {
    exercise_id: ex.exerciseId,
    title: ex.title,
    media_source: source,
    youtube_id: source === "video" ? ex.youtubeId : null,
    audio_url: source === "audio" ? ex.audioUrl : null,
    audio_cues: source === "audio" ? ex.audioCues ?? null : null,
    video_lang: ex.videoLang ?? null,
    mode,
    modes,
    segments: segments.map((s) => publicSegment(s, mode)),
  };
  return c.json(out);
});

// ---- Đã giao bài này cho ai (list / thêm / gỡ) ----
async function findExercise(c: Context<AppEnv>) {
  const db = getDb(c.env.DB);
  const slug = c.req.param("slug") ?? "";
  const ex = await db.query.exercises.findFirst({
    where: eq(schema.exercises.exerciseId, slug),
  });
  if (!ex) throw new HTTPException(404, { message: "Không tìm thấy bài" });
  return { db, ex };
}

/**
 * Ai đang được giao bài này — nhìn từ phía BÀI (chiều ngược của trang học sinh).
 * Nguồn: `user_assignments` (cô giao riêng). Bài giao cho CẢ LỚP quản lý ở drawer Lớp học,
 * không trộn vào đây để cô không gỡ nhầm bài của lớp khi chỉ định bỏ một em.
 *
 */
r.get("/:slug/assignees", async (c) => {
  const { db, ex } = await findExercise(c);

  const rows = await db
    .select({ user: schema.users, level: schema.levels, note: schema.userAssignments.teacherNote })
    .from(schema.userAssignments)
    .innerJoin(schema.users, eq(schema.userAssignments.userId, schema.users.id))
    .leftJoin(schema.levels, eq(schema.users.levelId, schema.levels.id))
    .where(eq(schema.userAssignments.exerciseId, ex.id))
    .orderBy(asc(schema.users.name));

  const subs = await db
    .select({
      userId: schema.submissions.userId,
      score: schema.submissions.score,
      total: schema.submissions.total,
      submittedAt: schema.submissions.submittedAt,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.exerciseId, ex.id))
    .orderBy(desc(schema.submissions.submittedAt));
  const latest: Record<string, { score: number; total: number; submittedAt: string }> = {};
  for (const s of subs) {
    if (s.userId && !latest[s.userId]) {
      latest[s.userId] = { score: s.score, total: s.total, submittedAt: s.submittedAt };
    }
  }
  // A vocab deck never writes `submissions`; its sessions are vocab_submissions (score = % of words).
  if (ex.vocabDeck) {
    const vs = await db
      .select({ userId: schema.vocabSubmissions.userId, score: schema.vocabSubmissions.score, total: schema.vocabSubmissions.total, submittedAt: schema.vocabSubmissions.submittedAt })
      .from(schema.vocabSubmissions)
      .where(eq(schema.vocabSubmissions.exerciseId, ex.id))
      .orderBy(desc(schema.vocabSubmissions.submittedAt));
    for (const v of vs) {
      if (v.userId && (!latest[v.userId] || latest[v.userId].submittedAt < v.submittedAt)) {
        latest[v.userId] = { score: Math.round((v.score / 100) * v.total), total: v.total, submittedAt: v.submittedAt };
      }
    }
  }

  const assigned = rows.map((row) => {
    const last = latest[row.user.id];
    return {
      id: row.user.id,
      name: row.user.name ?? row.user.email,
      level: row.level ? levelOut(row.level) : null,
      active: row.user.active,
      teacher_note: row.note,
      done: !!last,
      lastScore: last?.score ?? null,
      lastTotal: last?.total ?? null,
      lastAt: last?.submittedAt ?? null,
    };
  });

  // Chọn được: HỌC SINH (user thuộc lớp) chưa được giao riêng bài này.
  const assignedIds = new Set(rows.map((row) => row.user.id));
  const all = await db
    .selectDistinct({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.classMembers)
    .innerJoin(schema.users, eq(schema.classMembers.userId, schema.users.id))
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name));
  const available = all.filter((s) => !assignedIds.has(s.id)).map((s) => ({ id: s.id, name: s.name ?? s.email }));

  return c.json({ exercise: { title: ex.title, exercise_id: ex.exerciseId }, assigned, available });
});

r.post("/:slug/assignees", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { student_id?: string; user_id?: string };
  const userId = body.user_id || body.student_id; // `student_id`: tương thích client cũ
  if (!userId) throw new HTTPException(400, { message: "Thiếu học sinh" });
  const { db, ex } = await findExercise(c);
  await db.insert(schema.userAssignments).values({ userId, exerciseId: ex.id }).onConflictDoNothing();
  return c.json({ ok: true });
});

r.delete("/:slug/assignees/:studentId", async (c) => {
  const { db, ex } = await findExercise(c);
  await db
    .delete(schema.userAssignments)
    .where(and(eq(schema.userAssignments.userId, c.req.param("studentId")), eq(schema.userAssignments.exerciseId, ex.id)));
  return c.json({ ok: true });
});

// Giao bài cho CẢ LỚP nhìn từ phía BÀI (chiều ngược của drawer Lớp học). Song song với
// /assignees (giao riêng từng em) — cùng một bài giao được cho cả hai.
r.get("/:slug/classes", async (c) => {
  const { db, ex } = await findExercise(c);
  const rows = await db
    .select({
      id: schema.classes.id,
      name: schema.classes.name,
      active: schema.classes.active,
      memberCount: sql<number>`(select count(*) from class_members where class_members.class_id = ${schema.classes.id})`,
      assignedAt: schema.classAssignments.assignedAt,
    })
    .from(schema.classes)
    .leftJoin(
      schema.classAssignments,
      and(eq(schema.classAssignments.classId, schema.classes.id), eq(schema.classAssignments.exerciseId, ex.id)),
    )
    .orderBy(asc(schema.classes.name));
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    active: r.active,
    member_count: r.memberCount,
    assigned: r.assignedAt != null,
  }));
  return c.json({ exercise: { title: ex.title, exercise_id: ex.exerciseId }, items });
});

r.post("/:slug/classes", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { class_id?: string };
  const classId = body.class_id?.trim();
  if (!classId) throw new HTTPException(400, { message: "Thiếu lớp" });
  const { db, ex } = await findExercise(c);
  await db.insert(schema.classAssignments).values({ classId, exerciseId: ex.id }).onConflictDoNothing();
  return c.json({ ok: true });
});

r.delete("/:slug/classes/:classId", async (c) => {
  const { db, ex } = await findExercise(c);
  await db
    .delete(schema.classAssignments)
    .where(and(eq(schema.classAssignments.classId, c.req.param("classId")), eq(schema.classAssignments.exerciseId, ex.id)));
  return c.json({ ok: true });
});

export default r;
