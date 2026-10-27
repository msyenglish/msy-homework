// ============================================================
//  Teacher · LEARNERS: every account, whether or not it is in a class (classes are a label and a
//  filter, not a separate kind of user). List + activity + points + classes + assigned work.
// ============================================================
import { Hono } from "hono";
import { and, desc, eq, inArray, isNotNull, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { pointScopeKey, quizPoints, recordPoints, teacherUserCreateSchema, type Level, type PublicUser } from "@msyen/shared";
import { getDb, schema } from "../db";
import { hashPassword } from "../lib/password";
import { genCode } from "../lib/shortCode";
import { revokeNow } from "../lib/session";
import { levelOut, userOut } from "../lib/serialize";
import { getUserAnalytics } from "../lib/analytics";
import { computeReportStats, getMistakes, getUserProgress } from "../lib/queries";
import { runAiTask } from "../lib/ai/hub";
import type { AppEnv } from "../lib/env";

const teacherUsers = new Hono<AppEnv>();

export interface TeacherUserRow extends PublicUser {
  active: boolean;
  exercises_done: number;
  attempts: number;
  points: number;
  last_seen_at: string | null; // last authenticated API call (ISO); null = never recorded
  classes: { id: string; name: string }[];
  assigned: number; // exercises assigned to the learner (directly or through an active class)
  not_done: number; // of those, never submitted
}

/** `last_seen_at` window for each activity filter, in minutes (null = never active). */
const ACTIVITY_WINDOW_MINUTES: Record<string, number> = {
  online: 5,
  today: 24 * 60,
  week: 7 * 24 * 60,
};

/**
 * Danh sách user công khai + hoạt động (số bài, số lượt, điểm ảo).
 * LỌC + PHÂN TRANG Ở SERVER; điểm chỉ gộp cho user CỦA TRANG (trước đây quét toàn bộ lượt nộp
 * của mọi user cho mỗi lần mở trang). Không truyền `per_page` → trả tất cả (tương thích cũ).
 * Query: q · provider · status(active|inactive) · level(<id>|none) · class_id(<id>|any|none) ·
 * activity(online|today|week|inactive) · sort(seen) · page · per_page.
 */
teacherUsers.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const qs = c.req.query();
  const kw = (qs.q ?? "").trim().toLowerCase();
  const perPage = Math.min(Math.max(Number(qs.per_page) || 0, 0), 200);
  const page = Math.max(Number(qs.page) || 1, 1);

  const filters: SQL[] = [isNull(schema.users.deletedAt)];
  if (kw)
    filters.push(
      sql`(lower(${schema.users.email}) like ${"%" + kw + "%"} or lower(coalesce(${schema.users.name}, '')) like ${"%" + kw + "%"})`,
    );
  if (qs.provider) filters.push(eq(schema.users.provider, qs.provider));
  if (qs.status === "active") filters.push(eq(schema.users.active, true));
  if (qs.status === "inactive") filters.push(eq(schema.users.active, false));
  if (qs.level === "none") filters.push(isNull(schema.users.levelId));
  else if (qs.level) filters.push(eq(schema.users.levelId, qs.level));
  if (qs.class_id === "any")
    filters.push(sql`exists (select 1 from class_members cm where cm.user_id = ${schema.users.id})`);
  else if (qs.class_id === "none")
    filters.push(sql`not exists (select 1 from class_members cm where cm.user_id = ${schema.users.id})`);
  else if (qs.class_id)
    filters.push(
      sql`exists (select 1 from class_members cm where cm.user_id = ${schema.users.id} and cm.class_id = ${qs.class_id})`,
    );
  // Activity filter — presence window on `last_seen_at`; "inactive" = never seen or > 30 days.
  const activityWindow = ACTIVITY_WINDOW_MINUTES[qs.activity ?? ""];
  if (activityWindow)
    filters.push(sql`${schema.users.lastSeenAt} >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ${`-${activityWindow} minutes`})`);
  else if (qs.activity === "inactive")
    filters.push(
      sql`(${schema.users.lastSeenAt} is null or ${schema.users.lastSeenAt} < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days'))`,
    );

  const rows = await db
    .select()
    .from(schema.users)
    .where(and(...filters))
    // NULL `last_seen_at` sorts last under SQLite's DESC ordering — never-seen accounts fall to the end.
    .orderBy(qs.sort === "seen" ? desc(schema.users.lastSeenAt) : desc(schema.users.createdAt))
    .limit(perPage || -1)
    .offset(perPage ? (page - 1) * perPage : 0);

  const ids = rows.map((u) => u.id);
  const inPage = <T extends AnyColumn>(col: T) => (ids.length ? inArray(col, ids) : sql`0 = 1`);

  const [levels, subs, reads, vocabs, [cnt], [all], members, byClass, byUser] = await Promise.all([
    db.select().from(schema.levels),
    db
      .select({ userId: schema.submissions.userId, exerciseId: schema.submissions.exerciseId, score: schema.submissions.score, hintUsed: schema.submissions.hintUsed, points: schema.submissions.points })
      .from(schema.submissions)
      .where(and(isNotNull(schema.submissions.userId), inPage(schema.submissions.userId))),
    db
      .select({ userId: schema.readingSubmissions.userId, exerciseId: schema.readingSubmissions.exerciseId, score: schema.readingSubmissions.pronScore, points: schema.readingSubmissions.points, audioKey: schema.readingSubmissions.audioKey })
      .from(schema.readingSubmissions)
      .where(and(isNotNull(schema.readingSubmissions.userId), inPage(schema.readingSubmissions.userId))),
    // Vocab sessions: deck exercises (exercise_id set) and self-practice. Points = memory progress.
    db
      .select({ id: schema.vocabSubmissions.id, userId: schema.vocabSubmissions.userId, exerciseId: schema.vocabSubmissions.exerciseId, score: schema.vocabSubmissions.score, total: schema.vocabSubmissions.total, points: schema.vocabSubmissions.points })
      .from(schema.vocabSubmissions)
      .where(and(isNotNull(schema.vocabSubmissions.userId), inPage(schema.vocabSubmissions.userId))),
    db.select({ n: sql<number>`count(*)` }).from(schema.users).where(and(...filters)),
    // Thống kê hero: đếm trên TOÀN bộ tài khoản, không đổi theo bộ lọc/trang.
    db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${schema.users.active} then 1 else 0 end)`,
        email: sql<number>`sum(case when ${schema.users.provider} = 'password' then 1 else 0 end)`,
        google: sql<number>`sum(case when ${schema.users.provider} = 'google' then 1 else 0 end)`,
        no_level: sql<number>`sum(case when ${schema.users.levelId} is null then 1 else 0 end)`,
        online: sql<number>`sum(case when ${schema.users.lastSeenAt} >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes') then 1 else 0 end)`,
        in_class: sql<number>`sum(case when exists (select 1 from class_members cm where cm.user_id = ${schema.users.id}) then 1 else 0 end)`,
      })
      .from(schema.users)
      .where(isNull(schema.users.deletedAt)),
    db
      .select({ userId: schema.classMembers.userId, id: schema.classes.id, name: schema.classes.name })
      .from(schema.classMembers)
      .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
      .where(inPage(schema.classMembers.userId))
      .orderBy(schema.classes.name),
    db
      .select({ userId: schema.classMembers.userId, exerciseId: schema.classAssignments.exerciseId })
      .from(schema.classMembers)
      .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
      .innerJoin(schema.classAssignments, eq(schema.classAssignments.classId, schema.classes.id))
      .where(and(eq(schema.classes.active, true), inPage(schema.classMembers.userId))),
    db
      .select({ userId: schema.userAssignments.userId, exerciseId: schema.userAssignments.exerciseId })
      .from(schema.userAssignments)
      .where(inPage(schema.userAssignments.userId)),
  ]);

  const classesBy = new Map<string, { id: string; name: string }[]>();
  for (const m of members) classesBy.set(m.userId, [...(classesBy.get(m.userId) ?? []), { id: m.id, name: m.name }]);
  const assignedBy = new Map<string, Set<string>>();
  for (const a of [...byClass, ...byUser]) assignedBy.set(a.userId, (assignedBy.get(a.userId) ?? new Set()).add(a.exerciseId));
  const done = new Set<string>();
  for (const s of [...subs, ...reads]) if (s.userId) done.add(`${s.userId}|${s.exerciseId}`);
  for (const v of vocabs) if (v.userId && v.exerciseId) done.add(`${v.userId}|${v.exerciseId}`);

  const levelById = new Map<string, Level>(levels.map((l) => [l.id, levelOut(l)]));

  // Gộp theo user: điểm CAO NHẤT mỗi bài (best-per-exercise) → điểm ảo + số bài. Cả 3 kỹ năng
  // (quiz + đọc-to + nói) đều tính; `points` đã quy đổi theo loại. Bài id duy nhất giữa 3 nguồn.
  const bestByUser = new Map<string, Map<string, number>>();
  const attemptsByUser = new Map<string, number>();
  const addPts = (userId: string | null, exId: string, points: number) => {
    if (!userId) return;
    attemptsByUser.set(userId, (attemptsByUser.get(userId) ?? 0) + 1);
    const perEx = bestByUser.get(userId) ?? new Map<string, number>();
    perEx.set(exId, Math.max(perEx.get(exId) ?? 0, points));
    bestByUser.set(userId, perEx);
  };
  for (const s of subs) addPts(s.userId, s.exerciseId, s.points ?? quizPoints(s.score, !!s.hintUsed));
  for (const r of reads) addPts(r.userId, pointScopeKey(r.exerciseId, r.audioKey), r.points ?? recordPoints(r.score));
  // Keyed per SESSION, as on the learner's own stats: memory points add up instead of best-of.
  // Legacy sessions without memory points fall back to quizPoints on deck exercises only.
  for (const v of vocabs) {
    addPts(v.userId, `vocab:${v.id}`, v.points ?? (v.exerciseId ? quizPoints(Math.round((v.score / 100) * v.total)) : 0));
  }

  const items: TeacherUserRow[] = rows.map((u) => {
    const perEx = bestByUser.get(u.id);
    let points = 0;
    if (perEx) for (const p of perEx.values()) points += p;
    return {
      ...userOut(u, u.levelId ? (levelById.get(u.levelId) ?? null) : null),
      active: u.active,
      anonymous: u.anonymous,
      exercises_done: perEx ? perEx.size : 0,
      attempts: attemptsByUser.get(u.id) ?? 0,
      points,
      last_seen_at: u.lastSeenAt,
      classes: classesBy.get(u.id) ?? [],
      assigned: assignedBy.get(u.id)?.size ?? 0,
      not_done: [...(assignedBy.get(u.id) ?? [])].filter((ex) => !done.has(`${u.id}|${ex}`)).length,
    };
  });

  return c.json({
    items,
    total: cnt?.n ?? items.length,
    page: perPage ? page : 1,
    per_page: perPage || (cnt?.n ?? items.length),
    stats: {
      total: all?.total ?? 0,
      active: all?.active ?? 0,
      email: all?.email ?? 0,
      google: all?.google ?? 0,
      no_level: all?.no_level ?? 0,
      online: all?.online ?? 0,
      in_class: all?.in_class ?? 0,
    },
  });
});

