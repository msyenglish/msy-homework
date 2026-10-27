// Build + generate the AI comment for ONE quiz submission. Shared by the on-submit queue
// job (processQuizFeedbackJob) and the cron safety net (runAutoFeedback). The comment prompt
// itself lives in lib/ai/tasks.ts ("feedback").
import { eq } from "drizzle-orm";
import { correctAnswerText, studentAnswerText } from "@msyen/shared";
import type { Bindings } from "./env";
import { getDb, schema } from "../db";
import { runAiTask } from "./ai/hub";
import { learnerProfile } from "./queries";
import { isAssignedWork } from "./feedbackGrant";
import { feedbackNotifyOn, notifyFeedback } from "./feedbackNotify";
import { getSettings } from "./settings";

type Db = ReturnType<typeof getDb>;
type SubmissionRow = typeof schema.submissions.$inferSelect;

/** Assemble the "feedback" task input for a submission (exercise + questions + wrong answers). */
export async function buildQuizFeedbackInput(db: Db, sub: SubmissionRow) {
  const [ex, who, qs] = await Promise.all([
    db.query.exercises.findFirst({ where: eq(schema.exercises.id, sub.exerciseId) }),
    learnerProfile(db, sub),
    db.select().from(schema.questions).where(eq(schema.questions.exerciseId, sub.exerciseId)).orderBy(schema.questions.position),
  ]);

  const correctByPos: Record<number, boolean> = {};
  for (const d of sub.details) correctByPos[d.position] = d.correct;

  const items = qs.map((q) => ({
    question: q.question,
    // Readable text for every type: matching/categorize answers are JSON maps, ordering keeps its
    // canonical answer in `answer`, translate in `answer` too.
    student_answer: studentAnswerText(q, sub.answers[q.position]),
    correct_answer: correctAnswerText(q),
    correct: !!correctByPos[q.position],
  }));

  return {
    input: {
      title: ex?.title ?? "Bài tập",
      skill: ex?.skill ?? null,
      // Round: partial-credit (fill-blank/dictation) yields fractional scores, but the feedback
      // input schema wants integers — an un-rounded float fails validation and the comment silently errors.
      score: Math.round(sub.score),
      total: Math.round(sub.total),
      student_name: who.name,
      student_gender: who.gender as "male" | "female" | "other" | null,
      student_age: who.age,
      passage: ex?.passage ?? null,
      items,
    },
    ex,
    name: who.name,
  };
}

/**
 * Queue consumer: write the AI comment for a freshly graded quiz submission.
 * Idempotent (skips if already commented). On failure marks feedback_status="error"
 * so the report page stops polling; the cron safety net re-tries class exercises.
 */
export async function processQuizFeedbackJob(env: Bindings, submissionId: string): Promise<void> {
  const db = getDb(env.DB);
  const sub = await db.query.submissions.findFirst({ where: eq(schema.submissions.id, submissionId) });
  if (!sub) return;
  if (sub.teacherFeedback) {
    if (sub.feedbackStatus !== "done") await db.update(schema.submissions).set({ feedbackStatus: "done" }).where(eq(schema.submissions.id, submissionId));
    return;
  }

  try {
    const { input, ex, name } = await buildQuizFeedbackInput(db, sub);
    const out = await runAiTask<{ feedback: string }>(env, "feedback", input);
    await db
      .update(schema.submissions)
      .set({ teacherFeedback: out.feedback, feedbackStatus: "done" })
      .where(eq(schema.submissions.id, submissionId));
    // Class work only: self-practice comments are not the teacher's to forward.
    const st = await getSettings(db);
    if (feedbackNotifyOn(st) && sub.userId && (await isAssignedWork(db, sub.userId, sub.exerciseId))) {
      await notifyFeedback(env, st, { submissionId, name, title: ex?.title ?? null, score: sub.score, total: sub.total, feedback: out.feedback });
    }
  } catch (e) {
    console.error("Quiz feedback job lỗi:", e);
    await db.update(schema.submissions).set({ feedbackStatus: "error" }).where(eq(schema.submissions.id, submissionId));
  }
}
