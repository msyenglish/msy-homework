// One word on a list page (set detail, My words): headword + listen button, IPA / part of speech,
// meaning, example, the learner's state, and a slot for the page's own actions.
import type { ReactNode } from "react";
import { CheckCircle2, Circle, Mic } from "lucide-react";
import type { VocabWordState } from "../../lib/api";
import { SpeakButton } from "../practice/vocab/shell";
import { cn } from "../../lib/utils";

export function WordCard({ w, actions, onToggleLearned }: {
  w: VocabWordState;
  actions?: ReactNode;
  onToggleLearned?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-2">
        {/* Headword, listen, part of speech and IPA share one line; they wrap only when it runs out. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-lg font-extrabold text-slate-900 dark:text-white">{w.word}</span>
          <span className="self-center">
            <SpeakButton word={w.word} variant="inline" />
          </span>
          {(w.pos || w.ipa) && (
            <span className="text-sm">
              {w.pos && <span className="text-slate-400">({w.pos}) </span>}
              {w.ipa && <span className="font-ipa text-cyan-600 dark:text-cyan-400">{w.ipa}</span>}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onToggleLearned && (
            <button
              type="button"
              onClick={onToggleLearned}
              aria-pressed={w.learned}
              aria-label={w.learned ? "Learned" : "Mark learned"}
              title={w.learned ? "Learned" : "Mark learned"}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-lg transition",
                w.learned
                  ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10",
              )}
            >
              {w.learned ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
            </button>
          )}
          {actions}
        </div>
      </div>
      {w.meaning && (
        <p className="text-[15px] font-semibold text-slate-700 dark:text-slate-200">
          {w.meaning}
          {w.cefr && <span className="ml-2 rounded bg-slate-100 px-1.5 align-middle text-[10px] font-bold text-slate-500 dark:bg-slate-800">{w.cefr}</span>}
        </p>
      )}
      {w.definition && <p className="text-sm text-slate-500 dark:text-slate-400">{w.definition}</p>}
      {w.example && (
        <div className="text-sm">
          <p className="italic text-slate-600 dark:text-slate-300">“{w.example}”</p>
          {w.example_vi && <p className="text-slate-400">{w.example_vi}</p>}
        </div>
      )}
      {w.collocations?.length ? (
        <div className="flex flex-wrap gap-1">
          {w.collocations.map((c) => (
            <span key={c} className="rounded-md bg-cyan-50 px-1.5 py-0.5 text-xs font-medium text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
              {c}
            </span>
          ))}
        </div>
      ) : null}
      {(w.family?.length || w.synonyms?.length || w.antonyms?.length) ? (
        <p className="space-x-3 text-xs text-slate-400">
          {w.family?.length ? <span>Family: {w.family.join(", ")}</span> : null}
          {w.synonyms?.length ? <span>≈ {w.synonyms.join(", ")}</span> : null}
          {w.antonyms?.length ? <span>≠ {w.antonyms.join(", ")}</span> : null}
        </p>
      ) : null}
      {w.note && <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{w.note}</p>}
      {w.pronBest != null && (
        <p className="mt-auto inline-flex items-center gap-1 pt-1 text-xs text-slate-400">
          <Mic className="size-3.5" /> best {w.pronBest}
        </p>
      )}
    </div>
  );
}
