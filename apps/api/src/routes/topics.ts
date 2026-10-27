// Route GIÁO VIÊN — quản lý CHỦ ĐỀ (topic) của bài tập. Mẫu giống levels.
// Chủ đề là global (cắt ngang level/kỹ năng); gắn vào exercises.topic_id;
// user công khai chọn chủ đề quan tâm để cá nhân hóa.
import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { topicInputSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import { topicOut } from "../lib/serialize";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.topics)
    // Sắp theo position; hoà thì theo thời điểm tạo.
    .orderBy(asc(schema.topics.position), asc(schema.topics.createdAt));
  return c.json({ items: rows.map(topicOut) });
});

r.post("/", async (c) => {
  const parsed = topicInputSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const v = parsed.data;
  const db = getDb(c.env.DB);
  // parent_id: chủ đề con của topic khác. Không cho tự làm cha của chính nó, và giữ cây 2 CẤP
  // (cha phải là topic gốc — parentId null) để tránh lồng sâu.
  let parentId: string | null = v.parent_id && v.parent_id !== v.id ? v.parent_id : null;
  if (parentId) {
    const p = await db.query.topics.findFirst({ where: eq(schema.topics.id, parentId) });
    if (!p || p.parentId) parentId = null; // cha không tồn tại hoặc đã là con → coi như topic gốc
  }
  const values = { name: v.name.trim(), color: v.color || "#06b6d4", icon: v.icon || null, parentId, position: v.position ?? 0 };
  if (v.id) {
    await db.update(schema.topics).set(values).where(eq(schema.topics.id, v.id));
    return c.json({ id: v.id });
  }
  const [row] = await db.insert(schema.topics).values(values).returning({ id: schema.topics.id });
  return c.json({ id: row.id });
});

r.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  // Gỡ chủ đề khỏi bài đang gắn rồi mới xóa (ALTER ADD không bắt được ON DELETE set null).
  await db.update(schema.exercises).set({ topicId: null }).where(eq(schema.exercises.topicId, id));
  // Chủ đề con của topic này → nâng lên topic gốc (parentId null) để không mồ côi.
  await db.update(schema.topics).set({ parentId: null }).where(eq(schema.topics.parentId, id));
  await db.delete(schema.topics).where(eq(schema.topics.id, id));
  return c.json({ ok: true });
});

export default r;
