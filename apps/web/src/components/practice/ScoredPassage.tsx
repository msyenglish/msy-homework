// A graded passage whose words are tappable — shared by READ-ALOUD and SHADOWING.
// Single home for: the pronunciation colour scale, the per-word label, and the detail
// tooltip (score % · listen · transcription · per-phoneme grid).
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2, Volume2 } from "lucide-react";
import { wordAccuracy } from "@msyen/shared";
import { wordIpaWithStress } from "../../lib/wordIpa";
import { type ReadingWordResult } from "../../lib/api";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";
import { WordPhonemeGrid, wordTranscription } from "./PhonemeBreakdown";

// ── PRONUNCIATION COLOUR SCALE — one source for the words in the passage, the "practise
// this word" chips and the legend, so they can never drift apart. 5 bands, each its own hue
// family (green → lime → amber → orange → red) so no two bands read alike.
// Light mode uses the deep shades (-600/-700) for contrast on white, dark mode the light ones
// (-400/-300); `dot` (-500) is the legend dot representing the hue in both themes.
export type AccTier = {
  min: number;
  label: string;
  range: string;
  text: string;
  chip: string;
  dot: string;
};
function accTierDef(min: number, labelKey: TKey, range: string, text: string, chip: string, dot: string): AccTier {
  return { min, get label() { return t(labelKey); }, range, text, chip, dot };
}

export const ACC_TIERS: AccTier[] = [
  accTierDef(90, "practice2.pronunciation.excellent", "≥90", "text-emerald-600 dark:text-emerald-400", "border-emerald-400 text-emerald-700 dark:border-emerald-600 dark:text-emerald-300", "text-emerald-500"),
  accTierDef(80, "practice2.pronunciation.good", "80–89", "text-lime-600 dark:text-lime-400", "border-lime-400 text-lime-700 dark:border-lime-600 dark:text-lime-300", "text-lime-500"),
  accTierDef(60, "practice2.pronunciation.fair", "60–79", "text-amber-600 dark:text-amber-400", "border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-300", "text-amber-500"),
  accTierDef(50, "practice2.pronunciation.weak", "50–59", "text-orange-600 dark:text-orange-400", "border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-300", "text-orange-500"),
  accTierDef(0, "practice2.pronunciation.inaccurate", "<50", "text-rose-600 dark:text-rose-400", "border-rose-400 text-rose-700 dark:border-rose-600 dark:text-rose-300", "text-rose-500"),
];

// Colour band for an accuracy score 0-100 (text/chip classes + the Vietnamese label).
export function accTier(a: number): AccTier {
  return ACC_TIERS.find((t) => a >= t.min) ?? ACC_TIERS[ACC_TIERS.length - 1];
}

// Word colour in a graded passage: omission/insertion have their own colour, the rest follow the
// score. The score is the phoneme-anchored one (shared/reading.ts) — Azure's own per-word number
// would paint a word green while the IPA grid right below it shows a sound at 58.
export function wordClass(w: ReadingWordResult) {
  if (w.errorType === "Omission")
    return "text-slate-400 line-through decoration-slate-300 dark:text-slate-600";
  if (w.errorType === "Insertion")
    return "text-violet-500 italic dark:text-violet-400";
  return accTier(wordAccuracy(w)).text;
}

// Vietnamese label for one word: missing/extra by error type, otherwise by score band.
export function wordLabel(w: ReadingWordResult) {
  if (w.errorType === "Omission") return t("practice2.pronunciation.omission");
  if (w.errorType === "Insertion") return t("practice2.pronunciation.insertion");
  return accTier(wordAccuracy(w)).label;
}

// Context for the word tooltips: on-demand speech for a single word + the stress-marked IPA
// map (built from passage_ipa). Optional — without a provider the tooltip just omits both.
export const WordToolCtx = createContext<{
  speak?: (w: string) => void;
  loading?: string | null; // word whose audio is LOADING (lowercased) → spinner
  speaking?: string | null; // word currently PLAYING (lowercased) → highlighted speaker
  ipaMap?: Map<string, string>; // word → IPA (with ˈ/ˌ) from passage_ipa
}>({});

