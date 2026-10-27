// Telegram message for one AI comment, sent when a class exercise gets its comment.
// One message per submission, formatted so the teacher can forward it to a parent.
import type { Bindings } from "./env";
import type { AppSettings } from "./settings";
import { sendTelegram } from "./telegram";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** True when the teacher wants each new comment pushed to Telegram. */
export function feedbackNotifyOn(st: AppSettings): boolean {
  return st.telegram_enabled && st.telegram_feedback_notify && !!st.telegram_bot_token && !!st.telegram_chat_id;
}

export async function notifyFeedback(
  env: Bindings,
  st: AppSettings,
  m: { submissionId: string; name: string | null; title: string | null; score: number; total: number; feedback: string },
): Promise<void> {
  const pct = m.total ? Math.round((m.score / m.total) * 100) : 0;
  const base = env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "";
  // i18n-ignore-start: Telegram message text (server, Vietnamese)
  const lines = [
    "<b>NHẬN XÉT BÀI TẬP</b>",
    `Học sinh: <b>${esc(m.name ?? "—")}</b>`,
    `Bài: <b>${esc(m.title ?? "—")}</b>`,
    `Kết quả: <b>${m.score}/${m.total}</b> (${pct}%)`,
    "",
    esc(m.feedback),
  ];
  if (base) lines.push("", `Xem chi tiết: ${base}/s/${m.submissionId}`);
  // i18n-ignore-end
  await sendTelegram(st.telegram_bot_token, st.telegram_chat_id, lines.join("\n")).catch(() => {});
}
