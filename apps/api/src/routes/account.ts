// ============================================================
//  Route TÀI KHOẢN USER CÔNG KHAI (public self-serve) — KHÔNG cần đăng nhập giáo viên.
//  Email/mật khẩu (ở đây) + Google OAuth (accountOauth.ts). Cookie riêng `msyen_user`.
// ============================================================
import { Hono } from "hono";
import { oauthConfigured } from "./accountOauth";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { PRACTICE_DRAFT_KINDS, practiceDraftSchema, normalizeWordForCompare, forgotPasswordSchema, grammarLearnedSchema, grammarMarkedSchema, requestEmailChangeSchema, resetPasswordSchema, speakSentenceSchema, stripWordTag, userLoginSchema, userProfileSchema, userRegisterSchema, userSetPasswordSchema, vocabLearnedSchema, vocabSpeakSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import type { UserRow } from "../db/schema";
import { hashPassword, verifyPassword } from "../lib/password";
import { levelOut, userOut } from "../lib/serialize";
import { inChunks } from "../lib/bind";
import { membershipActive } from "../lib/classMembership";
import { vnDateStr } from "../lib/learningPath";
import { sendEmail, resetPasswordEmail } from "../lib/email";
import { getBrand } from "../lib/brand";
import { EMAIL_CHANGE_GRACE_DAYS, applyDueEmailChange, getPendingEmailChange, isPlaceholderEmail } from "../lib/emailChange";
import { assessPronunciation, pronounceVoiceFor, synthesizeSpeech } from "../lib/media";
import { issueSpeechToken } from "../lib/azureSpeech";
import { avatarKey, fileUrl } from "../lib/files";
import { USER_COOKIE, USER_ROLE, optionalUserId, requireUser } from "../middleware/userAuth";
import { enforceRateLimit } from "../lib/rateLimit";
import { issueSession, revokeNow } from "../lib/session";
import type { AppEnv } from "../lib/env";

const account = new Hono<AppEnv>();

/** Phát cookie phiên `msyen_user` (JWT role=user). Dùng chung cho login + OAuth callback. */
export async function issueUserSession(c: Context<AppEnv>, user: UserRow): Promise<void> {
  await issueSession(c, USER_COOKIE, { sub: user.id, email: user.email, role: USER_ROLE });
  // Presence: mark online right at login instead of waiting for the first authenticated call.
  await getDb(c.env.DB)
    .update(schema.users)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));
}

/** Trả user kèm level (nếu có) — LƯỢC password_hash/google_sub. */
async function userWithLevel(c: Context<AppEnv>, user: UserRow) {
  const db = getDb(c.env.DB);
  const level = user.levelId
    ? await db.query.levels.findFirst({ where: eq(schema.levels.id, user.levelId) })
    : null;
  // Thuộc lớp đang hoạt động VÀ còn hạn → web mở khoá mục "Nhận xét của cô".
  const membership = await db
    .select({ id: schema.classes.id })
    .from(schema.classMembers)
    .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
    .where(and(eq(schema.classMembers.userId, user.id), membershipActive()))
    .limit(1);
  const out = userOut(user, level ? levelOut(level) : null, membership.length > 0);
  // Đính trạng thái đổi email đang chờ (nếu có) để trang hồ sơ hiển thị + cho hủy.
  const pending = await getPendingEmailChange(db, user.id);
  out.pending_email = pending?.newEmail ?? null;
  out.pending_email_at = pending?.effectiveAt ?? null;
  return out;
}

// Đăng ký bằng email + mật khẩu.
account.post("/register", async (c) => {
  await enforceRateLimit(c, c.env.RL_AUTH, "auth");
  const parsed = userRegisterSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
  }
  const db = getDb(c.env.DB);
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) throw new HTTPException(409, { message: "Email đã được đăng ký" });

  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      provider: "password",
      name: parsed.data.name?.trim() || null,
      levelId: parsed.data.level_id || null,
    })
    .returning();

  await issueUserSession(c, user);
  return c.json({ user: await userWithLevel(c, user) });
});

// Đăng nhập bằng email + mật khẩu.
account.post("/login", async (c) => {
  await enforceRateLimit(c, c.env.RL_AUTH, "auth");
  const parsed = userLoginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Thiếu email hoặc mật khẩu" });
  const db = getDb(c.env.DB);
  const email = parsed.data.email.trim().toLowerCase();

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  // Không có mật khẩu (tài khoản Google-only) → báo cần đăng nhập bằng Google.
  if (!user || !user.passwordHash) {
    throw new HTTPException(401, { message: "Email hoặc mật khẩu không đúng" });
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    throw new HTTPException(401, { message: "Email hoặc mật khẩu không đúng" });
  }
  if (!user.active) throw new HTTPException(403, { message: "Tài khoản đã bị khoá" });

  await issueUserSession(c, user);
  return c.json({ user: await userWithLevel(c, user) });
});

