// Type-only, so the cycle with grammarDrill.ts (which imports PublicQuestion from here) is erased.
import type { TranslateLevel } from "./grammarDrill";
// ============================================================
//  Kiểu dữ liệu miền (domain types) dùng chung web + api.
//  Nguồn sự thật duy nhất về hình dạng dữ liệu của toàn hệ thống.
// ============================================================

export const SKILLS = [
  "grammar",
  "reading",
  "listening",
  "vocabulary",
  "writing",
  "mixed",
] as const;
export type Skill = (typeof SKILLS)[number];

export const QUESTION_TYPES = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "ordering",
  "categorize",
  // "translate" = render a Vietnamese sentence, the student writes the English one. It reuses
  // `question` (the Vietnamese prompt), `answer` (the canonical English) and `accept` (equally valid
  // renderings), and is graded by the same deterministic engine as the standalone translation drill.
  // The separate `grammar_translate_items` bank stays independent
  "translate",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface WordlistItem {
  word: string;
  ipa?: string;
  meaning?: string;
  example?: string; // câu ví dụ minh hoạ cách dùng từ/cụm
  pos?: string; // từ loại (n, v, adj, adv, np, phr…) — TÁCH RIÊNG, không nhét vào `word`
}

/** Một cặp ghép (matching). `right` là phần đáp án — bị ẩn khỏi payload công khai. */
export interface MatchPair {
  left: string;
  right: string;
  left_image?: string | null;
  right_image?: string | null;
}

/** Một item cần phân loại (categorize). `category` là đáp án — bị ẩn công khai. */
export interface CategorizeItem {
  text: string;
  category: string;
  image?: string | null;
}

/** Phần tử trực quan (text + ảnh tùy chọn) dùng cho payload công khai. */
export interface VisualItem {
  text: string;
  image?: string | null;
}

/** Câu hỏi ở dạng "đầy đủ" (chỉ dùng phía server — CÓ đáp án). */
export interface Question {
  position: number;
  type: QuestionType;
  question: string;
  image?: string | null; // ảnh minh hoạ cho đề (tùy chọn)
  word_bank?: string[] | null; // ngân hàng từ gợi ý (điền từ)
  hint?: string | null; // gợi ý nghe per-câu: đoạn hội thoại ngắn chứa manh mối (hiện opt-in trước khi chấm)
  explanation?: string | null; // giải thích đáp án (hiện khi chữa)
  // multiple_choice
  options?: string[] | null;
  answer?: string | null; // multiple_choice: đáp án đúng · ordering: câu đúng
  // fill_blank
  accept?: string[] | null;
  // matching
  pairs?: MatchPair[] | null;
  // ordering
  tokens?: string[] | null;
  // categorize
  categories?: string[] | null;
  items?: CategorizeItem[] | null;
  // translate — forgive a difference of only a/an/the. Turn it off when the article IS what the
  // sentence tests. Defaults to true;
  article_lenient?: boolean | null;
  // The grammar point this question targets (grammar.id) — tagged by AI, never shown to the student
  // while working (used only when reviewing/reporting).
  grammar_id?: string | null;
}

/** Câu hỏi "công khai" gửi cho học sinh — ĐÃ ẩn/xáo trộn đáp án. */
export interface PublicQuestion {
  position: number;
  type: QuestionType;
  question: string;
  image?: string | null;
  word_bank?: string[] | null;
  hint?: string | null; // gợi ý nghe per-câu (đoạn hội thoại chứa manh mối) — hiện opt-in trước khi chấm
  explanation?: string | null; // giải thích đáp án (hiện khi chữa)
  options?: string[] | null; // multiple_choice
  tokens?: string[] | null; // ordering — đã xáo trộn
  lefts?: VisualItem[] | null; // matching — cột A (giữ thứ tự)
  rights?: VisualItem[] | null; // matching — cột B (đã xáo trộn)
  categories?: string[] | null; // categorize
  items?: VisualItem[] | null; // categorize — shuffled, category hidden
  // translate — the same masked payload the standalone drill ships (see GrammarTranslateItem):
  // the English answer stays on the server, only its shape and hashes travel.
  skeleton?: string | null; // "M_ d__ i_ a d_____." — word count and initials, nothing more
  hashes?: string[] | null; // SHA-256 of every acceptable answer key, for marking as you type
  word_hashes?: string[] | null; // SHA-256 per word, in order
  word_hashes_loose?: string[] | null; // same, apostrophes dropped ("doesnt" accepts "doesn't")
  article_lenient?: boolean | null; // client mirrors the server's a/an/the rule
}

export interface Exercise {
  id: string;
  exercise_id: string;
  title: string;
  published: boolean;
  skill?: Skill | null;
  level?: string | null;
  tags?: string[] | null; // TỪ KHOÁ tự do do AI sinh (chỉ để tìm kiếm) — KHÁC `tag_id`
  topic_id?: string | null; // chủ đề chính (topics.id); null = chưa gắn
  topic?: Topic | null; // chủ đề đã resolve (kèm màu/icon) — chỉ có ở một số payload
  tag_id?: string | null; // NHÃN của giáo viên (tags.id) — quyết định phạm vi; null = "all"
  layer?: string | null; // 'academic' = lớp học thuật opt-in (chỉ vào drip khi user bật); null = lõi
  tag?: Tag | null; // nhãn đã resolve (kèm màu/scope) — chỉ có ở một số payload
  passage?: string | null;
  passage_ipa?: IpaLine[] | null; // phiên âm IPA theo câu (hiển thị song song)
  audio_url?: string | null;
  audio_script?: string | null;
  audio_voice?: string | null; // nhãn giọng đã tạo audio ("azure / en-US-JennyNeural")
  audio_cues?: AudioCues | null; // phụ đề đồng bộ word-level (nếu có)
  dictation_mode?: DictationMode | null; // dictation mode (mask/gap/full); null = mask
  // How much scaffolding the `translate` questions carry (the 4-rung ladder shared with the
  // standalone drill, see grammarDrill.ts). null = "easy".
  translate_level?: TranslateLevel | null;
  read_aloud?: boolean | null; // read-aloud exercise (pronunciation scored)
  speaking_prompt?: string | null; // writing prompt
  speaking_framework?: SpeakingFramework | null;
  speaking_sample?: string | null; // bài mẫu (ẩn với học sinh) — nạp prompt AI chấm
  speaking_image?: string | null; // ảnh minh hoạ (bài tả tranh) — hiện cho học sinh
  image?: string | null; // ảnh bìa (thumbnail thư viện user)
  template_id?: string | null; // dạng bài (blueprint) — xem blueprints.ts
  gen_config?: Record<string, unknown> | null; // config AI Composer đã dùng (để tạo lại)
  wordlist?: WordlistItem[] | null;
  // Vocab v2: bài BỘ THẺ tham chiếu ngân hàng từ.
  vocab_deck?: VocabDeckConfig | null;
  // Bài học qua VIDEO (YouTube): nghe-viết + shadowing theo từng đoạn.
  // NGUỒN media của bài luyện-theo-đoạn: "audio" (audio_url) | "video" (youtube_id).
  // NULL = bài cũ → suy: có youtube_id → video, có audio_url+video_segments → audio.
  media_source?: PracticeSource | null;
  video?: boolean | null; // cờ bài video (nội dung ở các cột video_* riêng)
  youtube_id?: string | null; // id video YouTube (nhúng player chính thức)
  video_lang?: string | null; // mã ngôn ngữ transcript (mặc định "en")
  video_segments?: PracticeSegment[] | null; // các đoạn luyện (text + timestamp); dùng cho cả audio lẫn video
  video_modes?: PracticeMode[] | null; // chế độ bật cho bài (mặc định cả 2)
  created_at?: string;
}

