// AI comment generation for read-aloud (reading) / speaking submissions, shared by:
//  - the teacher "regenerate feedback" routes (routes/reading.ts, routes/speaking.ts)
//  - the learner "ask for the comment" endpoints (routes/library.ts)
// Each helper only RUNS the AI task and returns the text; the caller decides what to persist.
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { collectWeakPhonemes } from "@msyen/shared";
import { getDb, schema } from "../db";
import { learnerProfile } from "./queries";
import { runAiTask } from "./ai/hub";
import { loadReadingWords, subErrorWords } from "./readingWords";
import type { Bindings } from "./env";

type Db = ReturnType<typeof getDb>;

/**
 * Generate the AI comment for a read-aloud submission from ALREADY-SAVED data
 * (words/transcript/scores), no audio required.
 */
export async function generateReadingFeedback(
  env: Bindings,
  db: Db,
  sub: typeof schema.readingSubmissions.$inferSelect,
): Promise<string> {
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, sub.exerciseId) });
  if (!ex || !ex.passage?.trim()) throw new HTTPException(400, { message: "Bài đọc không còn hợp lệ" });

  // Learner name (student OR public user) — only used to address them in the comment.
  const who = await learnerProfile(db, sub);

  const weak = subErrorWords(sub);
  // Phonemes live only in the full word blob (R2), not in the compact `error_words` kept in D1,
  // so a regenerated note used to silently lose the "practise this SOUND" advice that the note
  // written at submit time had. Load the blob and recompute.
  const weakPhonemes = collectWeakPhonemes(await loadReadingWords(env, sub)).map((w) => w.phoneme);

  const out = await runAiTask<{ feedback: string }>(env, "reading_feedback", {
    title: ex.title,
    student_name: who.name ?? "em",
    student_gender: who.gender,
    student_age: who.age,
    passage: ex.passage,
    transcript: sub.transcript,
    pron_score: sub.pronScore,
    accuracy: sub.accuracy,
    fluency: sub.fluency,
    completeness: sub.completeness,
    prosody: sub.prosody,
    weak_words: weak,
    weak_phonemes: weakPhonemes,
  });
  return out.feedback;
}

