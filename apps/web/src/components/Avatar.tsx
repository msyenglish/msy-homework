import { useState } from "react";
import { cn } from "../lib/utils";
import { avatarTier } from "../lib/avatarTier";
import { t } from "../i18n";

// Avatar ngẫu nhiên (ổn định theo seed) qua DiceBear — dùng cho cả GV lẫn học sinh.
export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || "msyen")}`;
}

export function Avatar({
  seed,
  size = 40,
  className,
  src,
  points,
}: {
  seed: string;
  size?: number;
  className?: string;
  src?: string | null; // ảnh hồ sơ thật (vd Google); trống hoặc tải lỗi → fallback DiceBear theo seed
  /** Total points: when given, the avatar gets a frame coloured by its XP tier (bronze → master). */
  points?: number | null;
}) {
  // Nếu ảnh thật tải lỗi (URL hết hạn/chặn) thì quay về avatar sinh theo seed.
  const [failed, setFailed] = useState(false);
  const url = src && !failed ? src : avatarUrl(seed);
  const img = (px: number, extra?: string) => (
    <img
      src={url}
      onError={() => setFailed(true)}
      width={px}
      height={px}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn("shrink-0 rounded-full bg-slate-100 object-cover dark:bg-slate-800", extra, className)}
      style={{ width: px, height: px }}
    />
  );
  if (points == null) return img(size, "shadow-sm ring-2 ring-white dark:ring-slate-700");

  // Framed: a gradient ring in the tier colour, a thin white gap, then the photo.
  const tier = avatarTier(points);
  const pad = Math.max(3, Math.round(size / 14));
  const radius = (className ?? "").split(/\s+/).find((c) => /^!?rounded/.test(c))?.replace(/^!/, "") ?? "rounded-full";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", radius)}
      style={{ width: size, height: size, padding: pad, background: tier.gradient, boxShadow: `0 4px 14px -4px ${tier.glow}` }}
      title={`${t(tier.label)} · Lv ${tier.level}`}
    >
      {img(size - pad * 2, "ring-2 ring-white dark:ring-slate-900")}
    </span>
  );
}
