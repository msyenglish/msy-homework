// Thu nhỏ + nén ảnh NGAY TRÊN TRÌNH DUYỆT trước khi tải lên, để R2 không phải chứa
// ảnh gốc vài MB từ máy ảnh điện thoại.
import { t } from "../i18n";

/** Cạnh dài tối đa của ảnh đại diện sau khi thu nhỏ. */
export const AVATAR_SIZE = 600;

/**
 * Cắt vuông giữa ảnh rồi thu về `size`px, xuất WebP.
 * Trả về Blob (~30-60 KB ở cỡ 600px, chất lượng 0.85).
 */
export async function squareWebp(file: File, size = AVATAR_SIZE, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  // Cạnh ngắn làm khung cắt → lấy đúng phần giữa, không méo tỉ lệ.
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  // Ảnh nhỏ hơn khung đích thì giữ nguyên cỡ, phóng to chỉ làm vỡ nét mà file lại nặng.
  const out = Math.min(size, side);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(t("lib.imageResize.error.unsupported"));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error(t("lib.imageResize.error.compressFailed"));
  return blob;
}
