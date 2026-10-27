// ============================================================
//  Session lifetime, sliding renewal and revocation — shared by the teacher door
//  (cookie `msyen_session`) and the public-user door (cookie `msyen_user`).
//
//  Sessions are stateless JWTs, so "log everyone out" cannot mean deleting rows. Instead each
//  account carries `sessions_valid_from`: any token minted before that instant is refused. One
//  UPDATE kills every device — used on password change, lock and soft-delete.
// ============================================================
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import type { AppEnv } from "./env";

export const SESSION_DAYS = 30;
/** A session used with less than this left is silently extended, so active users never drop out. */
const RENEW_WITHIN_DAYS = 7;

export type SessionClaims = { sub: string; email: string; role: string };

/**
 * Signs a session JWT and writes it to `cookieName`.
 *
 * `iat` is the claim revocation compares against, so it must be present on every token this app
 * mints — a token without one counts as older than any revocation mark.
 */
export async function issueSession(
  c: Context<AppEnv>,
  cookieName: string,
  claims: SessionClaims,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ ...claims, iat: now, exp: now + SESSION_DAYS * 24 * 60 * 60 }, c.env.JWT_SECRET);
  setCookie(c, cookieName, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/**
 * True when this token predates the account's revocation mark.
 *
 * Compared at second resolution: `iat` is whole seconds, so a mark stamped in the same second as
 * the replacement token must not kill the token it was issued alongside.
 */
export function isRevoked(iat: unknown, validFrom: string | null | undefined): boolean {
  if (!validFrom) return false;
  const cutoff = Date.parse(validFrom);
  if (Number.isNaN(cutoff)) return false;
  const issued = typeof iat === "number" ? iat : 0;
  return Math.floor(cutoff / 1000) > issued;
}

/** Extends a session inside the renewal window. No-op while it still has plenty of life. */
export async function renewIfStale(
  c: Context<AppEnv>,
  cookieName: string,
  payload: { exp?: unknown; sub: string; email: string; role: string },
): Promise<void> {
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const left = exp - Math.floor(Date.now() / 1000);
  if (left > RENEW_WITHIN_DAYS * 24 * 60 * 60) return;
  await issueSession(c, cookieName, { sub: payload.sub, email: payload.email, role: payload.role });
}

/** Value to write into `sessions_valid_from` to drop every session an account currently holds. */
export function revokeNow(): string {
  return new Date().toISOString();
}
