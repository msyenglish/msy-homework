// Client gọi API (@msyen/api). Same-origin → cookie tự đính kèm.
import { toWav16k } from "./wav";
import { t, type TKey } from "../i18n";
import type {
  AzureSegment,
  Brand,
  Classroom,
  GrammarDrillAnswer,
  GrammarDrillItem,
  GrammarMastery,
  GrammarSessionInput,
  GrammarSessionResult,
  GrammarTranslateAvailability,
  GrammarTranslateAnswer,
  GrammarTranslateItem,
  GrammarTranslateResult,
  GrammarTranslateSessionInput,
  EmailChangeItem,
  Exercise,
  ExerciseInput,
  Grammar,
  GrammarInput,
  GrammarListItem,
  GrammarNote,
  GrammarMarked,
  GrammarWeak,
  Level,
  LevelInput,
  LibraryItem,
  LibraryMeta,
  AssignedQueueSummary,
  PathState,
  PublicUser,
  QuestionType,
  ReportStats,
  Skill,
  Student,
  Tag,
  TagInput,
  Topic,
  TopicInput,
  VocabItem,
  VocabItemInput,
  VocabSetInput,
  MyVocabAddInput,
  GrammarDrillItemInput,
  GrammarTranslateItemsInput,
  VocabDeckConfigInput,
  VocabDeckResult,
  VocabDeckMode,
  VocabSessionState,
  VocabDeckConfig,
  PracticeDraftKind,
  VideoSegment,
  VideoMode,
  VideoShadowDetail,
  PublicVideoLesson,
  PublicDictation,
  Cefr,
  TranslateLevel,
  TtsConfig,
  TtsProvider,
  TtsVoice,
} from "@msyen/shared";

const BASE = "/api/v1";

async function req<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  // `status` lets a caller tell "not available here" (501) from a real failure.
  if (!res.ok) throw Object.assign(new Error(data?.error || t("lib.api.error.status", { status: res.status })), { status: res.status });
  return data as T;
}

const post = <T>(p: string, body?: unknown) =>
  req<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T>(p: string, body?: unknown) =>
  req<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
const patch = <T>(p: string, body?: unknown) =>
  req<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
const del = <T>(p: string) => req<T>(p, { method: "DELETE" });

// ---------- Auth (giáo viên) ----------
/** Dev-only one-click sign-in (404 unless the API runs with DEV_QUICK_LOGIN=1 on localhost). */
export const devApi = {
  quickLogin: (role: "teacher" | "user") => post<{ email: string }>("/dev/quick-login", { role }),
};

export const auth = {
  login: (email: string, password: string) =>
    post<{ teacher: { id: string; email: string; name?: string } }>("/auth/login", { email, password }),
  logout: () => post("/auth/logout"),
  me: () => req<{ teacher: { id: string; email: string; name?: string | null } }>("/auth/me"),
};

// ---------- Teacher: exercises ----------
export interface TeacherUserListParams {
  q?: string;
  provider?: string;
  status?: string; // active | inactive
  level?: string; // <levelId> | none
  class_id?: string; // <classId> | any | none
  activity?: string; // online | today | week | inactive (presence window on last_seen_at)
  sort?: string; // "seen" = most recently active first; empty = newest account first
  page?: number;
  per_page?: number; // bỏ trống → trả tất cả
}
export interface TeacherUserListResp {
  items: TeacherUserRow[];
  total: number;
  page: number;
  per_page: number;
  stats: { total: number; active: number; email: number; google: number; no_level: number; online: number; in_class: number };
}
export interface ExerciseListParams {
  q?: string;
  skill?: string;
  status?: string;
  level?: string;
  topic_id?: string;
  tag_id?: string;
  page?: number;
  /** Bỏ trống → server trả TẤT CẢ (drawer giao bài cần danh sách đầy đủ). */
  per_page?: number;
}
export type TeacherExerciseRow = Exercise & {
  question_count: number;
  /** Số TỪ của bài bộ thẻ từ vựng; null = không phải bộ thẻ. */
  deck_words: number | null;
  /** Số ĐOẠN luyện của bài video (nghe-viết/shadowing); null = không phải bài video. */
  segment_count: number | null;
  attempts: number;
  avg_pct: number | null;
  assignee_count: number;
  assignee_names: string[];
  /** Classes assigned as a WHOLE — a separate channel, never counted in assignee_* (per learner). */
  class_count: number;
  class_names: string[];
};
export interface ExerciseListResp {
  items: TeacherExerciseRow[];
  total: number; // số kết quả SAU lọc (cho phân trang)
  page: number;
  per_page: number;
  stats: { total: number; published: number; attempts: number; avg_pct: number }; // toàn thư viện
}
export const exercisesApi = {
  list: (p: ExerciseListParams = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) qs.set(k, String(v));
    return req<ExerciseListResp>(`/teacher/exercises${qs.toString() ? `?${qs}` : ""}`);
  },
  /** Every exercise, only what an assign picker shows (no counts — cheap on a large library). */
  pick: () =>
    req<{ items: { exercise_id: string; title: string; skill: string | null; level: string | null; published: boolean }[] }>(
      "/teacher/exercises?fields=pick",
    ),
  get: (slug: string) => req<Exercise & { questions: unknown[] }>(`/teacher/exercises/${slug}`),
  /** Xem thử: đề dạng học sinh (đã ẩn đáp án), không cần mã, chạy cả khi còn nháp. */
  preview: (slug: string) => req<PublicExerciseResp>(`/teacher/exercises/${slug}/preview`),
  /** Chấm thử — KHÔNG lưu bài nộp (không có submission_id). */
  previewGrade: (slug: string, answers: Record<string, string>) =>
    post<GradeResp>(`/teacher/exercises/${slug}/preview/grade`, { answers }),
  /** Preview twin of libraryApi.translateAnswer. */
  previewTranslateAnswer: (slug: string, position: number) =>
    post<{ position: number; en: string }>(`/teacher/exercises/${slug}/preview/translate-answer`, { position }),
  save: (ex: ExerciseInput) => post<{ exercise_id: string }>("/teacher/exercises", ex),
  setPublished: (slug: string, published: boolean) =>
    patch(`/teacher/exercises/${slug}/publish`, { published }),
  remove: (slug: string) => del(`/teacher/exercises/${slug}`),
  // Thùng rác: liệt kê / khôi phục (về nháp) / dọn hẳn (xóa mềm ở remove ở trên).
  trash: () => req<{ items: TrashedExercise[] }>("/teacher/exercises/trash"),
  restore: (slug: string) => post<{ ok: boolean }>(`/teacher/exercises/${slug}/restore`, {}),
  purge: (slug: string) => del<{ ok: boolean }>(`/teacher/exercises/${slug}/purge`),
  assignees: (slug: string) => req<ExerciseAssignees>(`/teacher/exercises/${slug}/assignees`),
  addAssignee: (slug: string, student_id: string) =>
    post(`/teacher/exercises/${slug}/assignees`, { student_id }),
  removeAssignee: (slug: string, studentId: string) =>
    del(`/teacher/exercises/${slug}/assignees/${studentId}`),
  // Giao bài cho CẢ LỚP nhìn từ phía bài — mỗi lớp một tick bật/tắt.
  classAssignees: (slug: string) =>
    req<{ exercise: { title: string; exercise_id: string }; items: ExerciseClassRow[] }>(
      `/teacher/exercises/${slug}/classes`,
    ),
  addClass: (slug: string, class_id: string) => post(`/teacher/exercises/${slug}/classes`, { class_id }),
  removeClass: (slug: string, classId: string) => del(`/teacher/exercises/${slug}/classes/${classId}`),
};

/** 1 lớp trong tab "Giao cho lớp học" — kèm cờ đã giao bài này chưa. */
export interface ExerciseClassRow {
  id: string;
  name: string;
  active: boolean;
  member_count: number;
  assigned: boolean;
}

// ---------- Teacher: bài học qua VIDEO (transcript → đoạn luyện) ----------
export interface VideoTranscriptResp {
  youtube_id: string | null;
  has_timing: boolean;
  segments: VideoSegment[];
}
export const videoTeacherApi = {
  /** Dán transcript SRT/VTT (hoặc text) → tách đoạn có timestamp. */
  transcript: (raw: string, youtube_url?: string, merge_sentences = true) =>
    post<VideoTranscriptResp>("/teacher/video/transcript", { raw, youtube_url, merge_sentences }),
  /** Automatic STT of a media URL; a YouTube link is served from the transcript cache only, else 501. */
  transcribeUrl: (url: string, lang?: string, range?: { start?: number; end?: number }) =>
    post<VideoTranscriptResp>("/teacher/video/transcribe", { url, lang, ...range }),
  /** AI picks level + topic + a short title from the transcript (levels/topics from the DB). */
  classify: (title: string, segments: { text: string }[]) =>
    post<{ level: string | null; topic_id: string | null; topic: string | null; title: string }>("/teacher/video/classify", {
      title,
      segments: segments.map((s) => ({ text: s.text })),
    }),
  /** Tiêu đề + kênh của video YouTube (oEmbed qua Worker) — để tự điền tiêu đề bài. */
  meta: (url: string) =>
    req<{ youtube_id: string; title: string | null; author: string | null }>(`/teacher/video/meta?url=${encodeURIComponent(url)}`),
  /** AI chuẩn hoá câu + chọn từ khoét (giữ nguyên timestamp). */
  aiSegment: (segments: VideoSegment[], level?: string | null, make_blanks = true) =>
    post<{ segments: VideoSegment[] }>("/teacher/video/ai-segment", { segments, level, make_blanks }),
  /** AI gộp câu theo NGỮ CẢNH (không cắt theo số từ) — trả về danh sách đoạn đã gộp lại. */
  aiGroup: (segments: VideoSegment[], level?: string | null) =>
    post<{ segments: VideoSegment[] }>("/teacher/video/ai-group", { segments, level }),
  /** STT of an uploaded audio file → timestamped segments. With a YouTube link the result is cached for that video. */
  transcribeFile: async (file: File, lang?: string, youtubeUrl?: string, range?: { start?: number; end?: number }): Promise<VideoTranscriptResp> => {
    const fd = new FormData();
    fd.append("audio", file);
    if (lang) fd.append("lang", lang);
    if (youtubeUrl) fd.append("youtube_url", youtubeUrl);
    if (range?.start) fd.append("start", String(range.start));
    if (range?.end) fd.append("end", String(range.end));
    const res = await fetch(`${BASE}/teacher/video/transcribe`, { method: "POST", credentials: "include", body: fd });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || t("lib.api.error.status", { status: res.status }));
    return data as VideoTranscriptResp;
  },
};

// ---------- User: luyện bài học qua VIDEO ----------
// A take restored from a previous session carries the graded detail only — `overall`/`quota` are
// answers to the request that graded it, so they are absent then.
export interface VideoShadowResult extends VideoShadowDetail {
  segment: number;
  overall?: { avg: number; done: number; total: number }; // lesson-wide aggregate
  quota?: { used: number; limit: number; reset_at: string };
}
/** Result of checking one dictation line (instant; the answer stays hidden until it is right). */
export interface DictationCheckResult {
  segment: number;
  correct: boolean;
  per_blank: { index: number; ok: boolean }[] | null;
  expected: string | null; // chỉ có khi đã đúng
  done_count: number;
  total: number;
}
export interface DictationHintResult {
  segment: number;
  level: number;
  targets: { index: number; prefix: string; len: number }[];
}
/** Tiến độ 1 đoạn nghe-viết (thống kê học). */
export interface DictationProgressRow {
  segment: number;
  attempts: number;
  hints: number;
  first_ok: boolean;
  revealed: boolean;
  done: boolean;
  /** Difficulty the line was finished at — restoring only matches the rung in play. */
  level: string | null;
  updated_at: string;
}
export interface VideoReportLine {
  segment: number;
  text: string;
  attempts?: number;
  hints?: number;
  revealed?: boolean;
  score?: number;
}
export interface VideoReport {
  title: string;
  level: string | null;
  total: number;
  dictation: {
    done: number;
    first_ok: number;
    revealed: number;
    hint_lines: number;
    points: number;
    typed_words: number;
    streak: number;
    days: number;
    /** Từ nằm sau những câu phải mở hint sâu nhất / xin đáp án — thứ đáng tra lại. */
    tricky: { word: string; segment: number; why: "hint" | "revealed" }[];
    hardest: VideoReportLine[];
  };
  shadow: { done: number; avg: number; points: number; weakest: VideoReportLine[] };
  max: { dictation: Record<string, number>; shadow: number };
  feedback: string | null;
  grammar: { id: string; title: string; cefr: string }[];
  feedback_left: number;
  feedback_reset_at: string;
}

