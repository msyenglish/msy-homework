// Writing practice: prompt + outline + live word count → submit → poll the grading job → result
// (overall score, four criteria bars, the teacher's comment).
// Practice page (write/wait/result) is ENGLISH per product decision — everything else stays Vietnamese.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLearningRefresh } from "../../lib/learningRefresh";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  Check,
  ChevronDown,
  History,
  Languages,
  Layers,
  Loader2,
  MessageSquare,
  Minus,
  PenLine,
  RotateCcw,
  Send,
  SpellCheck,
  Trophy,
  Type,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatPoints, targetWordsOf } from "@msyen/shared";
import {
  type PublicExerciseResp,
  type WritingApi,
  type WritingDraft,
  type WritingResult,
  userWritingApi,
  writingDraftsApi,
} from "../../lib/api";
import { HeroDecor } from "../HeroDecor";
import { Narrative } from "../Narrative";
import ThemeToggle from "../ThemeToggle";
import { Button, Textarea } from "../ui";
import { cn } from "../../lib/utils";
import { PracticeFooter } from "./PracticeFooter";
import { ScoreHero } from "./ScoreHero";
import { useOutlineVi } from "./useOutlineVi";
import { useServerDraft } from "../../lib/useServerDraft";
import { WaitingGame } from "./WaitingGame";
import { tt } from "../../lib/brand";

const MIN_WORDS = 40;
const MAX_WORDS = 1500; // must match MAX_WRITING_WORDS in apps/api (C2's final project targets 1 200)

