// Route GIÁO VIÊN — quản lý cấp độ (tag level) học sinh.
import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { levelInputSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import { levelOut } from "../lib/serialize";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.levels)
    // Sắp theo position; hoà thì theo thời điểm tạo (KHÔNG theo tên — "Pre A1" sẽ bị đẩy xuống cuối).
    .orderBy(asc(schema.levels.position), asc(schema.levels.createdAt));
  return c.json({ items: rows.map(levelOut) });
});

r.post("/", async (c) => {
  const parsed = levelInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const v = parsed.data;
  const db = getDb(c.env.DB);
  const values = { name: v.name.trim(), color: v.color || "#06b6d4", icon: v.icon || null, position: v.position ?? 0 };
  if (v.id) {
    await db.update(schema.levels).set(values).where(eq(schema.levels.id, v.id));
    return c.json({ id: v.id });
  }
  const [row] = await db.insert(schema.levels).values(values).returning({ id: schema.levels.id });
  return c.json({ id: row.id });
});

r.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  // Gỡ cấp độ khỏi người học đang gán rồi mới xóa. PHẢI dọn cả `users`: cột users.level_id
  // KHÔNG có FK nên xóa level mà quên nó thì user giữ con trỏ tới bản ghi đã biến mất →
  // libraryState() không tìm thấy level → thư viện của em trống trơn, không báo lỗi gì.
  await db.update(schema.users).set({ levelId: null }).where(eq(schema.users.levelId, id));
  await db.update(schema.students).set({ levelId: null }).where(eq(schema.students.levelId, id));
  await db.delete(schema.levels).where(eq(schema.levels.id, id));
  return c.json({ ok: true });
});

export default r;
