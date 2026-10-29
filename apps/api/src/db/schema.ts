// ============================================================
//  Drizzle schema cho Cloudflare D1 (SQLite).
//  JSON lưu dạng text (mode:"json"); boolean lưu dạng integer.
//  id mặc định = crypto.randomUUID() (chạy trên Workers).
// ============================================================
import { sql } from "drizzle-orm";
import { customType, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  AnswerMap,
  AzureSegment,
  AudioCues,
  CategorizeItem,
  Cefr,
  DictationMode,
  GradeDetail,
  GrammarBankItem,
  GrammarCompare,
  GrammarExample,
  GrammarForm,
  GrammarSessionResult,
  IpaLine,
  MatchPair,
  Question,
  QuestionType,
  ReaderPrefs,
  ReadingErrorWord,
  ReadingWordResult,
  PracticeSource,
  ReportStats,
  Skill,
  SpeakingFramework,
  TagScope,
  TranslateLevel,
  VideoMode,
  VideoSegment,
  VideoShadowDetail,
  VocabDeckConfig,
  VocabDeckResult,
  VocabSessionState,
  WordlistItem,
} from "@msyen/shared";

const uuid = () => crypto.randomUUID();
const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const teachers = sqliteTable("teachers", {
  id: text("id").primaryKey().$defaultFn(uuid),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: text("created_at").notNull().default(nowSql),
  // Session revocation mark — see lib/session.ts. NULL = nothing ever revoked.
  sessionsValidFrom: text("sessions_valid_from"),
});

/**
 * JSON column that survives malformed data: a row written outside the API (raw SQL seeds, imports)
 * with plain text in a JSON column reads back as null instead of throwing. Drizzle's built-in
 * `mode:"json"` calls JSON.parse eagerly while mapping rows, so ONE bad row would blow up every
 * query that touches the table — e.g. a whole level's library.
 */
const jsonCol = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "text",
    toDriver: (value: T) => JSON.stringify(value),
    fromDriver: (value: string) => {
      try {
        return JSON.parse(value) as T;
      } catch {
        return null as unknown as T;
      }
    },
  })(name);

export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey().$defaultFn(uuid),
  exerciseId: text("exercise_id").notNull().unique(),
  title: text("title").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  skill: text("skill").$type<Skill>(),
  level: text("level"),
  tags: jsonCol<string[]>("tags"),
  passage: text("passage"),
  // IPA phiên âm theo câu (hiển thị song song ở bài đọc to). [{text, ipa}]
  passageIpa: jsonCol<IpaLine[]>("passage_ipa"),
  audioUrl: text("audio_url"),
  audioScript: text("audio_script"),
  // Voice that produced the audio, e.g. "azure / en-US-JennyNeural".
  audioVoice: text("audio_voice"),
  // Phụ đề đồng bộ word-level {text, words:[{s,e,t,d}]} — hiển thị chạy theo audio.
  audioCues: jsonCol<AudioCues>("audio_cues"),
  // Chế độ bài nghe–chép (dictation): mask | gap | full. NULL = mask.
  dictationMode: text("dictation_mode").$type<DictationMode>(),
  // Scaffolding rung for this exercise's `translate` questions: easy | medium | hard | hardest.
  // NULL = easy. Same 4-rung ladder as the standalone drill
  translateLevel: text("translate_level").$type<TranslateLevel>(),
  // Bài ĐỌC TO (chấm phát âm): học sinh đọc `passage`, không có câu hỏi.
  readAloud: integer("read_aloud", { mode: "boolean" }).notNull().default(false),
  wordlist: jsonCol<WordlistItem[]>("wordlist"),
  // VOCABULARY v2: deck luyện THAM CHIẾU từ ngân hàng `vocab_words` (không nhúng). NULL = bài
  // vocabulary cũ vẫn dùng `wordlist` + questions.
  vocabDeck: jsonCol<VocabDeckConfig>("vocab_deck"),
  // NGHE & NÓI theo từng đoạn: nghe-viết + shadowing. Nguồn media = audio HOẶC video (YouTube).
  // Nội dung ở các cột segment riêng, KHÔNG dùng questions.
  // NULL = bài cũ → suy: có youtube_id → video; có audio_url + video_segments → audio.
  mediaSource: text("media_source").$type<PracticeSource>(),
  video: integer("video", { mode: "boolean" }).notNull().default(false),
  youtubeId: text("youtube_id"), // id video YouTube (khi media_source=video)
  videoLang: text("video_lang"), // mã ngôn ngữ transcript (mặc định "en")
  videoSegments: jsonCol<VideoSegment[]>("video_segments"), // đoạn luyện + timestamp
  videoModes: jsonCol<VideoMode[]>("video_modes"), // chế độ bật (mặc định cả 2)
  // Writing prompt + outline (column names kept from the retired speaking type).
  speakingPrompt: text("speaking_prompt"),
  speakingFramework: jsonCol<SpeakingFramework>("speaking_framework"),
  // Bài mẫu (đáp án tham khảo) — CHƯA hiện cho học sinh; dùng nạp vào prompt AI để chấm/chữa sát hơn.
  speakingSample: text("speaking_sample"),
  // Illustration for a SPEAKING task (describe-the-picture) — shown to the learner. URL /api/v1/audio/<key>.
  speakingImage: text("speaking_image"),
  // Ảnh bìa của bài — thumbnail cho card lưới thư viện user. NULL = fallback minh hoạ theo
  // kỹ năng/chủ đề. URL /api/v1/audio/<key> (hoặc URL ngoài). Xem UserLibraryPage.
  image: text("image"),
  // Dạng bài (blueprint) — quyết cấu trúc + tập dạng câu + prompt AI. NULL = suy theo
  // skill + read_aloud/video. See packages/shared/blueprints.ts.
  templateId: text("template_id"),
  // Bộ lựa chọn AI Composer đã dùng để sinh bài (skill/template/topic/grammar/prompt…) —
  // để TẠO LẠI bằng AI. NULL = bài soạn tay. Cùng shape với config của GenTemplatesBar.
  genConfig: jsonCol<Record<string, unknown>>("gen_config"),
  // Thứ tự bài trong "lộ trình" của level (dùng cho gạn giọt user công khai).
  // NULL = chưa sắp → engine mặc định theo createdAt. Teacher sắp ở page Lộ trình.
  pathOrder: integer("path_order"),
  // Chặng (khung) mà bài thuộc về trong lộ trình. NULL = chưa xếp. Mỗi bài đúng 1 chặng.
  stageId: text("stage_id").references(() => pathStages.id, { onDelete: "set null" }),
  // Chủ đề chính của bài (Animals/Family/School…). NULL = chưa gắn. Mỗi bài đúng 1 chủ đề.
  // Dùng để user công khai cá nhân hóa (lọc bài theo chủ đề quan tâm).
  topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
  // Nhãn phân loại của giáo viên + PHẠM VI hiển thị (xem bảng `tags`). NULL = "all".
  // CỐ Ý tách khỏi cột `tags` (từ khoá tự do do AI sinh) — AI không được đụng cột này,
  // không thì một lượt gen lại là bài riêng lọt ra thư viện công khai.
  tagId: text("tag_id").references(() => tags.id, { onDelete: "set null" }),
  // LỚP nội dung: NULL = lõi (mọi user thấy) · 'academic' = lớp học thuật, opt-in — chỉ vào drip
  // khi user bật `academic_enabled`. Vẫn published + có path_order (xếp trong chặng). Xem docs.
  layer: text("layer"),
  createdAt: text("created_at").notNull().default(nowSql),
  // Soft-delete (trash bin): ISO timestamp when moved to trash. NULL = live.
  // Deleting also sets `published = false` so trashed exercises never reach students.
  // Teacher restores (deleted_at → NULL) or purges (hard delete) from the trash view.
  deletedAt: text("deleted_at"),
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  type: text("type").notNull().$type<QuestionType>(),
  question: text("question").notNull(),
  options: jsonCol<string[]>("options"),
  answer: text("answer"),
  accept: jsonCol<string[]>("accept"),
  wordBank: jsonCol<string[]>("word_bank"),
  // Dạng mới (matching / ordering / categorize) + ảnh
  image: text("image"),
  explanation: text("explanation"),
  // Per-question hint (listening): a SHORT snippet of the dialogue that contains the
  // clue for THIS question — shown opt-in before grading (records hintUsed), unlike
  // `explanation` which appears after grading. NULL = no hint offered.
  hint: text("hint"),
  pairs: jsonCol<MatchPair[]>("pairs"),
  tokens: jsonCol<string[]>("tokens"),
  categories: jsonCol<string[]>("categories"),
  items: jsonCol<CategorizeItem[]>("items"),
  // translate: forgive an a/an/the-only difference. NULL = forgiven; set 0 when the article is
  // exactly what the sentence tests. Mirrors grammar_translate_items.article_lenient.
  articleLenient: integer("article_lenient", { mode: "boolean" }),
  // Điểm ngữ pháp mà câu này NHẮM TỚI (grammar.id slug) — AI tự gắn sau khi lưu bài.
  // NULL = chưa gắn / câu không nhắm điểm ngữ pháp nào rõ ràng (đọc hiểu, từ vựng…).
  // Báo cáo dùng để nêu "cấu trúc cần chú ý" theo đúng câu em làm SAI.
  grammarId: text("grammar_id").references(() => grammar.id, { onDelete: "set null" }),
}, (t) => ({
  // Every read of this table is "the questions of exercise X" — without this the FK column has no
  // index and each lookup scans the whole table.
  exerciseIdx: index("questions_exercise_idx").on(t.exerciseId, t.position),
}));

