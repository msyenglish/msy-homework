import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import {
  exercisesApi,
  videoPreviewApi,
  writingPreviewApi,
  type PublicExerciseResp,
  type ReadingHistoryItem,
  type RecordApi,
} from "../../lib/api";
import { cn } from "../../lib/utils";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useGoBack } from "../../lib/navState";
import ThemeToggle from "../../components/ThemeToggle";
import { Quiz } from "../../components/practice/Quiz";
import { ExerciseTranslateDrill } from "../../components/practice/ExerciseTranslateDrill";
import { DictationPractice } from "../../components/practice/DictationPractice";
import { VocabDeckExercise } from "../../components/practice/VocabDeckExercise";
import { ReadingPractice } from "../../components/practice/ReadingPractice";
import { WritingPractice } from "../../components/practice/WritingPractice";
import VideoPracticePage from "../user/VideoPracticePage";
import { PageLoading } from "../../components/PageLoading";
import { t } from "../../i18n";

// XEM THỬ (chỉ giáo viên): mở đúng giao diện học sinh mà KHÔNG cần mã, không cần tự giao
// bài cho mình, chạy được cả khi bài còn nháp. Dùng để soát bài vừa tạo bằng AI.
// Bài quiz chấm thử được (server chấm thật nhưng KHÔNG lưu bài nộp); bài ghi âm thì chỉ xem
// giao diện — chấm phát âm tốn tiền Azure và cần danh tính người học để lưu kết quả.

const RECORD_PREVIEW_MSG = "teacherMain.preview.recordUnavailable" as const;

/** Stub RecordApi cho bài đọc to/nói: hiện đủ giao diện, chặn ở bước nộp bản ghi. */
const previewRecordApi: RecordApi<never> = {
  submit: () => Promise.reject(new Error(t(RECORD_PREVIEW_MSG))),
  pollJob: () => Promise.reject(new Error(t(RECORD_PREVIEW_MSG))),
  result: () => Promise.reject(new Error(t(RECORD_PREVIEW_MSG))),
  latest: () => Promise.resolve(null),
  history: () => Promise.resolve([] as ReadingHistoryItem[]),
};

export default function ExercisePreviewPage() {
  const { slug } = useParams();
  const [exercise, setExercise] = useState<PublicExerciseResp | null>(null);
  const [error, setError] = useState("");
  useDocumentTitle(exercise ? t("teacherMain.preview.title", { title: exercise.title }) : t("teacherMain.preview.shortTitle"));

  useEffect(() => {
    let active = true;
    setExercise(null);
    setError("");
    exercisesApi
      .preview(slug!)
      .then((d) => active && setExercise(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : t("teacherMain.preview.loadError")));
    return () => {
      active = false;
    };
  }, [slug]);

  const back = "/teacher/exercises";
  // One step back, like the browser's own Back — falls back to the library only when this tab
  // was opened straight from a link (no history to step into).
  const goBack = useGoBack(back);
  // Vocab deck: the server resolves `vocab_items` (as /library/:slug does) → branch BEFORE <Quiz>,
  // since a deck exercise has no questions.
  const deck = exercise?.vocab_deck && exercise.vocab_items?.length ? exercise : null;

  return (
    <div className="relative">
      {/* Banner: makes it obvious this is a preview, not the learner's real exercise. */}
      <div className="no-print sticky top-0 z-30 flex shrink-0 items-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white">
        <Eye className="size-4" />
        <span>{t("teacherMain.preview.banner")}</span>
        <button type="button" onClick={goBack} className="ml-auto inline-flex items-center gap-1 hover:underline">
          <ArrowLeft className="size-4" /> {t("teacherMain.preview.library")}
        </button>
      </div>

      <div
        className={cn(
          "relative bg-slate-100 dark:bg-slate-950",
          // Khớp layout của trang làm bài thật (PracticePage) để xem thử giống hệt học sinh thấy.
          // Đọc to: document-flow (ReadingPractice tự khoá 1-màn cho state ghi âm).
          exercise?.read_aloud || exercise?.video
            ? "min-h-screen px-0 pt-0 sm:px-4 sm:py-4 lg:py-6"
            : exercise?.writing
              ? "min-h-screen px-3 sm:px-4 sm:pt-6"
              : "min-h-screen px-3 pb-16 sm:px-4 sm:pt-6",
        )}
      >
        {!exercise && <ThemeToggle className="absolute right-4 top-4 z-30" />}
        {error ? (
          <div className="mx-auto mt-20 max-w-md rounded-xl border border-rose-300 bg-white p-6 text-center text-rose-600 dark:bg-slate-900">
            {error}
          </div>
        ) : !exercise ? (
          <PageLoading full />
        ) : exercise.video ? (
          // Nghe & Nói: dùng CHÍNH trang của học sinh, chỉ đổi nguồn dữ liệu sang route xem thử
          // (không gate, không ghi tiến độ) — cô thấy đúng thứ học sinh thấy.
          <VideoPracticePage api={videoPreviewApi} backTo={back} preview />
        ) : exercise.writing ? (
          <WritingPractice exercise={exercise} learnerName={t("teacherMain.preview.shortTitle")} backTo={back} api={writingPreviewApi} preview />
        ) : exercise.read_aloud ? (
          <ReadingPractice exercise={exercise} learnerName={t("teacherMain.preview.shortTitle")} api={previewRecordApi} backTo={back} />
        ) : deck ? (
          // Vocab deck — the same flow the learner sees (pick a practice-session config, then
          // practice); the result is NOT written to vocab_submissions since this is a preview.
          <VocabDeckExercise
            items={deck.vocab_items!}
            config={deck.vocab_deck!}
            title={deck.title}
            learnerName={t("teacherMain.preview.shortTitle")}
            onExit={goBack}
            onSubmitResult={async () => {}}
          />
        ) : exercise.dictation ? (
          <DictationPractice
            exercise={exercise}
            learnerName={t("teacherMain.preview.shortTitle")}
            backTo={back}
            onGrade={(answers) => exercisesApi.previewGrade(slug!, answers)}
          />
        ) : exercise.template_id === "grammar_translate" ? (
          // Same renderer the learner gets, so the preview shows the real thing.
          <ExerciseTranslateDrill
            exercise={exercise}
            learnerName={t("teacherMain.preview.shortTitle")}
            backTo={back}
            preview
            fetchAnswer={(position) =>
              exercisesApi.previewTranslateAnswer(slug!, position).then((r) => r.en)
            }
            onGrade={(answers) => exercisesApi.previewGrade(slug!, answers)}
          />
        ) : (
          <Quiz
            exercise={exercise}
            learnerName={t("teacherMain.preview.shortTitle")}
            // Nháp lưu riêng theo khoá "preview:" → không đè nháp thật của học sinh nào.
            draftKey="preview"
            backTo={back}
            onGrade={(answers) => exercisesApi.previewGrade(slug!, answers)}
          />
        )}
      </div>
    </div>
  );
}
