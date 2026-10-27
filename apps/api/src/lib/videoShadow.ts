// SHADOWING VIDEO: lưu điểm phát âm TỐT NHẤT mỗi đoạn (video_shadow_scores) rồi ghi 1 dòng
// reading_submissions "tổng" cho cả bài (điểm = TRUNG BÌNH các đoạn đã luyện) → được tính vào
// điểm/streak/BXH như bài đọc-to. Bài id là duy nhất giữa 3 bảng nộp nên leaderboard/analytics
// dedupe theo exercise (lấy MAX) → KHÔNG double-count với nghe-viết.
import { and, eq } from "drizzle-orm";
import { shadowPoints, type VideoShadowDetail } from "@msyen/shared";
import { getDb, schema } from "../db";

type Db = ReturnType<typeof getDb>;

export interface ShadowAggregate {
  avg: number; // điểm trung bình các đoạn đã luyện (0-100)
  done: number; // số đoạn đã luyện
  total: number; // tổng số đoạn của bài
}

/** Khoá nhận diện dòng reading_submissions TỔNG của bài video (1 dòng/bài/user). */
/** Aggregate reading_submissions row that holds a video lesson's shadowing progress. */
export const videoAudioKey = (exId: string) => `video:${exId}`;

/**
 * Ghi điểm 1 đoạn shadowing (giữ TỐT NHẤT) rồi cập nhật dòng tổng reading_submissions.
 * Trả về điểm tổng hợp hiện tại của bài.
 */
export async function recordVideoShadow(
  db: Db,
  userId: string,
  exerciseRowId: string,
  segment: number,
  score: number,
  segments: { i: number; text: string }[],
  detail: VideoShadowDetail,
): Promise<ShadowAggregate> {
  const totalSegments = segments.length;
  // 1) Upsert điểm TỐT NHẤT của đoạn.
  const nowIso = new Date().toISOString();
  const existing = await db.query.videoShadowScores.findFirst({
    where: and(
      eq(schema.videoShadowScores.userId, userId),
      eq(schema.videoShadowScores.exerciseId, exerciseRowId),
      eq(schema.videoShadowScores.segment, segment),
    ),
  });
  if (!existing) {
    await db.insert(schema.videoShadowScores).values({ userId, exerciseId: exerciseRowId, segment, score, detail, updatedAt: nowIso });
  } else if (score > existing.score) {
    // Detail travels with the score: what is shown on reload is the take that counts.
    await db
      .update(schema.videoShadowScores)
      .set({ score, detail, updatedAt: nowIso })
      .where(
        and(
          eq(schema.videoShadowScores.userId, userId),
          eq(schema.videoShadowScores.exerciseId, exerciseRowId),
          eq(schema.videoShadowScores.segment, segment),
        ),
      );
  }

  // 2) Tính trung bình các đoạn đã luyện.
  const rows = await db
    .select({ segment: schema.videoShadowScores.segment, score: schema.videoShadowScores.score })
    .from(schema.videoShadowScores)
    .where(and(eq(schema.videoShadowScores.userId, userId), eq(schema.videoShadowScores.exerciseId, exerciseRowId)));
  const done = rows.length;
  const avg = done ? Math.round(rows.reduce((s, r) => s + r.score, 0) / done) : 0;
  const completeness = totalSegments ? Math.round((done / totalSegments) * 100) : 0;
  // Điểm CỘNG DỒN theo số từ đã nói — `pronScore` (trung bình) chỉ còn để hiển thị.
  const textOf = new Map(segments.map((s) => [s.i, s.text]));
  const points = shadowPoints(rows, (seg) => textOf.get(seg) ?? "");

  // 3) Upsert dòng TỔNG reading_submissions (1 dòng/bài/user) — để tính điểm/BXH.
  const key = videoAudioKey(exerciseRowId);
  const agg = await db.query.readingSubmissions.findFirst({
    where: and(
      eq(schema.readingSubmissions.userId, userId),
      eq(schema.readingSubmissions.exerciseId, exerciseRowId),
      eq(schema.readingSubmissions.audioKey, key),
    ),
  });
  const vals = {
    pronScore: avg,
    points,
    accuracy: avg,
    fluency: avg,
    completeness,
    prosody: null,
    transcript: null,
    words: [], // shadowing không có chấm âm vị → không blob R2
    errorWords: [],
    submittedAt: nowIso,
  };
  if (agg) {
    await db.update(schema.readingSubmissions).set(vals).where(eq(schema.readingSubmissions.id, agg.id));
  } else {
    await db.insert(schema.readingSubmissions).values({ exerciseId: exerciseRowId, userId, audioKey: key, ...vals });
  }

  return { avg, done, total: totalSegments };
}
