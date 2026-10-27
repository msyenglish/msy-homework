// Dạng #5 — PHÁT ÂM (chấm điểm Azure). CHỈ dành cho user đăng nhập (deck HS ép tắt).
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "../../ui";
import { AudioRecorder } from "../../AudioRecorder";
import { PhonemeBreakdown } from "../PhonemeBreakdown";
import { accountApi, type VocabPronResult } from "../../../lib/api";
import { CardShell, WordHead } from "./shell";
import { useCardKeys } from "./hotkeys";
import { loadPronClip, pronClipKey, prunePronClips, savePronClip } from "../../../lib/pronAudioStore";
import { cn } from "../../../lib/utils";
import { oneEach, stripTag, type VocabCardDef, type VocabCardProps } from "./types";
import { t } from "../../../i18n";

function Pronounce({ items, onDone, review }: VocabCardProps) {
  const it = items[0];
  const target = stripTag(it.word);
  // Already graded → show the score and the per-sound breakdown of that take again.
  const seen = review as { result?: VocabPronResult } | null | undefined;
  const [res, setRes] = useState<VocabPronResult | null>(seen?.result ?? null);
  const [busy, setBusy] = useState(false);
  // The learner's own take stays LOCAL (object URL now, IndexedDB across visits) — never uploaded.
  const myAudio = useRef<string | null>(null);
  const clipKey = pronClipKey(target);
  useEffect(() => () => { if (myAudio.current) URL.revokeObjectURL(myAudio.current); }, []);
  // Walking back to the card: pull the recording out of local storage so it can be replayed.
  useEffect(() => {
    if (!seen || myAudio.current) return;
    let alive = true;
    loadPronClip(clipKey).then((blob) => {
      if (!alive || !blob) return;
      myAudio.current = URL.createObjectURL(blob);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey]);

  const grade = async (blob: Blob | null) => {
    if (!blob) return;
    if (myAudio.current) URL.revokeObjectURL(myAudio.current);
    myAudio.current = URL.createObjectURL(blob);
    void savePronClip(clipKey, blob).then(prunePronClips);
    setBusy(true);
    try {
      const r = await accountApi.vocabPronounce(target, blob);
      setRes(r);
      // Banked as soon as it exists — waiting for "Continue" threw away an Azure call, a quota unit
      // and the learner's score if they moved on with the arrows. `stay` because scoring is not the
      // end of this card: reading again is the whole point of a pronunciation drill.
      onDone([{ item: it, correct: r.pronScore >= 50, pron: r.pronScore }], { result: r }, { stay: true });
    } catch { /* ignore */ }
    setBusy(false);
  };
  const replay = () => { if (myAudio.current) void new Audio(myAudio.current).play().catch(() => {}); };
  const goOn = () => { if (res) onDone([{ item: it, correct: res.pronScore >= 50 }], { result: res }); };
  // R records / stops (handed to the recorder itself, which owns that state); once a score is up,
  // R reads again — the same key means "speak" throughout the card.
  useCardKeys({ p: replay, enter: goOn, r: () => setRes(null) }, !!res && !busy);
  const tone = (s: number) => (s >= 80 ? "text-emerald-500" : s >= 60 ? "text-amber-500" : "text-rose-500");

  return (
    <CardShell Icon={Mic} label="Pronounce" tone="bg-rose-500/15 text-rose-600 dark:text-rose-400"
      hint={res ? "Score for each sound" : "Tap the mic and say this word"}
      footer={res ? (
        // Reading again matters: a score often dips because of the mic or background noise, and
        // being pushed on after one shot is maddening. The best take is the one that counts.
        // Continue reports NO score, which the deck reads as "just move on".
        <div className="flex w-full items-center gap-2">
          <Button size="lg" variant="outline" className="shrink-0" onClick={() => setRes(null)}>
            <RotateCcw className="size-4" /> Read again
          </Button>
          <Button size="lg" className="flex-1" onClick={goOn}>
            Continue →
          </Button>
        </div>
      ) : undefined}>
      {/* Từ khoá căn giữa + loa treo bên phải (tự phát khi đến thẻ) — nghe mẫu ngay rồi đọc theo. */}
      <WordHead word={target} ipa={it.ipa} pos={it.pos} autoPlay />
      {it.meaning && <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">{it.meaning}</p>}

      {!res ? (
        <div className="mt-4">
          {busy ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Scoring your pronunciation…</p>
          ) : (
            <AudioRecorder maxSeconds={8} hint="" recordLabel="Tap to record (R)" onRecorded={grade} hotkey="r" />
          )}
        </div>
      ) : (
        <div className="mt-4 text-center">
          <p className="text-sm text-slate-500">Pronunciation score</p>
          <p className={cn("text-5xl font-extrabold tabular-nums", tone(res.pronScore))}>{res.pronScore}</p>
          {res.words?.length > 0 && (
            <PhonemeBreakdown
              words={res.words}
              headerRight={
                myAudio.current ? (
                  <button type="button" onClick={replay}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-cyan-400">
                    <Volume2 className="size-3" /> {t("practice2.speech.replay")}
                  </button>
                ) : null
              }
            />
          )}
        </div>
      )}
    </CardShell>
  );
}

export const def: VocabCardDef = {
  id: "pronounce", label: "Pronounce", hint: "Tap the mic and say this word",
  Icon: Mic, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  Component: Pronounce, build: oneEach,
};
