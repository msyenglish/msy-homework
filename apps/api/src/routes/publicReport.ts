// Public report for one submission (shareable link for parents), no login needed.
// Covers quiz (submissions), read-aloud (reading_submissions) and writing (writing_submissions).
// Record kinds return the same result objects the practice views render (buildReadingResult /
// buildWritingResult), so the report reuses those views.
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { inChunks } from "../lib/bind";
import { HTTPException } from "hono/http-exception";
import { correctAnswerText, studentAnswerText } from "@msyen/shared";
import { getDb, schema } from "../db";
import { buildReadingResult, buildWritingResult } from "../lib/recordResult";
import { grammarNotesFor } from "../lib/grammarNotes";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

/** Meaning + IPA for the words of a vocab session, keyed by the stored wordId (audio plays via TTS). */
async function vocabWordDetails(
  db: ReturnType<typeof getDb>,
  result: { perWord?: { word: string; wordId?: string }[] } | null | undefined,
) {
  const ids = [...new Set((result?.perWord ?? []).map((w) => w.wordId).filter(Boolean) as string[])];
  if (!ids.length) return null;
  const rows = await inChunks(ids, (chunk) =>
    db
      .select({ id: schema.vocabItems.id, word: schema.vocabItems.word, ipa: schema.vocabItems.ipa, meaning: schema.vocabItems.meaning })
      .from(schema.vocabItems)
      .where(inArray(schema.vocabItems.id, chunk)),
  );
  return rows.map((v) => ({ id: v.id, word: v.word, ipa: v.ipa ?? null, meaning: v.meaning ?? null, audio_word: null, audio_word_male: null }));
}

// Tên người học (student HOẶC user công khai) cho 1 lượt đọc to / nói.
async function learnerName(
  db: ReturnType<typeof getDb>,
  owner: { studentId?: string | null; userId?: string | null },
): Promise<string> {
  if (owner.studentId) {
    const s = await db.query.students.findFirst({ where: eq(schema.students.id, owner.studentId) });
    if (s) return s.name;
  }
  if (owner.userId) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, owner.userId) });
    if (u?.name) return u.name;
  }
  return "Học sinh";
}

r.get("/submission/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");

  // 1) QUIZ (bảng submissions).
  const sub = await db.query.submissions.findFirst({ where: eq(schema.submissions.id, id) });
  if (sub) {
    const [ex, name, qs] = await Promise.all([
      db.query.exercises.findFirst({ where: eq(schema.exercises.id, sub.exerciseId) }),
      learnerName(db, sub), // student HOẶC user công khai
      db.select().from(schema.questions).where(eq(schema.questions.exerciseId, sub.exerciseId)).orderBy(schema.questions.position),
    ]);
    const correctByPos: Record<number, boolean> = {};
    for (const d of sub.details) correctByPos[d.position] = d.correct;
    const items = qs.map((q) => ({
      position: q.position,
      question: q.question,
      studentAnswer: studentAnswerText(q, sub.answers[q.position]),
      correctAnswer: correctAnswerText(q),
      correct: !!correctByPos[q.position],
      explanation: q.explanation ?? null,
    }));
    const grammar = await grammarNotesFor(
      db,
      qs,
      items.filter((it) => !it.correct).map((it) => it.position),
    );
    return c.json({
      kind: "quiz" as const,
      studentName: name,
      exerciseTitle: ex?.title ?? "",
      exercise_id: ex?.exerciseId ?? null,
      skill: ex?.skill ?? null,
      read_aloud: false,
      score: sub.score,
      total: sub.total,
      submitted_at: sub.submittedAt,
      hint_used: sub.hintUsed ?? false,
      feedback: sub.teacherFeedback ?? "",
      // Nhận xét sinh qua queue → trang poll khi "pending". null/done/skipped/error = ngừng poll.
      feedback_status: sub.feedbackStatus ?? null,
      items,
      grammar,
      // Ngữ liệu bổ trợ (bài nghe/từ vựng) — báo cáo thay luôn view inline nên cần có.
      audio_script: ex?.audioScript ?? null,
      wordlist: ex?.wordlist ?? null,
    });
  }

  // 2) ĐỌC TO — trả ReadingResult đầy đủ (audience theo chủ nhân; không cần passcode).
  const rsub = await db.query.readingSubmissions.findFirst({ where: eq(schema.readingSubmissions.id, id) });
  if (rsub) {
    const [ex, name] = await Promise.all([
      db.query.exercises.findFirst({ where: eq(schema.exercises.id, rsub.exerciseId) }),
      learnerName(db, rsub),
    ]);
    const owner = { studentId: rsub.studentId ?? undefined, userId: rsub.userId ?? undefined };
    const result = await buildReadingResult(c.env, db, rsub, owner);
    return c.json({
      kind: "reading" as const,
      studentName: name,
      exerciseTitle: ex?.title ?? "",
      exercise_id: ex?.exerciseId ?? null,
      skill: ex?.skill ?? null,
      read_aloud: true,
      submitted_at: rsub.submittedAt,
      passage: ex?.passage ?? "",
      teacher_feedback: rsub.teacherFeedback ?? "",
      result,
    });
  }

  // 3) Writing — return the full WritingResult.
  const wsub = await db.query.writingSubmissions.findFirst({ where: eq(schema.writingSubmissions.id, id) });
  if (wsub) {
    const [ex, name] = await Promise.all([
      db.query.exercises.findFirst({ where: eq(schema.exercises.id, wsub.exerciseId) }),
      learnerName(db, wsub),
    ]);
    const owner = { studentId: wsub.studentId ?? undefined, userId: wsub.userId ?? undefined };
    const result = await buildWritingResult(db, wsub, owner);
    return c.json({
      kind: "writing" as const,
      studentName: name,
      exerciseTitle: ex?.title ?? "",
      exercise_id: ex?.exerciseId ?? null,
      skill: ex?.skill ?? "writing",
      read_aloud: false,
      submitted_at: wsub.submittedAt,
      prompt: ex?.speakingPrompt ?? "",
      teacher_feedback: wsub.teacherFeedback ?? "",
      result,
    });
  }

  // 5) VOCAB DECK — `result` (VocabDeckResult) already holds every word plus the memory summary, so
  // the web builds the table from it. A self-practice session (user_deck) belongs to no exercise.
  const vsub = await db.query.vocabSubmissions.findFirst({ where: eq(schema.vocabSubmissions.id, id) });
  if (vsub) {
    const [ex, name] = await Promise.all([
      vsub.exerciseId
        ? db.query.exercises.findFirst({ where: eq(schema.exercises.id, vsub.exerciseId) })
        : Promise.resolve(undefined),
      learnerName(db, vsub),
    ]);
    return c.json({
      kind: "vocab" as const,
      studentName: name,
      exerciseTitle: ex?.title ?? "Buổi luyện từ vựng",
      exercise_id: ex?.exerciseId ?? null,
      skill: ex?.skill ?? "vocabulary",
      read_aloud: false,
      submitted_at: vsub.submittedAt,
      score: vsub.score, // percent, 0-100
      total: vsub.total, // number of words in the session
      points: vsub.points ?? null,
      result: vsub.result,
      // A vocabulary report is meant to be REVISED from, so each word ships with its meaning, IPA
      // and pre-generated audio — the session result alone only stores the spelling.
      vocab_words: await vocabWordDetails(db, vsub.result),
    });
  }

  throw new HTTPException(404, { message: "Không tìm thấy kết quả" });
});

export default r;
