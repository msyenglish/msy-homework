// Grammar page — hero + the reference handbook (GET /grammar). Practice opens a setup modal and
// then NAVIGATES to /u/grammar/practice, which renders the drill with the same Quiz component the
// regular exercises use.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookText, History, Languages, Play, Trophy } from "lucide-react";
import type { GrammarSessionInput, GrammarTranslateSessionInput } from "@msyen/shared";
import { HeroDecor } from "../../components/HeroDecor";
import Drawer from "../../components/Drawer";
import { Link } from "react-router-dom";
import { GrammarQuizSetupModal } from "../../components/practice/GrammarQuizSetupModal";
import { GrammarTranslateSetupModal } from "../../components/practice/GrammarTranslateSetupModal";
import { usePublicUser } from "./UserLayout";
import { accountApi } from "../../lib/api";
import GrammarView from "./learn/GrammarView";
import { useOverlayHistory } from "../../lib/useOverlayHistory";
import { t } from "../../i18n";

export default function UserGrammarPage() {
  const navigate = useNavigate();
  const { user } = usePublicUser();
  // One modal per drill: they share only the point picker, so a single modal had to branch on mode
  // in a dozen places.
  const [quizOpen, setQuizOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // These two modals are built on SetupShell (fixed inset-0), which has no history wiring of its
  // own — unlike the shared Drawer used below, Back would otherwise leave the whole page.
  useOverlayHistory(quizOpen, () => setQuizOpen(false));
  useOverlayHistory(translateOpen, () => setTranslateOpen(false));

  const { data: state } = useQuery({ queryKey: ["grammar-state"], queryFn: accountApi.grammarState, retry: false });
  const { data: history } = useQuery({
    queryKey: ["grammar-submissions"], queryFn: accountApi.grammarSubmissions, enabled: historyOpen, retry: false,
  });

  // The drill is drawn on the drill page, not here: drawing spends the items' cooldown, so it must
  // happen once, on the page that will actually show them.
  function start(config: GrammarSessionInput) {
    setQuizOpen(false);
    navigate("/u/grammar/practice", { state: { config } });
  }

  function startTranslate(config: GrammarTranslateSessionInput) {
    setTranslateOpen(false);
    navigate("/u/grammar/translate", { state: { config } });
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Hero — same shape as the other user pages */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-grammar" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 sm:size-14 dark:text-cyan-400">
              <BookText className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Grammar</h1>
              <p className="mt-0.5 truncate text-sm text-slate-500">
                Formulas, bilingual examples and memory tips — by CEFR level.
              </p>
            </div>
          </div>
          {/* Mobile: one full-width row — history stays icon-only, the two drills split the rest. */}
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
          <button type="button" onClick={() => setHistoryOpen(true)}
            className="flex size-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300"
            aria-label={t("userPages.userGrammar.historyTitle")} title={t("userPages.userGrammar.historyTitle")}>
            <History className="size-4" />
          </button>
          <button type="button" onClick={() => setTranslateOpen(true)}
            title={t("userPages.userGrammar.translateTooltip")}
            className="flex h-[42px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-600 sm:flex-none dark:border-slate-700 dark:text-slate-300">
            <Languages className="size-4 shrink-0" /> {t("userPages.userGrammar.translateButton")}
          </button>
          <button type="button" onClick={() => setQuizOpen(true)}
            className="relative flex h-[42px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-600 sm:flex-none">
            <Play className="size-4 shrink-0" /> Practice
            {!!state?.due && (
              <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-extrabold text-amber-950">
                {state.due}
              </span>
            )}
          </button>
          </div>
        </div>
      </header>

      <GrammarView />

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title={t("userPages.userGrammar.historyDrawerTitle")}
        description={t("userPages.userGrammar.historyDrawerDescription")} icon={<History className="size-5" />}>
        {!history?.items.length ? (
          <p className="py-10 text-center text-sm text-slate-400">{t("userPages.userGrammar.historyEmpty")}</p>
        ) : (
          <div className="space-y-2.5">
            {history.items.map((h) => (
              <Link key={h.id} to={`/u/grammar/report/${h.id}`} onClick={() => setHistoryOpen(false)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:border-cyan-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-cyan-700 dark:hover:bg-slate-800/60">
                <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl bg-cyan-500/10 text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400">
                  {h.score}%
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {h.label || t("userPages.userGrammar.defaultSessionLabel")}
                    {/* Both drills live in one history list; without this they read identically. */}
                    {h.mode === "translate" && (
                      <span className="ml-1.5 rounded bg-cyan-500/15 px-1.5 py-0.5 align-middle text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                        {t("userPages.userGrammar.translateButton")}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {t("userPages.userGrammar.historyResult", { correct: h.correct, total: h.total, date: new Date(h.submitted_at).toLocaleString("vi-VN") })}
                  </p>
                </div>
                {h.points > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                    <Trophy className="size-3.5" /> +{h.points}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </Drawer>

      <GrammarQuizSetupModal
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        userBand={user?.level?.name ?? null}
        onStart={start}
        onResume={(id) => { setQuizOpen(false); navigate(`/u/grammar/practice/${id}`); }}
      />

      <GrammarTranslateSetupModal
        open={translateOpen}
        onClose={() => setTranslateOpen(false)}
        userBand={user?.level?.name ?? null}
        onStart={startTranslate}
        onResume={(id) => { setTranslateOpen(false); navigate(`/u/grammar/translate/${id}`); }}
      />
    </div>
  );
}
