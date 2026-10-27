// NGHE-VIẾT VIDEO (vòng luyện tức thì): lưu tiến độ TỪNG ĐOẠN (đúng-lần-đầu / số lần thử / hint /
// đã xong) rồi ghi 1 dòng `submissions` TỔNG cho bài (điểm = số đoạn ĐÃ ĐÚNG) → tính điểm/streak/BXH.
// Mục tiêu: luyện-cho-đúng + thống kê học, KHÔNG phải nộp bài tổng hợp.
import { and, eq } from "drizzle-orm";
import { dictationPoints } from "@msyen/shared";
import { getDb, schema } from "../db";

// Thứ tự độ khó — giữ mức KHÓ NHẤT đã làm xong câu đó, làm lại ở mức dễ hơn không được hạ điểm.
const LEVEL_RANK: Record<string, number> = { easy: 1, medium: 2, hard: 3, hardest: 4 };
function harderLevel(a: string | null | undefined, b: string | null | undefined): string | null {
  return (LEVEL_RANK[b ?? ""] ?? 0) > (LEVEL_RANK[a ?? ""] ?? 0) ? (b ?? null) : (a ?? null);
}

type Db = ReturnType<typeof getDb>;

async function findRow(db: Db, userId: string, exId: string, segment: number) {
  return db.query.videoDictationScores.findFirst({
    where: and(
      eq(schema.videoDictationScores.userId, userId),
      eq(schema.videoDictationScores.exerciseId, exId),
      eq(schema.videoDictationScores.segment, segment),
    ),
  });
}

/** Cập nhật dòng `submissions` TỔNG của bài video (1 dòng/bài/user): điểm = số đoạn đã đúng. */
type SegText = { i: number; text: string };

async function syncAggregate(db: Db, userId: string, exId: string, segments: SegText[]) {
  const rows = await db
    .select()
    .from(schema.videoDictationScores)
    .where(and(eq(schema.videoDictationScores.userId, userId), eq(schema.videoDictationScores.exerciseId, exId)));
  const doneCount = rows.filter((r) => r.done).length;
  // `score/total` vẫn là "số câu xong / tổng câu" (dùng cho thanh %), còn ĐIỂM ghi riêng vào
  // `submissions.points` vì nó có hệ số độ khó + trừ gợi ý/xin đáp án, không quy về tỉ lệ được.
  const textOf = new Map(segments.map((s) => [s.i, s.text]));
  const points = dictationPoints(
    rows.map((r) => ({
      first_ok: r.firstOk,
      revealed: r.revealed,
      hints: r.hints,
      done: r.done,
      level: r.level,
      segment: r.segment,
    })),
    (r) => textOf.get((r as { segment: number }).segment) ?? "",
  );

  const agg = await db.query.submissions.findFirst({
    where: and(eq(schema.submissions.userId, userId), eq(schema.submissions.exerciseId, exId)),
  });
  const vals = { score: doneCount, total: segments.length, points, answers: {}, details: [], submittedAt: new Date().toISOString() };
  if (agg) {
    await db.update(schema.submissions).set(vals).where(eq(schema.submissions.id, agg.id));
  } else {
    await db.insert(schema.submissions).values({ exerciseId: exId, userId, ...vals });
  }
  return doneCount;
}

export interface DictationProgressRow {
  segment: number;
  attempts: number;
  hints: number;
  first_ok: boolean;
  revealed: boolean;
  done: boolean;
  level?: string | null;
  updated_at?: string;
}

/** Ghi 1 lần CHECK 1 đoạn (đúng/sai). Đúng-lần-đầu chỉ set ở lần thử ĐẦU. Trả tiến độ tổng. */
export async function recordDictationCheck(
  db: Db,
  userId: string,
  exId: string,
  segment: number,
  correct: boolean,
  segments: SegText[],
  level?: string | null,
): Promise<{ done_count: number }> {
  const nowIso = new Date().toISOString();
  const row = await findRow(db, userId, exId, segment);
  if (!row) {
    await db.insert(schema.videoDictationScores).values({
      userId,
      exerciseId: exId,
      segment,
      firstOk: correct, // lần thử đầu tiên
      attempts: 1,
      done: correct,
      level: correct ? (level ?? null) : null,
      updatedAt: nowIso,
    });
  } else {
    await db
      .update(schema.videoDictationScores)
      .set({
        attempts: row.attempts + 1,
        // A row created by a hint has no attempts yet, so this check is still the first one.
        ...(row.attempts === 0 ? { firstOk: correct } : {}),
        done: row.done || correct,
        level: correct ? harderLevel(row.level, level) : row.level,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(schema.videoDictationScores.userId, userId),
          eq(schema.videoDictationScores.exerciseId, exId),
          eq(schema.videoDictationScores.segment, segment),
        ),
      );
  }
  const done_count = await syncAggregate(db, userId, exId, segments);
  return { done_count };
}

/**
 * Record the hint levels opened across a line (summed over its words, already clamped by the caller).
 * Only ever moves up; a finished line's points change with it, so the aggregate is re-synced then.
 */
export async function recordDictationHint(
  db: Db,
  userId: string,
  exId: string,
  segment: number,
  opened: number,
  segments: SegText[],
) {
  const nowIso = new Date().toISOString();
  const row = await findRow(db, userId, exId, segment);
  if (!row) {
    await db.insert(schema.videoDictationScores).values({ userId, exerciseId: exId, segment, hints: opened, updatedAt: nowIso });
  } else if (opened > row.hints) {
    await db
      .update(schema.videoDictationScores)
      .set({ hints: opened, updatedAt: nowIso })
      .where(
        and(
          eq(schema.videoDictationScores.userId, userId),
          eq(schema.videoDictationScores.exerciseId, exId),
          eq(schema.videoDictationScores.segment, segment),
        ),
      );
    if (row.done) await syncAggregate(db, userId, exId, segments);
  }
}

/** Đánh dấu 1 đoạn ĐÃ XEM ĐÁP ÁN (bỏ cuộc) → done nhưng không tính đúng-lần-đầu. */
export async function recordDictationReveal(db: Db, userId: string, exId: string, segment: number, segments: SegText[], level?: string | null) {
  const nowIso = new Date().toISOString();
  const row = await findRow(db, userId, exId, segment);
  if (!row) {
    await db.insert(schema.videoDictationScores).values({
      userId,
      exerciseId: exId,
      segment,
      revealed: true,
      done: true,
      level: level ?? null,
      updatedAt: nowIso,
    });
  } else {
    await db
      .update(schema.videoDictationScores)
      .set({ revealed: true, done: true, level: harderLevel(row.level, level), updatedAt: nowIso })
      .where(
        and(
          eq(schema.videoDictationScores.userId, userId),
          eq(schema.videoDictationScores.exerciseId, exId),
          eq(schema.videoDictationScores.segment, segment),
        ),
      );
  }
  const done_count = await syncAggregate(db, userId, exId, segments);
  return { done_count };
}

/** Tiến độ nghe-viết của user cho 1 bài (danh sách + thống kê tổng). */
export async function getDictationProgress(db: Db, userId: string, exId: string): Promise<DictationProgressRow[]> {
  const rows = await db
    .select()
    .from(schema.videoDictationScores)
    .where(and(eq(schema.videoDictationScores.userId, userId), eq(schema.videoDictationScores.exerciseId, exId)));
  return rows.map((r) => ({
    segment: r.segment,
    attempts: r.attempts,
    hints: r.hints,
    first_ok: r.firstOk,
    revealed: r.revealed,
    done: r.done,
    level: r.level,
    updated_at: r.updatedAt,
  }));
}
