// Public user viewing their own progress dashboard (full picture of everything practised).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { libraryApi } from "../../lib/api";
import { PracticeSetupModal } from "../../components/practice/PracticeSetupModal";
import { VocabDeckExercise } from "../../components/practice/VocabDeckExercise";
import { useVocabSession } from "../../components/practice/vocab/useVocabSession";
import { HeroDecor } from "../../components/HeroDecor";
import { StreakBest, StreakRing, StreakRules } from "../../components/analytics/StreakRing";
import { Tooltip } from "../../components/Tooltip";
import { AnalyticsSkeleton, StreakRingSkeleton } from "../../components/analytics/AnalyticsSkeleton";
import { UserAnalyticsLazy } from "../../components/analytics/UserAnalyticsLazy";
import { StudyTimePanel } from "../../components/analytics/StudyTimePanel";
import { VocabMemoryPanel } from "../../components/analytics/VocabMemoryPanel";
import { GrammarMemoryPanel } from "../../components/analytics/GrammarMemoryPanel";
import { useOverlayHistory } from "../../lib/useOverlayHistory";
import { t } from "../../i18n";

export default function UserProgressPage() {
  const { data, isLoading } = useQuery({ queryKey: ["user-analytics"], queryFn: libraryApi.analytics });

  // "Hardest to say" opens a pronunciation-only session right here — no detour through the
  // vocabulary page. The deck replaces the dashboard while it runs, same as every other host.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Practice");
  const { session, start, deckHandlers } = useVocabSession(null);
  // The deck swaps in as the whole page body (no route change), so without this Back would
  // leave /u/progress entirely instead of exiting the session.
  const exit = session ? deckHandlers().onExit : () => {};
  useOverlayHistory(!!session, exit);
  if (session) {
    return (
      <VocabDeckExercise
        items={session.items}
        config={session.config}
        title={sessionTitle}
        learnerName={sessionTitle}
        initialState={session.initialState}
        {...deckHandlers()}
      />
    );
  }

  return (
    <>
      {/* Hero — padding sits on the two inner blocks, not on the header. The streak ring is the one
          thing meant to read big here, so it must not be boxed in by the title block's padding. */}
      <header className="relative mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-progress" />
        <div className="relative flex items-center justify-between gap-2">
          {/* Title block — carries its own padding (thumb icon · title · one-line caption). */}
          <div className="flex min-w-0 flex-1 items-center gap-3.5 p-5 pr-0 sm:gap-4 sm:p-6 sm:pr-0">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 sm:size-14 dark:text-cyan-400">
              <LineChart className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-slate-900 dark:text-white">
                My progress
                <StreakBest best={data?.kpis.best_streak_days} />
              </h1>
              <p className="mt-1 truncate text-sm text-slate-500">
                Everything you have practised so far, in one place.
              </p>
            </div>
          </div>

          {/* Streak — full-size ring, tight padding of its own. The placeholder keeps the hero the
              same height while loading. */}
          <div className="shrink-0 py-4 pr-4 sm:pr-5">
            {data ? (
              // Tap to toggle: the ring is the first thing a phone user reaches for, and a tip that
              // explains a scoring rule has to be read, not glanced at.
              <Tooltip
                block
                clickable
                holdMs={8000}
                side="bottom"
                panelClassName="w-64 whitespace-normal leading-relaxed"
                label={
                  <StreakRules
                    missedDays={data.kpis.streak_missed_days}
                    nextPenalty={data.kpis.streak_next_penalty}
                  />
                }
              >
                <StreakRing days={data.kpis.streak_days} hideBest />
              </Tooltip>
            ) : (
              <StreakRingSkeleton />
            )}
          </div>
        </div>
      </header>

      {isLoading || !data ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          <UserAnalyticsLazy data={data} lang="en" />
          <StudyTimePanel />
          <VocabMemoryPanel onReview={() => setReviewOpen(true)} />
          <GrammarMemoryPanel />
          <PracticeSetupModal
            open={reviewOpen}
            onClose={() => setReviewOpen(false)}
            scope="due"
            label={t("userPages.vocab.dueWordsAll")}
            allowPronounce
            onStart={async (items, config, src) => {
              setSessionTitle("Review");
              await start(items, config, src);
              setReviewOpen(false);
            }}
          />
        </>
      )}
    </>
  );
}
