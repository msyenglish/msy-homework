// Runs a `grammar_translate` EXERCISE in the translation drill's own UI.
//
// The drill (GrammarTranslateDrill) was built for the self-study bank, which has its own table,
// session rows and per-point FSRS. An exercise has none of that — it is a row of `questions` graded
// by the ordinary quiz pass. This adapter is the whole seam between the two: it reshapes the masked
// question payload into the drill's item shape, and turns the drill's answer list back into the
// position-keyed map the grade endpoint expects.
//
// Nothing about grading is duplicated here. The server marks these answers with the same
// `isTranslateCorrect` the self-study drill uses;
import { useCallback, useMemo, useState } from "react";
import { Languages, Play } from "lucide-react";
import { TRANSLATE_LEVELS, type GrammarTranslateItem, type TranslateLevel } from "@msyen/shared";
import type { GradeResp, PublicExerciseResp } from "../../lib/api";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { GrammarTranslateDrill, LEVELS } from "./GrammarTranslateDrill";

/**
 * One masked question -> one drill item. The English sentence is not here and never was: the server
 * ships only its skeleton and hashes (serialize.publicQuestion), which is exactly what the drill
 * needs to mark an answer as it is typed.
 */
function toItems(exercise: PublicExerciseResp): GrammarTranslateItem[] {
  return exercise.questions
    .filter((q) => q.type === "translate")
    .map((q) => ({
      // The position IS the id — it is what the grade endpoint keys answers by, so using it here
      // means no lookup table between the drill's answers and the submission payload.
      id: String(q.position),
      grammar_id: "",
      // Empty: an exercise groups its sentences under one title already, and repeating a grammar
      // point name above every sentence would be noise. The drill omits the suffix when blank.
      grammar_title: "",
      cefr: exercise.skill ?? "",
      tier: 1,
      vi: q.question,
      word_bank: q.word_bank ?? null,
      skeleton: q.skeleton ?? null,
      hashes: q.hashes ?? [],
      word_hashes: q.word_hashes ?? [],
      word_hashes_loose: q.word_hashes_loose ?? [],
      article_lenient: q.article_lenient !== false,
    }));
}

export function ExerciseTranslateDrill({
  exercise,
  learnerName,
  backTo,
  startLevel,
  initialAnswers,
  onAnswersChange,
  onGrade,
  fetchAnswer,
  preview = false,
}: {
  exercise: PublicExerciseResp;
  learnerName?: string;
  backTo: string;
  /** Rung chosen in the library modal. Given, the drill opens straight into the sentences. */
  startLevel?: TranslateLevel | null;
  /** Draft answers, keyed by position — the same map the quiz renderer uses. */
  initialAnswers?: Record<string, string>;
  onAnswersChange?: (answers: Record<string, string>) => void;
  onGrade: (answers: Record<string, string>) => Promise<GradeResp>;
  /** The English sentence of ONE question, for letter-by-letter marking. See GrammarTranslateDrill. */
  fetchAnswer?: (position: number) => Promise<string>;
  preview?: boolean;
}) {
  const items = useMemo(() => toItems(exercise), [exercise]);
  // The teacher's rung is the STARTING POINT, not a lock: the learner picks one here and can still
  // change it mid-session from the drill's own switcher, exactly as in the self-study drill.
  const [level, setLevel] = useState<TranslateLevel>(
    startLevel ?? (exercise.translate_level as TranslateLevel | null) ?? "easy",
  );
  // Opened from the library, the rung was already picked in the modal. This screen is the fallback
  // for a direct link (bookmark, shared URL), where nothing was chosen.
  const [started, setStarted] = useState(!!startLevel);
  // Stable identity: the drill requests inside an effect keyed on this.
  const answerFor = useCallback(
    (itemId: string) => (fetchAnswer ? fetchAnswer(Number(itemId)) : Promise.resolve("")),
    [fetchAnswer],
  );

  if (!started) {
    return (
      <div className="mx-auto w-full max-w-lg px-3 py-10 sm:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
              <Languages className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-800 dark:text-white">{exercise.title}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("practice2.translate.exerciseHeading", { n: items.length })}</p>
            </div>
          </div>

          <p className="mt-5 mb-2 text-xs font-medium text-slate-500">
            {t("practice2.translate.level")}
          </p>
          <div className="space-y-1.5">
            {TRANSLATE_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setLevel(lv)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition",
                  lv === level
                    ? "border-cyan-400 bg-cyan-50/70 dark:border-cyan-500/50 dark:bg-cyan-500/10"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
                )}
              >
                <span className={cn("text-sm font-semibold", LEVELS[lv].tone)}>{LEVELS[lv].label}</span>
                <span className="text-xs text-slate-400">{LEVELS[lv].hint}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStarted(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-700"
          >
            <Play className="size-4" /> {t("practice2.translate.start")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <GrammarTranslateDrill
      items={items}
      learnerName={learnerName}
      title={exercise.title}
      initialLevel={level}
      backTo={backTo}
      initialAnswers={initialAnswers}
      onAnswersChange={onAnswersChange}
      fetchAnswer={fetchAnswer ? answerFor : undefined}
      resultPath={(id) => `/s/${id}`}
      onSubmit={async (answers) => {
        const map: Record<string, string> = {};
        for (const a of answers) map[a.item_id] = a.answer;
        const r = await onGrade(map);
        if (preview) return { notice: t("practice2.translate.preview", { score: r.score, total: r.total }) };
        return { id: r.submission_id ?? null };
      }}
    />
  );
}
