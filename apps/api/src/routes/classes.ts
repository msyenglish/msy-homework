// ============================================================
//  Route GIÁO VIÊN — LỚP HỌC. Lớp là lớp phủ QUYỀN lên `users`, không phải bảng người
//  dùng thứ hai: "học sinh của cô" = user có mặt trong `class_members`.
// ============================================================
import { Hono } from "hono";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { classEnrollSchema, classMemberAddSchema, classSchema, type Classroom } from "@msyen/shared";
import { getDb, schema } from "../db";
import { hashPassword } from "../lib/password";
import { genCode, uniqueCode } from "../lib/shortCode";
import { userOut } from "../lib/serialize";
import type { AppEnv } from "../lib/env";

const classes = new Hono<AppEnv>();

/** One class member as the teacher sees them. */
export interface ClassMemberRow {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  level_id: string | null;
  active: boolean;
  joined_at: string;
}

const classOut = (c: typeof schema.classes.$inferSelect, memberCount?: number): Classroom => ({
  id: c.id,
  name: c.name,
  note: c.note ?? null,
  join_code: c.joinCode ?? null,
  active: c.active,
  member_count: memberCount,
  created_at: c.createdAt,
});

// ---- Lớp ----

/** Danh sách lớp + sĩ số. */
classes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const [rows, counts] = await Promise.all([
    db.select().from(schema.classes).orderBy(desc(schema.classes.createdAt)),
    db
      .select({ classId: schema.classMembers.classId, n: sql<number>`count(*)` })
      .from(schema.classMembers)
      .groupBy(schema.classMembers.classId),
  ]);
  const byId = new Map(counts.map((r) => [r.classId, Number(r.n)]));
  return c.json({ items: rows.map((r) => classOut(r, byId.get(r.id) ?? 0)) });
});

classes.post("/", async (c) => {
  const parsed = classSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const joinCode = await uniqueCode(async (code) =>
    !!(await db.query.classes.findFirst({ where: eq(schema.classes.joinCode, code) })),
  );
  const [row] = await db
    .insert(schema.classes)
    .values({ name: parsed.data.name, note: parsed.data.note ?? null, joinCode })
    .returning();
  return c.json({ class: classOut(row, 0) }, 201);
});

classes.patch("/:id", async (c) => {
  const parsed = classSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const patch: Partial<typeof schema.classes.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.note !== undefined) patch.note = parsed.data.note ?? null;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  const [row] = await db.update(schema.classes).set(patch).where(eq(schema.classes.id, c.req.param("id"))).returning();
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy lớp" });
  return c.json({ class: classOut(row) });
});

// Deleting a class only cascades into `class_members`: the learners keep their accounts and
// progress, they just lose the class rights. To pause a class instead, set active=false.
classes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.classes).where(eq(schema.classes.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ---- Thành viên ----

classes.get("/:id/members", async (c) => {
  const db = getDb(c.env.DB);
  const cls = await db.query.classes.findFirst({ where: eq(schema.classes.id, c.req.param("id")) });
  if (!cls) throw new HTTPException(404, { message: "Không tìm thấy lớp" });

  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      avatarUrl: schema.users.avatarUrl,
      levelId: schema.users.levelId,
      active: schema.users.active,
      joinedAt: schema.classMembers.joinedAt,
    })
    .from(schema.classMembers)
    .innerJoin(schema.users, eq(schema.classMembers.userId, schema.users.id))
    .where(eq(schema.classMembers.classId, cls.id))
    .orderBy(desc(schema.classMembers.joinedAt));

  const items: ClassMemberRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatar_url: r.avatarUrl ?? null,
    level_id: r.levelId,
    active: r.active,
    joined_at: r.joinedAt,
  }));
  return c.json({ class: classOut(cls, items.length), items });
});

/**
 * ENROLL A STUDENT — email-first:
 *  · email already has an account → just add it to the class.
 *  · email unknown → create the user here (`name` required; password generated when blank).
 * A generated password is returned ONCE so the teacher can hand it over — it is the learner's
 * only way in, and the server keeps no plaintext copy.
 */