account.post("/logout", (c) => {
  deleteCookie(c, USER_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// Sign out of EVERY device (including this one) — kills every session token minted before now,
// then drops this device's own cookie too. Unlike /password, no replacement session is issued.
account.post("/logout-all", requireUser, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  await db.update(schema.users).set({ sessionsValidFrom: revokeNow() }).where(eq(schema.users.id, u.id));
  deleteCookie(c, USER_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

const RESET_TTL_MIN = 30; // link đặt lại sống 30 phút

/** Token ngẫu nhiên (32 byte hex) đi trong link email. */
function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
/** SHA-256 hex — chỉ lưu hash của token vào DB, không lưu token thô. */
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// QUÊN MẬT KHẨU — gửi link đặt lại qua email. LUÔN trả về { ok: true } dù email có tồn tại
// hay không (chống dò tài khoản). Chỉ thực sự gửi khi user tồn tại + đang hoạt động.
account.post("/forgot-password", async (c) => {
  const parsed = forgotPasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Email không hợp lệ" });
  const db = getDb(c.env.DB);
  const email = parsed.data.email.trim().toLowerCase();

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (user && user.active) {
    // Một token còn hiệu lực cho mỗi user: xoá token cũ trước khi tạo mới.
    await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, user.id));
    const token = randomToken();
    const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000).toISOString();
    await db.insert(schema.passwordResets).values({ userId: user.id, tokenHash: await sha256Hex(token), expiresAt });

    const base = c.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || new URL(c.req.url).origin;
    const link = `${base}/u/reset-password?token=${token}`;
    // Gửi email; lỗi gửi KHÔNG lộ ra ngoài (vẫn trả ok để không rò email tồn tại).
    try {
      await sendEmail(c.env, { to: user.email, ...resetPasswordEmail(link, await getBrand(c.env)) });
    } catch (err) {
      console.error("forgot-password sendEmail:", err instanceof Error ? err.message : err);
    }
  }
  return c.json({ ok: true });
});

// ĐẶT LẠI MẬT KHẨU bằng token trong link email — dùng 1 lần, hết hạn thì vô hiệu.
// Thành công → đổi mật khẩu + đăng nhập luôn (phát phiên) cho tiện.
account.post("/reset-password", async (c) => {
  const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);

  const invalid = () => new HTTPException(400, { message: "Link đặt lại đã hết hạn hoặc không hợp lệ. Hãy yêu cầu lại nhé." });
  const row = await db.query.passwordResets.findFirst({
    where: eq(schema.passwordResets.tokenHash, await sha256Hex(parsed.data.token)),
  });
  if (!row || row.usedAt || row.expiresAt <= new Date().toISOString()) throw invalid();

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
  if (!user || !user.active) throw invalid();

  const passwordHash = await hashPassword(parsed.data.password);
  // Drop every other device: a reset is how a learner recovers a stolen account.
  await db
    .update(schema.users)
    .set({ passwordHash, sessionsValidFrom: revokeNow() })
    .where(eq(schema.users.id, user.id));
  await db.update(schema.passwordResets).set({ usedAt: new Date().toISOString() }).where(eq(schema.passwordResets.id, row.id));

  // Issued after the mark, so this device stays signed in while the others fall out.
  await issueUserSession(c, user);
  return c.json({ user: await userWithLevel(c, user) });
});

// Cấu hình công khai cho màn đăng nhập (có bật đăng nhập Google không).
account.get("/config", (c) => {
  return c.json({ google: oauthConfigured(c) });
});

// Hồ sơ user hiện tại.
// Optional auth on purpose: "chưa đăng nhập" is a normal state for this probe, so it answers
// 200 `{ user: null }` instead of 401 (no red 401s in the browser console on every page load).
account.get("/me", async (c) => {
  const uid = await optionalUserId(c);
  if (!uid) return c.json({ user: null });
  const db = getDb(c.env.DB);
  let user = await db.query.users.findFirst({ where: eq(schema.users.id, uid) });
  if (!user) return c.json({ user: null });
  // Bị giáo viên tạm khóa → chặn ngay ở lần tải kế (không cần chờ token hết hạn).
  if (!user.active) throw new HTTPException(403, { message: "Tài khoản đã bị khoá" });
  // Đổi email đã tới hạn (sau 2 ngày) → áp lười ngay khi user vào app (cron cũng quét song song).
  user = await applyDueEmailChange(db, user);
  return c.json({ user: await userWithLevel(c, user) });
});

// ĐỔI EMAIL (user tự làm) — hiệu lực sau 2 NGÀY (cửa sổ ân hạn; chưa có verify qua email).
// Xác minh bằng mật khẩu hiện tại nếu tài khoản có mật khẩu. Lưu bản ghi vào lịch sử (email_changes).
account.post("/email/request", requireUser, async (c) => {
  const parsed = requestEmailChangeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Email không hợp lệ" });
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, u.id) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });

  const newEmail = parsed.data.new_email.trim().toLowerCase();
  if (newEmail === user.email) throw new HTTPException(400, { message: "Email mới trùng email hiện tại" });
  if (isPlaceholderEmail(newEmail)) throw new HTTPException(400, { message: "Email không hợp lệ" });
  // Có mật khẩu → bắt buộc nhập đúng để xác minh danh tính (chống lạm dụng phiên).
  if (user.passwordHash) {
    if (!parsed.data.password || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      throw new HTTPException(401, { message: "Mật khẩu không đúng" });
    }
  }
  const dup = await db.query.users.findFirst({ where: eq(schema.users.email, newEmail) });
  if (dup && dup.id !== user.id) throw new HTTPException(409, { message: "Email này đã có người dùng" });

  // Hủy pending cũ (nếu có) rồi tạo yêu cầu mới, hiệu lực sau 2 ngày.
  const now = new Date();
  await db
    .update(schema.emailChanges)
    .set({ canceledAt: now.toISOString() })
    .where(and(eq(schema.emailChanges.userId, user.id), sql`applied_at IS NULL AND canceled_at IS NULL`));
  const effectiveAt = new Date(now.getTime() + EMAIL_CHANGE_GRACE_DAYS * 86_400_000).toISOString();
  await db.insert(schema.emailChanges).values({
    userId: user.id,
    oldEmail: user.email,
    newEmail,
    source: "user",
    effectiveAt,
  });
  return c.json({ user: await userWithLevel(c, user), pending_email: newEmail, pending_email_at: effectiveAt });
});

