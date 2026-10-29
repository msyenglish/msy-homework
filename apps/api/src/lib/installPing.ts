// Install count: every install reports its URL to the project site (the "hub") on install, on update
// and once a day; the hub keeps the list in D1 and posts installs/updates to its own Telegram.
// Only the URL, the event and the version are sent. TELEMETRY = "off" stops the daily ping.
import { eq, sql } from "drizzle-orm";
import type { InstallPing } from "@msyen/shared";
import { getDb, schema } from "../db";
import { getSettings, setSettings } from "./settings";
import { sendTelegram } from "./telegram";
import type { Bindings } from "./env";

/** The project site that collects install pings. */
export const INSTALL_HUB = "https://free.msyen.com";

const origin = (url?: string) => (url ?? "").replace(/\/+$/, "");
export const isInstallHub = (env: Bindings) => origin(env.PUBLIC_BASE_URL) === INSTALL_HUB;

/** Daily ping from the cron of a regular install; at most once per UTC day. */
export async function dailyInstallPing(env: Bindings): Promise<void> {
  const url = origin(env.PUBLIC_BASE_URL);
  if (env.TELEMETRY === "off" || isInstallHub(env) || !/^https:\/\//.test(url) || /\/\/localhost/.test(url)) return;
  const db = getDb(env.DB);
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "install_ping_day"));
  if (row?.value === today) return;
  // Marked first: a hub that is down is not retried every hour.
  await setSettings(db, { install_ping_day: today });
  await fetch(`${INSTALL_HUB}/api/v1/installs/ping`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, event: "daily", version: env.APP_VERSION ?? "" } satisfies InstallPing),
    signal: AbortSignal.timeout(10_000),
  });
}

/** True when `url` answers like an install of this app (keeps made-up URLs out of the list). */
async function looksLikeInstall(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(8_000) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return res.ok && data.ok === true;
  } catch {
    return false;
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Hub side: record a ping and tell Telegram about installs and updates. */
export async function recordInstallPing(env: Bindings, ping: InstallPing): Promise<void> {
  const url = origin(ping.url);
  if (!(await looksLikeInstall(url))) return;
  const db = getDb(env.DB);
  const t = schema.installs;
  const now = new Date().toISOString();
  const [before] = await db.select({ url: t.url }).from(t).where(eq(t.url, url));
  await db
    .insert(t)
    .values({ url, version: ping.version, lastEvent: ping.event, pings: 1, firstSeenAt: now, lastSeenAt: now, lastUpdateAt: ping.event === "update" ? now : null })
    .onConflictDoUpdate({
      target: t.url,
      set: {
        version: ping.version || sql`${t.version}`,
        lastEvent: ping.event,
        pings: sql`${t.pings} + 1`,
        lastSeenAt: now,
        ...(ping.event === "update" ? { lastUpdateAt: now } : {}),
      },
    });
  if (ping.event === "daily") return;
  const st = await getSettings(db);
  if (!st.telegram_enabled || !st.telegram_bot_token || !st.telegram_chat_id) return;
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(t);
  const title = ping.event === "update" ? "Cập nhật bản mới" : before ? "Cài lại" : "Bản cài mới";
  const version = ping.version ? ` · ${escapeHtml(ping.version)}` : "";
  await sendTelegram(st.telegram_bot_token, st.telegram_chat_id, `<b>${title}</b>${version}\n${escapeHtml(url)}\nTổng: ${n} bản cài`);
}
