// Vietnamese -> English translation drill, laid out like the video dictation practice: one sentence
// at a time, the answer typed into a row of per-word boxes that fill in character by character, and
// a control bar underneath carrying the hint, the per-sentence scrubber and the navigation.
//
// Correctness is checked against HASHES, so neither the sentence nor its words reach the client; the
// server regrades authoritatively on submit. The boxes come from `skeleton` (word count + lengths),
// which the API already ships for every rung.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ALargeSmall, AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, ClipboardCheck, Gauge, Languages, Lightbulb, Loader2, Send, X } from "lucide-react";
import {
  TRANSLATE_LEVELS,
  maxHintLevel,
  translateAnswerKey,
  translateAnswerKeyExpanded,
  translateAnswerKeyExpandedNoArticles,
  translateAnswerKeyLoose,
  translateAnswerKeyNoArticles,
  shuffleBank,
  translateScaffold,
  translateSlots,
  type GrammarTranslateItem,
  type TranslateLevel,
  type TranslateSlot,
} from "@msyen/shared";
import { playChime } from "../../lib/chime";
import { cn } from "../../lib/utils";
import { PracticeHero } from "./PracticeHero";
import { PracticeFooter } from "./PracticeFooter";
import { VerdictBurst, type Verdict } from "./VerdictBurst";
import ThemeToggle from "../ThemeToggle";
import { Popover, PopoverItem } from "../ui";
import { t, type TKey } from "../../i18n";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Each rung takes support AWAY rather than adding blanks — the opposite direction to dictation.
// Exported so the exercise start screen labels the rungs the same way the in-drill switcher does.
export const LEVELS: Record<TranslateLevel, { label: string; hint: TKey; tone: string }> = {
  easy: { label: "Easy", hint: "practice.translate.levelEasyHint", tone: "text-emerald-600 dark:text-emerald-400" },
  medium: { label: "Medium", hint: "practice.translate.levelMediumHint", tone: "text-amber-600 dark:text-amber-400" },
  hard: { label: "Hard", hint: "practice.translate.levelHardHint", tone: "text-rose-600 dark:text-rose-400" },
  hardest: { label: "Hardest", hint: "practice.translate.levelHardestHint", tone: "text-fuchsia-600 dark:text-fuchsia-400" },
};

/**
 * Four text-size steps. One step moves EVERYTHING together — prompt, boxes and the free-text field —
 * so a learner who needs bigger type gets it on every line, not just one of them. Step 1 is the
 * original look.
 */
const TEXT_STEPS = [
  { label: "S", boxes: "text-base sm:text-lg", vi: "text-base", free: "text-sm" },
  { label: "M", boxes: "text-lg sm:text-xl lg:text-2xl", vi: "text-lg", free: "text-base" },
  { label: "L", boxes: "text-xl sm:text-2xl lg:text-3xl", vi: "text-xl sm:text-2xl", free: "text-lg" },
  { label: "XL", boxes: "text-2xl sm:text-3xl lg:text-4xl", vi: "text-2xl sm:text-3xl", free: "text-xl" },
  { label: "2XL", boxes: "text-3xl sm:text-4xl lg:text-5xl", vi: "text-3xl sm:text-4xl", free: "text-2xl" },
  { label: "3XL", boxes: "text-4xl sm:text-5xl lg:text-6xl", vi: "text-4xl sm:text-5xl", free: "text-3xl" },
];
// Outlined hero button — one class for Back and the text-size trigger so they read as a pair.
const BTN_GHOST =
  "inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:border-white/25 dark:hover:bg-white/10";

// How long the right/wrong badge holds before the drill moves on.
const VERDICT_HOLD_MS = 2500;
const AUTO_NEXT_DELAY_MS = 1900;

const SIZE_KEY = "g-translate:textStep";
const readStep = () => {
  const n = Number(localStorage.getItem(SIZE_KEY));
  return Number.isInteger(n) && n >= 0 && n < TEXT_STEPS.length ? n : 1;
};

/** Assemble what the learner typed into the sentence the server will grade. */
function assemble(slots: TranslateSlot[], boxes: string[]): string {
  return slots
    .map((s, i) => `${s.lead}${(boxes[i] ?? "").trim()}${s.trail}`)
    .join(" ")
    .trim();
}