export const videoLibraryApi = {
  lesson: (slug: string, mode?: VideoMode) => post<PublicVideoLesson>(`/library/${slug}/video`, { mode }),
  progress: (slug: string) => post<{ total: number; dictation: DictationProgressRow[] }>(`/library/${slug}/video/progress`),
  check: (slug: string, segment: number, ans: { sentence?: string; blanks?: string[] }, level?: string) =>
    post<DictationCheckResult>(`/library/${slug}/video/dictation/check`, { segment, ...ans, level }),
  /** One more letter of blank `word`: `level` = that word's hint level, `total` = levels across the line. */
  hint: (slug: string, segment: number, word: number, level: number, total: number, rung?: string) =>
    post<DictationHintResult>(`/library/${slug}/video/dictation/hint`, { segment, word, level, total, rung }),
  /** Tổng kết bài Nghe & Nói: số liệu nghe-viết + nói nhại + câu vật lộn nhất. */
  report: (slug: string) => post<VideoReport>(`/library/${slug}/video/report`, {}),
  /** Nhận xét của cô cho bài này (dùng ví quota nhận xét chung). */
  /** `regen` = viết lại theo dữ liệu MỚI (tốn thêm một lượt), thay vì lấy bản đã lưu. */
  feedback: (slug: string, level?: string, regen?: boolean) =>
    post<{ feedback: string; grammar: { id: string; title: string; cefr: string }[]; cached: boolean }>(
      `/library/${slug}/video/feedback`,
      { level, regen },
    ),
  reveal: (slug: string, segment: number, level?: string) =>
    post<{ segment: number; expected: string; done_count: number; total: number }>(
      `/library/${slug}/video/dictation/reveal`,
      { segment, level },
    ),
  shadow: async (slug: string, segment: number, audio: Blob): Promise<VideoShadowResult> => {
    const fd = new FormData();
    fd.append("audio", await toWav16k(audio), "shadow.wav");
    fd.append("segment", String(segment));
    const res = await fetch(`${BASE}/library/${slug}/video/shadow`, { method: "POST", credentials: "include", body: fd });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || t("lib.api.error.status", { status: res.status }));
    return data as VideoShadowResult;
  },
};

/** Thao tác của trang luyện Nghe & Nói — bind theo danh tính (user thật) hoặc xem thử (cô). */
export type VideoApi = Pick<typeof videoLibraryApi, "lesson" | "check" | "hint" | "reveal" | "shadow">;

const VIDEO_PREVIEW_MSG: TKey = "lib.api.preview.recordUnavailable";

/**
 * Xem thử bài Nghe & Nói (giáo viên): đề lấy qua route teacher, còn check/hint/reveal là các
 * lệnh GHI TIẾN ĐỘ nên bỏ trống — trang tự chấm tại chỗ, chỉ mất phần lưu lại.
 */
export const videoPreviewApi: VideoApi = {
  lesson: (slug: string, mode?: VideoMode) =>
    post<PublicVideoLesson>(`/teacher/exercises/${slug}/preview/video`, { mode }),
  check: () => Promise.reject(new Error(t("lib.api.preview.progressUnavailable"))),
  hint: () => Promise.reject(new Error(t("lib.api.preview.progressUnavailable"))),
  reveal: () => Promise.reject(new Error(t("lib.api.preview.progressUnavailable"))),
  shadow: () => Promise.reject(new Error(t(VIDEO_PREVIEW_MSG))),
};

// ---- Lessons a LEARNER imported from their own YouTube link ----

/** Learners a single exercise is assigned to, seen from the exercise side (class members now). */
export interface AssignedStudent {
  id: string;
  name: string;
  level: Level | null;
  active: boolean;
  teacher_note: string | null;
  done: boolean;
  lastScore: number | null;
  lastTotal: number | null;
  lastAt: string | null;
}
export interface ExerciseAssignees {
  exercise: { title: string; exercise_id: string };
  assigned: AssignedStudent[];
  available: { id: string; name: string }[];
}

// ---------- Teacher: students ----------
export interface StudentStats {
  assigned: number;
  notDone: number;
  low: number;
}
export type StudentWithStats = Student & { stats: StudentStats };

// CHỈ còn bề mặt LỊCH SỬ: 7 học sinh cũ (bảng `students`) để ReportsPage viết báo cáo
// tháng cho các em ấy. Học sinh đang học nằm ở classesApi/teacherUsersApi.
export const studentsApi = {
  list: () => req<{ items: StudentWithStats[] }>("/teacher/students"),
  mistakes: (id: string, from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return req<{ mistakes: Mistake[] }>(`/teacher/students/${id}/mistakes?${q}`);
  },
  aiReport: (id: string, body: { from: string; to: string; month: string; teacher_note?: string }) =>
    post<{ report: string }>(`/teacher/students/${id}/ai-report`, body),
};

// ---------- Teacher: báo cáo đã lưu ----------
export interface SavedReport {
  id: string;
  // Chủ nhân: đúng một trong hai (userId = thành viên lớp, studentId = học sinh cũ).
  studentId: string | null;
  userId: string | null;
  studentName: string; // tên hiển thị, server đã chọn sẵn bên nào có
  month: string;
  content: string;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
}
export const reportsApi = {
  list: (student?: string) =>
    req<{ items: SavedReport[] }>(`/teacher/reports${student ? `?student=${encodeURIComponent(student)}` : ""}`),
  // Chủ nhân: `user_id` (thành viên lớp — cách làm hiện tại) HOẶC `student_id` (học sinh cũ).
  save: (body: { student_id?: string; user_id?: string; month: string; content: string }) =>
    post<{ id: string; slug: string | null }>("/teacher/reports", body),
  remove: (id: string) => del<{ ok: boolean }>(`/teacher/reports/${id}`),
};

// ---------- Teacher: levels (cấp độ học sinh) ----------
export const levelsApi = {
  list: () => req<{ items: Level[] }>("/teacher/levels"),
  save: (l: LevelInput) => post<{ id: string }>("/teacher/levels", l),
  remove: (id: string) => del(`/teacher/levels/${id}`),
};

// ---------- Teacher: chủ đề (topic) bài tập ----------
export const topicsApi = {
  list: () => req<{ items: Topic[] }>("/teacher/topics"),
  save: (t: TopicInput) => post<{ id: string }>("/teacher/topics", t),
  remove: (id: string) => del(`/teacher/topics/${id}`),
};

// ---------- Teacher: vocabulary sets ----------
export interface TeacherVocabSet {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  levelId: string | null;
  levelName: string | null;
  active: boolean;
  wordCount: number;
  updatedAt: string;
}

export const vocabApi = {
  sets: () => req<{ items: TeacherVocabSet[] }>("/teacher/vocab/sets"),
  saveSet: (body: VocabSetInput) => post<{ set: TeacherVocabSet }>("/teacher/vocab/sets", body),
  deleteSet: (id: string) => del(`/teacher/vocab/sets/${id}`),
  /** Every word of every set, each tagged with its set. */
  allItems: () => req<{ items: (VocabItem & { setId: string })[] }>("/teacher/vocab/items"),
  setItems: (id: string) => req<{ set: TeacherVocabSet; items: VocabItem[] }>(`/teacher/vocab/sets/${id}/items`),
  saveItems: (id: string, items: VocabItemInput[]) => put<{ ok: boolean; wordCount: number }>(`/teacher/vocab/sets/${id}/items`, { items }),
  /** AI completes entries; `overwrite` replaces the teacher's own text too. */
  aiFill: (body: { items: VocabItemInput[]; context?: string | null; instruction?: string | null; overwrite?: boolean }) =>
    post<{ items: VocabItemInput[] }>("/teacher/vocab/ai-fill", body),
  /** AI picks new words for a description and writes full entries. */
  aiSuggest: (body: { prompt: string; count: number; form: "word" | "phrase" | "both"; exclude: string[]; context?: string | null }) =>
    post<{ items: VocabItemInput[] }>("/teacher/vocab/ai-suggest", body),
};

// ---------- Teacher: nhãn bài tập (kèm phạm vi all/student) ----------
export const tagsApi = {
  list: () => req<{ items: Tag[] }>("/teacher/tags"),
  save: (t: TagInput) => post<{ id: string }>("/teacher/tags", t),
  remove: (id: string) => del(`/teacher/tags/${id}`),
};

// ---------- Teacher: settings (Telegram, mật khẩu, auto nhận xét) ----------
export interface AppSettingsView {
  telegram_chat_id: string;
  telegram_enabled: boolean;
  telegram_feedback_notify: boolean;
  telegram_bot_token_set: boolean;
  telegram_bot_token_hint: string;
  brand: Brand;
}
export interface InstallRow {
  url: string;
  version: string;
  lastEvent: "install" | "update" | "daily";
  pings: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastUpdateAt: string | null;
}
export interface InstallStats {
  hub: boolean;
  total: number;
  active7: number;
  items: InstallRow[];
}

export const settingsApi = {
  installs: () => req<InstallStats>("/teacher/installs"),
  get: () => req<AppSettingsView>("/teacher/settings"),
  update: (patch: Partial<{ telegram_bot_token: string; telegram_chat_id: string; telegram_enabled: boolean; telegram_feedback_notify: boolean; brand: Partial<Brand> }>) =>
    put("/teacher/settings", patch),
  telegramTest: (body?: { telegram_bot_token?: string; telegram_chat_id?: string }) =>
    post("/teacher/settings/telegram/test", body ?? {}),
  telegramTestSample: () => post("/teacher/settings/telegram/test-sample"),
  changePassword: (next: string) => post("/teacher/settings/password", { new: next }),
  changeEmail: (email: string) => post<{ ok: boolean; email: string }>("/teacher/settings/email", { email }),
};

// ---------- Teacher: submissions ----------
export interface ExerciseAttempt {
  id: string;
  /** "vocab" = a vocab-deck session: opens the /s/:id report instead of the quiz review. */
  kind?: "quiz" | "vocab";
  score: number;
  total: number;
  pct: number;
  submitted_at: string;
  hint_used: boolean;
  has_feedback: boolean;
}
export interface ExerciseResultLearner {
  key: string;
  user_id: string | null;
  name: string;
  avatar_url: string | null;
  attempts: ExerciseAttempt[];
  best_pct: number;
  best_id: string;
  last_pct: number;
  last_at: string;
}
export interface ExerciseResults {
  exercise: { slug: string; title: string; skill: string | null };
  stats: { learners: number; attempts: number; avg_pct: number | null; best_pct: number | null; buckets: number[] };
  learners: ExerciseResultLearner[];
}
// ---------- Teacher: submissions ----------
export const submissionsApi = {
  /** Every attempt at one exercise, grouped per learner. */
  byExercise: (slug: string) => req<ExerciseResults>(`/teacher/submissions/by-exercise/${encodeURIComponent(slug)}`),
  review: (id: string) => req<SubmissionReview>(`/teacher/submissions/${id}/review`),
  setFeedback: (id: string, feedback: string) =>
    patch(`/teacher/submissions/${id}/feedback`, { feedback }),
  aiFeedback: (id: string) =>
    post<{ feedback: string }>(`/teacher/submissions/${id}/ai-feedback`),
};

