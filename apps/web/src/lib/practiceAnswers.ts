// ============================================================
//  Mã hoá / giải mã GIÁ TRỊ ĐÁP ÁN cho từng loại câu hỏi.
//  QUAN TRỌNG: encoding phải GIỮ NGUYÊN để server chấm đúng
//  (gradeSubmission ở @msyen/shared dựa vào đúng các dạng này):
//   - multiple_choice : value = đúng chuỗi option đã chọn
//   - fill_blank      : value = chuỗi học sinh gõ
//   - matching        : value = JSON { [leftText]: rightText }
//   - ordering        : value = các token nối bằng dấu cách (câu)
//   - categorize      : value = JSON { [itemText]: category }
//  Các hàm decode* dùng để KHÔI PHỤC bài làm dở (draft) khi F5/rớt mạng.
// ============================================================

/** Parse JSON → object {string:string}; lỗi/khác kiểu → {}. */
export function parseObjValue(value: string): Record<string, string> {
  if (!value) return {};
  try {
    const o = JSON.parse(value);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Object {string:string} → JSON; rỗng (bỏ giá trị falsy) → "" (coi như chưa trả lời). */
export function stringifyObjValue(obj: Record<string, string>): string {
  const filled = Object.fromEntries(Object.entries(obj).filter(([, v]) => v));
  return Object.keys(filled).length ? JSON.stringify(filled) : "";
}

// ----- matching -----
export const decodeMatching = parseObjValue; // { [leftText]: rightText }
export const encodeMatching = stringifyObjValue;

// ----- categorize -----
export const decodeCategorize = parseObjValue; // { [itemText]: category }
export const encodeCategorize = stringifyObjValue;

// ----- ordering -----
/** Nối token thành câu (encoding để server chấm). */
export function encodeOrdering(tokens: string[]): string {
  return tokens.join(" ");
}
/**
 * Khôi phục dãy token từ câu đã lưu, khớp lại với danh sách token gốc.
 * Ưu tiên khớp cụm dài trước (xử lý token nhiều từ như "New York").
 * Trả về mảng token theo thứ tự đã xếp (rỗng nếu không khớp được).
 */
export function decodeOrdering(value: string, allTokens: string[]): string[] {
  if (!value.trim()) return [];
  const remaining = [...allTokens].sort((a, b) => b.length - a.length);
  let rest = value.trim().replace(/\s+/g, " ");
  const seq: string[] = [];
  // Lặp: mỗi bước lấy token khớp tiền tố dài nhất.
  while (rest.length) {
    const tok = remaining.find((t) => rest === t || rest.startsWith(t + " "));
    if (!tok) break;
    seq.push(tok);
    remaining.splice(remaining.indexOf(tok), 1);
    rest = rest.slice(tok.length).trimStart();
  }
  return seq;
}
