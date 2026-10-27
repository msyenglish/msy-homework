// Study clock on the progress dashboard: how long the learner actually sat with the app, by day and
// by area. Measured by session stitching in requireUser (the gap between two authenticated requests
// IS time spent) plus a heartbeat on pages that read or listen.
//
// Deliberately NOT on the leaderboard: points reward what you got right, a clock rewards sitting
// still. Ranking it would invite open tabs, not practice.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarRange, Clock, Flame, Mic, PenLine, Timer, Type, Video } from "lucide-react";
import { accountApi, type StudyRange } from "../../lib/api";
import { cn } from "../../lib/utils";
import { StatTile } from "./StatTile";

/** 4 210 -> "1h 10m"; under an hour stays in minutes, under a minute reads as "<1m". */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  if (seconds < 60) return "<1m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const AREA: Record<string, { label: string; icon: typeof Type; bar: string; text: string }> = {
  vocab: { label: "Vocabulary", icon: Type, bar: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
  grammar: { label: "Grammar", icon: BookOpen, bar: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
  speaking: { label: "Speaking", icon: Mic, bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  writing: { label: "Writing", icon: PenLine, bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  video: { label: "Video", icon: Video, bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  library: { label: "Exercises", icon: BookOpen, bar: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
  other: { label: "Browsing", icon: Clock, bar: "bg-slate-400", text: "text-slate-500" },
};

/** Bar label: a day and a week-start read as "31/07", a month as "07/26". */
function bucketLabel(key: string, bucket: "day" | "week" | "month"): string {
  const [y, m, d] = key.split("-");
  return bucket === "month" ? `${m}/${y!.slice(2)}` : `${d}/${m}`;
}

const RANGES: { key: StudyRange; label: string; title: string }[] = [
  { key: "week", label: "7d", title: "This week" },
  { key: "month", label: "30d", title: "Last 30 days" },
  { key: "quarter", label: "3m", title: "Last 3 months" },
  { key: "year", label: "1y", title: "Last 12 months" },
  { key: "all", label: "All", title: "All time" },
];

/** How the bars are grouped, said out loud — a bar meaning a week is not obvious from its height. */
const BUCKET_NOTE: Record<"day" | "week" | "month", string> = {
  day: "Minutes per day",
  week: "Minutes per week (Monday start)",
  month: "Minutes per month",
};

export function StudyTimePanel() {
  const [range, setRange] = useState<StudyRange>("week");
  const { data } = useQuery({ queryKey: ["study-time", range], queryFn: () => accountApi.studyTime(range) });
  // Nothing measured yet — an empty chart of zeroes says less than showing nothing at all.
  if (!data || data.total_all === 0) return null;

  const max = Math.max(1, ...data.buckets.map((b) => b.seconds));
  const areaTotal = data.areas.reduce((s, a) => s + a.seconds, 0) || 1;
  // Label every bar when they are few, every third when the axis gets crowded.
  const step = data.buckets.length <= 8 ? 1 : data.buckets.length <= 16 ? 2 : 3;
  const title = RANGES.find((r) => r.key === range)?.title ?? "";

  return (
    <section className="mt-5 space-y-4">
      <h2 className="flex flex-wrap items-center gap-x-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        <Timer className="size-4" /> Study time
        <span className="text-[11px] font-normal normal-case tracking-normal text-slate-400">
          — counted while you are actually on a page, capped at 10 minutes per idle gap
        </span>
      </h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatTile
          icon={<Clock className="size-4.5" />} tone="cyan"
          label={title}
          hint={`${data.active_days} ${data.active_days === 1 ? "day" : "days"} studied`}
          value={fmtDuration(data.total)}
        />
        <StatTile
          icon={<CalendarRange className="size-4.5" />} tone="violet"
          label="Average per day studied" hint="days off do not drag it down"
          value={fmtDuration(data.avg_active)}
        />
        <StatTile
          icon={<Flame className="size-4.5" />} tone="amber"
          label={data.bucket === "day" ? "Best day" : data.bucket === "week" ? "Best week" : "Best month"}
          hint={data.best_bucket ? bucketLabel(data.best_bucket.key, data.bucket) : "nothing yet"}
          value={data.best_bucket ? fmtDuration(data.best_bucket.seconds) : "—"}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
            <Timer className="size-4 text-cyan-500" /> Time on task
          </p>
          <span className="ml-auto flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                  range === r.key
                    ? "bg-white text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                )}
              >
                {r.label}
              </button>
            ))}
          </span>
        </div>

        {/* Bars are sized in %, so the row needs a definite height (h-full) — against an "auto"
            height a percentage resolves to 0 and the chart renders empty. */}
        <div className="flex h-32 gap-1">
          {data.buckets.map((b, i) => (
            <div key={b.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.key}: ${fmtDuration(b.seconds)}`}>
              <span className="text-[9px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
                {b.seconds >= 60 ? Math.round(b.seconds / 60) : ""}
              </span>
              <span
                className={cn("w-full rounded-t", b.seconds > 0 ? "bg-cyan-400 dark:bg-cyan-600" : "bg-slate-100 dark:bg-slate-800")}
                style={{ height: `${Math.max(2, (b.seconds / max) * 100)}%` }}
              />
              <span className="h-3 text-[9px] leading-3 text-slate-400">
                {i % step === 0 ? bucketLabel(b.key, data.bucket) : ""}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{BUCKET_NOTE[data.bucket]}</p>

        {/* Where the time went — one stacked bar plus a legend, no second chart library. */}
        {data.areas.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {data.areas.map((a) => (
                <span key={a.area} className={cn("h-full", (AREA[a.area] ?? AREA.other).bar)} style={{ width: `${(a.seconds / areaTotal) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
              {data.areas.map((a) => {
                const meta = AREA[a.area] ?? AREA.other;
                const Icon = meta.icon;
                return (
                  <li key={a.area} className="flex items-center gap-2 text-xs">
                    <Icon className={cn("size-3.5 shrink-0", meta.text)} />
                    <span className="text-slate-600 dark:text-slate-300">{meta.label}</span>
                    <span className="ml-auto font-bold tabular-nums text-slate-700 dark:text-slate-200">{fmtDuration(a.seconds)}</span>
                    <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">
                      {Math.round((a.seconds / areaTotal) * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="mt-3 text-[11px] text-slate-400">
          Total since the clock started{data.first_day ? ` (${bucketLabel(data.first_day, "day")})` : ""}:{" "}
          <b className="text-slate-600 dark:text-slate-300">{fmtDuration(data.total_all)}</b>
        </p>
      </div>
    </section>
  );
}