// ---------- Teacher: bài ĐỌC TO (chấm phát âm) ----------
export interface TeacherReadingItem {
  id: string;
  studentId: string | null;
  studentName: string | null;
  pronScore: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  transcript: string | null;
  // `words` (chấm âm vị) KHÔNG có ở list — tải lười qua teacherReadingApi.words(id) khi mở chi tiết.
  aiFeedback: string | null;
  teacherFeedback: string | null;
  audio_url: string;
  durationMs: number | null;
  submittedAt: string;
}
export interface TeacherReadingList {
  exercise: { title: string; exercise_id: string; passage: string };
  items: TeacherReadingItem[];
}
// Một lượt đọc trong bảng tổng hợp theo HỌC SINH (kèm tên bài).
export interface TeacherReadingStudentItem {
  id: string;
  exerciseTitle: string | null;
  exerciseSlug: string | null;
  pronScore: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  // `words` tải lười qua teacherReadingApi.words(id) khi mở chi tiết (không trả ở list).
  aiFeedback: string | null;
  teacherFeedback: string | null;
  audio_url: string;
  submittedAt: string;
}
export interface TeacherReadingStudentStats {
  count: number;
  avg_pron: number | null;
  avg_accuracy: number | null;
  avg_fluency: number | null;
  avg_completeness: number | null;
  timeline: { date: string; pron: number; title: string }[];
  weak_words: { word: string; count: number }[];
}
export interface TeacherReadingByStudent {
  student: { id: string; name: string };
  stats: TeacherReadingStudentStats;
  items: TeacherReadingStudentItem[];
}
export const teacherReadingApi = {
  byExercise: (slug: string) => req<TeacherReadingList>(`/teacher/reading/by-exercise/${slug}`),
  byStudent: (studentId: string) =>
    req<TeacherReadingByStudent>(`/teacher/reading/by-student/${studentId}`),
  // Chấm âm vị đầy đủ của 1 lượt (tải lười khi mở chi tiết) — từ R2, không nằm ở list.
  words: (id: string) => req<{ words: ReadingWordResult[] }>(`/teacher/reading/${id}/words`),
  setFeedback: (id: string, feedback: string) =>
    patch<{ ok: boolean }>(`/teacher/reading/${id}/feedback`, { feedback }),
  // Tạo lại nhận xét AI cho 1 lượt đọc (chấm lại từ dữ liệu đã lưu, không cần audio).
  regenerateFeedback: (id: string) =>
    post<{ feedback: string }>(`/teacher/reading/${id}/regenerate-feedback`, {}),
  // Tạo audio đọc mẫu (TTS) từ đoạn văn → trả url đã lưu R2 + phụ đề đồng bộ (cues).
  // title (tùy chọn): tiêu đề bài → gắn vào metadata file audio (tên tải về + customMetadata).
  // dialogue: script có ≥2 nhãn vai → đọc NHIỀU giọng (bài nghe). Bài đọc-mẫu/mixed để false.
  modelAudio: (text: string, gender?: "male" | "female", title?: string, dialogue?: boolean) =>
    post<{ url: string; cues: AudioCuesResp | null; ttsLabel?: string; voiceInfo?: string }>(
      "/teacher/reading/model-audio",
      { text, gender, title, dialogue },
    ),
};

// ---------- Teacher: audio ----------
export interface AudioAsset {
  key: string;
  url: string;
  name: string; // tên file gốc (đã bỏ prefix + uuid)
  title?: string | null; // tiêu đề giáo viên đặt — để tìm lại; null = chưa đặt
  size: number;
  uploaded: string;
  content_type?: string;
  is_image?: boolean;
}
export const audioApi = {
  // kind=audio: ảnh & audio chung bucket R2 → thiếu tham số này là thư viện ra lẫn cả ảnh.
  list: () => req<{ items: AudioAsset[] }>("/teacher/audio?kind=audio"),
  // Tải 1 file audio thô lên R2 → trả { key, url }. Body = bytes file (content-type theo file).
  upload: async (file: File): Promise<{ key: string; url: string }> => {
    const res = await fetch(`${BASE}/teacher/audio`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": file.type || "audio/mpeg" },
      body: file,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || t("lib.api.error.status", { status: res.status }));
    return data as { key: string; url: string };
  },
  remove: (key: string) => del<{ ok: boolean }>(`/teacher/audio/${key}`),
  // Đặt tiêu đề cho file (để tìm lại trong thư viện). Chuỗi rỗng = xoá tiêu đề.
  rename: (key: string, title: string) =>
    patch<{ ok: boolean; title: string | null }>(`/teacher/audio/${key}`, { title }),
};
// 1 kết quả tìm ảnh online (Pexels/Pixabay).
export interface ImageHit {
  id: string;
  thumb: string;
  full: string;
  source: "Pexels" | "Pixabay";
  author: string;
  alt?: string;
}
// Thư viện ẢNH của dự án (dùng chung R2 với audio; lọc kind=image ở server) + tìm ảnh online.
export const mediaApi = {
  images: () => req<{ items: AudioAsset[] }>("/teacher/audio?kind=image"),
  remove: (key: string) => del<{ ok: boolean }>(`/teacher/audio/${key}`),
  rename: (key: string, title: string) =>
    patch<{ ok: boolean; title: string | null }>(`/teacher/audio/${key}`, { title }),
  // Tìm ảnh online (Pexels chính, Pixabay fallback).
  search: (q: string) =>
    req<{ items: ImageHit[]; source: "Pexels" | "Pixabay" | null }>(`/teacher/media/search?q=${encodeURIComponent(q)}`),
  // Nhập 1 ảnh (URL Pexels/Pixabay) về R2 → trả URL same-origin để dùng.
  importImage: (url: string) => post<{ key: string; url: string }>("/teacher/media/import", { url }),
};

// ---------- Teacher: AI ----------
export interface AiGenQuestionsInput {
  source: string;
  skill?: string | null;
  level?: string | null;
  count: number;
  types: string[];
  /** Target these grammar points — the prompt then carries only these, in detail. */
  grammar_ids?: string[] | null;
  /** No point named: draw at random from these CEFR bands (catalogue narrowed to them). */
  bands?: Cefr[] | null;
  context?: string | null;
  keywords?: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
}
export const aiApi = {
  generateQuestions: (body: AiGenQuestionsInput) =>
    post<{ questions: Record<string, unknown>[] }>("/teacher/ai/questions", body),
  // Xem trước prompt sinh câu hỏi (0 token) — cô copy sang AI ngoài rồi dán JSON về.
  questionsPrompt: (body: AiGenQuestionsInput) =>
    post<{ system: string; user: string }>("/teacher/ai/questions/prompt", body),
  generateExercise: (prompt: string, template?: string | null, grammar_ids?: string[]) =>
    post<{ exercise: Record<string, unknown>; dropped: number }>("/teacher/ai/exercise", { prompt, template, grammar_ids }),
  exercisePrompt: (prompt: string, template?: string | null, grammar_ids?: string[]) =>
    post<{ system: string; user: string }>("/teacher/ai/exercise/prompt", { prompt, template, grammar_ids }),
  // Bài ĐỌC TO (reading record) — cấu trúc khác quiz.
  generateReading: (prompt: string) =>
    post<{ exercise: Record<string, unknown> }>("/teacher/ai/reading", { prompt }),
  readingPrompt: (prompt: string) =>
    post<{ system: string; user: string }>("/teacher/ai/reading/prompt", { prompt }),
  // Writing exercise (speaking_prompt/framework/sample columns).
  generateWriting: (prompt: string) =>
    post<{ exercise: Record<string, unknown> }>("/teacher/ai/writing", { prompt }),
  // Preview of the writing-generation prompt.
  writingPrompt: (prompt: string) =>
    post<{ system: string; user: string }>("/teacher/ai/writing/prompt", { prompt }),
  // Phiên âm IPA đoạn văn theo câu (bài đọc to).
  generateIpa: (passage: string) =>
    post<{ lines: { text: string; ipa: string }[] }>("/teacher/ai/ipa", { passage }),
  suggestPair: (context?: string, full?: boolean, kind?: "quiz" | "vocab") =>
    post<{ context: string; vocabulary: string; instructions?: string; title?: string }>("/teacher/ai/suggest-pair", { context, full, kind }),
  refinePrompt: (text: string, context?: string) => post<{ prompt: string }>("/teacher/ai/refine-prompt", { text, context }),
  refineReadingPrompt: (text: string, context?: string) => post<{ prompt: string }>("/teacher/ai/reading/refine-prompt", { text, context }),
  // Enhance riêng cho bộ thẻ từ vựng — nói về cách CHỌN TỪ, không nhắc câu hỏi/đáp án.
  refineVocabPrompt: (text: string, context?: string) => post<{ prompt: string }>("/teacher/ai/vocab/refine-prompt", { text, context }),
  // `form` = dạng mục (từ đơn / cụm / cả hai) · `exclude` = từ đã có trong bộ thẻ (cấm trả lại).
  generateWordlist: (body: { source: string; count: number; form?: "word" | "phrase" | "both"; exclude?: string[] }) =>
    post<{ wordlist: { word: string; pos?: string; ipa?: string; meaning?: string; example?: string }[] }>("/teacher/ai/wordlist", body),
};

// ---------- Teacher: hàng chờ tạo bài bằng AI ----------
export interface AiJob {
  id: string;
  status: "queued" | "generating" | "done" | "error";
  title: string | null;
  error: string | null;
  exercise_id: string | null;
  /** Questions the model produced that were discarded; >0 keeps a finished job on the list. */
  dropped: number;
  created_at: string;
}
export const aiJobsApi = {
  create: (body: { prompt: string; published: boolean; assign_ids: string[]; kind?: "quiz" | "reading" | "writing" | "deck"; template?: string | null; grammar_ids?: string[]; tag_id?: string | null; topic_id?: string | null; pro_only?: boolean; layer?: string | null; gen_config?: Record<string, unknown>; exercise_id?: string | null }) =>
    post<{ id: string; status: string }>("/teacher/ai/jobs", body),
  list: () => req<{ items: AiJob[] }>("/teacher/ai/jobs"),
  retry: (id: string) => post<{ ok: boolean }>(`/teacher/ai/jobs/${id}/retry`),
  seen: (id: string) => post<{ ok: boolean }>(`/teacher/ai/jobs/${id}/seen`),
  remove: (id: string) => del<{ ok: boolean }>(`/teacher/ai/jobs/${id}`),
};

// Template lựa chọn AI Composer — lưu trên cloud (bảng gen_templates).
export interface GenTemplate {
  id: string;
  name: string;
  config: Record<string, unknown>;
}
export const genTemplatesApi = {
  list: () => req<{ items: GenTemplate[] }>("/teacher/gen-templates"),
  save: (name: string, config: Record<string, unknown>) => post<{ id: string }>("/teacher/gen-templates", { name, config }),
  remove: (id: string) => del<{ ok: boolean }>(`/teacher/gen-templates/${id}`),
};

