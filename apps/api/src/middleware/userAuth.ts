// Middleware: yêu cầu đăng nhập USER CÔNG KHAI (public self-serve).
// TÁCH khỏi giáo viên: cookie riêng `msyen_user`, JWT claim role="user".
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import { isRevoked, renewIfStale } from "../lib/session";
import type { AppEnv } from "../lib/env";

// Presence write throttle: skip the UPDATE when `last_seen_at` is fresher than this. It also sets
// the resolution of the study clock — time is banked in slices of this length.
const SEEN_THROTTLE_MINUTES = 5;
/** Longest gap still counted as "same sitting", in seconds. A tab left open banks this much, once. */
const MAX_GAP_SECONDS = 600;
/** Credited when a sitting STARTS (no previous stamp, or a gap too long to bridge). */
const ARRIVAL_SECONDS = 60;
/** Ceiling per day and area — a runaway client cannot bank a week in an afternoon. */
const DAY_CAP_SECONDS = 8 * 3600;

/**
 * Which part of the app a request belongs to, from its path. Gives the study report a breakdown by
 * area for free — no extra instrumentation, the routes already say what the learner is doing.
 */
const AREAS = ["vocab", "grammar", "speaking", "video", "writing", "library", "other"];

function areaOf(path: string, hint?: string): string {
  // The heartbeat endpoint carries no topic of its own — the page it fires from says which area the
  // learner is looking at, so it passes one in.
  if (hint && AREAS.includes(hint)) return hint;
  if (path.includes("/vocab")) return "vocab";
  if (path.includes("/grammar")) return "grammar";
  if (path.includes("/speak") || path.includes("/reading") || path.includes("/pronounce")) return "speaking";
  if (path.includes("/video")) return "video";
  if (path.includes("/writing")) return "writing";
  if (path.includes("/library") || path.includes("/exercise") || path.includes("/practice")) return "library";
  return "other";
}

/**
 * Best-effort presence stamp + study clock, in ONE batch after the response (waitUntil).
 *
 * The gap between two authenticated requests IS time spent: bank it, then move the stamp. Both
 * statements are guarded by the same throttle, so an active session costs two writes per window
 * instead of two per request, and the gap can never be counted twice.
 *
 * Deliberately conservative: the tail after a learner's LAST request is never credited (nothing
 * arrives to close it), so the clock always reads a little low rather than a little high.
 */
function touchLastSeen(c: Parameters<MiddlewareHandler<AppEnv>>[0], userId: string, area: string) {
  const fresherThan = `-${SEEN_THROTTLE_MINUTES} minutes`;
  // VN calendar day: a learner's "today" ends at midnight where they live, not in UTC.
  const bank = c.env.DB.prepare(
    `insert into user_study_time (user_id, date, area, seconds, updated_at)
       select ?1, strftime('%Y-%m-%d', 'now', '+7 hours'), ?3,
              case
                when u.last_seen_at is null then ?4
                when (julianday('now') - julianday(u.last_seen_at)) * 86400 > ?5 then ?4
                else cast((julianday('now') - julianday(u.last_seen_at)) * 86400 as integer)
              end,
              strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         from users u
        where u.id = ?1
          and (u.last_seen_at is null or u.last_seen_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?2))
     on conflict(user_id, date, area) do update
        set seconds = min(?6, user_study_time.seconds + excluded.seconds),
            updated_at = excluded.updated_at`,
  ).bind(userId, fresherThan, area, ARRIVAL_SECONDS, MAX_GAP_SECONDS, DAY_CAP_SECONDS);
  const stamp = c.env.DB.prepare(
    `update users set last_seen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       where id = ?1
         and (last_seen_at is null or last_seen_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?2))`,
  ).bind(userId, fresherThan);
  // batch() runs them in order in one transaction — the stamp must move only after the gap it
  // closes has been banked.
  const write = c.env.DB.batch([bank, stamp]).catch(() => {});
  try {
    c.executionCtx.waitUntil(write);
  } catch {
    // No execution context (unit tests) — the promise still runs, just unawaited.
  }
}

export const USER_COOKIE = "msyen_user";
export const USER_ROLE = "user";

/**
 * Best-effort: reads the user id from the cookie IF present, never throwing. For public routes that
 * want to know "which of these are mine".
 *
 * Honours revocation as well, so a killed session reads as logged out here too — otherwise the SPA's
 * own probe would still say "signed in" while every guarded endpoint answers 401.
 */
export async function optionalUserId(c: Parameters<MiddlewareHandler<AppEnv>>[0]): Promise<string | null> {
  const token = getCookie(c, USER_COOKIE);
  if (!token) return null;
  try {
    const payload = await verify(token, c.env.JWT_SECRET, "HS256");
    if (payload.role !== USER_ROLE) return null;
    const id = String(payload.sub);
    const row = await c.env.DB.prepare(
      "select deleted_at as deletedAt, sessions_valid_from as validFrom from users where id = ?",
    )
      .bind(id)
      .first<{ deletedAt: string | null; validFrom: string | null }>();
    if (!row || row.deletedAt || isRevoked(payload.iat, row.validFrom)) return null;
    return id;
  } catch {
    return null;
  }
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, USER_COOKIE);
  if (!token) throw new HTTPException(401, { message: "Chưa đăng nhập" });
  let payload: Awaited<ReturnType<typeof verify>>;
  try {
    payload = await verify(token, c.env.JWT_SECRET, "HS256");
    // A teacher token must not pass here even though both doors share JWT_SECRET.
    if (payload.role !== USER_ROLE) throw new Error("wrong role");
    c.set("user", { id: String(payload.sub), email: String(payload.email) });
  } catch {
    throw new HTTPException(401, { message: "Phiên đã hết hạn, đăng nhập lại" });
  }

  // The account state the token cannot carry: locking, trashing and password changes all have to
  // reach sessions that were minted before them.
  const row = await c.env.DB.prepare(
    "select active, deleted_at as deletedAt, sessions_valid_from as validFrom from users where id = ?",
  )
    .bind(c.get("user").id)
    .first<{ active: number; deletedAt: string | null; validFrom: string | null }>();
  if (!row || row.deletedAt) throw new HTTPException(401, { message: "Phiên đã hết hạn, đăng nhập lại" });
  if (!row.active) throw new HTTPException(403, { message: "Tài khoản đã bị khoá" });
  if (isRevoked(payload.iat, row.validFrom)) {
    throw new HTTPException(401, { message: "Phiên đã hết hiệu lực, đăng nhập lại" });
  }
  await renewIfStale(c, USER_COOKIE, {
    exp: payload.exp,
    sub: c.get("user").id,
    email: c.get("user").email,
    role: USER_ROLE,
  });

  await next();
  touchLastSeen(c, c.get("user").id, areaOf(c.req.path, c.req.query("area")));
};
