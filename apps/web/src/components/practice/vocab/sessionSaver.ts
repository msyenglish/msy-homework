// Serial writer for a deck's resume session: one PATCH in flight, only the newest state queued.
// Firing one request per card let a slow, older PATCH land after a newer one and roll the saved
// session back, so a resumed deck reopened cards the learner had already answered.
import type { VocabSessionState } from "@msyen/shared";
import { accountApi } from "../../../lib/api";

export interface SessionSaver {
  save: (state: VocabSessionState) => void;
  /** Resolves once nothing is in flight or queued. */
  flush: () => Promise<void>;
  /** Stop writing (the session was submitted or dropped); queued state is discarded. */
  close: () => void;
}

export function createSessionSaver(sessionId: string): SessionSaver {
  let pending: VocabSessionState | null = null;
  let running: Promise<void> | null = null;
  let closed = false;

  const pump = async () => {
    while (pending && !closed) {
      const state = pending;
      pending = null;
      await accountApi.vocabSessionPatch(sessionId, state).catch(() => {});
    }
    running = null;
  };

  return {
    save: (state) => {
      if (closed) return;
      pending = state;
      if (!running) running = pump();
    },
    flush: async () => {
      while (running) await running;
    },
    close: () => {
      closed = true;
      pending = null;
    },
  };
}
