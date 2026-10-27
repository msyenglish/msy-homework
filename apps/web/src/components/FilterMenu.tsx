// Dropdown lọc MỘT lựa chọn: nút gọn hiển thị giá trị đang chọn, bấm mở popover danh sách.
// Dùng khi muốn xếp bộ lọc INLINE cùng ô tìm kiếm thay vì trải dãy chip chiếm hết chiều ngang.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export interface MenuOption {
  value: string;
  label: string;
  count?: number;
  color?: string; // chấm màu bên trái (vd màu band CEFR)
  icon?: ReactNode; // icon thay cho chấm màu (vd nhóm ngữ pháp)
}

export function FilterMenu({
  label,
  value,
  defaultValue,
  options,
  onChange,
  align = "start",
  className,
}: {
  label: string; // nhãn nhóm, hiện khi đang ở giá trị mặc định (vd "Cấp độ")
  value: string;
  defaultValue: string;
  options: MenuOption[];
  onChange: (v: string) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = value !== defaultValue;
  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-sm font-semibold transition",
          active || open
            ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-300"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {active && current?.icon && <span className="flex size-4 shrink-0 items-center justify-center">{current.icon}</span>}
          {active && !current?.icon && current?.color && (
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
          )}
          <span className="truncate">{active ? current?.label ?? value : label}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            // Rộng VỪA nội dung (w-max) để nhãn nhóm dài không bị cắt, chặn trần theo bề
            // ngang màn; cao tối đa theo CHIỀU CAO MÀN HÌNH thay vì con số cứng.
            "absolute z-30 mt-2 w-max min-w-full max-w-[min(22rem,88vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl max-h-[min(70vh,32rem)] dark:border-slate-700 dark:bg-slate-900",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition",
                  selected
                    ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {o.icon ? (
                  <span className="flex size-5 shrink-0 items-center justify-center">{o.icon}</span>
                ) : o.color ? (
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                ) : (
                  <span className="size-2 shrink-0" />
                )}
                <span className="whitespace-nowrap">{o.label}</span>
                {selected && <Check className="size-4 shrink-0 text-cyan-600 dark:text-cyan-300" />}
                {o.count != null && <span className="ml-auto shrink-0 pl-3 text-xs text-slate-400">{o.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