// HỦY yêu cầu đổi email đang chờ.
account.post("/email/cancel", requireUser, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const pending = await getPendingEmailChange(db, u.id);
  if (pending) {
    await db.update(schema.emailChanges).set({ canceledAt: new Date().toISOString() }).where(eq(schema.emailChanges.id, pending.id));
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, u.id) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  return c.json({ user: await userWithLevel(c, user) });
});

// Cập nhật hồ sơ (tên, level). PATCH = cập nhật TỪNG PHẦN: chỉ đụng field
// CÓ trong request. Onboarding chỉ gửi level/tuổi/giới tính → không được xóa
// tên đã lấy từ Google (trước đây ép name=null làm mất tên user mới).
account.patch("/me", requireUser, async (c) => {
  const parsed = userProfileSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const d = parsed.data;
  const patch: Partial<typeof schema.users.$inferInsert> = {};
  if (d.name !== undefined) patch.name = d.name?.trim() || null;
  if (d.level_id !== undefined) patch.levelId = d.level_id || null;
  if (d.topics !== undefined) patch.topics = d.topics?.length ? d.topics : null;
  if (d.birth_year !== undefined) patch.birthYear = d.birth_year ?? null;
  if (d.gender !== undefined) patch.gender = d.gender ?? null;
  if (d.voice_gender !== undefined) patch.voiceGender = d.voice_gender ?? null;
  if (d.voice_gender_sentence !== undefined) patch.voiceGenderSentence = d.voice_gender_sentence ?? null;
  if (d.library_view !== undefined) patch.libraryView = d.library_view ?? null;
  if (d.theme !== undefined) patch.theme = d.theme ?? null;
  if (d.academic_enabled !== undefined) patch.academicEnabled = !!d.academic_enabled;

  const u = c.get("user");
  const db = getDb(c.env.DB);
  if (!Object.keys(patch).length) {
    const cur = await db.query.users.findFirst({ where: eq(schema.users.id, u.id) });
    if (!cur) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
    return c.json({ user: await userWithLevel(c, cur) });
  }
  const [user] = await db
    .update(schema.users)
    .set(patch)
    .where(eq(schema.users.id, u.id))
    .returning();
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  return c.json({ user: await userWithLevel(c, user) });
});

// Đổi ảnh đại diện. Client đã resize + nén WebP trước khi gửi (xem lib/imageResize.ts);
// server chỉ chặn trần dung lượng phòng người dùng gọi thẳng API.
// Key CỐ ĐỊNH theo user → mỗi user đúng 1 file, ảnh mới ghi đè ảnh cũ, R2 không đọng rác.
// URL lưu kèm ?v=<timestamp> vì file phục vụ với cache-control immutable 1 năm.
const AVATAR_MAX_BYTES = 512 * 1024;

