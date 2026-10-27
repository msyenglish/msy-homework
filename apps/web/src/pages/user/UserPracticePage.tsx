import { PageLoading } from "../../components/PageLoading";
// One library exercise for a signed-in user: quiz (reuses <Quiz>) · record (read-aloud, reuses
// ReadingPractice with the cookie adapter) · writing · vocabulary deck.
// The deck branches BEFORE <Quiz>: it has no questions, so falling into Quiz renders a blank page.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { adoptAccountTheme } from "../../lib/theme";
import { accountApi, libraryApi, recordLibraryApi, userRecordApi } from "../../lib/api";
import { TRANSLATE_LEVELS, type TranslateLevel } from "@msyen/shared";
import { cn } from "../../lib/utils";
import ThemeToggle from "../../components/ThemeToggle";
import { Quiz } from "../../components/practice/Quiz";
import { ExerciseTranslateDrill } from "../../components/practice/ExerciseTranslateDrill";
import { DictationPractice, type DictationDraft } from "../../components/practice/DictationPractice";
import { useServerDraft } from "../../lib/useServerDraft";
import { ReadingPractice } from "../../components/practice/ReadingPractice";
import { WritingPractice } from "../../components/practice/WritingPractice";
import { VocabExerciseRunner } from "../../components/practice/VocabExerciseRunner";
import type { RedoEntry } from "../../components/practice/vocab/redo";
import { PracticeUnavailable } from "../../components/practice/PracticeUnavailable";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { t } from "../../i18n";

