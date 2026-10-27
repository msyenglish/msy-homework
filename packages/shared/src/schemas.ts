// ============================================================
//  Zod schemas — validate ở biên API (Hono) và tái dùng cho form web.
// ============================================================
import { z } from "zod";
import { QUESTION_TYPES, READER_BG_IDS, SKILLS, TAG_SCOPES } from "./types";

export const skillSchema = z.enum(SKILLS);
export const questionTypeSchema = z.enum(QUESTION_TYPES);

export const wordlistItemSchema = z.object({
  word: z.string(),
  ipa: z.string().optional(),
  meaning: z.string().optional(),
  example: z.string().optional(), // câu ví dụ minh hoạ cách dùng từ/cụm
  pos: z.string().optional(), // từ loại (n/v/adj/adv/np/phr…) — tách riêng khỏi `word`
});

export const matchPairSchema = z.object({
  left: z.string(),
  right: z.string(),
  left_image: z.string().nullish(),
  right_image: z.string().nullish(),
});

export const categorizeItemSchema = z.object({
  text: z.string(),
  category: z.string(),
  image: z.string().nullish(),
});

/** Mục trong DANH MỤC ngữ pháp nạp vào prompt — bản GỌN (id + tên + band + dấu hiệu). */
export const grammarCatalogItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  cefr: z.string().min(1),
  keywords: z.array(z.string()).nullish(),
});
export type GrammarCatalogItem = z.infer<typeof grammarCatalogItemSchema>;

export const questionInputSchema = z.object({
  type: questionTypeSchema,
  question: z.string().min(1),
  image: z.string().nullish(),
  word_bank: z.array(z.string()).nullish(),
  explanation: z.string().nullish(),
  // Gợi ý nghe per-câu: đoạn hội thoại ngắn chứa manh mối cho CHÍNH câu này.
  hint: z.string().nullish(),
  // multiple_choice
  options: z.array(z.string()).nullish(),
  answer: z.string().nullish(), // mc: đáp án · ordering: câu đúng
  // fill_blank
  accept: z.array(z.string()).nullish(),
  // matching
  pairs: z.array(matchPairSchema).nullish(),
  // ordering
  tokens: z.array(z.string()).nullish(),
  // categorize
  categories: z.array(z.string()).nullish(),
  items: z.array(categorizeItemSchema).nullish(),
  // translate — the Vietnamese prompt is `question`, the English is `answer` + `accept`.
  article_lenient: z.boolean().nullish(),
  // The grammar point this question targets (grammar.id) — AI tags a baseline, teachers can edit it.
  grammar_id: z.string().nullish(),
});

export const exerciseInputSchema = z.object({
  exercise_id: z.string().optional(),
  // Đổi slug bài đã có: slug GỐC để server định vị đúng bản rồi đổi tên (không tạo bản trùng).
  rename_from: z.string().optional(),
  title: z.string().min(1, "Cần nhập tiêu đề"),
  published: z.boolean().default(false),
  skill: skillSchema.nullish(),
  level: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  topic_id: z.string().nullish(), // chủ đề chính (topics.id)
  tag_id: z.string().nullish(), // nhãn của giáo viên (tags.id) — quyết định phạm vi. AI KHÔNG sinh trường này.
  layer: z.enum(["academic"]).nullish(), // 'academic' = lớp học thuật opt-in; null = lõi. AI KHÔNG sinh.
  passage: z.string().nullish(),
  passage_ipa: z.array(z.object({ text: z.string(), ipa: z.string(), vi: z.string().nullish() })).nullish(), // vi kept: dropping it wipes the translation on save
  audio_url: z.string().nullish(),
  audio_script: z.string().nullish(),
  // Nhãn giọng đã tạo audio (e.g. "azure / en-US-JennyNeural") — để nhận dạng ở trình soạn.
  audio_voice: z.string().nullish(),
  // Chế độ bài nghe–chép (dictation): mask (chép cả câu) · gap (điền chỗ trống) · full (viết lại).
  dictation_mode: z.enum(["mask", "gap", "full"]).nullish(),
  // Scaffolding rung for the `translate` questions of this exercise; null = "easy" (see grammarDrill.ts).
  translate_level: z.enum(TRANSLATE_LEVELS).nullish(),
  // Phụ đề đồng bộ word-level (sinh kèm khi tạo audio TTS).
  audio_cues: z
    .object({
      text: z.string(),
      words: z.array(z.object({ s: z.number(), e: z.number(), t: z.number(), d: z.number() })),
    })
    .nullish(),
  // Bài ĐỌC TO (chấm phát âm): học sinh đọc `passage`, không có câu hỏi trắc nghiệm.
  read_aloud: z.boolean().default(false),
  wordlist: z.array(wordlistItemSchema).nullish(),
  // Vocab v2: bộ thẻ tham chiếu ngân hàng từ (thay wordlist nhúng).
  vocab_deck: z.any().nullish(),
  // Writing prompt + outline (column names kept from the retired speaking type).
  speaking_prompt: z.string().nullish(),
  speaking_framework: z
    .object({ outline: z.array(z.string()).default([]), phrases: z.array(z.string()).default([]) })
    .nullish(),
  speaking_sample: z.string().nullish(), // bài mẫu (ẩn với học sinh) — nạp vào prompt AI chấm
  speaking_image: z.string().nullish(), // ảnh minh hoạ (bài tả tranh) — hiện cho học sinh
  image: z.string().nullish(), // ảnh bìa (thumbnail thư viện user) — không hiện đáp án
  template_id: z.string().nullish(), // dạng bài (blueprint) — xem blueprints.ts
  gen_config: z.record(z.string(), z.unknown()).nullish(), // config AI Composer đã dùng → để tạo lại
  // NGHE & NÓI theo đoạn (audio/video): nghe-viết + shadowing.
  media_source: z.enum(["audio", "video"]).nullish(), // nguồn media; null = suy theo youtube_id/audio_url
  video: z.boolean().optional(),
  youtube_id: z.string().nullish(),
  video_lang: z.string().nullish(),
  video_segments: z
    .array(
      z.object({
        i: z.number().int(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        vi: z.string().nullish(), // bản dịch (gợi ý ngữ cảnh)
        ipa: z.string().nullish(),
        blanks: z.array(z.number().int().min(0)).nullish(),
        // Word timings from STT — kept so the karaoke highlight survives a save/edit round trip.
        words: z
          .array(z.object({ w: z.string(), s: z.number(), e: z.number(), sp: z.number().int().optional() }))
          .nullish(),
        alts: z.record(z.string(), z.array(z.string().max(80)).max(8)).nullish(), // accepted spellings per word
      }),
    )
    .nullish(),
  video_modes: z.array(z.enum(["dictation", "shadowing"])).nullish(),
  questions: z.array(questionInputSchema),
});

export const studentInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Cần nhập tên"),
  contact: z.string().nullish(),
  note: z.string().nullish(),
  birth_year: z
    .number()
    .int()
    .min(1900, "Năm sinh không hợp lệ")
    .max(2100, "Năm sinh không hợp lệ")
    .nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  level_id: z.string().nullish(),
  active: z.boolean().default(true),
});

