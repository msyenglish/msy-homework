// Vocabulary block of the progress dashboard: 3 headline numbers + knowledge pyramid + review
// forecast + "about to forget" list. Deliberately NO "average accuracy" — in a spaced-repetition
// system that number is distorted by the schedule (easy words only = higher %).
import { useQuery } from "@tanstack/react-query";
import { Brain, CalendarClock, Layers, Play, ShieldCheck, TrendingDown } from "lucide-react";
import { VOCAB_TIER_LABEL_EN, type VocabTier } from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { cn } from "../../lib/utils";
import { StatTile, compactNum } from "./StatTile";

const TIER_COLOR: Record<number, string> = {
  0: "bg-slate-300 dark:bg-slate-700",
  1: "bg-sky-300 dark:bg-sky-800",
  2: "bg-cyan-400 dark:bg-cyan-700",
  3: "bg-teal-500 dark:bg-teal-600",
  4: "bg-emerald-500 dark:bg-emerald-500",
};

/** "2026-07-29" -> "29/07"; today -> "Nay". */
function dayLabel(date: string, i: number): string {
  if (i === 0) return "Nay";
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

/** Colour by remaining recall: under 50% is critical, 50-75% needs attention. */
function recallTone(r: number): { bar: string; text: string } {
  if (r < 50) return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
  if (r < 75) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" };
}

export function VocabMemoryPanel({ onReview }: { onReview?: () => void }) {
  const { data } = useQuery({ queryKey: ["vocab-memory-stats"], queryFn: accountApi.vocabMemoryStats });
  if (!data || data.tracked === 0) return null;

  const maxForecast = Math.max(1, ...data.forecast.map((f) => f.count));
  // `due` is what is ready RIGHT NOW; the first forecast bar covers the whole day. Showing only the
  // first left a "2" sitting beside a bar reading "7".
  const dueToday = Math.max(data.due, data.forecast[0]?.count ?? 0);
  const laterToday = dueToday - data.due;
  const tierTotal = data.tiers.reduce((s, t) => s + t.count, 0) || 1;

  return (
    <section className="mt-5 space-y-4">
      <h2 className="flex flex-wrap items-center gap-x-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        <Brain className="size-4" /> Vocabulary memory
        {/* Scope, spelled out: My vocab shows the same measures over the saved words alone, and two
            unlabelled totals of different populations read as one of them being broken. */}
        <span className="text-[11px] font-normal normal-case tracking-normal text-slate-400">
          — every word you have practised, Library and My vocab together
        </span>
      </h2>

      {/* Headline numbers */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatTile
          icon={<Brain className="size-4.5" />} tone="cyan"
          label="Words in memory" hint={`of ${data.tracked} words tracked`}
          value={compactNum(data.remembering)}
        />
        <StatTile
          icon={<CalendarClock className="size-4.5" />} tone="amber"
          label="Due today"
          hint={
            laterToday > 0
              ? `${data.due} ready now · ${laterToday} later today`
              : data.urgent > 0
                ? `${data.urgent} about to slip away`
                : "you are on schedule"
          }
          value={compactNum(dueToday)}
        />
        <StatTile
          icon={<ShieldCheck className="size-4.5" />} tone="emerald"
          label="30-day retention"
          hint={
            data.retention30.reviewed > 0
              ? `${data.retention30.recalled}/${data.retention30.reviewed} due words recalled`
              : "not enough reviews to measure yet"
          }
          value={data.retention30.rate != null ? `${data.retention30.rate}%` : "—"}
          percent={data.retention30.rate}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Knowledge pyramid — a tier once reached is never taken back */}
        <Card title="Knowledge tiers" icon={<Layers className="size-4 text-cyan-500" />}>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {data.tiers.map((t) => (
              <span
                key={t.tier}
                className={cn("h-full", TIER_COLOR[t.tier])}
                style={{ width: `${(t.count / tierTotal) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {[...data.tiers].reverse().map((t) => (
              <li key={t.tier} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 shrink-0 rounded-full", TIER_COLOR[t.tier])} />
                <span className="text-slate-600 dark:text-slate-300">{VOCAB_TIER_LABEL_EN[t.tier as VocabTier]}</span>
                <span className="ml-auto font-bold tabular-nums text-slate-800 dark:text-slate-100">{t.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            A tier you reach is yours to keep — it never drops. Words in a high tier still show up for
            review; that is a reminder, not a demotion.
          </p>
        </Card>

        {/* Review forecast — prevents the "600 words due at once" shock */}
        <Card title="Review load, next 14 days" icon={<CalendarClock className="size-4 text-cyan-500" />}>
          {/* Bars are sized in %, so every column needs a definite height (h-full) — against an
              "auto" height a percentage resolves to 0 and the whole chart renders empty. */}
          <div className="flex h-32 gap-1">
            {data.forecast.map((f, i) => (
              <div key={f.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${f.date}: ${f.count} words`}>
                <span className="text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                  {f.count > 0 ? f.count : ""}
                </span>
                <span
                  className={cn("w-full rounded-t", i === 0 ? "bg-amber-400" : "bg-cyan-400/70 dark:bg-cyan-600/70")}
                  style={{ height: `${Math.max(2, (f.count / maxForecast) * 100)}%` }}
                />
                <span className="h-3 text-[9px] leading-3 text-slate-400">{i % 2 === 0 ? dayLabel(f.date, i) : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* About to forget — the most actionable list in the whole panel: one click into Review */}
      {data.soon.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-slate-800">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <TrendingDown className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">About to forget</p>
              <p className="truncate text-[11px] text-slate-400">
                The percentage is how likely you are to recall that word right now
              </p>
            </div>
            {/* Opens the review setup modal on THIS page — a review is one tap from here, not a
                detour through the vocabulary page. */}
            <button
              type="button"
              onClick={onReview}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600"
            >
              <Play className="size-3.5" /> Review now{data.due > 0 ? ` · ${data.due}` : ""}
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-x-5 gap-y-0.5 px-4 py-2 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
            {data.soon.map((w) => (
              <li key={w.word} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {w.word}
                </span>
                {/* Recall bar: quicker to read than the number, which stays for precision. */}
                <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span
                    className={cn("block h-full rounded-full", recallTone(w.retrievability).bar)}
                    style={{ width: `${Math.max(3, w.retrievability)}%` }}
                  />
                </span>
                <span className={cn("w-9 shrink-0 text-right text-xs font-bold tabular-nums", recallTone(w.retrievability).text)}>
                  {w.retrievability}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </section>
  );
}

// KPI card: thumb icon on the left, value + label + hint on the right (same as UserAnalyticsView).
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">{icon} {title}</p>
      {children}
    </div>
  );
}
