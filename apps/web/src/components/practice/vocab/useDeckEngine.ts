// ============================================================
//  BỘ MÁY của bộ thẻ từ vựng — hàng đợi · ôn từ sai · chấm · tổng kết.
//  TÁCH khỏi giao diện để hai kiểu UI (tự luyện /u/vocabulary và LÀM BÀI TẬP /u/practice)
//  dùng CHUNG một luật chấm. Chép logic sang UI thứ hai là kiểu bug lệch âm thầm.
// ============================================================
import { useMemo, useRef, useState } from "react";
import { vocabActivityGraded, vocabSessionScore } from "@msyen/shared";
import type { VocabActivity, VocabDeckConfigInput, VocabDeckResult, VocabItem, VocabResultWord, VocabSessionState, VocabWordAttempt } from "@msyen/shared";
import { buildDeck, hydrateDeck, type DeckCard } from "./registry";
import type { CardOutcome, CardSnapshot } from "./types";

/** Distinct words a queue covers — the deck size a session is scored out of. */
function deckWordCount(queue: DeckCard[]): number {
  const ids = new Set<string>();
  for (const c of queue) for (const i of c.items) ids.add(i.id);
  return ids.size;
}

/** Card key → verdict plus the card's own redraw data. */
type AnsweredMap = Map<string, { correct: boolean; snapshot: CardSnapshot | null }>;

type WordStat = {
  word: string;
  wordId?: string;
  seen: Set<VocabActivity>;
  wrong: boolean;
  pron?: number;
  /** Every graded answer, in order — the report and the review scheduler both read these counts. */
  attempts: VocabWordAttempt[];
};

export interface DeckEngine {
  card: DeckCard | undefined;
  pos: number;
  total: number;
  done: boolean;
  submitting: boolean;
  /** The last submit failed (network / server): the result is kept so it can be sent again. */
  submitError: string | null;
  /** Send the finished result again after a failed submit. */
  retrySubmit: () => void;
  result: VocabDeckResult | null;
  handleOutcome: (outcome: CardOutcome, snapshot?: CardSnapshot, fromKey?: string, opts?: { stay?: boolean }) => void;
  /** End the session now with whatever has been graded (the "Nộp bài" button). */
  finishNow: () => void;
  /** Cards still open AHEAD of the cursor; -1 when the rest of the deck is done. */
  nextAhead: number;
  /** Cards not graded yet, anywhere in the queue. */
  openCount: number;
  /** Manual card navigation (prev/next buttons) — moves position only, grades nothing. */
  goPrev: () => void;
  goNext: () => void;
  /** Rebuild the queue with the not-yet-mastered words only. False when none are left. */
  retryWeak: (weak: string[]) => boolean;
  /** Verdict of the card at `pos` if it was already graded — undefined while it is still open. */
  answeredAt: (p: number) => boolean | undefined;
  /** What the learner answered on the card at `pos`, so it can be redrawn as it was checked. */
  snapshotAt: (p: number) => CardSnapshot | null;
  /** How many cards of the queue are graded (drives the progress bar, not `pos`). */
  answeredCount: number;
  /** First card still open; -1 when the deck is finished. */
  frontier: number;
  /** Jump back to the first open card after browsing graded ones. */
  goFrontier: () => void;
}

