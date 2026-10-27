// Dạng #6 — NGHE → VIẾT (chính tả): nghe từ rồi gõ từng chữ. Tự phát khi thẻ hiện ra.
// Ô điền TỪNG CHỮ (LetterBoxes) như Dictation câu: gõ tới đâu xanh/đỏ tới đó; đúng hết = tự sang.
import { useEffect, useState } from "react";
import { PenLine, Lightbulb } from "lucide-react";
import { normalizeWordForCompare } from "@msyen/shared";
import { AudioPrompt, CardShell, FooterResult, LetterBoxes, useAutoNext } from "./shell";
import { useModKeys } from "./hotkeys";
import { oneEach, stripTag, type VocabCardDef, type VocabCardProps } from "./types";

function Dictation({ items, onDone, review }: VocabCardProps) {
  const it = items[0];
  const target = stripTag(it.word);
  // Already graded → redraw the typed answer, locked.
  const seen = review as { val?: string; ok?: boolean } | null | undefined;
  const [val, setVal] = useState(seen?.val ?? "");
  const [hintOn, setHintOn] = useState(false);
  const [state, setState] = useState<"idle" | "correct" | "wrong">(
    seen ? (seen.ok ? "correct" : "wrong") : "idle",
  );
  const { pending, run } = useAutoNext();

  const need = target.replace(/[^A-Za-z0-9]/g, "").length;
  const got = val.replace(/[^A-Za-z0-9]/g, "").length;
  const filledWrong = state === "idle" && got >= need && normalizeWordForCompare(val) !== normalizeWordForCompare(target);

  const grade = () => {
    if (state !== "idle" || pending) return;
    const ok = normalizeWordForCompare(val) === normalizeWordForCompare(target);
    setState(ok ? "correct" : "wrong");
    run(() => onDone([{ item: it, correct: ok }], { val, ok }), ok ? 700 : 1800, {
      chime: ok ? "right" : "wrong",
      say: { word: target },
    });
  };
  // Gõ ĐÚNG hết = tự chấm & sang thẻ (không cần nút). Gõ sai thì tự sửa hoặc Enter để xem đáp án.
  useEffect(() => {
    if (state === "idle" && normalizeWordForCompare(val) === normalizeWordForCompare(target)) grade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val]);
  useModKeys({ h: () => setHintOn(true) }, state === "idle");

  return (
    <CardShell Icon={PenLine} label="Listen & type" tone="bg-sky-500/15 text-sky-600 dark:text-sky-400"
      hint="Listen and type the word you hear"
      footer={state === "idle" ? undefined
        : <FooterResult ok={state === "correct"} answer={`Answer: ${target}`} />}>
      <AudioPrompt word={target} autoPlay className="mb-7" />
      <LetterBoxes target={target} value={val} onChange={setVal} state={state} hint={hintOn} autoFocus onEnter={grade} />
      <div className="mt-5 flex min-h-[20px] items-center justify-center text-xs">
        {filledWrong ? (
          <span className="text-slate-400">Not quite — fix it or press <b className="text-slate-500 dark:text-slate-300">Enter</b> to reveal</span>
        ) : state === "idle" ? (
          <button type="button" onClick={() => setHintOn(true)} disabled={hintOn}
            className="inline-flex items-center gap-1 font-medium text-amber-600 disabled:text-slate-300 dark:text-amber-400 dark:disabled:text-slate-600">
            <Lightbulb className="size-3.5" /> {hintOn ? "hint shown" : "hint: first letter"}
          </button>
        ) : null}
      </div>
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "dictation", label: "Listen & type", hint: "Listen and type the word you hear",
  Icon: PenLine, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  Component: Dictation, build: oneEach,
};
