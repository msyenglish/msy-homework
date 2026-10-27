import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Captions, Check, X } from "lucide-react";
import { submissionsApi, type SubmissionReview } from "../../lib/api";
import { fmtDate, pct } from "../../lib/format";
import { Badge } from "../../components/Badge";
import { SkillThumb } from "../../components/SkillThumb";
import ThemeToggle from "../../components/ThemeToggle";
import { Button } from "../../components/ui";
import { cn } from "../../lib/utils";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useHistoryState } from "../../lib/navState";
import { t } from "../../i18n";

// Trang chữa bài ĐẦY ĐỦ cho giáo viên (mở tab mới): đoạn văn / audio / wordlist
// + câu hỏi. Mặc định chỉ hiển thị câu SAI (bấm để xem tất cả).
export default function SubmissionReviewPage() {
  const { submissionId } = useParams();
  const { data, isLoading } = useQuery<SubmissionReview>({
    queryKey: ["submission", submissionId],
    queryFn: () => submissionsApi.review(submissionId!),
    enabled: !!submissionId,
  });
  // "Show correct answers too" toggle — throw-away view state, restored via useHistoryState so
  // Back to this page (from a link inside a question, if any) keeps it as the learner left it.
  const [showAll, setShowAll] = useHistoryState("showAll", false);
  useDocumentTitle(data ? t("teacherMain.review.title", { name: data.studentName }) : null);

  if (isLoading || !data) return <p className="py-20 text-center text-slate-500">{t("common.loading")}</p>;

  const percent = pct(data.score, data.total);
  const wrong = data.items.filter((it) => !it.correct);
  const correctCount = data.items.length - wrong.length;
  const shown = showAll ? data.items : wrong;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <SkillThumb skill={data.skill} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-extrabold text-slate-900 dark:text-white">{data.exerciseTitle}</h1>
            <p className="truncate text-xs text-slate-500">
              {data.studentName} · {data.score}/{data.total} · {fmtDate(data.submitted_at)}
            </p>
            {data.hint_used && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                <Captions className="size-3" /> {t("teacherMain.review.hintUsed")}
              </span>
            )}
          </div>
          <Badge tone={percent >= 80 ? "emerald" : percent >= 50 ? "amber" : "rose"}>{percent}%</Badge>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-20">
        {/* Bối cảnh đầy đủ */}
        {data.passage && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t("teacherMain.review.passage")}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">{data.passage}</p>
          </section>
        )}
        {data.audio_url && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t("teacherMain.review.audio")}</h2>
            <audio controls src={data.audio_url} className="w-full" />
          </section>
        )}
        {data.audio_script && (
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{t("teacherMain.review.script")}</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{data.audio_script}</p>
          </section>
        )}

        {/* Thanh trạng thái + toggle */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            <span className="font-bold text-rose-600 dark:text-rose-400">{wrong.length}</span> {t("teacherMain.review.wrong")}
            <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{correctCount}</span> {t("teacherMain.review.correct")}
          </p>
          {correctCount > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t("teacherMain.review.onlyWrong") : t("teacherMain.review.showCorrect", { n: correctCount })}
            </Button>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center dark:border-emerald-800 dark:bg-emerald-500/10">
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{t("teacherMain.review.allCorrect")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((it) => (
              <QuestionReview key={it.position} it={it} />
            ))}
          </div>
        )}

        {data.wordlist && data.wordlist.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t("teacherMain.review.vocabulary")}</h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.wordlist.map((w, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 py-2 text-sm">
                  <span className="font-semibold">{w.word}</span>
                  <span className="text-slate-500">{w.ipa}</span>
                  <span>{w.meaning}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function QuestionReview({
  it,
}: {
  it: SubmissionReview["items"][number];
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-5 dark:bg-slate-900",
        it.correct
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-500/10"
          : "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-500/10",
      )}
    >
      <div className="mb-3 flex items-start gap-2">
        {it.correct ? (
          <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        ) : (
          <X className="mt-0.5 size-5 shrink-0 text-amber-600" />
        )}
        <p className="font-medium leading-snug text-slate-800 dark:text-slate-100">{it.question}</p>
      </div>

      {it.type === "multiple_choice" && it.options ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {it.options.map((opt) => {
            const isStudent = opt === it.studentAnswer;
            const isCorrect = opt === it.correctAnswer;
            return (
              <div
                key={opt}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  isCorrect && "border-emerald-500 bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
                  isStudent && !isCorrect && "border-rose-400 bg-rose-100 font-semibold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
                  !isStudent && !isCorrect && "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
                )}
              >
                {opt}
                {isStudent && <span className="ml-1 text-xs opacity-70">{t("teacherMain.review.studentPicked")}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ml-7 space-y-0.5 text-sm">
          <p>
            <span className="text-slate-500">{t("teacherMain.review.studentAnswer")}</span>
            <span className={cn("font-semibold", it.correct ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
              {it.studentAnswer?.trim() ? it.studentAnswer : t("teacherMain.review.emptyAnswer")}
            </span>
          </p>
          {!it.correct && (
            <p>
              <span className="text-slate-500">{t("teacherMain.review.correctAnswer")}</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{it.correctAnswer}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
