// Activity — PARAPHRASE: pick the expression that says the same thing.
// Source data = senses.synonyms (attached to VocabItem as `synonyms` when present).
// Recognition, not typing: a phrase usually has several valid equivalents, so asking the learner to
// type one would mark correct answers wrong. IELTS band 8 asks a candidate to "effectively
// paraphrase", and choosing the right equivalent under time pressure is that skill.
import { useMemo, useState } from "react";
import { Repeat2 } from "lucide-react";
import { normalizeWordForCompare } from "@msyen/shared";
import type { VocabItem } from "@msyen/shared";
import { CardShell, FooterResult, WordDisplay, useAutoNext, useChoiceKeys } from "./shell";
import { stripTag, type VocabCardDef, type VocabCardProps } from "./types";

/** Usable equivalents: non-empty, not the headword itself, de-duplicated. */
function equivalentsOf(item: VocabItem): string[] {
  const base = normalizeWordForCompare(item.word);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of item.synonyms ?? []) {
    const s = stripTag(raw || "").trim();
    const k = normalizeWordForCompare(s);
    if (!s || !k || k === base || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Distractors come from OTHER entries in the same deck, so they sit at a similar level and register. */
function buildOptions(item: VocabItem, pool: VocabItem[]): { options: string[]; answer: string } | null {
  const mine = equivalentsOf(item);
  if (!mine.length) return null;
  const answer = mine[0];
  const taken = new Set([normalizeWordForCompare(item.word), ...mine.map(normalizeWordForCompare)]);
  const decoys: string[] = [];
  for (const other of pool) {
    if (other.id === item.id) continue;
    for (const s of equivalentsOf(other)) {
      const k = normalizeWordForCompare(s);
      if (taken.has(k)) continue;
      taken.add(k);
      decoys.push(s);
      break; // at most one decoy per entry, so the options do not all come from one family
    }
    if (decoys.length >= 3) break;
  }
  if (decoys.length < 2) return null; // too few distractors → not worth a card
  const options = [answer, ...decoys.slice(0, 3)];
  // Deterministic-enough shuffle; order only needs to not always put the answer first.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { options, answer };
}

function Paraphrase({ items, pool, onDone, review }: VocabCardProps) {
  const it = items[0];
  // Options are shuffled at build time → a graded card reuses the saved order and pick.
  const seen = review as { options?: string[]; answer?: string; picked?: string } | null | undefined;
  const built = useMemo(
    () => (seen?.options?.length && seen.answer ? { options: seen.options, answer: seen.answer } : buildOptions(it, pool)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [it, pool],
  );
  const [picked, setPicked] = useState<string | null>(seen?.picked ?? null);
  const { pending, run } = useAutoNext();

  const choose = (opt: string) => {
    if (!built || picked !== null || pending) return;
    const right = opt === built.answer;
    setPicked(opt);
    run(() => onDone([{ item: it, correct: right }], { options: built.options, answer: built.answer, picked: opt }), right ? 800 : 1800, { chime: right ? "right" : "wrong" });
  };
  // Declared before the early return below — hooks must run on every render.
  useChoiceKeys(built?.options.length ?? 0, (i) => { if (built) choose(built.options[i]); }, !!built && picked === null && !pending);

  if (!built) return null;
  const { options, answer } = built;
  const done = picked !== null;
  const ok = picked === answer;

  return (
    <CardShell
      Icon={Repeat2}
      label="Paraphrase"
      tone="bg-teal-500/15 text-teal-600 dark:text-teal-400"
      hint="Pick the expression that means the same"
      footer={done ? <FooterResult ok={ok} answer={`Answer: ${answer}`} /> : undefined}
    >
      <div className="mb-5">
        <WordDisplay word={stripTag(it.word)} pos={it.pos} sub={it.meaning ?? undefined} />
      </div>
      <p className="mb-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Which one says the same thing?
      </p>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const isAnswer = opt === answer;
          const chosen = picked === opt;
          const tone = !done
            ? "border-slate-200 hover:border-teal-400 hover:bg-teal-50 dark:border-slate-700 dark:hover:border-teal-600 dark:hover:bg-teal-500/10"
            : isAnswer
              ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
              : chosen
                ? "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-600 dark:bg-rose-500/10 dark:text-rose-300"
                : "border-slate-200 opacity-60 dark:border-slate-700";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => choose(opt)}
              disabled={done}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${tone}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "paraphrase",
  label: "Paraphrase",
  hint: "Pick the expression that means the same",
  Icon: Repeat2,
  tone: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  Component: Paraphrase,
  // Needs its own equivalents AND enough other entries to draw distractors from.
  build: (items) => items.filter((i) => buildOptions(i, items) !== null).map((i) => [i]),
};
