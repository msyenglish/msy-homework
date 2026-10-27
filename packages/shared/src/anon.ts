// ============================================================
//  Biệt danh ẩn danh cho BẢNG XẾP HẠNG.
//  Cô có thể bật "ẩn danh" cho một em → với NGƯỜI KHÁC, tên em hiển thị thành biệt
//  danh con vật ngộ nghĩnh ("Sóc Nâu", "Sói Già"…). Chính em vẫn thấy tên thật của mình.
//  Biệt danh sinh ỔN ĐỊNH từ seed (id user): cùng em luôn ra cùng tên, không cần lưu DB,
//  không dùng Math.random (để mọi nơi — server, mọi kỳ — ra kết quả nhất quán).
// ============================================================

const ANIMALS = [
  "Sóc", "Sói", "Gấu", "Cáo", "Hươu", "Nai", "Thỏ", "Rùa", "Cú", "Mèo",
  "Hổ", "Voi", "Khỉ", "Beo", "Rái Cá", "Chồn", "Nhím", "Hải Cẩu", "Cánh Cụt",
  "Đại Bàng", "Bồ Câu", "Công", "Vịt", "Dê", "Ngựa", "Lạc Đà", "Kỳ Lân",
  "Cá Heo", "Bạch Tuộc", "Tê Giác",
];

const ADJS = [
  "Nâu", "Già", "Béo", "Nhanh Nhẹn", "Lười", "Vui Tính", "Hiền", "Tinh Nghịch",
  "Dũng Cảm", "Nhỏ", "Mập", "Xám", "Trắng", "Vàng", "Hồng", "Nhí", "Khôn",
  "Lanh Lợi", "Mơ Màng", "Tí Hon", "Bạo Dạn", "Hớn Hở", "Ngái Ngủ", "Điệu Đà",
  "Lém Lỉnh",
];

// FNV-1a 32-bit — hash chuỗi thành số ổn định, phân bố đều để chọn con vật + tính từ.
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Biệt danh ẩn danh dạng "<Con vật> <Tính từ>" sinh ổn định từ `seed` (thường là id user). */
export function anonAlias(seed: string): string {
  const h = hashSeed(seed);
  const animal = ANIMALS[h % ANIMALS.length];
  const adj = ADJS[Math.floor(h / ANIMALS.length) % ADJS.length];
  return `${animal} ${adj}`;
}