/** Teacher creates an account; with `class_id` it is also put in that class. */
teacherUsers.post("/", async (c) => {
  const parsed = teacherUserCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const d = parsed.data;
  const email = d.email.trim().toLowerCase();

  const dup = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (dup) throw new HTTPException(409, { message: "Email đã được đăng ký" });

  // Enrolling? Make sure the class exists before creating anything.
  if (d.class_id) {
    const cls = await db.query.classes.findFirst({ where: eq(schema.classes.id, d.class_id) });
    if (!cls) throw new HTTPException(404, { message: "Không tìm thấy lớp" });
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash: await hashPassword(d.password),
      provider: "password",
      name: d.name,
      levelId: d.level_id || null,
      birthYear: d.birth_year ?? null,
      gender: d.gender ?? null,
    })
    .returning();

  if (d.class_id) {
    await db.insert(schema.classMembers).values({ classId: d.class_id, userId: user.id }).onConflictDoNothing();
  }

  return c.json({ user: userOut(user), enrolled: !!d.class_id }, 201);
});

// Phân tích toàn diện quá trình học của 1 user (giáo viên xem).
teacherUsers.get("/:id/analytics", async (c) => {
  const db = getDb(c.env.DB);
  const data = await getUserAnalytics(db, c.req.param("id"), new Date());
  if (!data) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  return c.json(data);
});

