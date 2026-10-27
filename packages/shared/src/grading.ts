// ============================================================
//  LOGIC CHẤM ĐIỂM DÙNG CHUNG (web xem trước + api chấm thật).
//  api là nguồn sự thật; web chỉ dùng để hiển thị/ước lượng.
// ============================================================
import type { AnswerMap, CategorizeItem, GradeResult, MatchPair, Question, QuestionType } from "./types";

/** Default target word count for writing exercises whose prompt doesn't state one. */
export const DEFAULT_WRITING_TARGET_WORDS = 150;

/** Target word count parsed from a writing prompt (e.g. "at least 250 words"); falls back to the default. */
export function targetWordsOf(prompt: string | null | undefined): number {
  const m = (prompt ?? "").match(/at least (\d+) words/i);
  return m ? parseInt(m[1], 10) : DEFAULT_WRITING_TARGET_WORDS;
}

/** Parse an toàn map { key: value } từ chuỗi đáp án JSON của matching/categorize. */
function parseAnswerMap(answer: string | undefined): Record<string, string> {
  if (!answer) return {};
  try {
    const o = JSON.parse(answer);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Chuẩn hóa đáp án điền từ:
 *  - bỏ khoảng trắng thừa, viết thường
 *  - đồng nhất dấu nháy cong (') và thẳng (')
 */
export function normalize(str: string | null | undefined): string {
  return (str || "")
    .trim()
    .toLowerCase()
    .replace(/[‘’′'`]/g, "'")
    .replace(/\s+/g, " ");
}

// Bỏ dấu câu (giữ dấu nháy trong "don't" và gạch nối trong "well-known") + gộp khoảng trắng.
// Dùng cho điền từ/CHÉP CHÍNH TẢ: học sinh gõ "Yes please" cho "Yes, please." không nên bị sai.
/**
 * Collapse dotted abbreviations to one token BEFORE punctuation is stripped. Otherwise "8 a.m."
 * becomes "8 a m", which can never equal what a learner types ("8 am") — the answer was
 * unreachable, not merely strict.
 */
const collapseAbbrev = (s: string) => s.replace(/\b([a-z])\.([a-z])\.?/gi, "$1$2");

export const stripPunct = (s: string) =>
  collapseAbbrev(s)
    // Em/en dash and the bullet separator go too — none of them can be part of an English word, and
    // an answer that joins two sentences ("Where do you live?" — "In Chicago.") was unanswerable:
    // the learner had to reproduce the exact dash character. The plain HYPHEN stays, because it IS
    // part of words like "well-known".
    .replace(/[.,!?;:"“”…—–·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function isFillCorrect(userInput: string | null | undefined, acceptList: string[] = []): boolean {
  const u = normalize(userInput);
  if (!u) return false;
  const uP = stripPunct(u);
  return acceptList.some((a) => {
    const n = normalize(a);
    return n === u || stripPunct(n) === uP;
  });
}

/** Strip the English articles, for a comparison that ignores determiner choice. */
const stripArticles = (s: string) => s.replace(/\b(a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();

/**
 * Same as `isFillCorrect`, but a difference of ONLY a/an/the is forgiven. Vietnamese marks neither
 * definiteness nor genericity, so a prompt like "Mấy con bò đang ăn cỏ" is answered just as well by
 * "The cows are eating grass" as by "...the grass". Callers must NOT use this where the article is
 * what the item tests — see `grammar_translate_items.article_lenient`.
 */
export function isFillCorrectIgnoringArticles(userInput: string | null | undefined, acceptList: string[] = []): boolean {
  if (isFillCorrect(userInput, acceptList)) return true;
  const u = stripArticles(stripPunct(normalize(userInput)));
  if (!u) return false;
  return acceptList.some((a) => stripArticles(stripPunct(normalize(a))) === u);
}

/**
 * The exact key both sides hash for the LIVE feedback in the translation drill. The client can then
 * tell the learner "correct" as they type without ever receiving the English sentence — only its
 * hash, the same trick the dictation drill uses per word.
 */
export const translateAnswerKey = (s: string | null | undefined) => stripPunct(normalize(s));
/** Same key with the articles removed, for items where a/an/the is not what is being tested. */
export const translateAnswerKeyNoArticles = (s: string | null | undefined) => stripArticles(translateAnswerKey(s));

/**
 * Same key with apostrophes dropped, so "doesnt" grades as "doesn't" and "im" as "I'm".
 *
 * The video dictation drill has always worked this way (`nak()` there): it auto-inserts the
 * apostrophe into the typing frame and compares without it. The translation drill demanded the exact
 * character, so the same learner typing the same word was right in one drill and wrong in the other.
 *
 */
export const translateAnswerKeyLoose = (s: string | null | undefined) =>
  translateAnswerKey(s).replace(/'/g, "");

/**
 * Contractions spelled out, so "I'll stay" grades the same as "I will stay" without the answer key
 * listing every combination ("If they don't…, they won't…" alone has four). Only unambiguous forms:
 * `'d` (had/would) and a noun's `'s` (possessive) are left alone; a pronoun's `'s` reads as "is".
 * Apostrophe-less spellings are expanded only for the n't family and "im", where no real word clashes.
 */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon'?t\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\bcan'?t\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\b(do|does|did|is|are|was|were|could|would|should|have|has|had|must|need)n'?t\b/g, "$1 not"],
  [/\bi'?m\b/g, "i am"],
  [/'re\b/g, " are"],
  [/'ll\b/g, " will"],
  [/'ve\b/g, " have"],
  [/\b(he|she|it|that|there|what|who|where|here|how)'s\b/g, "$1 is"],
];

/** `translateAnswerKey` with contractions spelled out and the remaining apostrophes dropped. */
export const translateAnswerKeyExpanded = (s: string | null | undefined) =>
  CONTRACTIONS.reduce((acc, [re, to]) => acc.replace(re, to), translateAnswerKey(s))
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
/** Expanded key with the articles removed, for items where a/an/the is not what is being tested. */
export const translateAnswerKeyExpandedNoArticles = (s: string | null | undefined) => stripArticles(translateAnswerKeyExpanded(s));

interface GradableQuestion {
  position: number;
  type: QuestionType;
  answer?: string | null; // mc: đáp án · ordering: câu đúng
  accept?: string[] | null; // fill_blank · ordering: alternative word orders
  pairs?: MatchPair[] | null; // matching
  items?: CategorizeItem[] | null; // categorize
  article_lenient?: boolean | null; // translate — forgive an a/an/the-only difference
}

/**
 * The exact rule the standalone translation drill grades by (`applyTranslateSession`), lifted here so
 * a `translate` question inside an exercise and the same sentence inside the drill can never disagree.
 * Binary: partial credit would reward a word-salad overlap.
 */
export function isTranslateCorrect(
  userInput: string | null | undefined,
  acceptList: string[],
  articleLenient: boolean,
): boolean {
  if (articleLenient ? isFillCorrectIgnoringArticles(userInput, acceptList) : isFillCorrect(userInput, acceptList)) {
    return true;
  }
  const loose = translateAnswerKeyLoose(userInput);
  if (loose && acceptList.some((a) => translateAnswerKeyLoose(a) === loose)) return true;
  const key = articleLenient ? translateAnswerKeyExpandedNoArticles : translateAnswerKeyExpanded;
  const u = key(userInput);
  return !!u && acceptList.some((a) => key(a) === u);
}

/**
 * ĐIỂM PHẦN của một câu, 0..1. MC / fill_blank / ordering là nhị phân (0 hoặc 1);
 * matching & categorize chấm TỪNG PHẦN (tỉ lệ cặp/mục đúng). Dùng chung chuẩn hoá
 * `normalize` cho mọi so khớp text (đồng nhất — trước đây categorize dùng `===` thô).
 */
export function creditForAnswer(q: GradableQuestion, answer: string | undefined): number {
  switch (q.type) {
    case "multiple_choice":
      // Chuẩn hoá như các dạng khác: tránh chấm sai chỉ vì lệch hoa/thường/khoảng trắng
      // giữa đáp án lưu và chuỗi lựa chọn gửi đi (chấm theo giá trị, không theo vị trí).
      return answer != null && normalize(answer) === normalize(q.answer) ? 1 : 0;
    case "fill_blank":
      return isFillCorrect(answer, q.accept ?? []) ? 1 : 0;
    case "ordering":
      // Student answer = the assembled sentence. `accept` holds alternative word orders that are
      // equally grammatical (e.g. a frontable adverbial), so a valid rearrangement is not marked
      // wrong just because it is not the canonical one.
      if (!answer) return 0;
      if (normalize(answer) === normalize(q.answer)) return 1;
      return isFillCorrect(answer, q.accept ?? []) ? 1 : 0;
    case "matching": {
      const map = parseAnswerMap(answer);
      const pairs = q.pairs ?? [];
      if (pairs.length === 0) return 0;
      const ok = pairs.filter((p) => normalize(map[p.left]) === normalize(p.right)).length;
      return ok / pairs.length;
    }
    case "categorize": {
      const map = parseAnswerMap(answer);
      const items = q.items ?? [];
      if (items.length === 0) return 0;
      const ok = items.filter((it) => normalize(map[it.text]) === normalize(it.category)).length;
      return ok / items.length;
    }
    case "translate":
      // `answer` is the canonical English; `accept` holds the equally valid renderings.
      return isTranslateCorrect(answer, acceptedTranslations(q), q.article_lenient !== false) ? 1 : 0;
    default:
      return 0;
  }
}

/** The canonical English plus every alternative rendering, for a `translate` question. */
function acceptedTranslations(q: GradableQuestion): string[] {
  return [q.answer ?? "", ...(q.accept ?? [])].filter((s) => s.trim().length > 0);
}

/** Đúng HOÀN TOÀN (điểm phần = 1). Giữ cho các nơi cần boolean. */
export function isAnswerCorrect(q: GradableQuestion, answer: string | undefined): boolean {
  return creditForAnswer(q, answer) >= 1;
}

/** Chuỗi hiển thị "đáp án đúng" khi chữa bài (mọi dạng). */
export function correctAnswerText(q: GradableQuestion): string {
  switch (q.type) {
    case "multiple_choice":
    case "ordering":
    case "translate":
      return q.answer ?? "";
    case "fill_blank":
      return q.accept?.[0] ?? "";
    case "matching":
      return (q.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join(", ");
    case "categorize":
      return (q.items ?? []).map((it) => `${it.text} → ${it.category}`).join(", ");
    default:
      return "";
  }
}

/** Chuỗi hiển thị bài làm của học sinh (đọc được) khi chữa bài. */
export function studentAnswerText(q: GradableQuestion, raw: string | undefined): string {
  if (!raw) return "";
  if (q.type === "matching") {
    const map = parseAnswerMap(raw);
    return (q.pairs ?? []).map((p) => `${p.left} → ${map[p.left] ?? "?"}`).join(", ");
  }
  if (q.type === "categorize") {
    const map = parseAnswerMap(raw);
    return (q.items ?? []).map((it) => `${it.text} → ${map[it.text] ?? "?"}`).join(", ");
  }
  return raw;
}

/** Chấm cả bài. `answers` là map { [position]: value }. */
export function gradeSubmission(
  questions: GradableQuestion[],
  answers: AnswerMap,
): GradeResult {
  const details = questions.map((q) => {
    const credit = creditForAnswer(q, answers[q.position]);
    return {
      position: q.position,
      type: q.type,
      correct: credit >= 1,
      credit: Math.round(credit * 100) / 100, // 2 chữ số cho hiển thị "đúng x/y"
    };
  });
  // Điểm = TỔNG điểm phần (làm tròn 1 chữ số) — matching/categorize góp điểm lẻ.
  const score = Math.round(details.reduce((s, d) => s + d.credit, 0) * 10) / 10;
  return { score, total: questions.length, details };
}

/** Loại bỏ MỌI trường mang đáp án khỏi câu hỏi (matching/categorize/ordering có đáp án nhúng).
 *  Lưu ý: payload công khai thật do API `serialize.publicQuestion` dựng (có xáo trộn). */
export function toPublicQuestion<T extends Question>(q: T) {
  const { answer: _a, accept: _c, pairs: _p, items: _i, ...rest } = q;
  return rest;
}
