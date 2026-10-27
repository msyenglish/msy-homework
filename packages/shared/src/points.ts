// ============================================================
//  ĐIỂM ẢO cho USER CÔNG KHAI (public self-serve).
//  Điểm ảo cho MỌI người học (thưởng VNĐ đã nghỉ hưu): chỉ là con số
//  khích lệ, KHÔNG quy đổi tiền. Mỗi bài tính 1 lần (thành tích cao nhất) →
//  làm lại không cộng thêm, chống spam.
//  API là nguồn sự thật; web chỉ hiển thị con số trả về.
// ============================================================

/** Điểm ảo cho mỗi câu trắc nghiệm đúng. */
export const POINTS_PER_CORRECT = 10;

/** Hệ số điểm khi lượt làm CÓ mở gợi ý (phụ đề / đoạn hội thoại): chỉ được nửa điểm. */
export const HINT_POINTS_FACTOR = 0.5;

/**
 * Điểm 1 lượt quiz: số câu đúng × 10; mở gợi ý → ×0.5. Điểm của BÀI là điểm lượt cao nhất,
 * nên lượt dùng gợi ý không "khóa" điểm — làm lại không gợi ý vẫn ăn đủ.
 */
export function quizPoints(correct: number, hintUsed = false): number {
  const base = Math.max(0, Math.round(correct)) * POINTS_PER_CORRECT;
  return hintUsed ? Math.round(base * HINT_POINTS_FACTOR) : base;
}

/**
 * Điểm "có tính" của một buổi BỘ THẺ TỪ VỰNG — quy về {correct,total} như quiz để cắm chung
 * vào điểm/BXH/analytics. LOẠI dạng `flashcard` (chỉ tự đánh giá ghi nhớ, không phải kiểm tra):
 * chỉ đếm TỪ được kiểm bằng dạng thực (matching, sort, recall, dictation, spelling, listen,
 * pronounce, word_formation). Buổi chỉ có flashcard → total 0 (không điểm).
 * Dữ liệu cũ thiếu `seen` → quy về % đã lưu trên toàn bộ từ (không tách được flashcard).
 */
/**
 * Từ này CÓ được kiểm bằng dạng THỰC không (matching/sort/recall/dictation/spelling/listen/
 * pronounce/word_form)? `flashcard` chỉ là ghi nhớ tạm (tự bấm Got it) → KHÔNG tính điểm, KHÔNG
 * đánh dấu "đã thuộc". Từ chỉ gặp qua flashcard → false.
 */
export function vocabWordGraded(w: import("./types").VocabResultWord): boolean {
  return Array.isArray(w.seen) && w.seen.some((a) => a !== "flashcard");
}

export function vocabGradedScore(result: import("./types").VocabDeckResult): { correct: number; total: number } {
  const words = result?.perWord ?? [];
  const hasSeen = words.some((w) => Array.isArray(w.seen) && w.seen.length > 0);
  if (hasSeen) {
    const graded = words.filter(vocabWordGraded);
    return { correct: graded.filter((w) => w.mastered).length, total: graded.length };
  }
  const total = result?.total ?? words.length;
  return { correct: Math.round(((result?.score ?? 0) / 100) * total), total };
}

// ---- TỪ VỰNG: điểm theo TIẾN BỘ TRÍ NHỚ, không theo số lượt trả lời ----
// Đếm theo lượt trả lời thì cày lại một bộ 20 từ mười lần được điểm gấp mười — nên điểm chỉ rơi
// vào hai chỗ KHÔNG lặp lại được: (1) từ LÊN TẦNG hiểu biết (mỗi tầng thưởng đúng một lần trong
// đời), (2) ôn đúng một từ ĐANG ĐẾN HẠN (ôn xong hạn đẩy về tương lai → không ôn lại ngay được).
// Trần tự nhiên, không cần quota.
/** Thưởng khi từ đạt tầng mới (tầng 1 "đã gặp" = 0 vì chỉ cần lật thẻ là có). */
export const VOCAB_TIER_POINTS: Record<number, number> = { 0: 0, 1: 0, 2: 3, 3: 8, 4: 15 };
/** Ôn đúng một từ đến hạn. */
export const VOCAB_REVIEW_POINTS = 2;

/** Điểm của MỘT từ trong buổi luyện: phần tầng mới vượt qua + thưởng ôn đúng hạn. */
export function vocabMemoryPoints(
  prevTier: number,
  newTier: number,
  opts: { wasDue?: boolean; rating?: number | null } = {},
): number {
  let pts = 0;
  for (let t = Math.max(0, prevTier) + 1; t <= newTier; t++) pts += VOCAB_TIER_POINTS[t] ?? 0;
  if (opts.wasDue && (opts.rating ?? 0) >= 3) pts += VOCAB_REVIEW_POINTS;
  return pts;
}

