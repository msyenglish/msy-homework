// Checkbox chuẩn của design system (cyan/slate, hỗ trợ dark mode + indeterminate).
// Dùng ô GIẢ (span + icon) thay vì checkbox mặc định của trình duyệt để đồng bộ bo góc/màu
// trên mọi OS. Input thật vẫn nằm dưới (sr-only) để giữ a11y + bàn phím.
import { Check, Minus } from "lucide-react";
import { cn } from "../../lib/utils";

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  disabled,
  label,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  /** true = trạng thái "một phần" (vd chọn vài dòng trong trang) → hiện dấu gạch. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const on = checked || indeterminate;
  return (
    <label className={cn("inline-flex cursor-pointer select-none items-center gap-2", disabled && "cursor-not-allowed opacity-50", className)}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition",
          on
            ? "border-cyan-500 bg-cyan-500 text-white shadow-sm shadow-cyan-500/30"
            : "border-slate-300 bg-white hover:border-cyan-400 dark:border-slate-600 dark:bg-slate-800",
        )}
      >
        {indeterminate ? <Minus className="size-3 stroke-[3]" /> : checked ? <Check className="size-3 stroke-[3]" /> : null}
      </span>
      {label && <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>}
    </label>
  );
}
