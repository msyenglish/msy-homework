// Bản nháp bài đang làm dở — lưu cục bộ theo (người học, bài) để F5 không mất câu đã chọn.
// Khoá `sp_draft:` giữ nguyên tiền tố cũ: đổi là mọi bản nháp đang có của học sinh biến mất.
export interface Draft {
  answers: Record<number, string>;
  total: number; // tổng số câu (để hiển thị "đã làm X/Y")
  at: string; // ISO lần lưu gần nhất
}

const draftKey = (pass: string, exId: string) => `sp_draft:${(pass || "").toLowerCase()}:${exId}`;

// Số câu đã trả lời (khác rỗng) trong 1 bản nháp.
export function answeredCount(answers: Record<number, string>): number {
  return Object.values(answers).filter((v) => (v ?? "").toString().trim() !== "").length;
}

export function getDraft(pass: string, exId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(pass, exId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && typeof d === "object" && d.answers ? d : null;
  } catch {
    return null;
  }
}

export function saveDraft(pass: string, exId: string, answers: Record<number, string>, total: number, at: string): void {
  try {
    // Không còn câu nào → xoá nháp (tránh đánh dấu "đang làm" giả).
    if (answeredCount(answers) === 0) {
      localStorage.removeItem(draftKey(pass, exId));
      return;
    }
    localStorage.setItem(draftKey(pass, exId), JSON.stringify({ answers, total, at } satisfies Draft));
  } catch {
    /* bỏ qua */
  }
}

export function clearDraft(pass: string, exId: string): void {
  try {
    localStorage.removeItem(draftKey(pass, exId));
  } catch {
    /* bỏ qua */
  }
}
