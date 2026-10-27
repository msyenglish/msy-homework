// Results of one exercise for the teacher: who did it, how they scored (best per learner), the
// score spread, and every attempt — each opening the submission review.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BarChart3, ChevronDown, ExternalLink, Lightbulb, MessageSquareText, Search, UserRound } from "lucide-react";
import { submissionsApi, type ExerciseResultLearner } from "../lib/api";
import { fmtAgo, fmtDateTime } from "../lib/format";
import { cn } from "../lib/utils";
import { t, type TKey } from "../i18n";
import { Avatar } from "./Avatar";
import { Drawer, Input, Select } from "./ui";

type SortMode = "best_desc" | "best_asc" | "recent" | "attempts";

/** Score bands, low → high; the colour of a percentage follows the band it falls in. */
const BANDS: { min: number; label: TKey; bar: string; text: string }[] = [
  { min: 0, label: "teacherMain.exercises.results.bandLow", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
  { min: 50, label: "teacherMain.exercises.results.bandMid", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { min: 70, label: "teacherMain.exercises.results.bandGood", bar: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
  { min: 90, label: "teacherMain.exercises.results.bandTop", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
];
const bandOf = (pct: number) => [...BANDS].reverse().find((b) => pct >= b.min)!;

export default function ExerciseResultsDrawer({ slug, title, open, onClose }: { slug: string | null; title?: string; open: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["exercise-results", slug],
    queryFn: () => submissionsApi.byExercise(slug!),
    enabled: open && !!slug,
  });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortMode>("best_desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const learners = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data?.learners ?? []).filter((l) => !needle || l.name.toLowerCase().includes(needle));
    const by: Record<SortMode, (a: ExerciseResultLearner, b: ExerciseResultLearner) => number> = {
      best_desc: (a, b) => b.best_pct - a.best_pct,
      best_asc: (a, b) => a.best_pct - b.best_pct,
      recent: (a, b) => b.last_at.localeCompare(a.last_at),
      attempts: (a, b) => b.attempts.length - a.attempts.length,
    };
    return [...list].sort(by[sort]);
  }, [data, q, sort]);

  const stats = data?.stats;
  const bucketTotal = stats?.buckets.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      widthClassName="max-w-2xl"
      icon={<BarChart3 className="size-5" />}
      title={t("teacherMain.exercises.results.title")}
      description={data?.exercise.title ?? title}
    >
      {isLoading ? (
        <p className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</p>
      ) : error ? (
        <p className="py-12 text-center text-sm text-rose-500">{error instanceof Error ? error.message : t("teacherMain.exercises.results.loadFailed")}</p>
      ) : !stats?.attempts ? (
        <div className="py-14 text-center">
          <BarChart3 className="mx-auto size-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">{t("teacherMain.exercises.results.empty")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("teacherMain.exercises.results.emptyHint")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={t("teacherMain.exercises.results.learners")} value={String(stats.learners)} />
            <Tile label={t("teacherMain.exercises.results.attempts")} value={String(stats.attempts)} />
            <Tile label={t("teacherMain.exercises.results.avg")} value={stats.avg_pct == null ? "—" : `${stats.avg_pct}%`} tone={stats.avg_pct == null ? undefined : bandOf(stats.avg_pct).text} />
            <Tile label={t("teacherMain.exercises.results.best")} value={stats.best_pct == null ? "—" : `${stats.best_pct}%`} tone={stats.best_pct == null ? undefined : bandOf(stats.best_pct).text} />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{t("teacherMain.exercises.results.spread")}</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {BANDS.map((b, i) =>
                stats.buckets[i] ? <div key={b.min} className={b.bar} style={{ width: `${(stats.buckets[i] / bucketTotal) * 100}%` }} title={`${t(b.label)}: ${stats.buckets[i]}`} /> : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {BANDS.map((b, i) => (
                <span key={b.min} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-full", b.bar)} /> {t(b.label)} <strong className="text-slate-700 dark:text-slate-200">{stats.buckets[i]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="min-w-48 flex-1">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder={t("teacherMain.exercises.results.search")} leftIcon={<Search className="size-4" />} />
            </div>
            <div className="w-48">
              <Select
                value={sort}
                onChange={(v) => setSort(v as SortMode)}
                options={[
                  { value: "best_desc", label: t("teacherMain.exercises.results.sortBestDesc") },
                  { value: "best_asc", label: t("teacherMain.exercises.results.sortBestAsc") },
                  { value: "recent", label: t("teacherMain.exercises.results.sortRecent") },
                  { value: "attempts", label: t("teacherMain.exercises.results.sortAttempts") },
                ]}
              />
            </div>
          </div>

          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {learners.map((l) => (
              <LearnerRow key={l.key} learner={l} open={expanded === l.key} onToggle={() => setExpanded((k) => (k === l.key ? null : l.key))} onNavigate={onClose} />
            ))}
            {!learners.length && <li className="py-8 text-center text-sm text-slate-400">{t("teacherMain.exercises.results.noMatch")}</li>}
          </ul>
        </div>
      )}
    </Drawer>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-0.5 text-xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100", tone)}>{value}</p>
    </div>
  );
}

function LearnerRow({ learner: l, open, onToggle, onNavigate }: { learner: ExerciseResultLearner; open: boolean; onToggle: () => void; onNavigate: () => void }) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onNavigate();
    navigate(to);
  };
  const band = bandOf(l.best_pct);
  return (
    <li className={cn(open && "bg-slate-50/70 dark:bg-slate-800/30")}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <Avatar seed={l.user_id ?? l.key} src={l.avatar_url} size={36} className="shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{l.name}</span>
          <span className="block text-xs text-slate-500">
            {t("teacherMain.exercises.results.attemptCount", { n: l.attempts.length })} · {fmtAgo(l.last_at)}
          </span>
        </span>
        <span className="text-right">
          <span className={cn("block text-lg font-extrabold tabular-nums", band.text)}>{l.best_pct}%</span>
          <span className="block text-[11px] text-slate-400">{t("teacherMain.exercises.results.bestShort")}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-3 sm:pl-[3.75rem]">
          {l.attempts.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => (a.kind === "vocab" ? window.open(`/s/${a.id}`, "_blank", "noreferrer") : go(`/teacher/submissions/${a.id}`))}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white dark:hover:bg-slate-900"
            >
              <span className="w-6 text-xs tabular-nums text-slate-400">#{l.attempts.length - i}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{fmtDateTime(a.submitted_at)}</span>
              {a.hint_used && <Lightbulb className="size-3.5 text-amber-500" aria-label={t("teacherMain.exercises.results.hintUsed")} />}
              {a.has_feedback && <MessageSquareText className="size-3.5 text-cyan-500" aria-label={t("teacherMain.exercises.results.hasFeedback")} />}
              <span className="tabular-nums text-slate-500">
                {a.score}/{a.total}
              </span>
              <span className={cn("w-12 text-right font-bold tabular-nums", bandOf(a.pct).text)}>{a.pct}%</span>
              <ExternalLink className="size-3.5 text-slate-400" />
            </button>
          ))}
          {l.user_id && (
            <button
              type="button"
              onClick={() => go(`/teacher/students/${l.user_id}`)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
            >
              <UserRound className="size-3.5" /> {t("teacherMain.exercises.results.openProfile")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
