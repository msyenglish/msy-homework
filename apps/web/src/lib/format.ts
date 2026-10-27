import { SKILL_LIST } from "@msyen/shared";
import { getLang, t } from "../i18n";

export const pct = (s: number, t: number) => (t ? Math.round((s / t) * 100) : 0);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(getLang() === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    // Luôn hiển thị giờ Việt Nam (GMT+7), không phụ thuộc thiết bị.
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/**
 * Mốc thời gian đầy đủ, sắp xếp được: `2026-07-17 17:22:43`.
 * Dùng cho khu quản trị (cần biết chính xác đến giây, dễ so hai bản ghi).
 * Mẹo: locale "sv-SE" cho ra đúng dạng ISO-ngắt-khoảng-trắng; giờ vẫn ghim GMT+7 như fmtDate.
 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Day only: `17/07/2026`. Vietnam time, no clock — `fmtDate` puts the time FIRST in vi-VN. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(getLang() === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** Relative time, Vietnamese wording; falls back to the day once older than a month. */
export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t("lib.format.ago.justNow");
  if (mins < 60) return t("lib.format.ago.minutes", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("lib.format.ago.hours", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("lib.format.ago.days", { n: days });
  return fmtDay(iso);
}

/** Presence buckets derived from `last_seen_at` (online window = 5 min, matching the server). */
export type Presence = "online" | "recent" | "away" | "never";
export function presenceOf(lastSeenAt: string | null | undefined): Presence {
  if (!lastSeenAt) return "never";
  const t = new Date(lastSeenAt).getTime();
  if (isNaN(t)) return "never";
  const mins = (Date.now() - t) / 60000;
  if (mins < 5) return "online";
  if (mins < 24 * 60) return "recent";
  return "away";
}

// Nhãn kỹ năng (tiếng Anh) — lấy từ registry dùng chung ở @msyen/shared.
// Giữ tên export cũ để các nơi đang import không phải đổi.
export const SKILL_LABEL: Record<string, string> = Object.fromEntries(
  SKILL_LIST.map((m) => [m.key, m.label]),
);
