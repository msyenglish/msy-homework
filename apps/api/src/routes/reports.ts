// Route GIÁO VIÊN — báo cáo học tập tháng đã lưu (list / lưu / xóa).
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { reportSaveSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import type { Db } from "../db";
import { computeReportStats, monthRange } from "../lib/queries";
import { runAiTask } from "../lib/ai/hub";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

/** Bỏ dấu tiếng Việt + chuyển thành slug an toàn cho URL. */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** vd ("Minh An", "2026-07") → "minh-an-monthly-report-7-2026". */
function baseSlug(name: string, month: string): string {
  const [year, mm] = month.split("-");
  const base = slugify(name) || "hoc-sinh";
  return `${base}-monthly-report-${Number(mm) || mm}-${year}`;
}

/** Tìm slug chưa dùng (thêm -2, -3… nếu trùng), bỏ qua chính báo cáo hiện tại. */
async function uniqueSlug(db: Db, name: string, month: string, selfId?: string): Promise<string> {
  const base = baseSlug(name, month);
  let slug = base;
  let n = 2;
  // Vòng lặp hữu hạn thực tế (số báo cáo trùng tên+tháng rất ít).
  while (true) {
    const hit = await db.query.reports.findFirst({ where: eq(schema.reports.slug, slug) });
    if (!hit || hit.id === selfId) return slug;
    slug = `${base}-${n++}`;
  }
}

/** Danh sách báo cáo đã lưu (kèm tên học sinh). Lọc tùy chọn theo ?student= và ?month=. */
r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const student = c.req.query("student");
  const user = c.req.query("user");
  const month = c.req.query("month");
  const conds = [
    student ? eq(schema.reports.studentId, student) : undefined,
    user ? eq(schema.reports.userId, user) : undefined,
    month ? eq(schema.reports.month, month) : undefined,
  ].filter(Boolean) as any[];

  // LEFT join cả hai bảng danh tính: báo cáo mới gắn `user_id`, báo cáo cũ gắn `student_id`.
  // `studentName` là tên hiển thị, lấy bên nào có — phần còn lại của route không cần biết
  // báo cáo thuộc thế giới nào.
  const raw = await db
    .select({
      id: schema.reports.id,
      studentId: schema.reports.studentId,
      userId: schema.reports.userId,
      sName: schema.students.name,
      uName: schema.users.name,
      uEmail: schema.users.email,
      month: schema.reports.month,
      content: schema.reports.content,
      slug: schema.reports.slug,
      createdAt: schema.reports.createdAt,
      updatedAt: schema.reports.updatedAt,
    })
    .from(schema.reports)
    .leftJoin(schema.students, eq(schema.reports.studentId, schema.students.id))
    .leftJoin(schema.users, eq(schema.reports.userId, schema.users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.reports.month));

  const rows = raw
    .map(({ sName, uName, uEmail, ...r }) => ({
      ...r,
      studentName: sName ?? uName ?? uEmail ?? "(không rõ)",
    }))
    .sort((a, b) => (a.month === b.month ? a.studentName.localeCompare(b.studentName) : 0));

  // Backfill slug cho báo cáo cũ (một lần) để link công khai luôn đẹp.
  const used = new Set(rows.map((x) => x.slug).filter(Boolean) as string[]);
  for (const row of rows) {
    if (row.slug) continue;
    let slug = baseSlug(row.studentName, row.month);
    let n = 2;
    while (used.has(slug)) slug = `${baseSlug(row.studentName, row.month)}-${n++}`;
    used.add(slug);
    await db.update(schema.reports).set({ slug }).where(eq(schema.reports.id, row.id));
    row.slug = slug;
  }

  return c.json({ items: rows });
});

/** Lưu (upsert) báo cáo cho 1 (học sinh, tháng). */
r.post("/", async (c) => {
  const parsed = reportSaveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  }
  const v = parsed.data;
  const db = getDb(c.env.DB);

  // Chủ nhân: user (thành viên lớp) hoặc student cũ — zod đã đảm bảo đúng một.
  const owner = v.user_id ? { userId: v.user_id } : { studentId: v.student_id! };
  let learnerName: string;
  if (owner.userId) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, owner.userId) });
    if (!u) throw new HTTPException(404, { message: "Không tìm thấy người học" });
    learnerName = u.name || u.email;
  } else {
    const s = await db.query.students.findFirst({ where: eq(schema.students.id, owner.studentId!) });
    if (!s) throw new HTTPException(404, { message: "Không tìm thấy học sinh" });
    learnerName = s.name;
  }

  const existing = await db.query.reports.findFirst({
    where: and(
      owner.userId ? eq(schema.reports.userId, owner.userId) : eq(schema.reports.studentId, owner.studentId!),
      eq(schema.reports.month, v.month),
    ),
  });
  const slug = existing?.slug || (await uniqueSlug(db, learnerName, v.month, existing?.id));
  const now = new Date().toISOString();

  // Đóng băng số liệu THẬT của tháng ngay lúc lưu → chart trên trang công khai khớp văn bản.
  const { from, to } = monthRange(v.month);
  const stats = await computeReportStats(db, owner, from, to);

  // Gom câu sai thành "trọng tâm cần luyện" (định tính). Không chặn lưu nếu AI lỗi/chưa cấu hình.
  if (stats.mistakes.length) {
    try {
      const { focus } = await runAiTask<{ focus: { topic: string; note: string }[] }>(
        c.env,
        "report_focus",
        { student_name: learnerName, mistakes: stats.mistakes },
      );
      if (focus.length) stats.focus = focus;
    } catch {
      // bỏ qua — báo cáo vẫn lưu bình thường, chỉ thiếu phần trọng tâm.
    }
  }

  // Upsert theo tay: `onConflictDoUpdate` cần một target cố định, mà ở đây khóa duy nhất
  // là (user_id, month) HOẶC (student_id, month) tùy chủ nhân — hai index khác nhau.
  const set = { content: v.content, stats, slug, updatedAt: now };
  if (existing) {
    await db.update(schema.reports).set(set).where(eq(schema.reports.id, existing.id));
    return c.json({ id: existing.id, slug });
  }
  const [row] = await db
    .insert(schema.reports)
    .values({ studentId: owner.studentId ?? null, userId: owner.userId ?? null, month: v.month, ...set })
    .returning({ id: schema.reports.id, slug: schema.reports.slug });
  return c.json({ id: row.id, slug: row.slug });
});

r.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  await db.delete(schema.reports).where(eq(schema.reports.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default r;