export const levelInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Cần nhập tên cấp độ"),
  color: z.string().default("#06b6d4"),
  icon: z.string().nullish(),
  position: z.number().optional(),
});
export type LevelInput = z.infer<typeof levelInputSchema>;

// Chủ đề (topic) — dùng chung create + update (phân biệt bằng có `id` hay không).
export const topicInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Cần nhập tên chủ đề"),
  color: z.string().default("#06b6d4"),
  icon: z.string().nullish(),
  parent_id: z.string().nullish(), // chủ đề cha (null = topic gốc)
  position: z.number().optional(),
});
export type TopicInput = z.infer<typeof topicInputSchema>;

// Nhãn (tag) — dùng chung create + update (phân biệt bằng có `id` hay không).
export const tagInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Cần nhập tên nhãn"),
  color: z.string().default("#06b6d4"),
  icon: z.string().nullish(),
  // Phạm vi hiển thị — mặc định "all" (dùng được cho cả học sinh lẫn user công khai).
  scope: z.enum(TAG_SCOPES).default("all"),
  position: z.number().optional(),
});
export type TagInput = z.infer<typeof tagInputSchema>;

// --- Ngữ pháp (grammar) — CRUD giáo viên. ---
const grammarFormSchema = z.object({
  label: z.string().min(1),
  formula: z.string().min(1),
  example: z.string().optional(),
});
const grammarExampleSchema = z.object({
  en: z.string().min(1),
  vi: z.string().min(1),
  kind: z.enum(["aff", "neg", "ques"]).optional(),
  note: z.string().optional(),
});
const grammarCompareSchema = z.object({
  with: z.string().min(1),
  note: z.string().min(1),
});
// Một mục trong "kho" tra cứu (danh mục cụm/từ cần nhớ): dùng cho phrasal verbs, giới từ đi
// kèm, cấu tạo từ… — nơi điểm ngữ pháp là DANH SÁCH nhiều mục hơn là một công thức.
const grammarBankItemSchema = z.object({
  term: z.string().min(1), // "turn on", "get up"
  meaning: z.string().min(1), // nghĩa tiếng Việt (có thể kèm nghĩa Anh gọn)
  example: z.string().optional(), // câu ví dụ ngắn (có nút nghe)
  group: z.string().optional(), // nhãn nhóm để gom (vd "Sinh hoạt", "Quần áo")
});
export const CEFR_BAND_VALUES = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const grammarInputSchema = z.object({
  id: z.string().min(1, "Cần id (slug)").regex(/^[a-z0-9-]+$/, "id chỉ gồm chữ thường, số, gạch ngang"),
  title: z.string().min(1, "Cần tiêu đề"),
  category: z.string().min(1, "Cần nhóm"),
  cefr: z.enum(CEFR_BAND_VALUES),
  summary: z.string().min(1, "Cần tóm tắt"),
  forms: z.array(grammarFormSchema).min(1, "Cần ít nhất 1 công thức"),
  signals: z.array(z.string()).nullish(),
  usage: z.array(z.string()).min(1, "Cần ít nhất 1 cách dùng"),
  spelling: z.array(z.string()).nullish(),
  examples: z.array(grammarExampleSchema).min(1, "Cần ít nhất 1 ví dụ"),
  mistakes: z.array(z.string()).nullish(),
  tips: z.array(z.string()).nullish(),
  compare: z.array(grammarCompareSchema).nullish(),
  related: z.array(z.string()).nullish(),
  keywords: z.array(z.string()).nullish(),
  bank: z.array(grammarBankItemSchema).nullish(),
  position: z.number().optional(),
});
export type GrammarInput = z.infer<typeof grammarInputSchema>;

// Chủ nhân báo cáo: `user_id` (thành viên lớp — cách làm hiện tại) HOẶC `student_id`
// (học sinh cũ, dữ liệu lịch sử). Phải có đúng một.
export const reportSaveSchema = z
  .object({
    student_id: z.string().min(1).nullish(),
    user_id: z.string().min(1).nullish(),
    month: z.string().min(1),
    content: z.string().min(1, "Báo cáo trống"),
  })
  .refine((v) => !!v.student_id !== !!v.user_id, { message: "Cần chọn đúng một người học" });
export type ReportSaveInput = z.infer<typeof reportSaveSchema>;

export const assignInputSchema = z.object({
  student_id: z.string().min(1),
  exercise_ids: z.array(z.string()),
  note: z.string().nullish(),
});

export const loginInputSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

// Reader display preferences (teleprompter/IPA) — stored per learner.
export const readerPrefsSchema = z.object({
  shadowing: z.boolean(),
  ipa: z.boolean(),
  speed: z.number().int().min(1).max(7),
  lines: z.number().int().min(1).max(6),
  fontSize: z.number().int().min(1).max(7).default(3), // dải 1..7; tương thích bản ghi cũ chưa có cỡ chữ
  // Nền vùng chữ chạy; .default để bản ghi cũ (chưa có trường này) vẫn parse được.
  // .catch: mã nền cũ đã gỡ thì quy về "auto", không làm hỏng cả lần lưu prefs.
  bg: z.enum(READER_BG_IDS).catch("auto"),
  bgOverlay: z.boolean().catch(true),
});

// --- User CÔNG KHAI (public self-serve) — đăng ký / đăng nhập bằng email + mật khẩu ---
export const userRegisterSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  name: z.string().trim().min(1, "Thiếu tên").max(80).nullish(),
  level_id: z.string().nullish(), // level user tự chọn (có thể đổi sau ở hồ sơ)
});

export const userLoginSchema = z.object({
  email: z.string().min(1, "Thiếu email"),
  password: z.string().min(1, "Thiếu mật khẩu"),
});

// --- Lớp học (giáo viên) ---
export const classSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên lớp").max(80),
  note: z.string().trim().max(500).nullish(),
  active: z.boolean().optional(),
});

// Teacher creates a plain account (Users page). Optionally enrolls it into a class right away
// (class_id) so two steps collapse into one. No class_id → an ordinary account.
export const teacherUserCreateSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên").max(80),
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  level_id: z.string().nullish(),
  birth_year: z.number().int().min(1900).max(2100).nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  class_id: z.string().nullish(), // enroll into this class right away (optional)
});

// ENROLL A STUDENT — email-first: look the user up by email.
//  · email already has an account → just add it to the class.
//  · email unknown → the server creates the user on the spot (`name` required; `password`
//    generated when blank, and the teacher hands it over via the reset panel).
export const classEnrollSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  name: z.string().trim().min(1).max(80).nullish(),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").nullish(),
  level_id: z.string().nullish(),
});

// Thêm user ĐÃ CÓ vào lớp (em tự đăng ký trước, cô gắn vào lớp sau).
export const classMemberAddSchema = z.object({
  user_id: z.string().min(1, "Thiếu user"),
});