// Update a user account: profile fields, lock/unlock (active), anonymity on the leaderboard.
// active: false → the account can no longer sign in or submit.
teacherUsers.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    active?: unknown;
    name?: unknown;
    email?: unknown;
    level_id?: unknown;
    anonymous?: unknown;
    gender?: unknown;
    birth_year?: unknown;
  };

  const db = getDb(c.env.DB);
  // Load current user first — cần email cũ để ghi lịch sử khi đổi email.
  const current = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!current) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });

  const patch: {
    active?: boolean;
    name?: string | null;
    email?: string;
    levelId?: string | null;
    anonymous?: boolean;
    gender?: string | null;
    birthYear?: number | null;
    sessionsValidFrom?: string;
  } = {};

  // Student profile edited on their behalf: name · level · gender · birth year.
  if (body.name !== undefined) patch.name = typeof body.name === "string" ? body.name.trim() || null : null;
  if (body.gender !== undefined) {
    patch.gender = body.gender === "male" || body.gender === "female" || body.gender === "other" ? body.gender : null;
  }
  if (body.birth_year !== undefined) {
    const y = typeof body.birth_year === "number" ? Math.floor(body.birth_year) : 0;
    patch.birthYear = y >= 1900 && y <= 2100 ? y : null;
  }
  // Đổi email (admin override): áp NGAY + ghi lịch sử. Kiểm định dạng + trùng.
  let emailHistory: { oldEmail: string; newEmail: string } | null = null;
  if (body.email !== undefined) {
    const newEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new HTTPException(400, { message: "Email không hợp lệ" });
    if (newEmail !== current.email) {
      const dup = await db.query.users.findFirst({ where: eq(schema.users.email, newEmail) });
      if (dup && dup.id !== id) throw new HTTPException(409, { message: "Email này đã có người dùng" });
      patch.email = newEmail;
      emailHistory = { oldEmail: current.email, newEmail };
      // Email is a credential and it is baked into the token — force a fresh sign-in.
      patch.sessionsValidFrom = revokeNow();
    }
  }
  if (body.level_id !== undefined) patch.levelId = typeof body.level_id === "string" ? body.level_id || null : null;

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") throw new HTTPException(400, { message: "Trạng thái active không hợp lệ" });
    patch.active = body.active;
    // Locking has to reach devices already signed in, not just the next sign-in attempt.
    if (!body.active) patch.sessionsValidFrom = revokeNow();
  }

  if (body.anonymous !== undefined) {
    if (typeof body.anonymous !== "boolean") throw new HTTPException(400, { message: "Cờ ẩn danh không hợp lệ" });
    patch.anonymous = body.anonymous;
  }

  if (Object.keys(patch).length === 0) {
    throw new HTTPException(400, { message: "Không có thay đổi nào" });
  }

  const [u] = await db.update(schema.users).set(patch).where(eq(schema.users.id, id)).returning();
  if (!u) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  // Ghi lịch sử đổi email (áp ngay: effectiveAt = appliedAt = now).
  if (emailHistory) {
    const now = new Date().toISOString();
    await db.insert(schema.emailChanges).values({
      userId: id,
      oldEmail: emailHistory.oldEmail,
      newEmail: emailHistory.newEmail,
      source: "admin",
      effectiveAt: now,
      appliedAt: now,
    });
  }
  return c.json({ ok: true, active: u.active, anonymous: u.anonymous, email: u.email });
});

