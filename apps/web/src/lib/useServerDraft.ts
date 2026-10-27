// Unfinished attempt kept BOTH in the browser and on the server.
//
//  • localStorage — instant, works offline and for signed-out visitors.
//  • server row    — the synced copy, so a learner who switches phone → laptop continues the same
//                    attempt instead of starting the exercise over.
//
// Hydration prefers whichever copy is NEWER, then the server (a device that was offline must not
// silently roll back work done elsewhere).
import { useCallback, useEffect, useRef, useState } from "react";
import type { PracticeDraftKind } from "@msyen/shared";
import { accountApi } from "./api";

const LS_PREFIX = "practice_draft:";
const SAVE_DEBOUNCE_MS = 1500;

type Local<S> = { state: S; answered: number; total: number; at: string };

const lsKey = (kind: PracticeDraftKind, exerciseId: string) => `${LS_PREFIX}${kind}:${exerciseId}`;

function readLocal<S>(kind: PracticeDraftKind, exerciseId: string): Local<S> | null {
  try {
    const raw = localStorage.getItem(lsKey(kind, exerciseId));
    return raw ? (JSON.parse(raw) as Local<S>) : null;
  } catch {
    return null;
  }
}

function writeLocal<S>(kind: PracticeDraftKind, exerciseId: string, d: Local<S>) {
  try {
    localStorage.setItem(lsKey(kind, exerciseId), JSON.stringify(d));
  } catch {
    /* private mode / quota — the server copy still carries the attempt */
  }
}

export interface ServerDraft<S> {
  /** False until hydration finished — mount the practice UI only after that, or it saves over the draft. */
  ready: boolean;
  /** The restored attempt, or null when there is none. */
  initial: S | null;
  /** Autosave (debounced): call on every answer change. */
  save: (state: S, answered: number, total: number) => void;
  /** Attempt is over (submitted / discarded) → drop both copies. */
  clear: () => void;
}

export function useServerDraft<S>(
  kind: PracticeDraftKind,
  exerciseId: string | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): ServerDraft<S> {
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<S | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ state: S; answered: number; total: number } | null>(null);
  const cleared = useRef(false);

  useEffect(() => {
    if (!exerciseId) return;
    let alive = true;
    cleared.current = false;
    setReady(false);
    setInitial(null);
    const local = readLocal<S>(kind, exerciseId);
    (async () => {
      let remote: { state: S; answered: number; total: number; updatedAt: string } | null = null;
      if (enabled) {
        // Not logged in / offline → the local copy alone still restores the attempt.
        remote = (await accountApi.draftGet<S>(kind, exerciseId).then((r) => r.draft).catch(() => null)) ?? null;
      }
      if (!alive) return;
      const pick = !remote ? local?.state ?? null
        : !local ? remote.state
        : local.at > remote.updatedAt ? local.state
        : remote.state;
      setInitial(pick ?? null);
      setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, exerciseId, enabled]);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p || !exerciseId || cleared.current) return;
    pending.current = null;
    if (enabled) {
      accountApi.draftPut(kind, exerciseId, { state: p.state, answered: p.answered, total: p.total }).catch(() => {});
    }
  }, [kind, exerciseId, enabled]);

  // Leaving mid-question is exactly when the last keystrokes matter → flush before unload too.
  useEffect(() => {
    const onHide = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") onHide(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      onHide();
    };
  }, [flush]);

  const save = useCallback(
    (state: S, answered: number, total: number) => {
      if (!exerciseId || cleared.current) return;
      writeLocal(kind, exerciseId, { state, answered, total, at: new Date().toISOString() });
      pending.current = { state, answered, total };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [kind, exerciseId, flush],
  );

  const clear = useCallback(() => {
    if (!exerciseId) return;
    cleared.current = true;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    try { localStorage.removeItem(lsKey(kind, exerciseId)); } catch { /* ignore */ }
    if (enabled) accountApi.draftDelete(kind, exerciseId).catch(() => {});
  }, [kind, exerciseId, enabled]);

  return { ready, initial, save, clear };
}
