import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Loader2, Mic, Sparkles } from "lucide-react";
import { wordAccuracy } from "@msyen/shared";
import {
  teacherReadingApi,
  type ReadingWordResult,
  type TeacherReadingStudentItem,
} from "../lib/api";
import { fmtDate } from "../lib/format";
import { cn } from "../lib/utils";
import Drawer from "./Drawer";
import { AudioPlayer } from "./AudioPlayer";
import { ReadingReport } from "./report/ReportCharts";
import { t } from "../i18n";

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

/**
 * Trang TỔNG HỢP PHÁT ÂM của 1 học sinh (giáo viên): số liệu gộp (điểm TB, timeline
 * tiến bộ, từ hay sai) + danh sách từng lượt đọc để nghe lại. Mở dạng drawer.
 */
export default function PronunciationDrawer({
  studentId,
  studentName,
  open,
  onClose,
}: {
  studentId: string | null;
  studentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reading-by-student", studentId],
    queryFn: () => teacherReadingApi.byStudent(studentId!),
    enabled: open && !!studentId,
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      icon={<Mic className="size-5" />}
      iconTone="bg-rose-500/15 text-rose-600 dark:text-rose-400"
      title={t("teacherWidgets.pronunciationDrawer.title")}
      description={t("teacherWidgets.pronunciationDrawer.description", { studentName })}
    >
      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
      ) : error ? (
        <p className="py-8 text-center text-rose-600">{error instanceof Error ? error.message : t("teacherWidgets.pronunciationDrawer.loadError")}</p>
      ) : !data || data.stats.count === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Mic className="size-6" />
          </div>
          <p className="mt-3 text-sm text-slate-500">{t("teacherWidgets.pronunciationDrawer.noAttempts")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Số liệu gộp — dùng lại khối báo cáo đọc to */}
          <ReadingReport data={data.stats} />

          {/* Danh sách từng lượt (mới nhất trước) */}
          <div>
            <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              {t("teacherWidgets.pronunciationDrawer.attemptsCount", { count: data.items.length })}
            </p>
            <div className="space-y-2.5">
              {data.items.map((s) => (
                <AttemptCard key={s.id} sub={s} studentId={studentId!} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function AttemptCard({ sub, studentId }: { sub: TeacherReadingStudentItem; studentId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  // Chấm âm vị tải LƯỜI khi mở thẻ (blob nằm ở R2, không đi kèm list).
  const { data: wordsData } = useQuery({
    queryKey: ["reading-words", sub.id],
    queryFn: () => teacherReadingApi.words(sub.id),
    enabled: open,
    staleTime: Infinity,
  });
  const words = wordsData?.words ?? [];
  // Tạo lại nhận xét AI từ dữ liệu đã lưu (dùng khi đã đổi prompt/điểm).
  const regenMut = useMutation({
    mutationFn: () => teacherReadingApi.regenerateFeedback(sub.id),
    onSuccess: () => {
      toast.success(t("teacherWidgets.pronunciationDrawer.regenSuccess"));
      qc.invalidateQueries({ queryKey: ["reading-by-student", studentId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.pronunciationDrawer.regenError")),
  });
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
            {sub.exerciseTitle ?? t("teacherWidgets.pronunciationDrawer.deletedExercise")}
          </p>
          <p className="text-xs text-slate-400">{fmtDate(sub.submittedAt)}</p>
        </div>
        <div className="text-right">
          <div className={`text-xl font-extrabold ${scoreTone(sub.pronScore)}`}>{sub.pronScore}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{t("teacherWidgets.pronunciationDrawer.pointsUnit")}</div>
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t("teacherWidgets.pronunciationDrawer.accuracy"), value: sub.accuracy },
              { label: t("teacherWidgets.pronunciationDrawer.fluency"), value: sub.fluency },
              { label: t("teacherWidgets.pronunciationDrawer.completeness"), value: sub.completeness },
              ...(sub.prosody != null ? [{ label: t("teacherWidgets.pronunciationDrawer.prosody"), value: sub.prosody }] : []),
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
                <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">{t("teacherWidgets.pronunciationDrawer.aiFeedbackLabel")}</p>
                <button
                  type="button"
                  onClick={() => regenMut.mutate()}
                  disabled={regenMut.isPending}
                  className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:underline disabled:opacity-60 dark:text-cyan-400"
                >
                  {regenMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {t("teacherWidgets.pronunciationDrawer.regenerate")}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{sub.aiFeedback}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => regenMut.mutate()}
              disabled={regenMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 px-2.5 py-1.5 text-xs font-medium text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-60 dark:border-cyan-900 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
            >
              {regenMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {t("teacherWidgets.pronunciationDrawer.generateAiFeedback")}
            </button>
          )}
          {sub.teacherFeedback && (
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <p className="mb-1 text-xs font-semibold text-slate-500">{t("teacherWidgets.pronunciationDrawer.teacherFeedbackLabel")}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{sub.teacherFeedback}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
