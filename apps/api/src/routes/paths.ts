// ============================================================
//  Route GIÁO VIÊN — quản lý "lộ trình" của từng level cho user công khai.
//  Level = 1 lộ trình; gồm các CHẶNG (khung) xếp thứ tự; mỗi chặng chứa bài
//  đã sắp; mỗi bài thuộc đúng 1 chặng. Lưu vào exercises.stage_id + path_order.
//  Engine gạn giọt (lib/learningPath.ts) đọc path_order.
// ============================================================
import { Hono } from "hono";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

/** Toàn bộ trạng thái lộ trình của 1 level: chặng + bài (đã sắp). */
r.get("/:levelId", async (c) => {
  const db = getDb(c.env.DB);
  const levelId = c.req.param("levelId");

  const level = await db.query.levels.findFirst({ where: eq(schema.levels.id, levelId) });
  if (!level) throw new HTTPException(404, { message: "Không tìm thấy cấp độ" });

  const stages = await db
    .select({ id: schema.pathStages.id, title: schema.pathStages.title, position: schema.pathStages.position })
    .from(schema.pathStages)
    .where(eq(schema.pathStages.levelId, levelId))
    .orderBy(asc(schema.pathStages.position));

  // Bài của level (bỏ đọc-to — không vào thư viện public). Sắp theo path_order rồi createdAt.
  const items = await db
    .select({
      exercise_id: schema.exercises.exerciseId,
      title: schema.exercises.title,
      skill: schema.exercises.skill,
      tags: schema.exercises.tags,
      published: schema.exercises.published,
      stage_id: schema.exercises.stageId,
      path_order: schema.exercises.pathOrder,
    })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.level, level.name),
        eq(schema.exercises.readAloud, false),
        isNull(schema.exercises.deletedAt),
      ),
    )
    .orderBy(
      sql`${schema.exercises.pathOrder} is null`,
      asc(schema.exercises.pathOrder),
      asc(schema.exercises.createdAt),
    );

  return c.json({ level: { id: level.id, name: level.name }, stages, items });
});

/** Tạo chặng mới (đặt cuối). */
r.post("/:levelId/stages", async (c) => {
  const db = getDb(c.env.DB);
  const levelId = c.req.param("levelId");
  const body = await c.req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  if (!title) throw new HTTPException(400, { message: "Cần nhập tên chặng" });

  const level = await db.query.levels.findFirst({ where: eq(schema.levels.id, levelId) });
  if (!level) throw new HTTPException(404, { message: "Không tìm thấy cấp độ" });

  // Đặt cuối: position = max hiện tại + 1.
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`coalesce(max(${schema.pathStages.position}), -1)` })
    .from(schema.pathStages)
    .where(eq(schema.pathStages.levelId, levelId));

  const [row] = await db
    .insert(schema.pathStages)
    .values({ levelId, title, position: (maxPos ?? -1) + 1 })
    .returning({ id: schema.pathStages.id });
  return c.json({ id: row.id });
});

/** Đổi tên chặng. */
r.patch("/stages/:stageId", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  if (!title) throw new HTTPException(400, { message: "Cần nhập tên chặng" });
  await db.update(schema.pathStages).set({ title }).where(eq(schema.pathStages.id, c.req.param("stageId")));
  return c.json({ ok: true });
});

/** Xóa chặng — bài trong chặng trở về "chưa xếp" (stage_id + path_order = null). */
r.delete("/stages/:stageId", async (c) => {
  const db = getDb(c.env.DB);
  const stageId = c.req.param("stageId");
  await db.batch([
    // SQLite ALTER ADD không kèm ON DELETE → tự gỡ bài khỏi chặng.
    db
      .update(schema.exercises)
      .set({ stageId: null, pathOrder: null })
      .where(eq(schema.exercises.stageId, stageId)),
    db.delete(schema.pathStages).where(eq(schema.pathStages.id, stageId)),
  ]);
  return c.json({ ok: true });
});

/**
 * Lưu bố cục lộ trình:
 *  - `stages`: mảng stageId theo thứ tự mới (cập nhật position).
 *  - `staged`: các bài ĐÃ XẾP theo thứ tự toàn cục (đã trải phẳng qua các chặng) —
 *    mỗi phần tử {exercise_id, stage_id}. Gán stage_id + path_order = chỉ số.
 *  - Bài của level KHÔNG có trong `staged` → chưa xếp (stage_id + path_order = null).
 */
r.put("/:levelId/layout", async (c) => {
  const db = getDb(c.env.DB);
  const levelId = c.req.param("levelId");
  const body = await c.req.json().catch(() => ({}));
  const stageOrder: string[] = Array.isArray(body?.stages) ? body.stages : [];
  const staged: { exercise_id: string; stage_id: string }[] = Array.isArray(body?.staged) ? body.staged : [];

  const level = await db.query.levels.findFirst({ where: eq(schema.levels.id, levelId) });
  if (!level) throw new HTTPException(404, { message: "Không tìm thấy cấp độ" });

  // Chặng hợp lệ của level.
  const stageRows = await db
    .select({ id: schema.pathStages.id })
    .from(schema.pathStages)
    .where(eq(schema.pathStages.levelId, levelId));
  const validStages = new Set(stageRows.map((s) => s.id));

  // Bài hợp lệ của level (slug → cho phép gán).
  const exRows = await db
    .select({ exerciseId: schema.exercises.exerciseId })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.level, level.name), isNull(schema.exercises.deletedAt)));
  const validEx = new Set(exRows.map((e) => e.exerciseId));

  const ops: any[] = [];

  // 1) Cập nhật thứ tự chặng.
  stageOrder.forEach((id, i) => {
    if (validStages.has(id)) {
      ops.push(db.update(schema.pathStages).set({ position: i }).where(eq(schema.pathStages.id, id)));
    }
  });

  // 2) Reset toàn bộ bài của level về "chưa xếp" trước.
  ops.push(
    db
      .update(schema.exercises)
      .set({ stageId: null, pathOrder: null })
      .where(eq(schema.exercises.level, level.name)),
  );

  // 3) Áp các bài đã xếp: stage_id + path_order theo thứ tự toàn cục.
  let order = 0;
  for (const it of staged) {
    if (!validEx.has(it.exercise_id) || !validStages.has(it.stage_id)) continue;
    ops.push(
      db
        .update(schema.exercises)
        .set({ stageId: it.stage_id, pathOrder: order++ })
        .where(eq(schema.exercises.exerciseId, it.exercise_id)),
    );
  }

  if (ops.length) await db.batch(ops as [any, ...any[]]);
  return c.json({ ok: true, staged: order });
});

export default r;
