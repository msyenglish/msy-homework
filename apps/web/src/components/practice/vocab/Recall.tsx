// Dạng #7 — NGHĨA → TỪ: đọc nghĩa tiếng Việt, gõ lại từ tiếng Anh (gợi nhớ chủ động).
// Ô điền TỪNG CHỮ (LetterBoxes) như Nghe & viết: gõ tới đâu xanh/đỏ tới đó; đúng hết = tự sang.
import { useEffect, useState } from "react";
import { Brain, Eye, Lightbulb } from "lucide-react";
import { normalizeWordForCompare } from "@msyen/shared";
import { CardShell, FooterResult, LetterBoxes, useAutoNext } from "./shell";
import { useModKeys } from "./hotkeys";
import { oneEach, stripTag, type VocabCardDef, type VocabCardProps } from "./types";

function Recall({ items, onDone, review }: VocabCardProps) {
  const it = items[0];
  const target = stripTag(it.word);
  // Coming back to a graded card: show the very answer that was typed, locked.
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
  // Bí hẳn → hiện luôn đáp án (điền cả vào ô cho dễ nhìn) để học mặt chữ; tính như CHƯA THUỘC.
  // Nán lâu hơn (2.8s) để kịp đọc đáp án trước khi tự sang thẻ.
  const reveal = () => {
    if (state !== "idle" || pending) return;
    setVal(target);
    setState("wrong");
    run(() => onDone([{ item: it, correct: false }], { val: target, ok: false }), 2800, {
      chime: "wrong",
      say: { word: target },
    });
  };
  useEffect(() => {
    if (state === "idle" && normalizeWordForCompare(val) === normalizeWordForCompare(target)) grade();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val]);
  // The caret lives in the letter boxes, so these two need a modifier to reach past it.
  useModKeys({ h: () => setHintOn(true), y: reveal }, state === "idle");

  return (
    <CardShell Icon={Brain} label="Meaning → word" tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
      hint="What's the English word for this?"
      footer={state === "idle" ? undefined
        : <FooterResult ok={state === "correct"} answer={`Answer: ${target}`} />}>
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{it.meaning}</p>
        {it.pos && <p className="mt-1 text-sm text-slate-400">({it.pos})</p>}
      </div>
      <LetterBoxes target={target} value={val} onChange={setVal} state={state} hint={hintOn} autoFocus onEnter={grade} />
      <div className="mt-5 flex min-h-[20px] flex-col items-center justify-center gap-2 text-xs">
        {filledWrong && (
          <span className="text-slate-400">Not quite — fix it, or show the answer below</span>
        )}
        {state === "idle" && (
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setHintOn(true)} disabled={hintOn}
              className="inline-flex items-center gap-1 font-medium text-amber-600 disabled:text-slate-300 dark:text-amber-400 dark:disabled:text-slate-600">
              <Lightbulb className="size-3.5" /> {hintOn ? "hint shown" : "hint: first letter"}
            </button>
            <button type="button" onClick={reveal}
              className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              <Eye className="size-3.5" /> show answer
            </button>
          </div>
        )}
      </div>
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "recall", label: "Meaning → word", hint: "What's the English word for this?",
  Icon: Brain, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Component: Recall,
  build: (items) => oneEach(items.filter((i) => i.meaning)),
};
