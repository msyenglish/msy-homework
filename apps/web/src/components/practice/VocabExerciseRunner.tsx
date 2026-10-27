// ============================================================
//  Runner for a vocab deck ASSIGNED AS HOMEWORK (/u/practice/:slug).
//
//  Two things it owns on top of <VocabDeckExercise>:
//   • RESUME — the session (built deck + position + per-card verdicts) lives server-side under
//     scope "exercise", so leaving the page or switching device continues where the learner was.
//     A deck can be 60+ cards; restarting it from scratch is what made long decks unfinishable.
//   • ONE result screen — on submit it goes straight to the report page /s/:id (which carries the
//     feedback), instead of showing a deck summary and then a report.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { VocabDeckConfig, VocabItem, VocabSessionState } from "@msyen/shared";
import type { VocabSession } from "../../lib/api";
import { accountApi } from "../../lib/api";
import { buildSessionState } from "./vocab/registry";
import { buildRedoState, type RedoEntry } from "./vocab/redo";
import { createSessionSaver, type SessionSaver } from "./vocab/sessionSaver";
import { confirmAsk } from "../confirm";
import { VocabDeckExercise } from "./VocabDeckExercise";
import { PageLoading } from "../PageLoading";
import { t } from "../../i18n";

export function VocabExerciseRunner({
  exerciseId,
  title,
  items,
  config,
  learnerName,
  backTo,
  redo,
}: {
  exerciseId: string;
  title: string;
  items: VocabItem[];
  config: VocabDeckConfig;
  learnerName: string;
  backTo: string;
  /** Redo run started from a report: only the weak words, only what they failed. */
  redo?: RedoEntry[] | null;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  // null = still resolving the session; the deck must not mount before then or it would build a
  // fresh queue and immediately overwrite the saved one.
  // `items` is pinned at boot: a resumed session runs on ITS words, and a background refetch of the
  // exercise must not swap the word pool under a deck in progress.
  const [boot, setBoot] = useState<{ state: VocabSessionState | null; sessionId: string | null; items: VocabItem[] } | null>(null);
  const sessionId = useRef<string | null>(null);
  const saver = useRef<SessionSaver | null>(null);
  const attach = (id: string | null) => {
    saver.current?.close();
    sessionId.current = id;
    saver.current = id ? createSessionSaver(id) : null;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const allowPron = config.pronounce !== "off";
      const fresh = () => buildSessionState(items, config, allowPron);
      try {
        // A redo replaces whatever session was open: it IS the new attempt, and the learner asked
        // for it from the report. Warn first if that would drop unfinished work.
        if (redo?.length) {
          const state = buildRedoState(items, redo, allowPron);
          if (state.queue.length) {
            const { session: open } = await accountApi.vocabSessionActive("exercise", exerciseId).catch(() => ({ session: null }));
            const left = open ? open.state.queue.length - (open.state.answered?.length ?? 0) : 0;
            if (left > 0) {
              const ok = await confirmAsk({
                title: t("practice2.redo.title"),
                message: t("practice2.redo.message", { n: left }),
                confirmText: t("practice2.redo.confirm"),
                cancelText: t("practice2.redo.cancel"),
                danger: true,
              });
              if (!ok) { nav(backTo); return; }
            }
            const { id } = await accountApi.vocabSessionStart({
              scope: "exercise", scopeKey: exerciseId, label: title, config,
              itemIds: items.map((i) => i.id), state,
            });
            if (!alive) return;
            attach(id);
            setBoot({ state, sessionId: id, items });
            return;
          }
        }
        const { session } = await accountApi.vocabSessionActive("exercise", exerciseId);
        // A saved session whose deck no longer matches the exercise (teacher edited the word list
        // or the activities) is dropped rather than half-hydrated.
        if (session && sameDeck(session, items, config)) {
          if (!alive) return;
          attach(session.id);
          setBoot({ state: session.state, sessionId: session.id, items: session.items });
          return;
        }
        const state = fresh();
        const { id } = await accountApi.vocabSessionStart({
          scope: "exercise", scopeKey: exerciseId, label: title, config,
          itemIds: items.map((i) => i.id), state,
        });
        if (!alive) return;
        attach(id);
        setBoot({ state, sessionId: id, items });
      } catch {
        // Session storage down / not logged in → still practise, just without resume.
        if (alive) setBoot({ state: null, sessionId: null, items });
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, redo]);

  if (!boot) return <PageLoading full />;

  return (
    <VocabDeckExercise
      items={boot.items}
      config={config}
      title={title}
      learnerName={learnerName}
      hideSummary
      initialState={boot.state}
      onProgress={(state) => saver.current?.save(state)}
      onExit={() => nav(backTo)}
      onSubmitResult={async (result) => {
        // Let the last card's save land first, so a failed submit still resumes at the very end.
        await saver.current?.flush();
        // The server scores the result and closes the session; an error surfaces as a retry.
        const r = await accountApi.vocabSubmit({ exerciseId, sessionId: sessionId.current, result });
        saver.current?.close();
        qc.invalidateQueries({ queryKey: ["user-stats"] });
        qc.invalidateQueries({ queryKey: ["library"] });
        qc.invalidateQueries({ queryKey: ["vocab-due"] });
        nav(`/s/${r.id}`, { replace: true });
      }}
    />
  );
}

/**
 * Can a saved session be resumed against the exercise as it is now? Every card must still resolve
 * to a word, the activities must be the same, and the words must still belong to the deck: by id
 * for a fixed list, by set for a set-based pick (whose words are drawn per attempt).
 */
function sameDeck(session: VocabSession, items: VocabItem[], config: VocabDeckConfig): boolean {
  const have = new Set(session.items.map((i) => i.id));
  if (!session.state.queue.length || !session.state.queue.every((c) => c.itemIds.every((id) => have.has(id)))) return false;
  const saved = session.config;
  const acts = (c: VocabDeckConfig) => [...c.activities].sort().join(",");
  if (saved.source !== config.source || acts(saved) !== acts(config)) return false;
  if (config.source === "fixed") {
    const live = new Set(items.map((i) => i.id));
    return session.items.every((i) => live.has(i.id));
  }
  return (saved.filter?.setId ?? null) === (config.filter?.setId ?? null);
}
