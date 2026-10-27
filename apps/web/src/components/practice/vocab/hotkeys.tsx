// ============================================================
//  KEYBOARD LAYER for the vocabulary deck — one registry, one set of rules.
//
//  Each activity used to invent its own keys (or none), so a learner drilling 60 cards had to reach
//  for the mouse on half of them. Rules that keep the bindings predictable:
//   • PLAIN keys (1-4, r, f, space…) belong to cards with NO text field. They are ignored while the
//     focus sits in an input, so a typing card never eats a letter.
//   • Ctrl/⌘ combos belong to cards WITH a text field (hint, reveal) and to deck-wide navigation —
//     they keep working while typing.
//  The registry below is also what the on-screen hint bar renders, so the two can never drift.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";
import type { VocabActivity } from "@msyen/shared";
import { Tooltip } from "../../Tooltip";
import { cn } from "../../../lib/utils";
import { t, type TKey } from "../../../i18n";

/** One binding: the keys to press, and what it does (shown to the learner). */
export type Hotkey = { keys: string[]; desc: TKey };

/** Available on every card (see useDeckHotkeys in shell.tsx). */
export const DECK_KEYS: Hotkey[] = [
  { keys: ["Ctrl", "←"], desc: "practice2.hotkeys.previous" },
  { keys: ["Ctrl", "→"], desc: "practice2.hotkeys.next" },
  { keys: ["Ctrl", "Space"], desc: "practice2.hotkeys.replay" },
];

const CHOICE: Hotkey[] = [{ keys: ["1", "-", "4"], desc: "practice2.hotkeys.choose" }];
const TYPE_IN: Hotkey[] = [
  { keys: ["Enter"], desc: "practice2.hotkeys.check" },
  { keys: ["Ctrl", "H"], desc: "practice2.hotkeys.firstLetter" },
];

export const ACTIVITY_KEYS: Partial<Record<VocabActivity, Hotkey[]>> = {
  flashcard: [
    { keys: ["Space"], desc: "practice2.hotkeys.flip" },
    { keys: ["1"], desc: "practice2.hotkeys.notRemembered" },
    { keys: ["2"], desc: "practice2.hotkeys.remembered" },
  ],
  recall: [...TYPE_IN, { keys: ["Ctrl", "Y"], desc: "practice2.hotkeys.showAnswer" }],
  dictation: TYPE_IN,
  spelling: [
    { keys: ["A", "-", "Z"], desc: "practice2.hotkeys.chooseLetter" },
    { keys: ["Backspace"], desc: "practice2.hotkeys.removeLast" },
    { keys: ["Enter"], desc: "practice2.hotkeys.check" },
    { keys: ["Esc"], desc: "practice2.hotkeys.clear" },
  ],
  listen_choice: CHOICE,
  paraphrase: CHOICE,
  matching: [{ keys: ["Enter"], desc: "practice2.hotkeys.check" }],
  pronounce: [
    { keys: ["R"], desc: "practice2.hotkeys.record" },
    { keys: ["P"], desc: "practice2.hotkeys.replayRecording" },
    { keys: ["Enter"], desc: "practice2.hotkeys.continue" },
  ],
};

/** True when the key event came from somewhere the learner is typing. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

type KeyMap = Record<string, () => void>;

/** Normalised key name used by both maps below: lower-case, with " " written as "space". */
const keyOf = (e: KeyboardEvent) => (e.key === " " ? "space" : e.key.toLowerCase());

/**
 * PLAIN-key bindings for the current card. Skipped while typing and whenever a modifier is held,
 * so they never fight the deck's Ctrl shortcuts or a text field.
 */
export function useCardKeys(map: KeyMap, active = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const fn = ref.current[keyOf(e)];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active]);
}

/** Ctrl/⌘ bindings — for cards whose focus lives in a text field. */
export function useModKeys(map: KeyMap, active = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const fn = ref.current[keyOf(e)];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active]);
}

/** A single key cap. */
export function KeyCap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-[1.35rem] items-center justify-center rounded border border-slate-300 bg-white px-1 py-px font-sans text-[10px] font-bold leading-4 text-slate-600 shadow-[0_1px_0_rgb(0_0_0/0.08)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Key caps of one binding: "Ctrl + ←" or a range "1 – 4". */
export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((k, i) =>
        k === "-" ? (
          <span key={i} className="text-slate-400">–</span>
        ) : (
          <span key={i} className="inline-flex items-center gap-0.5">
            {i > 0 && keys[i - 1] !== "-" && <span className="text-slate-400">+</span>}
            <KeyCap>{k}</KeyCap>
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Icon button in the deck header that opens the key list of the CURRENT activity.
 * A strip under the card competed with the answer for attention on every single card; the keys are
 * reference material, so they live one tap away instead. Hidden where there is no keyboard.
 */
export function HotkeyButton({ activity, className }: { activity?: VocabActivity; className?: string }) {
  const [open, setOpen] = useState(false);
  const list = activity ? ACTIVITY_KEYS[activity] ?? [] : [];

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  return (
    <>
      <Tooltip label={t("practice2.hotkeys.title")} hoverOnly>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("practice2.hotkeys.title")}
          className={cn("hidden sm:inline-flex", className)}
        >
          <Keyboard className="size-4" />
        </button>
      </Tooltip>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                <Keyboard className="size-4 text-cyan-500" /> {t("practice2.hotkeys.title")}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("practice2.setup.close")}
                className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            {list.length > 0 && (
              <>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("practice2.hotkeys.current")}</p>
                <KeyList list={list} />
              </>
            )}
            <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t("practice2.hotkeys.allCards")}</p>
            <KeyList list={DECK_KEYS} />
          </div>
        </div>
      )}
    </>
  );
}

function KeyList({ list }: { list: Hotkey[] }) {
  return (
    <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
      {list.map((h, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm text-slate-600 dark:text-slate-300">{t(h.desc)}</span>
          <KeyCombo keys={h.keys} />
        </li>
      ))}
    </ul>
  );
}