// Đặt/đổi mật khẩu user công khai — chỉ cần mật khẩu MỚI (không hỏi mật khẩu cũ).
// Cho phép cả tài khoản Google tạo mật khẩu để đăng nhập thêm bằng email.
export const userSetPasswordSchema = z.object({
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

// Quên mật khẩu — gửi link đặt lại qua email. Server LUÔN trả về như nhau dù email
// có tồn tại hay không (chống dò email).
export const forgotPasswordSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
});

// Đặt lại mật khẩu bằng token trong link email (hết hạn ~30 phút, dùng 1 lần).
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Thiếu mã đặt lại"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

// Cập nhật hồ sơ user (tên, level, năm sinh, giới tính) — dùng cho onboarding + màn hồ sơ.
export const userProfileSchema = z.object({
  name: z.string().trim().min(1).max(24, "Tên tối đa 24 ký tự").nullish(),
  level_id: z.string().nullish(),
  topics: z.array(z.string()).nullish(), // chủ đề quan tâm (mảng topics.id); [] = tất cả
  birth_year: z.number().int().min(1900).max(2100).nullish(),
  gender: z.enum(["male", "female", "other"]).nullish(),
  voice_gender: z.enum(["male", "female"]).nullish(), // giọng đọc TỪ ưa thích (khác `gender`)
  voice_gender_sentence: z.enum(["male", "female"]).nullish(), // giọng đọc CÂU/đoạn dài
  library_view: z.enum(["grid", "list"]).nullish(), // kiểu xem thư viện bài
  theme: z.enum(["light", "dark"]).nullish(), // giao diện sáng/tối
  academic_enabled: z.boolean().optional(), // bật lớp học thuật (opt-in)
});

// User tự yêu cầu đổi email (hiệu lực sau 2 ngày). `password` để xác minh khi tài khoản có mật khẩu.
export const requestEmailChangeSchema = z.object({
  new_email: z.string().trim().email("Email không hợp lệ").max(160),
  password: z.string().optional(),
});

// Kho từ vựng: đánh dấu đã thuộc + phát âm (TTS) một từ. `word` để nguyên; server tự lowercase.
export const vocabLearnedSchema = z.object({
  word: z.string().trim().min(1, "Thiếu từ"),
  learned: z.boolean(),
});
export const vocabSpeakSchema = z.object({
  word: z.string().trim().min(1, "Thiếu từ").max(80, "Từ quá dài"),
  // Voice picked by gender; the server maps it to an Azure neural voice.
  gender: z.enum(["male", "female"]).optional(),
});
// Đọc một CÂU (ví dụ ngữ pháp) — dài hơn từ đơn nên nới hạn; cache R2 theo đường riêng.
export const speakSentenceSchema = z.object({
  text: z.string().trim().min(1, "Thiếu câu").max(400, "Câu quá dài"),
  gender: z.enum(["male", "female"]).optional(),
});
// Đánh dấu đã học một điểm ngữ pháp (id slug).
export const grammarLearnedSchema = z.object({
  id: z.string().trim().min(1).max(80),
  learned: z.boolean(),
});

// Ghim/bỏ ghim một điểm ngữ pháp để luyện tiếp. `ids` cho phép ghim cả chùm (từ nhận xét).
export const grammarMarkedSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  ids: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  marked: z.boolean(),
});

// ============================================================
//  AI (Gemini) — schema cho request từ web & output do model trả về.
//  Output schema dùng để validate JSON model sinh ra (chống rác).
// ============================================================

// --- Nhóm 1: nhận xét cho học sinh (dựa trên bài đã chấm điểm) ---
export const aiFeedbackItemSchema = z.object({
  question: z.string(),
  student_answer: z.string(),
  correct_answer: z.string().nullish(),
  correct: z.boolean(),
});
export const aiFeedbackInputSchema = z.object({
  title: z.string().min(1),
  skill: skillSchema.nullish(),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
  student_name: z.string().nullish(),
  // Optional learner profile — only feeds the greeting line. Absent for guests / unfinished
  // onboarding, so the prompt must read fine with all three missing.
  student_gender: z.enum(["male", "female", "other"]).nullish(),
  student_age: z.number().int().min(3).max(99).nullish(),
  passage: z.string().nullish(), // ngữ liệu (bài đọc/kịch bản nghe) để nhận xét sát
  items: z.array(aiFeedbackItemSchema),
});
export const aiFeedbackOutputSchema = z.object({
  feedback: z.string().min(1), // đoạn nhận xét tiếng Việt hoàn chỉnh, dán thẳng vào ô nhận xét
});

// --- Nhóm 1b: nhận xét bài ĐỌC TO (dựa trên điểm phát âm của Azure) ---
export const readingWordScoreSchema = z.object({
  word: z.string(),
  accuracy: z.number(), // 0-100
  errorType: z.enum(["None", "Mispronunciation", "Omission", "Insertion"]).default("None"),
});

export const aiReadingFeedbackInputSchema = z.object({
  title: z.string().min(1),
  student_name: z.string().nullish(),
  // Optional learner profile — greeting only, same as the quiz feedback task.
  student_gender: z.enum(["male", "female", "other"]).nullish(),
  student_age: z.number().int().min(3).max(99).nullish(),
  passage: z.string().min(1),
  // Điều máy NGHE được (Azure transcript) — để AI đối chiếu đề, chỉ ra chỗ đọc nhầm/lặp.
  transcript: z.string().nullish(),
  pron_score: z.number(),
  accuracy: z.number(),
  fluency: z.number(),
  completeness: z.number(),
  prosody: z.number().nullish(),
  // Chỉ gửi các từ đọc CHƯA tốt để AI nhận xét trọng tâm (tránh prompt quá dài).
  weak_words: z
    .array(z.object({ word: z.string(), errorType: z.string(), accuracy: z.number().nullish() }))
    .default([]),
  // Âm vị (IPA) đọc sai HỆ THỐNG cả bài — để AI gợi ý luyện đúng ÂM, không chỉ từ.
  weak_phonemes: z.array(z.string()).default([]),
});
export const aiReadingFeedbackOutputSchema = z.object({
  feedback: z.string().min(1),
});

// --- Writing grading: one AI pass reads the piece, scores 4 class criteria (0-100) and comments.
export const aiWritingJudgeInputSchema = z.object({
  title: z.string().min(1),
  student_name: z.string().nullish(),
  prompt: z.string().min(1), // the writing task
  outline: z.array(z.string()).default([]), // suggested outline
  sample: z.string().nullish(), // model answer (hidden from the learner) — a reference point
  level: z.string().nullish(),
  text: z.string().min(1), // the learner's piece
  word_count: z.number().int().min(0),
  // The learner's best earlier draft of the same task, so the comment can speak to progress.
  previous: z
    .object({
      attempt_no: z.number().int().min(1),
      score: z.number().nullish(),
      text: z.string(),
      feedback: z.string().nullish(),
    })
    .nullish(),
});

