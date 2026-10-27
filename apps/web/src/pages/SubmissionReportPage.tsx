import { type CSSProperties, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Captions, ChevronRight, GraduationCap, Lightbulb, RotateCcw, Sparkles, Target } from "lucide-react";
import { type VocabDeckResult } from "@msyen/shared";
import { attemptHistoryApi, publicApi, type ReadingResult, type SubmissionReportView, type WritingResult } from "../lib/api";
import { fmtDate, pct } from "../lib/format";
import { ScoreRing } from "../components/ScoreRing";
import { SkillThumb } from "../components/SkillThumb";
import { Badge } from "../components/Badge";
import { HeroDecor } from "../components/HeroDecor";
import { FeedbackContent } from "../components/FeedbackContent";
import { SpeakButton } from "../components/practice/vocab/shell";
import { skillUi } from "../lib/skills";
import { ReadingResultView } from "../components/practice/ReadingPractice";
import { RecordingPanel } from "../components/practice/RecordingPanel";
import { WritingResultView } from "../components/practice/WritingPractice";
import { VocabReportView } from "../components/practice/vocab/VocabReportView";
import { BrandLogo } from "../components/Logo";
import GrammarNotes, { pointsFromNotes } from "../components/GrammarNotes";
import { Button } from "../components/ui";
import { cn } from "../lib/utils";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { PageLoading } from "../components/PageLoading";
import { AttemptHistory } from "../components/AttemptHistory";
import { ResumeAttemptCard } from "../components/practice/ResumeAttemptCard";
import { redoPlan } from "../components/practice/vocab/redo";
import { useGoBack } from "../lib/navState";
import { t } from "../i18n";

// Màu họa tiết nền hero theo tông kỹ năng (khớp skillUi.tone).
const DECOR_COLOR: Record<string, string> = {
  sky: "text-sky-500/20 dark:text-sky-400/15",
  emerald: "text-emerald-500/20 dark:text-emerald-400/15",
  violet: "text-violet-500/20 dark:text-violet-400/15",
  amber: "text-amber-500/20 dark:text-amber-400/15",
  rose: "text-rose-500/20 dark:text-rose-400/15",
  indigo: "text-indigo-500/20 dark:text-indigo-400/15",
  slate: "text-slate-500/20 dark:text-slate-400/15",
};

// Vùng gradient nhẹ (blob) theo tông kỹ năng — đặt góc dưới phải hero.
const HERO_BLOB: Record<string, string> = {
  sky: "bg-sky-400/20 dark:bg-sky-500/10",
  emerald: "bg-emerald-400/20 dark:bg-emerald-500/10",
  violet: "bg-violet-400/20 dark:bg-violet-500/10",
  amber: "bg-amber-400/20 dark:bg-amber-500/10",
  rose: "bg-rose-400/20 dark:bg-rose-500/10",
  indigo: "bg-indigo-400/20 dark:bg-indigo-500/10",
  slate: "bg-slate-400/15 dark:bg-slate-500/10",
};

// Lưới mờ phủ toàn card, làm nhạt dần về góc dưới-trái (mask) để không rối chữ.
const HERO_GRID: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgb(148 163 184 / 0.10) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.10) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
  maskImage: "radial-gradient(130% 110% at 100% 0%, black 35%, transparent 78%)",
  WebkitMaskImage: "radial-gradient(130% 110% at 100% 0%, black 35%, transparent 78%)",
};