/** Định dạng điểm: 1250 → "1.250" (không có đơn vị tiền). */
export function formatPoints(v: number): string {
  return Math.round(v).toLocaleString("vi-VN");
}

/**
 * Điểm 1 lượt quiz tính THEO TỪNG CÂU: câu nào mở gợi ý thì chỉ được nửa điểm.
 * `hinted` = "all" khi gợi ý phủ cả bài (phụ đề chạy theo audio của bài nghe).
 */
export function quizPointsFromDetails(
  details: { position: number; correct: boolean; credit?: number }[],
  hinted: number[] | "all",
): number {
  const all = hinted === "all";
  const set = all ? null : new Set(hinted);
  const sum = details.reduce((s, d) => {
    const factor = all || set!.has(d.position) ? HINT_POINTS_FACTOR : 1;
    const credit = typeof d.credit === "number" ? d.credit : d.correct ? 1 : 0;
    return s + Math.max(0, credit) * POINTS_PER_CORRECT * factor;
  }, 0);
  return Math.round(sum);
}

/**
 * Điểm ảo cho 1 lượt RECORD (đọc to/nói) của user công khai — theo điểm CAO NHẤT
 * của bài (thang 0-100 → điểm). Thay chỗ "thưởng VNĐ" của học sinh: cùng cơ chế
 * (chỉ cộng phần tăng khi vượt kỷ lục), chỉ khác tên gọi.
 */
export function recordPoints(bestScore: number): number {
  return Math.max(0, Math.round(bestScore));
}

// ---- NGHE-VIẾT VIDEO: điểm theo LƯỢNG CHỮ PHẢI GÕ ----
// Đếm theo ĐOẠN thì sai cả hai đầu: đoạn "No." (1 từ) bằng điểm đoạn 16 từ, và một bài 276 đoạn
// cho tới 6.600 điểm — gấp 7 lần TỔNG điểm của user cao nhất, biến bài video thành chỗ cày.
// Đếm theo TỪ thì tỉ lệ giữa các mức TỰ SINH RA từ chính bài (Anna: easy 429 từ · hard 1.544),
// không phải hệ số bịa. 0,5 điểm/từ đặt bài video thấp hơn quiz một chút khi quy về mỗi phút —
// video KHÔNG bị gạn giọt nên không được là cách kiếm điểm nhanh nhất.
export const POINTS_PER_TYPED_WORD = 0.5;
/** Hardest gõ cùng số chữ như Hard nhưng vào MỘT ô, không gợi ý, tự bấm chấm → thưởng thêm. */
export const DICTATION_HARDEST_BONUS = 1.25;
/**
 * What ONE hint level on ONE word takes off that word. Hints are per word (the word the caret is in),
 * and the line's factor uses the AVERAGE across its blanks: one hint on one word of ten costs a tenth
 * of what it costs on a single-blank line. Three levels leave a quarter of the word.
 */
export const DICTATION_HINT_STEP = 0.25;
/** Hint levels a single word can be opened to (one letter per press); showing the word costs all of them. */
export const DICTATION_HINT_MAX = 3;
/** Sai rồi sửa lại đúng: 80% so với đúng ngay lần đầu. */
export const DICTATION_RETRY_FACTOR = 0.8;

export type VideoDictLevel = "easy" | "medium" | "hard" | "hardest";
/** Số ô khoét theo mức (99 = khoét cả câu). */
export const VIDEO_DICT_BLANKS: Record<VideoDictLevel, number> = {
  easy: 2,
  medium: 4,
  hard: 99,
  hardest: 99,
};

/** Chuẩn hoá 1 từ để đo độ dài (bỏ dấu câu) — dùng chọn từ khoét. */
const bareWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Chỉ số các TỪ bị khoét của một câu, theo mức. Ưu tiên từ DÀI (từ nội dung), giữ thứ tự câu.
 * Nguồn sự thật DÙNG CHUNG: trang luyện dựng ô trống bằng hàm này, server tính điểm cũng vậy.
 */
export function videoDictBlanks(text: string, level: VideoDictLevel): number[] {
  const w = text.trim().split(/\s+/).filter(Boolean);
  const n = VIDEO_DICT_BLANKS[level] ?? 2;
  if (n >= w.length) return w.map((_, i) => i);
  return w
    .map((word, i) => ({ i, len: bareWord(word).length }))
    .sort((a, b) => b.len - a.len)
    .slice(0, n)
    .map((x) => x.i)
    .sort((a, b) => a - b);
}