// TIÊU ĐỀ do giáo viên đặt cho tài nguyên R2 (audio/ảnh) — để tìm lại trong thư viện.
// Vì sao là bảng D1 chứ không phải customMetadata của R2: R2 không sửa được metadata tại
// chỗ, muốn đổi tiêu đề phải đọc rồi ghi lại TOÀN BỘ object (mp3 vài MB) — quá đắt cho
// một lần sửa chữ. Ở đây `key` là key R2; xoá file thì xoá kèm dòng này.
export const mediaTitles = sqliteTable("media_titles", {
  key: text("key").primaryKey(), // "audio/<uuid>.mp3" | "image/<uuid>.png"
  title: text("title").notNull(),
  updatedAt: text("updated_at").notNull().default(nowSql),
});

// NHÃN (tag) của bài tập — giáo viên tự quản lý (CRUD), khuôn giống topics.
// Khác topics ở chỗ nhãn mang thêm PHẠM VI (`scope`) quyết định AI được thấy bài:
//   · "all"     — dùng cho cả học sinh lẫn user công khai (mặc định)
//   · "student" — CHỈ học sinh của cô; bài không lọt vào thư viện user công khai
// Bài chưa gắn nhãn (tag_id NULL) = "all".
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  color: text("color").notNull().default("#06b6d4"),
  icon: text("icon"),
  scope: text("scope").$type<TagScope>().notNull().default("all"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
});

// Cấp độ học sinh (tag) — giáo viên tự quản lý (CRUD).
export const levels = sqliteTable("levels", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  color: text("color").notNull().default("#06b6d4"),
  icon: text("icon"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
});

// Chủ đề (theme) của bài tập — GLOBAL, cắt ngang level & kỹ năng (Animals, Family, School…).
// Giáo viên tự quản lý (CRUD, giống levels). Gắn vào exercises.topic_id; user công khai chọn
// chủ đề quan tâm (users.topics) để cá nhân hóa/lọc bài.
export const topics = sqliteTable("topics", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  color: text("color").notNull().default("#06b6d4"),
  icon: text("icon"),
  // Chủ đề CHA (topics.id) — NULL = topic gốc (cấp 1); có giá trị = chủ đề con của cha đó.
  // Cây 2 cấp: mẹ → con. Cá nhân hoá gạn giọt gộp con lên cha.
  parentId: text("parent_id"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
});

