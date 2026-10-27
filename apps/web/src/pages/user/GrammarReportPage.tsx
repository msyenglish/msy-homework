// Report for ONE graded grammar drill — the drill's equivalent of the exercise report at /s/:id.
// The session is stored (grammar_submissions), so a result is a permanent, linkable page rather
// than a screen that vanishes on reload. Reached from the drill after grading and from the
// history drawer on /u/grammar.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookText, Bookmark, Check, ClipboardCheck, Loader2, Sparkles, X } from "lucide-react";
import { GRAMMAR_TIER_LABEL, formatPoints } from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { HeroDecor } from "../../components/HeroDecor";
import { BAND_COLOR } from "../../lib/cefr";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

const BACK_TO = "/u/grammar";

export default function GrammarReportPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["grammar-report", id],
    queryFn: () => accountApi.grammarReport(id),
    enabled: !!id,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
        <Loader2 className="size-4 animate-spin" /> {t("userPages.grammarReport.openingReport")}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-2xl py-16 text-center">
        <p className="mb-4 text-sm text-rose-600 dark:text-rose-300">
          {error instanceof Error ? error.message : t("userPages.grammarReport.loadError")}
        </p>
        <Link to={BACK_TO} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white">{t("userPages.grammarDrill.backToHandbook")}</Link>
      </div>
    );
  }

  // Both drills land in this one report. They keep their sentences in different tables and their
  // verdicts differ (`explain` vs `note`), so normalise once here instead of branching all the way
  // down the render.
  const translate = data.mode === "translate";
  const promptById = new Map(
    translate
      ? data.translate_items.map((i) => [i.id, { prompt: i.vi, title: i.grammar_title, cefr: i.cefr }] as const)
      : data.items.map((i) => [i.id, { prompt: i.question.question ?? "", title: i.grammar_title, cefr: i.cefr }] as const),
  );
  const verdicts = (data.result?.verdicts ?? []) as {
    item_id: string;
    correct: boolean;
    /** Translation drill only — the sentence the learner wrote, blank when they skipped it. */
    answer?: string;
    correct_answer: string;
    explain?: string | null;
    note?: string | null;
  }[];
  const wrong = verdicts.filter((v) => !v.correct);
  const when = new Date(data.submitted_at);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
      {/* Hero — score ring on the right, everything else on one metadata line. No back button:
          the shell nav sits right above and the CTA at the foot returns too. */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-cyan-500/10 dark:via-slate-900 dark:to-slate-950">
        <HeroDecor seed={`grammar-report-${data.id}`} />
        {/* Two soft glows behind the pattern — the flat card read as unfinished next to the drill. */}
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-500/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-10 size-56 rounded-full bg-teal-300/20 blur-3xl dark:bg-teal-500/10" />

        <div className="relative flex items-center gap-4">
          {/* Icon square, same shape as the practice hero so the two pages read as a pair. */}
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-lg shadow-cyan-500/30 sm:size-16">
            <ClipboardCheck className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">{t("userPages.grammarReport.title")}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {t("userPages.grammarReport.resultScore", { correct: data.correct, total: data.total })}
              </span>
              {data.points > 0 && (
                <>
                  <span className="text-slate-300 dark:text-white/30">•</span>
                  <span className="inline-flex items-center gap-1 font-bold text-cyan-600 dark:text-cyan-300">
                    <Sparkles className="size-3.5" /> +{formatPoints(data.points)}
                  </span>
                </>
              )}
              <span className="text-slate-300 dark:text-white/30">•</span>
              <span>{when.toLocaleString("vi-VN")}</span>
            </p>
          </div>
          <ScoreRing score={data.score} />
        </div>
      </header>

      {/* How each grammar point moved — with the bookmark that puts it in the handbook shortlist. */}
      {!!data.result?.points_state.length && (
        <div className="space-y-2">
          {data.result.points_state.map((p) => (
            <div key={p.grammar_id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <BookText className="size-4 shrink-0 text-cyan-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{p.title}</p>
                <p className="text-xs text-slate-500">
                  {t("userPages.grammarReport.correctRatio", { correct: p.correct, seen: p.seen })}
                  {p.tier > p.prev_tier && (
                    <span className="ml-1 font-bold text-emerald-600 dark:text-emerald-400">{t("userPages.grammarReport.promotedTier", { tier: GRAMMAR_TIER_LABEL[p.tier] })}</span>
                  )}
                  {p.due_at && <span className="ml-1">{t("userPages.grammarReport.reviewDue", { date: new Date(p.due_at).toLocaleDateString("vi-VN") })}</span>}
                </p>
              </div>
              {p.points > 0 && <span className="shrink-0 text-sm font-bold text-cyan-600 dark:text-cyan-400">+{p.points}</span>}
              <MarkButton grammarId={p.grammar_id} />
            </div>
          ))}
        </div>
      )}

      {/* Every question, wrong ones first — the same order the drill result used. */}
      <div className="space-y-2.5">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {t("userPages.grammarReport.reviewTitle")} {wrong.length > 0 && <span className="font-normal text-slate-400">{t("userPages.grammarReport.wrongCount", { n: wrong.length, count: wrong.length })}</span>}
        </p>
        {[...verdicts].sort((a, b) => Number(a.correct) - Number(b.correct)).map((v) => {
          const it = promptById.get(v.item_id);
          const band = BAND_COLOR[(it?.cefr ?? "") as keyof typeof BAND_COLOR] ?? "#64748b";
          return (
            <div key={v.item_id}
              className={cn("rounded-xl border px-4 py-3",
                v.correct ? "border-slate-200 dark:border-slate-800" : "border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-500/10")}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-white",
                  v.correct ? "bg-emerald-500" : "bg-rose-500")}>
                  {v.correct ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                {it && (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: `${band}1a`, color: band }}>
                    {it.title}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-100">{it?.prompt || t("userPages.grammarReport.questionRemoved")}</p>
              {/* Translation drill: the learner wrote a whole sentence, so show theirs next to the key. */}
              {translate && (
                <p className="mt-1 text-sm">
                  <span className="text-slate-400">{t("userPages.grammarReport.youWrote")}</span>
                  {v.answer?.trim() ? (
                    <span className={cn(v.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
                      {v.answer}
                    </span>
                  ) : (
                    <span className="italic text-slate-400">{t("userPages.grammarReport.skippedQuestion")}</span>
                  )}
                </p>
              )}
              {!v.correct && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  {t("userPages.grammarReport.correctAnswerPrefix")}<b>{v.correct_answer}</b>
                </p>
              )}
              {(v.explain || v.note) && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{v.explain || v.note}</p>
              )}
            </div>
          );
        })}
      </div>

      <Link to={BACK_TO}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-cyan-600">
        <ArrowLeft className="size-4" /> Back to Grammar
      </Link>
    </div>
  );
}

