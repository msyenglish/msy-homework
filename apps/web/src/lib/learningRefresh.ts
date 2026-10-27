// One place that says "the learner just finished something — everything derived from that is stale".
//
// Finishing an exercise moves server state the client cannot recompute: the drip refunds an unlock
// slot when a first attempt passes (UNLOCK_PASS_PCT), the assigned queue slides, and total points
// (so the XP badge and the nav score) change. Only quiz and dictation used to say so, which is why
// a read-aloud or a writing task needed an F5 before the library caught up.
//
// Safe to call from a component the teacher pages also mount: invalidating a key nothing is
// subscribed to is a no-op in react-query.
import { useQueryClient } from "@tanstack/react-query";

/** Query keys holding anything derived from "what the learner has completed". */
const LEARNING_KEYS = [
  ["library"], // exercise cards, drip unlocks, assigned queue
  ["user-stats"], // total points + XP level (nav badge, library hero)
] as const;

/**
 * Returns a callback that refreshes every learning-progress query.
 *
 * Call it when a RESULT LANDS, not when work is submitted: read-aloud and speaking are graded
 * asynchronously through the queue, so at submit time the score does not exist yet.
 */
export function useLearningRefresh(): () => void {
  const qc = useQueryClient();
  return () => {
    for (const queryKey of LEARNING_KEYS) qc.invalidateQueries({ queryKey });
  };
}

/**
 * Options for the queries above. Spread them into every `useQuery` that reads one of LEARNING_KEYS —
 * react-query merges options per key, so leaving one call site out makes the behaviour depend on
 * which component mounted first.
 *
 * `refetchOnWindowFocus` is ON here and OFF globally on purpose: this learner state changes on
 * another device, in another tab, or from the teacher assigning work — but the teacher tables and
 * content lists that share the global default do not, and refetching those on every focus would
 * cost far more than it buys.
 */
export const LEARNING_QUERY_OPTS = {
  refetchOnWindowFocus: true,
  retry: false,
} as const;
