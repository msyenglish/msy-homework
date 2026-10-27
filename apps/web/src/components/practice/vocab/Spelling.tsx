// Dạng #8 — XẾP CHỮ: các chữ cái bị xáo, ghép lại thành từ đúng.
import { useMemo, useState } from "react";
import { Lightbulb, Shuffle } from "lucide-react";
import { Button } from "../../ui";
import { CardShell, FooterResult, SpeakButton, useAutoNext } from "./shell";
import { useCardKeys } from "./hotkeys";
import { cn } from "../../../lib/utils";
import { oneEach, shuffle, stripTag, type VocabCardDef, type VocabCardProps } from "./types";

function Spelling({ items, onDone, review }: VocabCardProps) {
  const it = items[0];
  const target = stripTag(it.word);
  // A graded card keeps the tiles exactly where they were: same scramble, same picks.
  const seen = review as { letters?: string[]; picked?: number[]; ok?: boolean } | null | undefined;
  // Scrambled per word so a phrase keeps its word boundaries (easier to read).
  const letters = useMemo(
    () => (seen?.letters?.length
      ? seen.letters.map((ch, i) => ({ ch, i }))
      : shuffle(target.split("").map((ch, i) => ({ ch, i })))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [target],
  );
  const [picked, setPicked] = useState<number[]>(seen?.picked ?? []);
  const [state, setState] = useState<"idle" | "correct" | "wrong">(
    seen ? (seen.ok ? "correct" : "wrong") : "idle",
  );
  const [hintOn, setHintOn] = useState(false);
  const { pending, run } = useAutoNext();

  const built = picked.map((i) => letters[i].ch).join("");
  const check = () => {
    if (state !== "idle" || pending) return;
    const ok = built.trim().toLowerCase() === target.trim().toLowerCase();
    setState(ok ? "correct" : "wrong");
    run(
      () => onDone([{ item: it, correct: ok }], { letters: letters.map((l) => l.ch), picked, ok }),
      ok ? 700 : 1800,
      { chime: ok ? "right" : "wrong", say: { word: target } },
    );
  };

  // Typing a letter grabs the first unused tile carrying it — much faster than hunting tiles with
  // the mouse. Backspace takes the last one back, Esc clears the row.
  const keyMap: Record<string, () => void> = {
    enter: () => { if (picked.length === letters.length) check(); },
    backspace: () => setPicked((p) => p.slice(0, -1)),
    escape: () => setPicked([]),
  };
  letters.forEach((l, i) => {
    if (picked.includes(i)) return;
    const k = l.ch === " " ? "space" : l.ch.toLowerCase();
    if (!keyMap[k]) keyMap[k] = () => setPicked((p) => [...p, i]);
  });
  useCardKeys(keyMap, state === "idle" && !pending);

  return (
    <CardShell Icon={Shuffle} label="Unscramble" tone="bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400"
      hint={it.meaning ? `Build the word for: “${it.meaning}”` : "Arrange the letters into the word"}
      footer={state === "idle" ? (
        <div className="flex gap-2">
          <Button variant="outline" size="lg" disabled={!picked.length} onClick={() => setPicked([])}>Clear</Button>
          <Button size="lg" className="flex-1" disabled={picked.length !== letters.length} onClick={check}>Check</Button>
        </div>
      ) : <FooterResult ok={state === "correct"} answer={`Answer: ${target}`} />}>
      {/* Ô đáp án đang ghép */}
      <div className={cn("mb-4 flex min-h-[56px] flex-wrap items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-3 py-2",
        state === "correct" ? "border-emerald-400" : state === "wrong" ? "border-rose-400" : "border-slate-200 dark:border-slate-700")}>
        {picked.length === 0 ? <span className="text-sm text-slate-300 dark:text-slate-600">tap the letters below</span> :
          picked.map((li, n) => {
            // Sau khi bấm Check: tô viền TỪNG ký tự — đúng vị trí = xanh, sai = đỏ.
            const charOk = built[n]?.toLowerCase() === target[n]?.toLowerCase();
            return (
              <button key={n} type="button" disabled={state !== "idle"} onClick={() => setPicked((p) => p.filter((_, x) => x !== n))}
                className={cn("rounded-lg px-2.5 py-1.5 text-lg font-bold transition",
                  state === "idle"
                    ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    : charOk
                      ? "border-2 border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-2 border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/10 dark:text-rose-300")}>
                {letters[li].ch === " " ? "␣" : letters[li].ch}
              </button>
            );
          })}
      </div>
      {/* Gợi ý chữ cái đầu — như dạng Nghĩa → từ, giúp định hướng khi bí. */}
      {state === "idle" && (
        <div className="mb-3 flex justify-center text-xs">
          <button type="button" onClick={() => setHintOn(true)} disabled={hintOn}
            className="inline-flex items-center gap-1 font-medium text-amber-600 disabled:text-slate-400 dark:text-amber-400">
            <Lightbulb className="size-3.5" /> {hintOn ? `starts with “${target[0]}”` : "hint: first letter"}
          </button>
        </div>
      )}
      {/* Kho chữ cái */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {letters.map((l, i) => (
          <button key={i} type="button" disabled={picked.includes(i) || state !== "idle"} onClick={() => setPicked((p) => [...p, i])}
            className={cn("size-11 rounded-xl border-2 text-lg font-bold transition",
              picked.includes(i) ? "border-slate-100 text-slate-200 dark:border-slate-800 dark:text-slate-700"
                : "border-slate-200 text-slate-700 hover:border-cyan-400 hover:bg-cyan-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-cyan-500/10")}>
            {l.ch === " " ? "␣" : l.ch}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-center"><SpeakButton word={target} variant="framed" /></div>
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "spelling", label: "Unscramble", hint: "Arrange the letters into the word",
  Icon: Shuffle, tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  Component: Spelling,
  // Từ quá dài xếp rất mệt → chỉ dùng cho từ 3–12 ký tự.
  build: (items) => oneEach(items.filter((i) => { const w = stripTag(i.word); return w.length >= 3 && w.length <= 12; })),
};
