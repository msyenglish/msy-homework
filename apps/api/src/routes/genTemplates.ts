// Route GIÁO VIÊN — lưu/nạp TEMPLATE lựa chọn của AI Composer (cloud, thay localStorage).
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db";
import type { AppEnv } from "../lib/env";

const now = () => new Date().toISOString();
const r = new Hono<AppEnv>();

r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(schema.genTemplates).orderBy(desc(schema.genTemplates.updatedAt));
  return c.json({ items: rows.map((t) => ({ id: t.id, name: t.name, config: t.config })) });
});

// Lưu (upsert theo TÊN — trùng tên thì ghi đè).
r.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; config?: unknown };
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) throw new HTTPException(400, { message: "Cần tên template" });
  const config = (body?.config && typeof body.config === "object" ? body.config : {}) as Record<string, unknown>;
  const db = getDb(c.env.DB);
  const existing = await db.query.genTemplates.findFirst({ where: eq(schema.genTemplates.name, name) });
  if (existing) {
    await db.update(schema.genTemplates).set({ config, updatedAt: now() }).where(eq(schema.genTemplates.id, existing.id));
    return c.json({ id: existing.id });
  }
  const [row] = await db.insert(schema.genTemplates).values({ name, config }).returning({ id: schema.genTemplates.id });
  return c.json({ id: row.id });
});

r.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.genTemplates).where(eq(schema.genTemplates.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default r;
