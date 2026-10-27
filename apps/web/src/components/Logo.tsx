import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { getBrand } from "../lib/brand";
import { t } from "../i18n";
// App logo: BrandLogo (full logo with the name) everywhere; LogoMark (square icon) only where a square is needed.
import markLight from "../assets/logo-mark-light.svg";
import markDark from "../assets/logo-mark-dark.svg";
import fullLight from "../assets/logo-full-light.svg";
import fullDark from "../assets/logo-full-dark.svg";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  subtitle?: string;
  className?: string;
  to?: string; // nếu có → bấm logo điều hướng về trang chính của khu
}

// Chiều cao (px) của logo full và cạnh (px) của icon vuông theo từng cỡ.
// Tăng cỡ để logo rõ hơn ở nav/header (nhiều chỗ trước đây nhìn nhỏ).
const sizes = {
  sm: { icon: 36, full: 38 },
  md: { icon: 44, full: 46 },
  lg: { icon: 60, full: 60 },
};

// Logo mark — follows light/dark mode. `wide` keeps the image's own aspect ratio (a wordmark logo).
export function LogoMark({ size = 34, className, on, wide }: { size?: number; className?: string; on?: "light" | "dark"; wide?: boolean }) {
  const { logoUrl, logoDarkUrl } = getBrand();
  const light = logoUrl ?? markLight;
  const dark = logoUrl ? (logoDarkUrl ?? logoUrl) : markDark;
  const img = wide ? "h-full w-auto max-w-[220px] object-contain" : "h-full w-full rounded-lg object-contain";
  // `on` pins the variant for a fixed background (e.g. a white tile) regardless of the theme.
  return (
    <span className={cn("relative inline-block shrink-0", className)} style={wide ? { height: size } : { width: size, height: size }} aria-hidden>
      {on ? (
        <img src={on === "light" ? light : dark} alt="" width={size} height={size} className={cn("block", img)} />
      ) : (
        <>
          <img src={light} alt="" width={size} height={size} className={cn("block dark:hidden", img)} />
          <img src={dark} alt="" width={size} height={size} className={cn("hidden dark:block", img)} />
        </>
      )}
    </span>
  );
}

/**
 * The one brand logo used everywhere a logo with the name appears (navs, login, footer, covers).
 * No custom logo → the built-in full logo (icon + "MSYen… English"). Custom logo → the app name
 * beside it, or the logo alone at its own proportions when "show the app name" is off.
 * `on` pins the variant for a fixed background ("dark" = white ink) regardless of the theme.
 */
export function BrandLogo({ height, on, className }: { height: number; on?: "light" | "dark"; className?: string }) {
  const { name, showName, logoUrl } = getBrand();
  if (!logoUrl) {
    const img = "block h-full w-auto";
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)} style={{ height }} aria-label={name} role="img">
        {on ? (
          <img src={on === "light" ? fullLight : fullDark} alt="" className={img} />
        ) : (
          <>
            <img src={fullLight} alt="" className={cn(img, "dark:hidden")} />
            <img src={fullDark} alt="" className={cn(img, "hidden dark:block")} />
          </>
        )}
      </span>
    );
  }
  if (!showName) {
    return (
      <span className={cn("inline-flex items-center", className)} style={{ height }} aria-label={name}>
        <LogoMark size={height} on={on} wide />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2", className)} style={{ height }} aria-label={name}>
      <LogoMark size={Math.round(height * 0.85)} on={on} />
      <span className={cn("whitespace-nowrap text-lg font-extrabold tracking-tight", on === "dark" ? "text-white" : on === "light" ? "text-slate-900" : "text-slate-900 dark:text-white")}>{name}</span>
    </span>
  );
}

/** Brand logo on a fixed background (video cover, reader watermark): `onDark` picks the white-ink variant. */
export function BrandWordmark({ height, onDark, className }: { height: number; onDark?: boolean; className?: string }) {
  return <BrandLogo height={height} on={onDark ? "dark" : "light"} className={className} />;
}

export function Logo({ size = "md", showText = true, subtitle, className, to }: LogoProps) {
  const s = sizes[size];
  const inner = showText ? (
    <div className="leading-none">
      <BrandLogo height={s.full} />
      {subtitle && <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{subtitle}</span>}
    </div>
  ) : (
    <LogoMark size={s.icon} />
  );
  // Có `to` → bọc Link (bấm về trang chính); không thì giữ nguyên div tĩnh.
  if (to) {
    return (
      <Link
        to={to}
        aria-label={t("shared.logo.home")}
        className={cn("inline-flex items-center rounded-lg transition-opacity hover:opacity-80", className)}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cn("inline-flex items-center", className)}>{inner}</div>;
}