account.post("/avatar", requireUser, async (c) => {
  const contentType = c.req.header("content-type") || "";
  if (!contentType.startsWith("image/")) throw new HTTPException(400, { message: "Cần gửi tệp ảnh" });

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!bytes.length) throw new HTTPException(400, { message: "Thiếu dữ liệu ảnh" });
  if (bytes.length > AVATAR_MAX_BYTES) {
    throw new HTTPException(413, { message: "Ảnh quá nặng — chọn ảnh khác giúp cô nhé." });
  }

  const u = c.get("user");
  const key = avatarKey(u.id);
  await c.env.AUDIO.put(key, bytes, { httpMetadata: { contentType: "image/webp" } });

  const url = `${fileUrl(key)}?v=${Date.now()}`;
  const db = getDb(c.env.DB);
  const [user] = await db.update(schema.users).set({ avatarUrl: url }).where(eq(schema.users.id, u.id)).returning();
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  return c.json({ user: await userWithLevel(c, user) });
});

// Đặt/đổi mật khẩu — CHỈ mật khẩu mới (không hỏi mật khẩu hiện tại). Tài khoản
// Google-only dùng đây để tạo mật khẩu, từ đó đăng nhập thêm bằng email + mật khẩu.
account.post("/password", requireUser, async (c) => {
  const parsed = userSetPasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" });
  }
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const passwordHash = await hashPassword(parsed.data.password);
  const [user] = await db
    .update(schema.users)
    .set({ passwordHash, sessionsValidFrom: revokeNow() })
    .where(eq(schema.users.id, u.id))
    .returning();
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  // Other devices fall out; this one is re-issued past the mark.
  await issueUserSession(c, user);
  return c.json({ user: await userWithLevel(c, user) });
});

// Mark one word as learned / not learned. Upsert on (userId, lowercase word).
//
// MARK = a self-declaration, NOT evidence: it sets the `learned` flag with source 'self' and
// deliberately leaves `tier` alone. Only a graded activity moves the knowledge ladder, and nothing
// here enters the review schedule.
//
// UNMARK = the learner saying "I do not know this", and their word is final: the flag clears AND the
// earned state resets (tier back to 0, schedule dropped) so the word re-enters learning instead of
// being flipped back to learned by the next graded pass. `reps`/`lapses`/`miss_count` stay as
// history, and `tier_max` keeps the peak so re-learning cannot re-earn the same points.
account.post("/vocabulary/learned", requireUser, async (c) => {
  const u = c.get("user");
  const parsed = vocabLearnedSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const body = parsed.data;
  const word = body.word.trim().toLowerCase();
  const now = new Date().toISOString();
  const db = getDb(c.env.DB);
  const reset = {
    tier: 0,
    stability: null,
    difficulty: null,
    dueAt: null,
    lastReviewAt: null,
    lastRating: null,
  };
  await db
    .insert(schema.userVocabProgress)
    .values({
      userId: u.id,
      word,
      learned: body.learned,
      learnedAt: body.learned ? now : null,
      learnedSource: body.learned ? "self" : null,
      updatedAt: now,
      ...(body.learned ? {} : reset),
    })
    .onConflictDoUpdate({
      target: [schema.userVocabProgress.userId, schema.userVocabProgress.word],
      set: {
        learned: body.learned,
        learnedAt: body.learned ? now : null,
        learnedSource: body.learned ? "self" : null,
        updatedAt: now,
        ...(body.learned ? {} : reset),
      },
    });
  return c.json({ ok: true });
});

