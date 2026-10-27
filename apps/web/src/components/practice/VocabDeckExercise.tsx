// ============================================================
//  BỘ THẺ TỪ VỰNG — giao diện LÀM BÀI TẬP (/u/practice/:slug).
//
//  KHÁC hẳn kiểu tự luyện ở /u/vocabulary (VocabDeck): ở đây bộ thẻ là một BÀI TẬP, nên
//  phải mặc đúng bộ khung của trang làm bài — PracticeHero · thẻ câu đánh số · PracticeFooter
//  (xem Quiz.tsx / QuestionCard.tsx làm chuẩn). Bộ máy chấm dùng chung `useDeckEngine`.
//
//  Mỗi THẺ = một "câu hỏi": số thứ tự + nhãn dạng + câu dẫn, thân do module dạng tự lo.
// ============================================================
import { ArrowLeft, BookOpen, Check, Loader2, PlayCircle, RotateCcw, Send, Sparkles, Trophy, X } from "lucide-react";
import type { VocabDeckConfigInput, VocabDeckResult, VocabItem, VocabSessionState } from "@msyen/shared";
import { Button, VoiceGenderPicker } from "../ui";
import ThemeToggle from "../ThemeToggle";
import { cn } from "../../lib/utils";
import { PracticeHero } from "./PracticeHero";
import { PracticeFooter } from "./PracticeFooter";
import { DeckChromeContext, DeckNavContext } from "./vocab/shell";
import { useDeckEngine } from "./vocab/useDeckEngine";
import { HotkeyButton } from "./vocab/hotkeys";
import { confirmAsk } from "../confirm";
import { t } from "../../i18n";

