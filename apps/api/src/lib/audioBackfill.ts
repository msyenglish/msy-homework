// Self-heal AUDIO for listening/mixed exercises still missing `audio_url`. Rows inserted raw (seed,
// import, agent) never enqueue TTS, which would publish a listening exercise nobody can hear. The
// hourly cron sweeps them onto AI_QUEUE type "tts" (autoExerciseAudio decides what to read), capped
// per run. See index.ts scheduled/queue.
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Bindings } from "./env";

const SWEEP_LIMIT = 40; // bài/giờ — đủ để 1 level tự lành trong 1-2 lượt cron

/** Exercises that need audio but have a NULL `audio_url`: listening (script) · mixed (passage). */
export async function pickExercisesNeedingAudio(env: Bindings, limit = SWEEP_LIMIT): Promise<string[]> {
  const db = getDb(env.DB);
  const rows = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(
      and(
        isNull(schema.exercises.audioUrl),
        isNull(schema.exercises.deletedAt),
        or(
          and(eq(schema.exercises.skill, "listening"), isNotNull(schema.exercises.audioScript)),
          and(eq(schema.exercises.skill, "mixed"), isNotNull(schema.exercises.passage)),
        ),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

/** 1 message/bài → AI_QUEUE type "tts" (jobId = exercises.id). autoExerciseAudio idempotent (bỏ nếu đã có audio). */
export async function enqueueExerciseAudio(env: Bindings, ids: string[]): Promise<number> {
  for (const id of ids) await env.AI_QUEUE.send({ jobId: id, type: "tts" });
  return ids.length;
}