export interface DictationCreditRow {
  first_ok?: boolean;
  revealed?: boolean;
  /** Hint levels opened across the line, SUMMED over its words (ceiling: `dictationHintCap`). */
  hints?: number;
  done?: boolean;
  level?: string | null;
}

/**
 * Quality factor of one line (0..1): revealed line = 0, fixed after a wrong try = 0.8, and every hint
 * level costs `DICTATION_HINT_STEP` of the word it opened, averaged over the line's `blanks`.
 */
export function dictationSegmentCredit(r: DictationCreditRow, blanks = 1): number {
  if (!r.done || r.revealed) return 0;
  const base = r.first_ok ? 1 : DICTATION_RETRY_FACTOR;
  const perWord = Math.max(0, r.hints ?? 0) / Math.max(1, blanks);
  const hint = Math.max(0, 1 - DICTATION_HINT_STEP * perWord);
  return base * hint;
}

/** Most hint levels one line can record at a rung: every blank opened all the way. */
export function dictationHintCap(text: string, level: VideoDictLevel): number {
  return DICTATION_HINT_MAX * Math.max(1, videoDictBlanks(text, level).length);
}

/** Badge for a finished, unrevealed line from its summed hint levels: none · one · more. */
export function dictationHintGrade(hints: number): "exactly" | "good" | "fair" {
  return hints <= 0 ? "exactly" : hints === 1 ? "good" : "fair";
}

/** Điểm TỐI ĐA của một câu ở một mức (chưa trừ gợi ý/số lần thử). */
export function dictationSegmentMax(text: string, level: VideoDictLevel): number {
  const words = videoDictBlanks(text, level).length;
  return words * POINTS_PER_TYPED_WORD * (level === "hardest" ? DICTATION_HARDEST_BONUS : 1);
}

/** Điểm tối đa của CẢ BÀI ở một mức — để hiện trước cho học sinh khi chọn độ khó. */
export function dictationLessonMax(texts: string[], level: VideoDictLevel): number {
  return Math.round(texts.reduce((s, t) => s + dictationSegmentMax(t, level), 0));
}

/**
 * Điểm ảo của cả bài nghe-viết. Mức khó áp THEO TỪNG CÂU (mức mà câu đó được làm xong) — làm lại
 * một câu ở mức khó hơn thì câu đó ăn thêm, không phải cày lại cả bài.
 */
export function dictationPoints(
  rows: DictationCreditRow[],
  textOf: (row: DictationCreditRow, i: number) => string,
): number {
  const sum = rows.reduce((s, r, i) => {
    const lv = (r.level ?? "medium") as VideoDictLevel;
    if (!VIDEO_DICT_BLANKS[lv]) return s;
    const text = textOf(r, i);
    return s + dictationSegmentCredit(r, videoDictBlanks(text, lv).length) * dictationSegmentMax(text, lv);
  }, 0);
  return Math.round(sum);
}

// ---- SHADOWING VIDEO: cũng tính theo LƯỢNG CHỮ, không theo điểm trung bình ----
// Cách cũ lấy TRUNG BÌNH điểm phát âm các đoạn đã luyện (thang 0-100) → nói 1 đoạn được 95 điểm,
// nói 221 đoạn trung bình 80 chỉ được 80: LÀM NHIỀU HƠN LẠI ÍT ĐIỂM HƠN. Nay cộng dồn từng đoạn.
// Nói rẻ hơn gõ (nhanh hơn, và mỗi đoạn tốn một lượt Azure có quota) nên hệ số thấp hơn 0,5.
export const POINTS_PER_SPOKEN_WORD = 0.35;

// "Weak pronunciation" threshold on Azure's 0-100 scale. Same cutoff as the read-aloud score
// palette (>=80 is green). Without it, listing the 5 lowest lines always yields "weak lines"
// even when the worst one already scored 86.
export const WEAK_PRON_SCORE = 80;

/** Điểm 1 đoạn shadowing: số từ × 0,35 × (điểm phát âm ÷ 100). */
export function shadowSegmentPoints(text: string, score: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words * POINTS_PER_SPOKEN_WORD * Math.max(0, Math.min(100, score)) / 100;
}

/** Điểm shadowing cả bài — cộng dồn các đoạn ĐÃ nói. */
export function shadowPoints(rows: { segment: number; score: number }[], textOf: (segment: number) => string): number {
  return Math.round(rows.reduce((s, r) => s + shadowSegmentPoints(textOf(r.segment), r.score), 0));
}

