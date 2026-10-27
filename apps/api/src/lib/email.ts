// ============================================================
//  Transactional email through Resend (HTTP API, works on Workers).
//  Secret: RESEND_API_KEY. Sender: EMAIL_FROM (domain verified at Resend).
//  No key → throws so the caller knows (the endpoint still answers generically).
// ============================================================
import { applyTeacherTitle, type Brand } from "@msyen/shared";
import type { Bindings } from "./env";

const DEFAULT_FROM = "no-reply@example.com";

/** Sends one HTML email. Throws when the key is missing or Resend refuses. */
export async function sendEmail(
  env: Bindings,
  msg: { to: string; subject: string; html: string; fromName?: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("Chưa cấu hình RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || (msg.fromName ? `${msg.fromName} <${DEFAULT_FROM}>` : DEFAULT_FROM),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `Resend lỗi ${res.status}`);
  }
}

/** Password-reset email in the teacher's voice, with a button to the reset link. */
export function resetPasswordEmail(link: string, brand: Brand): { subject: string; html: string; fromName: string } {
  const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <h2 style="margin:0 0 12px;font-size:20px">Đặt lại mật khẩu</h2>
        <p style="margin:0 0 16px;line-height:1.6;color:#334155">
          Cô nhận được yêu cầu đặt lại mật khẩu cho tài khoản của em. Bấm nút dưới đây để tạo mật khẩu mới
          (link chỉ dùng được <b>một lần</b> và hết hạn sau <b>30 phút</b>).
        </p>
        <p style="margin:0 0 20px">
          <a href="${link}" style="display:inline-block;background:#06b6d4;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">
            Đặt lại mật khẩu
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#64748b">Nếu nút không bấm được, hãy sao chép link này:</p>
        <p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#0ea5e9">${link}</p>
        <p style="margin:0;font-size:13px;color:#94a3b8">
          Nếu em không yêu cầu điều này thì bỏ qua email nhé — mật khẩu hiện tại vẫn giữ nguyên.
        </p>
      </div>
    `;
  return {
    subject: `Đặt lại mật khẩu — ${brand.name}`,
    html: applyTeacherTitle(html, brand.title),
    fromName: brand.name,
  };
}
