import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Mic, PenLine, Sparkles } from "lucide-react";
import { wordAccuracy } from "@msyen/shared";
import { t } from "../i18n";
import { teacherReadingApi, type ReadingWordResult, type TeacherReadingItem } from "../lib/api";
import Drawer from "./Drawer";
import { AudioPlayer } from "./AudioPlayer";
import { Button, Textarea } from "./ui";

function scoreTone(n: number) {
  if (n >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
function wordClass(w: ReadingWordResult) {
  switch (w.errorType) {
    case "Omission":
      return "text-slate-400 line-through decoration-slate-300";
    case "Insertion":
      return "text-violet-500 italic";
    case "Mispronunciation":
      return wordAccuracy(w) < 40 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
    default:
      return "text-slate-700 dark:text-slate-200";
  }
}

export default function ReadingSubmissionsDrawer({ slug, open, onClose }: { slug: string | null; open: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reading-subs", slug],
    queryFn: () => teacherReadingApi.byExercise(slug!),
    enabled: open && !!slug,
  });
  const items = data?.items ?? [];

  return (
    <Drawer open={open} onClose={onClose} width="max-w-2xl" icon={<Mic className="size-5" />} iconTone="bg-rose-500/15 text-rose-600 dark:text-rose-400" title={t("teacherDrawers.reading.title")} description={data?.exercise.title ?? t("teacherDrawers.reading.defaultDesc")}>
      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
      ) : error ? (
        <p className="py-8 text-center text-rose-600">{error instanceof Error ? error.message : t("teacherDrawers.reading.errorLoad")}</p>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Mic className="size-6" />
          </div>
          <p className="mt-3 text-sm text-slate-500">{t("teacherDrawers.reading.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <ReadingCard key={s.id} sub={s} slug={slug!} />
          ))}
        </div>
      )}
    </Drawer>
  );
}

function ReadingCard({ sub, slug }: { sub: TeacherReadingItem; slug: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sub.teacherFeedback ?? "");

  // Phoneme scoring is lazily loaded when opening card (stored in R2, not in list).
  const { data: wordsData } = useQuery({
    queryKey: ["reading-words", sub.id],
    queryFn: () => teacherReadingApi.words(sub.id),
    enabled: open,
    staleTime: Infinity,
  });
  const words = wordsData?.words ?? [];

  const saveMut = useMutation({
    mutationFn: () => teacherReadingApi.setFeedback(sub.id, draft),
    onSuccess: () => {
      toast.success(t("teacherDrawers.reading.toastSavedFeedback"));
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["reading-subs", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.reading.errorSave")),
  });

  // Regenerate AI feedback from saved data (used when prompt or score changed).
  const regenMut = useMutation({
    mutationFn: () => teacherReadingApi.regenerateFeedback(sub.id),
    onSuccess: () => {
      toast.success(t("teacherDrawers.reading.toastRegeneratedAi"));
      qc.invalidateQueries({ queryKey: ["reading-subs", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.reading.errorGenFeedback")),
  });

  const date = new Date(sub.submittedAt).toLocaleString("vi-VN");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{sub.studentName ?? t("teacherDrawers.reading.deletedStudent")}</p>
          <p className="text-xs text-slate-400">{date}</p>
        </div>
        <div className="text-right">
          <div className={`text-xl font-extrabold ${scoreTone(sub.pronScore)}`}>{sub.pronScore}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{t("teacherDrawers.reading.scoreLabel")}</div>
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t("teacherDrawers.reading.accuracy"), value: sub.accuracy },
              { label: t("teacherDrawers.reading.fluency"), value: sub.fluency },
              { label: t("teacherDrawers.reading.completeness"), value: sub.completeness },
              ...(sub.prosody != null ? [{ label: t("teacherDrawers.reading.prosody"), value: sub.prosody }] : []),
            ].map((m) => (
              <div key={m.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900">
                <div className="text-[11px] text-slate-400">{m.label}</div>
                <div className={`text-base font-bold ${scoreTone(m.value)}`}>{m.value}</div>
              </div>
            ))}
          </div>

          <AudioPlayer src={sub.audio_url} />

          {words.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed dark:bg-slate-900">
              <p className="flex flex-wrap gap-x-1 gap-y-0.5">
                {words.map((w, i) => (
                  <span key={i} className={wordClass(w)} title={`${w.errorType} · ${Math.round(wordAccuracy(w))}`}>
                    {w.word}
                  </span>
                ))}
              </p>
            </div>
          )}

          {sub.aiFeedback ? (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900 dark:bg-cyan-500/10">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{t("teacherDrawers.reading.aiFeedbackTitle")}</p>
                <button
                  type="button"
                  onClick={() => regenMut.mutate()}
                  disabled={regenMut.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:underline disabled:opacity-60 dark:text-cyan-400"
                >
                  {regenMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {t("teacherDrawers.reading.regenerate")}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{sub.aiFeedback}</p>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => regenMut.mutate()} disabled={regenMut.isPending}>
              {regenMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("teacherDrawers.reading.generateAiFeedback")}
            </Button>
          )}

          {/* Teacher feedback (manual) */}
          {editing ? (
            <div>
              <Textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("teacherDrawers.reading.teacherFeedbackPlaceholder")} />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("common.save")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setDraft(sub.teacherFeedback ?? ""); }}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : sub.teacherFeedback ? (
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">{t("teacherDrawers.reading.teacherFeedbackTitle")}</p>
                <button onClick={() => setEditing(true)} className="text-xs text-cyan-600 hover:underline dark:text-cyan-400">{t("common.edit")}</button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{sub.teacherFeedback}</p>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PenLine className="size-4" /> {t("teacherDrawers.reading.addFeedback")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
