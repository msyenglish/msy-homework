// Dựng payload DICTATION công khai cho học sinh. ĐỘ KHÓ (easy/medium/hard) do học sinh chọn LÚC
// LUYỆN, không phải lúc soạn → payload gửi ĐỦ dữ liệu cho cả 3 mức, đổi mức tức thì trên client.
// Bảo mật: chỉ 3 từ KHÓ NHẤT mỗi câu (bị khoét ở mức easy) là KHÔNG kèm `text`; các từ còn lại có
// `text` để hiện sẵn. Lên medium/hard client chỉ ẨN thêm text sẵn có (khoét lồng nhau). Mỗi từ luôn
// có hash để client tự chấm tại chỗ; ĐIỂM THẬT do server chấm khi nộp (đáp án đầy đủ không rời server).
import type { AudioCues, DictationSentence, DictationWord, PublicDictation } from "@msyen/shared";
import { DICTATION_BLANKS, normalize, stripPunct } from "@msyen/shared";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Khoá so khớp = chuẩn hoá + bỏ dấu câu → KHỚP nhánh lenient của isFillCorrect (server chấm).
const answerKey = (s: string) => stripPunct(normalize(s));
const hashWord = (w: string) => sha256Hex(answerKey(w));

// Đếm ký tự CHỮ/SỐ trong 1 từ (bỏ dấu câu); chữ cái đầu cho gợi ý.
const letters = (w: string) => (w.match(/[\p{L}\p{N}]/gu) ?? []).length;
const firstLetter = (w: string) => (w.match(/[\p{L}\p{N}]/u)?.[0] ?? "").toLowerCase();
const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean);

// Tách transcript thành câu [s,e) theo dấu kết câu (. ! ? …) — dùng để lấy mốc giờ từng câu.
function splitSentenceRanges(text: string): { s: number; e: number }[] {
  const out: { s: number; e: number }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[.!?…]/.test(text[i])) {
      let e = i + 1;
      while (e < text.length && /["”'’)\]]/.test(text[e])) e++; // nuốt dấu đóng theo sau
      const seg = text.slice(start, e).trim();
      if (seg) out.push({ s: start, e });
      while (e < text.length && /\s/.test(text[e])) e++; // bỏ khoảng trắng tới câu sau
      start = e;
      i = e - 1;
    }
  }
  if (start < text.length && text.slice(start).trim()) out.push({ s: start, e: text.length });
  return out;
}

// Mốc [start,end] (giây) của các TỪ nằm trong khoảng ký tự [s,e) của cues.
function timeRange(cues: AudioCues, s: number, e: number): { start: number; end: number } | null {
  const inRange = cues.words.filter((w) => w.s >= s && w.e <= e);
  if (!inRange.length) return null;
  const start = inRange[0].t;
  const last = inRange[inRange.length - 1];
  return { start, end: last.t + last.d };
}

/**
 * Dựng PublicDictation từ câu hỏi (accept = câu đầy đủ, theo thứ tự) + cues (mốc audio).
 * Mỗi câu: danh sách từ; 3 từ khó nhất (khoét ở easy) không kèm `text`, còn lại có `text` để hiện sẵn.
 * Không có câu hỏi → null (không phải bài dictation hợp lệ).
 */
export async function buildPublicDictation(
  cues: AudioCues | null,
  questions: { accept?: string[] | null; answer?: string | null }[],
): Promise<PublicDictation | null> {
  const answers = questions.map((q) => (q.accept?.[0] ?? q.answer ?? "").trim()).filter(Boolean);
  if (!answers.length) return null;

  // Mốc giờ từng câu: chỉ khi số câu trong cues khớp số câu hỏi (audio sinh từ chính các câu này).
  const ranges = cues ? splitSentenceRanges(cues.text) : [];
  const aligned = cues && ranges.length === answers.length ? ranges : null;

  const sentences: DictationSentence[] = [];
  for (let i = 0; i < answers.length; i++) {
    const ws = wordsOf(answers[i]);
    // Xếp hạng từ có chữ theo độ dài giảm dần (đồng hạng → vị trí trước) → 3 từ đầu là "khó nhất".
    const ranked = ws
      .map((w, j) => ({ j, len: letters(w) }))
      .filter((x) => x.len > 0)
      .sort((a, b) => b.len - a.len || a.j - b.j);
    const easyBlank = new Set(ranked.slice(0, DICTATION_BLANKS.easy).map((x) => x.j));

    const words: DictationWord[] = [];
    for (let j = 0; j < ws.length; j++) {
      const w = ws[j];
      const word: DictationWord = { mask: letters(w), initial: firstLetter(w), hash: await hashWord(w) };
      if (!easyBlank.has(j)) word.text = w; // từ khó nhất: giấu text (khoét từ mức easy)
      words.push(word);
    }

    const tr = aligned && cues ? timeRange(cues, aligned[i].s, aligned[i].e) : null;
    sentences.push({ audioStart: tr?.start ?? 0, audioEnd: tr?.end ?? 0, words });
  }
  return { sentences };
}

/**
 * Trường công khai cho payload học sinh: bài DICTATION → ẩn cues (chứa đáp án), thêm `dictation`;
 * bài khác → giữ nguyên cues, không có `dictation`. Dùng chung ở mọi route serve đề công khai.
 */
export async function dictationPublicFields(
  ex: { templateId?: string | null; audioCues?: AudioCues | null },
  qs: { accept?: string[] | null; answer?: string | null }[],
): Promise<{ audio_cues: AudioCues | null; dictation: PublicDictation | null }> {
  if (ex.templateId !== "dictation") return { audio_cues: ex.audioCues ?? null, dictation: null };
  const dictation = await buildPublicDictation(ex.audioCues ?? null, qs);
  return { audio_cues: null, dictation }; // cues KHÔNG gửi (transcript = đáp án)
}
