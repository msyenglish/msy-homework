// ============================================================
//  Back closes the panel, not the page.
//
//  Drawers and modals live in `useState`, so they are invisible to history: with three panels open,
//  one Back threw the learner out of the page entirely. This gives an open overlay a history entry
//  of its own (same URL, a marker in location.state), so Back closes it one layer at a time — which
//  is what the hardware Back button means on a phone.
//
//  Wired into the shared <Drawer> components, so every drawer in the app inherits it.
// ============================================================
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * The marks of every overlay open at this history entry, outermost first. A stack, not a single
 * mark: with a nested drawer the inner push must not read as "the outer one was dismissed".
 */
type OverlayState = { overlays?: string[] } | null;

let seq = 0;

export function useOverlayHistory(open: boolean, onClose: () => void) {
  const nav = useNavigate();
  const loc = useLocation();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  /** The marker of the entry this overlay pushed — empty while it owns none. */
  const mark = useRef("");
  /** Set once the pushed entry is actually the current one; only then can Back mean "close". */
  const armed = useRef(false);

  // Opening pushes a marker entry at the same URL, stacked on top of the overlays already open.
  useEffect(() => {
    if (!open || mark.current) return;
    mark.current = `ov${++seq}-${Date.now().toString(36)}`;
    armed.current = false;
    const below = (loc.state as OverlayState)?.overlays ?? [];
    nav(loc.pathname + loc.search + loc.hash, {
      state: { ...(loc.state as object | null), overlays: [...below, mark.current] },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Back / Forward moved off our entry → the learner asked for this panel to go away.
  // A nested overlay opening keeps our mark in the stack, so only OUR removal means "close".
  useEffect(() => {
    if (!open || !mark.current) return;
    const chain = (loc.state as OverlayState)?.overlays ?? [];
    if (chain.includes(mark.current)) { armed.current = true; return; }
    if (!armed.current) return; // our push has not landed yet
    armed.current = false;
    mark.current = "";
    closeRef.current();
  }, [loc, open]);

  // Closed from the UI (Esc, the X, an action) → drop our entry, or Back would need two presses.
  //
  // The ownership check reads window.history, NOT the `loc` of this render. React Router routes its
  // own updates through startTransition, so a handler that closes the panel AND navigates commits
  // the close first, while `loc` still points at the overlay entry — popping there would cancel the
  // navigation the learner just asked for — which is what broke the start button of the drills.
  // `history.pushState` has already run by now, so the browser entry is the truthful one.
  useEffect(() => {
    if (open || !mark.current) return;
    // Pop only when OUR entry is the current one — an overlay closing underneath an open
    // nested one must leave the deeper entry alone.
    const live = (window.history.state as { usr?: OverlayState } | null)?.usr;
    const owned = live?.overlays?.[live.overlays.length - 1] === mark.current;
    mark.current = "";
    armed.current = false;
    if (owned) nav(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
