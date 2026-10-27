// Tài nguyên R2 (bucket AUDIO — dùng chung audio + ảnh). Phát qua Worker (same-origin).
// Cấu trúc key: xem lib/files.ts. Serve mount tại /media (mới) + /audio (alias cũ).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { AppEnv } from "../lib/env";
import { audioExt, fileUrl, imageExt, newAudioKey, newImageKey } from "../lib/files";

/** CÔNG KHAI: phát/hiển thị 1 tài nguyên theo key (vd "image/xxx.jpg", "audio/xxx.mp3"). */
export const filesServe = new Hono<AppEnv>();
filesServe.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const obj = await c.env.AUDIO.get(key);
  if (!obj) throw new HTTPException(404, { message: "Không tìm thấy tài nguyên" });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});
// Tương thích ngược cho code cũ import `audioServe`.
export const audioServe = filesServe;

/** GIÁO VIÊN: tải lên / liệt kê / xoá tài nguyên. */
export const audioUpload = new Hono<AppEnv>();

/** Liệt kê tài nguyên đã tải (thư viện). `?kind=image` chỉ ẢNH · `?kind=audio` chỉ ÂM THANH.
 *  Ảnh và audio dùng CHUNG bucket R2 → không truyền kind là ra lẫn lộn cả hai.
 *  Gộp key MỚI (image/, audio/) + key CŨ (audio/<uuid>-name) — cùng prefix "audio/"/"image/". */
audioUpload.get("/", async (c) => {
  const kind = c.req.query("kind"); // "image" | "audio" | undefined (= tất cả)
  const [imgs, auds] = await Promise.all([
    c.env.AUDIO.list({ prefix: "image/", limit: 1000 }),
    c.env.AUDIO.list({ prefix: "audio/", limit: 1000 }),
  ]);
  // Tiêu đề giáo viên đặt (bảng media_titles) — dùng để tìm lại file trong thư viện.
  const titles = new Map((await getDb(c.env.DB).select().from(schema.mediaTitles)).map((t) => [t.key, t.title]));
  const items = [...imgs.objects, ...auds.objects]
    .map((o) => ({
      key: o.key,
      url: fileUrl(o.key),
      // Bỏ tiền tố thư mục + uuid dẫn đầu để tên gọn.
      name: o.key.replace(/^(image|audio)\//, "").replace(/^[0-9a-f-]{36}(-|\.)/i, ""),
      title: titles.get(o.key) ?? null,
      size: o.size,
      uploaded: o.uploaded.toISOString(),
      is_image: o.key.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(o.key),
    }))
    .filter((o) => (kind === "image" ? o.is_image : kind === "audio" ? !o.is_image : true))
    .sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));
  return c.json({ items });
});

/** Đặt/sửa TIÊU ĐỀ cho 1 tài nguyên (để tìm lại). Tiêu đề rỗng = xoá tiêu đề. */
audioUpload.patch("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!/^(image|audio)\//.test(key)) throw new HTTPException(400, { message: "Key không hợp lệ" });
  const body = await c.req.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const db = getDb(c.env.DB);
  if (!title) {
    await db.delete(schema.mediaTitles).where(eq(schema.mediaTitles.key, key));
    return c.json({ ok: true, title: null });
  }
  await db
    .insert(schema.mediaTitles)
    .values({ key, title })
    .onConflictDoUpdate({ target: schema.mediaTitles.key, set: { title, updatedAt: new Date().toISOString() } });
  return c.json({ ok: true, title });
});

/** Tải 1 tài nguyên lên. `?kind=image` → thư mục image/; mặc định audio/. */
audioUpload.post("/", async (c) => {
  const contentType = c.req.query("content_type") || c.req.header("content-type") || "application/octet-stream";
  const body = c.req.raw.body;
  if (!body) throw new HTTPException(400, { message: "Thiếu dữ liệu file" });

  const isImage = c.req.query("kind") === "image" || contentType.startsWith("image/");
  const key = isImage ? newImageKey(imageExt(contentType)) : newAudioKey(audioExt(contentType));
  await c.env.AUDIO.put(key, body, { httpMetadata: { contentType } });
  return c.json({ key, url: fileUrl(key) });
});

/** Xóa 1 tài nguyên (theo key). Chỉ cho key thuộc thư mục thư viện (không xoá rec học sinh). */
audioUpload.delete("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  if (!/^(image|audio)\//.test(key)) throw new HTTPException(400, { message: "Key không hợp lệ" });
  await c.env.AUDIO.delete(key);
  // Xoá kèm tiêu đề, không thì bảng media_titles rác dần theo file đã xoá.
  await getDb(c.env.DB).delete(schema.mediaTitles).where(eq(schema.mediaTitles.key, key));
  return c.json({ ok: true });
});
