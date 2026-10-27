import type { QuestionType } from "./types";
import { getBlueprint } from "./blueprints";

// ────────────────────────────────────────────────────────────────────────────
//  Validate CẤU TRÚC câu hỏi theo TỪNG dạng — dùng ở BIÊN API (chặn bài hỏng lọt DB)
//  và có thể tái dùng ở web để báo lỗi trước khi lưu.
//  `questionInputSchema` (zod) cố tình lỏng (mọi field nullish) nên không ràng buộc
//  được "answer ∈ options", "categorize item.category ∈ categories"… → làm ở đây.
//  Thông báo TIẾNG VIỆT, hiển thị thẳng cho giáo viên.
// ────────────────────────────────────────────────────────────────────────────

export interface ValidatableQuestion {
  type: QuestionType;
  question?: string | null;
  options?: (string | null)[] | null;
  answer?: string | null;
  accept?: (string | null)[] | null;
  pairs?: { left?: string | null; right?: string | null }[] | null;
  tokens?: (string | null)[] | null;
  categories?: (string | null)[] | null;
  items?: { text?: string | null; category?: string | null }[] | null;
  word_bank?: (string | null)[] | null;
}

const clean = (arr: (string | null)[] | null | undefined) => (arr ?? []).map((s) => (s ?? "").trim()).filter(Boolean);

// True/False pairs — the exception allowed to have 2 options (everything else needs exactly 4).
const TF_WORDS = new Set(["true", "false", "yes", "no", "đúng", "sai", "có", "không", "t", "f"]);
/** True when the options are exactly two distinct true/false words. */
export function isTrueFalseOptions(options: (string | null)[] | null | undefined): boolean {
  const opts = clean(options).map((o) => o.toLowerCase());
  return opts.length === 2 && opts[0] !== opts[1] && opts.every((o) => TF_WORDS.has(o));
}

// True/False/Not Given triples (and Yes/No/Not Given) — the standard Cambridge/IELTS format used by
// the academic lane. "Not Given" is a required third option, so these cannot be padded to 4.
// Synonyms are listed because models reach for them freely ("Not mentioned", "Doesn't say"). Without
// them the triple fails the TFNG test, the item counts as a plain 3-option question and gets dropped.
const NOT_GIVEN = new Set([
  "not given",
  "notgiven",
  "ng",
  "not mentioned",
  "not stated",
  "doesn't say",
  "does not say",
  "no information",
  "không đề cập",
  "không nêu",
]);
/** True when the option is the "Not Given" member of a TFNG triple, under any of its spellings. */
export const isNotGivenOption = (o: string) => NOT_GIVEN.has(o.trim().toLowerCase());
const TFNG_SETS = [
  new Set(["true", "false"]),
  new Set(["yes", "no"]),
  new Set(["đúng", "sai"]),
  new Set(["có", "không"]),
];
/** True when the options are a True/False/Not Given (or Yes/No/Not Given) triple. */
export function isTfngOptions(options: (string | null)[] | null | undefined): boolean {
  const opts = clean(options).map((o) => o.toLowerCase());
  if (opts.length !== 3 || new Set(opts).size !== 3) return false;
  const ng = opts.filter((o) => NOT_GIVEN.has(o));
  if (ng.length !== 1) return false;
  const rest = new Set(opts.filter((o) => !NOT_GIVEN.has(o)));
  return TFNG_SETS.some((s) => rest.size === s.size && [...rest].every((o) => s.has(o)));
}

