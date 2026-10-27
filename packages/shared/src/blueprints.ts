import type { QuestionType, Skill } from "./types";

// ────────────────────────────────────────────────────────────────────────────
//  BLUEPRINT bài tập — taxonomy 2 cấp: Kỹ năng (skill) → Template (dạng bài).
//  Đây là NGUỒN SỰ THẬT chung (web + api) quyết định cho mỗi template:
//   • cấu trúc nội dung bắt buộc/tuỳ chọn/cấm (passage/audio/wordlist/…),
//   • tập dạng câu hỏi được phép (allowedTypes),
//   • the grading pipeline and the derived read_aloud flag,
//   • section nào hiện trong editor.
//  Prompt AI CHUYÊN biệt cho từng template nằm ở apps/api (lib/ai/prompts.ts),
//  tra theo `id`.
//  Kỹ năng chọn-1; muốn tổng hợp thì dùng skill "mixed" (kênh duy nhất được trộn).
// ────────────────────────────────────────────────────────────────────────────

/** Cách server chấm & cấu trúc gốc của bài. */
// "deck" = bộ thẻ từ vựng (vocab v2): không có mảng questions, nội dung là các TỪ tham chiếu
// từ ngân hàng qua exercises.vocab_deck; chấm tổng kết theo độ thành thạo mỗi từ.
// "video" = bài học qua VIDEO (YouTube): trộn nghe-viết (chấm như quiz) + shadowing (chấm phát âm),
// theo TỪNG ĐOẠN transcript. Nội dung ở cột video_* riêng, không có mảng questions.
export type GradingPipeline = "quiz" | "pronunciation" | "writing" | "dictation" | "deck" | "video";

/** Mức yêu cầu của một phần nội dung trong template. */
export type Req = "required" | "optional" | "forbidden";

/** Các phần nội dung của một bài — mỗi phần required/optional/forbidden theo template. */
export interface BlueprintStructure {
  passage: Req; // đoạn văn (đọc hiểu / đọc to)
  audioScript: Req; // kịch bản nghe (listening)
  wordlist: Req; // danh sách từ vựng
  grammarFocus: Req; // tập trung 1 điểm ngữ pháp
  questions: Req; // có mảng câu hỏi quiz
  speakingPrompt: Req; // writing prompt (column name kept from the retired speaking type)
  image: Req; // ảnh đề (tả tranh)
}

export interface Blueprint {
  id: string; // "grammar_drill"
  skill: Skill;
  label: string; // English type label (badge / template picker)
  desc: string; // mô tả ngắn
  phase: 1 | 2; // pha triển khai (2 = cần cơ chế mới)
  structure: BlueprintStructure;
  allowedTypes: QuestionType[]; // rỗng = bài không có câu hỏi
  gradingPipeline: GradingPipeline;
  readAloud: boolean; // cờ suy ra (tương thích cột cũ)
  video?: boolean; // bài học qua video (YouTube) — nội dung ở cột video_* riêng
}

// Cấu trúc "trống" (mọi phần forbidden) — mỗi template chỉ bật phần nó cần.
const NONE: BlueprintStructure = {
  passage: "forbidden",
  audioScript: "forbidden",
  wordlist: "forbidden",
  grammarFocus: "forbidden",
  questions: "forbidden",
  speakingPrompt: "forbidden",
  image: "forbidden",
};