// `analysis` comes before the scores (reason first), `feedback` last (written once scores are set).
export const aiWritingJudgeOutputSchema = z.object({
  analysis: z.string().min(1),
  content: z.coerce.number().min(0).max(100), // answers the task, ideas developed
  organisation: z.coerce.number().min(0).max(100), // structure, paragraphs, linking
  vocabulary: z.coerce.number().min(0).max(100), // range and accuracy of words
  grammar: z.coerce.number().min(0).max(100), // sentence accuracy
  feedback: z.string().min(1), // teacher-to-learner comment (Vietnamese)
});

// --- Nhóm 2: sinh câu hỏi bài tập ---
export const aiGenerateQuestionsInputSchema = z.object({
  source: z.string().min(1, "Cần nội dung nguồn hoặc chủ đề"),
  skill: skillSchema.nullish(),
  level: z.string().nullish(), // độ khó / cấp độ (vd "Starter", "lớp 3", "intermediate")
  count: z.number().int().min(1).max(20).default(5),
  types: z.array(questionTypeSchema).nonempty().default(["multiple_choice"]),
  catalog: z.array(grammarCatalogItemSchema).nullish(), // sổ tay ngữ pháp → AI gắn `grammar_id`
  // NHẮM ĐIỂM NGỮ PHÁP. Có `grammar_ids` → server nạp mô tả chi tiết từng điểm vào `focus` và
  // thu danh mục về đúng các điểm đó; có `bands` → thu danh mục về các cấp CEFR đã chọn (bốc
  // ngẫu nhiên trong cấp). Không có gì → giữ nguyên hành vi cũ (nạp cả danh mục).
  grammar_ids: z.array(z.string().min(1)).max(8).nullish(),
  bands: z.array(z.enum(CEFR_BANDS)).nullish(),
  focus: z.string().nullish(), // khối mô tả chi tiết do server dựng (grammarFocusText)
  context: z.string().max(300).nullish(), // bối cảnh/tình huống
  keywords: z.string().max(300).nullish(), // từ khoá phải xuất hiện
  difficulty: z.enum(["easy", "medium", "hard"]).nullish(),
});
export const aiGenerateQuestionsOutputSchema = z.object({
  questions: z.array(questionInputSchema),
});

// --- Nhóm 2b: sinh TRỌN bài tập (AI Composer) — prompt-first, tối giản ---
// Giáo viên gõ TỰ DO một yêu cầu; tri thức giáo trình/level/dạng bài nằm ở
// system prompt (lib/ai/prompts.ts) nên input rất gọn, dễ maintain.
export const aiGenerateExerciseInputSchema = z.object({
  prompt: z.string().min(1, "Nhập yêu cầu tạo bài"),
  // Template (blueprint) để chọn prompt CHUYÊN biệt theo dạng bài (grammar_drill,
  // reading_comprehension, vocab_builder, listen_choose, mixed_all). Null → suy theo skill/mixed.
  template: z.string().nullish(),
  // Khối GRAMMAR FOCUS (form/dấu hiệu/lỗi thường gặp) — server dựng từ grammar_ids rồi nhét
  // vào prompt để câu hỏi chính xác, đáp án duy nhất đúng.
  focus: z.string().nullish(),
  // Sổ tay ngữ pháp (bản gọn) — có thì AI gắn luôn `grammar_id` cho từng câu ngay lúc
  // sinh bài, khỏi tốn thêm 1 lượt tag_grammar sau đó.
  catalog: z.array(grammarCatalogItemSchema).nullish(),
});
// Output NỚI LỎNG: chỉ cần title + mảng questions; phần lọc/chuẩn hóa từng câu
// do sanitizeExercise (server) lo → tránh việc 1 câu lệch làm hỏng cả bài.
export const aiGenerateExerciseOutputSchema = z
  .object({
    title: z.string().min(1),
    questions: z.array(z.any()).default([]),
  })
  .passthrough();
export type AiGenerateExerciseInput = z.infer<typeof aiGenerateExerciseInputSchema>;

// --- Nhóm 2b': sinh bài ĐỌC TO (reading record) — cấu trúc KHÁC bài quiz ---
// Không có questions; thay bằng passage (đoạn đọc) + wordlist. read_aloud=true.
export const aiGenerateReadingInputSchema = z.object({
  prompt: z.string().min(1, "Nhập yêu cầu tạo bài đọc"),
});
export const aiGenerateReadingOutputSchema = z
  .object({
    title: z.string().min(1),
    passage: z.string().min(1),
  })
  .passthrough();
export type AiGenerateReadingInput = z.infer<typeof aiGenerateReadingInputSchema>;

// --- Sinh trọn bài SPEAKING (nói tự do): đề + khung mẫu + từ vựng ---
export const aiGenerateSpeakingInputSchema = z.object({
  prompt: z.string().min(1, "Nhập yêu cầu tạo bài nói"),
});
export const aiGenerateSpeakingOutputSchema = z
  .object({
    title: z.string().min(1),
    speaking_prompt: z.string().min(1),
  })
  .passthrough();
export type AiGenerateSpeakingInput = z.infer<typeof aiGenerateSpeakingInputSchema>;



// --- Nhóm 2b'': phiên âm IPA đoạn văn (theo câu) cho bài đọc to ---
export const aiIpaInputSchema = z.object({
  passage: z.string().min(1, "Cần đoạn văn để phiên âm"),
});
export const aiIpaOutputSchema = z.object({
  lines: z.array(z.object({ text: z.string(), ipa: z.string(), vi: z.string().nullish() })),
});
export type AiIpaInput = z.infer<typeof aiIpaInputSchema>;

// --- Gắn NGỮ PHÁP cho từng câu hỏi (chọn trong sổ tay `grammar` có sẵn) ---
// Catalog truyền vào là danh sách điểm ngữ pháp CÓ THẬT; server tự loại id bịa sau khi model trả.
export const aiTagGrammarInputSchema = z.object({
  title: z.string().min(1),
  skill: z.string().nullish(),
  level: z.string().nullish(),
  passage: z.string().nullish(), // đoạn văn/kịch bản nghe (nếu có) — thêm ngữ cảnh
  catalog: z.array(grammarCatalogItemSchema).min(1, "Sổ tay ngữ pháp đang trống"),
  questions: z
    .array(
      z.object({
        position: z.number(),
        type: z.string(),
        question: z.string(),
        options: z.array(z.string()).nullish(),
        answer: z.string().nullish(),
        explanation: z.string().nullish(),
      }),
    )
    .min(1, "Không có câu hỏi để gắn"),
});
export const aiTagGrammarOutputSchema = z.object({
  tags: z.array(
    z.object({
      position: z.number(),
      // null = câu không nhắm điểm ngữ pháp nào rõ ràng (đọc hiểu ý, từ vựng thuần…).
      grammar_id: z.string().nullish(),
    }),
  ),
});
export type AiTagGrammarInput = z.infer<typeof aiTagGrammarInputSchema>;