/**
 * Khoá GỘP ĐIỂM của một lượt nộp. Mọi nơi tính điểm đều dedupe "tốt nhất theo bài" — nhưng bài
 * video có HAI hoạt động khác hẳn nhau trên cùng một bài (gõ lại và nói lại), nên chúng phải là
 * hai khoá riêng, không thì làm cả hai chỉ được tính cái lớn hơn.
 */
export const pointScopeKey = (exerciseId: string, audioKey?: string | null): string =>
  audioKey?.startsWith("video:") ? `${exerciseId}:shadow` : exerciseId;

/** Điểm tối đa của cả bài nếu nói hết, phát âm hoàn hảo — để hiện trước cho học sinh. */
export function shadowLessonMax(texts: string[]): number {
  return Math.round(texts.reduce((s, t) => s + shadowSegmentPoints(t, 100), 0));
}

// ---- Gạn giọt "lộ trình" cho user công khai ----
/** Số bài MỚI mở mỗi ngày khi CHƯA làm gì (hạn mức nền) — 9 để lưới 3 cột không lẻ hàng. */
export const DAILY_UNLOCK = 9;
/** Trần bài ĐÃ MỞ nhưng CHƯA làm (≈ 1,5 ngày dồn). */
export const ROLLOVER_UNDONE = 15;
/** Trần CỨNG số bài mở/ngày kể cả khi kiếm lại được quota (chống cày & chống crawl). */
export const DAILY_UNLOCK_MAX = 25;
/**
 * How a level path opens exercises. "rolling": OPEN_SLOTS unfinished exercises stay open and
 * finishing one opens the next at once (no daily wall). "daily": the daily-quota engine above
 * (DAILY_UNLOCK + earned, capped by DAILY_UNLOCK_MAX and ROLLOVER_UNDONE) — kept, switched off.
 */
export const UNLOCK_MODE: "rolling" | "daily" = "rolling";
/** Rolling mode: unfinished exercises open at once — 9 so a 3-column grid fills evenly. */
export const OPEN_SLOTS = 9;
/** Làm ĐẠT bài mới (lần đầu, %) thì hoàn lại 1 suất mở trong ngày. */
export const UNLOCK_PASS_PCT = 50;

// ---- XP levels: derived from total points (never stored; `points` is best-per-exercise).
// Threshold to REACH level L = BASE·(L−1)²·(1 + (L−1)/STRETCH): quadratic early, cubic in the tail.
// Points only ever grow (max per exercise) → a level is NEVER lost.
//
// The tail matters because the point economy is no longer quiz-only: the word bank alone is worth
// ~800k points (30k words × 26 per memory tier), video lessons pay per typed/spoken word, and the
// review bonuses (VOCAB_REVIEW_POINTS, GRAMMAR_REVIEW_POINTS) regenerate on the FSRS schedule, so
// total points have no ceiling. A purely quadratic curve turned the whole content bank into ~Lv 112.
// Calibrated so ~300 pts/day (a solid daily habit) lands on Lv 10 in ~2 months and Lv 20 in ~1 year,
// and clearing every exercise, word and drill in the bank tops out near Lv 48.
// Change the difficulty with LEVEL_BASE (higher = harder) or LEVEL_STRETCH (lower = harsher tail).
export const LEVEL_BASE = 100;
/** Larger = the cubic tail kicks in later, so high levels stay cheaper. */
export const LEVEL_STRETCH = 10;
/** Levels above this are not reachable from the whole content bank — bounds the lookup loop. */
const LEVEL_MAX = 200;

/** Total points needed to REACH `level` (Lv 1 = 0). */
export function levelThreshold(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return Math.round(LEVEL_BASE * n * n * (1 + n / LEVEL_STRETCH));
}

export interface XpLevel {
  level: number; // current level (>=1)
  floor: number; // total points at the start of this level
  next: number; // total points needed for the next level
  into: number; // points earned INSIDE the current level
  span: number; // points the whole current level is worth
  progress: number; // 0..1 towards the next level
}

/**
 * Total points → XP level. The cubic threshold has no clean closed-form inverse, so it walks the
 * levels instead: bounded by LEVEL_MAX, cheaper than a square root, and free of float drift right
 * at a threshold (the old sqrt form could land one point short of the level it defined).
 */
export function pointsToLevel(points: number): XpLevel {
  const p = Math.max(0, Math.floor(points || 0));
  let level = 1;
  while (level < LEVEL_MAX && levelThreshold(level + 1) <= p) level += 1;
  const floor = levelThreshold(level);
  const next = levelThreshold(level + 1);
  const span = next - floor;
  const into = p - floor;
  return { level, floor, next, into, span, progress: span > 0 ? into / span : 0 };
}
