// Route GIÁO VIÊN — bề mặt LỊCH SỬ của học sinh cũ (bảng `students`, đã nghỉ hưu).
// Học sinh ĐANG HỌC ở /teacher/classes/students + /teacher/users
// Chỉ giữ đủ để ReportsPage viết báo cáo tháng cho các em đã chuyển đi.
import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db";
import { levelOut, studentOut } from "../lib/serialize";
import { computeReportStats, getMistakes } from "../lib/queries";
import { runAiTask } from "../lib/ai/hub";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

// Ngưỡng "điểm thấp" (đồng bộ với StudentReminderMenu ở web).
const LOW_PCT = 40;

r.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const [rows, assigns, subs] = await Promise.all([
    db
      .select({ student: schema.students, level: schema.levels })
      .from(schema.students)
      .leftJoin(schema.levels, eq(schema.students.levelId, schema.levels.id))
      .orderBy(asc(schema.students.name)),
    // Tất cả bài đã giao (studentId, exerciseId) — để đếm bài chưa làm.
    db
      .select({ studentId: schema.assignments.studentId, exerciseId: schema.assignments.exerciseId })
      .from(schema.assignments),
    // Tất cả lượt nộp — lấy điểm bài mới nhất mỗi (học sinh, bài).
    db
      .select({
        studentId: schema.submissions.studentId,
        exerciseId: schema.submissions.exerciseId,
        score: schema.submissions.score,
        total: schema.submissions.total,
        submittedAt: schema.submissions.submittedAt,
      })
      .from(schema.submissions)
      .orderBy(desc(schema.submissions.submittedAt)),
  ]);

  // Bài mới nhất (đã nộp) theo key student|exercise.
  const latest = new Map<string, { score: number; total: number }>();
  for (const s of subs) {
    if (!s.studentId) continue;
    const key = `${s.studentId}|${s.exerciseId}`;
    if (!latest.has(key)) latest.set(key, { score: s.score, total: s.total }); // đã sort desc
  }

  // Gom thống kê theo học sinh.
  const stats = new Map<string, { assigned: number; notDone: number; low: number }>();
  for (const a of assigns) {
    const st = stats.get(a.studentId) ?? { assigned: 0, notDone: 0, low: 0 };
    st.assigned += 1;
    const last = latest.get(`${a.studentId}|${a.exerciseId}`);
    if (!last) st.notDone += 1;
    else if (last.total > 0 && (last.score / last.total) * 100 < LOW_PCT) st.low += 1;
    stats.set(a.studentId, st);
  }

  return c.json({
    items: rows.map((r) => ({
      ...studentOut(r.student, r.level ? levelOut(r.level) : null),
      stats: stats.get(r.student.id) ?? { assigned: 0, notDone: 0, low: 0 },
    })),
  });
});

r.get("/:id/mistakes", async (c) => {
  const mistakes = await getMistakes(
    getDb(c.env.DB),
    { studentId: c.req.param("id") },
    c.req.query("from") || "1970-01-01",
    c.req.query("to") || "2999-01-01",
  );
  return c.json({ mistakes });
});

/** AI tạo BÁO CÁO HỌC TẬP THÁNG: tổng hợp hoạt động + câu sai rồi gọi hub. */
r.post("/:id/ai-report", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as {
    from?: string;
    to?: string;
    month?: string;
    teacher_note?: string;
  };
  const from = body.from || "1970-01-01";
  const to = body.to || "2999-01-01";

  const student = await db.query.students.findFirst({
    where: eq(schema.students.id, c.req.param("id")),
  });
  if (!student) throw new HTTPException(404, { message: "Không tìm thấy học sinh" });

  // Thống kê THẬT trong khoảng thời gian (dùng chung với snapshot lúc lưu báo cáo).
  const { timeline: _tl, mistakes, ...summary } = await computeReportStats(
    db,
    { studentId: c.req.param("id") },
    from,
    to,
  );

  const out = await runAiTask<{ report: string }>(c.env, "monthly_report", {
    student_name: student.name,
    month: body.month || "",
    teacher_note: body.teacher_note || null,
    summary,
    mistakes,
  });

  return c.json({ report: out.report });
});

export default r;