// Sổ tay NGỮ PHÁP tra cứu — id là slug ổn định (không uuid). Nội dung nested lưu JSON.
// Phân cấp theo band CEFR (đồng bộ ladder levels). CRUD giáo viên; user đọc công khai.
export const grammar = sqliteTable(
  "grammar",
  {
    id: text("id").primaryKey(), // slug: "present-simple"
    title: text("title").notNull(),
    category: text("category").notNull(),
    cefr: text("cefr").$type<Cefr>().notNull(),
    summary: text("summary").notNull(),
    forms: text("forms", { mode: "json" }).$type<GrammarForm[]>().notNull(),
    signals: text("signals", { mode: "json" }).$type<string[]>(),
    usage: text("usage", { mode: "json" }).$type<string[]>().notNull(),
    spelling: text("spelling", { mode: "json" }).$type<string[]>(),
    examples: text("examples", { mode: "json" }).$type<GrammarExample[]>().notNull(),
    mistakes: text("mistakes", { mode: "json" }).$type<string[]>(),
    tips: text("tips", { mode: "json" }).$type<string[]>(),
    compare: text("compare", { mode: "json" }).$type<GrammarCompare[]>(),
    related: text("related", { mode: "json" }).$type<string[]>(),
    keywords: text("keywords", { mode: "json" }).$type<string[]>(),
    bank: text("bank", { mode: "json" }).$type<GrammarBankItem[]>(), // reference list (catalogue of phrases/words)
    // Question types this point can be DRILLED with. Not every
    // point suits every type: `ordering` is meaningless for phrasal verbs, `categorize` for
    // present perfect. NULL falls back to DEFAULT_DRILL_TYPES.
    drillTypes: text("drill_types", { mode: "json" }).$type<QuestionType[]>(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({ cefrIdx: index("grammar_cefr_idx").on(t.cefr, t.position) }),
);

// Chặng (khung) trong "lộ trình" của một level — nhóm & xếp thứ tự bài cho user công khai.
// Teacher quản lý ở page Lộ trình; engine gạn giọt đọc exercises.path_order.
export const pathStages = sqliteTable("path_stages", {
  id: text("id").primaryKey().$defaultFn(uuid),
  levelId: text("level_id")
    .notNull()
    .references(() => levels.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
});

export const students = sqliteTable("students", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  passcode: text("passcode").unique(),
  contact: text("contact"),
  note: text("note"),
  birthYear: integer("birth_year"),
  gender: text("gender"), // "male" | "female" | "other"
  levelId: text("level_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Cầu nối tương lai: liên kết học sinh này với 1 tài khoản public (users). Chưa dùng ở v1.
  userId: text("user_id"),
  // Tùy chọn hiển thị trang Record (teleprompter/IPA/tốc độ/số dòng). NULL = mặc định.
  readerPrefs: text("reader_prefs", { mode: "json" }).$type<ReaderPrefs>(),
  createdAt: text("created_at").notNull().default(nowSql),
});

// Public self-serve accounts — separate from the retired `students` table. Identity is
// email/password OR Google OAuth.
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(uuid),
  email: text("email").notNull().unique(), // luôn lưu lowercase
  passwordHash: text("password_hash"), // null nếu chỉ đăng nhập Google
  googleSub: text("google_sub").unique(), // "sub" từ Google (ổn định); null nếu chỉ password
  provider: text("provider").notNull(), // "password" | "google"
  name: text("name"),
  avatarUrl: text("avatar_url"), // ảnh hồ sơ Google (picture); null → fallback avatar DiceBear theo seed
  levelId: text("level_id"), // level user tự chọn → lọc bài (tham chiếu levels.id)
  // Chủ đề user quan tâm (mảng topics.id). NULL/[] = quan tâm tất cả (không lọc).
  // Dùng để LỌC CỨNG pool gạn giọt trong level.
  topics: text("topics", { mode: "json" }).$type<string[]>(),
  birthYear: integer("birth_year"), // onboarding: năm sinh (tính tuổi)
  gender: text("gender"), // onboarding: "male" | "female" | "other"
  // Bật LỚP HỌC THUẬT (độ chính xác nền: mạo từ, số nhiều, giới từ…). 0 = tắt (giao tiếp thuần,
  // mặc định) → bài `layer='academic'` KHÔNG vào drip. 1 = bật → thấy + được tính. Xem exercises.layer.
  academicEnabled: integer("academic_enabled", { mode: "boolean" }).notNull().default(false),
  // Giọng đọc mẫu ưa thích cho đọc TỪ: "male" | "female" (edge Jenny/Andrew). KHÁC `gender` (giới
  // tính của em) — em nữ vẫn có thể chọn nghe giọng nam. Đồng bộ theo tài khoản; NULL = nữ (mặc định).
  voiceGender: text("voice_gender"),
  // Giọng đọc mẫu cho đọc CÂU / đoạn dài (ví dụ ngữ pháp). Tách riêng để chọn giọng khác giọng đọc từ.
  // NULL = nam (mặc định) — khớp quy ước audio vocab (từ nữ · ví dụ nam).
  voiceGenderSentence: text("voice_gender_sentence"),
  // Library card layout: "grid" | "list". NULL = grid (default). Synced per account so the
  // choice follows the user across devices.
  libraryView: text("library_view"),
  // Light/dark preference: "light" | "dark". NULL = never chosen → follow OS / VN clock.
  theme: text("theme"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Ẩn danh trên BẢNG XẾP HẠNG: bật thì tên em hiển thị với NGƯỜI KHÁC là biệt danh con vật
  // (ổn định theo id); chính em vẫn thấy tên thật của mình. Cô bật/tắt để bảo mật em. Xem [[anon]].
  anonymous: integer("anonymous", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(nowSql),
  // Presence: ISO timestamp of the last authenticated API call. Written best-effort from
  // `requireUser` and throttled to ~5 minutes so it costs one write per active session slice.
  // NULL = never called an authenticated endpoint since the column shipped.
  lastSeenAt: text("last_seen_at"),
  // Sessions minted before this instant are refused — see lib/session.ts. Stamped on password
  // change, lock and soft-delete, so those actions drop every device at once. NULL = nothing revoked.
  sessionsValidFrom: text("sessions_valid_from"),
  // Soft-delete (trash bin): ISO timestamp when moved to trash. NULL = live.
  // Deleting also sets `active = false` so a trashed account can't log in or rank.
  // Teacher restores (deleted_at → NULL) or purges (hard delete) from the trash view.
  deletedAt: text("deleted_at"),
});

// Token ĐẶT LẠI MẬT KHẨU (quên mật khẩu) — gửi qua email, hết hạn ~30 phút, dùng 1 lần.
// Chỉ lưu HASH (SHA-256) của token, không lưu token thô: rò DB cũng không đặt lại được pass.
export const passwordResets = sqliteTable(
  "password_resets",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id").notNull(), // → users.id
    tokenHash: text("token_hash").notNull(), // SHA-256 hex của token trong link
    expiresAt: text("expires_at").notNull(), // ISO — quá hạn thì vô hiệu
    usedAt: text("used_at"), // null = chưa dùng; đặt khi đổi pass xong (1 lần)
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({
    byToken: uniqueIndex("password_resets_token_idx").on(t.tokenHash),
    byUser: index("password_resets_user_idx").on(t.userId),
  }),
);

// Email change requests + history (single table). A row is:
//  • pending  → appliedAt null, canceledAt null (waits until effectiveAt, then applied)
//  • applied  → appliedAt set (also serves as the OLD-email history log)
//  • canceled → canceledAt set
// User self-change: effectiveAt = now + 2 days (grace window, no email verify yet).
// Admin change: effectiveAt = now, appliedAt = now (takes effect immediately).
export const emailChanges = sqliteTable(
  "email_changes",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("user_id").notNull(), // → users.id
    oldEmail: text("old_email").notNull(), // email at request time (history)
    newEmail: text("new_email").notNull(), // lowercase target email
    source: text("source").notNull(), // "user" | "admin"
    effectiveAt: text("effective_at").notNull(), // ISO — when it should apply
    appliedAt: text("applied_at"), // null = not applied yet
    canceledAt: text("canceled_at"), // null = not canceled
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({
    byUser: index("email_changes_user_idx").on(t.userId),
  }),
);

// LỚP HỌC của cô — lớp phủ QUYỀN lên `users`, không phải bảng người dùng thứ hai.
// "Học sinh của cô" = user có mặt trong `class_members`.
//
// No `teacher_id`: one install is one flat tenant, like `students` / `exercises`.
export const classes = sqliteTable("classes", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  note: text("note"),
  // Để dành cho luồng "em tự vào lớp bằng mã" (Phase 5) — sinh sẵn để khỏi migrate lần nữa.
  joinCode: text("join_code").unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(nowSql),
});

// Class membership. Leaving = deleting the row here: the account and all progress stay,
// only the class rights go away.
export const classMembers = sqliteTable(
  "class_members",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull().default(nowSql),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.classId, t.userId] }),
    // Reverse lookup "which classes is this user in" — runs on every authenticated request.
    userIdx: index("class_members_user_idx").on(t.userId),
  }),
);

// Bài cô GIAO CHO CẢ LỚP. Tách khỏi `assignments` (bảng cũ trỏ students.id, đang nghỉ hưu):
// ở đây đơn vị nhận bài là LỚP, không phải từng em — cô giao một lần cho cả lớp.
//
// Bài được giao đi CỬA RIÊNG, bỏ qua toàn bộ luật thư viện công khai (level · chủ đề ·
// phạm vi nhãn · gạn giọt): cô đã chủ động giao thì em phải làm được ngay, kể cả bài
// ngoài cấp độ hay mang nhãn scope="student".
export const classAssignments = sqliteTable(
  "class_assignments",
  {
    classId: text("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    teacherNote: text("teacher_note"),
    // Thứ tự trong LỘ TRÌNH cô xếp — quyết định bài nào mở trước (hàng chờ trượt).
    // NULL = bài cũ chưa xếp, xếp sau cùng theo assignedAt.
    position: integer("position"),
    assignedAt: text("assigned_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.classId, t.exerciseId] }) }),
);

// Bài cô giao RIÊNG cho một em (ngoài bài của lớp) — vd giao thêm cho em còn yếu.
// Song song `class_assignments`, KHÔNG thay thế: bài em thấy = bài của lớp ∪ bài giao riêng.
// Cùng luật cửa riêng (bỏ qua level/chủ đề/nhãn/gạn giọt).
/**
 * Mốc MỞ KHOÁ bài cô giao cho từng em (hàng chờ trượt).
 * Ngày GIAO không nói lên gì với em (cô giao cả lộ trình một lần, có bài giao từ tháng trước),
 * nên UI hiện "mở lúc nào"; mốc này ghi lần đầu bài lọt vào cửa sổ đang mở.
 */
export const assignmentUnlocks = sqliteTable(
  "assignment_unlocks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    unlockedAt: text("unlocked_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.exerciseId] }) }),
);

export const userAssignments = sqliteTable(
  "user_assignments",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    teacherNote: text("teacher_note"),
    position: integer("position"), // thứ tự lộ trình (như classAssignments)
    assignedAt: text("assigned_at").notNull().default(nowSql),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.exerciseId] }),
    // The composite PK only covers the `user_id` prefix; the teacher library reads the other way
    // round ("who is this exercise assigned to").
    exerciseIdx: index("user_assignments_exercise_idx").on(t.exerciseId),
  }),
);

