// "Complete with AI" drawer: pick the words that still miss fields or need review, choose fill-blanks
// or full rewrite, then follow the job word by word.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, Sparkles, Square } from "lucide-react";
import { t } from "../../i18n";
import { Button, Checkbox, Drawer, Input, ToggleRow } from "../ui";
import { JobProgress, type AiJob } from "./aiJob";
import { SectionTitle } from "./parts";

export interface CompleteCandidate {
  key: string;
  word: string;
  setName: string | null;
  missing: string[];
  warnings: string[];
}

export function AiCompleteDrawer({
  open,
  onClose,
  candidates,
  job,
  onStart,
  onCancelJob,
  onRetryJob,
}: {
  open: boolean;
  onClose: () => void;
  candidates: CompleteCandidate[];
  job: AiJob | null;
  onStart: (keys: string[], opts: { overwrite: boolean; instruction: string }) => void;
  onCancelJob: () => void;
  onRetryJob?: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"blank" | "rewrite">("blank");
  const [note, setNote] = useState("");
  const [showJob, setShowJob] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPicked(new Set(candidates.map((c) => c.key)));
    setShowJob(!!job?.running);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reviewOnly = useMemo(() => candidates.filter((c) => picked.has(c.key) && !c.missing.length && c.warnings.length).length, [candidates, picked]);
  const inJobView = showJob && !!job;

  const footer = inJobView ? (
    <div className="flex flex-wrap items-center gap-2">
      {job!.running ? (
        <>
          <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10" onClick={onCancelJob}>
            <Square className="size-4" /> {t("teacherVocab.job.stop")}
          </Button>
          <Button className="ml-auto" variant="secondary" onClick={onClose}>
            {t("teacherVocab.job.background")}
          </Button>
        </>
      ) : (
        <>
          {onRetryJob && job!.items.some((i) => i.status === "error") && (
            <Button variant="secondary" onClick={onRetryJob}>
              <RotateCcw className="size-4" /> {t("teacherVocab.job.retryFailed")}
            </Button>
          )}
          {candidates.length > 0 && (
            <Button variant="ghost" className="ml-auto" onClick={() => setShowJob(false)}>
              {t("teacherVocab.complete.again", { n: candidates.length })}
            </Button>
          )}
          <Button className={candidates.length ? "" : "ml-auto"} onClick={onClose}>
            {t("teacherVocab.action.done")}
          </Button>
        </>
      )}
    </div>
  ) : (
    <Button
      className="w-full"
      disabled={!picked.size || !!job?.running}
      onClick={() => {
        onStart(
          candidates.filter((c) => picked.has(c.key)).map((c) => c.key),
          { overwrite: mode === "rewrite", instruction: note.trim() },
        );
        setShowJob(true);
      }}
    >
      <Sparkles className="size-4" /> {t("teacherVocab.complete.submit", { n: picked.size })}
    </Button>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      widthClassName="max-w-xl"
      icon={<Sparkles className="size-5" />}
      title={t("teacherVocab.complete.title")}
      description={inJobView ? job!.title : t("teacherVocab.complete.description")}
      footer={footer}
    >
      {inJobView ? (
        <JobProgress job={job!} />
      ) : !candidates.length ? (
        <div className="py-12 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
          <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">{t("teacherVocab.complete.allGood")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("teacherVocab.complete.allGoodHint")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <SectionTitle
              n={1}
              aside={
                <Checkbox
                  checked={picked.size === candidates.length}
                  indeterminate={picked.size > 0 && picked.size < candidates.length}
                  onChange={(on) => setPicked(new Set(on ? candidates.map((c) => c.key) : []))}
                  label={<span className="text-xs font-semibold text-slate-500">{t("teacherVocab.complete.picked", { picked: picked.size, total: candidates.length })}</span>}
                />
              }
            >
              {t("teacherVocab.complete.pickTitle")}
            </SectionTitle>
            <ul className="max-h-[42vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {candidates.map((c) => (
                <li key={c.key} className="flex items-start gap-3 px-3 py-2.5">
                  <Checkbox
                    className="mt-0.5"
                    checked={picked.has(c.key)}
                    onChange={(on) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (on) n.add(c.key);
                        else n.delete(c.key);
                        return n;
                      })
                    }
                    aria-label={c.word}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="truncate font-semibold text-slate-800 dark:text-slate-100">{c.word}</span>
                      {c.setName && <span className="truncate text-xs text-slate-400">{c.setName}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.missing.slice(0, 4).map((m) => (
                        <span key={m} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                          {m}
                        </span>
                      ))}
                      {c.missing.length > 4 && <span className="px-1 text-[11px] text-slate-400">+{c.missing.length - 4}</span>}
                      {c.warnings.map((w) => (
                        <span key={w} className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                          <AlertTriangle className="size-3" /> {w}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <SectionTitle n={2}>{t("teacherVocab.complete.modeTitle")}</SectionTitle>
            <ToggleRow
              icon={<RefreshCw className="size-5" />}
              tone="amber"
              title={t("teacherVocab.complete.modeRewrite")}
              desc={mode === "blank" ? t("teacherVocab.complete.modeBlankHint") : t("teacherVocab.complete.modeRewriteHint")}
              checked={mode === "rewrite"}
              onChange={(on) => setMode(on ? "rewrite" : "blank")}
            />
            {mode === "blank" && reviewOnly > 0 && (
              <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {t("teacherVocab.complete.reviewOnlyHint", { n: reviewOnly })}
              </p>
            )}
          </section>

          <section>
            <SectionTitle n={3}>{t("teacherVocab.add.noteLabel")}</SectionTitle>
            <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder={t("teacherVocab.add.notePlaceholder")} />
          </section>
        </div>
      )}
    </Drawer>
  );
}
