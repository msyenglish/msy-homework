// ============================================================
//  Google OAuth cho USER CÔNG KHAI (Authorization Code flow).
//  Mount dưới /account. Degrade an toàn nếu chưa đặt secrets GOOGLE_*.
//  Egress Worker → Google có thể bị chặn địa lý như Gemini
// ============================================================
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { getDb, schema } from "../db";
import { issueUserSession } from "./account";
import type { AppEnv } from "../lib/env";

const oauth = new Hono<AppEnv>();

const STATE_COOKIE = "msyen_oauth_state";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";
// Nơi quay về SPA sau khi đăng nhập xong.
const SUCCESS_PATH = "/u/library";
const ERROR_PATH = "/u/login";

/** Giải mã payload của JWT id_token (KHÔNG verify chữ ký — token lấy trực tiếp từ Google qua TLS).
 *  Giải mã đúng UTF-8 để tên tiếng Việt có dấu không bị mojibake. */
function decodeJwtPayload(idToken: string): Record<string, unknown> {
  const part = idToken.split(".")[1] ?? "";
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Callback URL registered in Google Cloud: GOOGLE_REDIRECT_URI, else derived from the app address. */
export function googleRedirectUri(env: AppEnv["Bindings"]): string | null {
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  const base = env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  return base && !/localhost/.test(base) ? `${base}/api/v1/account/oauth/google/callback` : null;
}

/** Google sign-in needs only the client id and secret; the redirect URL follows the app address. */
export function oauthConfigured(c: { env: AppEnv["Bindings"] }): boolean {
  return !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET && googleRedirectUri(c.env));
}

// Bước 1: chuyển hướng tới màn đồng ý của Google.
oauth.get("/google", async (c) => {
  if (!oauthConfigured(c)) {
    throw new HTTPException(503, { message: "Đăng nhập Google chưa được cấu hình." });
  }
  // state chống CSRF — lưu tạm vào cookie, đối chiếu ở callback.
  const state = crypto.randomUUID();
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: 600, // 10 phút
  });

  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID!);
  u.searchParams.set("redirect_uri", googleRedirectUri(c.env)!);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("access_type", "online");
  // No `prompt` by default: with a single signed-in Google account the consent screen is skipped
  // and the user lands straight back here. `?switch=1` restores the account picker for shared
  // devices, where the browser's current Google account is not the one the learner wants.
  if (c.req.query("switch")) u.searchParams.set("prompt", "select_account");
  return c.redirect(u.toString());
});

// Bước 2: Google gọi lại kèm ?code → đổi lấy token, upsert user, phát session.
oauth.get("/google/callback", async (c) => {
  if (!oauthConfigured(c)) {
    throw new HTTPException(503, { message: "Đăng nhập Google chưa được cấu hình." });
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  const saved = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  // state không khớp hoặc thiếu code → về màn đăng nhập kèm lỗi.
  if (!code || !state || !saved || state !== saved) {
    return c.redirect(`${ERROR_PATH}?error=oauth_state`);
  }

  // Đổi code lấy token.
  let idToken: string;
  let accessToken: string | null = null;
  try {
    const res = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleRedirectUri(c.env)!,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    const data = (await res.json()) as { id_token?: string; access_token?: string };
    if (!data.id_token) throw new Error("thiếu id_token");
    idToken = data.id_token;
    accessToken = data.access_token ?? null;
  } catch {
    return c.redirect(`${ERROR_PATH}?error=oauth_exchange`);
  }

  // Danh tính cơ bản từ id_token (sub/email chắc chắn có).
  const claims = decodeJwtPayload(idToken);
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!sub || !email) return c.redirect(`${ERROR_PATH}?error=oauth_profile`);

  // Tên/ảnh: một số id_token của Google KHÔNG kèm `name` (chỉ có ở userinfo).
  // Ưu tiên userinfo (đủ name + picture); nếu lỗi thì rơi về claims của id_token.
  const pick = (o: Record<string, unknown>, k: string) =>
    typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string) : null;
  let profile: Record<string, unknown> = claims;
  if (accessToken) {
    try {
      const ui = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (ui.ok) profile = (await ui.json()) as Record<string, unknown>;
    } catch {
      // giữ nguyên claims — không chặn đăng nhập vì thiếu tên.
    }
  }
  // Fallback tên: name → "given family" → phần trước @ của email.
  const givenFamily = [pick(profile, "given_name"), pick(profile, "family_name")]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name = pick(profile, "name") ?? (givenFamily || email.split("@")[0] || null);
  const picture = pick(profile, "picture") ?? pick(claims, "picture");

  // Upsert theo email: có row → gắn google_sub (và đổ tên từ Google nếu đang trống);
  // chưa có → tạo mới (provider google).
  const db = getDb(c.env.DB);
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (user) {
    // Chỉ vá field còn thiếu — không ghi đè tên người dùng đã tự đặt.
    const patch: Partial<typeof schema.users.$inferInsert> = {};
    if (!user.googleSub) patch.googleSub = sub;
    if (!user.name && name) patch.name = name;
    if (!user.avatarUrl && picture) patch.avatarUrl = picture;
    if (Object.keys(patch).length) {
      await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id));
      user = { ...user, ...patch };
    }
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({ email, googleSub: sub, provider: "google", name, avatarUrl: picture })
      .returning();
    user = created;
  }
  if (!user.active) return c.redirect(`${ERROR_PATH}?error=account_locked`);

  await issueUserSession(c, user);
  return c.redirect(SUCCESS_PATH);
});

export default oauth;