/** The answer split to line up with the boxes, so each box knows the word it is waiting for. */
function answerWords(slots: TranslateSlot[], en: string): string[] {
  const words = en.trim().split(/\s+/).filter(Boolean);
  if (words.length !== slots.length) return [];
  return slots.map((s, i) => {
    let w = words[i];
    if (s.lead && w.startsWith(s.lead)) w = w.slice(s.lead.length);
    if (s.trail && w.endsWith(s.trail)) w = w.slice(0, -s.trail.length);
    return w;
  });
}

/** Break a saved sentence back into boxes, so a resumed draft reopens where it was left. */
function explode(slots: TranslateSlot[], sentence: string): string[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return slots.map(() => "");
  // A different word count means the draft was written free-hand (hardest rung); do not force it
  // into boxes that would silently drop words.
  if (words.length !== slots.length) return slots.map(() => "");
  return slots.map((s, i) => {
    let w = words[i];
    if (s.lead && w.startsWith(s.lead)) w = w.slice(s.lead.length);
    if (s.trail && w.endsWith(s.trail)) w = w.slice(0, -s.trail.length);
    return w;
  });
}

export function GrammarTranslateDrill({
  items,
  learnerName = t("practice.learner.defaultName"),
  initialAnswers = {},
  initialLevel = "easy",
  title = t("practice.translate.defaultTitle"),
  resultPath = (id) => `/u/grammar/report/${id}`,
  backTo,
  fetchAnswer,
  onAnswersChange,
  onSubmit,
}: {
  items: GrammarTranslateItem[];
  learnerName?: string;
  initialAnswers?: Record<string, string>;
  initialLevel?: TranslateLevel;
  /** Hero title. An exercise passes its own; the self-study drill keeps the default. */
  title?: string;
  /** Where to land after submitting. Default is the self-study session report. */
  resultPath?: (id: string) => string;
  backTo: string;
  /** Fetches the English sentence for ONE item — called for the sentence the learner has opened. */
  fetchAnswer?: (itemId: string) => Promise<string>;
  onAnswersChange?: (answers: Record<string, string>) => void;
  /**
   * Returns the stored record's id; the drill then navigates to `resultPath(id)`. A caller with
   * nothing to navigate to (the teacher preview grades without saving) returns `notice` instead,
   * which is shown in place of the redirect.
   */
  onSubmit: (
    answers: { item_id: string; answer: string }[],
  ) => Promise<{ id?: string | null; notice?: string }>;
}) {
  const nav = useNavigate();
  const total = items.length;

  const [level, setLevel] = useState<TranslateLevel>(initialLevel);
  const [idx, setIdx] = useState(0);
  // Per item: one string per box. The free-text rung keeps its own single string.
  const [boxes, setBoxes] = useState<Record<string, string[]>>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const [correct, setCorrect] = useState<Record<string, boolean>>({});
  const [wordOk, setWordOk] = useState<Record<string, boolean[]>>({});
  // Answers arrive one sentence at a time, only for sentences the learner has opened.
  const [answerEn, setAnswerEn] = useState<Record<string, string>>({});
  // 0 = nothing · 1 = first letter · 2 = + last letter · 3 = + second letter.
  const [hint, setHint] = useState(0);
  // `hardest` only: sentences already checked. Checking is final there — the answer locks and the
  // drill moves on whether it was right or wrong, so the learner commits instead of nudging letters.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  // Verdict banner shown over the boxes for a beat after Check, so the result is not missed.
  const [flash, setFlash] = useState<Verdict | null>(null);
  // Item id that was just solved by typing — the only case that may auto-advance.
  const [autoNext, setAutoNext] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Remembered per device: a learner who needs bigger type needs it every session.
  const [step, setStep] = useState(readStep);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const freeRef = useRef<HTMLTextAreaElement>(null);
  // A completed sentence should announce each result once. Without this guard, correcting one
  // letter in an already-full sentence would play the same buzzer on every keystroke.
  const announcedRight = useRef<Set<string>>(new Set());
  const announcedWrong = useRef<Set<string>>(new Set());
  // Items already requested, so a re-render cannot fire a second request for the same sentence.
  const asked = useRef<Set<string>>(new Set());

  const item = items[idx];
  const scaffold = useMemo(() => translateScaffold(level, item?.word_bank ?? null), [level, item]);
  // Stored bank order follows the answer, so show it shuffled — stable per item, see shuffleBank.
  const shuffledBank = useMemo(
    () => (scaffold.bank?.length ? shuffleBank(scaffold.bank, item?.id ?? "") : []),
    [scaffold.bank, item?.id],
  );
  const slots = useMemo(() => translateSlots(item?.skeleton ?? null), [item]);
  // Every rung types into the same boxes; the free-text field is only a fallback for an item that
  // somehow arrived without a skeleton.
  const boxed = slots.length > 0;
  // `easy` prints the initials for free; every other rung waits for the Hint button.
  const hintLevel = Math.max(hint, scaffold.initials ? 1 : 0);
  // On `hardest` nothing is marked until Check, so the answer stays hidden from the boxes too.
  const shown = scaffold.liveCheck || !!checked[item?.id ?? ""];
  // Empty until this sentence's answer has arrived — the boxes fall back to word-level marking.
  const keyWords = useMemo(
    () => (answerEn[item?.id ?? ""] ? answerWords(slots, answerEn[item.id]) : []),
    [answerEn, item, slots],
  );

  // A verdict the learner is allowed to see. On `hardest` that means they pressed Check — a draft
  // reopened at that rung must not light up green before they ask.
  const solved = (it: GrammarTranslateItem) => (scaffold.liveCheck || !!checked[it.id]) && !!correct[it.id];
  const doneCount = useMemo(
    () => items.filter((it) => (scaffold.liveCheck || checked[it.id]) && correct[it.id]).length,
    [items, correct, checked, scaffold.liveCheck],
  );
  const doneCurrent = !!item && solved(item);
  const isLast = idx === total - 1;

  /** Local hash comparison: the client holds hashes of the valid answers, never the sentences. */
  const check = useCallback(async (it: GrammarTranslateItem, value: string): Promise<boolean> => {
    if (!value.trim()) return false;
    const keys = [translateAnswerKey(value), translateAnswerKeyLoose(value)];
    if (it.article_lenient) keys.push(translateAnswerKeyNoArticles(value));
    keys.push(it.article_lenient ? translateAnswerKeyExpandedNoArticles(value) : translateAnswerKeyExpanded(value));
    for (const k of keys) if (k && it.hashes.includes(await sha256Hex(k))) return true;
    return false;
  }, []);

  /** The sentence for an item, whichever way it was typed. */
  const sentenceOf = useCallback(
    (it: GrammarTranslateItem): string => {
      const b = boxes[it.id];
      if (b?.some((v) => v.trim())) return assemble(translateSlots(it.skeleton), b);
      return free[it.id] ?? "";
    },
    [boxes, free],
  );

  // Answers restored from a draft must be marked straight away, not only once the learner types.
  useEffect(() => {
    (async () => {
      const nextBoxes: Record<string, string[]> = {};
      const nextFree: Record<string, string> = {};
      const nextCorrect: Record<string, boolean> = {};
      const nextWords: Record<string, boolean[]> = {};
      for (const it of items) {
        const saved = initialAnswers[it.id] ?? "";
        if (!saved.trim()) continue;
        const s = translateSlots(it.skeleton);
        const ex = explode(s, saved);
        if (ex.some((v) => v)) nextBoxes[it.id] = ex;
        nextFree[it.id] = saved;
        nextCorrect[it.id] = await check(it, saved);
        nextWords[it.id] = await Promise.all(
          ex.map(async (v, i) => {
            if (!v.trim()) return false;
            if ((await sha256Hex(translateAnswerKey(v))) === it.word_hashes[i]) return true;
            return (await sha256Hex(translateAnswerKeyLoose(v))) === it.word_hashes_loose[i];
          }),
        );
      }
      setBoxes(nextBoxes);
      setFree(nextFree);
      setCorrect(nextCorrect);
      setWordOk(nextWords);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    setHint(0);
    setError("");
    setAutoNext(null);
    const t = setTimeout(() => (boxed ? cellRefs.current[0] : freeRef.current)?.focus(), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Pull THIS sentence's answer, and only this one. A failure is not worth surfacing: the boxes
  // keep marking whole words from the hashes, they just stop colouring individual letters.
  useEffect(() => {
    if (!fetchAnswer || !item || asked.current.has(item.id)) return;
    asked.current.add(item.id);
    let alive = true;
    fetchAnswer(item.id)
      .then((en) => { if (alive && en) setAnswerEn((p) => ({ ...p, [item.id]: en })); })
      .catch(() => { asked.current.delete(item.id); });
    return () => { alive = false; };
  }, [fetchAnswer, item]);

  // Solved -> drift to the next sentence as dictation does; the last one waits for a deliberate
  // submit. Only on the rungs that mark as you type: `hardest` advances from Check, on its own
  // timer, and running both would skip a sentence.
  useEffect(() => {
    if (scaffold.liveCheck && doneCurrent && autoNext === item?.id && idx < total - 1) {
      const t = setTimeout(() => setIdx((i) => (i === idx ? i + 1 : i)), AUTO_NEXT_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [scaffold.liveCheck, doneCurrent, autoNext, item, idx, total]);

  // Debounced autosave: one PATCH per keystroke would cost a request for nothing.
  useEffect(() => {
    if (!onAnswersChange) return;
    const t = setTimeout(() => {
      const out: Record<string, string> = {};
      for (const it of items) {
        const s = sentenceOf(it);
        if (s.trim()) out[it.id] = s;
      }
      onAnswersChange(out);
    }, 800);
    return () => clearTimeout(t);
  }, [boxes, free, items, onAnswersChange, sentenceOf]);

  /** Re-mark the current item after a keystroke, both as a whole and box by box. */
  async function mark(sentence: string, cells: string[] | null): Promise<boolean> {
    const ok = await check(item, sentence);
    setCorrect((p) => ({ ...p, [item.id]: ok }));
    if (cells) {
      const flags = await Promise.all(
        cells.map(async (v, i) => {
          if (!v.trim()) return false;
          if ((await sha256Hex(translateAnswerKey(v))) === item.word_hashes[i]) return true;
          // "doesnt" for "doesn't": the box frame inserts the apostrophe, so the learner need not type it.
          return (await sha256Hex(translateAnswerKeyLoose(v))) === item.word_hashes_loose[i];
        }),
      );
      setWordOk((p) => ({ ...p, [item.id]: flags }));
    }
    return ok;
  }

  /** Move the caret into another box; `end` so Backspace keeps eating backwards naturally. */
  function focusCell(i: number, caret: "start" | "end" = "end") {
    const el = cellRefs.current[i];
    if (!el) return;
    el.focus();
    const at = caret === "end" ? el.value.length : 0;
    requestAnimationFrame(() => el.setSelectionRange(at, at));
  }

  /** Move only after a correct word. This runs independently of the async sentence grader so an
   * IME can hand off focus before the next Telex key changes the previous letter. */
  function advanceIfWordCorrect(i: number, value: string) {
    const input = cellRefs.current[i];
    const move = () => {
      if (input?.value === value && document.activeElement === input && i < slots.length - 1) {
        focusCell(i + 1, "start");
      }
    };
    const expected = keyWords[i];
    if (expected) {
      const correct =
        translateAnswerKey(value) === translateAnswerKey(expected) ||
        translateAnswerKeyLoose(value) === translateAnswerKeyLoose(expected);
      if (correct) move();
      return;
    }
    // The answer request may be slow or unavailable. Hashes retain the same behaviour without
    // exposing the word, although this fallback cannot be as immediate as the local comparison.
    void (async () => {
      const exact = (await sha256Hex(translateAnswerKey(value))) === item.word_hashes[i];
      const loose = (await sha256Hex(translateAnswerKeyLoose(value))) === item.word_hashes_loose[i];
      if (exact || loose) move();
    })();
  }

  function onCell(i: number, value: string, mayAdvance = true) {
    const cells = slots.map((_, k) => (k === i ? value : boxes[item.id]?.[k] ?? ""));
    setBoxes((p) => ({ ...p, [item.id]: cells }));
    const sentence = assemble(slots, cells);
    setFree((p) => ({ ...p, [item.id]: sentence }));
    const complete = cells.every((word, wordIndex) => {
      const expected = keyWords[wordIndex] || slots[wordIndex]?.body;
      if (!expected) return false;
      const fitted = fitApostrophes(expected, word);
      return !fitted.over && fitted.text.replace(/'/g, "").length === expected.replace(/'/g, "").length;
    });
    if (scaffold.liveCheck) {
      void mark(sentence, cells).then((ok) => {
        if (complete) {
          if (ok && !announcedRight.current.has(item.id)) {
            announcedRight.current.add(item.id);
            playChime("right");
          } else if (!ok && !announcedWrong.current.has(item.id)) {
            announcedWrong.current.add(item.id);
            playChime("wrong");
          }
        }
        if (ok) setAutoNext(item.id);
      });
    }
    if (mayAdvance) advanceIfWordCorrect(i, value);
  }

  async function onFree(value: string) {
    setFree((p) => ({ ...p, [item.id]: value }));
    setBoxes((p) => ({ ...p, [item.id]: [] }));
    const ok = scaffold.liveCheck && (await mark(value, null));
    if (ok && !announcedRight.current.has(item.id)) {
      announcedRight.current.add(item.id);
      playChime("right");
    }
    if (ok) setAutoNext(item.id);
  }

  /**
   * `hardest`: grade this one sentence, then commit to it. The verdict holds for a beat so it can
   * actually be read, then the drill moves on — right or wrong — and the sentence stays locked.
   */
  async function checkOne() {
    if (checked[item.id] || !sentenceOf(item).trim()) return;
    const ok = await mark(sentenceOf(item), boxes[item.id] ?? null);
    setChecked((p) => ({ ...p, [item.id]: true }));
    setFlash(ok ? "right" : "wrong");
    playChime(ok ? "right" : "wrong");
    window.setTimeout(() => {
      setFlash(null);
      if (idx < total - 1) setIdx((i) => (i === idx ? i + 1 : i));
      else setConfirmOpen(true);
    }, VERDICT_HOLD_MS);
  }

  /** Blank sentences count as wrong, so say so out loud before it is too late to fix them. */
  const blanks = items.filter((it) => !sentenceOf(it).trim());

  async function submit() {
    // Everything the session drew, blanks included: the server counts a skipped sentence as wrong,
    // and it would be dishonest to show a score that quietly dropped them.
    const payload = items.map((it) => ({ item_id: it.id, answer: sentenceOf(it).trim() }));
    if (!payload.some((a) => a.answer)) { setError(t("practice.translate.emptyError")); return; }
    setConfirmOpen(false);
    setSubmitting(true);
    setError("");
    try {
      const r = await onSubmit(payload);
      // Nothing to navigate to (preview): say the result here instead of redirecting nowhere.
      if (r.notice) { setError(r.notice); setSubmitting(false); return; }
      // The stored report is the one permanent view of a session — go there rather than render a
      // second, near-identical summary that vanishes on reload.
      if (!r.id) throw new Error(t("practice.translate.reportError"));
      nav(resultPath(r.id), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("practice.translate.submitError"));
      setSubmitting(false);
    }
  }

  const cells = boxes[item.id] ?? [];
  const flags = wordOk[item.id] ?? [];
  const written = !!sentenceOf(item).trim();
  // Checked on `hardest` means committed: the boxes stop accepting edits.
  const locked = !scaffold.liveCheck && !!checked[item.id];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PracticeHero
        title={title}
        studentName={learnerName}
        skill="grammar"
        total={total}
        icon={<Languages className="size-7 sm:size-8" />}
        meta={
          <>
            <span className="text-slate-300 dark:text-white/30">•</span>
            <Popover
              side="down"
              align="left"
              ariaLabel="Difficulty"
              triggerClassName="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm transition hover:bg-slate-900/5 dark:hover:bg-white/10"
              panelClassName="w-56 p-1"
              trigger={
                <>
                  <Gauge className="size-3.5 text-slate-400 dark:text-slate-500" />
                  <span className={cn("font-semibold", LEVELS[level].tone)}>{LEVELS[level].label}</span>
                  <ChevronDown className="size-3.5 text-slate-400" />
                </>
              }
            >
              {(close) => (
                <div className="space-y-0.5">
                  {TRANSLATE_LEVELS.map((lv) => (
                    <PopoverItem key={lv} active={lv === level} onClick={() => { close(); setLevel(lv); }}>
                      <span className="flex-1">
                        <span className={cn("font-semibold", LEVELS[lv].tone)}>{LEVELS[lv].label}</span>
                        <span className="ml-1.5 text-xs text-slate-400">{t(LEVELS[lv].hint)}</span>
                      </span>
                      {lv === level && <Check className="size-3.5" />}
                    </PopoverItem>
                  ))}
                </div>
              )}
            </Popover>
          </>
        }
        actions={
          <>
            <button onClick={() => nav(backTo)} className={cn(BTN_GHOST, "max-sm:flex-1 max-sm:justify-center")}>
              <ArrowLeft className="size-4" /> Back
            </button>
            <ThemeToggle className={cn(BTN_GHOST, "size-10 shrink-0 justify-center px-0")} />
            {/* The trigger sits inside Popover's own tooltip span, so the span has to stretch too
                before the button can fill the row. */}
            <div className="max-sm:flex-1 max-sm:[&>span]:w-full">
            <Popover
              side="down"
              align="right"
              ariaLabel={t("practice.translate.fontSize")}
              triggerClassName={cn(BTN_GHOST, "max-sm:w-full max-sm:justify-center")}
              panelClassName="w-40 p-1"
              trigger={
                <>
                  <ALargeSmall className="size-4 shrink-0" />
                  <span>{t("practice.translate.fontSize")}</span>
                  <span className="font-bold tabular-nums text-cyan-600 dark:text-cyan-400">{TEXT_STEPS[step].label}</span>
                </>
              }
            >
              {(close) => (
                <div className="space-y-0.5">
                  {TEXT_STEPS.map((s, i) => (
                    <PopoverItem
                      key={s.label}
                      active={i === step}
                      onClick={() => { close(); setStep(i); localStorage.setItem(SIZE_KEY, String(i)); }}
                    >
                      <span className="flex-1 font-semibold">{s.label}</span>
                      {i === step && <Check className="size-3.5" />}
                    </PopoverItem>
                  ))}
                </div>
              )}
            </Popover>
            </div>
          </>
        }
      />

      <div className="px-3 sm:px-0">
        {/* Prompt card: the Vietnamese sentence, centred over the answer boxes below it. */}
        <div className="mb-4 rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50 to-white p-4 text-center shadow-sm dark:border-cyan-500/20 dark:from-cyan-500/10 dark:to-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t("practice.translate.sentenceNum", { n: idx + 1 })}
            {item.grammar_title ? ` · ${item.grammar_title}` : ""}
          </div>
          <div className={cn("mt-1 font-bold leading-snug text-slate-800 dark:text-white", TEXT_STEPS[step].vi)}>
            {item.vi}
          </div>
        </div>

        {/* Answer + control bar, one card — the shape the video drill uses. */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {scaffold.bank?.length ? (
            <div className="border-b border-slate-100 px-4 py-3 text-center dark:border-slate-800 sm:px-6">
              <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
                {t("practice.translate.wordBankPrompt")}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {shuffledBank.map((w, i) => (
                  <span
                    key={`${w}-${i}`}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* A single long word at the biggest steps can be wider than a phone: let it scroll here
              rather than stretch the card. */}
          <div className="relative overflow-x-auto bg-white px-4 py-7 dark:bg-slate-900 sm:px-6 sm:py-8">
            {flash && <VerdictBurst kind={flash} />}
            {boxed ? (
              <div className={cn("flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-3 leading-relaxed text-slate-700 dark:text-slate-100", TEXT_STEPS[step].boxes)}>
                {slots.map((s, i) => (
                  <WordBox
                    key={i}
                    slot={s}
                    val={cells[i] ?? ""}
                    ok={shown && !!flags[i]}
                    key_={shown ? keyWords[i] ?? "" : ""}
                    hintLevel={hintLevel}
                    locked={locked}
                    refCb={(el) => { cellRefs.current[i] = el; }}
                    onChange={(v, mayAdvance) => onCell(i, v, mayAdvance)}
                    onPrev={() => i > 0 && focusCell(i - 1, "end")}
                    onNext={() => i < slots.length - 1 && focusCell(i + 1, "start")}
                    // On `hardest` Enter commits the sentence; elsewhere it just walks to the next box.
                    onEnter={scaffold.liveCheck ? undefined : checkOne}
                  />
                ))}
              </div>
            ) : (
              <textarea
                ref={freeRef}
                value={free[item.id] ?? ""}
                onChange={(e) => onFree(e.target.value)}
                rows={2}
                placeholder={t("practice.translate.freePlaceholder")}
                spellCheck={false}
                lang="en"
                className={cn(
                  "w-full resize-none rounded-xl border-2 bg-white px-3 py-2.5 outline-none transition dark:bg-slate-800 dark:text-slate-100",
                  TEXT_STEPS[step].free,
                  doneCurrent
                    ? "border-emerald-500 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-slate-200 focus:border-cyan-500 dark:border-slate-700",
                )}
              />
            )}

            {doneCurrent ? (
              <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" /> {t("practice.translate.correctPrefix")}{isLast ? t("practice.translate.submitWhenReady") : t("practice.translate.nextSentenceEllipsis")}
              </p>
            ) : locked ? (
              <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-rose-600 dark:text-rose-400">
                <X className="size-4" /> {t("practice.translate.lockedWrong")}
              </p>
            ) : null}
            {error && <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          </div>

          {/* Control bar: tools left, navigation right, scrubber taking its own row on small screens. */}
          <div className="border-t border-slate-100 px-2 py-2.5 dark:border-slate-800 sm:px-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
              <div className="order-1 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setHint((h) => Math.min(3, Math.max(h, hintLevel) + 1))}
                  // Levels past the first need the answer's own letters, so they wait for it.
                  disabled={!boxed || hintLevel >= 3 || (hintLevel >= 1 && !keyWords.length)}
                  title={t("practice.translate.hintTooltip")}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold text-amber-600 transition hover:bg-amber-50 disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-500/10"
                >
                  <Lightbulb className="size-4" /> {t("practice.translate.hint")}
                  {hintLevel > 0 && <span className="text-xs opacity-70">{hintLevel}/3</span>}
                </button>
              </div>

              <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 lg:order-3 lg:ml-0">
                <button
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ArrowLeft className="size-4" /> <span className="hidden sm:inline">{t("practice.translate.prev")}</span>
                </button>
                {/* `hardest` replaces the next-sentence button entirely: Check is the only way
                    forward and it advances by itself. The other rungs mark as you type, so plain
                    navigation is right there. */}
                {!scaffold.liveCheck && !locked ? (
                  <button
                    onClick={checkOne}
                    disabled={!written}
                    title={t("practice.translate.checkEnterTitle")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ClipboardCheck className="size-4" /> {t("practice.translate.check")}
                  </button>
                ) : isLast ? (
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={submitting}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cyan-500 px-4 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("practice.translate.submit")}
                  </button>
                ) : (
                  <button
                    onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    {t("practice.translate.next")} <ArrowRight className="size-4" />
                  </button>
                )}
              </div>

              <div className="order-3 flex w-full items-center gap-2.5 lg:order-2 lg:w-auto lg:min-w-40 lg:flex-1">
                <div className="flex h-2 w-full flex-1 items-stretch gap-px overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  {items.map((it, i) => (
                    <button
                      key={it.id}
                      onClick={() => setIdx(i)}
                      title={t("practice.translate.sentenceNum", { n: i + 1 })}
                      className={cn(
                        "flex-1 transition-colors",
                        solved(it)
                          ? "bg-emerald-500"
                          : i === idx
                            ? "bg-cyan-500"
                            : "bg-slate-200 dark:bg-slate-600",
                      )}
                    />
                  ))}
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                  {doneCount}/{total}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PracticeFooter />

      {confirmOpen && (
        <SubmitConfirm
          blanks={blanks.length}
          total={total}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={submit}
        />
      )}
    </div>
  );
}

/**
 * One word box: a transparent input over a character grid. Each typed character is green when it
 * matches the answer and rose when it does not; untyped positions are a `*` placeholder, or a hint
 * letter once the learner has asked for one.
 *
 * `key_` is the word this box expects, fetched for the open sentence only. Without it the box falls
 * back to marking the whole word from its hash — correct, just not letter by letter.
 */
function WordBox({
  slot,
  val,
  ok,
  key_,
  hintLevel,
  locked,
  refCb,
  onChange,
  onPrev,
  onNext,
  onEnter,
}: {
  slot: TranslateSlot;
  val: string;
  ok: boolean;
  key_: string;
  hintLevel: number;
  /** The sentence has been committed — read-only, but still reachable so it can be re-read. */
  locked?: boolean;
  refCb: (el: HTMLInputElement | null) => void;
  onChange: (v: string, mayAdvance?: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Overrides Enter, which otherwise just steps to the next box. */
  onEnter?: () => void;
}) {
  const composing = useRef(false);
  // The apostrophe is already printed in the skeleton, so it never consumes a `*` or a typed
  // character. `key_` improves letter-level feedback once the answer has arrived.
  const frame = key_ || slot.body;
  const { text: typed, over } = fitApostrophes(frame, val);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const cells = Array.from({ length: slot.len }, (_, i) => {
    if (slot.body[i] === "'") {
      return (
        <span key={i} className="text-slate-400 dark:text-slate-500">
          '
        </span>
      );
    }
    if (i < typed.length) {
      const good = key_ ? same(typed[i], key_[i] ?? "") : ok;
      return (
        <span key={i} className={good ? "text-emerald-500" : key_ ? "text-rose-500" : "text-slate-700 dark:text-slate-100"}>
          {typed[i]}
        </span>
      );
    }
    // Level 1 is the initial, which the skeleton already carries; 2 and 3 need the answer itself.
    // Capped per word so the hint can never spell the whole thing out — see maxHintLevel.
    const lvl = Math.min(hintLevel, maxHintLevel(slot.len));
    const lit =
      (lvl >= 1 && i === 0 && (slot.initial || key_[0])) ||
      (lvl >= 2 && key_ && i === slot.len - 1 && key_[i]) ||
      (lvl >= 3 && key_ && i === 1 && key_[i]) ||
      "";
    return (
      <span key={i} className={lit ? "text-amber-400/80" : "text-slate-300 dark:text-slate-600"}>
        {lit || "*"}
      </span>
    );
  });

  return (
    <span className="mx-0.5 inline-block whitespace-nowrap">
      {slot.lead && <span className="font-medium">{slot.lead}</span>}
      <span className="relative inline-block">
        <input
          ref={refCb}
          value={val}
          readOnly={locked}
          maxLength={slot.len}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(e) => {
            composing.current = false;
            onChange(e.currentTarget.value, true);
          }}
          onChange={(e) => onChange(e.target.value, !composing.current)}
          // Walking between boxes with the keyboard. Without this, a wrong letter in the box you
          // just left could only be reached with the mouse.
          onKeyDown={(e) => {
            const ime = e.nativeEvent.isComposing || e.keyCode === 229;
            if (ime) return;
            if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); return; }
            const el = e.currentTarget;
            const caret = el.selectionStart ?? 0;
            const collapsed = el.selectionStart === el.selectionEnd;
            if (e.key === "Backspace" && !val) { e.preventDefault(); onPrev(); return; }
            if (e.key === "ArrowLeft" && collapsed && caret === 0) { e.preventDefault(); onPrev(); return; }
            if (e.key === "ArrowRight" && collapsed && caret === val.length) { e.preventDefault(); onNext(); return; }
            // Space is how you move between words when writing a sentence, so honour that here.
            // Tab is left alone: the boxes are in DOM order, so the native order is already right.
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onNext();
            }
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          lang="en"
          style={{ width: `${slot.len + 0.4}ch` }}
          className="block bg-transparent text-left font-mono text-transparent caret-cyan-500 outline-none"
        />
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center font-mono tracking-normal">
          {cells}
          {over && <span className="text-rose-500 line-through decoration-rose-400">{over}</span>}
        </span>
        <span
          className={cn(
            "pointer-events-none absolute inset-x-0 -bottom-0.5 h-[1.5px] rounded-full transition",
            ok ? "bg-emerald-500" : "bg-gradient-to-r from-cyan-500 to-cyan-300",
          )}
        />
      </span>
      {slot.trail && <span className="font-medium">{slot.trail}</span>}
    </span>
  );
}

/** Last-sentence guard: a blank sentence is graded wrong, so it must not be a surprise. */
function SubmitConfirm({
  blanks,
  total,
  submitting,
  onCancel,
  onConfirm,
}: {
  blanks: number;
  total: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    // Centred at every width: as a bottom sheet on mobile the on-screen keyboard shoved it off the
    // bottom of the screen and clipped the buttons.
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1",
              blanks > 0
                ? "bg-amber-500/15 text-amber-600 ring-amber-500/20 dark:text-amber-400"
                : "bg-cyan-500/15 text-cyan-600 ring-cyan-500/20 dark:text-cyan-400",
            )}
          >
            {blanks > 0 ? <AlertTriangle className="size-5" /> : <Send className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">{t("practice.translate.confirmTitle")}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("practice.translate.confirmSessionSummary", { total })}</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          {blanks > 0 ? (
            <>
              {t("practice.translate.blanksWarning", { count: t("practice.translate.blanksCount", { n: blanks }) })}
            </>
          ) : (
            <>{t("practice.translate.allDoneMessage", { n: total })}</>
          )}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {blanks > 0 ? t("practice.translate.continueAction") : t("practice.translate.back")}
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 text-sm font-bold text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("practice.translate.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lay what the learner typed onto the answer's frame, supplying the apostrophes. Typing "doesnt"
 * against "doesn't" yields "doesn't"; anything past the end comes back as `over` and is struck out.
 */
function fitApostrophes(key: string, raw: string): { text: string; over: string } {
  // iOS normally enters U+2019 (right single quotation mark), while some keyboards use U+2018,
  // U+2032, a backtick, or a straight apostrophe. They are all decoration here, never a letter.
  const typed = raw.replace(/[‘’′'`]/g, "").split("");
  let out = "";
  let i = 0;
  for (const ch of key) {
    if (ch === "'") {
      // Only fill the apostrophe once there is a character after it to justify showing it.
      if (i < typed.length) out += "'";
      else break;
    } else if (i < typed.length) {
      out += typed[i++];
    } else break;
  }
  return { text: out, over: typed.slice(i).join("") };
}