// Best pronunciation score per WORD, from EVERY place the learner speaks a word: vocabulary cards,
// read-aloud passages, video shadowing. The rule is "wherever the quota is charged, the score is
// kept" — a word read inside a passage is the learner's data just as much as one read on a card.
// `user_vocab_progress.pron_best` stays as the card's own record; this table is the cross-source
// picture the progress dashboard reads.
// Study TIME per learner, per VN calendar day, per area of the app. Filled by session stitching in
// `requireUser` (middleware/userAuth.ts): the gap between two authenticated requests IS the time
// spent, capped so an abandoned tab cannot bank hours. One row per (user, day, area) — at most a
// handful a day, and a week/month report reads them straight off the primary key.
export const userStudyTime = sqliteTable(
  "user_study_time",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD in VN time, so weeks and months line up with the learner's day
    area: text("area").notNull(), // vocab | grammar | speaking | video | library | other
    seconds: integer("seconds").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(nowSql),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.date, t.area] }),
  }),
);

// Tiến độ "gạn giọt" của user công khai theo từng level (mở dần bài mỗi ngày).
// Con trỏ nhẹ — thứ tự bài ổn định nên không cần ledger.
export const userLevelProgress = sqliteTable(
  "user_level_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    levelId: text("level_id").notNull(), // tham chiếu levels.id
    unlockedCount: integer("unlocked_count").notNull().default(0), // đã mở tới bài thứ mấy (prefix)
    unlockedToday: integer("unlocked_today").notNull().default(0), // số bài mở trong "ngày" hiện tại
    lastUnlockDate: text("last_unlock_date"), // YYYY-MM-DD theo giờ VN
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.levelId] }) }),
);

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, {
    onDelete: "set null",
  }),
  // Lượt nộp của user CÔNG KHAI (mutually exclusive với studentId — đúng 1 trong 2 có giá trị).
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  answers: text("answers", { mode: "json" }).$type<AnswerMap>().notNull(),
  details: text("details", { mode: "json" }).$type<GradeDetail[]>().notNull(),
  teacherFeedback: text("teacher_feedback"),
  // Auto-feedback CHỈ nhận xét lượt VƯỢT kỷ lục cũ; lượt không phải best được đánh dấu =1
  // để cron bỏ qua (không quét lại mãi, không tốn AI). GV vẫn sửa tay teacherFeedback được.
  feedbackSkipped: integer("feedback_skipped").notNull().default(0),
  // AI comment lifecycle for the on-submit (queue) flow. null = legacy/none;
  // "pending" = enqueued, being written; "done" = written; "skipped" = quota exhausted, no comment.
  // Cron safety net only re-scans "pending" rows of class exercises.
  feedbackStatus: text("feedback_status"),
  // Learner opened a hint while doing this attempt (listening subtitles = whole exercise,
  // or per-question hints listed in `hintPositions`). Hinted questions earn half points.
  // Các điểm NGỮ PHÁP (grammar.id) mà nhận xét AI khuyên ôn — để trang kết quả nối thẳng sang
  // sổ tay ngữ pháp. JSON string[]; NULL = nhận xét cũ / không có gợi ý.
  feedbackGrammar: text("feedback_grammar", { mode: "json" }).$type<string[]>(),
  hintUsed: integer("hint_used", { mode: "boolean" }).notNull().default(false),
  hintPositions: text("hint_positions", { mode: "json" }).$type<number[]>(),
  // Reward points for this attempt, computed at grading (hint penalty applied per question).
  // NULL = legacy row → fall back to quizPoints(score, hintUsed).
  points: integer("points"),
  submittedAt: text("submitted_at").notNull().default(nowSql),
}, (t) => ({
  // Leaderboard per period (week/month/quarter/year): filter by user + submittedAt range.
  userSubmittedIdx: index("submissions_user_submitted_idx").on(t.userId, t.submittedAt),
  // Per-exercise stats (attempt count / average score) on the teacher library.
  exerciseIdx: index("submissions_exercise_idx").on(t.exerciseId),
}));

// Bài ĐỌC TO đã chấm phát âm (Azure). Tách riêng submissions (không có answers trắc nghiệm).
export const readingSubmissions = sqliteTable("reading_submissions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, {
    onDelete: "set null",
  }),
  // Lượt đọc to của user CÔNG KHAI (chưa mở ở v1 — cột để sẵn). Mutually exclusive với studentId.
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  audioKey: text("audio_key").notNull(), // key R2 của bản ghi học sinh
  pronScore: integer("pron_score").notNull(), // điểm tổng 0-100
  // Điểm ảo đã tính sẵn — hiện chỉ dòng TỔNG của SHADOWING VIDEO dùng (cộng dồn theo số từ đã
  // nói, không quy về thang 0-100 được). NULL = dòng đọc-to thường → recordPoints(pronScore).
  points: integer("points"),
  accuracy: integer("accuracy").notNull(),
  fluency: integer("fluency").notNull(),
  completeness: integer("completeness").notNull(),
  prosody: integer("prosody"), // có thể null nếu region không hỗ trợ
  transcript: text("transcript"),
  // Full per-phoneme scoring. Offloaded to R2 (assess/reading/<id>.json) for new rows to keep
  // rows small (~14KB→~0); empty array here means "look in R2". Legacy rows keep it inline.
  // Load via loadReadingWords(); never read this column directly.
  words: text("words", { mode: "json" }).$type<ReadingWordResult[]>().notNull(),
  // Compact {word,errorType,accuracy} of the mispronounced words only — kept in D1 so weak-word
  // stats / AI-feedback regen never touch the fat R2 blob.
  errorWords: text("error_words", { mode: "json" }).$type<ReadingErrorWord[]>(),
  aiFeedback: text("ai_feedback"),
  teacherFeedback: text("teacher_feedback"),
  // Grammar points the feedback points at (grammar.id) — mirrors submissions.feedback_grammar so
  // a video session that only ever shadowed still keeps its feedback + grammar links.
  feedbackGrammar: text("feedback_grammar", { mode: "json" }).$type<string[]>(),
  durationMs: integer("duration_ms"),
  submittedAt: text("submitted_at").notNull().default(nowSql),
}, (t) => ({
  // Period leaderboard over read-aloud pronunciation scores.
  userSubmittedIdx: index("reading_submissions_user_submitted_idx").on(t.userId, t.submittedAt),
}));

// SHADOWING VIDEO: điểm phát âm TỐT NHẤT mỗi ĐOẠN (per-segment best) của user cho 1 bài video.
// Nguồn để tính điểm TỔNG HỢP cả bài (trung bình các đoạn đã luyện) rồi ghi 1 dòng
// reading_submissions "tổng" (audio_key = "video:<exId>").
export const videoShadowScores = sqliteTable(
  "video_shadow_scores",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    segment: integer("segment").notNull(), // segment index
    score: integer("score").notNull(), // pronunciation score 0-100 (best take of this segment)
    // Graded detail of that best take (words + component scores) so a reload can show it again.
    detail: text("detail", { mode: "json" }).$type<VideoShadowDetail>(),
    updatedAt: text("updated_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.exerciseId, t.segment] }) }),
);

// NGHE-VIẾT VIDEO: tiến độ luyện TỪNG ĐOẠN (vòng lặp check→sửa→đúng). Nguồn để tính điểm bài
// (số đoạn đã ĐÚNG) + thống kê học (đúng-lần-đầu, số lần thử, số hint).
export const videoDictationScores = sqliteTable(
  "video_dictation_scores",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    segment: integer("segment").notNull(),
    firstOk: integer("first_ok", { mode: "boolean" }).notNull().default(false), // đúng ngay lần check ĐẦU
    attempts: integer("attempts").notNull().default(0),
    hints: integer("hints").notNull().default(0), // số ký tự hint đã mở (mức cao nhất)
    revealed: integer("revealed", { mode: "boolean" }).notNull().default(false), // đã xin đáp án
    done: integer("done", { mode: "boolean" }).notNull().default(false), // đã đúng (hoặc đã xem đáp án)
    // Độ khó KHÓ NHẤT đã làm xong câu này (easy|medium|hard|hardest) → hệ số điểm. Giữ mức cao
    // nhất chứ không ghi đè: làm lại ở mức dễ hơn không được phép hạ điểm đã ăn.
    level: text("level"),
    updatedAt: text("updated_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.exerciseId, t.segment] }) }),
);

// Raw STT output cached per source video, so re-authoring a lesson (or a failed batch run) never
// transcribes the same video twice. Holds the transcript we produced, not the source media.
export const videoTranscripts = sqliteTable(
  "video_transcripts",
  {
    youtubeId: text("youtube_id").notNull(),
    lang: text("lang").notNull().default("en"),
    cues: text("cues", { mode: "json" }).$type<{ start: number; end: number; text: string }[]>().notNull(),
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.youtubeId, t.lang] }) }),
);

