// Tiện ích dùng chung cho band CEFR (màu sắc, nhãn) — tránh chép lặp giữa các trang.
import type { Cefr } from "@msyen/shared";

// Màu theo band CEFR (đồng bộ tinh thần ladder levels).
export const BAND_COLOR: Record<Cefr, string> = {
  "Pre-A1": "#10b981",
  A1: "#22c55e",
  A2: "#06b6d4",
  B1: "#f59e0b",
  B2: "#f97316",
  C1: "#f43f5e",
  C2: "#8b5cf6",
};

/**
 * Bóc mã CEFR khỏi một nhãn tự do: "A1 Movers" → "A1", "Pre-A1 Starters" → "PRE-A1", "3000" → "".
 * Tên cấp trong DB (levels.name) không phải mã thuần nên chỗ nào cần so sánh cấp phải đi qua đây.
 */
export function cefrFromLabel(label?: string | null): string {
  const m = (label ?? "").trim().match(/^(pre[\s-]?a1|a1|a2|b1|b2|c1|c2)\b/i);
  if (!m) return "";
  // Must return the CANONICAL spelling from CEFR_BANDS ("Pre-A1"), not an upper-cased one:
  // callers compare it against `grammar.cefr` and use it as a <Select> value, so "PRE-A1"
  // silently matched nothing and left the picker showing a value none of its options had.
  const key = m[1].toUpperCase().replace(/\s/, "-");
  return key === "PRE-A1" ? "Pre-A1" : key;
}

// Nhãn tiếng Việt cho loại câu ví dụ ngữ pháp.
export const KIND_LABEL: Record<string, string> = { aff: "Affirmative", neg: "Negative", ques: "Question" };

// Mỗi loại câu một màu để liếc là phân biệt được khẳng định / phủ định / nghi vấn.
export const KIND_TONE: Record<string, string> = {
  aff: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  neg: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  ques: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

// Icon + màu cho từng NHÓM ngữ pháp (khớp category trong DB). Nhóm lạ → mặc định.
export const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  // i18n-ignore-start: grammar category names are DB data values
  "Thì động từ": { icon: "Clock", color: "#06b6d4" },
  "Câu & Cấu trúc": { icon: "Blocks", color: "#8b5cf6" },
  "Mệnh đề": { icon: "GitBranch", color: "#f59e0b" },
  "Động từ khuyết thiếu": { icon: "KeyRound", color: "#ec4899" },
  "Tính từ & Trạng từ": { icon: "Palette", color: "#10b981" },
  "Liên từ & Diễn ngôn": { icon: "Link2", color: "#0ea5e9" },
  "Danh từ & Mạo từ": { icon: "Box", color: "#f97316" },
  "Đại từ & Sở hữu": { icon: "Users", color: "#14b8a6" },
  "Giới từ": { icon: "MapPin", color: "#a855f7" },
  "Cụm động từ": { icon: "Combine", color: "#ef4444" },
  "Câu bị động": { icon: "ArrowLeftRight", color: "#6366f1" },
  "Cấu tạo từ": { icon: "Puzzle", color: "#84cc16" },
  // i18n-ignore-end
};