export default function UserPracticePage() {
  const { exerciseId } = useParams();
  // "Làm lại câu sai" from a report hands over its plan through router state.
  const redo = (useLocation().state as { redo?: RedoEntry[] } | null)?.redo ?? null;
  // Translation exercises pick their hint rung in a modal on the library card, and hand it over in
  // the query string so a reload keeps it. Absent → the drill shows its own start screen.
  const [params] = useSearchParams();
  const levelParam = params.get("level");
  const startLevel = (TRANSLATE_LEVELS as readonly string[]).includes(levelParam ?? "")
    ? (levelParam as TranslateLevel)
    : null;
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });

  // Trang này nằm NGOÀI UserLayout → tự lấy giao diện sáng/tối đã lưu trên tài khoản.
  useEffect(() => {
    adoptAccountTheme(me?.user?.theme);
  }, [me?.user?.theme]);

  // Try loading as a RECORD exercise first (/library/:slug/record answers for read_aloud/writing);
  // a 400 (not a record exercise) means quiz, loaded through libraryApi.exercise.
  const {
    data: recordEx,
    isLoading: loadingRecord,
  } = useQuery({
    queryKey: ["library-record-exercise", exerciseId],
    queryFn: () => recordLibraryApi.exercise(exerciseId!),
    retry: false,
    enabled: !!exerciseId,
  });
  const isRecord = !!recordEx && (recordEx.read_aloud || recordEx.writing);

  const {
    data: quizEx,
    isLoading: loadingQuiz,
    error: quizError,
  } = useQuery({
    queryKey: ["library-exercise", exerciseId],
    queryFn: () => libraryApi.exercise(exerciseId!),
    retry: false,
    enabled: !!exerciseId && !loadingRecord && !isRecord, // chỉ tải quiz khi KHÔNG phải record
  });

  // Deck: the server already resolved `vocab_items`, so no second round-trip is needed. A deck that
  // resolved to no words still takes this branch (the runner says so) instead of an empty <Quiz>.
  const deck = quizEx?.vocab_deck ? quizEx : null;
  const exercise = isRecord ? recordEx : quizEx;

  // Unfinished attempt, synced across devices. Quiz and dictation each own their own state shape;
  // the deck resumes through its own session row, record/writing through their own tables.
  const isDictation = !!quizEx?.dictation;
  const quizDraft = useServerDraft<Record<string, string>>("quiz", exerciseId, {
    enabled: !isRecord && !deck && !isDictation,
  });
  const dictationDraft = useServerDraft<DictationDraft>("dictation", exerciseId, { enabled: isDictation });

  const isLoading = loadingRecord || (!isRecord && loadingQuiz);
  useDocumentTitle(exercise?.title);
  const learnerName = me?.user?.name || t("userPages.topNav.you");

  return (
    <div
      className={cn(
        "relative bg-slate-100 dark:bg-slate-950",
        // Bài ĐỌC TO & NÓI: document-flow (component tự khoá 1-màn cho state ghi âm; kết quả
        // cuộn theo trang — tooltip không bị cắt). Quiz: document-flow như cũ.
        isRecord
          ? "min-h-screen px-0 pt-0 sm:px-4 sm:py-4 lg:py-6"
          // Bộ thẻ nay mặc khung trang làm bài như quiz → dùng chung padding.
          : "min-h-screen px-3 pb-16 sm:px-4 sm:pt-6",
      )}
    >
      {/* Writing keeps its own theme toggle in the sticky bar, so the absolute one this page draws
          would be a second, overlapping control. Read-aloud still uses it. */}
      {(!exercise || exercise.read_aloud) && !exercise?.writing && (
        <ThemeToggle className="page-theme-toggle absolute right-4 top-4 z-30" />
      )}
      {isLoading ? (
        <PageLoading full />
      ) : isRecord && recordEx?.writing ? (
        <WritingPractice exercise={recordEx} learnerName={learnerName} />
      ) : isRecord && recordEx?.read_aloud ? (
        <ReadingPractice
          exercise={recordEx}
          learnerName={learnerName}
          api={userRecordApi.reading()}
         
          backTo="/u/library"
        />
      ) : deck ? (
        <VocabExerciseRunner
          exerciseId={deck.exercise_id}
          title={deck.title}
          items={deck.vocab_items ?? []}
          config={deck.vocab_deck!}
          learnerName={learnerName}
          backTo="/u/library"
          redo={redo}
        />
      ) : quizError ? (
        <PracticeUnavailable
          message={quizError instanceof Error ? quizError.message : t("userPages.practice.cannotLoadExercise")}
          onRetry={() => qc.invalidateQueries({ queryKey: ["library-exercise", exerciseId] })}
        />
      ) : !quizEx ? null : quizEx.dictation ? (
        // Mounting before the draft is restored would let the first autosave wipe it.
        !dictationDraft.ready ? (
          <PageLoading full />
        ) : (
          <DictationPractice
            exercise={quizEx}
            learnerName={learnerName}
            backTo="/u/library"
            initialDraft={dictationDraft.initial}
            onDraftChange={(state, answered, total) => dictationDraft.save(state, answered, total)}
            onGrade={async (answers, meta) => {
              const r = await libraryApi.grade(quizEx.exercise_id, answers, meta?.hintUsed, meta?.hintPositions);
              dictationDraft.clear();
              qc.invalidateQueries({ queryKey: ["user-stats"] });
              qc.invalidateQueries({ queryKey: ["library"] });
              return r;
            }}
          />
        )
      ) : !quizDraft.ready ? (
        <PageLoading full />
      ) : quizEx.template_id === "grammar_translate" ? (
        // Its own renderer, not a quiz card: a translation exercise is worked one sentence at a
        // time in the same drill the self-study bank uses. Grading is still the ordinary quiz pass.
        <ExerciseTranslateDrill
          exercise={quizEx}
          learnerName={learnerName}
          backTo="/u/library"
          startLevel={startLevel}
          fetchAnswer={(position) =>
            libraryApi.translateAnswer(quizEx.exercise_id, position).then((r) => r.en)
          }
          initialAnswers={quizDraft.initial ?? undefined}
          onAnswersChange={(answers) =>
            quizDraft.save(
              answers,
              Object.values(answers).filter((v) => (v ?? "").trim() !== "").length,
              quizEx.questions.length,
            )
          }
          onGrade={async (answers) => {
            const r = await libraryApi.grade(quizEx.exercise_id, answers);
            quizDraft.clear();
            qc.invalidateQueries({ queryKey: ["user-stats"] });
            qc.invalidateQueries({ queryKey: ["library"] });
            return r;
          }}
        />
      ) : (
        <Quiz
          exercise={quizEx}
          learnerName={learnerName}
          draftKey={`user:${quizEx.exercise_id}`}
          backTo="/u/library"
          initialAnswers={quizDraft.initial ?? undefined}
          onAnswersChange={(answers) =>
            quizDraft.save(
              answers,
              Object.values(answers).filter((v) => (v ?? "").trim() !== "").length,
              quizEx.questions.length,
            )
          }
          onGrade={async (answers, meta) => {
            const r = await libraryApi.grade(quizEx.exercise_id, answers, meta?.hintUsed, meta?.hintPositions);
            quizDraft.clear();
            qc.invalidateQueries({ queryKey: ["user-stats"] });
            qc.invalidateQueries({ queryKey: ["library"] });
            return r;
          }}
        />
      )}
    </div>
  );
}
