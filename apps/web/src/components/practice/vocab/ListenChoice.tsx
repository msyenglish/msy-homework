// Dạng #4 — NGHE → CHỌN ABCD: nghe từ, chọn nghĩa đúng. Nhiễu lấy từ nghĩa các từ khác.
import { useMemo, useState } from "react";
import { Headphones } from "lucide-react";
import { AudioPrompt, CardShell, ChoiceRow, FooterResult, useAutoNext, useChoiceKeys } from "./shell";
import { oneEach, shuffle, stripTag, type VocabCardDef, type VocabCardProps } from "./types";

function ListenChoice({ items, pool, onDone, review }: VocabCardProps) {
  const it = items[0];
  const word = stripTag(it.word);
  // A graded card keeps its OWN option order — rebuilding it would show a different question than
  // the one that was answered.
  const seen = review as { opts?: string[]; picked?: number } | null | undefined;
  const opts = useMemo(() => {
    if (seen?.opts?.length) return seen.opts;
    const distract = shuffle(pool.filter((p) => p.id !== it.id && p.meaning)).slice(0, 3).map((p) => p.meaning!);
    return shuffle([it.meaning!, ...distract]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [it, pool]);
  const [picked, setPicked] = useState<number | null>(seen?.picked ?? null);
  const { pending, run } = useAutoNext();

  const pick = (i: number) => {
    if (picked !== null || pending) return;
    setPicked(i);
    const ok = opts[i] === it.meaning;
    run(() => onDone([{ item: it, correct: ok }], { opts, picked: i }), ok ? 700 : 1500, { chime: ok ? "right" : "wrong" });
  };
  useChoiceKeys(opts.length, pick, picked === null);

  return (
    <CardShell Icon={Headphones} label="Listen & choose" tone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
      hint="Listen and pick the meaning"
      footer={picked === null ? undefined
        : <FooterResult ok={opts[picked] === it.meaning} answer="Not quite" />}>
      <AudioPrompt word={word} autoPlay className="mb-5" />
      {/* Mobile: 1 cột (đáp án dài không bị bó 2 cột gây vỡ chữ) · desktop: 2 cột. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opts.map((o, i) => (
          <ChoiceRow key={o} index={i} text={o} disabled={picked !== null}
            state={picked === null ? "idle" : o === it.meaning ? "correct" : i === picked ? "wrong" : "muted"}
            onClick={() => pick(i)} />
        ))}
      </div>
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "listen_choice", label: "Listen & choose", hint: "Listen and pick the meaning",
  Icon: Headphones, tone: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  Component: ListenChoice,
  // Cần ≥4 từ CÓ NGHĨA để đủ 1 đáp án đúng + 3 nhiễu.
  build: (items) => { const w = items.filter((i) => i.meaning); return w.length >= 4 ? oneEach(w) : []; },
};