/** Lỗi cấu trúc của MỘT câu theo dạng (tiếng Việt) — null nếu hợp lệ. */
export function questionIssue(q: ValidatableQuestion, idx: number): string | null {
  const at = `Câu ${idx + 1}`;
  if (!q.question?.trim()) return `${at}: thiếu nội dung câu hỏi`;
  switch (q.type) {
    case "multiple_choice": {
      const opts = clean(q.options);
      if (!q.answer?.trim()) return `${at} (trắc nghiệm): chưa chọn đáp án đúng`;
      if (!opts.includes(q.answer.trim())) return `${at} (trắc nghiệm): đáp án đúng phải nằm trong các lựa chọn`;
      // Exactly 4 options; the only exceptions are True/False (2) and True/False/Not Given (3).
      // A plain 3-option question (33% guess) or 5+ is rejected.
      if (opts.length !== 4 && !isTrueFalseOptions(q.options) && !isTfngOptions(q.options)) {
        return `${at} (trắc nghiệm): cần ĐÚNG 4 lựa chọn (Đúng/Sai dùng 2, True/False/Not Given dùng 3)`;
      }
      return null;
    }
    case "fill_blank":
      if (clean(q.accept).length === 0) return `${at} (điền từ): cần ít nhất 1 đáp án chấp nhận`;
      return null;
    case "matching": {
      const pairs = (q.pairs ?? []).filter((p) => p.left?.trim() && p.right?.trim());
      if (pairs.length < 2) return `${at} (nối): cần ít nhất 2 cặp đủ 2 vế`;
      return null;
    }
    case "ordering":
      if (!q.answer?.trim()) return `${at} (sắp xếp): thiếu câu đúng`;
      if (clean(q.tokens).length === 0) return `${at} (sắp xếp): thiếu các mảnh để sắp`;
      return null;
    case "categorize": {
      const cats = clean(q.categories);
      const items = (q.items ?? []).filter((it) => it.text?.trim() && it.category?.trim());
      if (cats.length < 2) return `${at} (phân loại): cần ít nhất 2 nhóm`;
      if (items.length < 2) return `${at} (phân loại): cần ít nhất 2 mục`;
      const bad = items.find((it) => !cats.includes((it.category ?? "").trim()));
      if (bad) return `${at} (phân loại): mục "${bad.text}" gán nhóm không có trong danh sách nhóm`;
      return null;
    }
    case "translate":
      // `question` is the Vietnamese prompt (checked above); `answer` is the English rendering.
      // The content-quality rules (bank-mismatch, vi-has-english…) stay heuristics in the offline
      // audit warns against enforcing them as hard blocks.
      if (!q.answer?.trim()) return `${at} (dịch câu): thiếu câu tiếng Anh làm đáp án`;
      return null;
    default:
      return `${at}: dạng câu không hợp lệ`;
  }
}

/**
 * Lỗi cả bài (tiếng Việt) — [] nếu hợp lệ.
 * Read-aloud and writing exercises have no questions → only their own fields are checked.
 */
export function exerciseIssues(input: {
  skill?: string | null;
  read_aloud?: boolean | null;
  speaking_prompt?: string | null;
  template_id?: string | null;
  passage?: string | null;
  video?: boolean | null;
  media_source?: string | null;
  youtube_id?: string | null;
  audio_url?: string | null;
  video_segments?: { text?: string | null }[] | null;
  questions?: ValidatableQuestion[] | null;
  vocab_deck?: {
    source?: string | null;
    wordIds?: string[] | null;
    activities?: string[] | null;
    filter?: { setId?: string | null } | null;
  } | null;
}): string[] {
  const errs: string[] = [];
  // Bài BỘ THẺ từ vựng (vocab v2): nội dung là các TỪ tham chiếu ngân hàng, KHÔNG có câu hỏi
  // → phải kiểm trước, nếu không sẽ dính "Bài cần ít nhất 1 câu hỏi" và không bao giờ lưu được.
  // Nhận diện theo TEMPLATE (không chỉ theo việc đã có deck) để bài chưa chọn từ báo đúng lỗi.
  if (getBlueprint(input.template_id)?.gradingPipeline === "deck" || input.vocab_deck) {
    const d = input.vocab_deck;
    if (!d) return ["Bộ thẻ chưa có từ nào — chọn nguồn từ trước"];
    if (!d.activities?.length) errs.push("Bộ thẻ cần ít nhất 1 dạng luyện");
    if (d.source === "fixed" && !d.wordIds?.length) errs.push("Bộ thẻ cần ít nhất 1 từ");
    if (d.source === "filter" && !d.filter?.setId) errs.push("Bộ thẻ cần chọn một bộ từ");
    return errs;
  }
  // Bài NGHE & NÓI (theo câu, KHÔNG câu hỏi): nguồn audio HOẶC video → kiểm theo nguồn.
  if (getBlueprint(input.template_id)?.video || input.video) {
    const source = input.media_source ?? (input.youtube_id ? "video" : "audio");
    if (source === "audio") {
      if (!input.audio_url?.trim()) errs.push("Bài Nghe & Nói (audio) cần tạo hoặc tải audio trước khi lưu");
    } else if (!input.youtube_id?.trim()) {
      errs.push("Bài Nghe & Nói (video) cần link YouTube hợp lệ");
    }
    if (!input.video_segments?.some((s) => s.text?.trim())) errs.push("Bài Nghe & Nói cần ít nhất 1 đoạn luyện");
    return errs;
  }
  if (input.read_aloud) {
    if (!input.passage?.trim()) errs.push("Bài đọc to cần có đoạn văn");
    return errs;
  }
  // Writing (plain text graded by the LLM): no questions; speaking_prompt holds the prompt.
  if (input.skill === "writing") {
    if (!input.speaking_prompt?.trim()) errs.push("Bài viết cần có đề viết");
    return errs;
  }
  const qs = input.questions ?? [];
  if (qs.length === 0) {
    errs.push("Bài cần ít nhất 1 câu hỏi");
    return errs;
  }
  qs.forEach((q, i) => {
    const e = questionIssue(q, i);
    if (e) errs.push(e);
  });
  return errs;
}