// NGỮ PHÁP CẦN ÔN: gom các điểm ngữ pháp user còn SAI, tính TRỰC TIẾP từ các lượt nộp
// (submissions.details = đúng/sai từng câu) × questions.grammar_id — không cần bảng tiến độ.
// Trả bản GỌN (GrammarWeak) như báo cáo tháng; web lazy-fetch chi tiết khi bấm mở.
account.get("/grammar/review", requireUser, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);

  // Lượt nộp quiz của user (đọc-to/nói ở bảng khác, không có grammar_id nên bỏ qua).
  const subs = await db
    .select({ exerciseId: schema.submissions.exerciseId, details: schema.submissions.details })
    .from(schema.submissions)
    .where(eq(schema.submissions.userId, u.id));
  if (!subs.length) return c.json({ items: [] });

  const exIds = [...new Set(subs.map((s) => s.exerciseId).filter(Boolean) as string[])];
  // Nhãn ngữ pháp nằm ở cấp CÂU: (exerciseId, position) → grammarId.
  const qs = await inChunks(exIds, (ids) =>
    db
      .select({ exerciseId: schema.questions.exerciseId, position: schema.questions.position, grammarId: schema.questions.grammarId })
      .from(schema.questions)
      .where(inArray(schema.questions.exerciseId, ids)),
  );
  const qByKey = new Map(qs.map((q) => [`${q.exerciseId}:${q.position}`, q.grammarId]));

  // Gom wrong/seen theo grammarId trên MỌI lượt nộp.
  const stat = new Map<string, { wrong: number; seen: number }>();
  for (const s of subs) {
    for (const d of s.details ?? []) {
      const gid = qByKey.get(`${s.exerciseId}:${d.position}`);
      if (!gid) continue;
      const g = stat.get(gid) ?? { wrong: 0, seen: 0 };
      g.seen++;
      if (!d.correct) g.wrong++;
      stat.set(gid, g);
    }
  }
  const weakIds = [...stat.entries()].filter(([, g]) => g.wrong > 0).map(([id]) => id);
  if (!weakIds.length) return c.json({ items: [] });

  const rows = await inChunks(weakIds, (ids) =>
    db
      .select({
        id: schema.grammar.id,
        title: schema.grammar.title,
        category: schema.grammar.category,
        cefr: schema.grammar.cefr,
        summary: schema.grammar.summary,
      })
      .from(schema.grammar)
      .where(inArray(schema.grammar.id, ids)),
  );
  // Sai nhiều nhất lên trước; cắt 6 cho gọn "khu cần ôn".
  const items = rows
    .map((g) => ({ ...g, ...stat.get(g.id)! }))
    .sort((a, b) => b.wrong - a.wrong || b.seen - a.seen)
    .slice(0, 6);
  return c.json({ items });
});

// Word pronunciation (TTS). Cached in R2 by hash(word|voice), shared by every user, so a word is
// synthesised once. POST keeps it out of the edge cache (the real cache is R2).
account.post("/vocabulary/speak", requireUser, async (c) => {
  const parsed = vocabSpeakSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const body = parsed.data;
  // Bỏ nhãn từ loại/ghi chú trong ngoặc — nếu không máy đọc luôn "(n)", "(np)".
  const word = stripWordTag(body.word) || body.word.trim();
  const voice = await pronounceVoiceFor(c.env, body.gender);
  // sha256 hex của "word|voice" làm tên file (ổn định, không lộ nội dung).
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${word.toLowerCase()}|${voice}`));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `tts/word/${hash}.mp3`;

  const existing = await c.env.AUDIO.head(key);
  if (!existing) {
    const { bytes, contentType } = await synthesizeSpeech(c.env, { text: word, voice });
    await c.env.AUDIO.put(key, bytes, { httpMetadata: { contentType } });
  }
  return c.json({ url: fileUrl(key) });
});

// Danh sách id điểm ngữ pháp user đã ĐÁNH DẤU ĐÃ HỌC (để tô/ẩn trong sổ tay).
account.get("/grammar/learned", requireUser, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ grammarId: schema.userGrammarProgress.grammarId })
    .from(schema.userGrammarProgress)
    .where(and(eq(schema.userGrammarProgress.userId, u.id), eq(schema.userGrammarProgress.learned, true)));
  return c.json({ ids: rows.map((r) => r.grammarId) });
});

// Đánh dấu ĐÃ HỌC / bỏ đánh dấu một điểm ngữ pháp. Upsert theo (userId, grammarId).
account.post("/grammar/learned", requireUser, async (c) => {
  const u = c.get("user");
  const parsed = grammarLearnedSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const { id, learned } = parsed.data;
  const now = new Date().toISOString();
  const db = getDb(c.env.DB);
  await db
    .insert(schema.userGrammarProgress)
    .values({ userId: u.id, grammarId: id, learned, learnedAt: learned ? now : null, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.userGrammarProgress.userId, schema.userGrammarProgress.grammarId],
      set: { learned, learnedAt: learned ? now : null, updatedAt: now },
    });
  return c.json({ ok: true });
});

// Các điểm ngữ pháp user GHIM để luyện tiếp. Trả cả nội dung gọn (không chỉ id) vì khu nhắc
// ở trang ngữ pháp cần hiện tên/tóm tắt ngay, khỏi phải đối chiếu với danh sách đầy đủ.
account.get("/grammar/marked", requireUser, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.grammar.id,
      title: schema.grammar.title,
      category: schema.grammar.category,
      cefr: schema.grammar.cefr,
      summary: schema.grammar.summary,
      marked_at: schema.userGrammarProgress.markedAt,
    })
    .from(schema.userGrammarProgress)
    .innerJoin(schema.grammar, eq(schema.grammar.id, schema.userGrammarProgress.grammarId))
    .where(and(eq(schema.userGrammarProgress.userId, u.id), eq(schema.userGrammarProgress.marked, true)))
    .orderBy(desc(schema.userGrammarProgress.markedAt));
  return c.json({ items: rows });
});

// Ghim / bỏ ghim. Nhận `id` hoặc `ids` (ghim cả chùm khi nhận xét của cô chỉ ra nhiều điểm).
account.post("/grammar/marked", requireUser, async (c) => {
  const u = c.get("user");
  const parsed = grammarMarkedSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const { marked } = parsed.data;
  const ids = [...new Set([...(parsed.data.ids ?? []), ...(parsed.data.id ? [parsed.data.id] : [])])];
  if (!ids.length) throw new HTTPException(400, { message: "Thiếu điểm ngữ pháp cần đánh dấu" });
  const now = new Date().toISOString();
  const db = getDb(c.env.DB);
  for (const id of ids) {
    await db
      .insert(schema.userGrammarProgress)
      .values({ userId: u.id, grammarId: id, marked, markedAt: marked ? now : null, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.userGrammarProgress.userId, schema.userGrammarProgress.grammarId],
        set: { marked, markedAt: marked ? now : null, updatedAt: now },
      });
  }
  return c.json({ ok: true });
});

// Đọc một CÂU (ví dụ ngữ pháp) — cùng cơ chế TTS + cache R2 như đọc từ, nhưng đường riêng
// `tts/sentence/` và KHÔNG stripWordTag (câu đầy đủ). Dùng POST để tránh edge-cache.
account.post("/grammar/speak", requireUser, async (c) => {
  const parsed = speakSentenceSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  const text = parsed.data.text.trim();
  const voice = await pronounceVoiceFor(c.env, parsed.data.gender);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${text.toLowerCase()}|${voice}`));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `tts/sentence/${hash}.mp3`;

  const existing = await c.env.AUDIO.head(key);
  if (!existing) {
    const { bytes, contentType } = await synthesizeSpeech(c.env, { text, voice });
    await c.env.AUDIO.put(key, bytes, { httpMetadata: { contentType } });
  }
  return c.json({ url: fileUrl(key) });
});

