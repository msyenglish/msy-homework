import type { IpaLine } from "@msyen/shared";

// Chuẩn hoá từ để so khớp: thường hoá + bỏ ký tự không phải chữ/'.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z']/g, "");

/**
 * Dựng map TỪ → IPA (CÓ trọng âm ˈ/ˌ) từ `passage_ipa` (Gemini sinh theo CÂU, các từ cách
 * nhau bằng khoảng trắng). Cách làm: mỗi câu tách `text` thành TỪ và `ipa` thành TOKEN theo
 * space; chỉ khi SỐ LƯỢNG khớp mới zip 1-1 (align tin cậy). Câu lệch (dấu câu/gộp từ) → bỏ
 * qua để không map sai. Nhờ vậy tooltip từng-từ ở màn kết quả có trọng âm mà KHÔNG cần đổi
 * schema/gọi thêm AI — tái dùng dữ liệu passage_ipa đã có.
 */
export function buildWordIpaMap(lines?: IpaLine[] | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!lines) return map;
  for (const ln of lines) {
    const words = ln.text.split(/\s+/).filter(Boolean);
    // Bỏ dấu "/" bao ngoài rồi tách token theo khoảng trắng.
    const toks = ln.ipa.replace(/\//g, " ").split(/\s+/).filter(Boolean);
    if (words.length !== toks.length) continue;
    for (let i = 0; i < words.length; i++) {
      const w = norm(words[i]);
      const ipa = toks[i].trim();
      if (w && ipa && !map.has(w)) map.set(w, ipa);
    }
  }
  return map;
}

/** Phiên âm (có trọng âm) cho 1 từ từ map trên; null nếu không có (caller fallback Azure). */
export function wordIpaWithStress(map: Map<string, string>, word: string): string | null {
  const ipa = map.get(norm(word));
  return ipa ? `/${ipa}/` : null;
}
