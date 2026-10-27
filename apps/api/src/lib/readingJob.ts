// Xử lý một job CHẤM ĐỌC TO từ hàng chờ (Cloudflare Queues consumer).
// Chạy ở invocation riêng → không giữ client chờ, không dính HTTP timeout dù file nặng /
// Azure chậm. Cập nhật `status` theo từng bước để client hiện % tiến độ ở màn chờ.
import { applyTeacherTitle } from "@msyen/shared";
import { getBrand } from "./brand";
import { and, desc, eq } from "drizzle-orm";
import { collectWeakPhonemes, mergeContinuousAssessment, wordAccuracy } from "@msyen/shared";
import { getDb, schema } from "../db";
import { assessPronunciation } from "./media";
import { errorWordsOf, storeReadingWords } from "./readingWords";
import { runAiTask } from "./ai/hub";
import { learnerProfile } from "./queries";
import type { Bindings } from "./env";

const now = () => new Date().toISOString();
const round = (n: number) => Math.round(n);

export async function processReadingJob(env: Bindings, jobId: string): Promise<void> {
  const db = getDb(env.DB);
  const job = await db.query.readingJobs.findFirst({ where: eq(schema.readingJobs.id, jobId) });
  if (!job || job.status === "done") return; // đã xử lý hoặc bị xóa

  const setStatus = (status: string, patch: Record<string, unknown> = {}) =>
    db
      .update(schema.readingJobs)
      .set({ status, updatedAt: now(), ...patch })
      .where(eq(schema.readingJobs.id, jobId));

  try {
    const ex = await db.query.exercises.findFirst({
      where: eq(schema.exercises.id, job.exerciseId),
    });
    if (!ex || !ex.passage?.trim()) throw new Error("Bài đọc không còn hợp lệ");

    // Đọc lại bản ghi từ R2 (message queue không mang được audio — chỉ có jobId).
    const obj = await env.AUDIO.get(job.audioKey);
    if (!obj) throw new Error("Không tìm thấy bản ghi âm đã tải lên");
    const buf = await obj.arrayBuffer();
    const ext = job.contentType.includes("mp4") || job.contentType.includes("m4a")
      ? "mp4"
      : job.contentType.includes("ogg")
        ? "ogg"
        : job.contentType.includes("wav")
          ? "wav"
          : "webm";

    // Step 1: pronunciation scores — merged from the browser's raw Azure results, or scored here.
    await setStatus("assessing");
    const scores = job.browserSegments?.length
      ? mergeContinuousAssessment(job.browserSegments, ex.passage)
      : await assessPronunciation(env, {
          audio: buf,
          contentType: job.contentType,
          filename: `read.${ext}`,
          referenceText: ex.passage,
        });

    // KHÔNG nghe được giọng nào (mic lỗi / im lặng / thu hụt) → Azure trả transcript rỗng +
    // words rỗng. Đừng lưu điểm 0 âm thầm: ném lỗi thân thiện để job → error, client hiện
    // thông báo kiểm tra micro & thu lại (thay vì em tưởng mình đọc bị 0 điểm).
    if (!scores.transcript?.trim() && scores.words.length === 0) {
      throw new Error("Cô không nghe được giọng đọc nào — kiểm tra micro rồi thu lại giúp cô nhé.");
    }


    // Bước 2: nhận xét "Cô–em" từ điểm số — best effort (AI lỗi không chặn trả điểm).
    // CHỈ gọi Gemini khi còn quota nhận xét (job.withFeedback). Hết → score-only.
    let feedback: string | null = null;
    if (job.withFeedback) {
      await setStatus("feedback");
      try {
        const who = await learnerProfile(db, { studentId: job.studentId, userId: job.userId });
        const weak = scores.words
          .filter((w) => w.errorType !== "None")
          .map((w) => ({ word: w.word, errorType: w.errorType, accuracy: round(wordAccuracy(w)) }));
        const out = await runAiTask<{ feedback: string }>(env, "reading_feedback", {
          title: ex.title,
          student_name: who.name ?? "em",
          student_gender: who.gender,
          student_age: who.age,
          passage: ex.passage,
          // transcript = điều máy NGHE được → để AI đối chiếu với đề, chỉ ra chỗ đọc nhầm.
          transcript: scores.transcript,
          // Rounded like the stored scores: the comment quotes what the learner sees on screen.
          pron_score: round(scores.pronScore),
          accuracy: round(scores.accuracy),
          fluency: round(scores.fluency),
          completeness: round(scores.completeness),
          prosody: scores.prosody == null ? null : round(scores.prosody),
          weak_words: weak,
          // Systematically weak sounds → the comment can suggest which sound to practise.
          weak_phonemes: collectWeakPhonemes(scores.words).map((p) => p.phoneme),
        });
        feedback = out.feedback;
      } catch {
        feedback = null;
      }
    }

    // Offload phoneme scores to R2 BEFORE insert (key = submission id, so we mint it here). R2
    // failure throws → job retries, never leaving a row whose detail blob is missing.
    const subId = crypto.randomUUID();
    await storeReadingWords(env, subId, scores.words);

    // Lưu kết quả + trỏ job tới submission. `words` để rỗng (đã ở R2); errorWords giữ lại từ sai
    // trong D1 cho thống kê/nhận xét khỏi chạm blob nặng.
    const [sub] = await db
      .insert(schema.readingSubmissions)
      .values({
        id: subId,
        exerciseId: ex.id,
        studentId: job.studentId,
        userId: job.userId,
        audioKey: job.audioKey,
        pronScore: round(scores.pronScore),
        accuracy: round(scores.accuracy),
        fluency: round(scores.fluency),
        completeness: round(scores.completeness),
        prosody: scores.prosody == null ? null : round(scores.prosody),
        transcript: scores.transcript,
        words: [],
        errorWords: errorWordsOf(scores.words),
        aiFeedback: feedback,
        durationMs: scores.durationMs,
      })
      .returning({ id: schema.readingSubmissions.id });

    await setStatus("done", { submissionId: sub.id, error: null });

    // Retention: giữ AUDIO cho {5 lượt gần nhất} ∪ {lượt điểm cao nhất}; xoá R2 phần còn lại
    // + rỗng audioKey (VẪN giữ điểm/nhận xét để vẽ tiến bộ + lịch sử). Áp cho cả student & user.
    try {
      if (job.studentId) await pruneReadingAudio(env, ex.id, { studentId: job.studentId });
      else if (job.userId) await pruneReadingAudio(env, ex.id, { userId: job.userId });
    } catch {
      /* dọn lỗi không ảnh hưởng kết quả */
    }
  } catch (e) {
    await setStatus("error", {
      error: applyTeacherTitle(
        e instanceof Error ? e.message : "Chấm bài thất bại, thử lại nhé.",
        (await getBrand(env).catch(() => null))?.title ?? "cô",
      ),
    }).catch(() => {});
  }
}