// Luyện PHÁT ÂM 1 từ: nhận bản ghi (multipart) → chấm Azure ĐỒNG BỘ (từ nhỏ, không cần queue)
// → lưu điểm tốt nhất vào tiến độ. KHÔNG lưu audio (chỉ cần điểm). Trả nguyên kết quả chấm.
/**
 * GET /study-time?range=week|month|quarter|year|all — the learner's own clock.
 *
 * The clock itself is filled by session stitching in `requireUser` (middleware/userAuth.ts); this
 * endpoint only reads. Granularity follows the range because 365 daily bars are a smear, not a
 * chart: a week or a month draws days, a quarter draws weeks, a year and "all" draw months.
 *
 * Cost: day/week buckets read the raw rows for the window (<= 7 rows a day). Month buckets aggregate
 * in SQL, so a two-year history still comes back as a couple of dozen rows.
 */
const STUDY_RANGES = {
  week: { days: 7, bucket: "day" },
  month: { days: 30, bucket: "day" },
  quarter: { days: 91, bucket: "week" },
  year: { days: 365, bucket: "month" },
  all: { days: 0, bucket: "month" },
} as const;
type StudyRange = keyof typeof STUDY_RANGES;

/** Monday of the VN week a date falls in — the label a weekly bar carries. */
function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