// --- Nhóm 2c: chuẩn hóa yêu cầu thô của giáo viên thành prompt gạch đầu dòng ---
export const aiRefinePromptInputSchema = z.object({
  text: z.string().min(1, "Nhập yêu cầu cần chuẩn hóa"),
  // Ngữ cảnh CÁC FIELD đã chọn (skill/type/level/topic…) để Enhance làm giàu mà KHÔNG lặp lại.
  context: z.string().nullish(),
});
export const aiRefinePromptOutputSchema = z.object({
  prompt: z.string(),
});

// Gợi ý GỘP Context/setting + Target vocabulary trong 1 lần gọi (tiết kiệm) — theo metadata.
export const aiSuggestPairInputSchema = z.object({
  context: z.string().nullish(), // metadata đã chọn (skill/type/level/topic/age/tone…) + input nền
  full: z.boolean().default(false), // true → sinh thêm `instructions` (Auto-fill tất cả)
  // Bài BỘ THẺ từ vựng không có câu hỏi → `instructions` phải nói về cách CHỌN TỪ,
  // không phải về đáp án/nhiễu. Mặc định "quiz" để mọi mode cũ giữ nguyên hành vi.
  kind: z.enum(["quiz", "vocab"]).default("quiz"),
});
export const aiSuggestPairOutputSchema = z.object({
  context: z.string(),
  vocabulary: z.string(),
  instructions: z.string().optional(), // chỉ khi full = true
  // Bộ thẻ từ vựng: AI đặt luôn tên bài để GV khỏi gõ tay (kind = "vocab").
  title: z.string().optional(),
});

// --- Dịch dàn ý bài NÓI sang tiếng Việt (học sinh bấm icon dịch) ---
export const aiTranslateOutlineInputSchema = z.object({
  outline: z.array(z.string().min(1)).min(1).max(12),
});
export const aiTranslateOutlineOutputSchema = z.object({
  vi: z.array(z.string()), // cùng số lượng & thứ tự với `outline`
});

// --- Nhóm 3: sinh wordlist / từ vựng ---
export const aiGenerateWordlistInputSchema = z.object({
  source: z.string().min(1, "Cần danh sách từ hoặc chủ đề"),
  // Trần 60 = trần ô "Số từ" ở trình soạn bộ thẻ; lệch nhau thì chọn 50 là 400 ngay ở biên.
  count: z.number().int().min(1).max(60).default(10),
  // Dạng mục cần lấy — trước đây nhét vào `source` nên model coi như văn bản nền và hay bỏ qua.
  form: z.enum(["word", "phrase", "both"]).default("both"),
  // Từ ĐÃ có trong bộ thẻ → cấm trả lại (bấm "Gợi ý" lần hai phải ra từ MỚI, không lặp).
  exclude: z.array(z.string()).max(300).default([]),
});
export const aiGenerateWordlistOutputSchema = z.object({
  wordlist: z.array(
    // `pos` để mode AI khỏi phải gọi fill_vocab lần hai chỉ vì thiếu mỗi từ loại.
    wordlistItemSchema.extend({ example: z.string().optional(), pos: z.string().optional() }),
  ),
});

// --- Nhóm 4: báo cáo học tập theo tháng (đánh giá tổng hợp) ---
export const aiMonthlyReportInputSchema = z.object({
  student_name: z.string().min(1),
  month: z.string().min(1), // "2026-07"
  teacher_note: z.string().nullish(),
  summary: z.object({
    exercises_done: z.number().int().min(0),
    avg_pct: z.number().nullish(), // điểm trung bình %
    by_skill: z.array(
      z.object({
        skill: z.string(),
        done: z.number().int().min(0),
        avg_pct: z.number().nullish(),
      }),
    ),
    // Phần đọc to (chấm phát âm) — optional; báo cáo cũ không có.
    reading: z
      .object({
        count: z.number().int().min(0),
        avg_pron: z.number().nullish(),
        avg_accuracy: z.number().nullish(),
        avg_fluency: z.number().nullish(),
        avg_completeness: z.number().nullish(),
        weak_words: z.array(z.object({ word: z.string(), count: z.number().int() })).default([]),
        notes: z.array(z.string()).default([]),
      })
      .nullish(),
    // Khối mở rộng — optional để summary cũ (destructure từ computeReportStats) vẫn hợp lệ.
    attendance: z
      .object({
        active_days: z.number().int().min(0),
        streak_days: z.number().int().min(0),
        best_streak_days: z.number().int().min(0),
        total_points: z.number().int().min(0),
        rank: z.number().int().nullish(),
      })
      .nullish(),
    speaking: z
      .object({
        count: z.number().int().min(0),
        avg_score: z.number().nullish(),
        avg_band: z.number().nullish(),
        avg_prosody: z.number().nullish(),
      })
      .nullish(),
    question_types: z
      .array(z.object({ type: z.string(), correct: z.number().int(), total: z.number().int(), accuracy: z.number() }))
      .nullish(),
    vocab: z
      .object({
        sessions: z.number().int().min(0),
        avg_pct: z.number().nullish(),
        words_learned: z.number().int().min(0),
        words_mastered: z.number().int().min(0),
      })
      .nullish(),
    // Weakest grammar points of the period (wrong / seen), from the questions' grammar tags.
    grammar: z
      .array(z.object({ title: z.string(), category: z.string().nullish(), wrong: z.number().int(), seen: z.number().int() }))
      .nullish(),
  }),
  mistakes: z.array(
    z.object({
      exercise: z.string().nullish(),
      skill: z.string().nullish(),
      question: z.string(),
      student_answer: z.string(),
      correct_answer: z.string().nullish(),
    }),
  ),
});
export const aiMonthlyReportOutputSchema = z.object({
  report: z.string().min(1), // báo cáo tiếng Việt hoàn chỉnh cho phụ huynh
});
export type AiMonthlyReportInput = z.infer<typeof aiMonthlyReportInputSchema>;
export type AiMonthlyReportOutput = z.infer<typeof aiMonthlyReportOutputSchema>;

// Phân loại câu sai thành 2–4 CHỦ ĐIỂM cần luyện (mỗi chủ điểm kèm gợi ý ngắn).
export const aiReportFocusInputSchema = z.object({
  student_name: z.string().min(1),
  mistakes: z.array(
    z.object({
      skill: z.string().nullish(),
      question: z.string(),
      student_answer: z.string(),
      correct_answer: z.string().nullish(),
    }),
  ),
});
export const aiReportFocusOutputSchema = z.object({
  focus: z
    .array(
      z.object({
        topic: z.string().min(1), // tên chủ điểm ngắn, vd "Cụm động từ (phrasal verbs)"
        note: z.string().min(1), // gợi ý luyện tập 1 câu, dễ hiểu cho phụ huynh
      }),
    )
    .max(4),
});
export type AiReportFocusInput = z.infer<typeof aiReportFocusInputSchema>;
export type AiReportFocusOutput = z.infer<typeof aiReportFocusOutputSchema>;

