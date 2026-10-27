// Chọn ĐIỂM NGỮ PHÁP cho 1 câu hỏi (questions.grammar_id) ở trang soạn bài.
// Sổ tay ~86 điểm → dropdown thường vô dụng, phải có ô tìm + gom theo band CEFR.
// AI tự gắn khi lưu bài; picker này để giáo viên xem lại / sửa / gắn tay.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { BookText, Check, ChevronDown, Search, X } from "lucide-react";
import { CEFR_BANDS, type Cefr } from "@msyen/shared";
import { publicGrammar } from "../lib/api";
import { BAND_COLOR } from "../lib/cefr";
import { cn } from "../lib/utils";
import { t } from "../i18n";

const MENU_H = 340; // chiều cao ước lượng của popover — dùng để quyết định bung lên/xuống

/** Nhãn ngữ pháp gọn cho hàng câu hỏi THU GỌN — lướt danh sách là biết câu nào đã gắn. */
export function GrammarTagBadge({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["grammar"], queryFn: publicGrammar, staleTime: Infinity, retry: false });
  const g = id ? data?.items.find((x) => x.id === id) : null;
  if (!g) return null;
  return (
    <span
      title={g.title}
      className="ml-auto hidden shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold sm:inline-flex"
      style={{ backgroundColor: `${BAND_COLOR[g.cefr]}1a`, color: BAND_COLOR[g.cefr] }}
    >
      <BookText className="size-3" /> {g.title.split("—")[0].trim()}
    </span>
  );
}

export default function GrammarPicker({
  value,
  onChange,
  className,
  label,
  disabled = false,
}: {
  value: string; // grammar.id ("" = chưa gắn)
  onChange: (id: string) => void;
  className?: string;
  label?: string | null; // null = không hiện nhãn
  disabled?: boolean;
}) {
  const displayLabel = label !== undefined ? label : t("teacherWidgets.grammarPicker.label");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Vị trí popover (fixed, toạ độ viewport) — xem POPOVER bên dưới.
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  // Sổ tay dùng chung khắp app → react-query cache, mở picker nhiều câu chỉ tải 1 lần.
  const { data } = useQuery({ queryKey: ["grammar"], queryFn: publicGrammar, staleTime: Infinity, retry: false });
  const items = data?.items ?? [];
  const current = items.find((g) => g.id === value);

  // POPOVER: card câu hỏi có `overflow-hidden` → popover absolute bị CẮT. Vì vậy portal ra
  // body + position:fixed theo toạ độ nút; cách này miễn nhiễm với mọi ancestor có
  // overflow/transform. Đo lại khi cuộn/đổi cỡ để popover bám nút.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      // Không đủ chỗ dưới mà trên rộng hơn → bung LÊN.
      const up = below < MENU_H && r.top > below;
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Popover nằm NGOÀI `ref` (đã portal) → phải kiểm cả hai, không thì bấm vào nó là đóng.
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Gom theo band CEFR, giữ thứ tự ladder; tìm cả theo tên/nhóm/dấu hiệu (kể cả tiếng Việt).
  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const hit = items.filter(
      (g) =>
        !kw ||
        g.title.toLowerCase().includes(kw) ||
        g.category.toLowerCase().includes(kw) ||
        g.summary.toLowerCase().includes(kw) ||
        (g.keywords ?? []).some((k) => k.toLowerCase().includes(kw)),
    );
    return CEFR_BANDS.map((b) => ({ band: b, entries: hit.filter((g) => g.cefr === b) })).filter((x) => x.entries.length);
  }, [items, q]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {displayLabel && <label className="mb-1 block text-xs font-semibold text-slate-500">{displayLabel}</label>}
      <div className="flex gap-1.5">
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/70 dark:disabled:hover:bg-slate-800"
        >
          <BookText className="size-4 shrink-0 text-slate-400" />
          {current ? (
            <>
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: `${BAND_COLOR[current.cefr]}1a`, color: BAND_COLOR[current.cefr] }}
              >
                {current.cefr}
              </span>
              <span className="truncate font-medium text-slate-700 dark:text-slate-200">{current.title}</span>
            </>
          ) : (
            <span className="truncate text-slate-400">{t("teacherWidgets.grammarPicker.unassigned")}</span>
          )}
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
        </button>
        {current && (
          <button
            type="button"
            onClick={() => onChange("")}
            title={t("teacherWidgets.grammarPicker.removeTitle")}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open &&
        pos &&
        createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: pos.up ? undefined : pos.top,
            bottom: pos.up ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: pos.width,
          }}
          className="z-[60] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="border-b border-slate-100 p-2 dark:border-slate-700">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 dark:bg-slate-900">
              <Search className="size-4 shrink-0 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("teacherWidgets.grammarPicker.searchPlaceholder")}
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t("teacherWidgets.grammarPicker.empty")}</p>
            ) : (
              groups.map(({ band, entries }) => (
                <div key={band}>
                  <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: BAND_COLOR[band as Cefr] }}>
                    {band}
                  </p>
                  {entries.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        onChange(g.id);
                        setOpen(false);
                        setQ("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-700",
                        g.id === value && "bg-cyan-50 dark:bg-cyan-500/10",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-700 dark:text-slate-200">{g.title}</span>
                        <span className="block truncate text-xs text-slate-400">{g.category}</span>
                      </span>
                      {g.id === value && <Check className="size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
