// Hiển thị điểm phát âm TỪNG ÂM VỊ (IPA) — dùng chung cho luyện TỪ VỰNG (grid mọi âm)
// và ĐỌC TO (grid theo từ khi bấm + dòng "âm cần luyện lại" gộp cả bài).
// Azure returns `phonemes` per word (granularity=Phoneme).
import type { ReactNode } from "react";
import { collectWeakPhonemes, foldPhoneme, stripWordTag, type ReadingWordResult } from "@msyen/shared";
import { Tooltip } from "../Tooltip";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

// Chuẩn hoá IPA hẹp của Azure về dạng từ điển (ɹ→r, ɡ→g, ɚ→ər…) — dùng chung từ shared,
// thay TỪNG glyph nên âm ghép như ɛɹ, ɔɹ cũng đổi đúng (ɛɹ → ɛr).
const prettyPhoneme = foldPhoneme;

/** Phiên âm HOÀN CHỈNH của 1 từ: nối các âm vị (đã đẹp hoá) trong dấu / /. "" nếu chưa có. */
export function wordTranscription(word: ReadingWordResult): string {
  const ph = word.phonemes ?? [];
  if (!ph.length) return "";
  return `/${ph.map((p) => prettyPhoneme(p.phoneme)).join("")}/`;
}

// Thang màu 3 mức (xanh ≥80 · vàng ≥60 · đỏ) — nhất quán cho ô âm vị ở mọi nơi.
const phonColor = (s: number) => (s >= 80 ? "text-emerald-500" : s >= 60 ? "text-amber-500" : "text-rose-500");
const phonBorder = (s: number) =>
  s >= 80
    ? "border-emerald-200 dark:border-emerald-900/70"
    : s >= 60
      ? "border-amber-200 dark:border-amber-900/70"
      : "border-rose-300 dark:border-rose-900/70";

/**
 * Grid các ô âm vị của MỘT từ (mỗi ô: ký hiệu IPA + điểm, tô màu theo điểm).
 * Dùng thẻ <span> (flex) để hợp lệ khi đặt TRONG tooltip/nút của đoạn đọc.
 * `compact` = cỡ nhỏ hơn cho tooltip (gọn, không chiếm chỗ).
 */
