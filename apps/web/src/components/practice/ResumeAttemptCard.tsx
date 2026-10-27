// ============================================================
//  Resume banner shown at the TOP of a submission report (/s/:id).
//
//  A report is the page a learner lands on when they open an exercise they have already submitted,
//  so an attempt started afterwards (a redo left half-done) had no entry point at all: the only
//  control was a restart button, which reads as starting over. This card surfaces the unfinished
//  attempt that is already saved server-side and sends them back into it.
//
//  Two stores back it, matching how each type saves progress:
//   • vocab decks → an active session under scope "exercise"
//   • quiz / dictation / writing / video → a row in practice_drafts
//  Both endpoints need a signed-in user; a parent opening the shared link simply sees nothing.
// ============================================================
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { History, PlayCircle } from "lucide-react";
import { accountApi } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { t } from "../../i18n";

export function ResumeAttemptCard({ exerciseId, kind }: { exerciseId: string; kind: string }) {
  const nav = useNavigate();

  // Vocab keeps the whole built deck in a session row, so the remaining count is exact.
  const { data: vocab } = useQuery({
    queryKey: ["resume-vocab-session", exerciseId],
    queryFn: () => accountApi.vocabSessionActive("exercise", exerciseId),
    enabled: kind === "vocab",
    retry: false,
    staleTime: 0,
  });
  // Every other type: one lookup across all unfinished attempts, matched by exercise.
  const { data: drafts } = useQuery({
    queryKey: ["resume-drafts"],
    queryFn: accountApi.draftList,
    enabled: kind !== "vocab",
    retry: false,
    staleTime: 0,
  });

  const session = vocab?.session ?? null;
  const draft = drafts?.items.find((d) => d.exerciseId === exerciseId) ?? null;

  let done = 0, total = 0, at = "";
  if (session) {
    total = session.state.queue.length;
    done = session.state.answered?.length ?? 0;
    at = session.updatedAt ?? "";
  } else if (draft) {
    total = draft.total;
    done = draft.answered;
    at = draft.updatedAt;
  } else return null;

  // Nothing meaningful left to go back to.
  if (total <= 0 || done >= total) return null;
  const unit = kind === "vocab" ? t("practice2.resume.unitCard") : t("practice2.resume.unitQuestion");

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-500/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <History className="size-5" />
      </span>
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-bold text-slate-800 dark:text-white">{t("practice2.resume.title")}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {t("practice2.resume.progress", { done, total, unit, left: total - done, saved: at ? t("practice2.resume.saved", { date: fmtDate(at) }) : "" })}
        </p>
      </div>
      <button
        type="button"
        onClick={() => nav(`/u/practice/${exerciseId}`)}
        className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-amber-400 sm:w-auto"
      >
        <PlayCircle className="size-4" /> {t("practice2.resume.continue")}
      </button>
    </div>
  );
}
