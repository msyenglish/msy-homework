// Builds ReadingResult / WritingResult from one row and works out the attempt number / previous /
// best score for its owner (student OR user).
//
// Thưởng VNĐ đã nghỉ hưu cùng khu học sinh cũ: mọi người học
// nay là `users` và ăn ĐIỂM ẢO như nhau, kể cả học sinh trong lớp của cô.
import { and, desc, eq } from "drizzle-orm";
import { recordPoints, type ReadingResult, type WritingResult } from "@msyen/shared";
import { schema, type Db } from "../db";
import { fileUrl } from "./files";
import { loadReadingWords } from "./readingWords";
import type { Bindings } from "./env";

export type RecordOwner = { studentId?: string; userId?: string };

// Points for this attempt — only the part above the previous best counts (a lower retry → +0).
// `reward_gained` stays at 0 because ReadingResult still carries the field.
function rewardFields(
  bestBefore: number,
  bestAfter: number,
  hadPrev: boolean,
): { reward_gained: number; points_gained: number; best_points: number } {
  const prev = hadPrev ? recordPoints(bestBefore) : 0;
  return {
    reward_gained: 0,
    points_gained: Math.max(0, recordPoints(bestAfter) - prev),
    best_points: recordPoints(bestAfter),
  };
}

// WritingResult không có trường `reward_gained` (bảng viết mới, không kế thừa lịch sử VNĐ) —
// chỉ lấy points_gained/best_points từ rewardFields.
function pointsOnly(bestBefore: number, bestAfter: number, hadPrev: boolean): { points_gained: number; best_points: number } {
  const { points_gained, best_points } = rewardFields(bestBefore, bestAfter, hadPrev);
  return { points_gained, best_points };
}

function readingOwnerWhere(owner: RecordOwner) {
  return owner.studentId
    ? eq(schema.readingSubmissions.studentId, owner.studentId)
    : eq(schema.readingSubmissions.userId, owner.userId!);
}

function writingOwnerWhere(owner: RecordOwner) {
  return owner.studentId
    ? eq(schema.writingSubmissions.studentId, owner.studentId)
    : eq(schema.writingSubmissions.userId, owner.userId!);
}

export async function buildReadingResult(
  env: Bindings,
  db: Db,
  sub: typeof schema.readingSubmissions.$inferSelect,
  owner: RecordOwner,
): Promise<ReadingResult> {
  const attempts = await db
    .select({ id: schema.readingSubmissions.id, pronScore: schema.readingSubmissions.pronScore })
    .from(schema.readingSubmissions)
    .where(and(eq(schema.readingSubmissions.exerciseId, sub.exerciseId), readingOwnerWhere(owner)))
    .orderBy(desc(schema.readingSubmissions.submittedAt));
  const others = attempts.filter((a) => a.id !== sub.id);
  const prev = others[0];
  const bestBefore = others.reduce((m, a) => Math.max(m, a.pronScore), 0);
  const bestAfter = Math.max(bestBefore, sub.pronScore);
  return {
    pron_score: sub.pronScore,
    accuracy: sub.accuracy,
    fluency: sub.fluency,
    completeness: sub.completeness,
    prosody: sub.prosody,
    transcript: sub.transcript ?? "",
    words: await loadReadingWords(env, sub),
    feedback: sub.aiFeedback,
    audio_url: sub.audioKey ? fileUrl(sub.audioKey) : null,
    duration_ms: sub.durationMs ?? 0,
    submission_id: sub.id,
    attempt_no: attempts.length,
    previous_score: prev ? prev.pronScore : null,
    best_score: bestAfter,
    ...rewardFields(bestBefore, bestAfter, others.length > 0),
  };
}

export async function buildWritingResult(
  db: Db,
  sub: typeof schema.writingSubmissions.$inferSelect,
  owner: RecordOwner,
): Promise<WritingResult> {
  const attempts = await db
    .select({ id: schema.writingSubmissions.id, overallScore: schema.writingSubmissions.overallScore })
    .from(schema.writingSubmissions)
    .where(and(eq(schema.writingSubmissions.exerciseId, sub.exerciseId), writingOwnerWhere(owner)))
    .orderBy(desc(schema.writingSubmissions.submittedAt));
  const others = attempts.filter((a) => a.id !== sub.id);
  const prev = others[0];
  const bestBefore = others.reduce((m, a) => Math.max(m, a.overallScore), 0);
  const bestAfter = Math.max(bestBefore, sub.overallScore);
  return {
    overall_score: sub.overallScore,
    task: sub.taskBand ?? 0,
    coherence: sub.coherenceBand ?? 0,
    grammar: sub.grammarBand ?? 0,
    lexical: sub.lexicalBand ?? 0,
    text: sub.text,
    word_count: sub.wordCount,
    feedback: sub.aiFeedback,
    submission_id: sub.id,
    attempt_no: attempts.length,
    previous_score: prev ? prev.overallScore : null,
    best_score: bestAfter,
    ...pointsOnly(bestBefore, bestAfter, others.length > 0),
  };
}