// VOCABULARY progress of a public user. The word bank itself stays DERIVED from the wordlists of
// exercises already done (words are not stored here) — this table only holds per-user learning
// STATE for each word: learned flag + best pronunciation score. Key `word` is lowercased.
export const userVocabProgress = sqliteTable("user_vocab_progress", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  word: text("word").notNull(), // khóa chuẩn hóa: lowercase
  learned: integer("learned", { mode: "boolean" }).notNull().default(false),
  learnedAt: text("learned_at"),
  pronBest: integer("pron_best"), // điểm phát âm tốt nhất 0-100 (null = chưa luyện)
  pronAttempts: integer("pron_attempts").notNull().default(0),
  lastPronAt: text("last_pron_at"),
  // Đếm số lần làm SAI GẦN ĐÂY từ này qua dạng THỰC (không tính flashcard) — cho mode "các từ
  // hay sai". Đúng thì GIẢM 1 (không về 0) để từ vừa sửa được vẫn còn trong tầm ngắm một thời gian.
  missCount: integer("miss_count").notNull().default(0),
  lastWrongAt: text("last_wrong_at"),
  // ---- Trí nhớ (FSRS, xem shared/srs.ts) ----
  // MỘT trạng thái cho MỘT TỪ, dùng chung cho ngân hàng lẫn My vocab: dạng bài chỉ là cách hỏi.
  stability: real("stability"), // S — số ngày tới khi xác suất nhớ tụt về mức đích
  difficulty: real("difficulty"), // D — 1..10
  dueAt: text("due_at"), // ISO, hạn ôn kế tiếp (null = chưa vào lịch)
  lastReviewAt: text("last_review_at"),
  reps: integer("reps").notNull().default(0), // số lượt ôn CÓ CHẤM
  lapses: integer("lapses").notNull().default(0), // số lần QUÊN (đã đúng rồi lại sai) — KHÔNG reset
  tier: integer("tier").notNull().default(0), // 0..4 knowledge ladder; drops only when the learner unmarks
  // Highest tier EVER reached. Memory points are paid against this peak, so "unmark -> re-learn"
  // cannot farm the same tier twice. Never decreases, not even when the learner unmarks.
  tierMax: integer("tier_max").notNull().default(0),
  // Where the `learned` flag came from: 'self' = the learner declared it · 'drill' = earned through
  // a graded activity (tier >= 2). NULL = not learned / legacy row. A declaration is NOT evidence,
  // so it never writes `tier`
  learnedSource: text("learned_source"),
  lastRating: integer("last_rating"), // 1..4
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  userWordUnq: uniqueIndex("user_vocab_progress_user_word_unq").on(t.userId, t.word),
  // Hàng đợi ôn luôn hỏi "từ nào của user này đến hạn" → index đúng chiều đó, luôn kèm LIMIT.
  userDueIdx: index("user_vocab_progress_user_due_idx").on(t.userId, t.dueAt),
}));

// Phiên luyện từ vựng ĐANG DỞ (resume) — 1 phiên đang mở / user / scope. Lưu deck đã dựng +
// tiến độ để học tiếp trên mọi máy. Xong buổi → xoá.
export const vocabPracticeSessions = sqliteTable("vocab_practice_sessions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Nguồn từ: "set" (setSlug) · "my" (kho riêng) · "browse" (bank lọc cấp/chủ đề).
  scope: text("scope").notNull(),
  scopeKey: text("scope_key"), // setSlug | groupId | "all"… để nhận diện & gợi ý "học tiếp" đúng chỗ
  label: text("label").notNull(), // tên hiển thị ở banner "học tiếp" (vd tên bộ)
  config: text("config", { mode: "json" }).$type<VocabDeckConfig>().notNull(),
  itemIds: text("item_ids", { mode: "json" }).$type<string[]>().notNull(), // từ trong phiên (thứ tự)
  state: text("state", { mode: "json" }).$type<VocabSessionState>().notNull(), // deck đã dựng + tiến độ
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  userIdx: index("vocab_practice_sessions_user_idx").on(t.userId, t.updatedAt),
}));

// An UNFINISHED attempt at an exercise, stored server-side so the learner continues on any device.
// One row per (user, exercise, kind); the payload shape is owned by the practice UI of that kind
// (quiz answers, dictation boxes, writing text, video dictation) and is never read by the server.
// The browser copy stays as the instant/offline buffer — this row is the synced source of truth.
// Cleared on submit.
export const practiceDrafts = sqliteTable("practice_drafts", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull(), // exercises.exercise_id (slug), not the row id
  kind: text("kind").notNull(), // quiz | dictation | writing | video
  state: text("state", { mode: "json" }).$type<unknown>().notNull(),
  answered: integer("answered").notNull().default(0), // filled-in items, for "in progress" badges
  total: integer("total").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  oneIdx: uniqueIndex("practice_drafts_user_ex_kind_unq").on(t.userId, t.exerciseId, t.kind),
  userIdx: index("practice_drafts_user_idx").on(t.userId, t.updatedAt),
}));

// ============================================================
//  VOCABULARY v2 — NGÂN HÀNG TỪ dùng chung + deck luyện.
//  Tách TỪ (nội dung) khỏi CÁCH LUYỆN (deck): từ soạn 1 lần, deck chỉ THAM CHIẾU.
// ============================================================

// Teacher-built vocabulary set. Words live in vocab_items (set_id = this set).
export const vocabSets = sqliteTable("vocab_sets", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // public URL id
  description: text("description"),
  levelId: text("level_id").references(() => levels.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  wordCount: integer("word_count").notNull().default(0), // denormalised, refreshed on every item change
  teacherId: text("teacher_id").references(() => teachers.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  slugUnq: uniqueIndex("vocab_sets_slug_unq").on(t.slug),
  levelIdx: index("vocab_sets_level_idx").on(t.levelId),
}));

// One word: either in a teacher's set (set_id) or saved by a learner (user_id) — exactly one of the two.
export const vocabItems = sqliteTable("vocab_items", {
  id: text("id").primaryKey().$defaultFn(uuid),
  setId: text("set_id").references(() => vocabSets.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  wordKey: text("word_key").notNull(), // normalizeWordForCompare(word) — joins user_vocab_progress.word
  pos: text("pos"),
  ipa: text("ipa"),
  meaning: text("meaning"), // Vietnamese
  example: text("example"),
  synonyms: jsonCol<string[]>("synonyms"),
  image: text("image"),
  definition: text("definition"), // short English definition
  exampleVi: text("example_vi"), // Vietnamese translation of `example`
  cefr: text("cefr"),
  collocations: jsonCol<string[]>("collocations"),
  family: jsonCol<string[]>("family"), // word family, e.g. "beauty (n)"
  antonyms: jsonCol<string[]>("antonyms"),
  note: text("note"), // usage note / common mistake, Vietnamese
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  setIdx: index("vocab_items_set_idx").on(t.setId, t.position),
  userIdx: index("vocab_items_user_idx").on(t.userId, t.createdAt),
  userWordUnq: uniqueIndex("vocab_items_user_word_unq").on(t.userId, t.wordKey),
}));

