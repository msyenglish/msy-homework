import type { Db } from "../db";
import { schema } from "../db";

export interface AppSettings {
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_enabled: boolean;
  /** Push each new class-work AI comment to Telegram. */
  telegram_feedback_notify: boolean;
  auto_feedback_last_run: string;
}

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.select().from(schema.settings);
  const m: Record<string, string | null> = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    telegram_bot_token: m.telegram_bot_token ?? "",
    telegram_chat_id: m.telegram_chat_id ?? "",
    telegram_enabled: m.telegram_enabled === "1",
    // Unset → inherit the retired auto_feedback_enabled switch, which used to send these messages.
    telegram_feedback_notify: (m.telegram_feedback_notify ?? m.auto_feedback_enabled) === "1",
    auto_feedback_last_run: m.auto_feedback_last_run ?? "",
  };
}

export async function setSettings(db: Db, patch: Record<string, string>) {
  for (const [key, value] of Object.entries(patch)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
}
