// Safety net for AI comments the on-submit queue job did not finish (crash/timeout/AI error).
// Always on (cron, every SAFETY_NET_HOURS). SCOPE: only CLASS work — rows whose exercise is
// assigned to the learner's class (or to the learner directly); other rows are marked "skipped".
// Picks "error" rows and "pending" rows old enough that the queue job is surely gone, within the
// last RETRY_DAYS, so a row that keeps failing is retried a bounded number of times.
import { and, desc, eq, gte, lt, or } from "drizzle-orm";
import type { Bindings } from "./env";
import { getDb, schema } from "../db";
import { runAiTask } from "./ai/hub";
import { isAssignedWork } from "./feedbackGrant";
import { feedbackNotifyOn, notifyFeedback } from "./feedbackNotify";
import { buildQuizFeedbackInput } from "./quizFeedback";
import { getSettings } from "./settings";

export const SAFETY_NET_HOURS = 6;
const PENDING_GRACE_MS = 15 * 60_000;
const RETRY_DAYS = 3;

export interface AutoFeedbackResult {
  checked: number;
  generated: number;
  errors: number;
}

export async function runAutoFeedback(env: Bindings, opts: { limit?: number } = {}): Promise<AutoFeedbackResult> {
  const db = getDb(env.DB);
  const limit = opts.limit ?? 10;
  const st = await getSettings(db);
  const now = Date.now();
  const staleBefore = new Date(now - PENDING_GRACE_MS).toISOString();
  const since = new Date(now - RETRY_DAYS * 86_400_000).toISOString();

  const subs = await db
    .select()
    .from(schema.submissions)
    .where(
      and(
        or(
          eq(schema.submissions.feedbackStatus, "error"),
          and(eq(schema.submissions.feedbackStatus, "pending"), lt(schema.submissions.submittedAt, staleBefore)),
        ),
        eq(schema.submissions.feedbackSkipped, 0),
        gte(schema.submissions.submittedAt, since),
      ),
    )
    .orderBy(desc(schema.submissions.submittedAt))
    .limit(limit);

  let generated = 0;
  let errors = 0;

  for (const s of subs) {
    try {
      if (s.teacherFeedback) {
        await db.update(schema.submissions).set({ feedbackStatus: "done" }).where(eq(schema.submissions.id, s.id));
        continue;
      }
      // Safety net covers CLASS work only. Self-practice (no userId or not assigned) → mark skipped.
      const assigned = s.userId ? await isAssignedWork(db, s.userId, s.exerciseId) : false;
      if (!assigned) {
        await db.update(schema.submissions).set({ feedbackStatus: "skipped" }).where(eq(schema.submissions.id, s.id));
        continue;
      }

      const { input, ex, name } = await buildQuizFeedbackInput(db, s);
      const out = await runAiTask<{ feedback: string }>(env, "feedback", input);
      await db.update(schema.submissions).set({ teacherFeedback: out.feedback, feedbackStatus: "done" }).where(eq(schema.submissions.id, s.id));
      generated++;

      if (feedbackNotifyOn(st)) {
        await notifyFeedback(env, st, { submissionId: s.id, name, title: ex?.title ?? null, score: s.score, total: s.total, feedback: out.feedback });
      }
    } catch {
      errors++;
    }
  }

  return { checked: subs.length, generated, errors };
}
