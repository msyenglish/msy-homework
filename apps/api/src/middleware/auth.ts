// Middleware: yêu cầu đăng nhập giáo viên (JWT trong cookie httpOnly).
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import { isRevoked, renewIfStale } from "../lib/session";
import type { AppEnv } from "../lib/env";

export const AUTH_COOKIE = "msyen_session";

export const requireTeacher: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, AUTH_COOKIE);
  if (!token) throw new HTTPException(401, { message: "Chưa đăng nhập" });
  let payload: Awaited<ReturnType<typeof verify>>;
  try {
    payload = await verify(token, c.env.JWT_SECRET, "HS256");
    // Shares JWT_SECRET with the public-user token, so any other role is refused here.
    // Legacy teacher tokens carry no role claim — a missing one still counts as valid.
    if (payload.role && payload.role !== "teacher") throw new Error("wrong role");
    c.set("teacher", { id: String(payload.sub), email: String(payload.email) });
  } catch {
    throw new HTTPException(401, { message: "Phiên đã hết hạn, đăng nhập lại" });
  }

  const row = await c.env.DB.prepare("select sessions_valid_from as validFrom from teachers where id = ?")
    .bind(c.get("teacher").id)
    .first<{ validFrom: string | null }>();
  if (!row) throw new HTTPException(401, { message: "Phiên đã hết hạn, đăng nhập lại" });
  if (isRevoked(payload.iat, row.validFrom)) {
    throw new HTTPException(401, { message: "Phiên đã hết hiệu lực, đăng nhập lại" });
  }
  await renewIfStale(c, AUTH_COOKIE, {
    exp: payload.exp,
    sub: c.get("teacher").id,
    email: c.get("teacher").email,
    role: "teacher",
  });

  await next();
};
