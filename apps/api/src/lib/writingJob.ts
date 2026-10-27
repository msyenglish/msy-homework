// Processes one queued writing-grading job: a single `grade_writing` pass scores the learner's
// text on four 0-100 criteria (content, organisation, vocabulary, grammar) and writes the comment.
import { applyTeacherTitle } from "@msyen/shared";
import { getBrand } from "./brand";
import { and, asc, eq } from "drizzle-orm";
import type { AiWritingJudgeOutput } from "@msyen/shared/schemas";
import { getDb, schema } from "../db";
import { runAiTask } from "./ai/hub";
import type { Bindings } from "./env";

const now = () => new Date().toISOString();

const clamp100 = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export async function processWritingJob(env: Bindings, jobId: string): Promise<void> {
  const db = getDb(env.DB);
  const job = await db.query.writingJobs.findFirst({ where: eq(schema.writingJobs.id, jobId) });
  if (!job || job.status === "done") return;

  const setStatus = (status: string, patch: Record<string, unknown> = {}) =>
    db
      .update(schema.writingJobs)
      .set({ status, updatedAt: now(), ...patch })
      .where(eq(schema.writingJobs.id, jobId));

  try {
    const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, job.exerciseId) });
    if (!ex || !ex.speakingPrompt?.trim()) throw new Error("Bài viết không còn hợp lệ");

    const learnerName = job.studentId
      ? (await db.query.students.findFirst({ where: eq(schema.students.id, job.studentId) }))?.name
      : job.userId
        ? (await db.query.users.findFirst({ where: eq(schema.users.id, job.userId) }))?.name
        : null;

    const wordCount = job.text.trim().split(/\s+/).filter(Boolean).length;

    // The learner's BEST earlier draft of the SAME task — makes this a revision rather than an
    // unrelated attempt, so the judge can report progress against its own advice. Best, not latest:
    // scoring is best-of, and a weaker in-between draft would otherwise become the baseline.
    // Only that one draft is sent, capped hard — a long text would double the tokens of every retry.
    const owner = job.userId
      ? eq(schema.writingSubmissions.userId, job.userId)
      : job.studentId
        ? eq(schema.writingSubmissions.studentId, job.studentId)
        : null;
    // Ordered oldest-first so the array index is the attempt number.
    const priorRows = owner
      ? await db
          .select({
            id: schema.writingSubmissions.id,
            score: schema.writingSubmissions.overallScore,
          })
          .from(schema.writingSubmissions)
          .where(and(eq(schema.writingSubmissions.exerciseId, ex.id), owner))
          .orderBy(asc(schema.writingSubmissions.submittedAt))
      : [];
    // Ties go to the later draft — the one the learner most recently saw feedback on.
    let bestIdx = -1;
    priorRows.forEach((r, i) => {
      if (bestIdx < 0 || (r.score ?? 0) >= (priorRows[bestIdx].score ?? 0)) bestIdx = i;
    });
    const best =
      bestIdx < 0
        ? undefined
        : await db.query.writingSubmissions.findFirst({
            where: eq(schema.writingSubmissions.id, priorRows[bestIdx].id),
            columns: { text: true, overallScore: true, aiFeedback: true },
          });
    const previous = best
      ? {
          attempt_no: bestIdx + 1,
          score: best.overallScore,
          text: best.text.slice(0, 3000),
          feedback: best.aiFeedback?.slice(0, 1500) ?? null,
        }
      : null;

    await setStatus("grading");
    // A failed grading run fails the job: no score is better than an invented one.
    let judged: AiWritingJudgeOutput;
    try {
      judged = await runAiTask<AiWritingJudgeOutput>(env, "grade_writing", {
        title: ex.title,
        student_name: learnerName ?? "em",
        prompt: ex.speakingPrompt,
        outline: ex.speakingFramework?.outline ?? [],
        sample: ex.speakingSample ?? null,
        level: ex.level ?? null,
        text: job.text,
        word_count: wordCount,
        previous,
      });
    } catch (e) {
      console.error("[writingJob] grade_writing failed:", e);
      throw new Error("Chưa chấm được bài viết của em — em thử nộp lại sau ít phút nhé.");
    }

    const scores = {
      content: clamp100(judged.content),
      organisation: clamp100(judged.organisation),
      vocabulary: clamp100(judged.vocabulary),
      grammar: clamp100(judged.grammar),
    };
    const overall = Math.round((scores.content + scores.organisation + scores.vocabulary + scores.grammar) / 4);

    const [sub] = await db
      .insert(schema.writingSubmissions)
      .values({
        exerciseId: ex.id,
        studentId: job.studentId,
        userId: job.userId,
        text: job.text,
        wordCount,
        overallScore: overall,
        taskBand: scores.content,
        coherenceBand: scores.organisation,
        grammarBand: scores.grammar,
        lexicalBand: scores.vocabulary,
        analysis: { analysis: judged.analysis },
        aiFeedback: judged.feedback,
      })
      .returning({ id: schema.writingSubmissions.id });

    await setStatus("done", { submissionId: sub.id, error: null });
  } catch (e) {
    await setStatus("error", {
      error: applyTeacherTitle(
        e instanceof Error ? e.message : "Chấm bài thất bại, thử lại nhé.",
        (await getBrand(env).catch(() => null))?.title ?? "cô",
      ),
    }).catch(() => {});
  }
}