export function VocabDeckExercise({
  items,
  config,
  title,
  learnerName,
  onSubmitResult,
  onExit,
  initialState,
  onProgress,
  hideSummary = false,
}: {
  items: VocabItem[];
  config: VocabDeckConfigInput;
  title: string;
  learnerName: string;
  onSubmitResult?: (r: VocabDeckResult) => Promise<void>;
  onExit: () => void;
  /** Học tiếp phiên dở (hydrate). */
  initialState?: VocabSessionState | null;
  /** Lưu tiến độ sau mỗi thẻ. */
  onProgress?: (state: VocabSessionState) => void;
  /**
   * Host owns the result screen (the exercise runner sends the learner to the report page /s/:id),
   * so the deck shows a short saving state instead of a second summary.
   */
  hideSummary?: boolean;
}) {
  // Scored pronunciation (Azure) follows the deck config of the exercise itself.
  const allowPronounce = config.pronounce !== "off";
  const {
    card, pos, total, done, submitting, submitError, retrySubmit, result, handleOutcome, goPrev, goNext, retryWeak,
    answeredAt, snapshotAt, answeredCount, frontier, goFrontier, finishNow, nextAhead, openCount,
  } = useDeckEngine({ items, config, allowPronounce, onSubmitResult, initialState, onProgress });
  const verdict = answeredAt(pos);
  const reviewing = verdict !== undefined;
  // Redraw data of a graded card. Flashcard has none (it is not a test) and simply stays usable.
  const review = snapshotAt(pos);

  // Gam nút thanh trên — SOLID trắng/slate + viền + shadow, đồng nhất mobile↔desktop (bám trang video).
  const NAV_BTN = "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
  const actions = (
    <>
      <button type="button" onClick={onExit} aria-label={t("practice2.deck.back")} className={cn(NAV_BTN, "h-10 gap-1 px-3 text-sm font-semibold max-sm:flex-1")}>
        <ArrowLeft className="size-4" /> {t("practice2.deck.back")}
      </button>
      {/* Male/female voice — bound to the account setting, so it matches wherever it is changed. */}
      <VoiceGenderPicker kind="word" triggerClassName={cn(NAV_BTN, "size-10")} />
      {/* Keyboard shortcuts of the activity on screen — reference material, so one tap away. */}
      <HotkeyButton activity={card?.def.id} className={cn(NAV_BTN, "size-10")} />
      <ThemeToggle className={cn(NAV_BTN, "size-10")} />
    </>
  );

  if (done) {
    return (
      <Shell title={title} learnerName={learnerName} total={total} actions={actions}>
        {hideSummary && submitError && !submitting ? (
          // A failed save used to leave the learner on the spinner for good, with nothing recorded.
          <SaveFailed error={submitError} onRetry={retrySubmit} onExit={onExit} />
        ) : hideSummary ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <Loader2 className="mx-auto size-8 animate-spin text-cyan-500" />
            <p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{t("practice2.deck.saving")}</p>
          </div>
        ) : (
          <>
            {submitError && !submitting && <SaveFailed error={submitError} onRetry={retrySubmit} />}
            <Summary result={result} submitting={submitting} onExit={onExit} onRetryWeak={(w) => { if (!retryWeak(w)) onExit(); }} />
          </>
        )}
      </Shell>
    );
  }

  if (!card) {
    return (
      <Shell title={title} learnerName={learnerName} total={0} actions={actions}>
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-6 text-center dark:border-amber-800 dark:bg-amber-500/10">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t("practice2.deck.noCards")}</p>
        </div>
      </Shell>
    );
  }

  const CardComponent = card.def.Component;
  // Nothing left to do further down the deck → offer the way out instead of wrapping around.
  const atEnd = nextAhead < 0;

  return (
    <Shell title={title} learnerName={learnerName} total={total} actions={actions}>
      {/* One bar, one meaning: how far along the deck the learner is — the same number written to
          its right. (A second, dimmer layer for "graded" only read as a rendering glitch.) */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-500 transition-all duration-300"
            style={{ width: `${total ? (Math.min(pos + 1, total) / total) * 100 : 0}%` }}
          />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500 dark:text-slate-400">
          {Math.min(pos + 1, total)}/{total}
          {answeredCount < Math.min(pos + 1, total) && (
            <span className="ml-1 text-xs font-semibold text-slate-400">{t("practice2.deck.graded", { n: answeredCount })}</span>
          )}
        </span>
      </div>

      {/* Thẻ hiện tại — khung y hệt một câu hỏi trong bài quiz (QuestionCard). */}
      {/* Whole-section decoration: soft gradient + faint dot pattern span header AND body so it reads as one surface. */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-50/50 via-white to-cyan-50/40 p-3.5 sm:p-5 dark:border-slate-800 dark:from-violet-950/25 dark:via-slate-900 dark:to-cyan-950/15">
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(148,163,184,0.13)_1px,transparent_1.5px)] [background-size:15px_15px]" />
        <div className="relative mb-4 flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold tabular-nums ring-1 ring-inset",
              card.def.tone,
            )}
          >
            {String(Math.min(pos + 1, total)).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug text-slate-900 dark:text-white sm:text-lg">
              {card.def.hint}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <card.def.Icon className="size-3.5" />
              {card.def.label}
            </p>
          </div>
        </div>

        {/* Walking back through a graded card: a thin strip says so and offers the way forward —
            the card itself keeps showing the learner's own answer, which is the point of going back. */}
        {reviewing && (
          <div className="relative mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                verdict
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
              )}
            >
              {verdict ? <Check className="size-3.5" /> : <X className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
              {review ? t("practice2.deck.reviewed") : t("practice2.deck.seen")}
            </span>
            {frontier >= 0 && (
              <button
                type="button"
                onClick={goFrontier}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-cyan-500 px-3 text-xs font-bold text-white transition hover:bg-cyan-400"
              >
                <PlayCircle className="size-3.5" /> {t("practice2.deck.continue")}
              </button>
            )}
          </div>
        )}

        <div className="relative">
          <DeckChromeContext.Provider value="exercise">
              <DeckNavContext.Provider value={{ pos, total, onPrev: goPrev, onNext: goNext }}>
                <CardComponent
                  key={card.key}
                  items={card.items}
                  pool={items}
                  // Bind the verdict to THIS card: activity modules answer after a short delay, and
                  // a Next pressed in between must not move the answer onto the next card.
                  onDone={(outcome, snap, opts) => handleOutcome(outcome, snap, card.key, opts)}
                  review={review}
                />
              </DeckNavContext.Provider>
          </DeckChromeContext.Provider>
        </div>
      </div>

      {/* End of the deck. Reaching the last card used to jump silently back to card 1; now the
          learner is told where they stand and chooses: finish, or go back to what they skipped. */}
      {atEnd && (
        <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 text-center dark:border-cyan-900 dark:bg-cyan-500/10">
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            {openCount > 0 ? t("practice2.deck.atEnd", { n: openCount }) : t("practice2.deck.allDone")}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t("practice2.deck.submitNote")}
          </p>
          <div className="mx-auto mt-3 flex max-w-sm gap-2">
            {openCount > 0 && frontier >= 0 && (
              <Button variant="outline" size="lg" className="flex-1" onClick={goFrontier}>
                <PlayCircle className="size-4" /> {t("practice2.deck.finish", { n: openCount })}
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1"
              onClick={async () => {
                if (openCount > 0) {
                  const ok = await confirmAsk({
                    title: t("practice2.deck.submitTitle"),
                    message: t("practice2.deck.submitMessage", { n: openCount }),
                    confirmText: t("practice2.deck.submit"),
                    cancelText: t("practice2.deck.keepWorking"),
                    danger: true,
                  });
                  if (!ok) return;
                }
                finishNow();
              }}
            >
              <Send className="size-4" /> {t("practice2.deck.submit")}
            </Button>
          </div>
        </div>
      )}

      <PracticeFooter />
    </Shell>
  );
}

