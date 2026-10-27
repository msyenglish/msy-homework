import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGoBack } from "../../lib/navState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Clock, ExternalLink, Eye, FileText, History, MessageSquareText, Mic } from "lucide-react";
import { teacherUsersApi, type UserProgress } from "../../lib/api";
import { fmtDate, pct } from "../../lib/format";
import { Badge } from "../../components/Badge";
import { HeroDecor } from "../../components/HeroDecor";
import { Avatar } from "../../components/Avatar";
import { LevelBadge } from "../../components/LevelBadge";
import { SkillThumb } from "../../components/SkillThumb";
import { ScoreRing } from "../../components/ScoreRing";
import { Tooltip } from "../../components/Tooltip";
import UserAssignDrawer from "../../components/UserAssignDrawer";
import PronunciationDrawer from "../../components/PronunciationDrawer";
import SubmissionReviewDrawer from "../../components/SubmissionReviewDrawer";
import StudentReminderMenu from "../../components/StudentReminderMenu";
import { FeedbackButton } from "../../components/FeedbackButton";
import Drawer from "../../components/Drawer";
import { Button } from "../../components/ui";
import { cn } from "../../lib/utils";
import { UserAnalyticsLazy } from "../../components/analytics/UserAnalyticsLazy";
import { t } from "../../i18n";

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/teacher/students");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["progress", id],
    queryFn: () => teacherUsersApi.progress(id!),
    enabled: !!id,
  });
  const [assigning, setAssigning] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPron, setShowPron] = useState(false);
  const [tab, setTab] = useState<"assigned" | "stats">("assigned");

  if (isLoading || !data) return <p className="py-16 text-center text-slate-500">{t("common.loading")}</p>;
  const { user: student, assignments, submissions } = data;
  const doneCount = assignments.filter((a) => a.done).length;
  // Tổng lượt nộp MỌI kỹ năng (quiz + đọc-to + nói). `submissions` chỉ là bảng quiz nên
  // dùng nó cho header sẽ ra 0 khi em chỉ làm bài đọc-to/nói — cộng attempts từng bài mới đúng.
  const totalAttempts = assignments.reduce((n, a) => n + a.attempts, 0);
  const refresh = () => qc.invalidateQueries({ queryKey: ["progress", id] });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 pb-24">
      {/* Hero chuẩn hóa */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed={student.id} />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar seed={student.id} size={64} className="ring-2 ring-white dark:ring-slate-800" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{student.name ?? student.email}</h1>
              {student.level && <LevelBadge level={student.level} size="md" />}
              {student.classes.map((c) => (
                <Badge key={c.id} tone="cyan">{c.name}</Badge>
              ))}
              {!student.active && <Badge tone="rose">{t("teacherMain.detail.suspended")}</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span><span className="font-bold text-cyan-600 dark:text-cyan-400">{assignments.length}</span> {t("teacherMain.detail.assigned")}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span><span className="font-bold text-emerald-600 dark:text-emerald-400">{doneCount}</span> {t("teacherMain.detail.done")}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span><span className="font-bold text-slate-700 dark:text-slate-200">{totalAttempts}</span> {t("teacherMain.detail.attempts")}</span>
            </p>
            {!student.email.endsWith("@lop.msyen.local") && (
              <p className="mt-0.5 text-sm text-cyan-700/80">{student.email}</p>
            )}
          </div>
          </div>

          {/* Nút chính bên phải */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={goBack}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <Button onClick={() => setAssigning(true)}><ClipboardList className="size-4" /> {t("teacherMain.detail.assign")}</Button>
            <Button variant="outline" onClick={() => navigate(`/teacher/reports?student=u:${student.id}`)}>
              <FileText className="size-4" /> {t("teacherMain.detail.report")}
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs (left) and the assigned-tab actions (right) share one row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex w-full gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:w-fit">
        {(
          [
            ["assigned", t("teacherMain.detail.tabAssigned", { done: doneCount, total: assignments.length })],
            ["stats", t("teacherMain.detail.tabStats")],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none",
              tab === k ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "assigned" && (
        <div className="flex flex-wrap items-center gap-2">
          <StudentReminderMenu student={{ name: student.name ?? null }} assignments={assignments} />
          <Button variant="secondary" size="sm" onClick={() => setShowPron(true)}>
            <Mic className="size-4" /> {t("teacherMain.detail.pronunciation")}
          </Button>
          <Button variant="secondary" size="sm" disabled={submissions.length === 0} onClick={() => setShowHistory(true)}>
            <History className="size-4" /> {t("teacherMain.detail.history", { n: submissions.length })}
          </Button>
        </div>
      )}
      </div>

      {tab === "stats" ? (
        <LearnerStats id={student.id} />
      ) : (
      <>

      {/* List card rộng rãi (tham khảo trang bài tập) */}
      {assignments.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-14 text-center dark:border-slate-700">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <ClipboardList className="size-7" />
          </div>
          <p className="font-semibold text-slate-600 dark:text-slate-300">{t("teacherMain.detail.emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("teacherMain.detail.emptyText")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            // Read-aloud attempts live in reading_submissions, not in the quiz submissions table,
            // so they do not use the quiz review/report flow.
            const openReview = () => {
              if (a.vocab_deck) window.open(`/s/${a.submissionId}`, "_blank", "noreferrer"); // deck → session report
              else if (a.read_aloud) setShowPron(true); // drawer tổng hợp phát âm (có "Tạo lại nhận xét")
              else setReviewId(a.submissionId); // quiz → drawer chữa bài
            };
            return (
              <div
                key={a.exercise_id}
                onClick={a.done && a.submissionId ? openReview : undefined}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-400/50 sm:flex-row sm:items-center sm:gap-4 dark:border-slate-800 dark:bg-slate-900",
                  a.done && a.submissionId && "cursor-pointer",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <SkillThumb skill={a.skill} readAloud={a.read_aloud} showLabel />
                  <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-bold text-slate-900 dark:text-white">{a.title}</p>
                    {!a.published && <Badge tone="amber">{t("teacherMain.exercises.status.draft")}</Badge>}
                  </div>
                  {a.teacher_note && <p className="truncate text-sm text-slate-500">{t("teacherMain.detail.note", { note: a.teacher_note })}</p>}
                  <p className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-xs text-slate-500">
                    <Clock className="size-3 shrink-0" />
                    <Tooltip label={t("teacherMain.detail.assignedAt", { date: fmtDate(a.assigned_at) })}>
                      <span className="whitespace-nowrap">
                        {a.done
                          ? t("teacherMain.detail.lastAt", { date: fmtDate(a.lastAt), count: a.attempts > 1 ? t("teacherMain.detail.times", { n: a.attempts }) : "" })
                          : t("teacherMain.detail.assignedAt", { date: fmtDate(a.assigned_at) })}
                      </span>
                    </Tooltip>
                    {a.done && !a.vocab_deck &&
                      (a.feedback ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openReview(); }}
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <MessageSquareText className="size-3" /> {t("teacherMain.detail.feedbackDone")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openReview(); }}
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-slate-400 hover:text-cyan-600 hover:underline dark:hover:text-cyan-400"
                        >
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <MessageSquareText className="size-3" /> {t("teacherMain.detail.feedbackNone")}
                        </button>
                      ))}
                    {a.done && (
                      <span className="shrink-0 whitespace-nowrap font-medium text-slate-500 dark:text-slate-400">
                        <span className="text-slate-300 dark:text-slate-600">·</span> {a.lastScore}/{a.lastTotal}
                      </span>
                    )}
                    {a.done && a.submissionId && (
                      <a
                        href={`/s/${a.submissionId}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-cyan-600 hover:underline dark:text-cyan-400"
                      >
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <ExternalLink className="size-3" /> Report
                      </a>
                    )}
                  </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end sm:gap-2.5">
                  {a.done ? (
                    <ScoreRing score={a.lastScore ?? 0} total={a.lastTotal ?? 0} size={44} showFraction={false} />
                  ) : (
                    <Badge tone="slate">{t("teacherMain.detail.notDone")}</Badge>
                  )}
                  {a.done && a.submissionId && !a.vocab_deck && (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {a.read_aloud ? (
                        // Đọc to → drawer tổng hợp phát âm (có "Tạo lại nhận xét").
                        <Button size="sm" variant="outline" className="!h-8 !px-2.5 !text-xs" onClick={() => setShowPron(true)}>
                          <Mic className="size-3.5" /> {t("teacherMain.detail.viewFeedback")}
                        </Button>
                      ) : (
                        <>
                          <FeedbackButton submissionId={a.submissionId!} hasFeedback={!!a.feedback} onDone={refresh} />
                          <Button size="sm" variant="outline" className="!h-8 !px-2.5 !text-xs" onClick={() => setReviewId(a.submissionId)}>
                            <Eye className="size-3.5" /> {t("teacherMain.detail.review")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {assigning && (
        <UserAssignDrawer
          user={{ id: student.id, name: student.name ?? null, email: student.email, level_id: student.level_id ?? null, classes: student.classes }}
          onClose={() => setAssigning(false)}
          onSaved={refresh}
        />
      )}
      <PronunciationDrawer studentId={showPron ? student.id : null} studentName={student.name ?? student.email} open={showPron} onClose={() => setShowPron(false)} />
      <SubmissionReviewDrawer submissionId={reviewId} onClose={() => setReviewId(null)} onSaved={refresh} />
      <HistoryDrawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        submissions={submissions}
        onPick={(sid) => {
          setShowHistory(false);
          setReviewId(sid);
        }}
      />
    </div>
  );
}

/** Study analytics of one learner (activity, skills, streak), loaded when the tab opens. */
function LearnerStats({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["teacher-user-analytics", id],
    queryFn: () => teacherUsersApi.analytics(id),
  });
  if (isError) return <p className="py-16 text-center text-rose-500">{t("teacherMain.detail.loadingError")}</p>;
  if (isLoading || !data) return <p className="py-16 text-center text-slate-500">{t("common.loading")}</p>;
  return <UserAnalyticsLazy data={data} />;
}

function HistoryDrawer({
  open,
  onClose,
  submissions,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  submissions: UserProgress["submissions"];
  onPick: (id: string) => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} width="max-w-lg" icon={<History className="size-5" />} title={t("teacherMain.detail.historyTitle")} description={t("teacherMain.detail.historyDescription", { n: submissions.length })}>
      <div className="relative">
        <div className="absolute bottom-3 left-2 top-3 w-0.5 bg-slate-200 dark:bg-slate-700" />
        <div className="space-y-3">
          {submissions.map((s) => {
            const p = pct(s.score, s.total);
            const dot = p >= 80 ? "bg-emerald-500" : p >= 50 ? "bg-amber-500" : "bg-rose-500";
            const tone = p >= 80 ? "emerald" : p >= 50 ? "amber" : "rose";
            return (
              <button key={s.id} onClick={() => onPick(s.id)} className="group relative flex w-full items-center gap-4 text-left">
                <span className={cn("relative z-10 size-[18px] shrink-0 rounded-full ring-4 ring-slate-50 dark:ring-slate-900", dot)} />
                <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 transition group-hover:border-cyan-400 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-100">{s.exercise}</p>
                    <Badge tone={tone} className="shrink-0">{p}%</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {fmtDate(s.submitted_at)} · {s.score}/{s.total}
                    {s.hasFeedback ? t("teacherMain.detail.historyFeedback") : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