/**
 * Teacher-set password reset for one account.
 *
 * The only reset route that works for class kids: their address is a placeholder the school
 * owns, so the emailed reset link never arrives. Body `password` empty → generate a readable
 * one. The plaintext is returned ONCE and never stored; pending email-reset tokens are
 * dropped so an older link cannot undo this.
 * Provider is left untouched: a Google account that gains a password keeps both doors.
 */
teacherUsers.put("/:id/password", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });

  const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
  const typed = typeof body.password === "string" ? body.password.trim() : "";
  if (typed && typed.length < 6) throw new HTTPException(400, { message: "Mật khẩu tối thiểu 6 ký tự" });
  const password = typed || genCode(8);

  // Revoking is the point of a reset: whoever knew the old password is signed out everywhere.
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password), sessionsValidFrom: revokeNow() })
    .where(eq(schema.users.id, id));
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, id));

  return c.json({ password, email: user.email });
});

// Email change history of one user (newest first) — admin view.
teacherUsers.get("/:id/email-history", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.query.emailChanges.findMany({
    where: eq(schema.emailChanges.userId, c.req.param("id")),
    orderBy: desc(schema.emailChanges.createdAt),
  });
  const items = rows.map((r) => ({
    old_email: r.oldEmail,
    new_email: r.newEmail,
    source: r.source as "user" | "admin",
    effective_at: r.effectiveAt,
    applied_at: r.appliedAt,
    canceled_at: r.canceledAt,
    created_at: r.createdAt,
  }));
  return c.json({ items });
});

