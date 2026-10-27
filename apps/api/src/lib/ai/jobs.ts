// Xử lý một job "tạo bài bằng AI" từ hàng chờ (Cloudflare Queues consumer).
import { eq } from "drizzle-orm";
import type { ExerciseInput, VocabItemInput } from "@msyen/shared";
import { getDb, schema } from "../../db";
import type { Bindings } from "../env";
import { runAiTask } from "./hub";
import { sanitizeExercise, sanitizeReading, sanitizeWriting } from "./postprocess";
import { saveExercise } from "../saveExercise";
import { grammarCatalog, grammarFocusText, tagExerciseGrammar } from "../grammarTag";
import { autoExerciseAudio } from "../ttsJob";
import { aiFillItems, createSetWithItems } from "../vocabSets";

const now = () => new Date().toISOString();

/** Payload riêng của job BỘ THẺ, nhét trong `gen_config.deckJob` (khỏi thêm cột mới). */
type DeckJob = {
  teacherId: string;
  title?: string;
  level?: string | null;
  count?: number;
  levelId?: string | null;
  enrich?: boolean;
  /** Mô tả người học (độ tuổi…) để AI viết ví dụ hợp đối tượng. */
  learner?: string;
  words?: VocabItemInput[];
  activities?: string[];
  order?: "interleave" | "grouped";
  retryWrong?: boolean;
  pronounce?: "on" | "optional" | "off";
  /** Dạng mục cần lấy — gửi thành TRƯỜNG cho task, đừng nhét vào chuỗi prompt. */
  form?: "word" | "phrase" | "both";
};

