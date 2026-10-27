// Teacher settings: branding, Telegram, account (email + password).
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db";
import { getSettings, setSettings } from "../lib/settings";
import { forgetBrand, getBrand } from "../lib/brand";
import { BRAND_SETTING_KEYS, applyTeacherTitle, isTeacherTitle, isUiLang, parseFooterLinks, teacherEmailChangeSchema } from "@msyen/shared";
import { sendTelegram } from "../lib/telegram";
import { hashPassword } from "../lib/password";
import { issueSession } from "../lib/session";
import { AUTH_COOKIE } from "../middleware/auth";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

r.get("/", async (c) => {
  const s = await getSettings(getDb(c.env.DB));
  // Không trả token thật ra client — chỉ báo đã đặt hay chưa + gợi ý cuối.
  return c.json({
    telegram_chat_id: s.telegram_chat_id,
    telegram_enabled: s.telegram_enabled,
    telegram_feedback_notify: s.telegram_feedback_notify,
    telegram_bot_token_set: !!s.telegram_bot_token,
    telegram_bot_token_hint: s.telegram_bot_token ? `•••${s.telegram_bot_token.slice(-4)}` : "",
    brand: await getBrand(c.env),
  });
});

r.put("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  if (typeof body.telegram_bot_token === "string" && body.telegram_bot_token.trim()) patch.telegram_bot_token = body.telegram_bot_token.trim();
  if (typeof body.telegram_chat_id === "string") patch.telegram_chat_id = body.telegram_chat_id.trim();
  if (typeof body.telegram_enabled === "boolean") patch.telegram_enabled = body.telegram_enabled ? "1" : "0";
  if (typeof body.telegram_feedback_notify === "boolean") patch.telegram_feedback_notify = body.telegram_feedback_notify ? "1" : "0";
  const brand = body.brand && typeof body.brand === "object" ? (body.brand as Record<string, unknown>) : null;
  if (brand) {
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const name = text(brand.name, 60);
    const teacherName = text(brand.teacherName, 40);
    const logoUrl = text(brand.logoUrl, 500);
    const logoDarkUrl = text(brand.logoDarkUrl, 500);
    const faviconUrl = text(brand.faviconUrl, 500);
    if (name !== undefined) patch[BRAND_SETTING_KEYS.name] = name;
    if (teacherName !== undefined) patch[BRAND_SETTING_KEYS.teacherName] = teacherName;
    if (logoUrl !== undefined) patch[BRAND_SETTING_KEYS.logoUrl] = logoUrl;
    if (logoDarkUrl !== undefined) patch[BRAND_SETTING_KEYS.logoDarkUrl] = logoDarkUrl;
    if (faviconUrl !== undefined) patch[BRAND_SETTING_KEYS.faviconUrl] = faviconUrl;
    if (typeof brand.showName === "boolean") patch[BRAND_SETTING_KEYS.showName] = brand.showName ? "1" : "0";
    if (typeof brand.homePage === "boolean") patch[BRAND_SETTING_KEYS.homePage] = brand.homePage ? "1" : "0";
    if (isTeacherTitle(brand.title)) patch[BRAND_SETTING_KEYS.title] = brand.title;
    if (isUiLang(brand.language)) patch[BRAND_SETTING_KEYS.language] = brand.language;
    const tagline = text(brand.footerTagline, 200);
    const note = text(brand.footerNote, 500);
    if (tagline !== undefined) patch[BRAND_SETTING_KEYS.footerTagline] = tagline;
    if (note !== undefined) patch[BRAND_SETTING_KEYS.footerNote] = note;
    if (brand.footerLinks && typeof brand.footerLinks === "object") patch[BRAND_SETTING_KEYS.footerLinks] = JSON.stringify(parseFooterLinks(JSON.stringify(brand.footerLinks)));
    if (typeof brand.footerSkills === "boolean") patch[BRAND_SETTING_KEYS.footerSkills] = brand.footerSkills ? "1" : "0";
  }
  await setSettings(getDb(c.env.DB), patch);
  if (brand) forgetBrand();
  return c.json({ ok: true });
});

r.post("/telegram/test", async (c) => {
  const db = getDb(c.env.DB);
  const s = await getSettings(db);
  const body = await c.req.json().catch(() => ({}));
  const token = (typeof body.telegram_bot_token === "string" && body.telegram_bot_token.trim()) || s.telegram_bot_token;
  const chat = (typeof body.telegram_chat_id === "string" && body.telegram_chat_id.trim()) || s.telegram_chat_id;
  if (!token || !chat) throw new HTTPException(400, { message: "Cần Bot Token và Chat ID" });
  const { name } = await getBrand(c.env);
  await sendTelegram(token, chat, `<b>${name}</b> — kết nối Telegram thành công!`);
  return c.json({ ok: true });
});

// Gửi tin MẪU đúng định dạng auto-feedback (để GV xem trước).
r.post("/telegram/test-sample", async (c) => {
  const s = await getSettings(getDb(c.env.DB));
  if (!s.telegram_bot_token || !s.telegram_chat_id) throw new HTTPException(400, { message: "Cần lưu Bot Token và Chat ID trước" });
  const base = c.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  const msg = [
    "<b>NHẬN XÉT BÀI TẬP</b>",
    "Học sinh: <b>Minh An</b>",
    "Bài: <b>Reading — London markets</b>",
    "Kết quả: <b>12/13</b> (92%)",
    "",
    'Minh An làm rất tốt phần đọc hiểu! Em chỉ sai 1 câu ở phần từ vựng — chú ý nghĩa của "stall". Cô tin lần sau em sẽ đạt điểm tuyệt đối.',
  ];
  if (base) msg.push("", `Xem chi tiết: ${base}/s/mau`);
  const { title } = await getBrand(c.env);
  await sendTelegram(s.telegram_bot_token, s.telegram_chat_id, applyTeacherTitle(msg.join("\n"), title));
  return c.json({ ok: true });
});

// Changing the sign-in email re-issues the session with the new email.
r.post("/email", async (c) => {
  const parsed = teacherEmailChangeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const db = getDb(c.env.DB);
  const me = await db.query.teachers.findFirst({ where: eq(schema.teachers.id, c.get("teacher").id) });
  if (!me) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  const email = parsed.data.email;
  if (email === me.email) return c.json({ ok: true, email });
  const taken = await db.query.teachers.findFirst({ where: eq(schema.teachers.email, email) });
  if (taken) throw new HTTPException(409, { message: "Email này đã được dùng cho tài khoản giáo viên khác" });
  await db.update(schema.teachers).set({ email }).where(eq(schema.teachers.id, me.id));
  await issueSession(c, AUTH_COOKIE, { sub: me.id, email, role: "teacher" });
  return c.json({ ok: true, email });
});

r.post("/password", async (c) => {
  // Đã đăng nhập (JWT) → cho đổi mật khẩu luôn, không cần mật khẩu hiện tại.
  const { new: newPass } = await c.req.json().catch(() => ({}));
  if (!newPass || String(newPass).length < 6) throw new HTTPException(400, { message: "Mật khẩu mới tối thiểu 6 ký tự" });
  const db = getDb(c.env.DB);
  const teacher = c.get("teacher");
  await db.update(schema.teachers).set({ passwordHash: await hashPassword(String(newPass)) }).where(eq(schema.teachers.id, teacher.id));
  return c.json({ ok: true });
});

export default r;
