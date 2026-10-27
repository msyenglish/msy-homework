// ============================================================
//  "Redo what went wrong" — build a short deck out of a finished session's mistakes.
//
//  The report already names the weak words; sending the learner back through the WHOLE deck to
//  meet them again is the reason a redo rarely happens. This builds a deck of just those words,
//  and only the activities they actually failed.
//
//  Two rules the plan follows:
//   • A pronunciation score under PRON_PASS counts as a miss, even though it is not a graded
//     attempt (see srs.ts) — reading a word badly is exactly what needs another go.
//   • Flashcards for every weak word come FIRST. Being tested again on a word one never managed to
//     learn is not practice, it is a second failure; the meaning is shown before it is asked for.
// ============================================================
import type { VocabActivity, VocabDeckResult, VocabItem, VocabSessionState } from "@msyen/shared";
import { VOCAB_CARDS, type DeckCard } from "./registry";

/** Below this, the pronunciation of a word is worth another attempt. */
export const PRON_PASS = 50;

/** Activities drilled as a GROUP of words — built once from the whole weak list, not per word. */
const GROUP_ACTIVITIES: VocabActivity[] = ["matching"];

export type RedoEntry = { wordId: string; activities: VocabActivity[] };

/** What is worth redoing from a finished session: weak words + the activities each of them failed. */
export function redoPlan(result: VocabDeckResult | null | undefined): RedoEntry[] {
  const out: RedoEntry[] = [];
  for (const w of result?.perWord ?? []) {
    if (!w.wordId) continue;
    const failed = new Set<VocabActivity>();
    for (const a of w.attempts ?? []) if (!a.correct) failed.add(a.activity);
    // Sessions saved before per-attempt recording only know "mastered or not".
    if (!w.attempts?.length && !w.mastered) for (const a of w.seen) if (a !== "flashcard") failed.add(a);
    if (w.pron != null && w.pron < PRON_PASS) failed.add("pronounce");
    failed.delete("flashcard"); // never a test — it leads the redo deck anyway
    if (failed.size) out.push({ wordId: w.wordId, activities: [...failed] });
  }
  return out;
}

/**
 * Deck for a redo run: one flashcard per weak word, then the failed activities.
 * Group activities are rebuilt from the whole weak list, since a single word cannot fill one.
 */
export function buildRedoState(items: VocabItem[], plan: RedoEntry[], allowPronounce: boolean): VocabSessionState {
  const byId = new Map(items.map((i) => [i.id, i]));
  const words = plan.map((p) => byId.get(p.wordId)).filter(Boolean) as VocabItem[];
  const cards: DeckCard[] = [];
  let k = 0;
  const push = (a: VocabActivity, group: VocabItem[]) => {
    const def = VOCAB_CARDS[a];
    if (!def) return;
    for (const g of def.build(group)) cards.push({ key: `redo-${a}-${k++}`, def, items: g });
  };

  for (const it of words) push("flashcard", [it]);
  for (const p of plan) {
    const it = byId.get(p.wordId);
    if (!it) continue;
    for (const a of p.activities) {
      if (GROUP_ACTIVITIES.includes(a)) continue;
      if (a === "pronounce" && !allowPronounce) continue;
      push(a, [it]);
    }
  }
  for (const a of GROUP_ACTIVITIES) {
    if (plan.some((p) => p.activities.includes(a))) push(a, words);
  }

  return {
    queue: cards.map((c) => ({ key: c.key, def: c.def.id, itemIds: c.items.map((i) => i.id) })),
    pos: 0, stats: [], retried: [],
  };
}
