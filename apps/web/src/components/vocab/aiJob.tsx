// A running AI job on the vocabulary page (complete entries / pick words for a topic): its state
// shape and the progress panel shown in the drawers and the page banner.
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

export type JobItemStatus = "pending" | "running" | "done" | "error";

export interface AiJob {
  kind: "fill" | "suggest";
  title: string;
  /** One entry per word; a suggest job grows as batches come back. */
  items: { key: string; word: string; status: JobItemStatus }[];
  /** Words the job aims for (suggest: the requested count). */
  target: number;
  running: boolean;
  cancelled: boolean;
  errors: string[];
  /** Free-form note shown when the job ends (e.g. the AI ran out of new words). */
  note?: string;
}

export function jobStats(job: AiJob) {
  const done = job.items.filter((i) => i.status === "done").length;
  const failed = job.items.filter((i) => i.status === "error").length;
  const finished = job.kind === "suggest" ? done : done + failed;
  const pct = job.target ? Math.min(100, Math.round((finished / job.target) * 100)) : 100;
  return { done, failed, finished, pct };
}

/** Status line + bar, compact enough for the page banner. */
export function JobBar({ job, className }: { job: AiJob; className?: string }) {
  const { done, failed, finished, pct } = jobStats(job);
  const status = job.running
    ? t("teacherVocab.job.running", { done: finished, total: job.target })
    : job.cancelled
      ? t("teacherVocab.job.cancelled", { done })
      : failed
        ? t("teacherVocab.job.finishedWithErrors", { done, failed })
        : t("teacherVocab.job.finished", { n: done });
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        {job.running ? <Loader2 className="size-4 animate-spin text-cyan-500" /> : failed || job.cancelled ? <XCircle className="size-4 text-amber-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{job.title}</span>
        <span className="ml-auto text-xs tabular-nums text-slate-500">{status}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn("h-full rounded-full transition-all duration-500", job.running ? "bg-cyan-500" : failed || job.cancelled ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Full progress: bar, each word with its status, and any error messages. */
export function JobProgress({ job }: { job: AiJob }) {
  return (
    <div className="space-y-4">
      <JobBar job={job} />
      {job.items.length > 0 && (
        <ul className="grid max-h-[55vh] grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2 dark:border-slate-800">
          {job.items.map((it) => (
            <li key={it.key} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", it.status === "running" && "bg-cyan-50 dark:bg-cyan-500/10")}>
              {it.status === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : it.status === "error" ? (
                <XCircle className="size-4 shrink-0 text-rose-500" />
              ) : it.status === "running" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-cyan-500" />
              ) : (
                <Circle className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
              )}
              <span className={cn("truncate", it.status === "pending" ? "text-slate-400" : "font-medium text-slate-700 dark:text-slate-200")}>{it.word}</span>
            </li>
          ))}
        </ul>
      )}
      {job.running && job.kind === "suggest" && <p className="text-xs text-slate-500">{t("teacherVocab.job.suggestHint")}</p>}
      {job.note && !job.running && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{job.note}</p>}
      {job.errors.length > 0 && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {[...new Set(job.errors)].map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