/** Score as a ring: the headline number of the page, not a line of small type in a corner. */
function ScoreRing({ score }: { score: number }) {
  const tone = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round" stroke={tone}
          strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * 264} 264`}
        />
      </svg>
      {/* Centre the PAIR, then align the two parts on their baseline. Aligning on the baseline at
          the top level pushed the whole thing above the middle of the ring. */}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-baseline gap-px">
          <span className="text-[26px] font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">{score}</span>
          <span className="text-[11px] font-bold leading-none text-slate-400 dark:text-slate-500">%</span>
        </span>
      </span>
    </div>
  );
}

/** Bookmark a grammar point straight from the report, same shortlist as the handbook filter. */
function MarkButton({ grammarId }: { grammarId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["grammar-marked"], queryFn: accountApi.grammarMarked, retry: false });
  const on = !!data?.items.some((m) => m.id === grammarId);
  const toggle = useMutation({
    mutationFn: () => accountApi.grammarSetMarked(grammarId, !on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grammar-marked"] }),
  });
  return (
    <button
      type="button"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      aria-pressed={on}
      aria-label={on ? t("userPages.grammarReport.unmarkTooltip") : t("userPages.grammarReport.markTooltip")}
      title={on ? t("userPages.grammarReport.unmarkTooltip") : t("userPages.grammarReport.markTooltip")}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border transition disabled:opacity-50",
        on
          ? "border-cyan-500 bg-cyan-500 text-white hover:bg-cyan-600"
          : "border-slate-200 text-slate-400 hover:border-cyan-300 hover:text-cyan-600 dark:border-slate-700 dark:hover:border-cyan-700",
      )}
    >
      <Bookmark className={cn("size-4", on && "fill-current")} />
    </button>
  );
}