/** Một dòng song song text–IPA (dùng cho bài đọc to). */
export interface IpaLine {
  text: string; // câu gốc
  ipa: string; // phiên âm IPA của câu
  vi?: string | null; // bản dịch tiếng Việt của câu (song ngữ) — sinh KÈM IPA (cùng task generate_ipa)
}

/**
 * Tùy chọn hiển thị của người đọc (learner) cho trang Record — lưu theo học sinh
 * (students.reader_prefs). Điều khiển teleprompter (Shadowing) + phiên âm.
 */
export interface ReaderPrefs {
  shadowing: boolean; // bật teleprompter: text tự chạy từ dưới lên (chỉ chạy khi ghi âm / chạy thử)
  ipa: boolean; // hiện phiên âm IPA dưới mỗi câu
  speed: number; // tốc độ chạy text: 1 (chậm) → 5 (nhanh)
  lines: number; // số dòng hiển thị đồng thời trong khung teleprompter: 1 → 6
  fontSize: number; // cỡ chữ bài đọc: 1 (nhỏ) → 7 (lớn); mức 3 = mặc định
  bg: ReaderBg; // nền vùng chữ chạy — phục vụ quay màn hình làm video
  bgOverlay: boolean; // lớp phủ làm dịu nền ảnh cho dễ đọc chữ (tắt được khi muốn ảnh rõ)
}

/**
 * Mã nền vùng đọc. `auto` = theo giao diện; `green`/`blue` = phông chroma key;
 * còn lại là ảnh nền 9:16. Nhãn + ảnh ở `apps/web/src/lib/readerBgs.ts`.
 */
export const READER_BG_IDS = [
  "auto",
  "green",
  "blue",
  "meo-tuyet",
  "hanh-tinh",
  "meo-trang",
  "meo-di-hia",
  "be-mat-tron",
  "robot-nho",
  "chu-tieu",
  "lua-trai",
  "cua-so-may-bay",
  "ga-tau",
  "vet-sang",
  "bien-dem",
  "hoa-xanh",
] as const;

export type ReaderBg = (typeof READER_BG_IDS)[number];

/** Mặc định tùy chọn đọc khi học sinh chưa cấu hình. */
export const DEFAULT_READER_PREFS: ReaderPrefs = {
  shadowing: true, // bật sẵn — nhưng chỉ CHẠY khi bấm ghi âm / chạy thử
  ipa: false,
  speed: 2,
  lines: 1,
  fontSize: 3,
  bg: "auto",
  bgOverlay: true,
};

/** Một từ trong phụ đề đồng bộ: vị trí ký tự [s,e) trong `text` + mốc thời gian. */
export interface AudioCueWord {
  s: number; // start char index (trong AudioCues.text)
  e: number; // end char index (exclusive)
  t: number; // thời điểm bắt đầu (giây)
  d: number; // thời lượng (giây)
}
/** Phụ đề đồng bộ theo audio: transcript + mốc thời gian từng từ (word-level). */
export interface AudioCues {
  text: string; // transcript đầy đủ (giữ dấu câu)
  words: AudioCueWord[];
}

// ---- DICTATION (nghe–chép từng câu) ----
// Độ khó do HỌC SINH chọn lúc luyện (không phải lúc soạn): easy khoét 3 từ khó nhất/câu,
// medium 5 từ, hard cả câu. Đổi mức tức thì trên client (payload đủ dữ liệu cho cả 3 mức).
export type DictationLevel = "easy" | "medium" | "hard";
/** @deprecated Chế độ soạn cũ (mask/gap/full) — không còn dùng để render; giữ cho cột DB cũ. */
export type DictationMode = "mask" | "gap" | "full";

/**
 * Một TỪ trong câu dictation. ĐÁP ÁN KHÔNG RỜI SERVER cho các từ KHÓ NHẤT: `text` chỉ có với
 * những từ luôn hiện sẵn ở mức easy; các từ bị khoét ở easy chỉ gửi mask/initial/hash.
 * Client tự chấm tức thì bằng hash; lên medium/hard chỉ việc ẨN thêm `text` sẵn có (khoét lồng nhau).
 */
export interface DictationWord {
  mask: number; // số ký tự chữ/số (0 = token không phải từ → luôn hiện, không khoét)
  initial: string; // chữ cái đầu (gợi ý)
  hash: string; // sha256(chuẩn hoá đáp án của từ) → client tự chấm, KHÔNG lộ đáp án
  text?: string; // hiện sẵn khi từ KHÔNG bị khoét ở easy; bỏ trống với từ khó nhất
}
/** Một câu dictation: mốc audio để phát RIÊNG câu này + danh sách từ. */
export interface DictationSentence {
  audioStart: number; // giây — mốc bắt đầu câu trong audio (phát riêng câu)
  audioEnd: number; // giây — mốc kết thúc
  words: DictationWord[];
}
/** Payload dictation gửi CHO HỌC SINH — đủ dữ liệu để đổi easy/medium/hard ngay trên client. */
export interface PublicDictation {
  sentences: DictationSentence[];
}
/** Số chỗ khoét mỗi câu theo mức (hard = tất cả từ). Server & client PHẢI dùng chung để khoét lồng nhau. */
export const DICTATION_BLANKS: Record<DictationLevel, number> = {
  easy: 3,
  medium: 5,
  hard: Infinity,
};

