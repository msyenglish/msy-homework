// Popover lọc dùng chung (nhiều nhóm) — mỗi nhóm là 1 danh sách lựa chọn đơn.
// Dùng ở trang Học sinh & Người dùng public để đồng bộ (trạng thái / cấp độ…).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "../lib/utils";
import { t } from "../i18n";

export interface FilterOption {
  value: string;
  label: string;
}
export interface FilterGroup {
  label: string; // tiêu đề nhóm (vd "Trạng thái")
  value: string; // giá trị đang chọn
  defaultValue: string; // giá trị mặc định (thường "all") — bằng nó = chưa lọc
  options?: FilterOption[];
  onChange: (v: string) => void;
  /**
   * Thay dãy pill bằng control tự dựng (vd <Select> khi danh sách dài như cấp độ/chủ đề).
   * Có `control` thì `options` không cần. `value`/`defaultValue`/`onChange` vẫn dùng để
   * đếm số lọc đang bật và cho nút "Xóa bộ lọc".
   */
  control?: ReactNode;
  /** Nút phụ nằm bên PHẢI tiêu đề nhóm (vd "Quản lý nhãn"). */
  action?: ReactNode;
}

export function FilterPopover({
  groups,
  panelClassName,
}: {
  groups: FilterGroup[];
  panelClassName?: string;
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

  const count = groups.filter((g) => g.value !== g.defaultValue).length;
  const reset = () => groups.forEach((g) => g.onChange(g.defaultValue));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition",
          count > 0 || open
            ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-300"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
        )}
      >
        <SlidersHorizontal className="size-4" /> {t("teacherWidgets.filterPopover.filter")}
        {count > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900",
            panelClassName,
          )}
        >
          {groups.map((g, gi) => (
            <div key={g.label} className={gi > 0 ? "mt-3" : undefined}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{g.label}</p>
                {g.action}
              </div>
              {g.control ?? (
                <div className="flex flex-wrap gap-1.5">
                  {(g.options ?? []).map((opt) => (
                    <OptionPill
                      key={opt.value}
                      selected={g.value === opt.value}
                      onClick={() => g.onChange(opt.value)}
                    >
                      {opt.label}
                    </OptionPill>
                  ))}
                </div>
              )}
            </div>
          ))}

          {count > 0 && (
            <button
              onClick={reset}
              className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {t("teacherWidgets.filterPopover.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OptionPill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition",
        selected
          ? "border-cyan-500 bg-cyan-500 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
      )}
    >
      {selected && <Check className="size-3.5" />}
      {children}
    </button>
  );
}
