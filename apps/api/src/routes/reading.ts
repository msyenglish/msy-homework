// Route GIÁO VIÊN — xem lại bài ĐỌC TO của học sinh + nhận xét.
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { dialogueRateForLevel } from "@msyen/shared";
import { getDb, schema } from "../db";
import { dialoguePoolsFor, synthesizeDialogue, synthesizeKaraoke, ttsAudioMeta, ttsVoiceInfo } from "../lib/media";
import { buildDialogueCast, dialogueSpeakers } from "../lib/dialogueCast";
import { generateReadingFeedback } from "../lib/recordFeedback";
import { fileUrl } from "../lib/files";
import { loadReadingWords, subErrorWords } from "../lib/readingWords";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

/**
 * Tạo AUDIO ĐỌC MẪU cho bài đọc to (TTS từ đoạn văn) → lưu R2 → trả url.
 * Dùng để hiển thị song song: học sinh nghe mẫu rồi đọc theo.
 */
r.post("/model-audio", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) throw new HTTPException(400, { message: "Thiếu đoạn văn để tạo audio" });
  const gender = body?.gender === "male" ? "male" : body?.gender === "female" ? "female" : undefined;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  // dialogue=true (trình soạn gửi cho bài NGHE): script có ≥2 nhãn vai → đọc NHIỀU GIỌNG (mỗi vai
  // một giọng, ghép + cues) như đường tự động, thay vì hạ về 1 giọng. Xem lib/dialogueCast.ts.
  const wantDialogue = body?.dialogue === true;
  const speakers = wantDialogue ? dialogueSpeakers(text) : [];

  let bytes: ArrayBuffer;
  let contentType: string;
  let cues: Awaited<ReturnType<typeof synthesizeKaraoke>>["cues"];
  let provider: string;
  let voice: string;
  if (speakers.length >= 2) {
    const dlg = await synthesizeDialogue(c.env, {
      script: text,
      cast: buildDialogueCast(speakers, dialogueRateForLevel(typeof body?.level === "string" ? body.level : null), await dialoguePoolsFor(c.env)),
    });
    bytes = dlg.bytes;
    contentType = dlg.contentType;
    cues = dlg.cues;
    provider = dlg.provider;
    voice = dlg.voices.join("+"); // nhãn nhận dạng nhiều giọng
  } else {
    ({ bytes, contentType, cues, provider, voice } = await synthesizeKaraoke(c.env, { text, gender }));
  }
  const key = `audio/model/${crypto.randomUUID()}.mp3`;
  // Voice label: a multi-role dialogue gets a short "<provider> · hội thoại N vai" tag; anything else
  // uses the usual ttsLabel.
  const isDlg = speakers.length >= 2;
  const ttsLabel = isDlg ? `${provider} · hội thoại ${speakers.length} vai` : ttsAudioMeta({ provider, voice }).ttsLabel;
  const voiceInfo = isDlg ? `${provider} / hội thoại ${speakers.length} vai` : ttsVoiceInfo({ provider, voice });
  const audioMeta = isDlg ? { ttsProvider: provider, ttsVoice: voice, ttsLabel } : ttsAudioMeta({ provider, voice });
  // Gắn tiêu đề bài vào file: customMetadata.title + tên tải về thân thiện (thay vì uuid).
  // Lọc ký tự không hợp lệ cho filename; rỗng thì để yên (giữ hành vi cũ).
  const safeName = title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 80);
  await c.env.AUDIO.put(key, bytes, {
    httpMetadata: {
      contentType,
      ...(safeName ? { contentDisposition: `inline; filename="${safeName}.mp3"` } : {}),
    },
    customMetadata: { ...audioMeta, ...(title ? { title } : {}) },
  });
  // cues: phụ đề đồng bộ word-level (giáo viên lưu vào audio_cues của bài).
  // ttsLabel: nhãn đẹp cho toast; voiceInfo: lưu vào audio_voice để nhận dạng.
  return c.json({ url: fileUrl(key), cues, ttsLabel, voiceInfo });
});

