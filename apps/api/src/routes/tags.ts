// Route GIÁO VIÊN — quản lý NHÃN (tag) của bài tập. Khuôn giống topics/levels.
// Nhãn mang thêm `scope` quyết định phạm vi hiển thị của bài:
//   "all" (mặc định) — cả học sinh lẫn user công khai · "student" — CHỈ học sinh của cô.
import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { tagInputSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import { tagOut } from "../lib/serialize";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.tags)
    .orderBy(asc(schema.tags.position), asc(schema.tags.createdAt));
  return c.json({ items: rows.map(tagOut) });
});

r.post("/", async (c) => {
  const parsed = tagInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const v = parsed.data;
  const db = getDb(c.env.DB);
  const values = {
    name: v.name.trim(),
    color: v.color || "#06b6d4",
    icon: v.icon || null,
    scope: v.scope,
    position: v.position ?? 0,
  };
  if (v.id) {
    await db.update(schema.tags).set(values).where(eq(schema.tags.id, v.id));
    return c.json({ id: v.id });
  }
  const [row] = await db.insert(schema.tags).values(values).returning({ id: schema.tags.id });
  return c.json({ id: row.id });
});

r.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  // Gỡ nhãn khỏi bài đang gắn rồi mới xoá (ALTER ADD không bắt được ON DELETE set null).
  // LƯU Ý: bài mất nhãn "student" sẽ về mặc định "all" → lọt vào thư viện công khai.
  // Đó là lý do UI cảnh báo trước khi xoá nhãn phạm vi student.
  await db.update(schema.exercises).set({ tagId: null }).where(eq(schema.exercises.tagId, id));
  await db.delete(schema.tags).where(eq(schema.tags.id, id));
  return c.json({ ok: true });
});

export default r;
