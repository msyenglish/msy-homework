// Tìm ảnh minh hoạ cho bài tập (kho ảnh miễn phí) + nhập ảnh đã chọn vào R2.
//  • Pexels làm CHÍNH (rate limit cao, ảnh đời thường dễ khớp từ vựng).
//  • Pixabay FALLBACK khi Pexels thiếu key / lỗi / không ra kết quả.
//  • Ảnh chọn được TẢI về R2 (same-origin, ổn định, vào luôn thư viện ảnh dự án).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/env";
import { fileUrl, imageExt, newImageKey } from "../lib/files";

export const mediaRoutes = new Hono<AppEnv>();

/** 1 kết quả ảnh chuẩn hoá (gộp Pexels/Pixabay về cùng hình dạng). */
interface ImageHit {
  id: string;
  thumb: string; // ảnh nhỏ để xem lưới
  full: string; // ảnh to để dùng
  source: "Pexels" | "Pixabay";
  author: string;
  alt?: string;
}

async function searchPexels(env: AppEnv["Bindings"], q: string, perPage: number): Promise<ImageHit[]> {
  if (!env.PEXELS_API_KEY) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&orientation=landscape`;
  const r = await fetch(url, { headers: { Authorization: env.PEXELS_API_KEY } });
  if (!r.ok) return [];
  const data = (await r.json().catch(() => null)) as {
    photos?: { id: number; src?: { medium?: string; large?: string; landscape?: string }; photographer?: string; alt?: string }[];
  } | null;
  return (data?.photos ?? [])
    .filter((p) => p.src?.large || p.src?.landscape)
    .map((p) => ({
      id: `pexels-${p.id}`,
      thumb: p.src?.medium || p.src?.large || p.src?.landscape || "",
      full: p.src?.landscape || p.src?.large || "",
      source: "Pexels" as const,
      author: p.photographer || "Pexels",
      alt: p.alt || "",
    }));
}

async function searchPixabay(env: AppEnv["Bindings"], q: string, perPage: number): Promise<ImageHit[]> {
  if (!env.PIXABAY_API_KEY) return [];
  const url = `https://pixabay.com/api/?key=${env.PIXABAY_API_KEY}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=${perPage}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const data = (await r.json().catch(() => null)) as {
    hits?: { id: number; webformatURL?: string; largeImageURL?: string; previewURL?: string; user?: string; tags?: string }[];
  } | null;
  return (data?.hits ?? [])
    .filter((h) => h.largeImageURL || h.webformatURL)
    .map((h) => ({
      id: `pixabay-${h.id}`,
      thumb: h.webformatURL || h.previewURL || "",
      full: h.largeImageURL || h.webformatURL || "",
      source: "Pixabay" as const,
      author: h.user || "Pixabay",
      alt: h.tags || "",
    }));
}

/** GET /teacher/media/search?q=cat — Pexels chính, Pixabay fallback nếu Pexels rỗng/lỗi. */
mediaRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (!q) return c.json({ items: [], source: null });
  const perPage = Math.min(30, Math.max(1, Number(c.req.query("per_page")) || 24));

  if (!c.env.PEXELS_API_KEY && !c.env.PIXABAY_API_KEY) {
    throw new HTTPException(503, { message: "Chưa cấu hình khoá tìm ảnh (PEXELS_API_KEY/PIXABAY_API_KEY)" });
  }

  let items: ImageHit[] = [];
  let source: "Pexels" | "Pixabay" | null = null;
  try {
    items = await searchPexels(c.env, q, perPage);
    if (items.length) source = "Pexels";
  } catch {
    items = [];
  }
  // Fallback Pixabay khi Pexels không ra kết quả (từ hiếm/không có key Pexels).
  if (!items.length) {
    try {
      items = await searchPixabay(c.env, q, perPage);
      if (items.length) source = "Pixabay";
    } catch {
      items = [];
    }
  }
  return c.json({ items, source });
});

// Chỉ cho nhập ảnh từ CDN của Pexels/Pixabay (chống SSRF: không fetch host tuỳ ý).
function isAllowedImageHost(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return /(^|\.)pexels\.com$/.test(h) || /(^|\.)pixabay\.com$/.test(h);
}

/** POST /teacher/media/import { url } — tải ảnh ngoài về R2, trả { key, url } (same-origin). */
mediaRoutes.post("/import", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { url?: string };
  const src = (body.url || "").trim();
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    throw new HTTPException(400, { message: "URL ảnh không hợp lệ" });
  }
  if (u.protocol !== "https:" || !isAllowedImageHost(u)) {
    throw new HTTPException(400, { message: "Chỉ nhập ảnh từ Pexels/Pixabay" });
  }

  const res = await fetch(u.toString());
  if (!res.ok) throw new HTTPException(502, { message: `Không tải được ảnh (${res.status})` });
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new HTTPException(400, { message: "Liên kết không phải ảnh" });
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 12 * 1024 * 1024) throw new HTTPException(413, { message: "Ảnh quá lớn (tối đa 12MB)" });

  const key = newImageKey(imageExt(contentType));
  await c.env.AUDIO.put(key, buf, { httpMetadata: { contentType } });
  return c.json({ key, url: fileUrl(key) });
});