// One vocabulary practice session (student OR user). Source: an assigned deck exercise
// (exerciseId) or self-practice (NULL). Mirrors reading_submissions.
export const vocabSubmissions = sqliteTable("vocab_submissions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  exerciseId: text("exercise_id").references(() => exercises.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  score: integer("score").notNull(), // 0-100
  total: integer("total").notNull(), // số từ
  result: text("result", { mode: "json" }).$type<VocabDeckResult>().notNull(),
  // Điểm ảo của buổi — tính lúc nộp theo TIẾN BỘ TRÍ NHỚ (lên tầng + ôn đúng hạn), không theo số
  // câu đúng, nên không cày lại được. NULL = buổi cũ trước 2026-07-27. Xem shared/points.ts.
  points: integer("points"),
  submittedAt: text("submitted_at").notNull().default(nowSql),
}, (t) => ({
  exerciseIdx: index("vocab_submissions_exercise_idx").on(t.exerciseId),
  userIdx: index("vocab_submissions_user_idx").on(t.userId, t.submittedAt),
}));

// ============================================================
//  VOCABULARY v2.1 — BỘ TỪ (Library) + MY VOCAB (kho từ RIÊNG của user).
//  · vocab_sets/vocab_set_words: bộ do nền tảng cung cấp, THAM CHIẾU từ ngân hàng (không nhân bản).
//  · user_vocab_groups/user_vocab_words: kho từ riêng — lưu từ ngân hàng HOẶC tự nhập (AI làm giàu).
// ============================================================

// Tiến độ HỌC NGỮ PHÁP của user công khai — chỉ lưu TRẠNG THÁI "đã học" mỗi điểm theo user.
// Nội dung điểm ngữ pháp nằm ở bảng `grammar`; bảng này chỉ tham chiếu id. Song song với
// user_vocab_progress. (Điểm "cần ôn" KHÔNG dùng bảng này — tính trực tiếp từ submissions.)
export const userGrammarProgress = sqliteTable("user_grammar_progress", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  grammarId: text("grammar_id")
    .notNull()
    .references(() => grammar.id, { onDelete: "cascade" }),
  learned: integer("learned", { mode: "boolean" }).notNull().default(false),
  learnedAt: text("learned_at"),
  // Ghim để LUYỆN TIẾP — khác hẳn `learned` (đã xong): user tự đánh dấu, hoặc nhận từ nhận
  // xét của cô sau một buổi học, rồi trang ngữ pháp nhắc lại cho tới khi họ tự gỡ.
  marked: integer("marked", { mode: "boolean" }).notNull().default(false),
  markedAt: text("marked_at"),
  // ---- FSRS memory state. ONE state per GRAMMAR POINT, not per bank sentence: what a learner
  // forgets is "present perfect", not sentence #47. Mirrors user_vocab_progress; the schedule
  // itself is computed by the shared shared/srs.ts.
  stability: real("stability"), // FSRS S (days)
  difficulty: real("difficulty"), // FSRS D (1..10)
  dueAt: text("due_at"),
  lastReviewAt: text("last_review_at"),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  tier: integer("tier").notNull().default(0), // knowledge ladder 0..3, never drops
  lastRating: integer("last_rating"),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  userGrammarUnq: uniqueIndex("user_grammar_progress_user_grammar_unq").on(t.userId, t.grammarId),
  dueIdx: index("user_grammar_progress_due_idx").on(t.userId, t.dueAt),
}));

// ============================================================
//  GRAMMAR DRILL — bank of practice sentences per grammar point + session records.
//  Kept apart from `questions` (which always belong to one exercise): these are drawn ad hoc.
// ============================================================

// One practice sentence. `payload` holds a Question-shaped object so the existing renderers
// (practice/inputs/*) and grader (shared/grading.ts) work unchanged — no new question type.
export const grammarItems = sqliteTable("grammar_items", {
  id: text("id").primaryKey().$defaultFn(uuid),
  grammarId: text("grammar_id")
    .notNull()
    .references(() => grammar.id, { onDelete: "cascade" }),
  cefr: text("cefr").$type<Cefr>().notNull(),
  tier: integer("tier").notNull().default(1), // 1 recognition · 2 applied · 3 advanced
  type: text("type").$type<QuestionType>().notNull(),
  payload: text("payload", { mode: "json" }).$type<Question>().notNull(),
  explainVi: text("explain_vi"), // null -> the API builds one from the grammar row
  topicId: text("topic_id").references(() => topics.id, { onDelete: "set null" }),
  status: text("status").notNull().default("live"), // draft | live | retired
  source: text("source").notNull().default("ai"), // seed | ai | teacher
  // The exercise question this item was copied from (teacher-built drills). NULL = authored here.
  questionId: text("question_id").references(() => questions.id, { onDelete: "cascade" }),
  seenCount: integer("seen_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
}, (t) => ({
  pickIdx: index("grammar_items_pick_idx").on(t.grammarId, t.status, t.tier),
  questionUnq: uniqueIndex("grammar_items_question_unq").on(t.questionId),
}));

// Per-item state for ONE learner. Exists only for the cooldown and the one-time clear reward —
// the memory schedule lives on user_grammar_progress.
export const userGrammarItems = sqliteTable("user_grammar_items", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => grammarItems.id, { onDelete: "cascade" }),
  clearedAt: text("cleared_at"), // first time answered correctly — the reward fires once
  lastSeenAt: text("last_seen_at").notNull().default(nowSql),
  attempts: integer("attempts").notNull().default(0),
  wrongs: integer("wrongs").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.itemId] }),
  seenIdx: index("user_grammar_items_seen_idx").on(t.userId, t.lastSeenAt),
}));

// A drill the learner started but has not submitted. Stored server-side rather than in the
// browser so an unfinished session survives a device change — the items were already drawn and
// their cooldown already consumed, so losing them would silently burn part of the bank.
export const grammarPracticeSessions = sqliteTable("grammar_practice_sessions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // grammar point titles, joined — shown in the resume list
  // Which drill the draft belongs to: "auto" (quiz over grammar_items) or "translate" (over
  // grammar_translate_items). The two id spaces are disjoint, so without this a translation draft
  // would surface in the quiz resume list and fail to rebuild.
  mode: text("mode").notNull().default("auto"),
  // Translation difficulty rung. Resuming at a different rung would be a different exercise: the
  // bank and the first-letter skeleton are what the rung decides. Null for quiz drafts.
  level: text("level"),
  grammarIds: text("grammar_ids", { mode: "json" }).$type<string[]>().notNull(),
  itemIds: text("item_ids", { mode: "json" }).$type<string[]>().notNull(), // drawn order
  answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull(), // itemId -> raw answer
  total: integer("total").notNull(),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  userIdx: index("grammar_practice_sessions_user_idx").on(t.userId, t.updatedAt),
}));

// One drill session. `points` is computed at submit time (first clears + on-time reviews + tiers)
// so leaderboard/analytics never recompute it. Score is a percentage, like vocab.
export const grammarSubmissions = sqliteTable("grammar_submissions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  grammarIds: text("grammar_ids", { mode: "json" }).$type<string[]>().notNull(),
  mode: text("mode").notNull().default("all"),
  correct: real("correct").notNull(), // sum of partial credit
  total: integer("total").notNull(),
  score: integer("score").notNull(), // 0-100
  points: integer("points").notNull().default(0),
  result: text("result", { mode: "json" }).$type<GrammarSessionResult>(),
  submittedAt: text("submitted_at").notNull().default(nowSql),
}, (t) => ({
  userIdx: index("grammar_submissions_user_idx").on(t.userId, t.submittedAt),
}));