/** Danh sách lượt đọc đã nộp của 1 bài (mới nhất trước), kèm tên học sinh + điểm + audio. */
r.get("/by-exercise/:slug", async (c) => {
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({
    where: eq(schema.exercises.exerciseId, c.req.param("slug")),
  });
  if (!ex) throw new HTTPException(404, { message: "Không tìm thấy bài" });

  const rows = await db
    .select({
      id: schema.readingSubmissions.id,
      studentId: schema.readingSubmissions.studentId,
      userId: schema.readingSubmissions.userId,
      // Tên lấy từ CẢ HAI bảng: lượt của user (đường chính) nằm ở `users`, lượt cũ ở
      // `students`. Chỉ join students thì mọi dòng hiện tại đều ra tên rỗng.
      sName: schema.students.name,
      uName: schema.users.name,
      uEmail: schema.users.email,
      pronScore: schema.readingSubmissions.pronScore,
      accuracy: schema.readingSubmissions.accuracy,
      fluency: schema.readingSubmissions.fluency,
      completeness: schema.readingSubmissions.completeness,
      prosody: schema.readingSubmissions.prosody,
      transcript: schema.readingSubmissions.transcript,
      // `words` (chấm âm vị) KHÔNG trả ở list — client tải lười qua GET /:id/words khi mở chi tiết.
      aiFeedback: schema.readingSubmissions.aiFeedback,
      teacherFeedback: schema.readingSubmissions.teacherFeedback,
      audioKey: schema.readingSubmissions.audioKey,
      durationMs: schema.readingSubmissions.durationMs,
      submittedAt: schema.readingSubmissions.submittedAt,
    })
    .from(schema.readingSubmissions)
    .leftJoin(schema.students, eq(schema.readingSubmissions.studentId, schema.students.id))
    .leftJoin(schema.users, eq(schema.readingSubmissions.userId, schema.users.id))
    .where(eq(schema.readingSubmissions.exerciseId, ex.id))
    .orderBy(desc(schema.readingSubmissions.submittedAt));

  return c.json({
    exercise: { title: ex.title, exercise_id: ex.exerciseId, passage: ex.passage ?? "" },
    items: rows.map(({ sName, uName, uEmail, ...s }) => ({
      ...s,
      studentId: s.userId ?? s.studentId, // id để mở drawer tổng hợp (nhận cả hai loại)
      studentName: sName ?? uName ?? uEmail ?? "(không rõ)",
      audio_url: fileUrl(s.audioKey),
    })),
  });
});

/**
 * Tổng hợp PHÁT ÂM của 1 học sinh qua MỌI lượt đọc to (mới nhất trước) + số liệu gộp:
 * điểm TB, timeline tiến bộ, từ hay phát âm sai lặp lại. Cho trang tổng hợp giáo viên.
 */
