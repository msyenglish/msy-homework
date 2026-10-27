// Vietnamese -> English translation, as ONE question inside an exercise.
//
// The prompt (the Vietnamese sentence) is the card's header, rendered by QuestionCard; this input is
// only the answer surface. Everything the learner may see about the English — the word bank, the
// initials skeleton, the "correct" mark that appears while typing — is derived from the masked
// payload the server ships (`skeleton`/`hashes`), so the sentence itself never reaches the client.
// The server regrades authoritatively on submit; the live mark is feedback, not scoring.
//
// Unlike the standalone drill (GrammarTranslateDrill), the answer is typed into ONE field rather
// than a row of per-word boxes: an exercise is a scrolling list of many questions, and per-character
// boxes with focus hand-off across all of them fight both the page flow and the IME.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  shuffleBank,
  translateAnswerKey,
  translateAnswerKeyLoose,
  translateAnswerKeyNoArticles,
  translateScaffold,
} from "@msyen/shared";
import type { QuestionInputProps } from "../types";
import { cn } from "../../../lib/utils";
import { t } from "../../../i18n";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Encoding: `value` is the English sentence as typed, plain text — the same string the server grades. */
export function TranslateInput({ q, value, onChange, graded, translateLevel = "easy" }: QuestionInputProps) {
  const scaffold = useMemo(
    () => translateScaffold(translateLevel, q.word_bank ?? null),
    [translateLevel, q.word_bank],
  );
  // Stored bank order follows the answer, so show it shuffled — stable per question, see shuffleBank.
  const bank = useMemo(
    () => (scaffold.bank?.length ? shuffleBank(scaffold.bank, String(q.position)) : []),
    [scaffold.bank, q.position],
  );
  const [live, setLive] = useState(false);
  // Guards a stale hash round trip from overwriting the mark for a newer keystroke.
  const seq = useRef(0);

  // Live marking: hash what was typed and look for it among the answer hashes. Off on `hardest`,
  // where checking is a deliberate act, and off once graded, where the real verdict is shown.
  useEffect(() => {
    if (!scaffold.liveCheck || graded || !q.hashes?.length) return;
    const mine = ++seq.current;
    if (!value.trim()) {
      setLive(false);
      return;
    }
    let alive = true;
    (async () => {
      const keys = [translateAnswerKey(value), translateAnswerKeyLoose(value)];
      if (q.article_lenient !== false) keys.push(translateAnswerKeyNoArticles(value));
      for (const k of keys) {
        if (!k) continue;
        if (q.hashes!.includes(await sha256Hex(k))) {
          if (alive && mine === seq.current) setLive(true);
          return;
        }
      }
      if (alive && mine === seq.current) setLive(false);
    })();
    return () => {
      alive = false;
    };
  }, [value, graded, scaffold.liveCheck, q.hashes, q.article_lenient]);

  return (
    <div className="space-y-3">
      {/* Word bank: the base forms, so the vocabulary is given and the inflection + word order are
          what the learner supplies. Plain chips — tapping one is not how the sentence is built. */}
      {bank.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {bank.map((w, i) => (
            <span
              key={`${w}-${i}`}
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Initials: word count and first letters, nothing more. */}
      {scaffold.initials && q.skeleton && (
        <p className="font-mono text-sm tracking-wide text-slate-400 dark:text-slate-500">{q.skeleton}</p>
      )}

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={graded}
          rows={2}
          placeholder={t("practice2.input.writeEnglish")}
          autoCapitalize="sentences"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "w-full resize-y rounded-xl border bg-white px-3 py-2.5 pr-10 text-base leading-relaxed outline-none transition-colors",
            "text-slate-800 placeholder:text-slate-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20",
            "dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600",
            "disabled:cursor-not-allowed disabled:opacity-70",
            live
              ? "border-emerald-400 dark:border-emerald-600"
              : "border-slate-200 dark:border-slate-700 dark:focus:border-cyan-400",
          )}
        />
        {live && !graded && (
          <Check className="pointer-events-none absolute right-3 top-3 size-5 text-emerald-500" aria-hidden />
        )}
      </div>
    </div>
  );
}