// ---- Bài LUYỆN theo TỪNG ĐOẠN transcript: nghe-viết (dictation) + nói nhại (shadowing) ----
// Hai TRỤC trực giao: NGUỒN media (audio/video) × CHẾ ĐỘ luyện (dictation/shadowing).
// Cùng 1 mô hình segment; chỉ khác phần tử phát: <audio> (audio_url) hay YouTube (youtube_id).
export type PracticeSource = "audio" | "video";
export type PracticeMode = "dictation" | "shadowing";
/** @deprecated tên cũ — dùng PracticeMode. Giữ alias cho code/import cũ. */
export type VideoMode = PracticeMode;

/** Một đoạn luyện (câu/cụm) — text sạch + mốc thời gian trong media (audio hoặc video). */
export interface PracticeSegment {
  i: number; // chỉ số đoạn (0-based) = thứ tự phát
  start: number; // giây bắt đầu trong media
  end: number; // giây kết thúc
  text: string; // câu mẫu (đã chuẩn hoá dấu câu) — reference_text shadowing & đáp án nghe-viết
  vi?: string | null; // bản dịch tiếng Việt (gợi ý ngữ cảnh; KHÔNG phải đáp án → hiện ở transcript)
  ipa?: string | null; // phiên âm (tùy chọn)
  // Indices of the WORDS (whitespace-split from `text`) blanked out for fill-in dictation.
  // Empty/null = "write the WHOLE line" mode (the text is hidden entirely while practising).
  blanks?: number[] | null;
  // Word timings from STT, in media seconds — drives the karaoke highlight. Kept as the
  // RAW recognised words, not aligned to `text`: the text gets cleaned afterwards, so alignment is
  // done at render time by `alignWordTimes`. Absent on lessons built from subtitles.
  words?: CueWord[] | null;
  // True when `start` was estimated (a block without word timings was cut by character share)
  // rather than heard. The AI regroup pass then sends the silence before it as unknown.
  estimated?: boolean | null;
  // Other accepted spellings of a word, keyed by its index in `text` — e.g. "2024" also accepts
  // "twenty twenty-four". Numbers are written one way in `text`; learners may type any of these.
  alts?: WordAlts | null;
}

/** Word index (as a JSON key) → accepted alternative spellings of that word. */
export type WordAlts = Record<string, string[]>;

/** One recognised word with its span in the media (seconds). */
export interface CueWord {
  w: string;
  s: number;
  e: number;
  /** Speaker index from STT diarization (0, 1, …). Absent = not known, never "speaker 0". */
  sp?: number;
}
/** @deprecated tên cũ — dùng PracticeSegment. */
export type VideoSegment = PracticeSegment;

/** Đoạn video gửi cho client khi luyện — ĐÃ ẩn đáp án theo chế độ. */
export interface PublicVideoSegment {
  i: number;
  start: number;
  end: number;
  vi?: string | null; // bản dịch (không phải đáp án → gửi được; hiện ở transcript)
  ipa?: string | null;
  // shadowing: text đầy đủ (đọc theo). dictation viết-cả-câu: null. dictation điền-từ: text đã che ô trống ("____").
  text?: string | null;
  // Chỉ dictation điền-từ: chỉ số TỪ bị khoét (client render ô nhập ở đó).
  blanks?: number[] | null;
  // Word count of the line — a length hint for write-the-whole-line mode (reveals no content).
  word_count?: number;
  // Shadowing only: word timings for the karaoke highlight. Withheld in dictation — the recognised
  // words are the answer.
  words?: CueWord[] | null;
  // Dictation: accepted alternative spellings per word index (see PracticeSegment.alts).
  alts?: WordAlts | null;
}

/** Bài NGHE & NÓI gửi cho client (nguồn audio hoặc video). */
export interface PublicVideoLesson {
  exercise_id: string;
  title: string;
  media_source?: PracticeSource; // "audio" | "video" (thiếu → coi như "video" cho bài cũ)
  youtube_id?: string | null; // khi media_source=video
  audio_url?: string | null; // khi media_source=audio (1 file, phát theo start/end đoạn)
  audio_cues?: AudioCues | null; // phụ đề word-level của audio (tùy chọn)
  video_lang?: string | null;
  mode: VideoMode; // chế độ đang luyện (quyết định segments đã che thế nào)
  modes: VideoMode[]; // các chế độ bài này bật
  segments: PublicVideoSegment[];
  /** Best shadowing take per segment already recorded — so a reload shows the marked-up line again. */
  shadow_done?: { segment: number; detail: VideoShadowDetail }[];
  /** Dictation lines already finished — the same idea as `shadow_done`, for the typing mode. */
  dict_done?: VideoDictDone[];
}

/**
 * One dictation line the learner has already finished, as stored in `video_dictation_scores`.
 *
 * `level` is the HARDEST rung the line was ever cleared at (the table keeps the maximum on purpose:
 * redoing a line on an easier rung must not take back the points already earned). So restoring is
 * allowed whenever that rung is at least as hard as the one now in play — a line typed out in full
 * on Hard covers the two blanks Easy would ask for, but never the other way round.
 */
export interface VideoDictDone {
  segment: number;
  attempts: number;
  hints: number;
  first_ok: boolean;
  revealed: boolean;
  level: string | null;
}

/**
 * Graded shadowing take, kept so the student can revisit a line after a reload. Holds the BEST take
 * of a segment (the same one whose score counts). Field names match the /video/shadow response so
 * the page can hydrate its state with it directly.
 */
export interface VideoShadowDetail {
  score: number;
  fidelity: number;
  fluency: number;
  prosody: number | null;
  clarity: number; // share of what was heard that was the intended word (0-100)
  wpm: number | null; // measured pace; null when the take carries no timing
  pause_pct: number | null;
  omissions: number;
  insertions: number;
  words: ReadingWordResult[];
  weak_phonemes: string[];
  transcript: string;
}

/** Kết quả chấm một đoạn nghe-viết. */
export interface VideoDictationResult {
  segment: number;
  correct: boolean;
  expected: string; // câu đúng đầy đủ (lộ sau khi chấm)
  // Chi tiết từng ô (chế độ điền-từ) — index theo `blanks`.
  per_blank?: { index: number; ok: boolean; expected: string }[] | null;
}

