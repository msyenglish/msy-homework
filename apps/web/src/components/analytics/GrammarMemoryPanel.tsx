// Grammar block of the progress dashboard — the twin of VocabMemoryPanel, but the memory unit is
// a grammar POINT, not a sentence: what a learner forgets is "present perfect", not sentence #47.
// Like the vocab panel it deliberately shows no "average accuracy" (the schedule distorts it).
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { BookText, CalendarClock, Info, Layers, Play, Target } from "lucide-react";
import { GRAMMAR_TIER_LABEL_EN, type GrammarTier } from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { BAND_COLOR } from "../../lib/cefr";
import { cn } from "../../lib/utils";
import { StatTile, compactNum } from "./StatTile";
import { t } from "../../i18n";

const TIER_COLOR: Record<number, string> = {
  0: "bg-slate-300 dark:bg-slate-700",
  1: "bg-sky-300 dark:bg-sky-800",
  2: "bg-cyan-400 dark:bg-cyan-700",
  3: "bg-emerald-500 dark:bg-emerald-500",
};

/** "2026-07-29" -> "29/07"; today -> "Nay". */
function dayLabel(date: string, i: number): string {
  if (i === 0) return t("report.analytics.today");
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

/** Colour by remaining recall: under 50% is critical, 50-75% needs attention. */
function recallTone(r: number): { bar: string; text: string } {
  if (r < 50) return { bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
  if (r < 75) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" };
}

/** A drill takes at most 5 points (grammarSessionSchema) — under 3 items each, FSRS sees noise. */
const MAX_DRILL_POINTS = 5;

export function GrammarMemoryPanel() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["grammar-memory-stats"], queryFn: accountApi.grammarMemoryStats });
  if (!data || data.points_started === 0) return null;

  const maxForecast = Math.max(1, ...data.forecast.map((f) => f.count));
  const tierTotal = data.tiers.reduce((s, t) => s + t.count, 0) || 1;
  const coverage = data.bank > 0 ? Math.round((data.cleared / data.bank) * 100) : 0;
  // `due` counts what is ready RIGHT NOW; the first forecast bar counts the whole day, so the two
  // disagreed on screen (2 beside a bar reading 7) and read as a stale number.
  const dueToday = Math.max(data.due, data.forecast[0]?.count ?? 0);
  const laterToday = dueToday - data.due;

  /** Draws a drill on exactly these points — the same call the grammar page's setup modal makes. */
  function drill(ids: string[]) {
    if (!ids.length) return;
    navigate("/u/grammar/practice", {
      state: { config: { grammarIds: ids.slice(0, MAX_DRILL_POINTS), count: 20 } },
    });
  }
  const drillIds = data.soon.slice(0, MAX_DRILL_POINTS).map((g) => g.grammar_id);

  return (
    <section className="mt-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        <BookText className="size-4" /> Grammar memory
      </h2>

      {/* Headline numbers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={<BookText className="size-4.5" />} tone="cyan"
          label="Points in memory" hint={`of ${data.points_started} practised · ${data.points_total} available`}
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
          icon={<Target className="size-4.5" />} tone="emerald"
          label="Sentence bank cleared" hint={`${data.cleared}/${data.bank} sentences answered right`}
          value={`${coverage}%`} percent={coverage}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Knowledge ladder — a tier once reached is never taken back */}
        <Card title="Knowledge tiers" icon={<Layers className="size-4 text-cyan-500" />}>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            {data.tiers.map((t) => (
              <span key={t.tier} className={cn("h-full", TIER_COLOR[t.tier])} style={{ width: `${(t.count / tierTotal) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {[...data.tiers].reverse().map((t) => (
              <li key={t.tier} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 shrink-0 rounded-full", TIER_COLOR[t.tier])} />
                <span className="text-slate-600 dark:text-slate-300">{GRAMMAR_TIER_LABEL_EN[t.tier as GrammarTier]}</span>
                <span className="ml-auto font-bold tabular-nums text-slate-800 dark:text-slate-100">{t.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            A tier you reach is yours to keep — a bad session never takes it back. A secure point still
            comes up for review; that is a reminder, not a demotion.
          </p>
        </Card>

        {/* Review forecast — same shape as the vocabulary one so both read alike */}
        <Card title="Review load, next 14 days" icon={<CalendarClock className="size-4 text-cyan-500" />}>
          {/* Bars are sized in %, so every column needs a definite height (h-full). */}
          <div className="flex h-32 gap-1">
            {data.forecast.map((f, i) => (
              <div key={f.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${f.date}: ${f.count} ${t("report.analytics.grammarPoint")}`}>
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

      {/* Due for review — the list IS the drill: the button draws questions on exactly these points,
          each row opens the point itself, and every row can be drilled alone. The old button was a
          bare link to /u/grammar, which dropped the learner on the handbook with nothing selected. */}
      {data.soon.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-slate-800">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Due for review</p>
              <p className="truncate text-[11px] text-slate-400">
                Weakest recall first — the % is how likely you are to remember that point right now
              </p>
            </div>
            <button
              type="button"
              onClick={() => drill(drillIds)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600"
            >
              <Play className="size-3.5" /> Review now · {drillIds.length}
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-x-5 gap-y-0.5 px-4 py-2 sm:grid-cols-2 sm:px-5">
            {data.soon.map((g) => {
              const band = BAND_COLOR[g.cefr as keyof typeof BAND_COLOR] ?? "#64748b";
              return (
                <li key={g.grammar_id} className="flex items-center gap-2.5 py-2">
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: `${band}1a`, color: band }}
                  >
                    {g.cefr}
                  </span>
                  {/* The title is a link to the point itself: a learner cannot review "Past Perfect"
                      without being able to read what it is first. */}
                  <Link
                    to={`/u/grammar?focus=${encodeURIComponent(g.grammar_id)}`}
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 transition hover:text-cyan-600 dark:text-slate-200 dark:hover:text-cyan-400"
                  >
                    {g.title}
                  </Link>
                  <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span
                      className={cn("block h-full rounded-full", recallTone(g.retrievability).bar)}
                      style={{ width: `${Math.max(3, g.retrievability)}%` }}
                    />
                  </span>
                  <span className={cn("w-9 shrink-0 text-right text-xs font-bold tabular-nums", recallTone(g.retrievability).text)}>
                    {g.retrievability}%
                  </span>
                  <button
                    type="button"
                    onClick={() => drill([g.grammar_id])}
                    aria-label={t("report.analytics.practicePoint", { title: g.title })}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-400"
                  >
                    <Play className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 sm:px-5 dark:border-slate-800">
            <Info className="size-3.5 shrink-0" />
            A review draws 20 questions from the sentence bank of the points above (up to {MAX_DRILL_POINTS} points a session).
          </p>
        </div>
      )}
    </section>
  );
}

// KPI card: thumb icon on the left, value + label + hint on the right (same as VocabMemoryPanel).
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">{icon} {title}</p>
      {children}
    </div>
  );
}