// Số lượt GẦN NHẤT giữ lại audio (ngoài ra luôn giữ audio của lượt điểm cao nhất).
const KEEP_RECENT_AUDIO = 5;

/**
 * Dọn audio cũ cho 1 (bài, học sinh): giữ audio của 5 lượt gần nhất + lượt best; các lượt
 * còn lại xoá object R2 và rỗng audioKey (giữ dòng để còn điểm/nhận xét/lịch sử).
 */
async function pruneReadingAudio(
  env: Bindings,
  exerciseId: string,
  owner: { studentId?: string; userId?: string },
): Promise<void> {
  const db = getDb(env.DB);
  const ownerWhere = owner.studentId
    ? eq(schema.readingSubmissions.studentId, owner.studentId)
    : eq(schema.readingSubmissions.userId, owner.userId!);
  const rows = await db
    .select({
      id: schema.readingSubmissions.id,
      audioKey: schema.readingSubmissions.audioKey,
      pronScore: schema.readingSubmissions.pronScore,
    })
    .from(schema.readingSubmissions)
    .where(and(eq(schema.readingSubmissions.exerciseId, exerciseId), ownerWhere))
    .orderBy(desc(schema.readingSubmissions.submittedAt));
  if (rows.length <= KEEP_RECENT_AUDIO) return;

  const keep = new Set(rows.slice(0, KEEP_RECENT_AUDIO).map((r) => r.id));
  // Luôn giữ lượt điểm cao nhất (best) dù cũ.
  const best = rows.reduce((m, r) => (r.pronScore > m.pronScore ? r : m), rows[0]);
  keep.add(best.id);

  for (const r of rows) {
    if (keep.has(r.id) || !r.audioKey) continue;
    await env.AUDIO.delete(r.audioKey).catch(() => {});
    await db
      .update(schema.readingSubmissions)
      .set({ audioKey: "" })
      .where(eq(schema.readingSubmissions.id, r.id));
  }
}
