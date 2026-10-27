// Sổ đăng ký các TEMPLATE dạng luyện từ vựng. Thêm dạng mới = thêm 1 file + 1 dòng ở đây.
// Deck gọi `buildDeck()` để ra danh sách thẻ, không cần biết chi tiết dạng nào.
import type { VocabActivity, VocabDeckConfigInput, VocabItem, VocabSessionState } from "@msyen/shared";
import { shuffle, type VocabCardDef } from "./types";
import { def as flashcard } from "./Flashcard";
import { def as matching } from "./MatchPairs";
import { def as listenChoice } from "./ListenChoice";
import { def as dictation } from "./Dictation";
import { def as recall } from "./Recall";
import { def as pronounce } from "./Pronounce";
import { def as spelling } from "./Spelling";
import { def as paraphrase } from "./Paraphrase";

export const VOCAB_CARDS: Partial<Record<VocabActivity, VocabCardDef>> = {
  flashcard,
  matching,
  listen_choice: listenChoice,
  dictation,
  recall,
  pronounce,
  spelling,
  paraphrase,
};

/** Danh sách dạng có thể chọn khi soạn deck (đúng thứ tự hiển thị). */
export const VOCAB_ACTIVITY_LIST = Object.values(VOCAB_CARDS).map((d) => ({ id: d!.id, label: d!.label }));

export type DeckCard = { key: string; def: VocabCardDef; items: VocabItem[] };

/** Dựng toàn bộ thẻ cho 1 deck. Dạng không đủ điều kiện (thiếu nghĩa/pos…) tự bị bỏ qua. */
export function buildDeck(items: VocabItem[], config: VocabDeckConfigInput, allowPronounce: boolean): DeckCard[] {
  const cards: DeckCard[] = [];
  let k = 0;
  for (const a of config.activities) {
    if (a === "pronounce" && !allowPronounce) continue;
    const def = VOCAB_CARDS[a];
    if (!def) continue;
    for (const group of def.build(items)) cards.push({ key: `${a}-${k++}`, def, items: group });
  }
  const ordered = config.order === "grouped" ? cards : shuffle(cards);
  // Flashcard luôn dẫn đầu — xem mặt chữ/nghĩa trước rồi mới tới các dạng kiểm tra.
  return [...ordered.filter((c) => c.def.id === "flashcard"), ...ordered.filter((c) => c.def.id !== "flashcard")];
}

/** Ước lượng số thẻ (câu) một deck sẽ dựng — cho "dự kiến số câu" ở modal. */
export function estimateCards(items: VocabItem[], config: VocabDeckConfigInput, allowPronounce: boolean): number {
  return buildDeck(items, config, allowPronounce).length;
}

/** Dựng trạng thái phiên BAN ĐẦU (deck đã xáo) để lưu server + hydrate lại khi học tiếp. */
export function buildSessionState(items: VocabItem[], config: VocabDeckConfigInput, allowPronounce: boolean): VocabSessionState {
  const deck = buildDeck(items, config, allowPronounce);
  return {
    queue: deck.map((c) => ({ key: c.key, def: c.def.id, itemIds: c.items.map((i) => i.id) })),
    pos: 0, stats: [], retried: [],
  };
}

/** Hoàn lại DeckCard[] từ trạng thái đã lưu + danh sách từ (theo id). */
export function hydrateDeck(state: VocabSessionState, items: VocabItem[]): DeckCard[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return state.queue
    .map((c) => ({ key: c.key, def: VOCAB_CARDS[c.def], items: c.itemIds.map((id) => byId.get(id)).filter(Boolean) as VocabItem[] }))
    .filter((c): c is DeckCard => !!c.def && c.items.length > 0);
}
