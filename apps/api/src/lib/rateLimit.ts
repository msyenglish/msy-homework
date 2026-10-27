// Helper: enforce Cloudflare Workers Rate Limiting binding on a route handler.
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { AppEnv } from "./env";
import { recordAbuseEvent } from "./telemetry";

/** Key theo IP + danh tính (user/GV cookie) để không phạt lây NAT chung, và chặn cả khách. */
export async function enforceRateLimit(
  c: Context<AppEnv>,
  limiter: { limit(o: { key: string }): Promise<{ success: boolean }> },
  scope: string,
): Promise<void> {
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "ip?";
  const ident = getCookie(c, "msyen_user") || getCookie(c, "msyen_session") || "anon";
  const key = `${scope}:${ip}:${ident}`.slice(0, 200);
  const { success } = await limiter.limit({ key });
  // Telemetry: ghi mọi lượt (cho qua + bị chặn) để soi volume + block-rate theo scope/IP.
  recordAbuseEvent(c, { scope, endpoint: `${c.req.method} ${c.req.routePath}`, blocked: !success });
  if (!success) throw new HTTPException(429, { message: "Bạn thao tác quá nhanh, thử lại sau ít giây nhé." });
}