// Tooltip body for one word: "Điểm: X% · label" (coloured) + LISTEN button + transcription +
// phoneme grid. Reused by the graded passage AND the keywords inside the teacher's feedback.
export function WordScoreTooltip({ word }: { word: ReadingWordResult }) {
  const ctx = useContext(WordToolCtx);
  // Clamp to the viewport: after render, shift horizontally just enough to stay fully visible
  // when the word sits near an edge. Uses marginLeft (the element is already -translate-x-1/2).
  const tipRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    let s = 0;
    if (r.left < pad) s = pad - r.left;
    else if (r.right > window.innerWidth - pad)
      s = window.innerWidth - pad - r.right;
    setShift(Math.round(s));
  }, []);
  const hasPh =
    (word.phonemes?.length ?? 0) > 0 &&
    word.errorType !== "Omission" &&
    word.errorType !== "Insertion";
  // Transcription: prefer the STRESS-MARKED one from passage_ipa; else join Azure's phonemes.
  const ipaText =
    (ctx.ipaMap && wordIpaWithStress(ctx.ipaMap, word.word)) ||
    (hasPh ? wordTranscription(word) : "");
  // Every script word can be played back (including omissions); inserted words cannot.
  const canSpeak = !!ctx.speak && word.errorType !== "Insertion";
  const wkey = (word.word || "").trim().toLowerCase();
  const isLoading = ctx.loading != null && ctx.loading === wkey; // spinner ONLY while loading
  const isPlaying = ctx.speaking != null && ctx.speaking === wkey;
  return (
    <span
      ref={tipRef}
      style={{ marginLeft: shift }}
      className="absolute bottom-full left-1/2 z-30 mb-1.5 flex w-max max-w-[min(20rem,92vw)] -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    >
      <span className="flex items-center gap-2">
        <span className="whitespace-nowrap text-[11px] font-semibold">
          <span className="text-slate-400">{t("practice2.pronunciation.score")} </span>
          <span className={accTier(wordAccuracy(word)).text}>
            {Math.round(wordAccuracy(word))}% · {wordLabel(word)}
          </span>
        </span>
        {canSpeak && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              ctx.speak!(word.word);
            }}
            aria-label={t("practice2.pronunciation.listenWord")}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-white transition",
              isPlaying ? "bg-cyan-600" : "bg-cyan-500 hover:bg-cyan-600",
            )}
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </button>
        )}
      </span>
      {/* Full transcription in slashes — stress-marked version preferred. */}
      {ipaText && (
        <span className="font-ipa text-sm font-semibold text-slate-500 dark:text-slate-300">
          {ipaText}
        </span>
      )}
      {hasPh && <WordPhonemeGrid word={word} compact />}
    </span>
  );
}

// One tappable WORD → opens the score tooltip (click, not hover: phones have no hover; a tap
// outside closes it). Used by the graded passage and the feedback keywords alike.
// `active` = the word being played back: it only tints the background, it does NOT open the
// tooltip — clearly distinct from `open`, which the learner controls.
export function ScoredWord({
  word,
  className,
  active = false,
  children,
}: {
  word: ReadingWordResult;
  className?: string;
  active?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  // Word being played → scroll it gently into view where supported.
  useEffect(() => {
    if (active)
      btnRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);
  return (
    <span ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded px-0.5 transition-colors",
          className,
          // Highlight while playing back (wins) or while the tooltip is open.
          active
            ? "bg-cyan-200 ring-1 ring-cyan-400 dark:bg-cyan-500/40 dark:ring-cyan-500"
            : open &&
                "bg-cyan-100 ring-1 ring-cyan-300 dark:bg-cyan-500/25 dark:ring-cyan-700",
        )}
      >
        {children}
      </button>
      {open && <WordScoreTooltip word={word} />}
    </span>
  );
}

// A graded passage — tap any word for its score tooltip (no hover needed).
// `activeIdx` = word currently played back (time-synced) → highlighted; null = none.
export function ScoredPassage({
  words,
  activeIdx = null,
}: {
  words: ReadingWordResult[];
  activeIdx?: number | null;
}) {
  // Khe hẹp: mỗi từ đã có px-0.5 riêng, cộng thêm gap rộng thì câu dài bị xuống dòng sớm.
  return (
    <p className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1.5">
      {words.map((w, i) => (
        <ScoredWord
          key={i}
          word={w}
          className={wordClass(w)}
          active={activeIdx === i}
        >
          {w.word}
        </ScoredWord>
      ))}
    </p>
  );
}
