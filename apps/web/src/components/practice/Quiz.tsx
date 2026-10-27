import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, LayoutList, Lightbulb, Rows3, Send } from "lucide-react";
import { type GradeResp, type PublicExerciseResp, type PublicQuestionResp } from "../../lib/api";
import { clearDraft, getDraft, saveDraft } from "../../lib/draftStore";
import { useIsMobile } from "../../lib/useIsMobile";
import { Button } from "../ui";
import { cn } from "../../lib/utils";
import { Tooltip } from "../Tooltip";
import ThemeToggle from "../ThemeToggle";
import { QuestionCard } from "./QuestionCard";
import { PracticeHero } from "./PracticeHero";
import { PracticeFooter } from "./PracticeFooter";
import { PassagePanel } from "./PassagePanel";
import { LessonPanel } from "./LessonPanel";
import { AudioBar } from "./AudioBar";
import { ResultSummary } from "./ResultSummary";
import GrammarNotes, { pointsFromNotes } from "../GrammarNotes";
import { confirmAsk } from "../confirm";
import { t } from "../../i18n";

// Khoá localStorage nhớ chế độ xem (Tất cả / Từng câu).
const VIEW_MODE_KEY = "practice:viewMode";

// Quiz is identity-agnostic — the caller binds who is answering:
//  • learnerName — shown in the hero
//  • draftKey    — draft storage key (e.g. "user:<slug>")
//  • onGrade     — grading call (user: /library/:slug/grade)
//  • backTo      — link "Quay lại" sau khi chấm
export function Quiz({
  exercise,
  learnerName,
  draftKey,
  onGrade,
  backTo,
  initialAnswers,
  onAnswersChange,
}: {
  exercise: PublicExerciseResp;
  learnerName: string;
  draftKey: string;
  onGrade: (
    answers: Record<string, string>,
    meta?: { hintUsed?: boolean; hintPositions?: number[] },
  ) => Promise<GradeResp>;
  backTo: string;
  /** Seed the answers from a SERVER-side draft (grammar drill), keyed by position. */
  initialAnswers?: Record<string, string>;
  /** Mirror every answer change out (grammar drill autosaves to the server, not localStorage). */
  onAnswersChange?: (answers: Record<string, string>) => void;
}) {
  const isMobile = useIsMobile();
  const questions = exercise.questions;
  const total = questions.length;

  const [answers, setAnswers] = useState<Record<number, string>>(
    () => (initialAnswers && Object.keys(initialAnswers).length ? initialAnswers : getDraft(draftKey, exercise.exercise_id)?.answers ?? {}),
  );
  const [result, setResult] = useState<GradeResp | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  // Chế độ xem của học sinh: "all" = toàn bộ danh sách · "single" = từng câu một.
  // Nhớ lựa chọn qua localStorage để F5 không mất.
  const [viewMode, setViewMode] = useState<"all" | "single">(
    () => (typeof localStorage !== "undefined" && localStorage.getItem(VIEW_MODE_KEY) === "single" ? "single" : "all"),
  );
  const [curr, setCurr] = useState(0);
  // Chiều cao thanh audio dock đáy (mobile) — chừa padding đáy đúng bằng đó (0 trên desktop).
  const [audioBarH, setAudioBarH] = useState(0);
  // Gợi ý nghe (phụ đề chạy theo audio): hintOn = đang mở · hintUsed = đã TỪNG mở (ghi nhận
  // vào bài nộp, không tắt lại được cờ này). Xem [[audio-cues-word-sync]].
  const [hintOn, setHintOn] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  // Câu đã mở gợi ý riêng → server phạt 50% ĐÚNG những câu này.
  const [hintPositions, setHintPositions] = useState<number[]>([]);
  const graded = !!result;
  function toggleHint() {
    setHintOn((v) => {
      if (!v) setHintUsed(true); // vừa bật → ghi nhận vĩnh viễn cho lượt nộp này
      return !v;
    });
  }

  // Lưu lại chế độ xem mỗi khi đổi.
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* bỏ qua nếu trình duyệt chặn localStorage */
    }
  }, [viewMode]);

  // Lưu realtime (chỉ khi chưa nộp).
  useEffect(() => {
    if (graded) return;
    saveDraft(draftKey, exercise.exercise_id, answers, total, new Date().toISOString());
    onAnswersChange?.(answers as Record<string, string>);
  }, [answers, graded, draftKey, exercise.exercise_id, total]);

  const answeredCount = questions.filter((q) => (answers[q.position] || "").trim() !== "").length;
  const correctMap: Record<number, boolean> = {};
  const creditMap: Record<number, number> = {};
  (result?.details || []).forEach((d) => {
    correctMap[d.position] = d.correct;
    if (typeof d.credit === "number") creditMap[d.position] = d.credit;
  });
  const answerMap: Record<number, string | null> = {};
  (result?.review || []).forEach((r) => (answerMap[r.position] = r.correctAnswer));

  async function handleSubmit() {
    const left = total - answeredCount;
    const ok = await confirmAsk({
      title: t("practice.quiz.submitConfirmTitle"),
      message:
        left > 0
          ? t("practice.quiz.confirmIncomplete", { n: left })
          : t("practice.quiz.confirmComplete"),
      confirmText: t("practice.quiz.submit"),
      cancelText: t("practice.quiz.reviewAnswers"),
      danger: left > 0,
    });
    if (!ok) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await onGrade(
        Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v])),
        { hintUsed, hintPositions },
      );
      clearDraft(draftKey, exercise.exercise_id);
      // Nộp xong → chuyển thẳng sang TRANG BÁO CÁO /s/:id (một trang kết quả duy nhất).
      // THAY THẾ entry lịch sử (replace) chứ không đẩy chồng: bài đã nộp, bấm Back phải về
      // thư viện — đẩy chồng thì Back rơi lại vào trang làm bài với draft đã xóa (form rỗng).
      // Fallback: nếu server không trả submission_id → xem kết quả tại chỗ như trước.
      if (r.submission_id) {
        navigate(`/s/${r.submission_id}`, { replace: true });
        return;
      }
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("practice.quiz.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const hasPassage = !!exercise.passage;
  const hasAudio = !!exercise.audio_url;
  // Bài TỔNG HỢP (read-along): 1 đoạn văn dùng chung cho đọc + nghe → dùng LessonPanel
  // (gộp bài đọc + audio, karaoke ngay trên đoạn văn), thay vì 2 panel rời.
  const isLesson = exercise.skill === "mixed" && hasPassage;
  // Bài NGHE có phụ đề đồng bộ → cho phép "gợi ý" (bài Tổng hợp dùng LessonPanel, karaoke sẵn).
  const hintAvailable = !isLesson && !!exercise.audio_cues && exercise.audio_cues.words.length > 0;
  // Đã chấm → luôn xem toàn bộ để chữa; lúc làm → theo lựa chọn của học sinh.
  const single = !graded && viewMode === "single";
  const cur = Math.min(curr, total - 1);
  const currQ = questions[cur];

  // Kéo-thả chuột để cuộn dải số câu (thay cho scrollbar). Chỉ áp cho chuột —
  // cảm ứng vẫn dùng cuộn tự nhiên. `moved` để phân biệt kéo vs bấm chọn câu.
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, moved: false, startX: 0, startLeft: 0 });
  function onStripDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const el = stripRef.current;
    if (!el) return;
    drag.current = { down: true, moved: false, startX: e.clientX, startLeft: el.scrollLeft };
  }
  function onStripMove(e: React.PointerEvent) {
    const el = stripRef.current;
    const d = drag.current;
    if (!el || !d.down) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.startLeft - dx;
  }
  const onStripUp = () => {
    drag.current.down = false;
  };

  // Dải số tràn khung hay không → tràn thì canh trái (để câu 1 không bị đẩy khuất),
  // vừa khung thì canh giữa cho cân đối.
  const [stripOverflow, setStripOverflow] = useState(false);
  useEffect(() => {
    if (!single) return;
    const el = stripRef.current;
    if (!el) return;
    const check = () => setStripOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [single, total]);
  // Tự cuộn để nút câu đang chọn luôn hiện (canh giữa) khi prev/next hoặc bấm số.
  useEffect(() => {
    if (!single) return;
    const el = stripRef.current;
    if (!el) return;
    const btn = el.children[Math.min(curr, total - 1)] as HTMLElement | undefined;
    if (!btn) return;
    const delta =
      btn.getBoundingClientRect().left - el.getBoundingClientRect().left - (el.clientWidth - btn.clientWidth) / 2;
    el.scrollTo({ left: el.scrollLeft + delta, behavior: "smooth" });
  }, [curr, single, total]);

  function renderQuestion(q: PublicQuestionResp) {
    const idx = questions.findIndex((x) => x.position === q.position);
    return (
      <QuestionCard
        key={q.position}
        q={q}
        index={idx}
        value={answers[q.position]}
        onChange={(v) => !graded && setAnswers((a) => ({ ...a, [q.position]: v }))}
        graded={graded}
        correct={correctMap[q.position]}
        credit={creditMap[q.position]}
        correctAnswer={answerMap[q.position]}
        isMobile={isMobile}
        oneCol={single} // one-question-at-a-time mode → options in a single column (the card is wide)
        translateLevel={exercise.translate_level ?? "easy"}
        onUseHint={() => setHintPositions((p) => (p.includes(q.position) ? p : [...p, q.position]))}
      />
    );
  }

  return (
    // paddingBottom = chiều cao thanh audio dock (mobile) → footer + nội dung cuối không bị
    // thanh che, KHÔNG cần ép min-h-dvh (tránh khoảng trống lớn khi bài ngắn).
    <div className="mx-auto flex max-w-5xl flex-col" style={{ paddingBottom: audioBarH || undefined }}>
      <div>
      <PracticeHero
        title={exercise.title}
        studentName={learnerName}
        skill={exercise.skill}
        total={total}
        flush={hasPassage}
        actions={
          <>
            {/* Quay lại — mobile có kèm chữ (icon trần trong hàng nút dễ bị lướt qua);
                từ iPad (md) trở lên thu về icon-only cho gọn, chữ đã có ở tooltip. */}
            <Tooltip label={t("practice.quiz.backWithArrow")}>
              <Link to={backTo}>
                <button
                  type="button"
                  aria-label={t("practice.quiz.backWithArrow")}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 md:size-11 md:px-0 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <ArrowLeft className="size-4" />
                  {/* "Back" chứ không phải "Quay lại": hàng nút mobile chật, chữ tiếng Việt
                      dài làm nút xuống dòng. Tooltip vẫn là tiếng Việt. */}
                  <span className="md:hidden">Back</span>
                </button>
              </Link>
            </Tooltip>
            {/* Cụm phải: sáng/tối · chế độ xem · Nộp bài */}
            <div className="ml-auto flex items-center gap-2">
              {/* Sáng / tối */}
              <Tooltip label={t("practice.quiz.themeToggle")}>
                <ThemeToggle className="!size-11 border border-slate-200 dark:border-slate-800" />
              </Tooltip>
              {/* Chế độ xem — chỉ icon (Tất cả · Từng câu), có tooltip khi hover */}
              {!graded && total > 1 && (
                <div className="inline-flex h-11 shrink-0 items-center rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
                  {([
                    ["all", t("practice.quiz.viewAll"), <LayoutList key="a" className="size-4" />],
                    ["single", t("practice.quiz.viewSingle"), <Rows3 key="s" className="size-4" />],
                  ] as const).map(([v, label, ic]) => (
                    <Tooltip key={v} label={label}>
                      <button
                        type="button"
                        aria-label={label}
                        onClick={() => {
                          setViewMode(v);
                          setCurr(0);
                        }}
                        className={cn(
                          "inline-flex size-9 items-center justify-center rounded-lg transition",
                          viewMode === v
                            ? "bg-cyan-500 text-white shadow-sm shadow-cyan-500/30"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                        )}
                      >
                        {ic}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              )}
              {/* Nộp bài — icon + chữ */}
              {!graded && (
                <Button onClick={handleSubmit} disabled={submitting} className="!h-11">
                  <Send className="size-4" /> {submitting ? t("practice.quiz.submitting") : t("practice.quiz.submit")}
                </Button>
              )}
            </div>
          </>
        }
      />

      {/* Nhắc về "giá" của gợi ý — đặt ngay dưới hero, tông nhẹ, không phải lỗi. */}
      {!graded && (hintAvailable || questions.some((q) => q.hint)) && (
        <div
          className={cn(
            "mb-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed",
            hintUsed || hintPositions.length
              ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-500/10 dark:text-amber-200"
              : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
          )}
        >
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          <p>
            {hintUsed || hintPositions.length
              ? t("practice.quiz.hintPenaltyUsed")
              : t("practice.quiz.hintPenaltyNotice")}
          </p>
        </div>
      )}

      {graded && <ResultSummary score={result!.score} total={result!.total} />}
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {/* Ngữ liệu — con TRỰC TIẾP của cột cao để sticky có chỗ trượt. */}
      {isLesson ? (
        // Bài tổng hợp: 1 card gộp đọc + nghe (toggle Đọc/Nghe, karaoke trên đoạn văn).
        <LessonPanel
          className="mb-4"
          passage={exercise.passage!}
          audioUrl={exercise.audio_url}
          cues={exercise.audio_cues}
          ipaLines={exercise.passage_ipa}
          onUseTranslation={() => setHintUsed(true)}
        />
      ) : (
        <>
          {/* Bài đọc (nếu có) */}
          {hasPassage && (
            <PassagePanel
              className="mb-4"
              passage={exercise.passage!}
              ipaLines={exercise.passage_ipa}
              onUseTranslation={() => setHintUsed(true)}
            />
          )}
          {/* Audio (desktop hiện ở đây; mobile dùng thanh dính đáy) */}
          {hasAudio && (
            <AudioBar
              src={exercise.audio_url!}
              cues={exercise.audio_cues}
              hint={hintAvailable}
              hintOn={hintOn}
              onToggleHint={toggleHint}
              className="mb-4 hidden lg:block"
            />
          )}
        </>
      )}

      {/* Danh sách câu hỏi */}
      {single ? (
        <div className="flex flex-col gap-4">
          {renderQuestion(currQ)}

          {/* Điều hướng từng câu: [← Câu trước] · dải số (ẩn scrollbar, KÉO được, canh giữa) · [Câu sau →] */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={cur === 0}
              onClick={() => setCurr((c) => Math.max(0, c - 1))}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t("practice.quiz.prev")}</span>
            </button>

            {/* Kéo chuột để cuộn. Canh giữa khi vừa khung; tràn thì canh trái + tự cuộn
                tới câu đang chọn. py để ring nút đang chọn không bị cắt viền. */}
            <div
              ref={stripRef}
              onPointerDown={onStripDown}
              onPointerMove={onStripMove}
              onPointerUp={onStripUp}
              onPointerLeave={onStripUp}
              className={cn(
                "scrollbar-hide flex flex-1 cursor-grab select-none gap-1.5 overflow-x-auto px-0.5 py-1.5 active:cursor-grabbing",
                !stripOverflow && "justify-center",
              )}
            >
              {questions.map((q, i) => {
                const done = (answers[q.position] || "").trim() !== "";
                const isCur = i === cur;
                return (
                  <button
                    key={q.position}
                    type="button"
                    onClick={() => {
                      if (drag.current.moved) return; // vừa kéo → không tính là bấm chọn câu
                      setCurr(i);
                    }}
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition",
                      isCur
                        ? "bg-cyan-500 text-white shadow-sm shadow-cyan-500/30"
                        : done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-700",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={cur === total - 1}
              onClick={() => setCurr((c) => Math.min(total - 1, c + 1))}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <span className="hidden sm:inline">{t("practice.quiz.next")}</span> <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map(renderQuestion)}
        </div>
      )}

      {/* Ngữ pháp cần chú ý (sau khi chấm) — nhãn gắn sẵn theo câu, không gọi AI lúc chấm. */}
      {graded && <GrammarNotes points={pointsFromNotes(result?.grammar ?? [])} className="mt-6" />}

      {/* Nộp bài / về danh sách */}
      <div className="mt-6">
        {!graded ? (
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
            <Send className="size-4" /> {submitting ? t("practice.quiz.submitting") : t("practice.quiz.submit")}
          </Button>
        ) : (
          <Link to={backTo}>
            <Button variant="secondary">{t("practice.quiz.backWithArrow")}</Button>
          </Link>
        )}
      </div>

      {/* Lời thoại + wordlist (sau khi chấm) */}
      {graded && result?.audio_script && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-300">{t("practice.quiz.audioScriptTitle")}</h3>
          {/* Bỏ thẻ giới "(M)/(F)" trong nhãn vai — chỉ dùng để chọn giọng, không hiện cho học sinh. */}
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-500">
            {result.audio_script.replace(/\s*\((?:m|male|f|female)\)(?=\s*:)/gi, "")}
          </p>
        </div>
      )}
      {/* NGHE + ĐỌC HIỂU + TỔNG HỢP KHÔNG hiện wordlist (đã bỏ — trùng dữ liệu, đã có kho từ vựng riêng).
          read_aloud giữ wordlist nhưng render ở ReadingPractice, không qua đây. */}
      {exercise.skill !== "listening" && exercise.skill !== "reading" && exercise.skill !== "mixed" && exercise.wordlist && exercise.wordlist.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-300">{t("practice.quiz.wordlistTitle")}</h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {exercise.wordlist.map((w, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 py-2 text-sm">
                <span className="font-semibold">{w.word}</span>
                <span className="text-slate-500">{w.ipa}</span>
                <span>{w.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      </div>

      {/* Footer ngay sau nội dung (không còn khoảng trống ép bởi min-h-dvh); paddingBottom
          của root đã chừa chỗ để thanh audio dock không che footer. */}
      <PracticeFooter />

      {/* Audio dock cố định đáy (mobile) — báo chiều cao để root chừa paddingBottom.
          Bài tổng hợp KHÔNG dùng (audio nằm trong LessonPanel). */}
      {hasAudio && !isLesson && (
        <AudioBar
          src={exercise.audio_url!}
          cues={exercise.audio_cues}
          hint={hintAvailable}
          hintOn={hintOn}
          onToggleHint={toggleHint}
          sticky
          onHeight={setAudioBarH}
        />
      )}
    </div>
  );
}