export interface ExerciseWithQuestions extends Exercise {
  questions: Question[];
}

/** Một bài trong thư viện công khai (theo level của user) + tiến độ của chính user. */
export interface LibraryItem {
  exercise_id: string;
  title: string;
  skill?: Skill | null;
  level?: string | null;
  topic?: Topic | null; // chủ đề của bài (kèm màu/icon) — null nếu chưa gắn
  image?: string | null; // grid-card artwork (optional) — falls back to a per-skill image when empty
  // Blueprint id. The card needs it to know what opening the exercise means: `grammar_translate`
  // asks for a hint rung in a modal before it navigates.
  template_id?: string | null;
  translate_level?: TranslateLevel | null; // starting hint rung the teacher set — preselected in that modal
  read_aloud?: boolean | null;
  video?: boolean | null; // Dictation & Shadowing lesson — practised sentence by sentence
  // Cover art for a video lesson comes straight from YouTube (i.ytimg.com) — no upload, no R2.
  youtube_id?: string | null;
  // Dictation & Shadowing progress, counted in SEGMENTS (`q_count` is the total). A video lesson
  // has no single grade, so the card reports coverage instead. `seg_avg` = mean shadowing score.
  seg_done?: number;
  seg_avg?: number | null;
  video_modes?: PracticeMode[] | null; // chế độ bật (để chọn ở popover thư viện); null → cả 2
  done: boolean; // user đã làm ít nhất 1 lần
  best_correct: number | null; // số câu đúng cao nhất
  total: number | null; // tổng số câu
  attempts: number;
  points: number; // điểm ảo bài này (best_correct × POINTS_PER_CORRECT)
  locked: boolean; // true → chưa mở khóa (gạn giọt theo ngày), không bấm được
  q_count?: number | null; // số "mục": câu hỏi (quiz) · từ (đọc to / bộ thẻ) — để card hiện "N câu/từ"
  assigned_at?: string | null; // ISO thời điểm cô giao — CHỈ có ở bài trong danh sách "assigned"
  last_attempt_at?: string | null; // ISO lần làm GẦN NHẤT (đã làm mới có) — hiện "Lần cuối …"
  // Id lượt nộp GẦN NHẤT (quiz/đọc-to/nói) → card đã-làm bấm vào mở báo cáo /s/:id thay vì làm lại.
  // null với bài bộ thẻ từ vựng (chưa có trang báo cáo riêng) → vẫn vào trang luyện.
  last_submission_id?: string | null;
  // Id of the HIGHEST-scoring attempt — the card shows `best_correct`, so the report it opens must
  // be that attempt. Equals `last_submission_id` after a single attempt; null for vocab decks.
  best_submission_id?: string | null;
  // Unfinished vocab-deck session kept server-side (quiz drafts live in the browser instead). Lets
  // the card show how far along the learner is: an abandoned deck writes no submission at all, so
  // without this it looked untouched.
  doing_answered?: number | null;
  doing_total?: number | null;
  // ---- Assigned exercises only (hàng chờ trượt) ----
  //  todo = chưa làm, đã tới lượt · redo = <50%, đang chiếm ô · waiting = <50% nhưng hết ô
  //  stuck = thử ≥3 lần vẫn chưa đạt (nhả ô) · passed = ≥50% · locked = chưa tới lượt
  assign_state?: "todo" | "redo" | "waiting" | "stuck" | "passed" | "locked";
  queued?: boolean; // có nằm trong cửa sổ ô đang mở không → quyết định vùng "Cần làm ngay"
  unlocked_at?: string | null; // ISO lúc bài TỚI LƯỢT (hiện thay cho ngày giao)
}

/** Tổng kết hàng chờ bài cô giao (thanh tiến độ + lời nhắc mở khoá). */
export interface AssignedQueueSummary {
  total: number;
  passed: number;
  locked: number;
  redo: number; // số ô đang bị bài chưa đạt chiếm
  window: number; // tổng ô mở cùng lúc
  pass_pct: number; // ngưỡng ĐẠT (%)
}

/** Trạng thái gạn giọt của thư viện theo level. */
export interface LibraryMeta {
  mode: "rolling" | "daily"; // see UNLOCK_MODE
  daily: number; // hạn mức HÔM NAY = nền + số suất kiếm lại được (trần DAILY_UNLOCK_MAX)
  daily_base: number; // hạn mức nền khi chưa làm gì
  earned_today: number; // số suất kiếm lại được nhờ làm ĐẠT bài mới hôm nay
  rollover: number; // trần bài đã mở chưa làm
  unlocked_today: number; // đã mở bao nhiêu trong "ngày" hiện tại
  remaining_today: number; // còn mở được mấy bài hôm nay (daily − unlocked_today)
  active_undone: number; // số bài đã mở nhưng chưa làm (đang chờ)
  done_in_level: number; // số bài đã hoàn thành trong level
  total_in_level: number; // tổng số bài trong level
  next_unlock_at: string | null; // ISO mốc mở tiếp (nửa đêm VN); null nếu đã mở hết bài
}

// ---- Lộ trình (teacher quản lý chặng + thứ tự bài cho user công khai) ----
/** Một chặng (khung) trong lộ trình của level. */
export interface PathStage {
  id: string;
  title: string;
  position: number;
}
/** Một bài trong lộ trình (kèm chặng đang thuộc + thứ tự). */
export interface PathItem {
  exercise_id: string;
  title: string;
  skill?: Skill | null;
  tags?: string[] | null;
  topic?: Topic | null; // chủ đề của bài (kèm màu/icon) — null nếu chưa gắn
  published: boolean;
  stage_id: string | null; // null = chưa xếp vào chặng nào
  path_order: number | null;
}
/** Toàn cảnh lộ trình của 1 level. */
export interface PathState {
  level: { id: string; name: string };
  stages: PathStage[];
  items: PathItem[];
}