export function useDeckEngine({
  items,
  config,
  allowPronounce,
  onSubmitResult,
  initialState,
  onProgress,
}: {
  items: VocabItem[];
  config: VocabDeckConfigInput;
  allowPronounce: boolean;
  onSubmitResult?: (r: VocabDeckResult) => Promise<void>;
  /** Trạng thái phiên đã lưu → hydrate để HỌC TIẾP (bỏ qua buildDeck). */
  initialState?: VocabSessionState | null;
  /** Gọi sau mỗi thẻ với snapshot hiện tại → lưu server (fire-and-forget). */
  onProgress?: (state: VocabSessionState) => void;
}): DeckEngine {
  // Hydrate từ phiên dở nếu có; nếu không → dựng deck mới (xáo 1 lần).
  const initial = useMemo(
    () => (initialState ? hydrateDeck(initialState, items) : buildDeck(items, config, allowPronounce)),
    [items, config, allowPronounce, initialState],
  );

  const [queue, setQueue] = useState<DeckCard[]>(initial);
  const [pos, setPos] = useState(initialState?.pos ?? 0);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<VocabDeckResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const stats = useRef<Map<string, WordStat>>(
    new Map((initialState?.stats ?? []).map((s) => [s.wordId, {
      word: s.word, wordId: s.wordId, seen: new Set(s.seen), wrong: s.wrong,
      pron: s.pron ?? undefined, attempts: s.attempts ?? [],
    }])),
  );
  const retried = useRef<Set<string>>(new Set(initialState?.retried ?? []));
  // Graded cards by key. Kept OUT of `pos` on purpose: the learner may walk back through finished
  // cards, and a card must never be graded twice (nor reopened blank on resume).
  const [answered, setAnswered] = useState<AnsweredMap>(
    () => new Map((initialState?.answered ?? []).map((a) => [a.key, {
      correct: a.correct, snapshot: (a.snapshot as CardSnapshot | undefined) ?? null,
    }])),
  );

  // Snapshot of the whole session (deck + position + per-word stats) for the resume endpoint.
  const snapshot = (q: DeckCard[], p: number, a: AnsweredMap): VocabSessionState => ({
    queue: q.map((c) => ({ key: c.key, def: c.def.id, itemIds: c.items.map((i) => i.id) })),
    pos: p,
    stats: [...stats.current.values()].map((s) => ({
      wordId: s.wordId ?? s.word, word: s.word, seen: [...s.seen], wrong: s.wrong,
      pron: s.pron ?? null, attempts: s.attempts,
    })),
    retried: [...retried.current],
    answered: [...a].map(([key, v]) => ({ key, correct: v.correct, snapshot: v.snapshot ?? undefined })),
  });

  // Activity modules answer through a short delay, so their callback may run several renders later.
  // Reading `queue`/`pos`/`answered` out of that stale closure wrote the verdict into an outdated
  // map and silently dropped whatever had been graded meanwhile — hence "some cards saved, some
  // didn't". These mirrors always hold the live value.
  const queueRef = useRef(queue);
  const posRef = useRef(pos);
  const answeredRef = useRef(answered);
  queueRef.current = queue;
  posRef.current = pos;
  answeredRef.current = answered;

  const card = queue[pos];

  const stat = (it: VocabItem) => {
    let s = stats.current.get(it.id);
    if (!s) {
      s = { word: it.word, wordId: it.id, seen: new Set(), wrong: false, attempts: [] };
      stats.current.set(it.id, s);
    }
    return s;
  };

  async function finish() {
    const perWord: VocabResultWord[] = [...stats.current.values()].map((s) => {
      const graded = s.attempts.filter((a) => vocabActivityGraded(a.activity));
      // A wrong card comes back once (retryWrong). Getting it right the second time IS knowing the
      // word, so mastery reads the LAST answer per activity, not "never slipped".
      const last = new Map<VocabActivity, boolean>();
      for (const a of graded) last.set(a.activity, a.correct);
      return {
        word: s.word,
        wordId: s.wordId,
        seen: [...s.seen],
        correct: graded.filter((a) => a.correct).length,
        total: graded.length,
        mastered: graded.length > 0 && [...last.values()].every(Boolean),
        pron: s.pron ?? null,
        attempts: s.attempts,
      };
    });
    // Session score = share of correct graded answers; open graded cards count as wrong and a
    // test-free deck scores by completion. The rule lives in shared (`vocabSessionScore`) and the
    // API recomputes it on submit, so the number shown here is the number stored.
    const q = queueRef.current;
    const a = answeredRef.current;
    const openCards = q.filter((c) => !a.has(c.key));
    const progress = {
      cards: q.length,
      open: openCards.length,
      unanswered: openCards.reduce((n, c) => n + (vocabActivityGraded(c.def.id) ? c.items.length : 0), 0),
    };
    const { score } = vocabSessionScore(perWord, progress);
    const r: VocabDeckResult = {
      // Words the QUEUE covers, not "words reached" — the denominator on the card must not shrink
      // because the learner stopped early. Follows the queue so a redo run reports its own size.
      score, total: deckWordCount(q) || perWord.length, perWord,
      // Words worth another look: tested at least once and still not mastered.
      weakWords: perWord.filter((w) => w.total > 0 && !w.mastered).map((w) => w.word),
      progress,
    };
    setResult(r);
    setDone(true);
    await submit(r);
  }

  /** Hands the result to the host. A failure keeps the result and surfaces the error for a retry. */
  async function submit(r: VocabDeckResult) {
    if (!onSubmitResult) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitResult(r);
    } catch (e) {
      setSubmitError(e instanceof Error && e.message ? e.message : "error");
    }
    setSubmitting(false);
  }

  /** First open card at or after `from`, wrapping to the start; -1 when everything is graded. */
  function nextOpen(q: DeckCard[], a: AnsweredMap, from: number): number {
    for (let i = 0; i < q.length; i++) {
      const idx = (from + i) % q.length;
      if (!a.has(q[idx].key)) return idx;
    }
    return -1;
  }

  /**
   * One card's verdict from its activity module → record it + (if wrong) requeue it once for review.
   *
   * `fromKey` is the card that PRODUCED the answer, not wherever the learner stands now. Activity
   * modules report through a short delay (so the tick/cross can be read); pressing Next during that
   * delay used to land the verdict on the card that had just come up — wrong activity recorded, and
   * the card actually answered stayed open with nothing saved.
   */
  function handleOutcome(outcome: CardOutcome, snap?: CardSnapshot, fromKey?: string, opts?: { stay?: boolean }) {
    const queue = queueRef.current;
    const pos = posRef.current;
    const answered = answeredRef.current;
    const at = fromKey ? queue.findIndex((c) => c.key === fromKey) : pos;
    const card = queue[at];
    // Browsing a graded card never re-grades it. Cards that are not a test (flashcard) stay usable
    // while browsing, so answering one again just moves on to where the learner left off.
    if (!card) return;
    const already = answered.get(card.key);
    if (already) {
      // A pronunciation RE-TAKE on a card already scored: keep the better score and the newer
      // breakdown, and stay put — the learner asked to read again, not to move on.
      const retake = outcome.some((r) => typeof r.pron === "number");
      if (retake) {
        for (const r of outcome) {
          const s = stat(r.item);
          if (typeof r.pron === "number") s.pron = Math.max(s.pron ?? 0, r.pron);
        }
        const next: AnsweredMap = new Map(answered).set(card.key, {
          correct: already.correct || outcome.every((r) => r.correct),
          snapshot: snap ?? already.snapshot,
        });
        answeredRef.current = next;
        setAnswered(next);
        onProgress?.(snapshot(queue, pos, next));
        return;
      }
      const nextIdx = nextOpen(queue, answered, pos + 1);
      if (nextIdx >= 0) moveTo(nextIdx);
      return;
    }
    let anyWrong = false;
    for (const r of outcome) {
      const s = stat(r.item);
      s.seen.add(card.def.id);
      s.attempts.push({ activity: card.def.id, correct: r.correct });
      if (typeof r.pron === "number") s.pron = Math.max(s.pron ?? 0, r.pron);
      if (!r.correct) { s.wrong = true; anyWrong = true; }
    }
    const requeue = anyWrong && config.retryWrong && !retried.current.has(card.key);
    if (requeue) retried.current.add(card.key);
    const nextQueue = requeue ? [...queue, { ...card, key: `${card.key}-r` }] : queue;
    const nextAnswered: AnsweredMap = new Map(answered).set(card.key, { correct: !anyWrong, snapshot: snap ?? null });
    // Forward only: wrapping around made the last card jump back to card 1 with no explanation.
    const nextPos = nextQueue.findIndex((c, i) => i > pos && !nextAnswered.has(c.key));
    if (requeue) { queueRef.current = nextQueue; setQueue(nextQueue); }
    answeredRef.current = nextAnswered;
    setAnswered(nextAnswered);
    // `stay` = the card banked a result but the learner is not finished with it (a pronunciation
    // score they may want to beat). Record it, leave them exactly where they are.
    if (opts?.stay) {
      onProgress?.(snapshot(nextQueue, pos, nextAnswered));
      return;
    }
    if (nextPos < 0) {
      onProgress?.(snapshot(nextQueue, pos, nextAnswered));
      // Every card graded → the session is genuinely over. Cards left open behind the cursor mean
      // the learner skipped some: stay here and let them choose (go back, or submit).
      if (nextAnswered.size >= nextQueue.length) finish();
      return;
    }
    // Auto-advance only when the learner is still ON the card they answered; if they already moved
    // (or the verdict came from a card left behind), leaving their position alone is the polite move.
    if (at === pos) { posRef.current = nextPos; setPos(nextPos); }
    onProgress?.(snapshot(nextQueue, at === pos ? nextPos : pos, nextAnswered)); // persist for resume
  }

  function retryWeak(weak: string[]): boolean {
    const weakItems = items.filter((i) => weak.includes(i.word));
    if (!weakItems.length) return false;
    stats.current = new Map();
    retried.current = new Set();
    const fresh = buildDeck(weakItems, config, allowPronounce);
    queueRef.current = fresh;
    answeredRef.current = new Map();
    posRef.current = 0;
    setQueue(fresh);
    setAnswered(new Map());
    setPos(0);
    setResult(null);
    setSubmitError(null);
    setDone(false);
    return true;
  }

  // Every move keeps the mirror in step, so a verdict arriving right after still lands correctly.
  const moveTo = (p: number) => { posRef.current = p; setPos(p); };
  const goPrev = () => moveTo(Math.max(0, posRef.current - 1));
  const goNext = () => moveTo(Math.min(queueRef.current.length - 1, posRef.current + 1));
  const frontier = nextOpen(queue, answered, pos);
  // Open cards AHEAD only — reaching the end must not silently teleport the learner back to card 1.
  const nextAhead = queue.findIndex((c, i) => i > pos && !answered.has(c.key));

  return {
    card, pos, total: queue.length, done, submitting, result, submitError,
    retrySubmit: () => { if (result) void submit(result); }, handleOutcome, goPrev, goNext, retryWeak,
    finishNow: () => { void finish(); },
    nextAhead,
    openCount: queue.length - answered.size,
    answeredAt: (p) => answered.get(queue[p]?.key ?? "")?.correct,
    snapshotAt: (p) => answered.get(queue[p]?.key ?? "")?.snapshot ?? null,
    answeredCount: answered.size,
    frontier,
    goFrontier: () => { if (frontier >= 0) moveTo(frontier); },
  };
}
