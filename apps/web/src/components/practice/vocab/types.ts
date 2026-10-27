// Hợp đồng CHUNG cho mọi "template dạng luyện từ vựng" (vocab v2).
// Mỗi dạng = 1 module độc lập export `def` (metadata + cách chia thẻ + component).
// Deck chỉ điều phối hàng đợi/chấm/tiến độ — KHÔNG biết chi tiết từng dạng.
import type { LucideIcon } from "lucide-react";
import type { VocabActivity, VocabItem } from "@msyen/shared";

/** Kết quả 1 thẻ: mỗi từ trong thẻ đúng/sai (kèm điểm phát âm nếu có). */
export type CardOutcome = { item: VocabItem; correct: boolean; pron?: number }[];

/**
 * What a card must remember to redraw itself EXACTLY as it looked right after being checked:
 * its randomised build (shuffled options, scrambled letters…) plus what the learner answered.
 * Opaque to the deck — it is stored with the session and handed back through `review`.
 */
export type CardSnapshot = Record<string, unknown>;

export type VocabCardProps = {
  /** Single-word activities get exactly one; group ones (match / sort) get several. */
  items: VocabItem[];
  /** Every word of the deck — the source of distractors. */
  pool: VocabItem[];
  /**
   * Called once the learner has answered this card (the deck moves on by itself).
   * `stay` banks the result WITHOUT moving on — for a card the learner may want to retry, such as
   * pronunciation, where the score arrives long before they are done with the word.
   */
  onDone: (outcome: CardOutcome, snapshot?: CardSnapshot, opts?: { stay?: boolean }) => void;
  /**
   * Set when the learner walks back to a card already graded: redraw the checked state, read-only.
   * Cards that are not a test (flashcard) ignore it and simply stay usable.
   */
  review?: CardSnapshot | null;
};

export type VocabCardDef = {
  id: VocabActivity;
  /** Nhãn ngắn hiện trên huy hiệu đầu thẻ. */
  label: string;
  /** Câu dẫn mặc định của dạng. */
  hint: string;
  Icon: LucideIcon;
  /** Tông màu chủ đạo của dạng (class Tailwind cho huy hiệu). */
  tone: string;
  Component: React.ComponentType<VocabCardProps>;
  /**
   * Chia danh sách từ thành các NHÓM, mỗi nhóm = 1 thẻ.
   * Trả [] nếu deck không đủ điều kiện dùng dạng này (vd thiếu nghĩa để tạo nhiễu).
   */
  build: (items: VocabItem[]) => VocabItem[][];
};

// ── tiện ích dùng chung khi chia thẻ ──
export function shuffle<T>(a: T[]): T[] {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
/** Mỗi từ 1 thẻ (dạng đơn). */
export const oneEach = (items: VocabItem[]): VocabItem[][] => items.map((i) => [i]);
/** Bỏ nhãn từ loại trong ngoặc để đọc/so khớp: "art gallery (n)" → "art gallery". */
export const stripTag = (w: string) => w.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
