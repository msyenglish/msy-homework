// Keyboard walk across a row of per-word / per-character boxes (dictation, translation drills).
// Without it a learner who mistyped the box they just left can only get back with the mouse.
import type { KeyboardEvent } from "react";

/** Where the caret lands when focus moves into a box. */
export type BoxCaret = "start" | "end";

/** Move the caret into a box; `end` so Backspace keeps eating backwards naturally. */
export function focusBox(el: HTMLInputElement | null | undefined, caret: BoxCaret = "end") {
  if (!el) return;
  el.focus();
  const at = caret === "end" ? el.value.length : 0;
  requestAnimationFrame(() => el.setSelectionRange(at, at));
}

/**
 * Box-to-box navigation for one input's `onKeyDown`. Backspace on an empty box and an arrow key
 * already at the edge step to the neighbour; Space and Enter step forward. Returns true when the
 * key was consumed, so a caller with its own Enter handling can take over first.
 *
 * Tab is deliberately untouched: the boxes sit in DOM order, so native tabbing is already right,
 * and swallowing it would trap focus on the last box.
 */
export function boxNavKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  nav: { prev: () => void; next: () => void; keys?: { space?: boolean; enter?: boolean } },
): boolean {
  // IME (Telex/Unikey): intercepting keys mid-composition corrupts the buffer.
  if (e.nativeEvent.isComposing || e.keyCode === 229) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.currentTarget;
  const val = el.value;
  const caret = el.selectionStart ?? 0;
  const collapsed = el.selectionStart === el.selectionEnd;
  if (e.key === "Backspace" && !val) { e.preventDefault(); nav.prev(); return true; }
  if (e.key === "ArrowLeft" && collapsed && caret === 0) { e.preventDefault(); nav.prev(); return true; }
  if (e.key === "ArrowRight" && collapsed && caret === val.length) { e.preventDefault(); nav.next(); return true; }
  // Space is how you move between words when writing a sentence, so honour that here.
  const space = nav.keys?.space ?? true;
  const enter = nav.keys?.enter ?? true;
  if ((space && e.key === " ") || (enter && e.key === "Enter")) { e.preventDefault(); nav.next(); return true; }
  return false;
}
