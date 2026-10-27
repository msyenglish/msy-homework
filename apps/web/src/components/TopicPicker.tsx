// Single control for the 2-level topic tree (parent → child). Replaces the old pair of
// "Chủ đề" + "Chủ đề con" selects: one value (topic id), children implicitly carry their parent.
// Panel = search box + grouped tree; searching matches both parent and child names.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Hash, Search, X } from "lucide-react";
import type { Topic } from "@msyen/shared";
import { TopicDot } from "../lib/topics";
import { cn } from "../lib/utils";
import { t } from "../i18n";

type Row = { topic: Topic; parent?: Topic; depth: 0 | 1 };

// Fold diacritics + lowercase so "chu de" also matches "Chủ đề".
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

export function TopicPicker({
  topics,
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
  disabled,
  className,
}: {
  topics: Topic[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const displayLabel = label !== undefined ? label : t("teacherWidgets.topicPicker.label");
  const displayPlaceholder = placeholder ?? t("teacherWidgets.topicPicker.placeholder");
  const displayClearLabel = clearLabel ?? t("teacherWidgets.topicPicker.clearLabel");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number }>({
    left: 0,
    width: 0,
    maxH: 360,
  });

  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const selected = value ? byId.get(value) : undefined;
  const selectedParent = selected?.parent_id ? byId.get(selected.parent_id) : undefined;

  // Full tree in display order: each root followed by its children.
  const tree = useMemo<Row[]>(() => {
    const pos = (t: Topic) => t.position ?? 0;
    const roots = topics.filter((t) => !t.parent_id || !byId.has(t.parent_id)).sort((a, b) => pos(a) - pos(b));
    const rows: Row[] = [];
    for (const r of roots) {
      rows.push({ topic: r, depth: 0 });
      for (const c of topics.filter((t) => t.parent_id === r.id).sort((a, b) => pos(a) - pos(b)))
        rows.push({ topic: c, parent: r, depth: 1 });
    }
    return rows;
  }, [topics, byId]);

  // Search: keep a row when its own name matches, or (for children) when the parent name does —
  // typing a parent name still reveals the whole branch.
  const rows = useMemo(() => {
    const q = norm(query);
    if (!q) return tree;
    return tree.filter((r) => norm(r.topic.name).includes(q) || (r.parent ? norm(r.parent.name).includes(q) : false));
  }, [tree, query]);

  const place = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const GAP = 8;
    const PAD = 12;
    const below = window.innerHeight - rect.bottom - GAP - PAD;
    const above = rect.top - GAP - PAD;
    const up = below < 320 && above > below;
    setCoords({
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + GAP,
      bottom: up ? window.innerHeight - rect.top + GAP : undefined,
      maxH: Math.max(200, Math.min(400, up ? above : below)),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  // Keep the highlighted row in view while arrowing.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => {
        const next = e.key === "ArrowDown" ? c + 1 : c - 1;
        return Math.max(0, Math.min(rows.length - 1, next));
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[cursor]) pick(rows[cursor].topic.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const panel = (
    <>
      <div className="fixed inset-0 z-[110]" onClick={() => setOpen(false)} />
      <div
        ref={panelRef}
        style={{ position: "fixed", left: coords.left, width: Math.max(coords.width, 260), top: coords.top, bottom: coords.bottom, zIndex: 111 }}
        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
          <Search className="size-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("teacherWidgets.topicPicker.searchPlaceholder")}
            className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-slate-400 transition hover:text-slate-600">
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain py-1" style={{ maxHeight: coords.maxH - 46 }}>
          {!query && (
            <button
              type="button"
              onClick={() => pick("")}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition",
                value === ""
                  ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400"
                  : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800",
              )}
            >
              <Hash className="size-4 shrink-0 text-cyan-500" />
              {displayClearLabel}
            </button>
          )}

          {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">{t("teacherWidgets.topicPicker.empty")}</p>}

          {rows.map((r, i) => {
            const active = r.topic.id === value;
            return (
              <button
                key={r.topic.id}
                type="button"
                data-idx={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(r.topic.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 py-2 pr-3 text-left text-sm transition",
                  r.depth === 1 && !query ? "pl-9" : "pl-3",
                  active
                    ? "bg-cyan-50 font-semibold text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400"
                    : cn(
                        r.depth === 0 ? "font-semibold text-slate-700 dark:text-slate-200" : "text-slate-600 dark:text-slate-300",
                        cursor === i && "bg-slate-50 dark:bg-slate-800",
                      ),
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TopicDot icon={r.topic.icon} color={r.topic.color} />
                  <span className="truncate">
                    {/* While searching the tree is flattened → show the parent as a breadcrumb. */}
                    {query && r.parent && <span className="text-slate-400">{r.parent.name} › </span>}
                    {r.topic.name}
                  </span>
                </span>
                {active && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className={cn("w-full", className)}>
      {displayLabel && <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{displayLabel}</label>}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border bg-white px-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800",
          open ? "border-cyan-500" : "border-slate-200 dark:border-slate-700",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && <TopicDot icon={selected.icon} color={selected.color} />}
          <span className={cn("truncate", selected ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-slate-500")}>
            {selected ? (
              <>
                {selectedParent && <span className="text-slate-400">{selectedParent.name} › </span>}
                {selected.name}
              </>
            ) : (
              displayPlaceholder
            )}
          </span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && !disabled && createPortal(panel, document.body)}
    </div>
  );
}
