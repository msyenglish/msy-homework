import type { PublicQuestion, TranslateLevel } from "@msyen/shared";

// Hợp đồng CHUNG cho mọi component input theo loại câu hỏi.
// Mỗi input tự quản UI + thao tác; giao tiếp ra ngoài chỉ qua value (đã mã hoá) + onChange.
export interface QuestionInputProps {
  q: PublicQuestion;
  /** Giá trị đáp án ĐÃ MÃ HOÁ (xem lib/practiceAnswers). "" = chưa trả lời. */
  value: string;
  /** Cập nhật giá trị đã mã hoá (đúng encoding để server chấm). */
  onChange: (v: string) => void;
  /** Đã nộp & chấm xong → khoá tương tác, hiện đúng/sai. */
  graded: boolean;
  /** Đáp án đúng ở dạng text (chỉ có sau khi chấm) — để hiển thị khi chữa. */
  correctAnswer?: string | null;
  /** true = mobile (bấm-chọn) · false = desktop (kéo-thả @dnd-kit). */
  isMobile: boolean;
  /** Force a single column (used in "one question at a time" mode — the card is wide, so options stack). */
  oneCol?: boolean;
  /** Scaffolding rung for `translate` questions; set per exercise. Defaults to "easy". */
  translateLevel?: TranslateLevel;
}