// `:studentId` nhận CẢ users.id lẫn students.id — người học nay là `users`, nhưng bản ghi cũ
// vẫn treo ở `students`. Tra users trước (đường chính) rồi mới tới students (lịch sử).
// Không tách hai route vì mọi thứ phía sau giống hệt nhau, chỉ khác cột lọc.
r.get("/by-student/:studentId", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("studentId");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  const stu = user ? null : await db.query.students.findFirst({ where: eq(schema.students.id, id) });
  if (!user && !stu) throw new HTTPException(404, { message: "Không tìm thấy người học" });
  const ownerWhere = user
    ? eq(schema.readingSubmissions.userId, user.id)
    : eq(schema.readingSubmissions.studentId, stu!.id);
  const learner = { id: user?.id ?? stu!.id, name: (user ? user.name || user.email : stu!.name) ?? "" };

  const rows = await db
    .select({
      id: schema.readingSubmissions.id,
      exerciseTitle: schema.exercises.title,
      exerciseSlug: schema.exercises.exerciseId,
      pronScore: schema.readingSubmissions.pronScore,
      accuracy: schema.readingSubmissions.accuracy,
      fluency: schema.readingSubmissions.fluency,
      completeness: schema.readingSubmissions.completeness,
      prosody: schema.readingSubmissions.prosody,
      // Từ sai (nhỏ, ở D1) đủ cho weak_words; blob âm vị đầy đủ để R2, tải lười khi mở chi tiết.
      errorWords: schema.readingSubmissions.errorWords,
      words: schema.readingSubmissions.words, // legacy fallback cho subErrorWords
      aiFeedback: schema.readingSubmissions.aiFeedback,
      teacherFeedback: schema.readingSubmissions.teacherFeedback,
      audioKey: schema.readingSubmissions.audioKey,
      submittedAt: schema.readingSubmissions.submittedAt,
    })
    .from(schema.readingSubmissions)
    .leftJoin(schema.exercises, eq(schema.readingSubmissions.exerciseId, schema.exercises.id))
    .where(ownerWhere)
    .orderBy(desc(schema.readingSubmissions.submittedAt));

  // Số liệu gộp.
  const n = rows.length;
  const avg = (sel: (r: (typeof rows)[number]) => number) =>
    n ? Math.round(rows.reduce((s, r) => s + sel(r), 0) / n) : null;
  const wc: Record<string, number> = {};
  for (const r0 of rows)
    for (const w of subErrorWords(r0)) {
      const k = w.word.toLowerCase();
      wc[k] = (wc[k] ?? 0) + 1;
    }
  const weak_words = Object.entries(wc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));

  const stats = {
    count: n,
    avg_pron: avg((r) => r.pronScore),
    avg_accuracy: avg((r) => r.accuracy),
    avg_fluency: avg((r) => r.fluency),
    avg_completeness: avg((r) => r.completeness),
    // Timeline tăng dần theo thời gian (rows đang giảm dần → đảo).
    timeline: [...rows].reverse().map((r) => ({ date: r.submittedAt, pron: r.pronScore, title: r.exerciseTitle ?? "" })),
    weak_words,
  };

  return c.json({
    student: learner,
    stats,
    // Bỏ words/errorWords khỏi payload — chi tiết âm vị tải lười qua GET /:id/words.
    items: rows.map(({ words: _w, errorWords: _e, ...s }) => ({ ...s, audio_url: fileUrl(s.audioKey) })),
  });
});

/**
 * Tạo lại NHẬN XÉT AI cho 1 lượt đọc (dùng khi đã đổi prompt/điểm) — chấm lại từ
 * dữ liệu ĐÃ lưu (words/transcript/điểm), KHÔNG cần audio. Ghi đè `ai_feedback`.
 */
r.post("/:id/regenerate-feedback", async (c) => {
  const db = getDb(c.env.DB);
  const sub = await db.query.readingSubmissions.findFirst({
    where: eq(schema.readingSubmissions.id, c.req.param("id")),
  });
  if (!sub) throw new HTTPException(404, { message: "Không tìm thấy lượt đọc" });

  const feedback = await generateReadingFeedback(c.env, db, sub);

  await db.update(schema.readingSubmissions).set({ aiFeedback: feedback }).where(eq(schema.readingSubmissions.id, sub.id));
  return c.json({ feedback });
});

/** Giáo viên sửa/nhập nhận xét cho 1 lượt đọc. */
r.patch("/:id/feedback", async (c) => {
  const { feedback } = await c.req.json().catch(() => ({ feedback: "" }));
  const db = getDb(c.env.DB);
  await db
    .update(schema.readingSubmissions)
    .set({ teacherFeedback: typeof feedback === "string" ? feedback : null })
    .where(eq(schema.readingSubmissions.id, c.req.param("id")));
  return c.json({ ok: true });
});

/** Chấm âm vị đầy đủ của 1 lượt (tải lười khi mở chi tiết trong drawer) — từ R2 hoặc legacy D1. */
r.get("/:id/words", async (c) => {
  const db = getDb(c.env.DB);
  const sub = await db.query.readingSubmissions.findFirst({
    where: eq(schema.readingSubmissions.id, c.req.param("id")),
    columns: { id: true, words: true },
  });
  if (!sub) throw new HTTPException(404, { message: "Không tìm thấy lượt đọc" });
  return c.json({ words: await loadReadingWords(c.env, sub) });
});

export default r;
