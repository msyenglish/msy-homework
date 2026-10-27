import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";

export interface MonthPickerProps {
  label?: string;
  hint?: string;
  /** Giá trị dạng "YYYY-MM". */
  value: string;
  onChange: (value: string) => void;
  /** Giới hạn dưới/trên dạng "YYYY-MM" (so sánh chuỗi). */
  min?: string;
  max?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

const MONTHS_SHORT: TKey[] = [
  "shared.monthPicker.month1", "shared.monthPicker.month2", "shared.monthPicker.month3", "shared.monthPicker.month4", "shared.monthPicker.month5", "shared.monthPicker.month6",
  "shared.monthPicker.month7", "shared.monthPicker.month8", "shared.monthPicker.month9", "shared.monthPicker.month10", "shared.monthPicker.month11", "shared.monthPicker.month12",
];

function parse(v: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(v || "");
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function fmt(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Chọn tháng/năm — popover đồng bộ design, value "YYYY-MM". */
export const MonthPicker = forwardRef<HTMLDivElement, MonthPickerProps>(
  ({ label, hint, value, onChange, min, max, fullWidth = true, disabled, className = "" }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    const parsed = parse(value);
    const [viewYear, setViewYear] = useState(parsed?.year ?? new Date().getFullYear());

    // Đồng bộ năm hiển thị theo value mỗi khi mở.
    useEffect(() => {
      if (isOpen && parsed) setViewYear(parsed.year);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // The panel is portaled (fixed) so an `overflow-hidden` ancestor such as a hero cannot clip it;
    // it sits under the trigger, kept inside the viewport, and closes when the page scrolls.
    useLayoutEffect(() => {
      if (!isOpen || !btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const W = 288;
      const H = 260;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      const top = r.bottom + 8 + H > window.innerHeight ? Math.max(8, r.top - 8 - H) : r.bottom + 8;
      setPos({ top, left });
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) return;
      const close = (e: Event) => {
        if (e.type === "scroll" && panelRef.current?.contains(e.target as Node)) return;
        setIsOpen(false);
      };
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
      document.addEventListener("keydown", onKey);
      return () => {
        window.removeEventListener("scroll", close, true);
        window.removeEventListener("resize", close);
        document.removeEventListener("keydown", onKey);
      };
    }, [isOpen]);

    const display = parsed ? t("shared.monthPicker.display", parsed) : t("shared.monthPicker.choose");

    const disabledFor = useMemo(
      () => (m: number) => {
        const v = fmt(viewYear, m);
        return (min && v < min) || (max && v > max) || false;
      },
      [viewYear, min, max],
    );

    function pick(month: number) {
      if (disabledFor(month)) return;
      onChange(fmt(viewYear, month));
      setIsOpen(false);
    }

    return (
      <div ref={ref} className={fullWidth ? "w-full" : "inline-block"}>
        {label && (
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        )}

        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setIsOpen((o) => !o)}
            className={cn(
              "flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left transition-colors",
              "bg-white focus:outline-none dark:bg-slate-800",
              isOpen ? "border-cyan-500" : "border-slate-200 focus:border-cyan-500 dark:border-slate-700",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
          >
            <span className="flex items-center gap-2">
              <Calendar className="size-4 text-cyan-500" />
              <span className={parsed ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-slate-500"}>
                {display}
              </span>
            </span>
            <ChevronDown className={cn("size-5 text-slate-400 transition-transform", isOpen && "rotate-180")} />
          </button>

          {isOpen && !disabled && createPortal(
            <>
              <div className="fixed inset-0 z-[109]" onClick={() => setIsOpen(false)} />
              <div
                ref={panelRef}
                style={{ position: "fixed", top: pos.top, left: pos.left }}
                className="z-[110] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {/* Điều hướng năm */}
                <div className="mb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y - 1)}
                    className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={t("shared.monthPicker.previousYear")}
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{viewYear}</span>
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y + 1)}
                    className="flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={t("shared.monthPicker.nextYear")}
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                {/* Lưới 12 tháng */}
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTHS_SHORT.map((m, i) => {
                    const month = i + 1;
                    const selected = parsed?.year === viewYear && parsed?.month === month;
                    const off = disabledFor(month);
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={off}
                        onClick={() => pick(month)}
                        className={cn(
                          "rounded-lg px-2 py-2 text-sm font-medium transition",
                          "disabled:cursor-not-allowed disabled:opacity-30",
                          selected
                            ? "bg-cyan-500 text-white shadow-sm shadow-cyan-500/30"
                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                      >
                        {t(m)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>,
            document.body,
          )}
        </div>

        {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
    );
  },
);

MonthPicker.displayName = "MonthPicker";