export function WordPhonemeGrid({
  word,
  showLabel = false,
  compact = false,
  align = "center",
}: {
  word: ReadingWordResult;
  showLabel?: boolean;
  compact?: boolean;
  align?: "left" | "center";
}) {
  const phonemes = word.phonemes ?? [];
  if (!phonemes.length) return null;
  return (
    <span className={cn("flex flex-wrap items-center", align === "left" ? "justify-start" : "justify-center", compact ? "gap-1" : "gap-1.5")}>
      {showLabel && <span className="mr-1 text-xs font-semibold text-slate-500">{stripWordTag(word.word)}:</span>}
      {phonemes.map((p, i) => (
        <span
          key={i}
          className={cn(
            "inline-flex flex-col items-center rounded-lg border bg-white dark:bg-slate-900",
            compact ? "min-w-[1.6rem] px-1 py-0.5" : "min-w-[2rem] px-1.5 py-1",
            phonBorder(p.accuracy),
          )}
          title={`${Math.round(p.accuracy)}%`}
        >
          <span className={cn("font-ipa font-bold leading-none", compact ? "text-sm" : "text-base", phonColor(p.accuracy))}>
            {prettyPhoneme(p.phoneme)}
          </span>
          <span className={cn("tabular-nums text-slate-400", compact ? "text-[9px]" : "mt-0.5 text-[10px]")}>
            {Math.round(p.accuracy)}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Chips per row inside the tooltip. Fixed rows are what let the panel hug its content: a
 *  flex-wrap box reports its max-content width as EVERY chip on one line, so with a max-width it
 *  always rendered at full width and left an empty strip beside a short phrase. 7 chips also keep
 *  the panel under ~270px, which still fits a narrow phone. */
const TIP_ROW = 7;

/**
 * Phoneme chips INSIDE the phrase tooltip: glyph on top, score under it, in a box tinted by score.
 * Stacked rather than side by side because the tip has to fit a whole phrase — `ʃ 14` on one line
 * is roughly twice as wide per sound. Word boundaries show as a wider gap, not as a label:
 * repeating the word before every group cost more width than it explained.
 */
function TipChips({ words }: { words: ReadingWordResult[] }) {
  // Flatten to one stream, remembering where each word starts so the gap can mark the boundary.
  const flat = words.flatMap((wd, wi) =>
    (wd.phonemes ?? []).map((p, i) => ({ p, newWord: wi > 0 && i === 0 })),
  );
  const rows = Array.from({ length: Math.ceil(flat.length / TIP_ROW) }, (_, r) =>
    flat.slice(r * TIP_ROW, (r + 1) * TIP_ROW),
  );
  return (
    <span className="flex flex-col gap-1.5">
      {rows.map((row, r) => (
        <span key={r} className="flex items-center gap-1">
          {row.map(({ p, newWord }, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex min-w-[1.7rem] flex-col items-center rounded-lg border px-1 py-0.5",
                phonBorder(p.accuracy),
                newWord && i > 0 && "ml-2.5",
              )}
            >
              <span className={cn("font-ipa text-sm font-bold leading-none", phonColor(p.accuracy))}>{prettyPhoneme(p.phoneme)}</span>
              <span className="mt-0.5 text-[9px] leading-none tabular-nums text-slate-400">{Math.round(p.accuracy)}</span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

/**
 * Whole-phrase transcription with ONE coloured glyph per phoneme — no boxes, no numbers.
 * A phrase scored with the boxed grid ran to two or three rows and read as separate words rather
 * than one thing to say; written out as plain IPA it stays a single line the learner can read.
 *
 * ONE tooltip covers the whole line and carries the full breakdown (every sound, its colour and its
 * score). Per-glyph tooltips were wrong twice over: the reader had to hunt sound by sound, and each
 * Tooltip wraps its child in an inline-flex box, which broke the phrase into one glyph per row.
 */
export function PhraseTranscript({ words, align = "left" }: {
  words: ReadingWordResult[];
  align?: "left" | "center";
}) {
  const scored = words.filter((w) => (w.phonemes?.length ?? 0) > 0);
  if (!scored.length) return null;
  return (
    <p className={cn("leading-relaxed", align === "center" ? "text-center" : "text-left")}>
      {/* The tooltip wraps the TEXT only, not the row: hovering the empty space beside a short
          phrase used to pop the panel open. */}
      <Tooltip
        clickable
        holdMs={8000}
        // Light panel in BOTH themes: the dark default washed out the amber/emerald chip borders.
        panelClassName="w-max bg-white text-slate-700 ring-1 ring-slate-200 px-2.5 py-2 dark:bg-white dark:text-slate-700"
        label={<TipChips words={scored} />}
      >
        <span className="font-ipa cursor-pointer text-lg">
          <span className="text-slate-300 dark:text-slate-600">/</span>
          {scored.map((wd, wi) => (
            <span key={wi}>
              {wi > 0 && " "}
              {(wd.phonemes ?? []).map((p, i) => (
                <span key={i} className={cn("font-bold", phonColor(p.accuracy))}>
                  {prettyPhoneme(p.phoneme)}
                </span>
              ))}
            </span>
          ))}
          <span className="text-slate-300 dark:text-slate-600">/</span>
        </span>
      </Tooltip>
    </p>
  );
}

/**
 * The "sounds to practise again" line — pools the weak phonemes across the words passed in.
 * `minOccur` = how often a sound must appear before it is listed (shared default: 2, so only
 * SYSTEMATIC errors). Vocabulary drills pass `minOccur=1` to surface every sound below 60.
 */
export function WeakPhonemeLine({
  words,
  minOccur,
  className,
  align = "center",
}: {
  words: ReadingWordResult[];
  minOccur?: number;
  className?: string;
  align?: "left" | "center";
}) {
  const weak = collectWeakPhonemes(words, minOccur != null ? { minOccur } : undefined);
  if (!weak.length) return null;
  return (
    <p className={cn("text-xs text-slate-500", align === "left" ? "text-left" : "text-center", className)}>
      {t("practice2.phoneme.weak")} <span className="font-bold text-rose-500">{weak.map((w) => prettyPhoneme(w.phoneme)).join(" · ")}</span>
    </p>
  );
}

/**
 * The full "per-sound detail (IPA)" block for vocabulary practice, plus the weak-sound line
 * (every sound below 60, even a one-off -> minOccur=1).
 *
 * ONE word keeps the boxed grid: there is room for the score under each glyph and it reads well.
 * A PHRASE switches to the inline transcript — the boxes wrapped onto several rows and made one
 * phrase look like two unrelated words. Scores move into the per-glyph tooltip.
 */
export function PhonemeBreakdown({ words, headerRight, bare }: {
  words: ReadingWordResult[];
  headerRight?: ReactNode;
  /** Drops the tinted panel and tightens the spacing — for a card that is already its own surface. */
  bare?: boolean;
}) {
  const wordPhonemes = words.filter(
    (w) => (w.phonemes?.length ?? 0) > 0 && w.errorType !== "Omission" && w.errorType !== "Insertion",
  );
  if (!wordPhonemes.length) return null;
  const multi = wordPhonemes.length > 1;
  return (
    <div className={cn(bare ? "" : "mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/50")}>
      {/* Tiêu đề + (tuỳ chọn) hành động bên phải, vd nút nghe lại giọng người học ở dạng Pronounce. */}
      <div className={cn("flex items-center gap-2", bare ? "mb-1 justify-start" : "mb-2 justify-center")}>
        <p className="text-xs font-semibold text-slate-400">{t("practice2.phoneme.details")}</p>
        {headerRight}
      </div>
      {multi ? (
        <PhraseTranscript words={wordPhonemes} align={bare ? "left" : "center"} />
      ) : (
        <div className={bare ? "space-y-1" : "space-y-2"}>
          {wordPhonemes.map((wd, wi) => (
            <WordPhonemeGrid key={wi} word={wd} align={bare ? "left" : "center"} />
          ))}
        </div>
      )}
      <WeakPhonemeLine words={wordPhonemes} minOccur={1} align={bare ? "left" : "center"} className={bare ? "mt-1.5" : "mt-2.5"} />
    </div>
  );
}