export async function uploadAudio(file: File): Promise<{ key: string; url: string }> {
  const q = new URLSearchParams({ filename: file.name, content_type: file.type || "audio/mpeg" });
  const res = await fetch(`${BASE}/teacher/audio?${q}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || "audio/mpeg" },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || t("lib.api.error.audioUpload"));
  return data;
}

// Upload ẢNH lên R2 (dùng chung endpoint /teacher/audio — nhận mọi content-type; serve giữ đúng mime).
export async function uploadImage(file: File): Promise<{ key: string; url: string }> {
  const ct = file.type || "image/jpeg";
  const q = new URLSearchParams({ filename: file.name, content_type: ct, kind: "image" });
  const res = await fetch(`${BASE}/teacher/audio?${q}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": ct },
    body: file,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || t("lib.api.error.imageUpload"));
  return data;
}

// ---------- Công khai, KHÔNG cần đăng nhập ----------
// Khu học sinh cũ (passcode) đã nghỉ hưu Chỉ còn 3 thứ thật
// sự không có danh tính: link báo cáo gửi phụ huynh và TTS 1 từ.
export const publicApi = {
  report: (id: string) => req<PublicReport>(`/reports/${id}`),
  submissionReport: (id: string) => req<SubmissionReportView>(`/public/submission/${id}`),
  wordSpeak: (word: string, gender?: "male" | "female") => post<{ url: string }>("/word/speak", { word, gender }),
};

// ---------- User CÔNG KHAI (public self-serve) ----------
export interface LibraryGradeResp {
  score: number;
  total: number;
  details: { position: number; type: string; correct: boolean; credit?: number }[];
  review: { position: number; correctAnswer: string | null }[];
  points: number;
  submission_id?: string; // id lượt nộp → chuyển sang trang báo cáo /s/:id
}
/** Hoạt động thật sự của một lượt (bài Nghe & Nói sinh 2 loại lượt trên cùng một bài). */
/** Daily grammar-drill allowance (its own axis — see shared/quota.ts). */
/** One graded drill in the history drawer. */
export interface GrammarSubmissionRow {
  id: string;
  /** "auto" = quiz drill, "translate" = the Vietnamese->English drill. */
  mode: string;
  label: string;
  correct: number;
  total: number;
  score: number;
  points: number;
  submitted_at: string;
}
/** A graded drill with its sentences resolved, for the report page. */
export interface GrammarReport {
  id: string;
  /** "auto" = the quiz drill, "translate" = the Vietnamese->English drill. */
  mode: string;
  submitted_at: string;
  correct: number;
  total: number;
  score: number;
  points: number;
  result: GrammarSessionResult | GrammarTranslateResult | null;
  /** Populated for the quiz drill; empty for translation. */
  items: GrammarDrillItem[];
  /** Populated for translation; empty for the quiz drill. */
  translate_items: GrammarTranslateItem[];
}

/** An unfinished grammar drill, listed so the learner can pick it back up. */
export interface GrammarDraft {
  id: string;
  label: string;
  grammar_ids: string[];
  answered: number;
  total: number;
  updated_at: string;
}

// ---------- Grammar map (GET /grammar/map) ----------
export interface GrammarMapNode {
  id: string;
  title: string;
  category: string;
  cefr: string;
  position?: number;
  related: string[];
  compare_count: number;
}
export type HistoryKind = "quiz" | "dictation" | "shadowing" | "read_aloud" | "writing" | "vocab" | "grammar" | "grammar_translate";
export interface UserStatsHistory {
  exercise_id: string;
  title: string;
  skill: string | null;
  kind?: HistoryKind;
  score: number;
  total: number;
  submitted_at: string;
}
/** Cấp XP suy ra từ tổng điểm (xem pointsToLevel ở @msyen/shared). */
export interface XpLevel {
  level: number;
  floor: number;
  next: number;
  into: number;
  span: number;
  progress: number; // 0..1 tới cấp kế
}
export interface UserStats {
  points: number;
  level: XpLevel;
  exercises_done: number;
  attempts: number;
  history: UserStatsHistory[];
}
export interface TeacherUserRow extends PublicUser {
  active: boolean;
  anonymous: boolean; // ẩn danh trên bảng xếp hạng (tên hiển thị với người khác thành biệt danh con vật)
  exercises_done: number;
  attempts: number;
  points: number;
  last_seen_at: string | null; // last authenticated API call (ISO); null = never recorded
  classes: { id: string; name: string }[];
  assigned: number; // exercises assigned directly or through an active class
  not_done: number;
}

/** Bài tập trong thùng rác (rút gọn — GET /teacher/exercises/trash). */
export interface TrashedExercise {
  id: string;
  exercise_id: string;
  title: string;
  skill: Skill | null;
  level: string | null;
  read_aloud: boolean;
  video: boolean;
  template_id: string | null;
  created_at: string;
  deleted_at: string;
  question_count: number;
  deck_words: number | null;
}

/** Tài khoản trong thùng rác (rút gọn — GET /teacher/users/trash). */
export interface TrashedUser {
  id: string;
  email: string;
  name: string | null;
  provider: string;
  avatar_url: string | null;
  created_at: string;
  deleted_at: string;
}