// Writing criteria (icon + label; ScoreHero colours by score).
const WRITING_METRICS = [
  { key: "task", label: "Content", icon: MessageSquare },
  { key: "coherence", label: "Organisation", icon: Layers },
  { key: "grammar", label: "Grammar", icon: SpellCheck },
  { key: "lexical", label: "Vocabulary", icon: Type },
] as const;

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function WritingPractice({
  exercise,
  learnerName,
  backTo = "/u/library",
  api = userWritingApi,
  preview = false,
}: {
  exercise: PublicExerciseResp;
  learnerName: string;
  backTo?: string;
  /** Nộp/chấm bài — mặc định là user thật; xem thử của cô truyền adapter chặn ở bước nộp. */
  api?: WritingApi;
  /** Teacher preview — never touches the learner's saved attempt. */
  preview?: boolean;
}) {
  const [text, setText] = useState("");
  // A piece in progress is the work most expensive to lose (30–40 minutes of typing), so it is
  // autosaved and synced. Teacher preview writes nothing.
  const draft = useServerDraft<{ text: string }>("writing", exercise.exercise_id, { enabled: !preview });
  const draftLoaded = useRef(false);
  const [gradeStage, setGradeStage] = useState<"queued" | "grading" | "done" | "error" | null>(null);
  const refreshLearning = useLearningRefresh();
  const submitting = gradeStage !== null && gradeStage !== "error";
  const pollRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WritingResult | null>(null);
  // Grading can finish while the learner is playing the waiting game. Yanking them to the report
  // mid-run is the bug; hold it and let them press "View result" (same rule as ReadingPractice).
  const [readyResult, setReadyResult] = useState<WritingResult | null>(null);
  const playedRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const kq = searchParams.get("kq");
  const [loadingResult, setLoadingResult] = useState(!!kq);
  const [lastResult, setLastResult] = useState<WritingResult | null>(null);
  const latestFetchedRef = useRef(false);
  // Suggested outline starts collapsed.
  const [outlineOpen, setOutlineOpen] = useState(false);
  // Earlier drafts of THIS task, so the learner can revise against their own text and feedback
  // instead of remembering it. Collapsed by default.
  const [drafts, setDrafts] = useState<WritingDraft[]>([]);
  const [draftOpen, setDraftOpen] = useState(false);
  const draftsFetchedRef = useRef(false);

  const prompt = exercise.speaking_prompt ?? "";
  const outline = exercise.speaking_framework?.outline ?? [];
  const tr = useOutlineVi(exercise.exercise_id, exercise.speaking_framework?.outlineVi);
  const target = useMemo(() => targetWordsOf(prompt), [prompt]);
  const n = wordCount(text);
  const canSubmit = n >= MIN_WORDS && n <= MAX_WORDS;
  // Revision works from the BEST draft, mirroring both best-of scoring and what the judge is given.
  const baseline = drafts.find((d) => d.is_best) ?? drafts[0];

  useEffect(() => {
    if (draftsFetchedRef.current) return;
    draftsFetchedRef.current = true;
    let active = true;
    writingDraftsApi(exercise.exercise_id)
      .then((items) => active && setDrafts(items))
      .catch(() => {}); // no drafts / not logged in → panel simply stays hidden
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.exercise_id]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(""), 6000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  function showResult(res: WritingResult) {
    setResult(res);
    if (res.submission_id) {
      const sp = new URLSearchParams(searchParams);
      sp.set("kq", res.submission_id);
      setSearchParams(sp, { replace: true });
    }
  }

  // Arriving with ?kq= opens that attempt's report directly.
  useEffect(() => {
    if (!kq || result) return;
    let active = true;
    setLoadingResult(true);
    api
      .result(kq)
      .then((res) => active && setResult(res))
      .catch(() => {
        if (!active) return;
        const sp = new URLSearchParams(searchParams);
        sp.delete("kq");
        setSearchParams(sp, { replace: true });
      })
      .finally(() => active && setLoadingResult(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kq]);

  // Best attempt (if any) for the "View best result" button.
  useEffect(() => {
    if (kq || latestFetchedRef.current) return;
    latestFetchedRef.current = true;
    api
      .latest(exercise.exercise_id)
      .then((r) => r && setLastResult(r))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the unfinished piece once, and only into an empty editor (never over live typing).
  useEffect(() => {
    if (!draft.ready || draftLoaded.current) return;
    draftLoaded.current = true;
    if (draft.initial?.text && !text.trim() && !kq) setText(draft.initial.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.ready]);

  useEffect(() => {
    if (!draftLoaded.current || result) return;
    draft.save({ text }, n, target ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, result]);

  async function submit() {
    if (!canSubmit) return;
    setError("");
    playedRef.current = false;
    setReadyResult(null);
    setGradeStage("queued");
    let jobId: string;
    try {
      const r = await api.grade(exercise.exercise_id, text.trim());
      draft.clear(); // handed in — the attempt is no longer unfinished
      jobId = r.job_id;
    } catch (e) {
      setGradeStage(null);
      setError(e instanceof Error ? e.message : "Couldn't submit — please try again.");
      return;
    }
    runPoll(jobId);
  }

  function runPoll(jobId: string) {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    const started = Date.now();
    const poll = async () => {
      if (Date.now() - started > 240_000) {
        setGradeStage("error");
        setError("Grading is taking unusually long — please try submitting again.");
        return;
      }
      try {
        const r = await api.poll(jobId);
        if (r.status === "done" && r.result) {
          // Graded ASYNCHRONOUSLY: the score exists only now, so this is where the library
          // cards, the drip unlocks and the points badge become stale.
          refreshLearning();
          if (playedRef.current) {
            setReadyResult(r.result);
            setGradeStage("done");
          } else {
            setGradeStage(null);
            showResult(r.result);
          }
          return;
        }
        if (r.status === "error") {
          setGradeStage("error");
          setError(r.error || "Grading failed — please try again.");
          return;
        }
        setGradeStage(r.status as "queued" | "grading");
        pollRef.current = window.setTimeout(poll, 1500);
      } catch {
        pollRef.current = window.setTimeout(poll, 2500);
      }
    };
    poll();
  }

  function tryAgain() {
    setResult(null);
    setText("");
    draftsFetchedRef.current = false; // the piece just graded becomes the draft to revise against
    writingDraftsApi(exercise.exercise_id)
      .then(setDrafts)
      .catch(() => {});
    setOutlineOpen(false);
    setError("");
    const sp = new URLSearchParams(searchParams);
    sp.delete("kq");
    setSearchParams(sp, { replace: true });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <WritingHero title={exercise.title} studentName={learnerName} />

      {error && !gradeStage && (
        <div
          role="alert"
          onClick={() => setError("")}
          className="fixed inset-x-0 top-3 z-[80] mx-auto flex w-[min(28rem,calc(100vw-1.5rem))] cursor-pointer items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 shadow-lg dark:border-rose-900/60 dark:bg-rose-950"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
          <p className="text-sm leading-relaxed text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result ? (
        <>
          <div className="mt-4 px-4 sm:px-0">
            <WritingResultView result={result} prompt={prompt} />
          </div>
          <PracticeFooter />
          <BottomBar>
            <div className="flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <BackButton to={backTo} />
              <ThemeToggle className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" />
              <Button variant="outline" className="flex-1" size="lg" onClick={tryAgain}>
                <PenLine className="size-4" /> Write another
              </Button>
            </div>
          </BottomBar>
        </>
      ) : loadingResult ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="size-7 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-500">Opening report…</p>
        </div>
      ) : gradeStage ? (
        <div className="px-4 pb-8 sm:px-0">
          <WritingGradingProgress
            stage={gradeStage}
            ready={!!readyResult}
            error={error}
            onRetry={submit}
            onBack={() => {
              setGradeStage(null);
              setError("");
            }}
            onReveal={() => {
              if (readyResult) showResult(readyResult);
              setReadyResult(null);
              setGradeStage(null);
            }}
            onPlay={() => {
              playedRef.current = true;
            }}
          />
        </div>
      ) : (
        <>
        <div className="px-4 sm:px-0">
          {lastResult && (
            <button
              type="button"
              onClick={() => showResult(lastResult)}
              className="mb-3 mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-2.5 text-left transition hover:bg-cyan-100/70 dark:border-cyan-800 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                <Trophy className="size-4" /> View best result
              </span>
              <span className="text-sm font-extrabold text-cyan-700 dark:text-cyan-300">{lastResult.overall_score} pts →</span>
            </button>
          )}

          <div className={cn("space-y-3", !lastResult && "mt-4")}>
            {prompt && (
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-500/10">
                <p className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                  <PenLine className="size-3.5" /> Prompt
                </p>
                <p className="text-base font-semibold leading-relaxed text-slate-800 dark:text-slate-100 sm:text-lg">{prompt}</p>
              </div>
            )}

            {/* Optional picture the task refers to. */}
            {exercise.speaking_image && (
              <img
                src={exercise.speaking_image}
                alt={exercise.title}
                className="w-full rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              />
            )}

            {outline.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setOutlineOpen((v) => !v)}
                  aria-expanded={outlineOpen}
                  className="flex w-full items-center justify-between gap-2 p-4 text-left"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <BookOpenCheck className="size-3.5" /> Suggested outline
                  </span>
                  <span className="flex items-center gap-3 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                    {/* Translate sits INSIDE the header but stops the click from folding the card. */}
                    {outlineOpen && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void tr.toggle();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            void tr.toggle();
                          }
                        }}
                        className={cn(
                          "flex shrink-0 items-center gap-1 transition",
                          tr.on ? "text-cyan-600 dark:text-cyan-300" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200",
                        )}
                      >
                        {tr.loading ? <Loader2 className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />}
                        {tr.on ? "Hide Vietnamese" : "Vietnamese"}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      {outlineOpen ? "Hide outline" : "Show outline"}
                      <ChevronDown className={cn("size-3.5 transition-transform", outlineOpen && "rotate-180")} />
                    </span>
                  </span>
                </button>
                {outlineOpen && (
                  <ol className="space-y-1.5 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
                    {outline.map((o, i) => (
                      <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-[11px] font-bold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                          {i + 1}
                        </span>
                        <span>
                          {o}
                          {tr.vi?.[i] && (
                            <span className="mt-0.5 block text-[13px] italic text-slate-400 dark:text-slate-500">
                              {tr.vi[i]}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {outlineOpen && tr.error && <p className="px-4 pb-3 text-xs text-rose-500">{tr.error}</p>}
              </div>
            )}

            {baseline && (
              <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-500/10">
                <button
                  type="button"
                  onClick={() => setDraftOpen((v) => !v)}
                  aria-expanded={draftOpen}
                  className="flex w-full items-center justify-between gap-2 p-4 text-left"
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    <History className="size-3.5" /> Your best draft so far
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {draftOpen ? "Hide" : "Revise against it"}
                    <ChevronDown className={cn("size-3.5 transition-transform", draftOpen && "rotate-180")} />
                  </span>
                </button>
                {draftOpen && (
                  <div className="space-y-3 border-t border-amber-200 px-4 pb-4 pt-3 dark:border-amber-900/60">
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Draft {baseline.attempt_no} · {baseline.word_count} words
                      </p>
                      <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                        {baseline.text}
                      </p>
                    </div>
                    {baseline.feedback && (
                      <div>
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          {tt("What MSY English said")}
                        </p>
                        <div className="max-h-56 overflow-y-auto rounded-xl bg-white/70 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                          <Narrative content={baseline.feedback} />
                        </div>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => setText(baseline.text)}
                    >
                      Start from this draft
                    </Button>
                  </div>
                )}
              </div>
            )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <Textarea
                  label="Your essay"
                  rows={14}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write your essay here…"
                />
                <WordCounter n={n} target={target} />
              </div>
          </div>
        </div>
        <PracticeFooter />
        <BottomBar>
          <div className="flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <BackButton to={backTo} />
            <ThemeToggle className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700" />
            <Button size="lg" className="flex-1" disabled={!canSubmit || submitting} onClick={submit}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <Send className="size-4" /> Submit
                </>
              )}
            </Button>
          </div>
        </BottomBar>
        </>
      )}
    </div>
  );
}

// Word counter: current count + a status label (<40 too short to submit · below target · long enough).
function WordCounter({ n, target }: { n: number; target: number }) {
  const overMax = n > MAX_WORDS;
  const tone = overMax
    ? "text-rose-500"
    : n < MIN_WORDS
      ? "text-amber-600 dark:text-amber-400"
      : n >= target
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-slate-400";
  const label = overMax
    ? `Maximum ${MAX_WORDS} words`
    : n < MIN_WORDS
      ? "Need at least 40 words to submit"
      : n >= target
        ? "Good length"
        : `Aim for ${target}+ words`;
  return (
    <p className={cn("mt-1.5 flex items-baseline justify-end gap-1.5 text-right text-xs font-medium", tone)}>
      <span className="font-bold">{n} words</span>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      <span>{label}</span>
    </p>
  );
}

export function WritingResultView({
  result,
  prompt,
  report = false,
}: {
  result: WritingResult;
  prompt: string;
  report?: boolean;
}) {
  const metrics = WRITING_METRICS.map((m) => ({
    ...m,
    value: (result as unknown as Record<string, number>)[m.key],
  }));
  const delta = result.previous_score != null ? Math.round(result.overall_score - result.previous_score) : null;

  return (
    <div>
      {prompt && (
        <div className="mb-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-500/10">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
            <PenLine className="size-3.5" /> Prompt
          </p>
          <p className="text-base font-semibold leading-relaxed text-slate-800 dark:text-slate-100 sm:text-lg">{prompt}</p>
        </div>
      )}

      <ScoreHero score={result.overall_score} metrics={metrics} colorBy="score" />

      {!report &&
        (() => {
          const gained = result.points_gained ?? 0;
          const gainedText = `+${formatPoints(gained)} pts`;
          const progressBadge =
            delta != null ? (
              <span
                title="vs last time"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                  delta > 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                    : delta < 0
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
                )}
              >
                {delta > 0 ? <TrendingUp className="size-3.5" /> : delta < 0 ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />}
                {delta > 0 ? `+${delta}` : delta} pts
              </span>
            ) : result.attempt_no === 1 ? (
              <span className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                First try
              </span>
            ) : null;
          return (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 dark:border-amber-900/60 dark:from-amber-500/10 dark:to-yellow-500/10">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/25 text-amber-600 dark:text-amber-300">{gained > 0 ? <Trophy className="size-5" /> : <TrendingUp className="size-5" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <span>
                      {result.attempt_no != null && `Attempt ${result.attempt_no} · `}
                      {gained > 0 ? "You earned" : "no reward yet"}
                    </span>
                    {progressBadge}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">{gainedText}</span>
                    {result.best_score != null && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span className="text-sm text-slate-500">
                          Your best here: <b className="text-slate-700 dark:text-slate-200">{result.best_score} pts</b>
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

      {result.feedback && (
        <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-500/10">
          <p className="mb-1 text-sm font-semibold text-cyan-700 dark:text-cyan-300">{tt("MSY English's feedback")}</p>
          <Narrative content={result.feedback} highlightQuotes className="space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200 sm:text-base" />
        </div>
      )}

      {result.text?.trim() && (
        <CollapseText title={`Your essay (${result.word_count} words)`} text={result.text} />
      )}
    </div>
  );
}

function CollapseText({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-600 dark:text-slate-300"
      >
        {title}
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t border-slate-200 px-4 pb-4 pt-3 text-[15px] leading-relaxed text-slate-700 dark:border-slate-700 dark:text-slate-200">
          {text}
        </p>
      )}
    </div>
  );
}

// Async grading screen for writing (mirrors GradingProgress in ReadingPractice.tsx, without the
// recording copy), with the waiting mini-game.
const WRITING_STAGE_META: Record<"queued" | "grading", { title: string; sub: string }> = {
  queued: { title: "Got your essay", sub: "Queued for grading…" },
  grading: { title: "Grading your essay", sub: "MSY English is reading carefully…" },
};

const WRITING_STEPS = ["Submit", "Grading", "Done"] as const;

function WritingGradingProgress({
  stage,
  ready,
  error,
  onRetry,
  onBack,
  onReveal,
  onPlay,
}: {
  stage: "queued" | "grading" | "done" | "error";
  ready: boolean; // graded already, waiting for a tap because the learner is playing
  error?: string;
  onRetry: () => void;
  onBack: () => void;
  onReveal: () => void;
  onPlay: () => void;
}) {
  const isError = stage === "error";
  const states: ("done" | "active" | "error" | "pending")[] = isError
    ? ["done", "error", "pending"]
    : ready
      ? ["done", "done", "done"]
      : ["done", "active", "pending"];
  const rawMeta = !isError && stage !== "done" ? WRITING_STAGE_META[stage] : null;
  const meta = rawMeta && { title: tt(rawMeta.title), sub: tt(rawMeta.sub) };

  // Full page width, like the hero above it — a narrow box left the game boxed in mid-screen.
  return (
    <div className="w-full pt-4">
      {/* Stepper 1-2-3: Submit → Grading → Done */}
      <div className="mb-4 flex items-start gap-1 px-2">
        {WRITING_STEPS.map((label, i) => (
          <div key={label} className="flex min-w-0 flex-1 items-start">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm font-bold transition",
                  states[i] === "done" && "bg-cyan-500 text-white",
                  states[i] === "active" && "bg-cyan-500/15 text-cyan-600 ring-2 ring-cyan-500 dark:text-cyan-400",
                  states[i] === "error" && "bg-rose-500 text-white",
                  states[i] === "pending" && "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                )}
              >
                {states[i] === "done" ? (
                  <Check className="size-4" />
                ) : states[i] === "active" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : states[i] === "error" ? (
                  "!"
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-center text-[11px] font-medium leading-tight",
                  states[i] === "pending" ? "text-slate-400" : states[i] === "error" ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-300",
                )}
              >
                {label}
              </span>
            </div>
            {i < WRITING_STEPS.length - 1 && (
              <div
                className={cn(
                  "mt-4 h-0.5 flex-1 rounded-full transition",
                  states[i] === "done" && states[i + 1] !== "pending" ? "bg-cyan-500" : "bg-slate-200 dark:bg-slate-700",
                )}
              />
            )}
          </div>
        ))}
      </div>

      {!isError && meta && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
          <Loader2 className="size-5 shrink-0 animate-spin text-cyan-500" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-white">{meta.title}</p>
            <p className="text-xs text-slate-500">{meta.sub}</p>
          </div>
        </div>
      )}

      {isError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-500" />
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              {error || "Grading didn't finish. Please try again."}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-105"
            >
              <RotateCcw className="size-4" /> Try again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <PenLine className="size-4" /> Edit essay
            </button>
          </div>
        </div>
      )}

      {/* Graded while playing → offer the report, never snatch the game away. */}
      {ready && (
        <button
          type="button"
          onClick={onReveal}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-3 text-base font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-105"
        >
          <Check className="size-5" /> View result
        </button>
      )}

      {/* Time-killer while grading runs (hidden on error). */}
      {!isError && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-medium text-slate-400">
            {ready ? "Keep playing if you like — your result is ready on the button above." : "While you wait, play for fun:"}
          </p>
          <WaitingGame onPlay={onPlay} />
        </div>
      )}

      {!ready && !isError && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          The result appears automatically when grading finishes. If you're playing, a “View result”
          button appears instead so you're not interrupted.
        </p>
      )}
    </div>
  );
}

// Sticky bottom bar — Back, theme toggle and the primary action stay in reach at any scroll position.
function BottomBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden style={{ height: h }} />
      <div
        ref={ref}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-slate-100/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div className="mx-auto w-full max-w-[50rem] px-4">
          {children}
        </div>
      </div>
    </>
  );
}

function BackButton({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <ArrowLeft className="size-5" /> Back
    </Link>
  );
}

// Back and theme live in the sticky bar, never here — one control group, always reachable.
function WritingHero({ title, studentName }: { title: string; studentName: string }) {
  return (
    <header className="relative mb-0 overflow-hidden border-b border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 sm:mb-4 sm:rounded-2xl sm:border sm:p-6">
      <HeroDecor seed={title} className="text-teal-500/15 dark:text-teal-400/10" />
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-teal-500/10 blur-3xl" />
      <div className="relative flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 text-white shadow-lg shadow-teal-500/30 sm:size-16">
          <PenLine className="size-7 sm:size-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 title={title} className="truncate text-xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-2xl">
            {title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500 dark:text-white/70">
            <span className="font-semibold text-slate-700 dark:text-white/90">{studentName}</span>
            <span className="text-slate-300 dark:text-white/30">•</span>
            <span className="font-semibold text-teal-600 dark:text-teal-300">Writing</span>
          </p>
        </div>
      </div>
    </header>
  );
}
