// Telemetry chống lạm dụng — ghi vào Cloudflare Analytics Engine (non-blocking) + structured
// log (hiện ở Workers Logs). Xem trên Cloudflare Dashboard: dataset `msyen_abuse` (SQL API /
// GraphQL) hoặc Workers Logs (lọc prefix `[abuse]`). KHÔNG có UI trong app — cố ý (Phase 1).
//
// Sơ đồ cột Analytics Engine (dùng khi viết SQL query):
//   index1 = scope           (khoá lấy mẫu: vocab/speak/auth/grammar/set…)
//   blob1  = endpoint        (method + path pattern, vd "POST /vocab/practice")
//   blob2  = identKind       (anon | user | gv)
//   blob3  = ip              (CF-Connecting-IP)
//   blob4  = country         (cf.country)
//   blob5  = ua              (User-Agent, cắt 180 ký tự)
//   double1 = blocked        (1 = bị 429, 0 = cho qua)
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv } from "./env";

/** Loại danh tính gọi request — để tách bot khách với user/GV đã đăng nhập. */
function identKind(c: Context<AppEnv>): "gv" | "user" | "anon" {
  if (getCookie(c, "msyen_session")) return "gv";
  if (getCookie(c, "msyen_user")) return "user";
  return "anon";
}

/**
 * Ghi 1 sự kiện endpoint nhạy vào Analytics Engine + Workers Logs.
 * Gọi fire-and-forget: writeDataPoint đồng bộ, không await, không ném lỗi ra ngoài.
 */
export function recordAbuseEvent(
  c: Context<AppEnv>,
  opts: { scope: string; endpoint: string; blocked: boolean },
): void {
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "ip?";
  const country = (c.req.raw as { cf?: { country?: string } }).cf?.country || "??";
  const ua = (c.req.header("User-Agent") || "").slice(0, 180);
  const kind = identKind(c);
  try {
    c.env.ABUSE_AE?.writeDataPoint({
      indexes: [opts.scope],
      blobs: [opts.endpoint, kind, ip, country, ua],
      doubles: [opts.blocked ? 1 : 0],
    });
  } catch {
    // Không để telemetry làm hỏng request thật.
  }
  // Chỉ log khi BỊ CHẶN — giữ Workers Logs gọn, cảnh báo sớm khi có ai đó bị rate-limit.
  if (opts.blocked) {
    console.log(`[abuse] blocked scope=${opts.scope} ep=${opts.endpoint} kind=${kind} ip=${ip} country=${country}`);
  }
}
