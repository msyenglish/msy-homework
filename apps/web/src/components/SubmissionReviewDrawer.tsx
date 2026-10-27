import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, Maximize2, Minimize2, Save, Sparkles, X } from "lucide-react";
import { t } from "../i18n";
import { submissionsApi, type SubmissionReview } from "../lib/api";
import { fmtDate, pct } from "../lib/format";
import { SkillThumb } from "./SkillThumb";
import Drawer from "./Drawer";
import { Button, Textarea } from "./ui";
import { cn } from "../lib/utils";

// Nhận diện chỗ trống trong câu (khớp FillBlankInput): `___` (≥3 gạch dưới) · `{}` · `[...]`.
const BLANK_RE = /_{3,}|\{\}|\[[^\]]*\]/;

// Hiển thị câu hỏi với đáp án đúng ĐIỀN THẲNG vào chỗ trống (gạch chân, tô màu) —
// thay cho việc ghi "Đáp án đúng: …" thành 1 dòng riêng cho dễ đọc.
// Nếu câu không có marker chỗ trống thì trả về null → nơi gọi tự xử lý dự phòng.
function renderFilledQuestion(question: string, answer: string | null) {
  const m = answer?.trim() ? BLANK_RE.exec(question) : null;
  if (!m || !answer) return null;
  return (
    <>
      {question.slice(0, m.index)}
      <span className="font-semibold text-emerald-700 underline decoration-2 underline-offset-2 dark:text-emerald-400">
        {answer}
      </span>
      {question.slice(m.index + m[0].length)}
    </>
  );
}

export default function SubmissionReviewDrawer({
  submissionId,
  onClose,
  onSaved,
}: {
  submissionId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { data, isLoading } = useQuery<SubmissionReview>({
    queryKey: ["submission", submissionId],
    queryFn: () => submissionsApi.review(submissionId!),
    enabled: !!submissionId,
  });
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setFeedback(data?.teacherFeedback ?? "");
    setShowAll(false);
    setExpanded(false);
  }, [data]);

  async function generateFeedback() {
    if (!submissionId) return;
    setGenerating(true);
    try {
      const { feedback: text } = await submissionsApi.aiFeedback(submissionId);
      setFeedback(text);
      toast.success(t("teacherDrawers.review.toastGeneratedFeedback"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.review.errorGenerateFeedback"));
    } finally {
      setGenerating(false);
    }
  }

  async function saveFeedback() {
    if (!submissionId) return;
    setSaving(true);
    try {
      await submissionsApi.setFeedback(submissionId, feedback);
      toast.success(t("teacherDrawers.review.toastSavedFeedback"));
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.review.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  const wrong = data?.items.filter((it) => !it.correct) ?? [];
  const correctCount = (data?.items.length ?? 0) - wrong.length;
  const shown = showAll ? (data?.items ?? []) : wrong;

  return (
    <Drawer
      open={!!submissionId}
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex items-center gap-3">
          {data?.skill && <SkillThumb skill={data.skill} size="sm" />}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-base font-bold leading-tight">
              {data ? `${data.exerciseTitle} — ${pct(data.score, data.total)}%` : t("teacherDrawers.review.titleFallback")}
            </span>
            {data && (
              <span className="truncate text-xs font-normal text-slate-500">
                {data.studentName} · {data.score}/{data.total} · {fmtDate(data.submitted_at)}
              </span>
            )}
          </span>
        </span>
      }
      footer={
        <>
          {data && (
            <p className="mr-auto self-center text-sm text-slate-500">
              <span className="font-bold text-rose-600 dark:text-rose-400">{wrong.length}</span>{" "}
              {t("teacherDrawers.review.wrongSuffix")}
              <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{correctCount}</span>{" "}
              {t("teacherDrawers.review.correctSuffix")}
            </p>
          )}
          <a href={`/teacher/submissions/${submissionId}`} target="_blank" rel="noreferrer">
            <Button variant="outline"><ExternalLink className="size-4" /> {t("teacherDrawers.review.openFull")}</Button>
          </a>
          <Button disabled={saving} onClick={saveFeedback}><Save className="size-4" /> {saving ? t("common.saving") : t("teacherDrawers.review.saveFeedback")}</Button>
        </>
      }
    >
      {isLoading || !data ? (
        <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("teacherDrawers.review.feedbackLabel")}
              </label>
              <div className="flex items-center gap-1">
                {/* Click to expand feedback box */}
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                  {expanded ? t("teacherDrawers.review.collapse") : t("teacherDrawers.review.expand")}
                </button>
                <button
                  type="button"
                  onClick={generateFeedback}
                  disabled={generating}
                  title={t("teacherDrawers.review.generateAiTitle")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 disabled:opacity-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                >
                  <Sparkles className={cn("size-3.5", generating && "animate-pulse")} />
                  {generating ? t("teacherDrawers.review.generating") : t("teacherDrawers.review.generateFeedback")}
                </button>
              </div>
            </div>
            <Textarea
              resize={false}
              rows={expanded ? 14 : 3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t("teacherDrawers.review.feedbackPlaceholder")}
            />
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {showAll ? t("teacherDrawers.review.allQuestions") : t("teacherDrawers.review.wrongQuestions")}
            </h4>
            {correctCount > 0 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
              >
                {showAll ? t("teacherDrawers.review.showWrongOnly") : t("teacherDrawers.review.showCorrectAlso", { n: correctCount })}
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-800 dark:bg-emerald-500/10">
              <p className="font-bold text-emerald-700 dark:text-emerald-400">{t("teacherDrawers.review.allCorrect")}</p>
              <p className="mt-0.5 text-sm text-slate-500">{t("teacherDrawers.review.noWrongQuestions")}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {shown.map((it) => (
                <div
                  key={it.position}
                  className={cn(
                    "rounded-lg border p-3",
                    it.correct
                      ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-500/10"
                      : "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-500/10",
                  )}
                >
                  {(() => {
                    // Ưu tiên điền đáp án đúng thẳng vào chỗ trống của câu (gạch chân, tô màu).
                    const filled = renderFilledQuestion(it.question, it.correctAnswer);
                    return (
                      <>
                        <div className="mb-1 flex items-start gap-2">
                          {it.correct ? (
                            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          ) : (
                            <X className="mt-0.5 size-4 shrink-0 text-amber-600" />
                          )}
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {filled ?? it.question}
                          </p>
                        </div>
                        <div className="ml-6 space-y-0.5 text-sm">
                          <p>
                            <span className="text-slate-500">{t("teacherDrawers.review.studentLabel")}</span>
                            <span className={cn("font-semibold", it.correct ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                              {it.studentAnswer?.trim() ? it.studentAnswer : t("teacherDrawers.review.blankAnswer")}
                            </span>
                          </p>
                          {/* Question has no blank marker -> show correct answer separately */}
                          {!it.correct && !filled && (
                            <p>
                              <span className="text-slate-500">{t("teacherDrawers.review.correctAnswerLabel")}</span>
                              <span className="font-semibold text-emerald-700 underline decoration-2 underline-offset-2 dark:text-emerald-400">{it.correctAnswer}</span>
                            </p>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