// Vietnamese -> English translation items. A SEPARATE table rather than a sixth QuestionType:
// `grammar_items.id` is positional (`gi-<point>-<NNN>`) and already bound to learners' rows, and
// widening QUESTION_TYPES would ripple into the teacher exercise editor and the AI generators.
export const grammarTranslateItems = sqliteTable("grammar_translate_items", {
  id: text("id").primaryKey().$defaultFn(uuid),
  grammarId: text("grammar_id")
    .notNull()
    .references(() => grammar.id, { onDelete: "cascade" }),
  cefr: text("cefr").$type<Cefr>().notNull(),
  tier: integer("tier").notNull().default(1), // 1 recognition · 2 applied · 3 advanced
  vi: text("vi").notNull(), // the prompt shown to the learner
  en: text("en").notNull(), // canonical answer, taken from the reviewed item bank
  // Alternative valid renderings, generated in the same EN->VI pass. Vietnamese-to-English is
  // one-to-many (finish/complete, her/the), so the stored sentence is one right answer, not the
  // only one — without this the grader fails correct translations. See §3.
  accept: text("accept", { mode: "json" }).$type<string[]>(),
  // Lemma bank: gives the vocabulary away but still requires the learner to build do-support,
  // inflect, and order the sentence. Mandatory below A2, null disables it. See §4.
  wordBank: text("word_bank", { mode: "json" }).$type<string[]>(),
  noteVi: text("note_vi"), // one-line reminder, shown after grading
  // Accept an answer that differs from the key ONLY by a/an/the. Vietnamese marks neither
  // definiteness nor genericity, so "eating grass" vs "eating the grass" are both fair renderings
  // of the same prompt. Set to 0 on the points where the article IS the thing being tested.
  articleLenient: integer("article_lenient").notNull().default(1),
  sourceItemId: text("source_item_id"), // provenance; also flags ordering items that leak the answer
  // Provenance for the template-generated layer: which of the
  // point's formulas produced the sentence, and which slot values filled it. Both are needed to trace
  // an item, to dedupe by construction rather than by string, and to regenerate the bank.
  patternId: text("pattern_id"),
  slots: text("slots", { mode: "json" }).$type<Record<string, string>>(),
  status: text("status").notNull().default("live"), // draft | live | retired
  source: text("source").notNull().default("ai"), // seed | ai | teacher
  seenCount: integer("seen_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
}, (t) => ({
  pickIdx: index("grammar_translate_items_pick_idx").on(t.grammarId, t.status, t.tier),
}));

// Cooldown + one-time clear reward, mirroring `user_grammar_items`. A separate table because that
// one's FK points at `grammar_items.id`. The FSRS schedule stays shared on `user_grammar_progress`
// (memory is per POINT, not per item), so translation practice advances the same state.
export const userGrammarTranslateItems = sqliteTable("user_grammar_translate_items", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => grammarTranslateItems.id, { onDelete: "cascade" }),
  clearedAt: text("cleared_at"),
  lastSeenAt: text("last_seen_at").notNull().default(nowSql),
  attempts: integer("attempts").notNull().default(0),
  wrongs: integer("wrongs").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.itemId] }),
  seenIdx: index("user_grammar_translate_items_seen_idx").on(t.userId, t.lastSeenAt),
}));

export const assignments = sqliteTable(
  "assignments",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    teacherNote: text("teacher_note"),
    assignedAt: text("assigned_at").notNull().default(nowSql),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.exerciseId] }),
  }),
);

// Báo cáo học tập tháng đã lưu (AI tạo, giáo viên chỉnh & lưu). 1 báo cáo / (học sinh, tháng).
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    // Chủ nhân báo cáo — ĐÚNG MỘT trong hai có giá trị (như submissions):
    // `studentId` là dữ liệu LỊCH SỬ của khu học sinh cũ; báo cáo mới ghi `userId`
    // (thành viên lớp).
    studentId: text("student_id").references(() => students.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // "2026-07"
    content: text("content").notNull(),
    // Snapshot số liệu THẬT lúc lưu (nullable — báo cáo cũ chưa có, chỉ hiện văn bản).
    stats: text("stats", { mode: "json" }).$type<ReportStats>(),
    slug: text("slug"), // link công khai đẹp, vd "minh-an-monthly-report-7-2026"
    createdAt: text("created_at").notNull().default(nowSql),
    updatedAt: text("updated_at").notNull().default(nowSql),
  },
  (t) => ({
    studentMonth: uniqueIndex("reports_student_month").on(t.studentId, t.month),
    userMonth: uniqueIndex("reports_user_month").on(t.userId, t.month),
    slug: uniqueIndex("reports_slug").on(t.slug),
  }),
);

// Trạng thái xoay key AI (Gemini). Chỉ lưu HASH của key (không lưu key thật)
// cùng metadata để chọn key "last-used lâu nhất" và tạm khóa (cooldown) khi lỗi/quota.
export const aiKeyUsage = sqliteTable("ai_key_usage", {
  keyId: text("key_id").primaryKey(), // SHA-256(key) rút gọn — định danh ổn định, không lộ key
  lastUsedAt: text("last_used_at"),
  failCount: integer("fail_count").notNull().default(0),
  cooldownUntil: text("cooldown_until"), // tạm bỏ qua key này tới thời điểm ISO nếu bị 429/403
  // Provider sở hữu key (google/openai/…). Không bắt buộc về chức năng — key_id vốn đã
  // tách biệt giữa các provider — chỉ để trang admin nhóm key mà không cần giữ key thật.
  provider: text("provider"),
});

// Provider API keys entered on the AI page, encrypted at rest (AES-GCM, see lib/ai/secrets.ts).
// Keys set as Worker secrets (<P>_API_KEYS) still work and are merged in at call time.
export const aiProviderKeys = sqliteTable(
  "ai_provider_keys",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    provider: text("provider").notNull(),
    label: text("label"),
    cipher: text("cipher").notNull(),
    hint: text("hint").notNull(), // last characters of the key, safe to display
    keyId: text("key_id").notNull(), // same hash as ai_key_usage.key_id
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({ keyIdx: uniqueIndex("ai_provider_keys_key_idx").on(t.keyId) }),
);

// Models the teacher can route tasks to. Seeded with defaults once; the teacher adds/removes freely.
export const aiModels = sqliteTable(
  "ai_models",
  {
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    label: text("label").notNull(),
    inPrice: real("in_price").notNull().default(0),
    outPrice: real("out_price").notNull().default(0),
    audio: integer("audio", { mode: "boolean" }).notNull().default(false),
    jsonSchema: integer("json_schema", { mode: "boolean" }).notNull().default(false),
    free: integer("free", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    createdAt: text("created_at").notNull().default(nowSql),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.modelId] }) }),
);

// Nhật ký MỖI lượt gọi AI — nguồn số liệu cho tab "Chi phí" ở /teacher/ai.
// Ghi cả lượt LỖI (ok=0): key hỏng / quota cạn là thứ cần nhìn thấy nhất.
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: text("created_at").notNull().default(nowSql),
    task: text("task").notNull(), // AiTaskName
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    keyId: text("key_id"), // hash — soi được key nào ngốn/hỏng
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    // CHỤP tại thời điểm gọi, không tính lúc đọc: giá catalog sẽ đổi (Sonnet 5 tăng giá
    // 01/09/2026) → tính lúc đọc sẽ viết lại lịch sử tháng trước theo giá mới = sai.
    costUsd: real("cost_usd").notNull().default(0),
    latencyMs: integer("latency_ms"),
    ok: integer("ok", { mode: "boolean" }).notNull().default(true),
    error: text("error"), // cắt 200 ký tự
  },
  (t) => ({
    createdIdx: index("ai_usage_created_idx").on(t.createdAt),
    taskIdx: index("ai_usage_task_idx").on(t.task),
  }),
);