export type AiFeedbackInput = z.infer<typeof aiFeedbackInputSchema>;
export type AiFeedbackOutput = z.infer<typeof aiFeedbackOutputSchema>;
export type ReadingWordScore = z.infer<typeof readingWordScoreSchema>;
export type AiReadingFeedbackInput = z.infer<typeof aiReadingFeedbackInputSchema>;
export type AiReadingFeedbackOutput = z.infer<typeof aiReadingFeedbackOutputSchema>;
export type AiWritingJudgeInput = z.infer<typeof aiWritingJudgeInputSchema>;
export type AiWritingJudgeOutput = z.infer<typeof aiWritingJudgeOutputSchema>;
export type AiGenerateQuestionsInput = z.infer<typeof aiGenerateQuestionsInputSchema>;
export type AiGenerateQuestionsOutput = z.infer<typeof aiGenerateQuestionsOutputSchema>;
export type AiGenerateWordlistInput = z.infer<typeof aiGenerateWordlistInputSchema>;
export type AiGenerateWordlistOutput = z.infer<typeof aiGenerateWordlistOutputSchema>;

export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
export type StudentInput = z.infer<typeof studentInputSchema>;
export type AssignInput = z.infer<typeof assignInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type UserRegisterInput = z.infer<typeof userRegisterSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type ClassInput = z.infer<typeof classSchema>;
export type ClassEnrollInput = z.infer<typeof classEnrollSchema>;
export type TeacherUserCreateInput = z.infer<typeof teacherUserCreateSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
export type VocabLearnedInput = z.infer<typeof vocabLearnedSchema>;
export type VocabSpeakInput = z.infer<typeof vocabSpeakSchema>;

// ============================================================
//  VOCABULARY — teacher sets + learner's own words (zod)
// ============================================================
import { VOCAB_ACTIVITIES, VOCAB_DECK_MODES } from "./types";

/** One word as a teacher or a learner enters it. */
export const vocabItemInputSchema = z.object({
  id: z.string().optional(),
  word: z.string().trim().min(1, "Cần nhập từ").max(80),
  pos: z.string().max(40).nullish(),
  ipa: z.string().max(120).nullish(),
  meaning: z.string().max(300).nullish(),
  example: z.string().max(400).nullish(),
  synonyms: z.array(z.string().max(80)).max(10).nullish(),
  image: z.string().max(500).nullish(),
  definition: z.string().max(300).nullish(),
  example_vi: z.string().max(400).nullish(),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullish(),
  collocations: z.array(z.string().max(80)).max(10).nullish(),
  family: z.array(z.string().max(80)).max(10).nullish(),
  antonyms: z.array(z.string().max(80)).max(10).nullish(),
  note: z.string().max(400).nullish(),
});
export type VocabItemInput = z.infer<typeof vocabItemInputSchema>;

/** Teacher set (create + update; `id` = update). */
export const vocabSetInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Cần tên bộ").max(120),
  slug: z.string().nullish(), // empty → generated from the name
  description: z.string().max(500).nullish(),
  levelId: z.string().nullish(),
  active: z.boolean().optional(),
});
export type VocabSetInput = z.infer<typeof vocabSetInputSchema>;

/** Replaces every word of a set, in order (the editor saves the whole list). */
export const vocabSetItemsSchema = z.object({
  items: z.array(vocabItemInputSchema).max(500, "Tối đa 500 từ mỗi bộ"),
});

/** Learner adds words to their own list: full items, or a set's words to copy. */
export const myVocabAddSchema = z
  .object({
    items: z.array(vocabItemInputSchema).max(200).optional(),
    fromItemIds: z.array(z.string().min(1)).max(200).optional(), // copy words from a teacher set
  })
  .refine((v) => (v.items && v.items.length) || (v.fromItemIds && v.fromItemIds.length), { message: "Cần từ để thêm" });
export type MyVocabAddInput = z.infer<typeof myVocabAddSchema>;

// Deck config (matches VocabDeckConfig). source=fixed → wordIds are vocab_items ids;
// source=filter → the words of one set.
export const vocabDeckConfigSchema = z.object({
  source: z.enum(["fixed", "filter"]),
  wordIds: z.array(z.string()).max(300, "Tối đa 300 từ mỗi lượt").optional(),
  filter: z
    .object({
      setId: z.string().nullish(),
      count: z.number().int().min(1).max(100).optional(),
      shuffle: z.boolean().optional(),
    })
    .optional(),
  activities: z.array(z.enum(VOCAB_ACTIVITIES)).min(1, "Chọn ít nhất 1 dạng luyện"),
  order: z.enum(["interleave", "grouped"]).default("interleave"),
  retryWrong: z.boolean().optional(),
  pronounce: z.enum(["on", "optional", "off"]).optional(),
});
export type VocabDeckConfigInput = z.infer<typeof vocabDeckConfigSchema>;

// ── Self-configured practice session ──
export const vocabSessionResolveSchema = z.object({
  // "due" = the review queue across every word the learner has studied.
  scope: z.enum(["set", "my", "due"]),
  scopeKey: z.string().nullish(), // set slug | null
  mode: z.enum(VOCAB_DECK_MODES).default("all"),
  count: z.number().int().min(1).max(100).default(20),
});
export type VocabSessionResolveInput = z.infer<typeof vocabSessionResolveSchema>;

// Deck in progress (loose — the client builds it, the server only stores it).
const vocabSessionStateSchema = z.object({
  queue: z.array(z.object({ key: z.string(), def: z.enum(VOCAB_ACTIVITIES), itemIds: z.array(z.string()) })),
  pos: z.number().int().min(0),
  stats: z.array(z.object({
    wordId: z.string(), word: z.string(), seen: z.array(z.enum(VOCAB_ACTIVITIES)),
    wrong: z.boolean(), pron: z.number().nullish(),
    attempts: z.array(z.object({ activity: z.enum(VOCAB_ACTIVITIES), correct: z.boolean() })).optional(),
  })),
  retried: z.array(z.string()),
  answered: z.array(z.object({ key: z.string(), correct: z.boolean(), snapshot: z.unknown().optional() })).optional(),
});

export const vocabSessionStartSchema = z.object({
  // "exercise" = a deck assigned as homework (/u/practice/:slug); scopeKey is the exercise slug.
  scope: z.enum(["set", "my", "due", "exercise"]),
  scopeKey: z.string().nullish(),
  label: z.string().min(1).max(120),
  config: vocabDeckConfigSchema,
  itemIds: z.array(z.string()).min(1),
  state: vocabSessionStateSchema,
});
export type VocabSessionStartInput = z.infer<typeof vocabSessionStartSchema>;

export const vocabSessionPatchSchema = z.object({ state: vocabSessionStateSchema });

