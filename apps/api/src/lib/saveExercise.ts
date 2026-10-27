// Lưu/ghi đè một bài tập + thay toàn bộ câu hỏi. Dùng chung cho route POST
// và consumer hàng chờ AI. Chèn câu hỏi theo lô (D1 giới hạn ~100 bound-params/query).
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ExerciseInput, VocabDeckConfig } from "@msyen/shared";
import { schema, type Db } from "../db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

/** Tiền tố slug theo kỹ năng để PHÂN LOẠI qua URL (reading-…, grammar-…). Chỉ gắn khi
 *  tự sinh slug từ tiêu đề; đã có `skill` hợp lệ; và base chưa mang sẵn tiền tố đó. */
function skillPrefixed(base: string, skill: string | null | undefined): string {
  const s = skill?.trim();
  if (!s) return base;
  return base === s || base.startsWith(`${s}-`) ? base : `${s}-${base}`;
}

const QUESTION_BATCH = 5; // 15 cột/câu × 5 = 75 params < 100

/** Tìm slug CHƯA tồn tại: base, nếu trùng thì thêm hậu tố ngẫu nhiên ngắn (chống ghi đè khi trùng tiêu đề). */
async function uniqueSlug(db: Db, base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const hit = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, candidate) });
    if (!hit) return candidate;
    candidate = `${base}-${crypto.randomUUID().slice(0, 6)}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`; // dự phòng cực hiếm
}

/** Khoá nhận diện "vẫn là câu cũ" → giữ nguyên nhãn ngữ pháp AI đã gắn. */
const qKey = (q: { type: string; question: string }) => `${q.type}|${q.question.trim()}`;

