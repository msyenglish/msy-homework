// Dạng #1 — FLASHCARD: lật thẻ xem nghĩa, tự đánh giá đã nhớ / chưa.
// Loa INLINE cạnh từ khoá (tự phát khi thẻ hiện). Đáy: [Chưa nhớ] [Đã nhớ] — Trước/Sau do CardShell thêm.
import { useState } from "react";
import { Layers, RefreshCw } from "lucide-react";
import { Button } from "../../ui";
import { stopWordAudio } from "../../../lib/useWordSpeaker";
import { CardShell, SpeakButton, WordHead } from "./shell";
import { useCardKeys } from "./hotkeys";
import { oneEach, stripTag, type VocabCardDef, type VocabCardProps } from "./types";

/** Bold + tint the keyword inline within the example sentence (case-insensitive match). */
function highlightWord(sentence: string, word: string) {
  const w = word.trim();
  if (!w) return sentence;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = sentence.split(new RegExp(`(${esc})`, "gi"));
  return parts.map((p, i) =>
    p.toLowerCase() === w.toLowerCase()
      ? <b key={i} className="font-bold not-italic text-violet-600 dark:text-violet-400">{p}</b>
      : p,
  );
}

function Flashcard({ items, onDone }: VocabCardProps) {
  const it = items[0];
  const [flip, setFlip] = useState(false);
  const word = stripTag(it.word);
  // Flip stops the current audio immediately so the two sides never overlap.
  const toggle = () => { stopWordAudio(); setFlip((v) => !v); };
  // Space flips, 1/2 rate — the two-key rhythm of a paper deck.
  useCardKeys({ space: toggle, f: toggle, "1": () => onDone([{ item: it, correct: false }]), "2": () => onDone([{ item: it, correct: true }]) });

  return (
    <CardShell
      Icon={Layers} label="Flashcard" tone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
      hint={flip ? "Do you remember this word?" : "Tap the card to see the meaning"}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => onDone([{ item: it, correct: false }])}>Not yet</Button>
          <Button size="lg" className="flex-1" onClick={() => onDone([{ item: it, correct: true }])}>Got it</Button>
        </div>
      }
    >
      {/* Div (not a button) so the speaker button can nest legally; tap the body to flip. */}
      <div role="button" tabIndex={0} onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="flex min-h-[190px] w-full cursor-pointer flex-col items-center justify-center gap-4">
        {!flip ? (
          <>
            {/* Từ căn giữa, loa treo bên phải + tự phát. */}
            <WordHead word={word} ipa={it.ipa} pos={it.pos} autoPlay />
            <span className="flex items-center gap-1 text-xs text-slate-400"><RefreshCw className="size-3" /> tap to flip</span>
          </>
        ) : (
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{it.meaning || "(no meaning yet)"}</p>
            {it.example && (
              // Example sentence + inline speaker (sentence voice) — auto-plays when the card is flipped.
              <p className="mt-3 text-sm italic text-slate-500 dark:text-slate-400">
                “{highlightWord(it.example, word)}”
                <span className="align-middle" onClick={(e) => e.stopPropagation()}>
                  <SpeakButton word={it.example} kind="sentence" variant="inline" autoPlay />
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "flashcard", label: "Flashcard", hint: "Tap the card to see the meaning",
  Icon: Layers, tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  Component: Flashcard, build: oneEach,
};
