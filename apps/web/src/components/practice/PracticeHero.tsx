import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { SKILL_LABEL } from "../../lib/format";
import { skillUi } from "../../lib/skills";
import { HeroDecor } from "../HeroDecor";
import { Tooltip } from "../Tooltip";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

/**
 * Header "hero card" cho trang làm bài — bám theme (sáng: trắng/slate · tối: navy),
 * IconBox teal + hoạ tiết. Gồm tiêu đề, stats (kỹ năng · số câu) và HÀNG HÀNH ĐỘNG
 * (`actions`: Quay lại · sáng/tối · chế độ xem · Nộp bài) do trang làm bài truyền vào.
 */
export function PracticeHero({
  title,
  studentName,
  skill,
  total,
  actions,
  icon: iconOverride,
  meta,
  flush = false,
}: {
  title: string;
  studentName: string;
  skill: string | null;
  total: number;
  actions?: ReactNode;
  /** Replaces the skill icon when the page wants one specific to the exercise, not the skill. */
  icon?: ReactNode;
  /** Appended to the stats row after the skill badge — e.g. the difficulty picker. */
  meta?: ReactNode;
  /** true = dính liền phần ngay dưới trên mobile (vd bài đọc) → bỏ khoảng cách mb.
      false = giữ khoảng cách mb bình thường (vd nghe/ngữ pháp không có bài đọc). */
  flush?: boolean;
}) {
  const ui = skillUi(skill);
  const icon = iconOverride ?? (ui ? <ui.Icon className="size-7 sm:size-8" /> : <GraduationCap className="size-7 sm:size-8" />);
  const skillText = skill ? SKILL_LABEL[skill] ?? skill : null;
  const showName = !!studentName && studentName.trim() !== title.trim();

  return (
    <header
      className={cn(
        "relative mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0",
        flush && "max-sm:mb-0",
      )}
    >
      {/* Hoạ tiết góc phải (mờ, ăn theo currentColor) */}
      <HeroDecor seed={title} className="text-cyan-500/15 dark:text-cyan-400/10" />
      {/* Vệt sáng teal nhẹ ở góc trái */}
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start gap-4">
        {/* Icon vuông teal theo kỹ năng */}
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-lg shadow-cyan-500/30 sm:size-16">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {/* Tiêu đề dài bị cắt 1 dòng — bấm/hover để xem đủ. Dùng Tooltip thay `title` gốc
              vì trên mobile không có hover nên `title` chẳng bao giờ hiện. */}
          <Tooltip label={title} clickable block side="bottom" className="w-full min-w-0">
            <h1 className="w-full cursor-pointer truncate text-xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-2xl">
              {title}
            </h1>
          </Tooltip>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500 dark:text-white/70">
            {/* The name is skipped when it only repeats the title (vocab sets pass the set name as both). */}
            {showName && <span className="font-semibold text-slate-700 dark:text-white/90">{studentName}</span>}
            {skillText && (
              <>
                {showName && <span className="text-slate-300 dark:text-white/30">•</span>}
                <span className="font-semibold text-cyan-600 dark:text-cyan-300">{skillText}</span>
              </>
            )}
            {meta}
            <span className="text-slate-300 dark:text-white/30">•</span>
            <span>
              <span className="font-bold text-slate-700 dark:text-white/90">{total}</span> {t("practice2.hero.questions")}
            </span>
          </p>
        </div>
        {/* Hàng hành động — mobile: xuống hàng riêng, full-width; PC: inline bên phải. */}
        {actions && <div className="flex w-full items-center gap-2 sm:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