/** Đề công khai gửi cho học sinh (ẩn đáp án + audio_script). */
export interface PublicExercise {
  exercise_id: string;
  title: string;
  skill?: Skill | null;
  passage?: string | null;
  passage_ipa?: IpaLine[] | null; // phiên âm IPA theo câu (hiển thị song song)
  audio_url?: string | null;
  audio_cues?: AudioCues | null; // phụ đề đồng bộ word-level (nếu có; DICTATION không gửi — xem `dictation`)
  dictation?: PublicDictation | null; // bài nghe–chép: mốc audio từng câu + mask/initials/hash (ẩn đáp án)
  read_aloud?: boolean | null; // true → học sinh đọc to & chấm phát âm
  video?: boolean | null; // true → bài học qua video (client gọi endpoint /video riêng)
  speaking_prompt?: string | null; // writing prompt
  speaking_framework?: SpeakingFramework | null; // khung mẫu (dàn ý + cụm từ)
  speaking_image?: string | null; // ảnh minh hoạ (bài tả tranh) — hiện cho học sinh
  writing?: boolean | null; // true → bài viết tự luận (chấm text thuần bằng LLM) — tái dùng speaking_prompt/framework làm đề/dàn ý
  wordlist?: WordlistItem[] | null;
  // Vocab v2: có deck → client render VocabDeck. Server resolve luôn `vocab_items` kèm theo
  // để trang chỉ cần MỘT vòng gọi.
  vocab_deck?: VocabDeckConfig | null;
  vocab_items?: VocabItem[] | null;
  // Bài NÓI "Suggested vocabulary": wordlist (chỉ từ khóa) đã resolve từ NGÂN HÀNG (nghĩa/audio). Xem lib/wordlistResolve.
  wordlist_items?: VocabItem[] | null;
  // Scaffolding rung the `translate` questions render at; null = "easy".
  translate_level?: TranslateLevel | null;
  // Blueprint id — the learner page picks its renderer from this (a `grammar_translate` exercise
  // runs in the translation drill, not the quiz cards). See blueprints.ts.
  template_id?: string | null;
  questions: PublicQuestion[];
}

/** Điểm 1 âm vị (phoneme) trong 1 từ — chấm chi tiết (granularity=Phoneme). */
export interface PhonemeScore {
  phoneme: string; // ký hiệu IPA
  accuracy: number; // 0-100
}

/** Điểm 1 từ khi chấm phát âm (Azure). */
export interface ReadingWordResult {
  word: string;
  accuracy: number; // 0-100
  errorType: "None" | "Mispronunciation" | "Omission" | "Insertion";
  phonemes?: PhonemeScore[]; // điểm từng âm vị (nếu Azure trả về)
  offsetMs?: number | null; // mốc bắt đầu từ (ms tính từ đầu audio); null với Omission
  durationMs?: number | null; // độ dài phát từ (ms); null với Omission
}

/** Compact record of one mispronounced word — kept in D1 while full `words` lives in R2. */
export interface ReadingErrorWord {
  word: string;
  errorType: ReadingWordResult["errorType"];
  accuracy: number; // 0-100
}

/** Kết quả chấm bài đọc to trả về cho học sinh sau khi nộp. */
export interface ReadingResult {
  pron_score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  prosody: number | null;
  transcript: string;
  words: ReadingWordResult[];
  feedback: string | null; // nhận xét "Cô–em" (có thể null nếu AI lỗi)
  audio_url: string | null; // bản ghi của học sinh (để nghe lại)
  duration_ms: number;
  submission_id?: string; // id lượt nộp — để mở lại báo cáo qua URL (F5 không mất)
  attempt_no?: number; // lần đọc thứ mấy của bài này (1-based)
  previous_score?: number | null; // điểm tổng lần đọc TRƯỚC (để so tiến bộ); null nếu lần đầu
  best_score?: number; // điểm phát âm CAO NHẤT của bài (sau lượt này)
  reward_gained?: number; // TIỀN thưởng THỰC nhận thêm lượt này (học sinh); 0 nếu chưa vượt kỷ lục
  points_gained?: number; // ĐIỂM ảo nhận thêm (user công khai) — thay chỗ reward_gained
  best_points?: number; // tổng điểm ảo của bài (sau lượt này) — user công khai
}

/** Khung mẫu cho bài SPEAKING: dàn ý gợi ý + cụm từ/mẫu câu hữu ích (từ vựng dùng `wordlist`). */
export interface SpeakingFramework {
  outline: string[]; // các ý chính cần nói (mở bài → ý → kết)
  phrases: string[]; // cụm từ / mẫu câu hữu ích gợi ý
  outlineVi?: string[]; // bản dịch dàn ý sang tiếng Việt — lưu sau lần dịch đầu để học sinh sau khỏi gọi lại AI
}

/** Writing grading result returned to the learner after submitting. */
export interface WritingResult {
  overall_score: number; // total score 0-100 (mean of the four criteria)
  task: number; // Content — answers the task, ideas developed (0-100)
  coherence: number; // Organisation — structure, paragraphs, linking (0-100)
  grammar: number; // Grammar — sentence accuracy (0-100)
  lexical: number; // Vocabulary — range and accuracy (0-100)
  text: string; // the submitted piece
  word_count: number;
  feedback: string | null; // teacher-to-learner comment
  submission_id?: string;
  attempt_no?: number;
  previous_score?: number | null;
  best_score?: number;
  points_gained?: number; // points earned by this attempt
  best_points?: number;
}

export interface Level {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  position?: number;
}

/** Chủ đề (theme) của bài tập — global, cắt ngang level/kỹ năng. */
export interface Topic {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  parent_id?: string | null; // chủ đề cha (null = topic gốc). Cây 2 cấp mẹ→con.
  position?: number;
}

// ---- Ngữ pháp (grammar reference) — bảng `grammar`, ----
/**
 * PHẠM VI của một nhãn — quyết định ai được thấy bài mang nhãn đó.
 *  · "all"     — cả học sinh (qua assignments) lẫn user công khai (thư viện). Mặc định.
 *  · "student" — CHỈ học sinh của cô; bài KHÔNG lọt vào thư viện user công khai.
 * Cố ý là cột riêng (tags.scope), KHÔNG phải chuỗi trong `Exercise.tags`
 */
export const TAG_SCOPES = ["all", "student"] as const;
export type TagScope = (typeof TAG_SCOPES)[number];

/** Nhãn phân loại bài tập của giáo viên (bảng `tags`). Khuôn giống Topic, thêm `scope`. */
export interface Tag {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  scope: TagScope;
  position?: number;
}