// Cài đặt hệ thống dạng key-value (Telegram, bật/tắt auto nhận xét…).
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// Installs that report to the project site (only filled on the hub, see lib/installPing.ts).
export const installs = sqliteTable("installs", {
  url: text("url").primaryKey(),
  version: text("version").notNull().default(""),
  lastEvent: text("last_event").notNull(),
  pings: integer("pings").notNull().default(0),
  firstSeenAt: text("first_seen_at").notNull().default(nowSql),
  lastSeenAt: text("last_seen_at").notNull().default(nowSql),
  lastUpdateAt: text("last_update_at"),
});

// Hàng chờ tạo bài bằng AI (xử lý bất đồng bộ qua Cloudflare Queues).
export const genJobs = sqliteTable("gen_jobs", {
  id: text("id").primaryKey().$defaultFn(uuid),
  status: text("status").notNull().default("queued"), // queued | generating | done | error
  kind: text("kind").notNull().default("quiz"), // quiz | reading (bài đọc to) | speaking — pipeline chấm
  template: text("template"), // blueprint id (grammar_drill…) → chọn prompt quiz chuyên biệt. NULL = suy theo kind
  grammarIds: text("grammar_ids", { mode: "json" }).$type<string[]>(), // điểm ngữ pháp focus → dựng khối GRAMMAR FOCUS
  genConfig: text("gen_config", { mode: "json" }).$type<Record<string, unknown>>(), // config AI Composer → lưu vào bài để tạo lại
  overwriteId: text("overwrite_id"), // exercise_id CẦN GHI ĐÈ (tạo lại đè lên bài cũ). NULL = tạo bài mới.
  prompt: text("prompt").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  assignIds: text("assign_ids", { mode: "json" }).$type<string[]>(),
  tagId: text("tag_id"), // nhãn (tags.id) áp cho bài khi tạo xong — quyết định phạm vi.
  topicId: text("topic_id"), // chủ đề (topics.id) áp cho bài khi tạo xong. GV chọn ở AI Composer.
  layer: text("layer"), // 'academic' = lớp học thuật opt-in, áp cho bài khi tạo xong
  title: text("title"), // điền khi xong (để hiện trên card)
  exerciseId: text("exercise_id"), // slug bài đã tạo (khi done)
  error: text("error"),
  // Questions the model produced that failed the per-type rules and were discarded. The teacher
  // would otherwise just receive a shorter exercise with no sign anything was lost. Cleared to 0
  // once acknowledged, which is what removes the notice.
  dropped: integer("dropped").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
});

// TEMPLATE lựa chọn của AI Composer — GV lưu cả bộ tùy chọn (skill…prompt) để nạp lại.
// Lưu trên cloud (thay localStorage) để dùng chung mọi thiết bị. `config` = JSON tự do.
export const genTemplates = sqliteTable("gen_templates", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
});

// Job CHẤM ĐỌC TO bất đồng bộ: học sinh upload xong (audio đã ở R2) → tạo job → queue
// consumer chạy Azure + Gemini (không giữ client chờ) → client poll theo id. `stage`
// để hiện % tiến độ ở màn chờ. Khi xong, `submissionId` trỏ tới reading_submissions.
export const readingJobs = sqliteTable("reading_jobs", {
  id: text("id").primaryKey().$defaultFn(uuid),
  status: text("status").notNull().default("queued"), // queued | assessing | feedback | done | error
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, { onDelete: "cascade" }),
  // Lượt đọc to của user CÔNG KHAI (mutually exclusive với studentId — đúng 1 trong 2).
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  audioKey: text("audio_key").notNull(), // key R2 của bản ghi đã upload
  contentType: text("content_type").notNull(), // mime of the uploaded recording
  // Raw Azure results of a take scored in the browser (Speech SDK, continuous mode). NULL = the
  // server scores the recording itself (short WAV only).
  browserSegments: jsonCol<AzureSegment[]>("browser_segments"),
  withFeedback: integer("with_feedback", { mode: "boolean" }).notNull().default(true), // AI comment for this take?
  submissionId: text("submission_id"), // reading_submissions.id khi done
  error: text("error"),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  // Poll/dọn theo học sinh + thời gian.
  studentIdx: index("reading_jobs_student_idx").on(t.studentId, t.createdAt),
  userIdx: index("reading_jobs_user_idx").on(t.userId, t.createdAt),
}));

// Writing submissions: plain text graded by the LLM on four 0-100 criteria.
export const writingSubmissions = sqliteTable("writing_submissions", {
  id: text("id").primaryKey().$defaultFn(uuid),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  text: text("text").notNull(), // the learner's piece
  wordCount: integer("word_count").notNull(),
  overallScore: integer("overall_score").notNull(), // điểm tổng 0-100
  taskBand: integer("task_band"), // content — /100
  coherenceBand: integer("coherence_band"), // organisation — /100
  grammarBand: integer("grammar_band"), // grammar — /100
  lexicalBand: integer("lexical_band"), // vocabulary — /100
  analysis: text("analysis", { mode: "json" }).$type<Record<string, unknown>>(),
  aiFeedback: text("ai_feedback"),
  teacherFeedback: text("teacher_feedback"),
  submittedAt: text("submitted_at").notNull().default(nowSql),
}, (t) => ({
  userSubmittedIdx: index("writing_submissions_user_submitted_idx").on(t.userId, t.submittedAt),
}));

// Job CHẤM VIẾT bất đồng bộ (clone speaking_jobs, bỏ audio — lưu thẳng text).
export const writingJobs = sqliteTable("writing_jobs", {
  id: text("id").primaryKey().$defaultFn(uuid),
  status: text("status").notNull().default("queued"), // queued | grading | done | error
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  studentId: text("student_id").references(() => students.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(), // bài viết — lưu thẳng, không R2 (không phải audio)
  submissionId: text("submission_id"), // writing_submissions.id khi done
  error: text("error"),
  createdAt: text("created_at").notNull().default(nowSql),
  updatedAt: text("updated_at").notNull().default(nowSql),
}, (t) => ({
  studentIdx: index("writing_jobs_student_idx").on(t.studentId, t.createdAt),
  userIdx: index("writing_jobs_user_idx").on(t.userId, t.createdAt),
}));

// Điểm cao nhất trò chơi "chờ chấm" (endless runner) theo học sinh — để hiện kỷ lục
// bản thân + bảng TOP server. 1 dòng / học sinh (giữ điểm cao nhất).
// Kỷ lục game "chờ chấm" (endless runner) — 1 dòng/người, giữ điểm CAO NHẤT.
// Chủ nhân đổi từ `students` sang `users` cùng Phase 5; bảng cũ đã
// xoá sạch khi chuyển, bảng xếp hạng bắt đầu lại từ đầu.
export const gameScores = sqliteTable("game_scores", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  best: integer("best").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(nowSql),
});

export type ExerciseRow = typeof exercises.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type StudentRow = typeof students.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type EmailChangeRow = typeof emailChanges.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type LevelRow = typeof levels.$inferSelect;
export type TopicRow = typeof topics.$inferSelect;
export type GrammarRow = typeof grammar.$inferSelect;
export type GrammarItemRow = typeof grammarItems.$inferSelect;
export type GrammarSubmissionRow = typeof grammarSubmissions.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type MediaTitleRow = typeof mediaTitles.$inferSelect;
export type AiKeyUsageRow = typeof aiKeyUsage.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type GenJobRow = typeof genJobs.$inferSelect;
export type VocabItemRow = typeof vocabItems.$inferSelect;
export type VocabSetRow = typeof vocabSets.$inferSelect;
export type VocabSubmissionRow = typeof vocabSubmissions.$inferSelect;
export type ReadingJobRow = typeof readingJobs.$inferSelect;