// Finished deck session. `score` from the client is ignored: the API recomputes it with
// `vocabSessionScore` from the per-word attempts + `progress`.
const vocabAttemptSchema = z.object({ activity: z.enum(VOCAB_ACTIVITIES), correct: z.boolean() });
export const vocabSubmitSchema = z.object({
  exerciseId: z.string().max(200).nullish(), // exercise SLUG for an assigned/path deck; absent = self-practice
  sessionId: z.string().max(100).nullish(), // the resume session this result closes (idempotent re-send)
  result: z.object({
    total: z.number().int().min(0).max(1000),
    perWord: z
      .array(
        z.object({
          word: z.string().max(200),
          wordId: z.string().max(100).optional(),
          seen: z.array(z.enum(VOCAB_ACTIVITIES)).max(20),
          correct: z.number().int().min(0),
          total: z.number().int().min(0),
          mastered: z.boolean(),
          pron: z.number().nullish(),
          attempts: z.array(vocabAttemptSchema).max(100).optional(),
        }),
      )
      .max(1000),
    weakWords: z.array(z.string().max(200)).max(1000),
    progress: z
      .object({ cards: z.number().int().min(0), open: z.number().int().min(0), unanswered: z.number().int().min(0) })
      .optional(),
  }),
});
export type VocabSubmitInput = z.infer<typeof vocabSubmitSchema>;

// ── Unfinished attempts synced server-side ──
// `state` is opaque to the server: each practice UI owns its own shape. Capped so a draft cannot be
// used as free storage (a full quiz/dictation draft is a few KB).
export const PRACTICE_DRAFT_KINDS = ["quiz", "dictation", "writing", "video"] as const;
export type PracticeDraftKind = (typeof PRACTICE_DRAFT_KINDS)[number];
export const practiceDraftSchema = z.object({
  state: z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 200_000, "Bản nháp quá lớn"),
  answered: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
});
export type PracticeDraftInput = z.infer<typeof practiceDraftSchema>;

// AI fills pos / IPA / meaning / example / synonyms for a list of words (teacher set editor).
export const aiFillVocabInputSchema = z.object({
  words: z.array(z.string().min(1)).min(1).max(60),
  // Learner level / age, so example sentences suit the reader.
  context: z.string().nullish(),
  // Teacher's extra instruction (topic, sense to use, tone of examples…).
  instruction: z.string().max(500).nullish(),
});
const optList = z.array(z.string()).optional();
export const aiFillVocabOutputSchema = z.object({
  items: z.array(
    z.object({
      word: z.string(),
      pos: z.string().optional(),
      ipa: z.string().optional(),
      meaning: z.string().optional(),
      definition: z.string().optional(),
      example: z.string().optional(),
      example_vi: z.string().optional(),
      cefr: z.string().optional(),
      synonyms: optList,
      antonyms: optList,
      collocations: optList,
      family: optList,
      note: z.string().optional(),
    }),
  ),
});

// LEVEL SORTING for a video lesson: the AI reads a transcript excerpt and proposes level, topic
// and a short title. Level/topic must be picked FROM THE GIVEN LISTS (real DB ids) — never invented.
export const aiVideoClassifyInputSchema = z.object({
  title: z.string().min(1).max(300), // original YouTube title
  duration: z.number().int().positive().nullish(), // length in seconds — hints at workload
  levels: z.array(z.string().min(1)).min(1), // allowed level names, e.g. "A2 Flyers / Key"
  topics: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).min(1),
  transcript: z.string().min(1), // transcript excerpt (trimmed server-side)
});
export type AiVideoClassifyInput = z.infer<typeof aiVideoClassifyInputSchema>;
export const aiVideoClassifyOutputSchema = z.object({
  level: z.string().min(1), // MUST match one name in `levels`
  topic_id: z.string().nullish(), // an id from `topics`, null when nothing fits
  title: z.string().min(1).max(120), // short English title shown in the library
  reason: z.string().nullish(), // one sentence the teacher reads while reviewing
});
export type AiVideoClassifyOutput = z.infer<typeof aiVideoClassifyOutputSchema>;

// AI tạo bài VIDEO: nhận các đoạn transcript (đã có timestamp) → chuẩn hoá câu + chọn từ khoét.
// Timestamp GIỮ NGUYÊN ở server (AI không được bịa mốc giờ) — AI chỉ tinh chỉnh TEXT theo chỉ số `i`.
export const aiVideoSegmentInputSchema = z.object({
  level: z.string().nullish(), // cấp độ (A1..C2) → độ dài câu + số từ khoét
  lang: z.string().nullish(), // ngôn ngữ transcript (mặc định "en")
  make_blanks: z.boolean().optional(), // có chọn từ để khoét cho chế độ nghe-viết không
  fix_text: z.boolean().optional(), // false = text came from STT and must not be rewritten
  segments: z
    .array(z.object({ i: z.number().int(), text: z.string().min(1) }))
    .min(1)
    .max(150),
});
export type AiVideoSegmentInput = z.infer<typeof aiVideoSegmentInputSchema>;
export const aiVideoSegmentOutputSchema = z.object({
  segments: z.array(
    z.object({
      i: z.number().int(), // khớp chỉ số đầu vào
      text: z.string().nullish(), // repaired line; null when the input text is kept as is
      vi: z.string().nullish(), // bản dịch tiếng Việt (bật/tắt ở transcript)
      ipa: z.string().nullish(),
      blanks: z.array(z.number().int().min(0)).nullish(), // chỉ số TỪ nên khoét
      // Number expressions in the line: the exact words, one canonical token, other accepted forms.
      numbers: z
        .array(z.object({ text: z.string(), canon: z.string(), alts: z.array(z.string()).nullish() }))
        .nullish(),
    }),
  ),
});
export type AiVideoSegmentOutput = z.infer<typeof aiVideoSegmentOutputSchema>;

// Fill the IPA the word bank does not have. The list is DEDUPED by word — IPA is never generated
// per line, where one word would be regenerated 3.3 times over.
export const aiVideoIpaFillInputSchema = z.object({
  words: z.array(z.string().min(1)).min(1).max(200),
});
export type AiVideoIpaFillInput = z.infer<typeof aiVideoIpaFillInputSchema>;
export const aiVideoIpaFillOutputSchema = z.object({
  words: z.array(z.object({ word: z.string(), ipa: z.string() })),
});
export type AiVideoIpaFillOutput = z.infer<typeof aiVideoIpaFillOutputSchema>;

// GỘP CÂU theo ngữ cảnh: AI chỉ quyết định câu nào đi với câu nào (trả về NHÓM chỉ số);
// mốc thời gian vẫn do server tính lại từ câu đầu/cuối mỗi nhóm.
export const aiVideoGroupInputSchema = z.object({
  level: z.string().nullish(),
  segments: z
    .array(
      z.object({
        i: z.number().int(),
        text: z.string().min(1),
        gap: z.number().nullish(), // khoảng lặng (giây) TRƯỚC câu này
      }),
    )
    .min(1)
    .max(150),
});
export type AiVideoGroupInput = z.infer<typeof aiVideoGroupInputSchema>;
export const aiVideoGroupOutputSchema = z.object({
  groups: z.array(z.array(z.number().int())), // mỗi nhóm = danh sách chỉ số LIỀN NHAU
});
export type AiVideoGroupOutput = z.infer<typeof aiVideoGroupOutputSchema>;

