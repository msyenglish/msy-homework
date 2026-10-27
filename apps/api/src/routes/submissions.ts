// Route GIÁO VIÊN — xem lại chi tiết 1 lượt nộp + ghi nhận xét.
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { correctAnswerText, studentAnswerText } from "@msyen/shared";
import { getDb, schema } from "../db";
import { buildQuizFeedbackInput } from "../lib/quizFeedback";
import { runAiTask } from "../lib/ai/hub";
import { learnerName } from "../lib/queries";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

/** Every attempt at one exercise (by slug), grouped per learner, newest first. */
r.get("/by-exercise/:slug", async (c) => {
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  // A vocab deck's attempts are vocab_submissions (score = % of the deck's words); they open as
  // the session report (/s/:id), not the quiz review, so they are tagged `kind: "vocab"`.
  const vocabRows = ex.vocabDeck
    ? (
        await db
          .select({
            id: schema.vocabSubmissions.id,
            pct: schema.vocabSubmissions.score,
            total: schema.vocabSubmissions.total,
            submittedAt: schema.vocabSubmissions.submittedAt,
            userId: schema.vocabSubmissions.userId,
            studentId: schema.vocabSubmissions.studentId,
            userName: schema.users.name,
            userEmail: schema.users.email,
            avatarUrl: schema.users.avatarUrl,
            studentName: schema.students.name,
          })
          .from(schema.vocabSubmissions)
          .leftJoin(schema.users, eq(schema.users.id, schema.vocabSubmissions.userId))
          .leftJoin(schema.students, eq(schema.students.id, schema.vocabSubmissions.studentId))
          .where(eq(schema.vocabSubmissions.exerciseId, ex.id))
          .orderBy(desc(schema.vocabSubmissions.submittedAt))
          .limit(3000)
      ).map((v) => ({
        ...v,
        score: Math.round((v.pct / 100) * v.total),
        hintUsed: false,
        hasFeedback: null as string | null,
        kind: "vocab" as const,
      }))
    : [];
  const quizRows = await db
    .select({
      id: schema.submissions.id,
      score: schema.submissions.score,
      total: schema.submissions.total,
      submittedAt: schema.submissions.submittedAt,
      hintUsed: schema.submissions.hintUsed,
      hasFeedback: schema.submissions.teacherFeedback,
      userId: schema.submissions.userId,
      studentId: schema.submissions.studentId,
      userName: schema.users.name,
      userEmail: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      studentName: schema.students.name,
    })
    .from(schema.submissions)
    .leftJoin(schema.users, eq(schema.users.id, schema.submissions.userId))
    .leftJoin(schema.students, eq(schema.students.id, schema.submissions.studentId))
    .where(eq(schema.submissions.exerciseId, ex.id))
    .orderBy(desc(schema.submissions.submittedAt))
    .limit(3000);
  const rows = [...vocabRows, ...quizRows.map((r) => ({ ...r, kind: "quiz" as const, pct: null as number | null }))].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );

  const pct = (score: number, total: number) => (total > 0 ? Math.round((score * 100) / total) : 0);
  const pctOf = (r: (typeof rows)[number]) => r.pct ?? pct(r.score, r.total);
  type Attempt = { id: string; kind: "quiz" | "vocab"; score: number; total: number; pct: number; submitted_at: string; hint_used: boolean; has_feedback: boolean };
  const byLearner = new Map<string, { key: string; user_id: string | null; name: string; avatar_url: string | null; attempts: Attempt[] }>();
  for (const r of rows) {
    const key = r.userId ? `u:${r.userId}` : r.studentId ? `s:${r.studentId}` : "guest";
    let l = byLearner.get(key);
    if (!l) {
      l = { key, user_id: r.userId, name: r.userName || r.userEmail || r.studentName || "Khách", avatar_url: r.avatarUrl ?? null, attempts: [] };
      byLearner.set(key, l);
    }
    l.attempts.push({
      id: r.id,
      kind: r.kind,
      score: r.score,
      total: r.total,
      pct: pctOf(r),
      submitted_at: r.submittedAt,
      hint_used: !!r.hintUsed,
      has_feedback: !!r.hasFeedback?.trim(),
    });
  }
  const learners = [...byLearner.values()].map((l) => {
    const best = l.attempts.reduce((a, b) => (b.pct > a.pct ? b : a));
    return { ...l, best_pct: best.pct, best_id: best.id, last_pct: l.attempts[0].pct, last_at: l.attempts[0].submitted_at };
  });
  const bests = learners.map((l) => l.best_pct);
  const all = rows.map(pctOf);
  return c.json({
    exercise: { slug: ex.exerciseId, title: ex.title, skill: ex.skill ?? null },
    stats: {
      learners: learners.length,
      attempts: rows.length,
      avg_pct: all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : null,
      best_pct: bests.length ? Math.max(...bests) : null,
      // Learners by their best score: <50 · 50–69 · 70–89 · 90+.
      buckets: [0, 50, 70, 90].map((lo, i, arr) => bests.filter((b) => b >= lo && (i === arr.length - 1 || b < arr[i + 1])).length),
    },
    learners,
  });
});