export async function processAiJob(env: Bindings, jobId: string): Promise<void> {
  const db = getDb(env.DB);
  const job = await db.query.genJobs.findFirst({ where: eq(schema.genJobs.id, jobId) });
  if (!job || job.status === "done") return; // đã xử lý hoặc bị xóa

  await db
    .update(schema.genJobs)
    .set({ status: "generating", error: null, updatedAt: now() })
    .where(eq(schema.genJobs.id, jobId));

  try {
    let exercise: ExerciseInput;
    let droppedQuestions = 0;
    if (job.kind === "reading") {
      // Bài ĐỌC TO: cấu trúc khác (passage + wordlist, không câu hỏi).
      const out = await runAiTask<Record<string, unknown>>(env, "generate_reading", { prompt: job.prompt });
      exercise = sanitizeReading(out).exercise;
      if (!exercise.passage?.trim()) throw new Error("AI không tạo được đoạn văn — thử lại");
      // Tự phiên âm IPA cho đoạn văn (best effort).
      try {
        const ipa = await runAiTask<{ lines: { text: string; ipa: string }[] }>(env, "generate_ipa", { passage: exercise.passage });
        if (ipa.lines?.length) exercise.passage_ipa = ipa.lines;
      } catch {
        /* bỏ qua nếu IPA lỗi */
      }
    } else if (job.kind === "writing") {
      // Writing: prompt + outline + vocabulary, no questions.
      const out = await runAiTask<Record<string, unknown>>(env, "generate_writing", { prompt: job.prompt });
      exercise = sanitizeWriting(out).exercise;
      if (!exercise.speaking_prompt?.trim()) throw new Error("AI không tạo được đề viết — thử lại");
    } else if (job.kind === "deck") {
      // VOCABULARY DECK: no questions. AI picks the words (unless the teacher listed them), fills the
      // missing fields, and they become a new teacher set; the exercise practises that set.
      const cfg = ((job.genConfig ?? {}) as Record<string, unknown>).deckJob as DeckJob | undefined;
      if (!cfg?.teacherId) throw new Error("Job bộ thẻ thiếu cấu hình — tạo lại bài");

      let words: VocabItemInput[] = cfg.words ?? [];
      if (!words.length) {
        const out = await runAiTask<{ wordlist: VocabItemInput[] }>(env, "generate_wordlist", {
          source: job.prompt,
          count: cfg.count ?? 15,
          form: cfg.form ?? "both",
        });
        words = out.wordlist ?? [];
        if (!words.length) throw new Error("AI không tìm được từ nào — thử lại");
      }
      const context = [cfg.level && `trình độ ${cfg.level}`, cfg.learner].filter(Boolean).join(", ") || null;
      const items = cfg.enrich === false ? words : await aiFillItems(env, words, context);
      const title = cfg.title?.trim() || "Bộ thẻ từ vựng";
      const setId = await createSetWithItems(db, { teacherId: cfg.teacherId, name: title, levelId: cfg.levelId ?? null, items });

      exercise = {
        title,
        skill: "vocabulary",
        level: cfg.level ?? null,
        questions: [],
        vocab_deck: {
          source: "filter",
          filter: { setId },
          activities: cfg.activities ?? ["flashcard"],
          order: cfg.order ?? "grouped",
          retryWrong: cfg.retryWrong !== false,
          pronounce: cfg.pronounce ?? "off",
        },
      } as unknown as ExerciseInput;
    } else {
      // Kèm sổ tay ngữ pháp → AI gắn `grammar_id` ngay lúc sinh (khỏi tốn thêm lượt tag_grammar).
      // `template` (blueprint) chọn prompt quiz chuyên biệt; `focus` = khối GRAMMAR FOCUS chi tiết.
      const catalog = await grammarCatalog(db);
      const focus = await grammarFocusText(db, job.grammarIds ?? []);
      const out = await runAiTask<ExerciseInput>(env, "generate_exercise", { prompt: job.prompt, template: job.template, catalog, focus });
      const clean = sanitizeExercise(out, new Set(catalog.map((g) => g.id)));
      exercise = clean.exercise;
      droppedQuestions = clean.dropped;
      if (droppedQuestions) console.warn(`[genJob ${jobId}] bỏ ${droppedQuestions} câu không hợp lệ`);
      if (!exercise.questions.length) throw new Error("AI không tạo được câu hỏi hợp lệ — thử lại");
    }
    // tag_id do GV chọn ở AI drawer — server áp (AI KHÔNG tự sinh trường này).
    // template_id: gắn theo blueprint đã chọn (bài quiz) để bài mang đúng dạng.
    // overwriteId → ghi ĐÈ bài cũ (giữ slug/giao bài); NULL → tạo bài mới (slug hoá từ title).
    const input = { ...exercise, exercise_id: job.overwriteId ?? undefined, published: job.published, tag_id: job.tagId ?? null, layer: job.layer ?? null, topic_id: job.topicId ?? exercise.topic_id ?? null, template_id: job.template ?? exercise.template_id ?? null, gen_config: job.genConfig ?? null } as ExerciseInput;
    const { exerciseId, id, untagged } = await saveExercise(db, input);

    // `assignIds` là USERS.ID (picker lấy từ classesApi.students) → ghi vào `user_assignments`.
    // Trước đây ghi vào `assignments` (FK trỏ students.id) nên FK luôn fail, mà `.catch` lại
    // nuốt lỗi: cô thấy "đã giao N em" trong khi không ai được giao. KHÔNG nuốt lỗi nữa.
    for (const uid of job.assignIds ?? []) {
      await db.insert(schema.userAssignments).values({ userId: uid, exerciseId: id }).onConflictDoNothing();
    }

    await db
      .update(schema.genJobs)
      .set({ status: "done", title: exercise.title, exerciseId, error: null, dropped: droppedQuestions, updatedAt: now() })
      .where(eq(schema.genJobs.id, jobId));

    // Gắn điểm ngữ pháp cho từng câu — làm SAU khi đã báo done: bài vẫn dùng được ngay,
    // nhãn ngữ pháp chỉ là lớp phụ cho báo cáo, hỏng cũng không được kéo job xuống error.
    if (untagged > 0) {
      await tagExerciseGrammar(env, id).catch((e) => console.error("Gắn ngữ pháp lỗi:", e));
    }

    // Đề listening do AI sinh LUÔN có audio_script nhưng audio_url = null → tự sinh audio,
    // không thì bài xuất bản ra là học sinh không nghe được gì. Best effort như trên.
    await autoExerciseAudio(env, id).catch((e) => console.error("Tự tạo audio lỗi:", e));
  } catch (e) {
    // Vẫn còn job → đánh dấu error để giáo viên bấm "Thử lại".
    await db
      .update(schema.genJobs)
      .set({ status: "error", error: e instanceof Error ? e.message : "Lỗi tạo bài", updatedAt: now() })
      .where(eq(schema.genJobs.id, jobId))
      .catch(() => {});
  }
}