/** Tài khoản user công khai (đăng ký/đăng nhập bằng email hoặc Google). */
export const accountApi = {
  config: () => req<{ google: boolean }>("/account/config"),
  register: (body: { email: string; password: string; name?: string | null; level_id?: string | null }) =>
    post<{ user: PublicUser }>("/account/register", body),
  login: (email: string, password: string) => post<{ user: PublicUser }>("/account/login", { email, password }),
  logout: () => post("/account/logout"),
  // Sign out of every device (including this one) — kills all session tokens at once.
  logoutAll: () => post<{ ok: true }>("/account/logout-all"),
  // Quên mật khẩu — gửi link đặt lại qua email. Luôn trả { ok: true } (không rò email tồn tại).
  forgotPassword: (email: string) => post<{ ok: true }>("/account/forgot-password", { email }),
  // Đặt lại mật khẩu bằng token trong link email → đổi pass + đăng nhập luôn.
  resetPassword: (token: string, password: string) =>
    post<{ user: PublicUser }>("/account/reset-password", { token, password }),
  // Trả 200 kèm `user: null` khi chưa đăng nhập (không 401 — tránh log đỏ ở console).
  me: () => req<{ user: PublicUser | null }>("/account/me"),
  updateProfile: (body: {
    name?: string | null;
    level_id?: string | null;
    topics?: string[] | null;
    birth_year?: number | null;
    gender?: "male" | "female" | "other" | null;
    voice_gender?: "male" | "female" | null; // giọng đọc TỪ ưa thích (đồng bộ tài khoản)
    voice_gender_sentence?: "male" | "female" | null; // giọng đọc CÂU/đoạn dài
    library_view?: "grid" | "list" | null; // kiểu xem thư viện bài (đồng bộ tài khoản)
    theme?: "light" | "dark" | null; // giao diện sáng/tối (đồng bộ tài khoản)
    academic_enabled?: boolean; // bật lớp học thuật (opt-in)
  }) => patch<{ user: PublicUser }>("/account/me", body),
  // Yêu cầu đổi email — hiệu lực sau 2 ngày. `password` bắt buộc nếu tài khoản có mật khẩu.
  requestEmailChange: (new_email: string, password?: string) =>
    post<{ user: PublicUser; pending_email: string; pending_email_at: string }>("/account/email/request", { new_email, password }),
  // Hủy yêu cầu đổi email đang chờ.
  cancelEmailChange: () => post<{ user: PublicUser }>("/account/email/cancel", {}),
  // Đổi ảnh đại diện — gửi thẳng bytes ảnh đã nén (xem lib/imageResize.ts).
  uploadAvatar: (blob: Blob) =>
    req<{ user: PublicUser }>("/account/avatar", {
      method: "POST",
      headers: { "content-type": blob.type || "image/webp" },
      body: blob,
    }),
  // Đặt/đổi mật khẩu (chỉ mật khẩu mới; Google-only cũng dùng được).
  setPassword: (password: string) => post<{ user: PublicUser }>("/account/password", { password }),
  // Ngữ pháp CẦN ÔN: các điểm còn sai (tính từ lượt nộp của chính user).
  grammarReview: () => req<{ items: GrammarWeak[] }>("/account/grammar/review"),
  // Các điểm ngữ pháp user đã đánh dấu ĐÃ HỌC.
  grammarLearned: () => req<{ ids: string[] }>("/account/grammar/learned"),
  grammarSetLearned: (id: string, learned: boolean) =>
    post<{ ok: boolean }>("/account/grammar/learned", { id, learned }),
  // Các điểm ngữ pháp user GHIM để luyện tiếp (khu nhắc + bộ lọc "Marked").
  grammarMarked: () => req<{ items: GrammarMarked[] }>("/account/grammar/marked"),
  grammarSetMarked: (ids: string | string[], marked: boolean) =>
    post<{ ok: boolean }>("/account/grammar/marked", Array.isArray(ids) ? { ids, marked } : { id: ids, marked }),
  // ── Grammar drill: bank of practice sentences per grammar point ──
  grammarSession: (body: GrammarSessionInput) =>
    post<{ session_id: string; items: GrammarDrillItem[]; config: GrammarSessionInput; empty: string[]}>(
      "/account/grammar/session",
      body,
    ),
  grammarDrillSubmit: (answers: GrammarDrillAnswer[], sessionId?: string) =>
    post<GrammarSessionResult>("/account/grammar/submit", { answers, session_id: sessionId }),
  // Graded drills: history list + one report.
  grammarSubmissions: () => req<{ items: GrammarSubmissionRow[] }>("/account/grammar/submissions"),
  grammarReport: (id: string) => req<GrammarReport>(`/account/grammar/submissions/${id}`),
  // Drills the learner started but has not submitted (the resume list in the setup modal).
  grammarDrafts: () => req<{ items: GrammarDraft[] }>("/account/grammar/sessions"),
  grammarDraft: (id: string) =>
    req<{ session_id: string; items: GrammarDrillItem[]; answers: Record<string, string> }>(`/account/grammar/sessions/${id}`),
  grammarDraftSave: (id: string, answers: Record<string, string>) =>
    patch<{ ok: boolean }>(`/account/grammar/sessions/${id}`, { answers }),
  grammarDraftDrop: (id: string) => del<{ ok: boolean }>(`/account/grammar/sessions/${id}`),
  grammarState: () =>
    req<{ items: GrammarMastery[]; due: number; marked: number}>("/account/grammar/state"),
  // ── Grammar translation drill: Vietnamese prompt -> English sentence ──
  grammarTranslateState: () =>
    req<{ items: GrammarTranslateAvailability[]; total: number}>("/account/grammar/translate/state"),
  grammarTranslateSession: (body: GrammarTranslateSessionInput) =>
    post<{ session_id: string; items: GrammarTranslateItem[]; config: GrammarTranslateSessionInput; empty: string[]}>(
      "/account/grammar/translate/session",
      body,
    ),
  grammarTranslateDrafts: () => req<{ items: GrammarDraft[] }>("/account/grammar/translate/sessions"),
  grammarTranslateDraft: (id: string) =>
    req<{ session_id: string; level: string; items: GrammarTranslateItem[]; answers: Record<string, string> }>(
      `/account/grammar/translate/sessions/${id}`,
    ),
  // One sentence at a time, so the drill can colour characters without holding the whole session.
  grammarTranslateAnswer: (sessionId: string, itemId: string) =>
    post<{ item_id: string; en: string }>(`/account/grammar/translate/sessions/${sessionId}/answer`, { item_id: itemId }),
  grammarTranslateSubmit: (answers: GrammarTranslateAnswer[], sessionId?: string) =>
    post<GrammarTranslateResult>("/account/grammar/translate/submit", { answers, session_id: sessionId }),
  // Mark a word as learned / not learned (persisted server-side).
  vocabSetLearned: (word: string, learned: boolean) =>
    post<{ ok: boolean }>("/account/vocabulary/learned", { word, learned }),
  // The server recomputes the score from `result`; `sessionId` closes the resume session (idempotent).
  vocabSubmit: (body: { exerciseId?: string; sessionId?: string | null; result: VocabDeckResult }) =>
    post<{ id: string; points: number; memory: VocabSessionMemory }>("/account/vocab/submit", body),
  // ── Trí nhớ (SRS): hàng đợi ôn + số liệu dashboard ──
  vocabDue: () => req<VocabDueSummary>("/account/vocab/due"),
  vocabMemoryStats: () => req<VocabMemoryStats>("/account/vocab/stats"),
  grammarMemoryStats: () => req<GrammarMemoryStats>("/account/grammar/stats"),
  // ── Phiên luyện tự cấu hình (Practice set) ──
  vocabSessionResolve: (body: { scope: VocabScope; scopeKey?: string | null; mode: VocabDeckMode; count: number }) =>
    post<{ items: VocabItem[]; available: number; poolTotal: number }>("/account/vocab/session/resolve", body),
  vocabSessionActive: (scope: VocabScope, scopeKey?: string | null) => {
    const sp = new URLSearchParams({ scope });
    if (scopeKey) sp.set("scopeKey", scopeKey);
    return req<{ session: VocabSession | null }>(`/account/vocab/session/active?${sp}`);
  },
  vocabSessionStart: (body: { scope: VocabScope; scopeKey?: string | null; label: string; config: VocabDeckConfig; itemIds: string[]; state: VocabSessionState }) =>
    post<{ id: string }>("/account/vocab/session", body),
  vocabSessionPatch: (id: string, state: VocabSessionState) => patch<{ ok: boolean }>(`/account/vocab/session/${id}`, { state }),
  // ── Unfinished attempts synced across devices ──
  draftList: () => req<{ items: PracticeDraftRow[] }>("/account/drafts"),
  draftGet: <S>(kind: PracticeDraftKind, exerciseId: string) =>
    req<{ draft: { state: S; answered: number; total: number; updatedAt: string } | null }>(`/account/drafts/${kind}/${encodeURIComponent(exerciseId)}`),
  draftPut: (kind: PracticeDraftKind, exerciseId: string, body: { state: unknown; answered: number; total: number }) =>
    put<{ ok: boolean }>(`/account/drafts/${kind}/${encodeURIComponent(exerciseId)}`, body),
  draftDelete: (kind: PracticeDraftKind, exerciseId: string) =>
    del<{ ok: boolean }>(`/account/drafts/${kind}/${encodeURIComponent(exerciseId)}`),
  vocabSessionDelete: (id: string) => del(`/account/vocab/session/${id}`),
  // ── Library: the teachers' sets ──
  vocabSets: (params?: { level?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.level) sp.set("level", params.level);
    if (params?.q) sp.set("q", params.q);
    const qs = sp.toString();
    return req<{ items: VocabSetSummary[] }>(`/account/vocab/sets${qs ? `?${qs}` : ""}`);
  },
  vocabSetDetail: (slug: string, params: { offset?: number; q?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.offset) sp.set("offset", String(params.offset));
    if (params.q) sp.set("q", params.q);
    const qs = sp.toString();
    return req<{
      set: { id: string; slug: string; name: string; description: string | null; wordCount: number };
      words: (VocabWordState & { saved: boolean })[];
      total: number;
      learned: number;
      unsaved: number;
      nextOffset: number | null;
    }>(`/account/vocab/sets/${slug}${qs ? `?${qs}` : ""}`);
  },
  vocabSetSaveAll: (slug: string) => post<{ added: number; skipped: number }>(`/account/vocab/sets/${slug}/save`),
  // ── My words: the learner's own list ──
  myVocab: (q?: string) =>
    req<{ words: VocabWordState[]; total: number; max: number }>(`/account/vocab/my${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  myVocabAdd: (body: MyVocabAddInput) => post<{ added: number; skipped: number }>("/account/vocab/my", body),
  myVocabFill: (words: string[]) => post<{ items: VocabItemInput[] }>("/account/vocab/my/fill", { words }),
  myVocabUpdate: (id: string, item: VocabItemInput) => patch<{ ok: boolean }>(`/account/vocab/my/${id}`, item),
  myVocabDelete: (id: string) => del(`/account/vocab/my/${id}`),
  // ── Study clock ──
  // Seconds per day and per area. The clock is filled server-side by session stitching; this only reads.
  studyTime: (range: StudyRange = "week") => req<StudyTimeResp>(`/account/study-time?range=${range}`),
  // Heartbeat from an open practice page — the response is empty, passing through auth is the point.
  studyPing: (area: string) =>
    fetch(`${BASE}/account/ping?area=${encodeURIComponent(area)}`, { method: "POST", credentials: "include" }).catch(() => {}),
  // Nghe phát âm 1 từ (TTS, cache R2) → trả URL audio để phát.
  vocabSpeak: (word: string, gender?: "male" | "female") =>
    post<{ url: string }>("/account/vocabulary/speak", { word, gender }),
  // Nghe một CÂU (ví dụ ngữ pháp) (TTS, cache R2) → trả URL audio.
  sentenceSpeak: (text: string, gender?: "male" | "female") =>
    post<{ url: string }>("/account/grammar/speak", { text, gender }),
  // 10-minute Azure Speech token for the browser SDK (long read-aloud takes).
  speechToken: () => post<{ token: string; region: string }>("/account/speech-token"),
  // Pronunciation of one word: the clip goes up as WAV 16 kHz, Azure scores it, the best take is
  // kept. Raw fetch so the browser sets the multipart boundary.
  vocabPronounce: async (word: string, audio: Blob): Promise<VocabPronResult> => {
    const fd = new FormData();
    fd.append("word", word);
    fd.append("audio", await toWav16k(audio), "word.wav");
    const res = await fetch(`${BASE}/account/vocabulary/pronounce`, { method: "POST", credentials: "include", body: fd });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || t("lib.api.error.status", { status: res.status }));
    return data as VocabPronResult;
  },
};

/** Một từ trong bộ (chi tiết) hoặc trong My vocab. */
// Phiên luyện tự cấu hình (Practice set).

// ── Trí nhớ từ vựng (SRS) ──
export interface VocabSessionMemory { reviewed: number; recalled: number; tiersUp: number; points: number }
export interface VocabDueSummary {
  due: number; // số từ đến hạn ôn ngay bây giờ
  new_today: number; // số từ mới đã học hôm nay
  new_allowed: number; // số từ mới NÊN học thêm hôm nay (0 = đang nợ ôn, ôn trước đã)
}
export interface VocabMemoryStats {
  tracked: number;
  remembering: number;
  due: number;
  urgent: number;
  retention30: { reviewed: number; recalled: number; rate: number | null };
  tiers: { tier: number; count: number }[];
  forecast: { date: string; count: number }[];
  soon: { word: string; retrievability: number; dueAt: string; tier: number }[];
  new_today: number;
  pron: { scored: number; avg: number | null; weak: number; weakest: { word: string; score: number }[] };
}

// ── Grammar memory (SRS — one state per grammar POINT, not per bank sentence) ──
export interface GrammarMemoryStats {
  tracked: number;
  remembering: number;
  due: number;
  urgent: number;
  points_total: number;
  points_started: number;
  cleared: number;
  bank: number;
  tiers: { tier: number; count: number }[];
  forecast: { date: string; count: number }[];
  soon: { grammar_id: string; title: string; cefr: string; retrievability: number; due_at: string; tier: number }[];
}

// "due" = hàng đợi ôn của cả kho (ngân hàng + My vocab chung một lịch trí nhớ).
export type VocabScope = "set" | "my" | "due" | "exercise";

/** A teacher set as listed in the learner's library. */
export interface VocabSetSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  level: { id: string; name: string } | null;
  wordCount: number;
  learned: number;
  /** First word images of the set (≤ 4) — card cover. */
  images: string[];
  /** First words of the set (≤ 6) — cover when there are no images. */
  sample: string[];
}

/** A word with the learner's progress on it. */
export type VocabWordState = VocabItem & { learned: boolean; pronBest: number | null; dueAt: string | null; miss: number };

/** One unfinished attempt as listed by GET /account/drafts. */
export type PracticeDraftRow = {
  exerciseId: string;
  kind: PracticeDraftKind;
  answered: number;
  total: number;
  updatedAt: string;
};
export interface VocabSession {
  id: string;
  label: string;
  config: VocabDeckConfig;
  state: VocabSessionState;
  items: VocabItem[];
  remaining: number;
  /** Last time the learner touched this session — shown on the resume banner. */
  updatedAt?: string;
}

/** Windows the study clock can be read over. Granularity follows the window, server-side. */
export type StudyRange = "week" | "month" | "quarter" | "year" | "all";
/** The learner's study clock, in seconds. `key` is a date, a week-start date, or "YYYY-MM". */
export interface StudyTimeResp {
  range: StudyRange;
  bucket: "day" | "week" | "month";
  buckets: { key: string; seconds: number }[];
  areas: { area: string; seconds: number }[];
  total: number;
  /** Average over days actually studied, not over the whole range. */
  avg_active: number;
  active_days: number;
  best_bucket: { key: string; seconds: number } | null;
  first_day: string | null;
  total_all: number;
}

/** Kết quả chấm phát âm 1 từ (Azure) — trả nguyên từ /account/vocabulary/pronounce. */
export interface VocabPronResult {
  pronScore: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  transcript: string;
  words: ReadingWordResult[];
  durationMs: number;
}

/** URL bắt đầu đăng nhập Google (điều hướng cả trang, không fetch). */
export const googleOauthUrl = `${BASE}/account/oauth/google`;

/** Danh sách cấp độ công khai (cho màn đăng ký chọn level). */
export const publicLevels = () => req<{ items: Level[] }>("/levels");

/** Danh sách chủ đề công khai (cho onboarding/hồ sơ user chọn chủ đề quan tâm). */
export const publicTopics = () => req<{ items: Topic[] }>("/topics");

/** Sổ tay ngữ pháp công khai — DANH SÁCH bản gọn; chi tiết lấy qua publicGrammarOne khi mở. */
export const publicGrammar = () => req<{ items: GrammarListItem[] }>("/grammar");

/** The handbook as a graph (nodes + `related` edges) for the grammar map. */
export const publicGrammarMap = () => req<{ items: GrammarMapNode[] }>("/grammar/map");

/** MỘT điểm ngữ pháp — báo cáo/chữa bài lazy-fetch khi học sinh bấm mở rộng (GET có edge cache). */
export const publicGrammarOne = (id: string) => req<Grammar>(`/grammar/${id}`);

// ---------- Teacher: sổ tay ngữ pháp (CRUD) ----------
export const grammarApi = {
  list: () => req<{ items: (Grammar & { drill_count: number; translate_count: number })[] }>("/teacher/grammar"),
  save: (g: GrammarInput) => post<{ id: string }>("/teacher/grammar", g),
  remove: (id: string) => del<{ ok: boolean }>(`/teacher/grammar/${id}`),
  practice: (id: string) =>
    req<{
      drill: {
        id: string;
        type: string;
        question: string;
        answer: string | null;
        options: string[] | null;
        accept: string[] | null;
        tokens: string[] | null;
        explanation: string | null;
        source: string;
        createdAt: string;
        exercise: { slug: string; title: string } | null;
      }[];
      translate: { id: string; vi: string; en: string; accept: string[]; noteVi: string | null; createdAt: string }[];
    }>(`/teacher/grammar/${id}/practice`),
  saveTranslate: (id: string, items: GrammarTranslateItemsInput["items"]) =>
    put<{ ok: boolean; count: number }>(`/teacher/grammar/${id}/translate`, { items }),
  addDrill: (id: string, items: unknown[]) => post<{ ok: boolean; count: number }>(`/teacher/grammar/${id}/drill`, { items }),
  updateDrill: (id: string, itemId: string, item: GrammarDrillItemInput) =>
    put<{ ok: boolean }>(`/teacher/grammar/${id}/drill/${itemId}`, item),
  removeDrill: (id: string, itemId: string) => del<{ ok: boolean }>(`/teacher/grammar/${id}/drill/${itemId}`),
};

// ---------- Teacher: Cổng AI (điều phối provider/model) ----------
export type AiProviderId = "google" | "openai" | "anthropic" | "openrouter" | "deepseek" | "xai";
/** Owners of keys on the Key tab: the AI providers plus the speech services. */
export type AiKeyProviderId = AiProviderId | "azure" | "deepgram";

export interface AiModelInfo {
  id: string;
  provider: AiProviderId;
  label: string;
  inPrice: number; // USD / 1M token vào
  outPrice: number; // USD / 1M token ra
  audio: boolean; // nghe được audio? (chỉ Gemini)
  jsonSchema: boolean;
  free: boolean;
  note?: string;
  /** Cache and long-context rates when the provider publishes them (USD / 1M tokens). */
  pricing?: {
    cachedInput: number;
    cacheWrite: number;
    longContext?: {
      thresholdTokens: number;
      inPrice: number;
      cachedInput: number;
      cacheWrite: number;
      outPrice: number;
    };
  };
}

export interface AiRoute {
  provider: AiProviderId;
  model: string;
}

export interface AiTaskInfo {
  name: string;
  label: string;
  group: string;
  needs_audio: boolean;
  graded: boolean; // đổi model = đổi điểm học sinh → cảnh báo
  max_output_tokens: number;
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  keyCount: number;
  hasBaseUrl: boolean;
  envVar: string; // Worker secret name for the advanced setup
}

export interface AiConfig {
  catalog: AiModelInfo[]; // the model registry (D1)
  providers: AiProviderInfo[];
  tasks: AiTaskInfo[];
  default: AiRoute;
  routes: Record<string, AiRoute>; // CHỈ task được ghi đè
}

export interface AiKeyHealth {
  id: string; // row id, or "env:<hash>" for a Worker-secret key
  source: "db" | "env";
  label: string | null;
  hint: string; // last characters only
  key_id: string; // hash, never the key itself
  enabled: boolean;
  readable: boolean; // false = stored key cannot be decrypted with the current secret
  created_at: string | null;
  last_used_at: string | null;
  fail_count: number;
  cooling: boolean;
  cooldown_until: string | null;
}

export interface AiKeysResponse {
  providers: { id: AiKeyProviderId; label: string; envVar: string; hasBaseUrl: boolean; keys: AiKeyHealth[] }[];
}

export interface AiBrowseModel {
  id: string;
  label: string;
  inPrice?: number;
  outPrice?: number;
  audio?: boolean;
  jsonSchema?: boolean;
  free?: boolean;
  note?: string;
  added: boolean;
}

export interface AiModelInput {
  provider: AiProviderId;
  id: string;
  label?: string;
  inPrice: number;
  outPrice: number;
  audio: boolean;
  jsonSchema: boolean;
  free: boolean;
  note?: string;
}

export interface AiModelTestResult {
  ok: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  reply?: string;
  error?: string;
}

export interface AiUsageResponse {
  from: string;
  to: string;
  total: { calls: number; inputTokens: number; outputTokens: number; costUsd: number; failed: number };
  byTask: { task: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number; failed: number }[];
  byModel: { provider: string; model: string; calls: number; costUsd: number; failed: number }[];
  recentErrors: { id: string; createdAt: string; task: string; provider: string; model: string; error: string | null }[];
}

/** Lịch sử các lượt làm của CHÍNH user cho 1 bài, theo từng dạng.
 *  Trang báo cáo là link công khai → người lạ gọi sẽ 401, danh sách tự ẩn. */
export const attemptHistoryApi: Record<"quiz" | "reading" | "writing" | "vocab", (slug: string) => Promise<ReadingHistoryItem[]>> = {
  vocab: (slug) => post<{ items: ReadingHistoryItem[] }>(`/library/${slug}/vocab/history`).then((r) => r.items),
  quiz: (slug) => post<{ items: ReadingHistoryItem[] }>(`/library/${slug}/quiz/history`).then((r) => r.items),
  reading: (slug) => post<{ items: ReadingHistoryItem[] }>(`/library/${slug}/reading/history`).then((r) => r.items),
  writing: (slug) => post<{ items: ReadingHistoryItem[] }>(`/library/${slug}/writing/history`).then((r) => r.items),
};

/** An earlier draft of a writing task, with its text and feedback — for revising against. */
export interface WritingDraft {
  submission_id: string;
  attempt_no: number;
  score: number;
  text: string;
  word_count: number;
  feedback: string | null;
  submitted_at: string;
  is_best: boolean;
}

export const writingDraftsApi = (slug: string) =>
  post<{ items: WritingDraft[] }>(`/library/${slug}/writing/drafts`).then((r) => r.items);

export const aiGatewayApi = {
  config: () => req<AiConfig>("/teacher/ai/config"),
  saveConfig: (body: { default: AiRoute; routes: Record<string, AiRoute> }) =>
    put<{ ok: boolean }>("/teacher/ai/config", body),
  keys: () => req<AiKeysResponse>("/teacher/ai/keys"),
  addKey: (body: { provider: AiKeyProviderId; key: string; label?: string; region?: string; check?: boolean }) =>
    post<{ ok: boolean }>("/teacher/ai/keys", body),
  updateKey: (id: string, body: { label?: string | null; enabled?: boolean }) =>
    patch<{ ok: boolean }>(`/teacher/ai/keys/${encodeURIComponent(id)}`, body),
  removeKey: (id: string) => del<{ ok: boolean }>(`/teacher/ai/keys/${encodeURIComponent(id)}`),
  checkKey: (id: string) => post<{ ok: boolean; error?: string }>(`/teacher/ai/keys/${encodeURIComponent(id)}/check`),
  saveModel: (body: AiModelInput) => post<{ ok: boolean }>("/teacher/ai/models", body),
  removeModel: (provider: AiProviderId, id: string) =>
    del<{ ok: boolean }>(`/teacher/ai/models?provider=${provider}&id=${encodeURIComponent(id)}`),
  restoreModels: () => post<{ added: number }>("/teacher/ai/models/restore-defaults"),
  browseModels: (provider: AiProviderId) =>
    req<{ items: AiBrowseModel[] }>(`/teacher/ai/models/browse?provider=${provider}`),
  testModel: (provider: AiProviderId, model: string) =>
    post<AiModelTestResult>("/teacher/ai/models/test", { provider, model }),
  tts: () => req<{ config: TtsConfig; ready: Record<TtsProvider, boolean>; voices: TtsVoice[] }>("/teacher/ai/tts"),
  saveTts: (config: TtsConfig) => put<{ ok: boolean; config: TtsConfig }>("/teacher/ai/tts", { config }),
  /** Sample read by one voice, as a playable object URL (revoke it when done). */
  previewVoice: async (voice: string, text?: string): Promise<string> => {
    const res = await fetch(`${BASE}/teacher/ai/tts/preview`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voice, text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || t("lib.api.error.status", { status: res.status }));
    }
    return URL.createObjectURL(await res.blob());
  },
  usage: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const s = q.toString();
    return req<AiUsageResponse>(`/teacher/ai/usage${s ? `?${s}` : ""}`);
  },
  clearErrors: (from?: string) => del<{ ok: boolean; removed: number }>(`/teacher/ai/usage/errors${from ? `?from=${encodeURIComponent(from)}` : ""}`),
  clearError: (id: string) => del<{ ok: boolean; removed: number }>(`/teacher/ai/usage/errors/${encodeURIComponent(id)}`),
};

/** Thư viện bài theo level của user. */
export type LeaderboardPeriod =
  | "week" | "month" | "quarter" | "year" | "all"
  | "last_week" | "last_month" | "last_quarter" | "last_year";
export interface LeaderboardEntry {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  level: Level | null;
  points: number;
  exercises_done: number;
  accuracy: number; // % đúng trung bình trên các bài đã làm (0-100)
  rank: number;
}

// ---- Phân tích quá trình học (dashboard tiến độ) ----
export interface UserAnalytics {
  user: { id: string; name: string | null; avatar_url: string | null; email: string | null; level: Level | null };
  kpis: {
    total_points: number;
    exercises_done: number;
    avg_accuracy: number;
    streak_days: number;
    best_streak_days: number;
    /** Consecutive idle days up to yesterday. 0 while the streak is alive. */
    streak_missed_days: number;
    /** What the streak loses if today ends with no practice (0 once today counts). */
    streak_next_penalty: number;
    rank: number | null;
  };
  timeline: { week: string; label: string; points: number; accuracy: number | null }[];
  /** `accuracy` = mean of the best result per exercise (0-100); `exercises` = how many fed it. */
  skills: { skill: Skill; label: string; exercises: number; accuracy: number }[];
  question_types: { type: QuestionType; label: string; correct: number; total: number; accuracy: number }[];
  heatmap: { date: string; count: number }[];
  pronunciation: {
    has_data: boolean;
    count: number;
    avg_pron: number;
    avg_accuracy: number;
    avg_fluency: number;
    avg_completeness: number;
    avg_prosody: number | null;
    trend: { date: string; label: string; score: number }[];
  };
  xp: { level: number; points: number; into: number; need: number; percent: number };
  path: { level: string | null; done: number; total: number; percent: number };
  writing: {
    has_data: boolean;
    count: number;
    avg_overall: number;
    avg_task: number | null;
    avg_coherence: number | null;
    avg_grammar: number | null;
    avg_lexical: number | null;
    avg_words: number;
    trend: { date: string; label: string; score: number }[];
  };
  grammar_weak: { id: string; title: string; category: string | null; cefr: string | null; wrong: number; seen: number }[];
  video: {
    has_data: boolean;
    lessons: number;
    dict_segments: number;
    dict_total: number;
    dict_first_ok: number;
    dict_first_ok_pct: number;
    hints: number;
    revealed: number;
    shadow_segments: number;
    shadow_avg: number;
  };
}

/** Kỷ lục game "chờ chấm": của mình + TOP chung. */
export interface GameTop {
  best: number;
  top: { name: string; score: number }[];
}

export const libraryApi = {
  // `assigned`: bài cô giao — MỞ DẦN theo tiến độ qua hàng chờ trượt;
  // `assigned_queue` là tổng kết cho thanh tiến độ + lời nhắc.
  list: () =>
    post<{
      level: string | null;
      meta: LibraryMeta | null;
      items: LibraryItem[];
      // `videos`: Nghe & Nói — ngoài lộ trình, lọc theo cấp độ, chặn bằng gói.
      videos: LibraryItem[];
      assigned: LibraryItem[];
      assigned_queue: AssignedQueueSummary;
    }>("/library"),
  exercise: (slug: string) => post<PublicExerciseResp>(`/library/${slug}`),
  /** The English sentence of ONE translate question — feeds the drill's letter-by-letter marking. */
  translateAnswer: (slug: string, position: number) =>
    post<{ position: number; en: string }>(`/library/${slug}/translate-answer`, { position }),
  outlineVi: (slug: string) => post<{ vi: string[] }>(`/library/${slug}/outline-vi`),
  grade: (slug: string, answers: Record<string, string>, hintUsed?: boolean, hintPositions?: number[]) =>
    post<LibraryGradeResp>(`/library/${slug}/grade`, { answers, hint_used: hintUsed, hint_positions: hintPositions }),
  stats: () => post<UserStats>("/library/me/stats"),
  /** Ask for the comment on a submission that was graded with the daily allowance already empty. */
  requestFeedback: (submissionId: string) =>
    post<{ status: "pending" | "done" }>(`/library/submission/${submissionId}/feedback`),
  /** Same allowance-gated retry, for a read-aloud submission — returns the text right away. */
  requestReadingFeedback: (submissionId: string) =>
    post<{ status: "done"; feedback: string }>(`/library/reading-submission/${submissionId}/feedback`),
  // BXH điểm (kèm hạng của chính mình).
  leaderboard: (period: LeaderboardPeriod) =>
    post<{ period: LeaderboardPeriod; items: LeaderboardEntry[]; me: LeaderboardEntry | null }>(
      "/library/leaderboard",
      { period },
    ),
  // Dashboard tiến độ của chính user.
  analytics: () => post<UserAnalytics>("/library/analytics"),
  // Game "chờ chấm": kỷ lục của mình + TOP 10 chung. Điểm lưu theo tài khoản (cookie).
  gameTop: () => post<GameTop>("/library/game/top"),
  gameScore: (score: number) => post<GameTop>("/library/game/score", { score }),
  // Báo cáo tháng cô viết cho em (chỉ thành viên lớp mới có) — list nhẹ cho lưới card.
  myReports: () => post<{ items: MyReportCard[] }>("/library/me/reports"),
  // Một báo cáo tháng đầy đủ (kèm snapshot số liệu) — cho trang chi tiết trong app.
  myReport: (month: string) => post<PublicReport>(`/library/me/reports/${month}`),
};

// Thẻ báo cáo trên lưới /u/reports — chỉ vài KPI rút từ snapshot.
export interface MyReportCard {
  id: string;
  month: string;
  slug: string | null;
  updatedAt: string;
  avg_pct: number | null;
  exercises_done: number | null;
  has_stats: boolean;
}

/** Giáo viên xem user công khai (read-only). */
export const teacherUsersApi = {
  list: (p: TeacherUserListParams = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) qs.set(k, String(v));
    return req<TeacherUserListResp>(`/teacher/users${qs.toString() ? `?${qs}` : ""}`);
  },
  // Tạo tài khoản. Bỏ trống class_id = user thường; truyền class_id → xếp lớp + cấp mã luôn.
  create: (body: {
    name: string;
    email: string;
    password: string;
    level_id?: string | null;
    birth_year?: number | null;
    gender?: "male" | "female" | "other" | null;
    class_id?: string | null;
  }) => post<{ user: PublicUser; enrolled: boolean }>("/teacher/users", body),
  setActive: (id: string, active: boolean) => patch<{ ok: boolean }>(`/teacher/users/${id}`, { active }),
  // Bật/tắt ẩn danh trên bảng xếp hạng: tên em hiển thị với người khác thành biệt danh con vật.
  setAnon: (id: string, anonymous: boolean) =>
    patch<{ ok: boolean; anonymous: boolean }>(`/teacher/users/${id}`, { anonymous }),
  // Cô sửa hồ sơ hộ em: tên · email · cấp độ · mã · giới tính · năm sinh. Đổi email áp NGAY + ghi lịch sử.
  update: (
    id: string,
    body: {
      name?: string | null;
      email?: string;
      level_id?: string | null;
      gender?: "male" | "female" | "other" | null;
      birth_year?: number | null;
    },
  ) => patch<{ ok: boolean; email?: string }>(`/teacher/users/${id}`, body),
  // Teacher-set password. Empty → the server generates a readable one. Plaintext comes back ONCE.
  setPassword: (id: string, password?: string) =>
    put<{ password: string; email: string }>(`/teacher/users/${id}/password`, { password }),
  // Email change history of one user (newest first).
  emailHistory: (id: string) => req<{ items: EmailChangeItem[] }>(`/teacher/users/${id}/email-history`),
  remove: (id: string) => del<{ ok: boolean }>(`/teacher/users/${id}`),
  // Thùng rác: liệt kê / khôi phục / dọn hẳn (xóa mềm ở remove ở trên).
  trash: () => req<{ items: TrashedUser[] }>("/teacher/users/trash"),
  restore: (id: string) => post<{ ok: boolean }>(`/teacher/users/${id}/restore`, {}),
  purge: (id: string) => del<{ ok: boolean }>(`/teacher/users/${id}/purge`),
  leaderboard: (period: LeaderboardPeriod) =>
    req<{ period: LeaderboardPeriod; items: LeaderboardEntry[] }>(`/teacher/leaderboard?period=${period}`),
  // Dashboard tiến độ của 1 user (giáo viên xem).
  analytics: (id: string) => req<UserAnalytics>(`/teacher/users/${id}/analytics`),
  // Báo cáo tháng — song song với studentsApi.{mistakes,aiReport}.
  mistakes: (id: string, from: string, to: string) =>
    req<{ mistakes: Mistake[] }>(`/teacher/users/${id}/mistakes?from=${from}&to=${to}`),
  aiReport: (id: string, body: { from: string; to: string; month: string; teacher_note?: string }) =>
    post<{ report: string }>(`/teacher/users/${id}/ai-report`, body),
  /** Batch variant: a month without any submitted work comes back as `{ report: null, empty: true }`. */
  aiReportOrSkip: (id: string, body: { from: string; to: string; month: string; teacher_note?: string }) =>
    post<{ report: string | null; empty?: boolean }>(`/teacher/users/${id}/ai-report`, { ...body, skip_empty: true }),
  // Toàn cảnh 1 người học (bài được giao = lớp ∪ riêng, + lịch sử) — trang chi tiết học sinh.
  progress: (id: string) => req<UserProgress>(`/teacher/users/${id}/progress`),
  // Bài cô giao RIÊNG cho em này (không tính bài của lớp) — replace-set khi lưu.
  assignedSlugs: (id: string) => req<{ slugs: string[] }>(`/teacher/users/${id}/assignments`),
  setAssignments: (id: string, slugs: string[], note?: string | null) =>
    put<{ ok: boolean; count: number }>(`/teacher/users/${id}/assignments`, { slugs, note }),
};

/** Toàn cảnh 1 người học cho trang chi tiết (song song bản dành cho học sinh cũ). */
export interface UserProgress {
  // `active`/`classes` only exist on the teacher API — never exposed to the learner layer.
  user: PublicUser & { active: boolean; classes: { id: string; name: string }[] };
  assignments: (AssignmentItem & { class_name?: string | null })[];
  submissions: { id: string; exercise: string; skill: string | null; score: number; total: number; submitted_at: string; hasFeedback: boolean }[];
}

/** One class member as the teacher sees them. */
export interface ClassMemberRow {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  level_id: string | null;
  active: boolean;
  joined_at: string;
}

/** Một "học sinh" = user đang thuộc ít nhất một lớp. */
/** The bits of a learner account the edit/assign drawers need. */
export interface LearnerRef {
  id: string;
  name: string | null;
  email: string;
  level_id: string | null;
  classes: { id: string; name: string }[];
}

/** Giáo viên quản lý LỚP HỌC. */
export const classesApi = {
  list: () => req<{ items: Classroom[] }>("/teacher/classes"),
  create: (name: string, note?: string | null) => post<{ class: Classroom }>("/teacher/classes", { name, note }),
  update: (id: string, body: { name?: string; note?: string | null; active?: boolean }) =>
    patch<{ class: Classroom }>(`/teacher/classes/${id}`, body),
  remove: (id: string) => del<{ ok: boolean }>(`/teacher/classes/${id}`),
  members: (id: string) => req<{ class: Classroom; items: ClassMemberRow[] }>(`/teacher/classes/${id}/members`),
  // Xếp học sinh vào lớp — email-first: email đã có → thêm + đặt mã; chưa có → tạo mới
  // (cần name). `created` báo có tạo tài khoản mới không.
  // A generated password comes back ONCE when the account was just created (null otherwise).
  enroll: (id: string, body: { email: string; name?: string | null; password?: string | null; level_id?: string | null }) =>
    post<{ member: PublicUser; created: boolean; password: string | null }>(`/teacher/classes/${id}/members`, body),
  // Xếp user ĐÃ đăng ký sẵn vào lớp.
  linkMember: (id: string, userId: string) =>
    post<{ ok: boolean }>(`/teacher/classes/${id}/members/link`, { user_id: userId }),
  removeMember: (id: string, userId: string) => del<{ ok: boolean }>(`/teacher/classes/${id}/members/${userId}`),
  // Bài giao cho lớp — replace-set (danh sách gửi lên là trạng thái cuối cùng).
  assignments: (id: string) => req<{ slugs: string[]; note: string | null }>(`/teacher/classes/${id}/assignments`),
  setAssignments: (id: string, slugs: string[], note?: string | null) =>
    put<{ ok: boolean; count: number }>(`/teacher/classes/${id}/assignments`, { slugs, note }),
};

/** Giáo viên quản lý lộ trình (chặng + thứ tự bài) cho user công khai. */
export const pathsApi = {
  get: (levelId: string) => req<PathState>(`/teacher/paths/${levelId}`),
  addStage: (levelId: string, title: string) => post<{ id: string }>(`/teacher/paths/${levelId}/stages`, { title }),
  renameStage: (stageId: string, title: string) => patch<{ ok: boolean }>(`/teacher/paths/stages/${stageId}`, { title }),
  deleteStage: (stageId: string) => del<{ ok: boolean }>(`/teacher/paths/stages/${stageId}`),
  saveLayout: (levelId: string, stages: string[], staged: { exercise_id: string; stage_id: string }[]) =>
    put<{ ok: boolean; staged: number }>(`/teacher/paths/${levelId}/layout`, { stages, staged }),
};

// ---------- Bài ĐỌC TO (chấm phát âm) ----------
export interface ReadingWordResult {
  word: string;
  accuracy: number;
  errorType: "None" | "Mispronunciation" | "Omission" | "Insertion";
  phonemes?: { phoneme: string; accuracy: number }[]; // điểm từng âm vị (IPA)
  offsetMs?: number | null; // mốc bắt đầu từ (ms tính từ đầu audio); null với Omission
  durationMs?: number | null; // độ dài phát từ (ms); null với Omission
}
export interface ReadingResult {
  pron_score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  transcript: string;
  words: ReadingWordResult[];
  feedback: string | null;
  audio_url: string | null;
  duration_ms: number;
  submission_id?: string; // id lượt nộp — mở lại báo cáo qua URL (F5 không mất)
  attempt_no?: number; // lần đọc thứ mấy của bài này (1-based)
  previous_score?: number | null; // điểm tổng lần trước (so tiến bộ); null nếu lần đầu
  best_score?: number; // điểm phát âm cao nhất của bài (sau lượt này)
  reward_gained?: number; // TIỀN thưởng thực nhận thêm lượt này (học sinh); 0 nếu chưa vượt kỷ lục
  points_gained?: number; // ĐIỂM ảo nhận thêm (user công khai) — thay chỗ reward_gained
  best_points?: number; // tổng điểm ảo của bài (user công khai)
}
/** Trạng thái chấm đọc to khi poll. `done` kèm result; `error` kèm message. */
export type ReadingJobStatus = "queued" | "assessing" | "feedback" | "done" | "error";
export interface ReadingJobPoll {
  status: ReadingJobStatus;
  result?: ReadingResult;
  error?: string;
}

/** 1 dòng lịch sử một lượt làm (mọi dạng bài — bấm để mở báo cáo lượt đó). */
export interface ReadingHistoryItem {
  submission_id: string;
  pron_score: number; // /100 với đọc-to·nói·viết; với quiz là số câu đúng (xem out_of)
  out_of: number | null; // null = điểm đã trên thang 100
  attempt_no: number;
  submitted_at: string;
  has_audio: boolean;
  is_best: boolean;
}

// ---------- Writing (plain text graded by the LLM) ----------
export interface WritingResult {
  overall_score: number;
  task: number; // content
  coherence: number; // organisation
  grammar: number;
  lexical: number; // vocabulary
  text: string;
  word_count: number;
  feedback: string | null;
  submission_id?: string;
  attempt_no?: number;
  previous_score?: number | null;
  best_score?: number;
  points_gained?: number; // ĐIỂM ảo nhận thêm (user công khai)
  best_points?: number;
}
export interface WritingJobPoll {
  status: "queued" | "grading" | "done" | "error";
  result?: WritingResult;
  error?: string;
}
/** Thao tác bài VIẾT — bind danh tính (user thật) hoặc xem thử (cô, không lưu bài nộp). */
export interface WritingApi {
  grade(slug: string, text: string): Promise<{ job_id: string; status: string }>;
  poll(jobId: string): Promise<WritingJobPoll>;
  result(id: string): Promise<WritingResult>;
  latest(slug: string): Promise<WritingResult | null>;
}

export const userWritingApi: WritingApi = {
  grade: (slug: string, text: string) => post<{ job_id: string; status: string }>(`/library/${slug}/writing/grade`, { text }),
  poll: (jobId: string) => post<WritingJobPoll>(`/library/writing/jobs/${jobId}`),
  result: (id: string) => post<{ result: WritingResult }>(`/library/writing/result/${id}`).then((r) => r.result),
  latest: (slug: string) => post<{ result: WritingResult | null }>(`/library/${slug}/writing/latest`).then((r) => r.result),
};

/** Xem thử bài viết: hiện đủ giao diện, chặn ở bước nộp (chấm tốn AI + cần người học thật). */
const WRITING_PREVIEW_MSG: TKey = "lib.api.preview.writingUnavailable";
export const writingPreviewApi: WritingApi = {
  grade: () => Promise.reject(new Error(t(WRITING_PREVIEW_MSG))),
  poll: () => Promise.reject(new Error(t(WRITING_PREVIEW_MSG))),
  result: () => Promise.reject(new Error(t(WRITING_PREVIEW_MSG))),
  latest: () => Promise.resolve(null),
};

// ---------- RECORD: identity-bound adapter for read-aloud ----------
/** Record actions with the identity already bound — components never handle the session. */
export interface RecordApi<R> {
  /** True when submit() expects the take to be scored in the browser first (see lib/azureAssess). */
  scoresInBrowser?: boolean;
  /** `segments`: raw Azure results when the browser already scored the take. */
  submit(slug: string, audio: Blob, segments?: AzureSegment[]): Promise<string>;
  pollJob(jobId: string): Promise<{ status: ReadingJobStatus; result?: R; error?: string }>;
  result(id: string): Promise<R>;
  latest(slug: string): Promise<R | null>;
  history(slug: string): Promise<ReadingHistoryItem[]>;
  // Chấm lại lượt đã lỗi từ audio ĐÃ ở R2 (không upload lại). Không có → chỉ nộp lại được.
  regrade?(jobId: string): Promise<void>;
}

/** Public user: cookie session, through /library/*. */
async function submitRecordUser(path: string, audio: Blob, prefix: string, segments?: AzureSegment[]): Promise<string> {
  const fd = new FormData();
  const ext = audio.type.includes("mp4") || audio.type.includes("m4a") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  fd.append("audio", audio, `${prefix}.${ext}`);
  if (segments) fd.append("segments", JSON.stringify(segments));
  const res = await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: fd });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || t("lib.api.error.status", { status: res.status }));
  return (data as { job_id: string }).job_id;
}
export const userRecordApi = {
  reading: (): RecordApi<ReadingResult> => ({
    scoresInBrowser: true,
    submit: (slug, audio, segments) => submitRecordUser(`/library/${slug}/reading/grade`, audio, "read", segments),
    pollJob: (jobId) => post<ReadingJobPoll>(`/library/reading/jobs/${jobId}`),
    result: (id) => post<{ result: ReadingResult }>(`/library/reading/result/${id}`).then((r) => r.result),
    latest: (slug) => post<{ result: ReadingResult | null }>(`/library/${slug}/reading/latest`).then((r) => r.result),
    history: (slug) => post<{ items: ReadingHistoryItem[] }>(`/library/${slug}/reading/history`).then((r) => r.items),
    regrade: (jobId) => post(`/library/reading/jobs/${jobId}/regrade`).then(() => undefined),
  }),
};

/** 1 bài trong mục "Luyện Nói & Đọc" của user. */
export interface RecordListItem {
  exercise_id: string;
  title: string;
  kind: "reading";
  skill: string | null;
  level: string | null;
  best_score: number | null;
  attempts: number;
  points: number;
}
export const recordLibraryApi = {
  exercise: (slug: string) => post<PublicExerciseResp>(`/library/${slug}/record`),
  list: () => post<{ level: string | null; items: RecordListItem[] }>("/library/record/list"),
};

// ---------- Monthly reports of one learner ----------

// ---------- Báo cáo lượt nộp — công khai (link cho phụ huynh) ----------
export interface SubmissionReportView {
  kind: "quiz" | "reading" | "writing" | "vocab";
  studentName: string;
  exerciseTitle: string;
  exercise_id: string | null;
  skill: string | null;
  read_aloud?: boolean;
  submitted_at: string;
  hint_used?: boolean; // bài nghe: HS đã bật gợi ý (phụ đề chạy theo audio) khi làm
  // quiz:
  feedback?: string; // nhận xét của giáo viên (quiz)
  feedback_status?: "pending" | "done" | "skipped" | "error" | null; // "pending" → trang poll chờ nhận xét

  score?: number;
  total?: number;
  items?: { position: number; question: string; studentAnswer: string; correctAnswer: string; correct: boolean; explanation?: string | null }[];
  grammar?: GrammarNote[]; // cấu trúc ngữ pháp trong bài (câu sai xếp trước)
  audio_script?: string | null; // bài nghe: lời thoại (hiện sau khi nộp)
  // audio_word/audio_word_male: URL pre-gen từ kho (nữ/nam) — có thì loa phát ngay, không thì TTS.
  wordlist?: { word: string; ipa?: string; meaning?: string; audio_word?: string | null; audio_word_male?: string | null }[] | null;
  // đọc to / nói: trả THẲNG result để render bằng chính view kết quả practice.
  passage?: string; // đọc to
  prompt?: string; // writing prompt
  teacher_feedback?: string;
  // vocab deck: `score` is the percentage, `total` the number of words, `points` the session points.
  points?: number | null;
  /** Vocab deck: meaning / IPA / audio of each word met, so the report can be revised from. */
  vocab_words?: { id: string; word: string; ipa: string | null; meaning: string | null; audio_word: string | null; audio_word_male: string | null }[] | null;
  result?: ReadingResult | WritingResult | VocabDeckResult;
}

export interface PublicReport {
  studentName: string;
  month: string;
  content: string;
  stats: ReportStats | null;
  slug?: string | null; // chỉ trang chi tiết trong app trả về → dựng link chia sẻ /r/<slug>
  updatedAt: string;
}

// ---------- Kiểu phản hồi ----------
export interface AssignmentItem {
  exercise_id: string;
  title: string;
  skill: string | null;
  read_aloud?: boolean;
  /** Vocab-deck exercise: `submissionId` is a vocab session, opened as the /s/:id report. */
  vocab_deck?: boolean;
  published: boolean;
  teacher_note: string | null;
  done: boolean;
  lastScore: number | null;
  lastTotal: number | null;
  lastAt: string | null;
  attempts: number;
  feedback: string | null;
  submissionId: string | null;
  assigned_at: string;
}
export interface ReviewItem {
  position: number;
  type: string;
  question: string;
  options: string[] | null;
  studentAnswer: string;
  correctAnswer: string | null;
  correct: boolean;
}
export interface SubmissionReview {
  id: string;
  score: number;
  total: number;
  submitted_at: string;
  hint_used?: boolean; // bài nghe: HS đã bật gợi ý (phụ đề chạy theo audio) khi làm
  studentName: string;
  exerciseTitle: string;
  exercise_id: string | null;
  skill: string | null;
  passage: string | null;
  audio_url: string | null;
  audio_script: string | null;
  wordlist: { word: string; ipa?: string; meaning?: string }[] | null;
  teacherFeedback: string;
  items: (ReviewItem & { accept: string[] })[];
}
export interface PublicExerciseResp {
  exercise_id: string;
  title: string;
  skill: string | null;
  passage: string | null;
  passage_ipa?: { text: string; ipa: string; vi?: string | null }[] | null;
  audio_url: string | null;
  audio_cues?: AudioCuesResp | null;
  dictation?: PublicDictation | null; // bài nghe–chép: mốc audio từng câu + mask/hash (ẩn đáp án)
  read_aloud?: boolean | null;
  writing?: boolean | null;
  /** Bài Nghe & Nói (video/audio theo đoạn) — nội dung lấy qua endpoint /video riêng. */
  video?: boolean | null;
  speaking_prompt?: string | null;
  speaking_framework?: { outline: string[]; phrases: string[]; outlineVi?: string[] } | null;
  speaking_image?: string | null;
  wordlist: { word: string; ipa?: string; meaning?: string }[] | null;
  // Vocab v2: có deck → client render VocabDeck (resolve qua POST /vocab/:slug).
  vocab_deck?: VocabDeckConfigInput | null;
  /** Từ đã resolve sẵn cho bộ thẻ (server bốc luôn — trang chỉ cần 1 vòng gọi). */
  vocab_items?: VocabItem[] | null;
  /** Bài NÓI "Suggested vocabulary": wordlist resolve từ ngân hàng (nghĩa/audio pre-gen). */
  wordlist_items?: VocabItem[] | null;
  /** Scaffolding rung for the `translate` questions; null = "easy". */
  translate_level?: TranslateLevel | null;
  /** Blueprint id — decides the renderer (grammar_translate → translation drill). */
  template_id?: string | null;
  questions: PublicQuestionResp[];
}
/** Phụ đề đồng bộ word-level: transcript + mốc thời gian từng từ. */
export interface AudioCuesResp {
  text: string;
  words: { s: number; e: number; t: number; d: number }[];
}
export interface PublicVisualItem {
  text: string;
  image?: string | null;
}
export interface PublicQuestionResp {
  position: number;
  type: "multiple_choice" | "fill_blank" | "matching" | "ordering" | "categorize" | "translate";
  question: string;
  image?: string | null;
  word_bank: string[] | null;
  hint?: string | null; // gợi ý nghe per-câu (đoạn hội thoại chứa manh mối)
  explanation?: string | null; // giải thích đáp án (hiện khi chữa)
  options?: string[] | null; // multiple_choice
  tokens?: string[] | null; // ordering (đã xáo)
  lefts?: PublicVisualItem[] | null; // matching cột A
  rights?: PublicVisualItem[] | null; // matching cột B (đã xáo)
  categories?: string[] | null; // categorize
  items?: PublicVisualItem[] | null; // categorize (đã xáo)
  // translate — the English never travels, only its shape and hashes (see serialize.publicQuestion).
  skeleton?: string | null;
  hashes?: string[] | null;
  word_hashes?: string[] | null;
  word_hashes_loose?: string[] | null;
  article_lenient?: boolean | null;
}
export interface GradeResp {
  score: number;
  total: number;
  details: { position: number; type: string; correct: boolean; credit?: number }[];
  review: { position: number; correctAnswer: string | null }[];
  grammar?: GrammarNote[]; // cấu trúc ngữ pháp trong bài (câu sai xếp trước)
  audio_script?: string | null;
  points?: number; // chỉ có ở thư viện user công khai (điểm ảo)
  submission_id?: string; // id lượt nộp → chuyển sang trang báo cáo /s/:id
}
export interface Mistake {
  exercise: string;
  skill: string | null;
  type: string;
  question: string;
  studentAnswer: string;
  correctAnswer: string | null;
}
