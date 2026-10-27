import { BookOpen, Headphones, Layers, PenLine, SpellCheck, Type, type LucideIcon } from "lucide-react";
import { SKILL_LIST, SKILL_META, type Skill, type SkillTone } from "@msyen/shared";
import { Select, type SelectOption } from "../components/ui/select";
import { t } from "../i18n";

// Lớp WEB của registry kỹ năng (nguồn dữ liệu ở @msyen/shared · skills.ts).
// Gộp icon lucide + màu Tailwind + bộ lọc dùng chung — sửa 1 chỗ, đồng bộ mọi trang.

// Icon theo kỹ năng.
export const SKILL_ICON: Record<Skill, LucideIcon> = {
  grammar: SpellCheck,
  reading: BookOpen,
  listening: Headphones,
  vocabulary: Type,
  writing: PenLine,
  mixed: Layers,
};

// tone → lớp Tailwind (phải là chuỗi literal để Tailwind quét được).
//  • box  — nền + chữ cho ô thumbnail.
//  • text — màu icon trong dropdown bộ lọc.
const TONE: Record<SkillTone | "slate", { box: string; text: string }> = {
  sky: { box: "bg-sky-500/15 text-sky-600 dark:text-sky-400", text: "text-sky-500" },
  emerald: { box: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", text: "text-emerald-500" },
  violet: { box: "bg-violet-500/15 text-violet-600 dark:text-violet-400", text: "text-violet-500" },
  amber: { box: "bg-amber-500/15 text-amber-600 dark:text-amber-400", text: "text-amber-500" },
  rose: { box: "bg-rose-500/15 text-rose-600 dark:text-rose-400", text: "text-rose-500" },
  indigo: { box: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400", text: "text-indigo-500" },
  teal: { box: "bg-teal-500/15 text-teal-600 dark:text-teal-400", text: "text-teal-500" },
  slate: { box: "bg-slate-500/10 text-slate-500 dark:text-slate-400", text: "text-slate-400" },
};

// Gói UI đầy đủ cho 1 kỹ năng (icon + nhãn + lớp màu). Trả null nếu skill lạ.
export function skillUi(skill: string | null | undefined) {
  if (!skill) return null;
  const m = SKILL_META[skill as Skill];
  if (!m) return null;
  return { ...m, Icon: SKILL_ICON[m.key], box: TONE[m.tone].box, text: TONE[m.tone].text };
}

// Options cho <Select> bộ lọc kỹ năng — có mục "tất cả" đứng đầu (value rỗng).
export function skillFilterOptions(allLabel = t("lib.skills.all"), allTone: "cyan" | "slate" = "slate"): SelectOption[] {
  const allIcon = <Layers className={allTone === "cyan" ? "size-4 text-cyan-500" : "size-4 text-slate-400"} />;
  return [
    { value: "", label: allLabel, icon: allIcon },
    ...SKILL_LIST.map((m): SelectOption => {
      const Icon = SKILL_ICON[m.key];
      return { value: m.key, label: m.label, icon: <Icon className={`size-4 ${TONE[m.tone].text}`} /> };
    }),
  ];
}

// Bộ lọc kỹ năng DÙNG CHUNG — thay cho ~6 mảng SKILL_OPTIONS chép tay.
export function SkillFilter({
  value,
  onChange,
  allLabel = t("lib.skills.all"),
  allTone = "slate",
  className,
  fullWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
  allTone?: "cyan" | "slate";
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <Select
      options={skillFilterOptions(allLabel, allTone)}
      value={value}
      onChange={onChange}
      placeholder={allLabel}
      className={className}
      fullWidth={fullWidth}
    />
  );
}
