// Quy hoạch TÀI NGUYÊN R2 (bucket AUDIO) — cấu trúc thư mục rõ ràng, tránh đổ chung 1 chỗ.
//
// Layout key (MỚI):
//   image/<uuid>.<ext>          — ảnh giáo viên upload / nhập từ Pexels-Pixabay
//   image/feedback/<uuid>.<ext> — ảnh học viên đính kèm góp ý
//   audio/<uuid>.<ext>          — audio giáo viên (đọc mẫu, listening)
//   rec/reading/<uuid>.<ext>    — bản ghi bài ĐỌC TO của học sinh
//   rec/speaking/<uuid>.<ext>   — bản ghi bài NÓI của học sinh
//   assess/reading/<subId>.json — chấm âm vị đầy đủ (offload khỏi D1; xem readingWords.ts)
//   assess/speaking/<subId>.json— (để dành cho speaking)
//   avatar/<userId>.webp        — ảnh đại diện user công khai
//
// Phục vụ tại `/api/v1/media/<key>` → URL sạch, KHÔNG lặp (vd /api/v1/media/image/…).
// `/api/v1/audio/<key>` giữ làm ALIAS để URL/key CŨ (đã lưu trong DB) không hỏng.
//
// Data CŨ (key `audio/<uuid>-name`, `reading/<uuid>`, `speaking/<uuid>`) vẫn phục vụ được
// qua cả 2 mount (cùng bucket, tra theo key) → không cần migrate.

export const MEDIA_MOUNT = "/api/v1/media";

/** URL công khai để phát/hiển thị 1 tài nguyên theo key R2. */
export function fileUrl(key: string): string {
  return `${MEDIA_MOUNT}/${key}`;
}

const uuid = () => crypto.randomUUID();

export const newImageKey = (ext: string) => `image/${uuid()}.${ext}`;
export const newAudioKey = (ext: string) => `audio/${uuid()}.${ext}`;
export const newReadingRecKey = (ext: string) => `rec/reading/${uuid()}.${ext}`;

/** Chấm âm vị (JSON) offload khỏi D1 — key SUY từ id bản ghi nên không cần lưu cột riêng. */
export const readingAssessKey = (submissionId: string) => `assess/reading/${submissionId}.json`;

/** Ảnh đại diện: key CỐ ĐỊNH theo user → đổi ảnh là ghi đè, không bao giờ đọng file cũ. */
export const avatarKey = (userId: string) => `avatar/${userId}.webp`;

/** Đuôi file ảnh từ content-type (mặc định jpg). */
export function imageExt(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("avif")) return "avif";
  return "jpg";
}

/** Đuôi file audio từ content-type (mặc định mp3). */
export function audioExt(ct: string): string {
  if (ct.includes("mp4") || ct.includes("m4a")) return "m4a";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("wav")) return "wav";
  return "mp3";
}

/** Đuôi bản ghi (webm/mp4/ogg/wav/mp3) từ content-type — dùng cho rec học sinh. */
export function recExt(ct: string): string {
  if (ct.includes("mp4") || ct.includes("m4a")) return "mp4";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  return "webm";
}