/** Chi tiết 1 lượt nộp: từng câu đúng/sai, đáp án học sinh vs đáp án đúng. */
r.get("/:id/review", async (c) => {
  const db = getDb(c.env.DB);
  const sub = await db.query.submissions.findFirst({
    where: eq(schema.submissions.id, c.req.param("id")),
  });
  if (!sub) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });

  const [ex, stu, qs] = await Promise.all([
    db.query.exercises.findFirst({ where: eq(schema.exercises.id, sub.exerciseId) }),
    learnerName(db, sub),
    db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.exerciseId, sub.exerciseId))
      .orderBy(schema.questions.position),
  ]);

  const correctByPos: Record<number, boolean> = {};
  for (const d of sub.details) correctByPos[d.position] = d.correct;

  const items = qs.map((q) => ({
    position: q.position,
    type: q.type,
    question: q.question,
    options: q.options ?? null,
    studentAnswer: studentAnswerText(q, sub.answers[q.position]),
    correctAnswer: correctAnswerText(q),
    accept: q.accept ?? [],
    correct: !!correctByPos[q.position],
  }));

  return c.json({
    id: sub.id,
    score: sub.score,
    total: sub.total,
    submitted_at: sub.submittedAt,
    hint_used: sub.hintUsed ?? false,
    studentName: stu ?? "Khách",
    exerciseTitle: ex?.title ?? "",
    exercise_id: ex?.exerciseId ?? null,
    skill: ex?.skill ?? null,
    passage: ex?.passage ?? null,
    audio_url: ex?.audioUrl ?? null,
    audio_script: ex?.audioScript ?? null,
    wordlist: ex?.wordlist ?? null,
    teacherFeedback: sub.teacherFeedback ?? "",
    items,
  });
});

/** AI sinh nhận xét tự động từ bài đã chấm (qua hub Gemini + xoay key). */
r.post("/:id/ai-feedback", async (c) => {
  const db = getDb(c.env.DB);
  const sub = await db.query.submissions.findFirst({
    where: eq(schema.submissions.id, c.req.param("id")),
  });
  if (!sub) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });

  // Same input as the automatic comment (readable answers for every type, rounded score).
  const { input } = await buildQuizFeedbackInput(db, sub);
  const out = await runAiTask<{ feedback: string }>(c.env, "feedback", input);

  return c.json({ feedback: out.feedback });
});

r.patch("/:id/feedback", async (c) => {
  const { feedback } = await c.req.json().catch(() => ({ feedback: "" }));
  const db = getDb(c.env.DB);
  await db
    .update(schema.submissions)
    .set({ teacherFeedback: (feedback || "").trim() || null })
    .where(eq(schema.submissions.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default r;
