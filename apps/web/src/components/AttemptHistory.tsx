// Attempt history for one exercise — the collapsible "History · N attempts" list.
// Shared by every kind: read-aloud / writing show a /100 score, quiz shows score out of its own
// total. Lives outside practice/ because the report page (/s/:id) uses it too.
import { useEffect, useState } from "react";
import { ChevronDown, History, Trophy } from "lucide-react";
import type { ReadingHistoryItem } from "../lib/api";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// The practice pages address public users in English; the report page (also shared with parents)
// is Vietnamese. Same widget, so the copy is a prop — same pattern as UserAnalyticsView.
export type HistoryLang = "vi" | "en";

const fmt = (s: string) =>
  new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Tone by how well the attempt went — percent, so a quiz out of 25 reads like a /100 score. */
function toneOf(it: ReadingHistoryItem): string {
  const pct = it.out_of ? (it.pron_score / it.out_of) * 100 : it.pron_score;
  return pct >= 80
    ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 60
      ? "text-cyan-600 dark:text-cyan-400"
      : pct >= 40
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
}

export function AttemptHistory({
  slug,
  fetchHistory,
  currentId,
  onOpen,
  lang = "vi",
  className = "mt-4",
  defaultOpen = false,
}: {
  slug: string;
  // Identity is bound by the caller's adapter (session cookie).
  fetchHistory: (slug: string) => Promise<ReadingHistoryItem[]>;
  currentId?: string;
  onOpen: (id: string) => void;
  lang?: HistoryLang;
  className?: string;
  /** Expanded on mount — the report page opens the BEST attempt, so the other scores explain it. */
  defaultOpen?: boolean;
}) {
  void lang;
  const [items, setItems] = useState<ReadingHistoryItem[] | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  // Reload when the viewed attempt changes (e.g. just submitted a new one).
  useEffect(() => {
    let active = true;
    fetchHistory(slug)
      .then((it) => active && setItems(it))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentId]);

  // A single attempt is not a history — and a signed-out viewer (shared report link) gets none.
  if (!items || items.length <= 1) return null;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <History className="size-4 text-cyan-500" /> {t("shared.attemptHistory.title", { n: items.length })}
        </span>
        <ChevronDown className={cn("size-4 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((it) => {
            const isCurrent = it.submission_id === currentId;
            return (
              <li key={it.submission_id}>
                <button
                  type="button"
                  onClick={() => onOpen(it.submission_id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                    isCurrent ? "bg-cyan-50/60 dark:bg-cyan-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                  )}
                >
                  <span className={cn("text-lg font-extrabold tabular-nums", toneOf(it))}>
                    {it.pron_score}
                    {it.out_of != null && <span className="text-xs font-bold opacity-70">/{it.out_of}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {t("shared.attemptHistory.attempt")} {it.attempt_no}
                      </span>
                      {it.is_best && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          <Trophy className="size-2.5" /> {t("shared.attemptHistory.best")}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                          {t("shared.attemptHistory.viewing")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      {fmt(it.submitted_at)}
                      {it.out_of == null && !it.has_audio && t("shared.attemptHistory.cleared")}
                    </span>
                  </span>
                  {!isCurrent && (
                    <span className="shrink-0 text-xs font-semibold text-cyan-600 dark:text-cyan-400">{t("shared.attemptHistory.view")} →</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
