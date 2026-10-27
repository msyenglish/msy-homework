// Dev-only one-click sign-in for local testing. Answers 404 unless DEV_QUICK_LOGIN=1 is set
// (only in .dev.vars, never a deployed secret) AND the client is loopback. `wrangler dev` rewrites
// the URL/Host to the route's domain, so the check uses the client IP, which Cloudflare sets itself.
import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db";
import { AUTH_COOKIE } from "../middleware/auth";
import { issueSession } from "../lib/session";
import { issueUserSession } from "./account";
import type { AppEnv } from "../lib/env";

const LOOPBACK = new Set(["127.0.0.1", "::1"]);

const dev = new Hono<AppEnv>();

dev.use("*", async (c, next) => {
  if (c.env.DEV_QUICK_LOGIN !== "1" || !LOOPBACK.has(c.req.header("cf-connecting-ip") ?? "")) {
    throw new HTTPException(404, { message: "Không tìm thấy" });
  }
  await next();
});

// POST /dev/quick-login { role: "teacher" | "user" } — signs in as the oldest teacher, or the most
// recently active learner that already has a level (so onboarding is skipped).
dev.post("/quick-login", async (c) => {
  const { role } = await c.req.json<{ role?: string }>().catch(() => ({ role: undefined }));
  const db = getDb(c.env.DB);
  if (role === "teacher") {
    const teacher = await db.query.teachers.findFirst({ orderBy: asc(schema.teachers.createdAt) });
    if (!teacher) throw new HTTPException(404, { message: "Chưa có tài khoản giáo viên nào" });
    await issueSession(c, AUTH_COOKIE, { sub: teacher.id, email: teacher.email, role: "teacher" });
    return c.json({ email: teacher.email });
  }
  if (role === "user") {
    const user =
      (await db.query.users.findFirst({
        where: and(eq(schema.users.active, true), isNotNull(schema.users.levelId)),
        orderBy: desc(schema.users.lastSeenAt),
      })) ?? (await db.query.users.findFirst({ where: eq(schema.users.active, true) }));
    if (!user) throw new HTTPException(404, { message: "Chưa có tài khoản học viên nào" });
    await issueUserSession(c, user);
    return c.json({ email: user.email });
  }
  throw new HTTPException(400, { message: "role phải là teacher hoặc user" });
});

export default dev;
