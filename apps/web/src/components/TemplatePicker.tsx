import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { BLUEPRINTS, SKILL_LIST, blueprintsForSkill, getBlueprint, type Skill } from "@msyen/shared";
import { skillUi } from "../lib/skills";
import { cn } from "../lib/utils";

// Chọn DẠNG BÀI (template/blueprint) của kỹ năng — cùng phong cách với SkillPicker
// (icon thumb + title + mô tả 2 dòng). Icon lấy theo kỹ năng của template (đồng bộ màu).
export function TemplatePicker({
  skill,
  value,
  onChange,
  label = "Type",
  all = false,
  placeholder,
}: {
  skill: string;
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** List every type, grouped by skill (the skill then follows the chosen type). */
  all?: boolean;
  placeholder?: string;
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

  // "mixed" is retired for new exercises; it stays listed only while it is the current value.
  const items = all
    ? SKILL_LIST.flatMap((m) => BLUEPRINTS.filter((b) => b.skill === m.key && (b.skill !== "mixed" || value === b.id)))
    : skill
      ? blueprintsForSkill(skill as Skill)
      : [];
  const cur = getBlueprint(value);
  const curUi = cur ? skillUi(cur.skill) : null;

  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>}
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => setOpen((o) => !o)}
          className="flex h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
        >
          {cur && curUi ? (
            <>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", curUi.box)}>
                <curUi.Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{cur.label}</span>
                <span className="block truncate text-xs text-slate-500">{cur.desc}</span>
              </span>
            </>
          ) : (
            <span className="flex-1 text-sm text-slate-400">{placeholder ?? (skill || all ? "Select a type…" : "Pick a skill first")}</span>
          )}
          <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
        </button>

        {open && items.length > 0 && (
          <div className="absolute z-30 mt-2 max-h-[28rem] w-full overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {items.map((b, i) => {
              const ui = skillUi(b.skill)!;
              const on = value === b.id;
              // All-types mode: a small skill header before each skill's first type.
              const header = all && (i === 0 || items[i - 1].skill !== b.skill);
              return (
                <div key={b.id}>
                {header && (
                  <p className={cn("flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide", ui.text, i > 0 && "mt-1 border-t border-slate-100 dark:border-slate-800")}>
                    <ui.Icon className="size-3.5" /> {ui.label}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition",
                    on ? "bg-cyan-50 dark:bg-cyan-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800",
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ui.box)}>
                    <ui.Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm font-bold", on ? "text-cyan-700 dark:text-cyan-300" : "text-slate-800 dark:text-slate-100")}>
                      {b.label}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{b.desc}</span>
                  </span>
                  {on && <Check className="size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />}
                </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