account.get("/study-time", requireUser, async (c) => {
  const u = c.get("user");
  const db = getDb(c.env.DB);
  const key = (c.req.query("range") || "week") as StudyRange;
  const range: StudyRange = key in STUDY_RANGES ? key : "week";
  const { days, bucket } = STUDY_RANGES[range];
  const from = days ? vnDateStr(new Date(Date.now() - (days - 1) * 86_400_000)) : "0000-00-00";
  const scope = and(eq(schema.userStudyTime.userId, u.id), gte(schema.userStudyTime.date, from));

  const [rows, lifetime, activeRow] = await Promise.all([
    bucket === "month"
      ? db
          .select({
            date: sql<string>`substr(${schema.userStudyTime.date}, 1, 7)`,
            area: schema.userStudyTime.area,
            seconds: sql<number>`sum(${schema.userStudyTime.seconds})`,
          })
          .from(schema.userStudyTime)
          .where(scope)
          .groupBy(sql`substr(${schema.userStudyTime.date}, 1, 7)`, schema.userStudyTime.area)
      : db
          .select({ date: schema.userStudyTime.date, area: schema.userStudyTime.area, seconds: schema.userStudyTime.seconds })
          .from(schema.userStudyTime)
          .where(scope),
    db
      .select({ n: sql<number>`coalesce(sum(${schema.userStudyTime.seconds}), 0)`, first: sql<string | null>`min(${schema.userStudyTime.date})` })
      .from(schema.userStudyTime)
      .where(eq(schema.userStudyTime.userId, u.id)),
    // Days actually studied — the divisor for the average, and it survives month bucketing.
    db
      .select({ n: sql<number>`count(distinct ${schema.userStudyTime.date})` })
      .from(schema.userStudyTime)
      .where(and(scope, sql`${schema.userStudyTime.seconds} > 0`)),
  ]);

  // Every bucket in the window, including empty ones: a gap in the chart is information.
  const keys: string[] = [];
  const today = vnDateStr();
  if (bucket === "day") {
    for (let i = days - 1; i >= 0; i--) keys.push(vnDateStr(new Date(Date.now() - i * 86_400_000)));
  } else if (bucket === "week") {
    const seen = new Set<string>();
    for (let i = days - 1; i >= 0; i--) {
      const w = weekStart(vnDateStr(new Date(Date.now() - i * 86_400_000)));
      if (!seen.has(w)) { seen.add(w); keys.push(w); }
    }
  } else {
    // Months from the learner's first recorded day (or the window start) to this month.
    const firstDate = range === "all" ? (lifetime[0]?.first ?? today) : from;
    const cur = new Date(`${firstDate.slice(0, 7)}-01T00:00:00Z`);
    const last = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    while (cur <= last) {
      keys.push(cur.toISOString().slice(0, 7));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }

  const byBucket = new Map(keys.map((k) => [k, 0]));
  const byArea = new Map<string, number>();
  for (const r of rows) {
    const k = bucket === "week" ? weekStart(r.date) : r.date;
    if (byBucket.has(k)) byBucket.set(k, (byBucket.get(k) ?? 0) + Number(r.seconds));
    byArea.set(r.area, (byArea.get(r.area) ?? 0) + Number(r.seconds));
  }
  const buckets = keys.map((k) => ({ key: k, seconds: byBucket.get(k) ?? 0 }));
  const total = buckets.reduce((s, b) => s + b.seconds, 0);
  const active = Number(activeRow[0]?.n ?? 0);
  const best = buckets.reduce((m, b) => (b.seconds > m.seconds ? b : m), { key: "", seconds: 0 });
  return c.json({
    range,
    bucket,
    buckets,
    areas: [...byArea.entries()].map(([area, seconds]) => ({ area, seconds })).sort((a, b) => b.seconds - a.seconds),
    total,
    // Averaged over DAYS STUDIED, not over the range: dividing by 7 punishes someone who studies
    // hard on three days a week and reads as if they were slacking every day.
    avg_active: active ? Math.round(total / active) : 0,
    active_days: active,
    best_bucket: best.seconds > 0 ? best : null,
    first_day: lifetime[0]?.first ?? null,
    total_all: Number(lifetime[0]?.n ?? 0),
  });
});

/**
 * POST /ping — heartbeat from an open practice page. Does nothing itself: passing through
 * `requireUser` is the point, since that is where the study clock is stitched. `?area=` names the
 * page so reading a passage lands in the right bucket.
 *
 * The client only fires it while the tab is VISIBLE and recently interacted with — an abandoned tab
 * must not bank time. The 10-minute gap cap in the middleware is the second line of defence.
 */
// Azure Speech token for the browser SDK (long read-aloud takes are scored client-side).
account.post("/speech-token", requireUser, async (c) => {
  await enforceRateLimit(c, c.env.RL_DATA, "speech-token");
  const { token, region } = await issueSpeechToken(c.env);
  return c.json({ token, region });
});

account.post("/ping", requireUser, async (c) => {
  // A beat a minute is the honest rate; the limiter stops a script from hammering the middleware.
  await enforceRateLimit(c, c.env.RL_DATA, "study-ping");
  return c.body(null, 204);
});

account.post("/vocabulary/pronounce", requireUser, async (c) => {
  const u = c.get("user");
  const body = await c.req.parseBody();
  const word = typeof body.word === "string" ? body.word.trim() : "";
  const audio = body.audio;
  if (!word) throw new HTTPException(400, { message: "Thiếu từ cần luyện" });
  if (!(audio instanceof File) || audio.size === 0) throw new HTTPException(400, { message: "Thiếu bản ghi âm" });

  // Chấm theo từ ĐÃ BỎ nhãn (vd "bike rack (np)" → "bike rack") — tránh Azure chấm cả "np".
  const refText = stripWordTag(word) || word;
  const raw = await assessPronunciation(c.env, {
    audio: await audio.arrayBuffer(),
    contentType: audio.type || "audio/webm",
    filename: audio.name || "word.webm",
    referenceText: refText,
  });

  const score = Math.round(raw.pronScore); // Azure's own score
  const now = new Date().toISOString();
  // Same key the vocabulary pages join on (vocab_items.word_key = normalizeWordForCompare).
  const progressKey = normalizeWordForCompare(word);
  const db = getDb(c.env.DB);
  await db
    .insert(schema.userVocabProgress)
    .values({ userId: u.id, word: progressKey, pronBest: score, pronAttempts: 1, lastPronAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.userVocabProgress.userId, schema.userVocabProgress.word],
      set: {
        // Giữ điểm CAO NHẤT giữa lần cũ và lần mới.
        pronBest: sql`max(coalesce(${schema.userVocabProgress.pronBest}, 0), ${score})`,
        pronAttempts: sql`${schema.userVocabProgress.pronAttempts} + 1`,
        lastPronAt: now,
        updatedAt: now,
      },
    });
  return c.json(raw);
});

