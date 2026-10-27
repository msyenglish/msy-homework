// ============================================================
//  Tiện ích XỬ LÝ TỪ VỰNG — dùng chung web + api.
//  Từ trong wordlist thường kèm nhãn từ loại / ghi chú trong ngoặc:
//    "art gallery (n)", "bike rack (np)", "breath-taking (adj)", "(be) on my own".
//  Khi ĐỌC (TTS), CHẤM PHÁT ÂM và LUYỆN GÕ phải bỏ phần ngoặc — nếu không Azure sẽ
//  chấm cả "np", máy đọc "mở ngoặc n", và học sinh phải gõ cả "(n)".
// ============================================================

/** Bỏ MỌI cụm trong ngoặc + gộp khoảng trắng. "art gallery (n)"→"art gallery"; "(be) on my own"→"on my own". */
export function stripWordTag(raw: string): string {
  return (raw ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

/** Nhãn từ loại ở CUỐI (nếu có) để hiển thị chip nhỏ. "art gallery (n)"→"n"; "on my own"→"". */
export function wordTag(raw: string): string {
  const m = (raw ?? "").match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : "";
}

/** Chuẩn hóa để SO KHỚP khi luyện gõ: bỏ ngoặc + thường hóa + gộp khoảng trắng. */
export function normalizeWordForCompare(raw: string): string {
  return stripWordTag(raw).toLowerCase();
}

// ============================================================
//  PRONUNCIATION SCORE BANDS — the one scale for a word's best pronunciation score.
//  Thresholds match the drill screen that produces the number (components/practice/vocab/
//  Pronounce.tsx): >= 80 green, 60..79 amber, below 60 red. Filters and badges must read
//  from here so a "green" word means the same thing everywhere.
// ============================================================

/** "none" = never read aloud, so it has no score at all — not the same as a low score. */
export type PronBand = "none" | "low" | "mid" | "high";

export const PRON_BAND_MIN = { mid: 60, high: 80 } as const;

/** Band of a best-score value; null/undefined (never practised) maps to "none". */
export function pronBand(score?: number | null): PronBand {
  if (score == null) return "none";
  if (score >= PRON_BAND_MIN.high) return "high";
  if (score >= PRON_BAND_MIN.mid) return "mid";
  return "low";
}

export const PRON_BAND_LABEL: Record<PronBand, string> = {
  none: "Chưa đọc",
  low: `Dưới ${PRON_BAND_MIN.mid}`,
  mid: `${PRON_BAND_MIN.mid}–${PRON_BAND_MIN.high - 1}`,
  high: `${PRON_BAND_MIN.high}+`,
};

/** English labels — the public user pages are in English. */
export const PRON_BAND_LABEL_EN: Record<PronBand, string> = {
  none: "Not read yet",
  low: `Below ${PRON_BAND_MIN.mid}`,
  mid: `${PRON_BAND_MIN.mid}–${PRON_BAND_MIN.high - 1}`,
  high: `${PRON_BAND_MIN.high} and up`,
};
