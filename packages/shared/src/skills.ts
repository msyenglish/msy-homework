import { SKILLS, type Skill } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// NGUỒN SỰ THẬT DUY NHẤT cho MỌI kỹ năng (skill).
// Trước đây nhãn/màu/bộ lọc kỹ năng bị chép rải rác ~10 file (mỗi nơi mỗi kiểu,
// thiếu speaking, "mixed" thì lúc "Tổng hợp" lúc để trống). Giờ gom về đây:
//  • label   — nhãn tiếng Anh (Grammar, Reading… Mixed) dùng cho chip/bộ lọc/hero.
//  • labelVi — nhãn tiếng Việt (Ngữ pháp, Đọc…) cho ngữ cảnh văn xuôi tiếng Việt
//              (phân tích, hồ sơ, báo cáo).
//  • short   — nhãn ngắn tiếng Anh cho thumbnail vuông (Listen, Vocab, Speak).
//  • tone    — màu chủ đạo; lớp Tailwind cụ thể nằm ở apps/web (lib/skills.tsx).
// Web bọc thêm icon + màu ở `apps/web/src/lib/skills.tsx`; API dùng thẳng nhãn ở đây.
// ────────────────────────────────────────────────────────────────────────────

export type SkillTone = "sky" | "emerald" | "violet" | "amber" | "rose" | "indigo" | "teal";

export interface SkillMeta {
  key: Skill;
  label: string; // tiếng Anh (mặc định hiển thị)
  labelVi: string; // tiếng Việt (phân tích/hồ sơ/báo cáo)
  short: string; // tiếng Anh, ngắn (thumbnail)
  desc: string; // mô tả ngắn TIẾNG ANH (dùng ở picker chọn kỹ năng)
  tone: SkillTone;
}

export const SKILL_META: Record<Skill, SkillMeta> = {
  grammar: { key: "grammar", label: "Grammar", labelVi: "Ngữ pháp", short: "Grammar", desc: "Sentence structure & rules", tone: "sky" },
  reading: { key: "reading", label: "Reading", labelVi: "Đọc", short: "Reading", desc: "Passages & comprehension", tone: "emerald" },
  listening: { key: "listening", label: "Listening", labelVi: "Nghe", short: "Listen", desc: "Audio & understanding", tone: "violet" },
  vocabulary: { key: "vocabulary", label: "Vocabulary", labelVi: "Từ vựng", short: "Vocab", desc: "Words & meaning", tone: "amber" },
  writing: { key: "writing", label: "Writing", labelVi: "Viết", short: "Write", desc: "Essay writing — graded by AI", tone: "teal" },
  mixed: { key: "mixed", label: "Mixed", labelVi: "Tổng hợp", short: "Mixed", desc: "Several skills in one", tone: "indigo" },
};

// Danh sách theo đúng thứ tự khai báo trong SKILLS (dùng để dựng bộ lọc/biểu đồ).
export const SKILL_LIST: SkillMeta[] = SKILLS.map((k) => SKILL_META[k]);

// Nhãn 1 kỹ năng (an toàn với giá trị lạ): mặc định tiếng Anh, vi=true → tiếng Việt.
export function skillLabel(skill: string | null | undefined, vi = false): string {
  if (!skill) return "";
  const m = SKILL_META[skill as Skill];
  if (!m) return skill;
  return vi ? m.labelVi : m.label;
}