// ============================================================
//  UNFINISHED ATTEMPTS (practice drafts)
//  One row per (user, exercise, kind). The state blob belongs to the practice UI; the server only
//  stores and returns it, so a new exercise type needs no endpoint change.
// ============================================================
const draftKind = (c: Context<AppEnv>): string => {
  const k = c.req.param("kind") ?? "";
  if (!(PRACTICE_DRAFT_KINDS as readonly string[]).includes(k)) {
    throw new HTTPException(400, { message: "Loại bài không hợp lệ" });
  }
  return k;
};
const draftExercise = (c: Context<AppEnv>): string => c.req.param("exerciseId") ?? "";

// Every unfinished attempt of this learner — feeds the "in progress" badges in the library.
account.get("/drafts", requireUser, async (c) => {
  const u = c.get("user");
  const rows = await getDb(c.env.DB)
    .select({
      exerciseId: schema.practiceDrafts.exerciseId,
      kind: schema.practiceDrafts.kind,
      answered: schema.practiceDrafts.answered,
      total: schema.practiceDrafts.total,
      updatedAt: schema.practiceDrafts.updatedAt,
    })
    .from(schema.practiceDrafts)
    .where(eq(schema.practiceDrafts.userId, u.id))
    .orderBy(desc(schema.practiceDrafts.updatedAt))
    .limit(200);
  return c.json({ items: rows });
});

account.get("/drafts/:kind/:exerciseId", requireUser, async (c) => {
  const u = c.get("user");
  const [row] = await getDb(c.env.DB)
    .select()
    .from(schema.practiceDrafts)
    .where(and(
      eq(schema.practiceDrafts.userId, u.id),
      eq(schema.practiceDrafts.exerciseId, draftExercise(c)),
      eq(schema.practiceDrafts.kind, draftKind(c)),
    ))
    .limit(1);
  return c.json({
    draft: row ? { state: row.state, answered: row.answered, total: row.total, updatedAt: row.updatedAt } : null,
  });
});

// Autosaved from the practice UI (debounced) — last write wins, one row per attempt.
account.put("/drafts/:kind/:exerciseId", requireUser, async (c) => {
  const u = c.get("user");
  const parsed = practiceDraftSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const kind = draftKind(c);
  const exerciseId = draftExercise(c);
  const b = parsed.data;
  await getDb(c.env.DB)
    .insert(schema.practiceDrafts)
    .values({ userId: u.id, exerciseId, kind, state: b.state, answered: b.answered, total: b.total })
    .onConflictDoUpdate({
      target: [schema.practiceDrafts.userId, schema.practiceDrafts.exerciseId, schema.practiceDrafts.kind],
      set: { state: b.state, answered: b.answered, total: b.total, updatedAt: sql`datetime('now')` },
    });
  return c.json({ ok: true });
});

// Submitted (or abandoned on purpose) → the attempt is no longer unfinished.
account.delete("/drafts/:kind/:exerciseId", requireUser, async (c) => {
  const u = c.get("user");
  await getDb(c.env.DB)
    .delete(schema.practiceDrafts)
    .where(and(
      eq(schema.practiceDrafts.userId, u.id),
      eq(schema.practiceDrafts.exerciseId, draftExercise(c)),
      eq(schema.practiceDrafts.kind, draftKind(c)),
    ));
  return c.json({ ok: true });
});

export default account;
