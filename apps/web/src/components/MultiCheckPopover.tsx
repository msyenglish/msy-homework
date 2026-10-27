import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

// Droplist chọn NHIỀU (checkbox) trong popover. Rỗng = "mặc định/tất cả" tùy ngữ cảnh.
export function MultiCheckPopover({
  label,
  placeholder = "All",
  options,
  selected,
  onChange,
}: {
  label?: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? "All"
        : selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");

  return (
    <div>
      {label && <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
        >
          <span className={cn("truncate", selected.length ? "text-slate-800 dark:text-white" : "text-slate-400")}>{summary}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition",
                      on ? "border-cyan-500 bg-cyan-500 text-white" : "border-slate-300 dark:border-slate-600",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
