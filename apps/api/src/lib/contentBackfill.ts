// Làm giàu NỘI DUNG bài đọc: sinh IPA + DỊCH câu (passage_ipa) cho các bài reading còn thiếu.
// Cron mỗi giờ quét bài reading có passage mà passage_ipa NULL → đẩy CONTENT_QUEUE (queue RIÊNG,
// không dùng chung BULK vocab để khỏi nghẽn) → consumer sinh nền. Xem index.ts scheduled/queue.
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { IpaLine } from "@msyen/shared";
import { getDb, schema } from "../db";
import { runAiTask } from "./ai/hub";
import type { Bindings } from "./env";

const SWEEP_LIMIT = 30; // bài/giờ (mỗi bài 1 lượt AI) — trần chi phí

/** Bài READING + TỔNG HỢP (mixed) có passage nhưng CHƯA có passage_ipa (IPA + dịch) → cần sinh. */
export async function pickReadingNeedingIpa(env: Bindings, limit = SWEEP_LIMIT): Promise<string[]> {
  const db = getDb(env.DB);
  const rows = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(
      and(
        inArray(schema.exercises.skill, ["reading", "mixed"]),
        isNotNull(schema.exercises.passage),
        isNull(schema.exercises.passageIpa),
        isNull(schema.exercises.deletedAt),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Mỗi bài 1 message (sinh IPA là theo cả passage) → CONTENT_QUEUE. */
export async function enqueueContentIpa(env: Bindings, ids: string[]): Promise<number> {
  for (const id of ids) await env.CONTENT_QUEUE.send({ type: "passage_ipa", exerciseId: id });
  return ids.length;
}

/** Sinh IPA + dịch từng câu cho passage của 1 bài → lưu `passage_ipa`. */
export async function generatePassageIpa(env: Bindings, exerciseId: string): Promise<boolean> {
  const db = getDb(env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, exerciseId) });
  const passage = ex?.passage?.trim();
  if (!passage) return false;
  const out = await runAiTask<{ lines: IpaLine[] }>(env, "generate_ipa", { passage });
  if (!out.lines?.length) return false;
  await db.update(schema.exercises).set({ passageIpa: out.lines }).where(eq(schema.exercises.id, exerciseId));
  return true;
}
