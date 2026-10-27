// ============================================================
//  Registry DẠNG CÂU HỎI (question type) dùng chung web + api.
//  Nguồn sự thật duy nhất về NHÃN tiếng Việt của từng dạng câu hỏi —
//  sửa 1 chỗ, đồng bộ mọi trang (analytics, editor, thẻ luyện tập…).
//  Framework-agnostic (không phụ thuộc React) — lớp web (màu, hướng dẫn)
//  đặt riêng ở apps/web/src/lib/questionTypes.tsx.
// ============================================================
import { type QuestionType } from "./types";

// Nhãn CHUẨN HÓA duy nhất cho từng dạng câu hỏi.
export const QTYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: "Trắc nghiệm",
  fill_blank: "Điền từ",
  matching: "Nối",
  ordering: "Sắp xếp",
  categorize: "Phân loại",
  translate: "Dịch câu",
};

// Nhãn TIẾNG ANH — dùng ở giao diện soạn bài (đồng bộ với nhãn kỹ năng tiếng Anh).
export const QTYPE_LABEL_EN: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  fill_blank: "Gap fill",
  matching: "Matching",
  ordering: "Ordering",
  categorize: "Categorize",
  translate: "Translate",
};

/** Nhãn tiếng Việt của một dạng câu hỏi; nếu lạ (không có trong registry) trả lại chính `t`. */
export function questionTypeLabel(t: string): string {
  return QTYPE_LABEL[t as QuestionType] ?? t;
}
