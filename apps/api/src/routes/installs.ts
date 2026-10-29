// Install count (hub only, see lib/installPing.ts): public ping endpoint + the teacher's list.
import { Hono } from "hono";
import { desc, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { installPingSchema } from "@msyen/shared";
import { getDb, schema } from "../db";
import { isInstallHub, recordInstallPing } from "../lib/installPing";
import { enforceRateLimit } from "../lib/rateLimit";
import type { AppEnv } from "../lib/env";

/** POST /api/v1/installs/ping — answered at once; the check and the Telegram message run after. */
export const installPing = new Hono<AppEnv>();
installPing.post("/ping", async (c) => {
  if (!isInstallHub(c.env)) throw new HTTPException(404, { message: "Không tìm thấy" });
  await enforceRateLimit(c, c.env.RL_AUTH, "install-ping");
  const parsed = installPingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: "Dữ liệu không hợp lệ" });
  c.executionCtx.waitUntil(recordInstallPing(c.env, parsed.data).catch((e) => console.error("Install ping lỗi:", e)));
  return c.json({ ok: true });
});

/** GET /api/v1/teacher/installs — `hub: false` on every install but the project site. */
export const installsAdmin = new Hono<AppEnv>();
installsAdmin.get("/", async (c) => {
  if (!isInstallHub(c.env)) return c.json({ hub: false, total: 0, active7: 0, items: [] });
  const db = getDb(c.env.DB);
  const t = schema.installs;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ total, active7 }] = await db
    .select({ total: sql<number>`count(*)`, active7: sql<number>`sum(case when ${t.lastSeenAt} >= ${since} then 1 else 0 end)` })
    .from(t);
  const items = await db.select().from(t).orderBy(desc(t.firstSeenAt)).limit(200);
  return c.json({ hub: true, total, active7: active7 ?? 0, items });
});
