import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { loginInputSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import { verifyPassword } from "../lib/password";
import { AUTH_COOKIE, requireTeacher } from "../middleware/auth";
import { issueSession } from "../lib/session";
import type { AppEnv } from "../lib/env";

const auth = new Hono<AppEnv>();

auth.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Thiếu email hoặc mật khẩu" });

  const db = getDb(c.env.DB);
  const email = parsed.data.email.trim().toLowerCase();
  const teacher = await db.query.teachers.findFirst({
    where: eq(schema.teachers.email, email),
  });
  if (!teacher || !(await verifyPassword(parsed.data.password, teacher.passwordHash))) {
    throw new HTTPException(401, { message: "Email hoặc mật khẩu không đúng" });
  }

  await issueSession(c, AUTH_COOKIE, { sub: teacher.id, email: teacher.email, role: "teacher" });

  return c.json({ teacher: { id: teacher.id, email: teacher.email, name: teacher.name } });
});

auth.post("/logout", (c) => {
  deleteCookie(c, AUTH_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireTeacher, async (c) => {
  const t = c.get("teacher");
  const db = getDb(c.env.DB);
  const row = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, t.id) });
  return c.json({ teacher: { id: t.id, email: row?.email ?? t.email, name: row?.name ?? null } });
});

export default auth;