/** Toàn bộ template phase 1 (dùng pipeline sẵn có). Phase 2 */
export const BLUEPRINTS: Blueprint[] = [
  {
    id: "grammar_drill",
    skill: "grammar",
    label: "Grammar drill",
    desc: "Focus on ONE grammar point; MCQ / gap-fill / ordering.",
    phase: 1,
    structure: { ...NONE, grammarFocus: "required", questions: "required" },
    // + categorize: sort by a grammatical category (e.g. regular/irregular, which tense).
    allowedTypes: ["multiple_choice", "fill_blank", "ordering", "categorize"],
    gradingPipeline: "quiz",
    readAloud: false,
  },
  {
    // Its OWN template rather than a question type inside grammar_drill: translation is productive
    // (the learner writes the whole sentence) and is practised one sentence at a time in the
    // translation drill's UI, not as a card in a scrolling quiz. Mixing the two in one exercise
    // would mean two different ways of working in the same sitting.
    id: "grammar_translate",
    skill: "grammar",
    label: "Grammar translate",
    desc: "Vietnamese prompt; the student writes the English sentence.",
    phase: 1,
    structure: { ...NONE, grammarFocus: "required", questions: "required" },
    allowedTypes: ["translate"],
    // Graded by the same server pass as a quiz (one submission row, score/total) — only the
    // renderer differs.
    gradingPipeline: "quiz",
    readAloud: false,
  },
  {
    id: "reading_comprehension",
    skill: "reading",
    label: "Reading comprehension",
    desc: "One passage; every question answered from the text.",
    phase: 1,
    // audioScript OPTIONAL: bài đọc thường kèm phần NGHE (audio + lời thoại) — giữ ô lời thoại
    // để giáo viên nhập/sinh transcript rồi tạo audio + phụ đề (TTS). AI vẫn chỉ sinh passage.
    // wordlist FORBIDDEN: từ vựng đã có kho riêng — bảng từ nhúng trùng dữ liệu, bỏ để giảm output.
    structure: { ...NONE, passage: "required", audioScript: "optional", wordlist: "forbidden", questions: "required" },
    // + categorize: phân loại thông tin trong bài (True/False, xếp theo đoạn…).
    allowedTypes: ["multiple_choice", "fill_blank", "matching", "ordering", "categorize"],
    gradingPipeline: "quiz",
    readAloud: false,
  },
  {
    id: "read_aloud",
    skill: "reading",
    label: "Read aloud",
    desc: "Student reads the passage aloud; pronunciation scored.",
    phase: 1,
    // wordlist FORBIDDEN: đọc to đã bấm-nghe từng từ + hiện IPA ngay trên đoạn văn; bảng từ riêng
    // (kèm nghĩa) vô nghĩa với việc luyện PHÁT ÂM → bỏ.
    structure: { ...NONE, passage: "required", wordlist: "forbidden" },
    allowedTypes: [],
    gradingPipeline: "pronunciation",
    readAloud: true,
  },
  {
    id: "vocab_builder",
    skill: "vocabulary",
    label: "Vocabulary deck",
    desc: "Words from the shared bank; practised as a flashcard deck (8 activities).",
    phase: 1,
    // Vocab v2: KHÔNG còn mảng questions. Từ sống ở ngân hàng `vocab_words`, bài chỉ tham chiếu
    // qua `vocab_deck` → các dạng thẻ tự dựng từ danh sách từ.
    structure: { ...NONE, wordlist: "required" },
    allowedTypes: [],
    gradingPipeline: "deck",
    readAloud: false,
  },
  {
    id: "listen_choose",
    skill: "listening",
    label: "Listen & choose",
    desc: "One audio script; questions follow the audio.",
    phase: 1,
    // wordlist FORBIDDEN: bài nghe không cần bảng từ nhúng (trùng dữ liệu, không phát âm, không vào
    // kho). Từ khó học qua bài vocab riêng. / vocab v2.
    structure: { ...NONE, audioScript: "required", wordlist: "forbidden", questions: "required" },
    // + matching: nối người nói ↔ ý / tên ↔ hoạt động (rất phổ biến trong đề nghe).
    allowedTypes: ["multiple_choice", "fill_blank", "matching"],
    gradingPipeline: "quiz",
    readAloud: false,
  },
  // (Đã khai tử template "dictation" dựa câu-hỏi — nghe-viết nay là 1 CHẾ ĐỘ của "dictation_shadowing".)
  {
    // Writing: reuses speakingPrompt as the writing prompt and speakingFramework as the outline,
    // graded as plain text by the LLM (grade_writing). Identified by `skill === "writing"`.
    id: "writing_essay",
    skill: "writing",
    label: "Essay writing",
    desc: "Prompt + outline; AI grades content, organisation, vocabulary and grammar.",
    phase: 1,
    structure: { ...NONE, speakingPrompt: "required", wordlist: "optional" },
    allowedTypes: [],
    gradingPipeline: "writing",
    readAloud: false,
  },
  {
    // NGHE & NÓI theo từng đoạn: nguồn AUDIO hoặc VIDEO (YouTube) × chế độ nghe-viết + nói nhại.
    // Nội dung ở cột segment riêng (media_source, youtube_id/audio_url, video_segments, video_modes),
    // KHÔNG có mảng questions.
    id: "dictation_shadowing",
    skill: "listening",
    label: "Dictation & Shadowing",
    desc: "Practice sentence by sentence: dictation + shadowing, from audio or a video.",
    phase: 2,
    structure: { ...NONE },
    allowedTypes: [],
    gradingPipeline: "video",
    readAloud: false,
    video: true,
  },
  {
    id: "mixed_all",
    skill: "mixed",
    label: "Mixed",
    desc: "The only kind that blends skills: passage + audio + many question types.",
    phase: 1,
    structure: {
      passage: "optional",
      audioScript: "optional",
      // wordlist FORBIDDEN: đồng bộ reading/listening — từ vựng đã có kho riêng, bỏ để giảm output.
      wordlist: "forbidden",
      grammarFocus: "optional",
      questions: "required",
      speakingPrompt: "forbidden",
      image: "optional",
    },
    allowedTypes: ["multiple_choice", "fill_blank", "matching", "ordering", "categorize"],
    gradingPipeline: "quiz",
    readAloud: false,
  },
];

const BY_ID = new Map(BLUEPRINTS.map((b) => [b.id, b]));

/** Blueprint theo id (an toàn với id lạ → undefined). */
// Alias id CŨ → id hiện tại (bài demo cũ có thể còn template_id cũ).
const BLUEPRINT_ALIASES: Record<string, string> = {
  video_practice: "dictation_shadowing",
  listen_practice: "dictation_shadowing",
};

export function getBlueprint(id: string | null | undefined): Blueprint | undefined {
  if (!id) return undefined;
  return BY_ID.get(id) ?? BY_ID.get(BLUEPRINT_ALIASES[id] ?? "");
}

/** Các template thuộc 1 kỹ năng, theo đúng thứ tự khai báo. */
export function blueprintsForSkill(skill: Skill): Blueprint[] {
  return BLUEPRINTS.filter((b) => b.skill === skill);
}

/** Template mặc định của 1 kỹ năng (cái đầu tiên) — dùng khi chọn skill mà chưa chọn template. */
export function defaultBlueprintForSkill(skill: Skill): Blueprint | undefined {
  return BLUEPRINTS.find((b) => b.skill === skill);
}

/**
 * Infer the template of an OLD exercise (no template_id) from its read_aloud/video flags + skill.
 * Dùng khi mở bài cũ hoặc migrate mềm. Trả id template hoặc undefined.
 */
export function inferTemplateId(ex: {
  skill?: string | null;
  read_aloud?: boolean | null;
  video?: boolean | null;
}): string | undefined {
  if (ex.video) return "dictation_shadowing";
  if (ex.read_aloud) return "read_aloud";
  const skill = ex.skill as Skill | undefined;
  if (!skill) return undefined;
  return defaultBlueprintForSkill(skill)?.id;
}
