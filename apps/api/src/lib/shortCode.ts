// Human-readable short codes (upgrade code, class join code, order code).
// Bỏ ký tự dễ nhầm khi cô đọc to hoặc em chép tay: 0/O, 1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function genCode(len = 6): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

/** Sinh mã chưa trùng cho cột unique. Thử vài lần rồi chịu — va chạm ở 31^6 là cực hiếm. */
export async function uniqueCode(taken: (code: string) => Promise<boolean>, len = 6): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = genCode(len);
    if (!(await taken(code))) return code;
  }
  throw new Error("Không sinh được mã, thử lại giúp cô");
}