classes.post("/:id/members", async (c) => {
  const parsed = classEnrollSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const cls = await db.query.classes.findFirst({ where: eq(schema.classes.id, c.req.param("id")) });
  if (!cls) throw new HTTPException(404, { message: "Không tìm thấy lớp" });
  const d = parsed.data;
  const email = d.email.trim().toLowerCase();

  let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  let created = false;
  let password: string | null = null;
  if (!user) {
    // Unknown email → create. Name is required (the form reveals that field on no match).
    if (!d.name?.trim()) throw new HTTPException(400, { message: "Email chưa có tài khoản — nhập tên để tạo học sinh mới" });
    password = d.password ?? genCode(8);
    [user] = await db
      .insert(schema.users)
      .values({
        email,
        passwordHash: await hashPassword(password),
        provider: "password",
        name: d.name.trim(),
        levelId: d.level_id || null,
      })
      .returning();
    created = true;
  }

  await db.insert(schema.classMembers).values({ classId: cls.id, userId: user.id }).onConflictDoNothing();
  return c.json({ member: userOut(user), created, password }, 201);
});

/** Xếp một user ĐÃ CÓ (em tự đăng ký trước) vào lớp. */
classes.post("/:id/members/link", async (c) => {
  const parsed = classMemberAddSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Thiếu user" });
  const db = getDb(c.env.DB);
  const cls = await db.query.classes.findFirst({ where: eq(schema.classes.id, c.req.param("id")) });
  if (!cls) throw new HTTPException(404, { message: "Không tìm thấy lớp" });
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, parsed.data.user_id) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy người dùng" });

  await db.insert(schema.classMembers).values({ classId: cls.id, userId: user.id }).onConflictDoNothing();
  return c.json({ ok: true });
});

/** Đưa một em ra khỏi lớp — KHÔNG xóa tài khoản, chỉ gỡ tư cách thành viên. */
classes.delete("/:id/members/:userId", async (c) => {
  const db = getDb(c.env.DB);
  await db
    .delete(schema.classMembers)
    .where(
      and(eq(schema.classMembers.classId, c.req.param("id")), eq(schema.classMembers.userId, c.req.param("userId"))),
    );
  return c.json({ ok: true });
});

// ---- Giao bài cho lớp ----

/** Các bài đang giao cho lớp (trả slug để khớp với danh sách bài ở web). */
classes.get("/:id/assignments", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ slug: schema.exercises.exerciseId, note: schema.classAssignments.teacherNote })
    .from(schema.classAssignments)
    .innerJoin(schema.exercises, eq(schema.classAssignments.exerciseId, schema.exercises.id))
    .where(eq(schema.classAssignments.classId, c.req.param("id")));
  return c.json({ slugs: rows.map((r) => r.slug), note: rows[0]?.note ?? null });
});

/**
 * Thay TOÀN BỘ danh sách bài giao cho lớp (replace-set): bài không còn trong `slugs` sẽ bị
 * gỡ. Đây là ngữ nghĩa của màn tick chọn — cô nhìn thấy trạng thái nào thì lưu đúng thế.
 * Gỡ bài KHÔNG xóa lượt nộp của các em; chỉ mất quyền vào lại bài đó.
 */
classes.put("/:id/assignments", async (c) => {
  const db = getDb(c.env.DB);
  const cls = await db.query.classes.findFirst({ where: eq(schema.classes.id, c.req.param("id")) });
  if (!cls) throw new HTTPException(404, { message: "Không tìm thấy lớp" });
  const body = (await c.req.json().catch(() => ({}))) as { slugs?: string[]; note?: string | null };
  const slugs = Array.isArray(body.slugs) ? body.slugs.filter((s) => typeof s === "string") : [];

  const exs = slugs.length
    ? await db.select({ id: schema.exercises.id }).from(schema.exercises).where(inArray(schema.exercises.exerciseId, slugs))
    : [];

  await db.delete(schema.classAssignments).where(eq(schema.classAssignments.classId, cls.id));
  if (exs.length) {
    await db.insert(schema.classAssignments).values(
      exs.map((e) => ({ classId: cls.id, exerciseId: e.id, teacherNote: body.note ?? null })),
    );
  }
  return c.json({ ok: true, count: exs.length });
});

export default classes;