/** Band CEFR — trục phân cấp ĐỒNG BỘ với levels (level.name chứa band này). */
export const CEFR_BANDS = [
  "Pre-A1",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;
export type Cefr = (typeof CEFR_BANDS)[number];

/** CEFR band of a free-form level name: "A1 Movers" → "A1", "Pre A1 Starters" → "Pre-A1". */
export function cefrOfLevelName(name?: string | null): Cefr | null {
  const m = (name ?? "").trim().match(/^(pre[\s-]?a1|a1|a2|b1|b2|c1|c2)\b/i);
  if (!m) return null;
  const key = m[1].toUpperCase().replace(/\s/, "-");
  return (key === "PRE-A1" ? "Pre-A1" : key) as Cefr;
}

/**
 * Coarse band group, used ONLY by Dictation & Shadowing. That family is not a ladder — each lesson
 * is a standalone video — so its pool opens across a whole group instead of one level.
 *
 * Two groups, not one per CEFR band: the split that matters to a learner is basic vs advanced.
 * Someone at B2 wants a crack at C1 material, and walling B1-B2 off from C1-C2 only starves the
 * upper shelf. The learning path is untouched — that one does step up level by level.
 */
export const CEFR_GROUP: Record<Cefr, "basic" | "advanced"> = {
  "Pre-A1": "basic",
  A1: "basic",
  A2: "basic",
  B1: "advanced",
  B2: "advanced",
  C1: "advanced",
  C2: "advanced",
};

/** Một dạng công thức có nhãn (khẳng định / phủ định / nghi vấn…). */
export interface GrammarForm {
  label: string; // "Khẳng định" | "Phủ định" | "Nghi vấn" | "Rút gọn"…
  formula: string; // "S + V(s/es)"
  example?: string; // ví dụ minh hoạ ngay công thức
}
/** Ví dụ song ngữ, tùy chọn phân loại + chú thích. */
export interface GrammarExample {
  en: string;
  vi: string;
  kind?: "aff" | "neg" | "ques"; // khẳng định / phủ định / nghi vấn
  note?: string; // chú thích nhỏ (vì sao)
}
/** Phân biệt với một điểm ngữ pháp dễ nhầm. */
export interface GrammarCompare {
  with: string; // id (hoặc tên) điểm ngữ pháp dễ nhầm
  note: string; // phân biệt ngắn gọn
}
/** Một mục trong KHO tra cứu (danh mục cụm/từ cần nhớ) — cho phrasal verbs, giới từ đi kèm, cấu tạo từ… */
export interface GrammarBankItem {
  term: string; // "turn on", "get up"
  meaning: string; // nghĩa (tiếng Việt, có thể kèm nghĩa Anh gọn)
  example?: string; // câu ví dụ ngắn (có nút nghe TTS)
  group?: string; // nhãn nhóm để gom (vd "Sinh hoạt", "Quần áo")
}

/** Một điểm ngữ pháp đầy đủ (bảng `grammar`). Nội dung soạn tay, tra cứu để ghi nhớ. */
export interface Grammar {
  id: string; // slug ổn định (vd "present-simple")
  title: string; // "Present Simple — Hiện tại đơn"
  category: string; // nhóm để gom (Thì động từ, Mệnh đề…)
  cefr: Cefr; // band CEFR — đồng bộ level ladder
  summary: string; // 1 câu "khi nào dùng"
  forms: GrammarForm[]; // công thức có nhãn
  signals?: string[] | null; // DẤU HIỆU nhận biết (yesterday, already…)
  usage: string[]; // các trường hợp dùng
  spelling?: string[] | null; // quy tắc biến đổi chính tả (-ing, -ed, -s…)
  examples: GrammarExample[]; // ví dụ song ngữ
  mistakes?: string[] | null; // lỗi hay gặp
  tips?: string[] | null; // MẸO ghi nhớ / mnemonic
  compare?: GrammarCompare[] | null; // PHÂN BIỆT điểm dễ nhầm
  related?: string[] | null; // id điểm liên quan (ôn trọn cụm)
  keywords?: string[] | null; // từ khoá (kể cả tiếng Việt) cho tìm kiếm
  bank?: GrammarBankItem[] | null; // KHO tra cứu (danh mục cụm/từ) — cho điểm dạng danh sách
  // Question types this point can be DRILLED with; null = default pair.
  drill_types?: QuestionType[] | null;
  position?: number; // thứ tự trong band
  created_at?: string;
}

/**
 * Bản GỌN cho DANH SÁCH sổ tay (`GET /grammar`) và picker của giáo viên: chỉ những field
 * cần để lọc/tìm/hiện card. Cố ý BỎ forms/usage/examples/tips/mistakes/compare/related —
 * chúng chiếm ~90% payload mà chỉ dùng khi mở một mục, lúc đó lazy-fetch `GET /grammar/:id`.
 * (86 điểm bản đầy đủ = 244 KB; bản gọn nhỏ hơn cả chục lần.)
 */
export type GrammarListItem = Pick<
  Grammar,
  | "id"
  | "title"
  | "category"
  | "cefr"
  | "summary"
  | "signals"
  | "keywords"
  | "drill_types"
  | "position"
>;

/**
 * Bản GỌN của một điểm ngữ pháp, kèm ngữ cảnh bài làm — dùng ở báo cáo/xem lại.
 * Cố ý KHÔNG kèm forms/examples/compare (nặng): web lazy-fetch `GET /grammar/:id`
 * khi học sinh bấm mở rộng (GET công khai → edge cache dùng chung mọi báo cáo).
 */
export interface GrammarNote {
  id: string;
  title: string;
  category: string;
  cefr: Cefr;
  summary: string;
  positions: number[]; // các câu trong bài nhắm tới điểm này
  wrongPositions: number[]; // trong đó, các câu em làm SAI (rỗng = làm đúng hết)
}

/** Một điểm ngữ pháp còn yếu, gom trên NHIỀU lượt nộp (báo cáo tháng). */
export interface GrammarWeak {
  id: string;
  title: string;
  category: string;
  cefr: Cefr;
  summary: string;
  wrong: number; // số câu SAI thuộc điểm này trong kỳ
  seen: number; // tổng số câu thuộc điểm này em đã gặp trong kỳ
}

/** Một điểm ngữ pháp user GHIM để luyện tiếp (tự ghim, hoặc từ nhận xét của cô). */
export interface GrammarMarked {
  id: string;
  title: string;
  category: string;
  cefr: Cefr;
  summary: string;
  marked_at: string | null;
}

export interface Student {
  id: string;
  name: string;
  passcode?: string | null;
  contact?: string | null;
  note?: string | null;
  birth_year?: number | null;
  gender?: Gender | null;
  level_id?: string | null;
  level?: Level | null;
  active: boolean;
  created_at?: string;
}

/** User CÔNG KHAI (public self-serve) — KHÔNG lộ password_hash/google_sub ra client. */
export interface PublicUser {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null; // ảnh hồ sơ Google; null → fallback avatar theo seed
  provider: "password" | "google";
  has_password?: boolean; // đã đặt mật khẩu chưa (Google-only có thể chưa) → UI hiện "Tạo/Đổi mật khẩu"
  level_id?: string | null;
  level?: Level | null;
  topics?: string[] | null; // chủ đề quan tâm (mảng topics.id); null/[] = tất cả
  birth_year?: number | null;
  gender?: Gender | null;
  academic_enabled?: boolean; // bật lớp học thuật (opt-in) → bài layer='academic' vào drip; mặc định false
  voice_gender?: "male" | "female" | null; // giọng đọc TỪ ưa thích (khác `gender`); null = nữ
  voice_gender_sentence?: "male" | "female" | null; // giọng đọc CÂU/đoạn dài; null = nam
  library_view?: "grid" | "list" | null; // kiểu xem thư viện bài; null = grid (mặc định)
  theme?: "light" | "dark" | null; // giao diện sáng/tối đã chọn; null = theo máy/giờ
  in_class?: boolean; // có thuộc lớp đang hoạt động không → mở khoá tính năng lớp (báo cáo của cô)
  // Email change waiting to take effect (user self-change, 2-day grace). null = none pending.
  pending_email?: string | null;
  pending_email_at?: string | null; // ISO — when the pending change applies
  created_at?: string;
}

/** Một lượt trao đổi dưới góp ý (cô hoặc chính người gửi). */
export interface FeedbackReply {
  author: "user" | "teacher";
  content: string;
  created_at: string;
}

/** Một góp ý công khai — bản hiển thị trên bảng chung (kèm người gửi + hội thoại). */
export interface FeedbackItem {
  id: string;
  code?: string; // chỉ trả ở API giáo viên
  rating: number; // 1-5
  title: string | null;
  content: string; // markdown-lite (đậm/gạch đầu dòng/xuống dòng)
  image_url: string | null;
  status: "open" | "replied";
  replies: FeedbackReply[];
  created_at: string;
  user: { name: string | null; avatar_url: string | null };
  mine?: boolean; // đúng nếu là góp ý của user đang xem (bảng public)
}

// ---- Breaking-news ticker (quotes scrolling under the user nav) ----

// ---- Community chat ----

/** One applied/pending email change — admin history view + user's own pending state. */
export interface EmailChangeItem {
  old_email: string;
  new_email: string;
  source: "user" | "admin";
  effective_at: string;
  applied_at: string | null;
  canceled_at: string | null;
  created_at: string;
}

/**
 * One class — membership is what turns a plain `user` into a student of this teacher.
 *
 */
export interface Classroom {
  id: string;
  name: string;
  note?: string | null;
  join_code?: string | null;
  active: boolean;
  member_count?: number;
  created_at?: string;
}

/** Giới tính học sinh (chỉ lưu 3 giá trị này). */
export type Gender = "male" | "female" | "other";

/** map { [position]: giá trị học sinh nhập } */
export type AnswerMap = Record<number, string>;

export interface GradeDetail {
  position: number;
  type: QuestionType;
  correct: boolean; // đúng HOÀN TOÀN (credit === 1) — giữ tương thích UI cũ
  credit?: number; // điểm phần 0..1 (matching/categorize có thể đúng một phần); các dạng khác 0/1
}

export interface Submission {
  id: string;
  exercise_id: string;
  student_id: string | null;
  score: number;
  total: number;
  answers: AnswerMap;
  details: GradeDetail[];
  teacher_feedback?: string | null;
  hint_used?: boolean; // bài nghe: có bật gợi ý (phụ đề chạy theo audio) khi làm không
  submitted_at: string;
}

export interface Assignment {
  student_id: string;
  exercise_id: string;
  teacher_note?: string | null;
  assigned_at: string;
}

export interface GradeResult {
  score: number;
  total: number;
  details: GradeDetail[];
}

/**
 * Số liệu THẬT của học sinh trong 1 tháng — snapshot lúc giáo viên lưu báo cáo.
 * Dùng để vẽ chart trên trang báo cáo công khai. Giữ snake_case để khớp payload AI.
 */
export interface ReportStats {
  exercises_done: number;
  avg_pct: number | null;
  // Điểm TB % theo từng kỹ năng (grammar/reading/listening/vocabulary | "khác").
  by_skill: { skill: string; done: number; avg_pct: number | null }[];
  // Mỗi bài đã nộp theo thời gian (đã sort tăng dần) — vẽ timeline tiến bộ.
  timeline: {
    date: string;
    pct: number;
    title: string;
    skill: string | null;
  }[];
  // Câu cần cải thiện (đã cắt bớt) — đề, đáp án của em, đáp án đúng.
  mistakes: {
    exercise: string;
    skill: string | null;
    question: string;
    student_answer: string;
    correct_answer: string;
    blank?: boolean; // em BỎ TRỐNG (không trả lời) — tách riêng để cảnh báo; báo cáo cũ không có cờ này
  }[];
  // Trọng tâm cần luyện — chủ điểm gom từ câu sai + gợi ý ngắn (rỗng nếu không có).
  focus?: { topic: string; note: string }[];
  // Cấu trúc NGỮ PHÁP sai nhiều nhất trong tháng — gom từ questions.grammar_id của câu sai
  // (nhãn AI gắn sẵn lúc lưu bài). Optional để báo cáo cũ (chưa có) vẫn render.
  grammar?: GrammarWeak[];
  // Bài ĐỌC TO (chấm phát âm) trong tháng — optional để báo cáo cũ (chưa có) vẫn render.
  reading?: ReadingReportStats;
  // ---- Khối MỞ RỘNG (chỉ báo cáo của user thành viên lớp) — đều optional để báo cáo cũ vẫn render.
  // Chuyên cần & xếp hạng: streak/rank/tổng điểm là snapshot TOÀN THỜI GIAN lúc chốt; active_days theo THÁNG.
  attendance?: {
    active_days: number; // số ngày có học trong tháng
    streak_days: number; // chuỗi ngày học liên tục hiện tại
    best_streak_days: number; // chuỗi dài nhất từ trước tới nay
    total_points: number; // tổng điểm tích luỹ
    rank: number | null; // hạng trên BXH toàn thời gian
  };
  // Độ chính xác theo LOẠI câu hỏi (từ details câu quiz trong tháng).
  question_types?: {
    type: string;
    correct: number;
    total: number;
    accuracy: number;
  }[];
  // Từ vựng trong tháng — số buổi luyện + điểm TB + số từ đã học/thuộc.
  vocab?: {
    sessions: number;
    avg_pct: number | null;
    words_learned: number; // số từ đánh dấu "đã học" trong THÁNG (learnedAt trong kỳ)
    words_mastered: number; // tổng số từ đã thuộc tới lúc chốt (toàn thời gian)
  };
}

/** Thống kê phần ĐỌC TO (chấm phát âm) của học sinh trong 1 tháng. */
export interface ReadingReportStats {
  count: number; // số lượt đọc to đã nộp
  avg_pron: number | null; // điểm phát âm tổng TB
  avg_accuracy: number | null; // chính xác âm TB
  avg_fluency: number | null; // trôi chảy TB
  avg_completeness: number | null; // đọc đủ TB
  // Tiến bộ phát âm theo thời gian (đã sort tăng dần) — vẽ timeline.
  timeline: { date: string; pron: number; title: string }[];
  // Từ phát âm sai/thiếu lặp lại nhiều nhất (đã cắt bớt) — trọng tâm luyện đọc.
  weak_words: { word: string; count: number }[];
  // Nhận xét phát âm ĐÃ SINH lúc chấm (Cô–em) — để báo cáo tháng DÙNG LẠI, không viết lại.
  notes?: string[];
}

// ============================================================
//  VOCABULARY v2 — ngân hàng từ dùng chung + deck luyện
// ============================================================

// Một từ đã resolve từ ngân hàng (vocab_words) để client dựng thẻ.
export type VocabItem = {
  id: string;
  word: string;
  pos?: string | null;
  ipa?: string | null;
  meaning?: string | null; // Vietnamese
  example?: string | null;
  image?: string | null;
  // Equivalent ways of saying the same thing — attached only when present, for "paraphrase".
  synonyms?: string[];
  definition?: string | null; // short English definition
  example_vi?: string | null;
  cefr?: string | null;
  collocations?: string[];
  family?: string[];
  antonyms?: string[];
  note?: string | null;
};

// Activities a deck can mix.
export const VOCAB_ACTIVITIES = [
  "flashcard",
  "matching",
  "listen_choice",
  "dictation",
  "recall",
  "pronounce",
  "spelling",
  "paraphrase", // equivalent expressions (needs synonyms)
] as const;
export type VocabActivity = (typeof VOCAB_ACTIVITIES)[number];

// One practice deck — shared by an assigned exercise (exercises.vocab_deck) and self-practice.
export type VocabDeckConfig = {
  source: "fixed" | "filter";
  wordIds?: string[]; // source=fixed: exactly these vocab_items, in order
  filter?: {
    setId?: string | null; // source=filter: the words of this set
    count?: number;
    shuffle?: boolean;
  };
  activities: VocabActivity[];
  order: "interleave" | "grouped";
  retryWrong?: boolean;
  pronounce?: "on" | "optional" | "off"; // phát âm chấm điểm chỉ cho user đăng nhập
};

// Chế độ chọn từ khi tự cấu hình buổi luyện (Practice set modal).
// "due" = đến hạn ôn theo lịch trí nhớ (xem shared/srs.ts) — ưu tiên quá hạn nặng trước.
export const VOCAB_DECK_MODES = ["all", "unlearned", "review", "wrong", "due"] as const;
export type VocabDeckMode = (typeof VOCAB_DECK_MODES)[number];

// Trạng thái deck ĐANG DỞ để resume — deck đã dựng (queue) + vị trí + thống kê từng từ.
// `queue[].def` là VocabActivity (không lưu hàm); hydrate lại từ registry + itemIds.
export type VocabSessionCardRef = { key: string; def: VocabActivity; itemIds: string[] };
export type VocabSessionStat = {
  wordId: string;
  word: string;
  seen: VocabActivity[];
  wrong: boolean;
  pron?: number | null;
  attempts?: VocabWordAttempt[]; // every graded answer so far, so a resumed session keeps the counts
};
export type VocabSessionState = {
  queue: VocabSessionCardRef[];
  pos: number;
  stats: VocabSessionStat[];
  retried: string[]; // keys of cards already requeued once for review (never requeued twice)
  // Cards already graded, by card key. Free prev/next navigation means `pos` alone no longer says
  // what is finished, and a resumed session must not offer an answered card again.
  // `snapshot` is the card's own record of how it was built and answered (opaque here), so a
  // resumed session can redraw a finished card exactly as the learner left it.
  answered?: { key: string; correct: boolean; snapshot?: unknown }[];
};

// Kết quả 1 từ trong buổi luyện + tổng kết deck (lưu vocab_submissions).
/** One graded attempt at a word: which activity asked it, and whether the answer was right. */
export type VocabWordAttempt = { activity: VocabActivity; correct: boolean };

export type VocabResultWord = {
  word: string;
  wordId?: string;
  seen: VocabActivity[]; // activity types this word was met through
  // Graded attempts only (flashcard self-rating and pronunciation are NOT tests — see srs.ts).
  // `total` is the real number of attempts: a word drilled by 7 activities reads 5/7, not 1/1.
  correct: number;
  total: number;
  mastered: boolean; // every activity ended on a correct answer (a fixed retry counts)
  pron?: number | null; // best pronunciation score of the session, when scored
  attempts?: VocabWordAttempt[]; // per-activity detail for the report; absent on old sessions
};
/** Deck coverage at submit time: cards in the queue, cards left open, graded word-slots left open. */
export type VocabDeckProgress = { cards: number; open: number; unanswered: number };

export type VocabDeckResult = {
  score: number;
  total: number;
  perWord: VocabResultWord[];
  weakWords: string[];
  // How far through the deck the learner got when submitting (absent on old sessions). Feeds
  // `vocabSessionScore`: open graded cards count as wrong, a test-free deck scores by completion.
  progress?: VocabDeckProgress;
  // Tổng kết TRÍ NHỚ của buổi — server ghi thêm lúc nộp (client không gửi). Nuôi "độ bền 30 ngày"
  // (true retention = recalled/reviewed) mà không cần bảng nhật ký ôn riêng.
  memory?: {
    reviewed: number; // số từ ĐẾN HẠN được ôn trong buổi
    recalled: number; // trong đó nhớ được (rating ≥ 3)
    tiersUp: number; // số lần một từ lên tầng hiểu biết mới
    points: number; // điểm ảo của buổi
  };
};
