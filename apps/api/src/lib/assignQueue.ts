// ============================================================
//  HÀNG CHỜ TRƯỢT cho bài CÔ GIAO — mở dần theo TIẾN ĐỘ, không theo ngày.
//  Luật: luôn giữ WINDOW ô đang mở. Bài chưa đạt (<PASS_PCT) chiếm tối đa REDO_SLOTS ô
//  → luôn còn ít nhất 1 ô cho bài MỚI, không bao giờ kẹt cứng. Bài thử ≥ STUCK_ATTEMPTS
//  lần vẫn chưa đạt thì NHẢ ô (khỏi chặn lộ trình) và chuyển sang nhóm "cần cô hỗ trợ".
// ============================================================

/** Điểm tối thiểu coi là ĐẠT một bài (phần trăm). */
export const PASS_PCT = 50;
/** Số ô mở tối đa cùng lúc. */
export const WINDOW = 6;
/** Trần ô mà bài CHƯA ĐẠT được chiếm (WINDOW - REDO_SLOTS = số ô tối thiểu cho bài mới). */
export const REDO_SLOTS = 3;
/** After this many failed attempts the exercise stops holding a slot. */
export const STUCK_ATTEMPTS = 3;
/**
 * Whether a `locked` slot also blocks the exercise server-side (403 in `requireUnlocked`).
 * false → the queue stays an ORDERING HINT: the UI still shows the window, the progress bar and
 * the "next up" teaser, but a student who opens the URL of a not-yet-due assignment can do it.
 * Flip back to true once teachers can reorder assignments (`position`) from the teacher pages.
 */
export const ENFORCE_LOCK: boolean = false;

export type AssignState =
  | "todo" // chưa làm, đã tới lượt (đang mở)
  | "redo" // đã làm nhưng < PASS_PCT, đang chiếm ô
  | "waiting" // < PASS_PCT nhưng hết ô — làm lại được, chưa tính vào hàng đang mở
  | "stuck" // thử ≥ STUCK_ATTEMPTS lần vẫn chưa đạt — nhả ô, cần cô hỗ trợ
  | "passed" // ≥ PASS_PCT
  | "locked"; // chưa tới lượt

export interface AssignProgress {
  correct: number;
  total: number;
  attempts: number;
}

export interface QueueSlot {
  state: AssignState;
  locked: boolean;
  /** Có nằm trong WINDOW ô đang mở không (quyết định vùng "Cần làm ngay" ở UI). */
  queued: boolean;
}

export interface QueueSummary {
  total: number;
  passed: number;
  /** Số bài chưa tới lượt. */
  locked: number;
  /** Số ô đang bị bài chưa đạt chiếm (để nhắc "làm xong mới mở tiếp"). */
  redo: number;
  window: number;
  pass_pct: number;
}

/**
 * Xếp hàng chờ cho danh sách bài cô giao ĐÃ SẮP THỨ TỰ.
 * Trả về map exerciseId → slot + tổng kết cho thanh tiến độ.
 */
export function buildAssignQueue<T extends { id: string }>(
  ordered: T[],
  progressOf: (ex: T) => AssignProgress | undefined,
): { slots: Map<string, QueueSlot>; summary: QueueSummary } {
  const slots = new Map<string, QueueSlot>();
  let passed = 0;
  let redoUsed = 0; // ô đang bị bài chưa đạt chiếm (trần REDO_SLOTS)
  let freshUsed = 0; // ô đã cấp cho bài mới
  let lockedCount = 0;

  // Ô dành cho bài MỚI = phần WINDOW còn lại sau khi bài chưa đạt lấy tối đa REDO_SLOTS.
  // Tính trước để bài mới không bị "ăn" mất ô bởi bài chưa đạt nằm phía sau trong lộ trình.
  const notPassed = ordered.filter((e) => {
    const p = progressOf(e);
    return !!p && p.attempts > 0 && p.attempts < STUCK_ATTEMPTS && pct(p) < PASS_PCT;
  }).length;
  const freshSlots = WINDOW - Math.min(REDO_SLOTS, notPassed);

  for (const ex of ordered) {
    const p = progressOf(ex);
    const attempts = p?.attempts ?? 0;

    if (attempts > 0 && pct(p!) >= PASS_PCT) {
      passed++;
      slots.set(ex.id, { state: "passed", locked: false, queued: false });
      continue;
    }
    if (attempts >= STUCK_ATTEMPTS) {
      // Đã cố đủ nhiều — không giữ ô nữa, nhưng vẫn làm lại được bất cứ lúc nào.
      slots.set(ex.id, { state: "stuck", locked: false, queued: false });
      continue;
    }
    if (attempts > 0) {
      // Chưa đạt: chiếm ô cho tới trần REDO_SLOTS; quá trần thì chờ lượt (KHÔNG khoá lại,
      // bài đã mở rồi thì không thể đóng).
      const queued = redoUsed < REDO_SLOTS;
      if (queued) redoUsed++;
      slots.set(ex.id, { state: queued ? "redo" : "waiting", locked: false, queued });
      continue;
    }
    // Bài mới: cấp ô theo thứ tự lộ trình cho tới hết freshSlots, sau đó khoá.
    if (freshUsed < freshSlots) {
      freshUsed++;
      slots.set(ex.id, { state: "todo", locked: false, queued: true });
    } else {
      lockedCount++;
      slots.set(ex.id, { state: "locked", locked: true, queued: false });
    }
  }

  return {
    slots,
    summary: {
      total: ordered.length,
      passed,
      locked: lockedCount,
      redo: redoUsed,
      window: WINDOW,
      pass_pct: PASS_PCT,
    },
  };
}

function pct(p: AssignProgress): number {
  return p.total > 0 ? (p.correct / p.total) * 100 : 0;
}