/** Submit failed: the error, a retry, and (when the host owns the result screen) a way out. */
function SaveFailed({ error, onRetry, onExit }: { error: string; onRetry: () => void; onExit?: () => void }) {
  return (
    <div className="mb-4 rounded-2xl border border-rose-300 bg-rose-50/70 p-5 text-center dark:border-rose-900 dark:bg-rose-500/10">
      <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{t("practice2.deck.saveFailed", { error })}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("practice2.deck.saveFailedNote")}</p>
      <div className="mx-auto mt-3 flex max-w-sm gap-2">
        {onExit && (
          <Button variant="outline" size="lg" className="flex-1" onClick={onExit}>
            <ArrowLeft className="size-4" /> {t("practice2.deck.back")}
          </Button>
        )}
        <Button size="lg" className="flex-1" onClick={onRetry}>
          <RotateCcw className="size-4" /> {t("practice2.deck.saveRetry")}
        </Button>
      </div>
    </div>
  );
}

/** Outer frame shared by all three states (in progress · empty · summary). */
function Shell({
  title, learnerName, total, actions, children,
}: {
  title: string; learnerName: string; total: number; actions: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PracticeHero title={title} studentName={learnerName} skill="vocabulary" total={total} actions={actions} />
      {children}
    </div>
  );
}

// ── Tổng kết — bám bố cục thẻ của trang làm bài, không phải màn hình tràn viền như tự luyện ──
function Summary({
  result, submitting, onExit, onRetryWeak,
}: {
  result: VocabDeckResult | null; submitting: boolean; onExit: () => void; onRetryWeak: (weak: string[]) => void;
}) {
  const r = result ?? { score: 0, total: 0, perWord: [], weakWords: [] };
  const mastered = r.perWord.filter((w) => w.mastered).length;
  const tone = r.score >= 80 ? "text-emerald-500" : r.score >= 50 ? "text-amber-500" : "text-rose-500";
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
        {(() => { const I = r.score >= 80 ? Trophy : r.score >= 50 ? Sparkles : BookOpen; return <I className={cn("mx-auto size-12", r.score >= 80 ? "text-amber-400" : r.score >= 50 ? "text-cyan-500" : "text-slate-400")} />; })()}
        <p className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">All done!</p>

        <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <p className={cn("text-3xl font-extrabold tabular-nums", tone)}>{r.score}</p>
            <p className="text-xs text-slate-400">points</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-3xl font-extrabold tabular-nums text-slate-800 dark:text-white">
              {mastered}
              <span className="text-lg text-slate-400">/{r.total}</span>
            </p>
            <p className="text-xs text-slate-400">words learned</p>
          </div>
        </div>
        {submitting && <p className="mt-3 text-xs text-slate-400">Saving your results…</p>}

        {r.weakWords.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900 dark:bg-amber-500/10">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              To review ({r.weakWords.length})
            </p>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{r.weakWords.join(" · ")}</p>
          </div>
        )}

        <div className="mx-auto mt-6 flex max-w-sm gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={onExit}>
            <ArrowLeft className="size-4" /> Done
          </Button>
          {r.weakWords.length > 0 && (
            <Button size="lg" className="flex-1" onClick={() => onRetryWeak(r.weakWords)}>
              <RotateCcw className="size-4" /> Review weak words
            </Button>
          )}
        </div>
      </div>
      <PracticeFooter />
    </>
  );
}
