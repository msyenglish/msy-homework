// Khối "Ngữ pháp cần chú ý" ở báo cáo / chữa bài: liệt kê các cấu trúc bài này nhắm tới,
// điểm còn sai xếp trước. Mặc định chỉ hiện vài mục, bấm "Xem thêm" để mở hết.
// Bấm 1 mục → lazy-fetch nội dung đầy đủ (GET /grammar/:id, có edge cache) rồi render
// bằng CHÍNH GrammarDetail của sổ tay /u/grammar → 1 nơi maintain.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookText, ChevronDown, Loader2 } from "lucide-react";
import type { Cefr, GrammarNote, GrammarWeak } from "@msyen/shared";
import { publicGrammarOne } from "../lib/api";
import { BAND_COLOR } from "../lib/cefr";
import { cn } from "../lib/utils";
import GrammarDetail from "./GrammarDetail";
import { t, type TKey } from "../i18n";

const PREVIEW = 2; // số mục hiện sẵn trước khi bấm "Xem thêm"

/** Mục hiển thị — cố ý tách khỏi GrammarNote/GrammarWeak để dùng được cho cả 1 lượt nộp lẫn cả tháng. */
export interface GrammarPoint {
  id: string;
  title: string;
  cefr: Cefr;
  summary: string;
  badge?: { key: TKey; values: Record<string, number> } | string; // vd "sai 2 câu" · "sai 3/4 câu"
  alert?: boolean; // tô viền vàng (còn sai)
}

/** GrammarNote (1 lượt nộp) → mục hiển thị. */
export const pointsFromNotes = (notes: GrammarNote[]): GrammarPoint[] =>
  notes.map((n) => ({
    ...n,
    badge: n.wrongPositions.length ? { key: "shared.grammarNotes.wrongCount", values: { n: n.wrongPositions.length } } : undefined,
    alert: n.wrongPositions.length > 0,
  }));

/** GrammarWeak (gom cả tháng) → mục hiển thị. */
export const pointsFromWeak = (weak: GrammarWeak[]): GrammarPoint[] =>
  weak.map((g) => ({ ...g, badge: { key: "shared.grammarNotes.wrongOutOf", values: { wrong: g.wrong, seen: g.seen } }, alert: true }));

export default function GrammarNotes({
  points,
  title,
  className,
}: {
  points: GrammarPoint[];
  title?: string;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!points.length) return null;
  const heading = title ?? t(points.some((p) => p.alert) ? "shared.grammarNotes.attention" : "shared.grammarNotes.inExercise");
  const shown = showAll ? points : points.slice(0, PREVIEW);
  const hidden = points.length - shown.length;

  return (
    <div className={className}>
      {/* title="" → the block sits in a Section that already has its own heading, so skip it. */}
      {heading && (
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <BookText className="size-3.5" /> {heading}
        </h2>
      )}
      <div className="space-y-2">
        {shown.map((p) => (
          <PointCard
            key={p.id}
            point={p}
            open={openId === p.id}
            onToggle={() => setOpenId(openId === p.id ? null : p.id)}
          />
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60 print:hidden"
        >
          {t("shared.grammarNotes.showMore", { n: hidden })} <ChevronDown className="size-4" />
        </button>
      )}
    </div>
  );
}

function PointCard({
  point,
  open,
  onToggle,
}: {
  point: GrammarPoint;
  open: boolean;
  onToggle: () => void;
}) {
  // Fetch the full entry only when the card actually opens (cached across close/reopen).
  const { data, isLoading, isError } = useQuery({
    queryKey: ["grammar-one", point.id],
    queryFn: () => publicGrammarOne(point.id),
    enabled: open,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white dark:bg-slate-900",
        point.alert ? "border-amber-300 dark:border-amber-800" : "border-slate-200 dark:border-slate-800",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: `${BAND_COLOR[point.cefr]}1a`, color: BAND_COLOR[point.cefr] }}
            >
              {point.cefr}
            </span>
            <span className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{point.title}</span>
            {point.badge && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                {typeof point.badge === "string" ? point.badge : t(point.badge.key, point.badge.values)}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{point.summary}</p>
        </div>
        <ChevronDown className={cn("size-5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-3 dark:border-slate-800">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" /> {t("shared.grammarNotes.opening")}
            </p>
          ) : isError || !data ? (
            <p className="py-3 text-center text-sm text-slate-400">{t("shared.grammarNotes.openFailed")}</p>
          ) : (
            <GrammarDetail g={data} />
          )}
        </div>
      )}
    </div>
  );
}
