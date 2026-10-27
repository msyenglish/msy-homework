// Report body for ONE vocab-deck session (/s/:id). Reads the stored VocabDeckResult only — nothing
// is recomputed here, so the report always shows what the learner actually saw that session.
import { BrainCircuit, Check, Layers, Sparkles, Volume2, X } from "lucide-react";
import type { VocabActivity, VocabDeckResult } from "@msyen/shared";

import { cn } from "../../../lib/utils";
import { VOCAB_CARDS } from "./registry";
import { SpeakButton } from "./shell";
import { t } from "../../../i18n";

const activityLabel = (a: VocabActivity) => VOCAB_CARDS[a]?.label ?? a;

function Tile({ value, label, tone = "text-slate-800 dark:text-white" }: { value: string; label: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800/50">
      <p className={cn("text-2xl font-extrabold tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

/** Word entry from the bank, joined server-side so the report doubles as a revision list. */
export type VocabReportWordInfo = {
  id: string;
  word: string;
  ipa: string | null;
  meaning: string | null;
  audio_word: string | null;
  audio_word_male: string | null;
};

export function VocabReportView({
  result, score, total, words: info,
}: {
  result: VocabDeckResult;
  score: number;
  total: number;
  words?: VocabReportWordInfo[] | null;
}) {
  const words = result.perWord ?? [];
  const infoById = new Map((info ?? []).map((w) => [w.id, w]));
  const mastered = words.filter((w) => w.mastered).length;
  const mem = result.memory;
  const tone = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-rose-500";
  // Total answers of the session. Sessions saved before 2026-08-03 stored 1 attempt per word
  // regardless of how many activities drilled it, so the answer tiles and fractions only appear
  // when the real per-attempt counts exist — otherwise the page would state a made-up number.
  const answers = words.reduce((n, w) => n + (w.total ?? 0), 0);
  const rightAnswers = words.reduce((n, w) => n + (w.correct ?? 0), 0);
  const hasAttempts = words.some((w) => (w.attempts?.length ?? 0) > 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile value={`${score}%`} label={t("practice2.report.sessionScore")} tone={tone} />
          <Tile value={`${mastered}/${total}`} label={t("practice2.report.mastered")} />
          {hasAttempts && <Tile value={`${rightAnswers}/${answers}`} label={t("practice2.report.correctAnswers")} />}
          {mem && mem.reviewed > 0 && <Tile value={`${mem.recalled}/${mem.reviewed}`} label={t("practice2.report.reviewed")} />}
          {mem && mem.tiersUp > 0 && <Tile value={`+${mem.tiersUp}`} label={t("practice2.report.tierUp")} />}
          {mem && mem.points > 0 && <Tile value={`+${mem.points}`} label={t("practice2.report.memoryPoints")} tone="text-cyan-600 dark:text-cyan-400" />}
        </div>

        {result.weakWords?.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-500/10">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <Sparkles className="size-3.5" /> {t("practice2.report.reviewAgain", { n: result.weakWords.length })}
            </p>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{result.weakWords.join(" · ")}</p>
          </div>
        )}
      </div>

      {/* One row per word: how it was drilled, how many prompts it got right, whether it stuck. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
          <Layers className="size-4 text-cyan-500" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("practice2.report.wordsThisSession", { n: words.length })}</p>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {words.map((w, i) => {
            // Verdict per activity = the LAST answer given to it (a fixed retry counts as known).
            const last = new Map<VocabActivity, boolean>();
            for (const a of w.attempts ?? []) last.set(a.activity, a.correct);
            const chips: { activity: VocabActivity; ok: boolean | null }[] = (w.seen ?? []).map((a) => ({
              activity: a,
              ok: last.has(a) ? last.get(a)! : null, // null = old session, no per-activity detail
            }));
            return (
              <li key={`${w.wordId ?? w.word}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    w.mastered ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
                  )}
                >
                  {w.mastered ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{w.word}</span>
                {/* Meaning + audio: the point of a vocabulary report is to revise from it. */}
                {(() => {
                  const d = w.wordId ? infoById.get(w.wordId) : undefined;
                  if (!d) return null;
                  return (
                    <>
                      <SpeakButton word={d.word} variant="inline" audio={{ female: d.audio_word, male: d.audio_word_male }} />
                      {d.ipa && <span className="font-ipa text-xs text-cyan-600 dark:text-cyan-400">{d.ipa}</span>}
                      {d.meaning && <span className="text-sm text-slate-500 dark:text-slate-400">{d.meaning}</span>}
                    </>
                  );
                })()}
                {hasAttempts && w.total > 0 && (
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {t("practice2.report.correctCount", { correct: w.correct, total: w.total })}
                  </span>
                )}
                {hasAttempts && w.total === 0 && (
                  <span className="text-xs text-slate-400">{t("practice2.report.viewedOnly")}</span>
                )}
                {w.pron != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                    <Volume2 className="size-3" /> {t("practice2.report.pronunciation", { pron: w.pron })}
                  </span>
                )}
                <span className="ml-auto flex flex-wrap justify-end gap-1">
                  {chips.map((c, k) => (
                    <span
                      key={`${c.activity}-${k}`}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        c.ok === true && "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                        c.ok === false && "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                        c.ok === null && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                      )}
                    >
                      {activityLabel(c.activity)}
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {mem && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <BrainCircuit className="size-3.5" /> {t("practice2.report.scoreNote")}
        </p>
      )}
    </div>
  );
}
