import { Minus, Plus } from "lucide-react";
import { t } from "../i18n";
import { cn } from "../lib/utils";

// Number field with its own −/+ stepper buttons; the browser's spin buttons are hidden.
export function NumberInput({
  label,
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  start,
  placeholder,
  size = "md",
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Value the first −/+ press starts from while the box is empty (defaults to `min`). */
  start?: number;
  placeholder?: string;
  /** sm = 36px tall for compact toolbars, md = 44px like Input/Select. */
  size?: "sm" | "md";
  className?: string;
}) {
  const num = value === "" ? NaN : Number(value);
  const decimals = (String(step).split(".")[1] ?? "").length;
  const bump = (d: number) => {
    const next = Number.isNaN(num) ? (start ?? min) : num + d * step;
    onChange(String(Number(Math.min(max, Math.max(min, next)).toFixed(decimals))));
  };
  const btn = cn(
    "flex shrink-0 items-center justify-center text-slate-500 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-700",
    size === "sm" ? "w-8" : "w-10",
  );
  return (
    <div className={className}>
      {label && <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>}
      <div
        className={cn(
          "flex items-stretch overflow-hidden border border-slate-200 bg-white transition focus-within:ring-2 focus-within:ring-cyan-500/40 dark:border-slate-700 dark:bg-slate-800",
          size === "sm" ? "h-9 rounded-lg" : "h-11 rounded-xl",
        )}
      >
        <button type="button" onClick={() => bump(-1)} disabled={num <= min} className={btn} aria-label={t("shared.numberInput.decrease")}>
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          inputMode={decimals ? "decimal" : "numeric"}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-x border-slate-200 bg-transparent px-2 text-center text-sm text-slate-800 outline-none [appearance:textfield] dark:border-slate-700 dark:text-slate-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => bump(1)} disabled={num >= max} className={btn} aria-label={t("shared.numberInput.increase")}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
