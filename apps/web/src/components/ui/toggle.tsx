// Công tắc bật/tắt + hàng cấu hình "icon trái · mô tả · công tắc phải".
// Trước đây `Toggle` nằm cục bộ trong ExerciseEditorPage và cái hộp bao quanh nó bị chép tay
// ở 3–4 chỗ — gom về đây để mọi công tắc trong trang tạo bài trông y hệt nhau.
import { cn } from "../../lib/utils";

export function Toggle({
  checked,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition",
        checked ? "bg-cyan-500" : "bg-slate-300 dark:bg-slate-600",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

const TONES = {
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
} as const;

/** Hàng cấu hình có khung: ô icon bên trái · tiêu đề + mô tả · công tắc bên phải. */
export function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
  tone = "cyan",
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  desc?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40",
        className,
      )}
    >
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}