// ---- THÙNG RÁC tài khoản: xóa mềm → khôi phục / dọn hẳn (cô tự dọn) ----
//
// Xóa = chuyển vào thùng rác (deleted_at = now) + khóa (active = false) để tài khoản KHÔNG
// đăng nhập được / không lên bảng xếp hạng khi đang trong thùng. Khôi phục mở lại (active =
// true). Dọn hẳn mới xóa thật khỏi DB (FK: submissions.user_id → set null; tiến độ → cascade).

/** Danh sách tài khoản trong thùng rác (rút gọn — đủ nhận diện + khôi phục). */
teacherUsers.get("/trash", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      provider: schema.users.provider,
      avatar_url: schema.users.avatarUrl,
      created_at: schema.users.createdAt,
      deleted_at: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(isNotNull(schema.users.deletedAt))
    .orderBy(desc(schema.users.deletedAt));
  return c.json({ items: rows });
});

/** Xóa mềm: chuyển vào thùng rác + khóa tài khoản. */
teacherUsers.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const [u] = await db
    .update(schema.users)
    .set({
      deletedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      active: false,
      sessionsValidFrom: revokeNow(),
    })
    .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
    .returning({ id: schema.users.id });
  if (!u) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  return c.json({ ok: true });
});

/** Khôi phục từ thùng rác (mở lại tài khoản). */
teacherUsers.post("/:id/restore", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const [u] = await db
    .update(schema.users)
    .set({ deletedAt: null, active: true })
    .where(and(eq(schema.users.id, id), isNotNull(schema.users.deletedAt)))
    .returning({ id: schema.users.id });
  if (!u) throw new HTTPException(404, { message: "Không tìm thấy tài khoản trong thùng rác" });
  return c.json({ ok: true });
});

