import type { QuestionType } from "@msyen/shared";
import { t, type TKey } from "../i18n";

// Lớp WEB của registry dạng câu hỏi (nguồn dữ liệu ở @msyen/shared · questionTypes.ts).
// Gộp màu badge + hướng dẫn cách làm — sửa 1 chỗ, đồng bộ mọi trang.
// Re-export nhãn để web import nhãn + màu + hướng dẫn từ CÙNG một chỗ.
export { QTYPE_LABEL, questionTypeLabel } from "@msyen/shared";

// Tông màu ô số thứ tự (thumb) theo từng dạng câu hỏi — để nhìn lướt nhận ra
// loại bài. Tránh emerald/amber (màu trạng thái chấm).
export const QTYPE_THUMB: Record<QuestionType, string> = {
  multiple_choice: "bg-cyan-100 text-cyan-700 ring-cyan-200/70 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25",
  fill_blank: "bg-violet-100 text-violet-700 ring-violet-200/70 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25",
  matching: "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200/70 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-fuchsia-500/25",
  ordering: "bg-sky-100 text-sky-700 ring-sky-200/70 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  categorize: "bg-teal-100 text-teal-700 ring-teal-200/70 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/25",
  translate: "bg-indigo-100 text-indigo-700 ring-indigo-200/70 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/25",
};

// Hướng dẫn CÁCH LÀM (tiếng Việt, cố định theo dạng) — dòng phụ nhỏ dưới đề.
// KHÔNG phải dịch câu; chỉ mô tả thao tác cần làm. Điền từ tính riêng (kèm kho
// từ) trong component vì text động theo dữ liệu.
const QTYPE_HOWTO_KEYS: Partial<Record<QuestionType, TKey>> = {
  multiple_choice: "lib.questionType.multipleChoice",
  matching: "lib.questionType.matching",
  ordering: "lib.questionType.ordering",
  categorize: "lib.questionType.categorize",
  translate: "lib.questionType.translate",
};

export const QTYPE_HOWTO: Partial<Record<QuestionType, string>> = new Proxy({}, {
  get: (_target, key: string) => {
    const translationKey = QTYPE_HOWTO_KEYS[key as QuestionType];
    return translationKey ? t(translationKey) : undefined;
  },
});