// NHẬN XÉT bài Nghe & Nói: KHÔNG gửi cả trăm câu (tốn vô ích) — chỉ gửi HỒ SƠ LỖI: câu phải thử
// nhiều lần, câu xin đáp án, câu nói điểm thấp. Cô nhận xét theo KIỂU lỗi, không liệt kê từng câu.
export const aiVideoFeedbackInputSchema = z.object({
  title: z.string(),
  level: z.string().nullish(), // cấp độ bài (A1..C2)
  name: z.string().nullish(), // tên học sinh
  // Optional learner profile — greeting only, same as the quiz feedback task.
  gender: z.enum(["male", "female", "other"]).nullish(),
  age: z.number().int().min(3).max(99).nullish(),
  dictation: z.object({
    level: z.string().nullish(), // độ khó đang luyện
    done: z.number().int(),
    total: z.number().int(),
    first_ok: z.number().int(), // số câu đúng ngay lần đầu
    revealed: z.number().int(),
    hint_lines: z.number().int(),
    hardest: z.array(z.object({ text: z.string(), attempts: z.number().int(), hints: z.number().int(), revealed: z.boolean() })),
  }),
  shadow: z
    .object({
      done: z.number().int(),
      total: z.number().int(),
      avg: z.number(),
      weakest: z.array(z.object({ text: z.string(), score: z.number() })),
    })
    .nullish(),
  // Danh mục điểm ngữ pháp để AI CHỌN (không tự bịa tên) — nối kết quả sang sổ tay ngữ pháp.
  grammar_options: z.array(z.object({ id: z.string(), title: z.string(), cefr: z.string() })).nullish(),
});
export type AiVideoFeedbackInput = z.infer<typeof aiVideoFeedbackInputSchema>;
export const aiVideoFeedbackOutputSchema = z.object({
  feedback: z.string().min(1),
  grammar_ids: z.array(z.string()).nullish(), // chọn từ `grammar_options`, tối đa 3
});
export type AiVideoFeedbackOutput = z.infer<typeof aiVideoFeedbackOutputSchema>;

// ── Grammar drill session ──
export const grammarSessionSchema = z.object({
  // MAX_SESSION_POINTS cap: under 3 items per point FSRS only sees noise (and it stops one
  // request from sweeping the whole bank).
  grammarIds: z.array(z.string().min(1)).min(1, "Chọn ít nhất 1 điểm ngữ pháp").max(5, "Tối đa 5 điểm mỗi buổi"),
  count: z.number().int().min(5).max(40).default(20),
  types: z.array(questionTypeSchema).optional().nullable(),
});
export type GrammarSessionInput = z.infer<typeof grammarSessionSchema>;

export const grammarSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        item_id: z.string().min(1),
        answer: z.string().max(2000),
        retried: z.boolean().optional(),
      }),
    )
    .min(1, "Chưa có câu trả lời nào")
    .max(60),
});
export type GrammarSubmitInput = z.infer<typeof grammarSubmitSchema>;

// ── Grammar translation session ──
import { TRANSLATE_LEVELS } from "./grammarDrill";
import { CEFR_BANDS } from "./types";

export const grammarTranslateSessionSchema = z
  .object({
    grammarIds: z.array(z.string().min(1)).max(5, "Tối đa 5 điểm mỗi buổi").default([]),
    // Random mode: draw sentences from every point in these bands instead of a hand-picked list.
    // No MAX_SESSION_POINTS cap here — the draw is per SENTENCE, so the number of points it spans
    // is whatever the sample happens to hit, not a knob the learner turns.
    bands: z.array(z.enum(CEFR_BANDS)).max(CEFR_BANDS.length).optional(),
    // Lower ceiling than the quiz drill: every sentence here is typed out in full, so 20 is already
    // a long sitting.
    count: z.number().int().min(3).max(20).default(10),
    level: z.enum(TRANSLATE_LEVELS).default("easy"),
  })
  .refine((v) => v.grammarIds.length > 0 || (v.bands?.length ?? 0) > 0, {
    message: "Chọn ít nhất 1 điểm ngữ pháp, hoặc bật luyện ngẫu nhiên và chọn cấp độ",
  });
export type GrammarTranslateSessionInput = z.infer<typeof grammarTranslateSessionSchema>;

export const grammarTranslateSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        item_id: z.string().min(1),
        answer: z.string().max(500),
        retried: z.boolean().optional(),
      }),
    )
    .min(1, "Chưa có câu trả lời nào")
    .max(30),
});
export type GrammarTranslateSubmitInput = z.infer<typeof grammarTranslateSubmitSchema>;

// Teacher-entered Vietnamese → English translation sentences for one grammar point.
export const grammarTranslateItemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        vi: z.string().trim().min(1, "Thiếu câu tiếng Việt").max(400),
        en: z.string().trim().min(1, "Thiếu câu tiếng Anh").max(400),
        accept: z.array(z.string().trim().min(1).max(400)).max(10).nullish(),
        noteVi: z.string().max(300).nullish(),
      }),
    )
    .max(300),
});
export type GrammarTranslateItemsInput = z.infer<typeof grammarTranslateItemsSchema>;

/** Drill items a teacher pastes straight into a grammar point (MC / fill_blank / ordering only). */
export const grammarDrillItemSchema = z
  .object({
    type: z.enum(["multiple_choice", "fill_blank", "ordering"]),
    question: z.string().trim().min(1, "Thiếu đề câu hỏi").max(400),
    options: z.array(z.string().trim().min(1)).max(6).nullish(),
    answer: z.string().trim().max(400).nullish(),
    accept: z.array(z.string().trim().min(1).max(400)).max(10).nullish(),
    tokens: z.array(z.string().trim().min(1)).max(30).nullish(),
    word_bank: z.array(z.string().trim().min(1)).max(10).nullish(),
    explanation: z.string().max(400).nullish(),
  })
  .superRefine((q, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message: `“${q.question}”: ${message}` });
    if (q.type === "multiple_choice") {
      if ((q.options?.length ?? 0) < 2) bad("trắc nghiệm cần ít nhất 2 lựa chọn");
      else if (!q.answer || !q.options!.includes(q.answer)) bad("đáp án phải trùng một lựa chọn");
    } else if (q.type === "fill_blank") {
      if (!q.question.includes("___")) bad("điền từ cần có chỗ trống ___");
      if (!q.accept?.length) bad("điền từ cần ít nhất 1 đáp án trong accept");
    } else {
      if (!q.answer) bad("sắp xếp cần câu đúng ở answer");
      if ((q.tokens?.length ?? 0) < 2) bad("sắp xếp cần ít nhất 2 mảnh trong tokens");
    }
  });
export const grammarDrillItemsSchema = z.object({ items: z.array(grammarDrillItemSchema).min(1, "Chưa có câu nào").max(100) });
export type GrammarDrillItemInput = z.infer<typeof grammarDrillItemSchema>;

// Teacher changes their sign-in email (already signed in, like the password change).
export const teacherEmailChangeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(160),
});
export type TeacherEmailChangeInput = z.infer<typeof teacherEmailChangeSchema>;