/** Dọn hẳn: xóa thật khỏi DB (chỉ tài khoản đang ở thùng rác). Không thể hoàn tác. */
teacherUsers.delete("/:id/purge", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env.DB);
  const [u] = await db
    .delete(schema.users)
    .where(and(eq(schema.users.id, id), isNotNull(schema.users.deletedAt)))
    .returning({ id: schema.users.id });
  if (!u) throw new HTTPException(404, { message: "Không tìm thấy tài khoản trong thùng rác" });
  return c.json({ ok: true });
});

// ---- Tiến độ + giao bài riêng (trang chi tiết học sinh) ----

/** Toàn cảnh 1 người học: hồ sơ + bài được giao (lớp ∪ riêng) + lịch sử làm bài. */
teacherUsers.get("/:id/progress", async (c) => {
  const data = await getUserProgress(getDb(c.env.DB), c.req.param("id"));
  if (!data) throw new HTTPException(404, { message: "Không tìm thấy người học" });
  return c.json(data);
});

/** Bài cô giao RIÊNG cho em này (không tính bài của lớp). */
teacherUsers.get("/:id/assignments", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ slug: schema.exercises.exerciseId })
    .from(schema.userAssignments)
    .innerJoin(schema.exercises, eq(schema.userAssignments.exerciseId, schema.exercises.id))
    .where(eq(schema.userAssignments.userId, c.req.param("id")));
  return c.json({ slugs: rows.map((r) => r.slug) });
});

/**
 * Thay TOÀN BỘ danh sách bài giao riêng cho em (replace-set) — ngữ nghĩa của màn tick chọn.
 * KHÔNG đụng bài của lớp: gỡ ở đây chỉ gỡ phần cô giao thêm cho riêng em.
 */
teacherUsers.put("/:id/assignments", async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("id");
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy người học" });

  const body = (await c.req.json().catch(() => ({}))) as { slugs?: string[]; note?: string | null };
  const slugs = Array.isArray(body.slugs) ? body.slugs.filter((s) => typeof s === "string") : [];
  const exs = slugs.length
    ? await db.select({ id: schema.exercises.id }).from(schema.exercises).where(inArray(schema.exercises.exerciseId, slugs))
    : [];

  await db.delete(schema.userAssignments).where(eq(schema.userAssignments.userId, userId));
  if (exs.length) {
    await db.insert(schema.userAssignments).values(
      exs.map((e) => ({ userId, exerciseId: e.id, teacherNote: body.note ?? null })),
    );
  }
  return c.json({ ok: true, count: exs.length });
});

// ---- Báo cáo tháng ----
// Song song với /teacher/students/:id/{mistakes,ai-report}; khác đúng ở chỗ chủ nhân là
// `users` thay vì `students`. Logic dùng chung ở lib/queries.ts.

/** Câu SAI của người học trong khoảng thời gian — nguồn cho prompt báo cáo. */
teacherUsers.get("/:id/mistakes", async (c) => {
  const mistakes = await getMistakes(
    getDb(c.env.DB),
    { userId: c.req.param("id") },
    c.req.query("from") || "1970-01-01",
    c.req.query("to") || "2999-01-01",
  );
  return c.json({ mistakes });
});

/** AI tạo BÁO CÁO HỌC TẬP THÁNG cho một thành viên lớp. */
teacherUsers.post("/:id/ai-report", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as {
    from?: string;
    to?: string;
    month?: string;
    teacher_note?: string;
    /** Batch runs: answer `{ report: null, empty: true }` instead of calling AI for a month with no work. */
    skip_empty?: boolean;
  };
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, c.req.param("id")) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy người học" });

  const { timeline: _tl, mistakes, ...summary } = await computeReportStats(
    db,
    { userId: user.id },
    body.from || "1970-01-01",
    body.to || "2999-01-01",
  );
  if (body.skip_empty && !summary.exercises_done) return c.json({ report: null, empty: true });

  const out = await runAiTask<{ report: string }>(c.env, "monthly_report", {
    student_name: user.name || user.email,
    month: body.month || "",
    teacher_note: body.teacher_note || null,
    summary,
    mistakes,
  });
  return c.json({ report: out.report });
});

export default teacherUsers;