// Trang báo cáo 1 lượt nộp — CÔNG KHAI (chia sẻ cho phụ huynh qua link).
// Đọc to / nói: dùng CHÍNH view kết quả practice (ReadingResultView/SpeakingResultView,
// chế độ report) → 1 nơi maintain. Quiz giữ layout câu-hỏi riêng.
export default function SubmissionReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // One step back, landing where the learner was in the list — not at the top of the library.
  const goBack = useGoBack("/u/library");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-submission", id],
    queryFn: () => publicApi.submissionReport(id!),
    enabled: !!id,
    retry: false,
    // Nhận xét của cô sinh nền qua queue → poll khi còn "pending" (dừng khi có nhận xét/xong).
    refetchInterval: (q) => (q.state.data?.feedback_status === "pending" ? 3000 : false),
  });
  useDocumentTitle(data ? `${data.exerciseTitle} — ${data.studentName}` : null);
  // Word playing back in the recording (read-aloud) → highlighted in sync inside the graded passage.
  const [playbackWordIdx, setPlaybackWordIdx] = useState<number | null>(null);

  const recordUrl =
    data && data.kind === "reading"
      ? (data.result as ReadingResult)?.audio_url ?? null
      : null;
  const readWords = data?.kind === "reading" ? (data.result as ReadingResult).words : null;
  // Vocab: which words (and which activities) are worth another go.
  const vocabRedo = data?.kind === "vocab" ? redoPlan(data.result as VocabDeckResult) : [];
  // Audio đang phát ở giây `cur` → từ nào trong bản chấm đang được đọc (dữ liệu cũ thiếu mốc → null).
  function handleRecordTime(cur: number) {
    if (!readWords?.length || cur <= 0) return setPlaybackWordIdx(null);
    const ms = cur * 1000;
    const idx = readWords.findIndex(
      (w) => w.offsetMs != null && w.durationMs != null && ms >= w.offsetMs && ms < w.offsetMs + w.durationMs,
    );
    setPlaybackWordIdx(idx >= 0 ? idx : null);
  }

  if (isLoading) return <PageLoading full className="bg-slate-100 dark:bg-slate-950" />;
  if (isError || !data)
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-center text-slate-500 dark:bg-slate-950">{t("report.submission.notFound")}</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-6 dark:bg-slate-950 sm:py-8">
      <div className="mx-auto max-w-[800px] px-4">
        {/* Tiêu đề bài + học sinh (quiz kèm vòng điểm; đọc to/nói vòng điểm nằm trong view).
            Hero: nền gradient nhẹ + họa tiết theo tông kỹ năng cho nổi bật, không "basic". */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
          {/* Lưới mờ toàn card */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={HERO_GRID} />
          {/* Hai vùng gradient nhẹ: cyan (thương hiệu) trên-trái + màu kỹ năng dưới-phải */}
          <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 size-52 rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-500/10" />
          <div aria-hidden className={cn("pointer-events-none absolute -bottom-24 -right-16 size-56 rounded-full blur-3xl", HERO_BLOB[skillUi(data.skill)?.tone ?? "slate"] ?? HERO_BLOB.slate)} />
          {/* Họa tiết motif góc phải theo tông kỹ năng */}
          <HeroDecor seed={data.exercise_id ?? data.exerciseTitle} className={DECOR_COLOR[skillUi(data.skill)?.tone ?? "slate"] ?? DECOR_COLOR.slate} mobile />
          <div className="relative flex items-center gap-4">
            <SkillThumb skill={data.skill} readAloud={data.read_aloud} showLabel />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-extrabold text-slate-900 dark:text-white">{data.exerciseTitle}</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{data.studentName}</span> · {fmtDate(data.submitted_at)}
              </p>
              {data.hint_used && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                  <Captions className="size-3" /> {t("report.submission.hintUsed")}
                </span>
              )}
            </div>
            {data.kind === "quiz" && <ScoreRing score={data.score ?? 0} total={data.total ?? 0} size={84} className="hidden sm:block" />}
            {/* Vocab sessions store a percentage, so the ring runs out of 100, not out of the word count. */}
            {data.kind === "vocab" && <ScoreRing score={data.score ?? 0} total={100} showFraction={false} size={84} className="hidden sm:block" />}
          </div>
        </div>

        {/* An unfinished attempt at THIS exercise (a redo left half-done counts) — above the
            feedback, because it is work to continue rather than a result to read. */}
        {data.exercise_id && <ResumeAttemptCard exerciseId={data.exercise_id} kind={data.kind} />}

        {/* Body per submission type. */}
        {data.kind === "quiz" ? (
          <QuizBody data={data} />
        ) : data.kind === "reading" ? (
          <div className="mt-4">
            <ReadingResultView
              result={data.result as ReadingResult}
              report
              activeWordIdx={playbackWordIdx}
            />
          </div>
        ) : data.kind === "vocab" ? (
          <VocabReportView
            result={data.result as VocabDeckResult}
            score={data.score ?? 0}
            total={data.total ?? 0}
            words={data.vocab_words ?? null}
          />
        ) : (
          <div className="mt-4">
            <WritingResultView result={data.result as WritingResult} prompt={data.prompt ?? ""} report />
          </div>
        )}

        {/* Các lượt làm khác của CHÍNH bài này. Chỉ hiện với người học đang đăng nhập (endpoint
            cần phiên) — người lạ mở link chia sẻ sẽ 401 và khối này tự ẩn. */}
        {data.exercise_id && (
          <AttemptHistory
            slug={data.exercise_id}
            fetchHistory={attemptHistoryApi[data.kind]}
            currentId={id}
            onOpen={(sid) => navigate(`/s/${sid}`)}
            defaultOpen
          />
        )}

        {/* Nhận xét TAY của giáo viên (nếu có) — view kết quả chỉ hiện nhận xét AI. */}
        {data.teacher_feedback?.trim() && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{t("report.submission.teacherNote")}</p>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">{data.teacher_feedback}</p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
          <span>{t("report.submission.brandReport")}</span>
          <BrandLogo height={26} />
        </div>

        {/* Nhóm nút DÍNH ĐÁY — cho MỌI dạng bài. Trước đây chỉ bật cho quiz vì đọc to/nói xem
            báo cáo qua ?kq= ở trang làm bài (đã có thanh riêng); nay điều hướng thẳng vào
            đây nên thiếu thanh này là em không có đường quay lại.
            -mx-4: tràn sát mép trên mobile (bù px-4 của container).
            -mb-6/-mb-8: bù py của trang → thanh chạm đúng đáy tài liệu khi cuộn hết. */}
        <div className="sticky bottom-0 z-30 -mx-4 -mb-6 mt-4 space-y-2 border-t border-slate-200 bg-slate-100/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mb-8 dark:border-slate-800 dark:bg-slate-950/95">
          {/* Bản thu âm — gấp gọn ở thanh đáy (như trang làm bài): bung ra mới hiện player,
              phát tới đâu tô sáng từ đó trong đoạn đã chấm. */}
          <RecordingPanel url={recordUrl} onTime={handleRecordTime} onCollapse={() => setPlaybackWordIdx(null)} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goBack}
              aria-label={t("common.back")}
              title={t("common.back")}
              className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="size-5" /> {t("common.back")}
            </button>
            {data.exercise_id && (
              <Button variant="outline" className="flex-1" size="lg" onClick={() => navigate(`/u/practice/${data.exercise_id}`)}>
                <RotateCcw className="size-4" /> {t("report.submission.retry")}
              </Button>
            )}
            {/* Vocab deck: a short run over just the words that went wrong (pronunciation under
                50 counts), each led by its flashcard. The plan travels in router state. */}
            {data.exercise_id && vocabRedo.length > 0 && (
              <Button
                className="flex-1"
                size="lg"
                onClick={() => navigate(`/u/practice/${data.exercise_id}`, { state: { redo: vocabRedo } })}
              >
                <Target className="size-4" /> {t("report.submission.retryWrong", { n: vocabRedo.length })}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Ô số thứ tự câu (đồng bộ với thumb ở trang làm bài).
function NumBadge({ n, correct }: { n: number; correct: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tabular-nums",
        correct
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      )}
    >
      {String(n).padStart(2, "0")}
    </span>
  );
}

function QuizBody({ data }: { data: SubmissionReportView }) {
  const navigate = useNavigate();
  const percent = pct(data.score ?? 0, data.total ?? 0);
  const items = data.items ?? [];
  const wrongCount = items.filter((i) => !i.correct).length;
  // Câu SAI luôn mở; câu ĐÚNG gấp gọn — mở từng câu (open) hoặc mở hết (openAll).
  const [openAll, setOpenAll] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggleOne = (pos: number) =>
    setOpen((prev) => {
      const n = new Set(prev);
      n.has(pos) ? n.delete(pos) : n.add(pos);
      return n;
    });
  const tone =
    percent >= 80
      ? { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" }
      : percent >= 50
        ? { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" }
        : { text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" };
  return (
    <>
      {/* Thanh tiến độ — chỉ mobile */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className={cn("font-extrabold", tone.text)}>{percent}%</span>
          <span className="font-semibold text-slate-500">{data.score}/{data.total}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${percent}%` }} />
        </div>
      </div>

      {data.feedback ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50/80 to-white p-5 shadow-sm dark:border-cyan-900 dark:from-cyan-500/10 dark:to-slate-900">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            <Sparkles className="size-4" /> {t("report.report.teacherFeedback")}
          </h2>
          <FeedbackContent text={data.feedback} />
        </div>
      ) : data.feedback_status === "pending" ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-5 text-sm text-cyan-700 dark:border-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-300">
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          {t("report.submission.feedbackPending")}
        </div>
      ) : null}

      {wrongCount === 0 && items.length > 0 && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 text-center dark:border-emerald-800 dark:bg-emerald-500/10">
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{t("report.submission.perfect")}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4">
          {/* Tiêu đề mục + nút mở/thu tất cả */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t("report.submission.results", { n: items.length })}
              {wrongCount > 0 && <span className="text-amber-600 dark:text-amber-400">{t("report.submission.wrongCount", { n: wrongCount })}</span>}
            </h2>
            <button
              type="button"
              onClick={() => {
                setOpenAll((v) => !v);
                if (openAll) setOpen(new Set()); // thu gọn: đóng cả câu đã mở tay
              }}
              className="text-xs font-semibold text-sky-600 transition hover:text-sky-500 dark:text-sky-400"
            >
              {openAll ? t("report.submission.collapse") : t("report.submission.expandAll")}
            </button>
          </div>

          <div className="space-y-2">
            {items.map((it) => {
              const n = it.position + 1;
              const expanded = !it.correct || openAll || open.has(it.position);
              // Câu ĐÚNG + đang gấp → 1 dòng, bấm để mở.
              if (it.correct && !expanded) {
                return (
                  <button
                    key={it.position}
                    type="button"
                    onClick={() => toggleOne(it.position)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-left transition hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10"
                  >
                    <NumBadge n={n} correct />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">{it.question}</span>
                    <Badge tone="emerald">{t("report.submission.correct")}</Badge>
                    <ChevronRight className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                  </button>
                );
              }
              // Câu SAI (luôn mở) hoặc câu ĐÚNG đã mở → thẻ đầy đủ.
              return (
                <div
                  key={it.position}
                  className={cn(
                    "rounded-xl border p-3",
                    it.correct
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-500/5"
                      : "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-500/10",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <NumBadge n={n} correct={it.correct} />
                    <p className="min-w-0 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{it.question}</p>
                    <Badge tone={it.correct ? "emerald" : "amber"}>{it.correct ? t("report.submission.correct") : t("report.submission.incorrect")}</Badge>
                  </div>
                  <div className="mt-2 space-y-0.5 pl-[38px]">
                    {/* Câu SAI: kèm câu trả lời của học sinh. Câu ĐÚNG: chỉ đáp án (để đối chiếu). */}
                    {!it.correct && (
                      <p className="text-sm">
                        <span className="text-slate-500">{t("report.submission.answer")}</span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{it.studentAnswer?.trim() ? it.studentAnswer : t("report.submission.blank")}</span>
                      </p>
                    )}
                    <p className="text-sm">
                      <span className="text-slate-500">{t("report.submission.correctAnswer")}</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{it.correctAnswer}</span>
                    </p>
                  </div>
                  {/* Giải thích — KHÔNG khung/nền, chỉ icon + chữ. */}
                  {it.explanation?.trim() && (
                    <div className="mt-2 flex gap-2 pl-[38px] text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-cyan-500" />
                      <p className="whitespace-pre-line">{it.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lời thoại (bài nghe) — hiện sau khi nộp. */}
      {data.audio_script?.trim() && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{t("report.submission.transcript")}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-500 dark:text-slate-400">{data.audio_script}</p>
        </div>
      )}

      {/* Từ vựng — mỗi từ có nút loa (sóng động khi phát, bấm để nghe phát âm). */}
      {data.wordlist && data.wordlist.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("report.submission.vocabulary")}</h2>
            {/* Nối sang trang luyện từ vựng — biến gợi ý "ôn lại từ" thành hành động cụ thể. */}
            <button
              type="button"
              onClick={() => navigate("/u/vocabulary")}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-400"
            >
              <GraduationCap className="size-3.5" /> {t("report.submission.practiceVocabulary")}
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.wordlist.map((w, i) => (
              // Click cả row = bấm chính nút loa bên trong → sóng loa động y như click icon.
              // querySelector tới <button> của SpeakButton; nút tự chặn nổi bọt nên không lặp.
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={(e) => e.currentTarget.querySelector("button")?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.currentTarget.querySelector("button")?.click();
                  }
                }}
                className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                {/* Chặn nổi bọt để bấm đúng nút không kích hoạt row (khỏi phát 2 lần). */}
                <span onClick={(e) => e.stopPropagation()}>
                  <SpeakButton word={w.word} variant="inline" audio={{ female: w.audio_word, male: w.audio_word_male }} />
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{w.word}</span>
                {w.ipa && <span className="font-ipa text-xs text-cyan-600 dark:text-cyan-400">{w.ipa}</span>}
                <span className="ml-auto pl-3 text-right text-slate-500">{w.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <GrammarNotes points={pointsFromNotes(data.grammar ?? [])} className="mt-5" />
    </>
  );
}