/** Trả về { exerciseId (slug), id (row id), untagged: số câu CHƯA có nhãn ngữ pháp }. */
export async function saveExercise(
  db: Db,
  ex: ExerciseInput,
): Promise<{ exerciseId: string; id: string; untagged: number }> {
  // Có exercise_id (đang SỬA / slug chỉ định rõ) → dùng nguyên (upsert đúng bản, cho phép ghi đè có chủ đích).
  // KHÔNG có (tạo MỚI) → sinh slug từ tiêu đề + đảm bảo DUY NHẤT để bài mới KHÔNG ghi đè bài trùng tiêu đề.
  const exerciseId = ex.exercise_id?.trim()
    ? ex.exercise_id.trim()
    : await uniqueSlug(db, skillPrefixed(slugify(ex.title) || `ex-${crypto.randomUUID().slice(0, 8)}`, ex.skill));

  const values = {
    exerciseId,
    title: ex.title.trim(),
    published: ex.published ?? false,
    skill: ex.skill ?? null,
    level: ex.level || null,
    tags: ex.tags?.length ? ex.tags : null,
    topicId: ex.topic_id || null,
    // NHÃN của cô (quyết định phạm vi all/student) — thiếu dòng này thì chọn nhãn xong lưu
    // là mất trắng.
    tagId: ex.tag_id || null,
    layer: ex.layer || null,
    passage: ex.passage?.trim() || null,
    passageIpa: ex.passage_ipa?.length ? ex.passage_ipa : null,
    audioUrl: ex.audio_url?.trim() || null,
    audioScript: ex.audio_script?.trim() || null,
    audioVoice: ex.audio_voice?.trim() || null,
    audioCues: ex.audio_cues ?? null,
    dictationMode: ex.dictation_mode ?? null,
    translateLevel: ex.translate_level ?? null,
    readAloud: ex.read_aloud ?? false,
    wordlist: ex.wordlist?.length ? ex.wordlist : null,
    vocabDeck: (ex as { vocab_deck?: VocabDeckConfig | null }).vocab_deck ?? null,
    speakingPrompt: ex.speaking_prompt?.trim() || null,
    speakingFramework:
      ex.speaking_framework && (ex.speaking_framework.outline.length || ex.speaking_framework.phrases.length)
        ? ex.speaking_framework
        : null,
    speakingSample: ex.speaking_sample?.trim() || null,
    speakingImage: ex.speaking_image?.trim() || null,
    image: ex.image?.trim() || null,
    templateId: ex.template_id?.trim() || null,
    genConfig: ex.gen_config ?? null,
    video: ex.video ?? false,
    youtubeId: ex.youtube_id?.trim() || null,
    videoLang: ex.video_lang?.trim() || null,
    videoSegments: ex.video_segments?.length
      ? ex.video_segments.map((s) => ({
          i: s.i,
          start: s.start,
          end: s.end,
          text: s.text,
          vi: s.vi ?? null, // bản dịch — thiếu dòng này là mỗi lần lưu lại xoá sạch bản dịch AI vừa sinh
          ipa: s.ipa ?? null,
          blanks: s.blanks ?? null,
          words: s.words ?? null, // same trap as `vi`: dropping it wipes the karaoke timings on save
          alts: s.alts ?? null, // accepted spellings of numbers — dropped on save, typed answers fail again
        }))
      : null,
    videoModes: ex.video_modes?.length ? ex.video_modes : null,
  };

  // Định vị bản đang sửa: nếu ĐỔI slug (rename_from) → tra theo slug GỐC; còn lại theo slug hiện tại.
  const renameFrom = ex.rename_from?.trim();
  const lookupId = renameFrom || exerciseId;
  const existing = await db.query.exercises.findFirst({
    where: eq(schema.exercises.exerciseId, lookupId),
  });

  // Đổi slug: slug MỚI không được trùng bài KHÁC (unique) — báo lỗi thân thiện thay vì vỡ DB.
  if (existing && exerciseId !== existing.exerciseId) {
    const clash = await db.query.exercises.findFirst({
      where: eq(schema.exercises.exerciseId, exerciseId),
    });
    if (clash && clash.id !== existing.id) {
      throw new HTTPException(409, { message: `Slug “${exerciseId}” đã dùng cho bài khác — chọn slug khác.` });
    }
  }

  let rowId: string;
  // Nhãn ngữ pháp AI đã gắn cho câu CŨ — lưu bài là xoá sạch câu rồi chèn lại, nên phải
  // bắc cầu qua đây: câu nào giữ nguyên type+đề thì giữ nhãn (khỏi gọi AI lại tốn lượt),
  // câu nào sửa đề thì coi như mới → để trống cho AI gắn lại.
  const keptGrammar = new Map<string, string>();
  if (existing) {
    await db.update(schema.exercises).set(values).where(eq(schema.exercises.id, existing.id));
    rowId = existing.id;
    const prev = await db.select().from(schema.questions).where(eq(schema.questions.exerciseId, rowId));
    for (const q of prev) if (q.grammarId) keptGrammar.set(qKey(q), q.grammarId);
    await db.delete(schema.questions).where(eq(schema.questions.exerciseId, rowId));
  } else {
    const [row] = await db.insert(schema.exercises).values(values).returning({ id: schema.exercises.id });
    rowId = row.id;
  }

  let untagged = 0;
  if (ex.questions.length) {
    const rows = ex.questions.map((q, i) => ({
      exerciseId: rowId,
      position: i,
      type: q.type,
      question: q.question,
      image: q.image?.trim() || null,
      explanation: q.explanation?.trim() || null,
      options: q.type === "multiple_choice" ? (q.options ?? null) : null,
      // translate: `answer` is the canonical English sentence.
      answer:
        q.type === "multiple_choice" || q.type === "ordering" || q.type === "translate" ? (q.answer ?? null) : null,
      // `ordering` and `translate` both grade against `accept` too (alternative word orders /
      // equally valid renderings) — dropping it here silently marked those alternatives wrong.
      accept:
        q.type === "fill_blank" || q.type === "ordering" || q.type === "translate"
          ? (q.accept?.filter((a) => a.trim()) ?? null)
          : null,
      pairs: q.type === "matching" ? (q.pairs ?? null) : null,
      tokens: q.type === "ordering" ? (q.tokens ?? null) : null,
      categories: q.type === "categorize" ? (q.categories ?? null) : null,
      items: q.type === "categorize" ? (q.items ?? null) : null,
      wordBank: q.word_bank?.length ? q.word_bank : null,
      articleLenient: q.type === "translate" ? (q.article_lenient ?? true) : null,
      hint: q.hint?.trim() || null,
      // Ưu tiên nhãn người gọi chỉ định, sau đó tới nhãn cũ của chính câu này.
      grammarId: q.grammar_id?.trim() || keptGrammar.get(qKey(q)) || null,
    }));
    untagged = rows.filter((r) => !r.grammarId).length;
    for (let i = 0; i < rows.length; i += QUESTION_BATCH) {
      await db.insert(schema.questions).values(rows.slice(i, i + QUESTION_BATCH));
    }
  }

  return { exerciseId, id: rowId, untagged };
}
