import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Avatar } from "./Avatar";
import { cn } from "../lib/utils";
import { t } from "../i18n";
import LanguageSwitch from "./LanguageSwitch";

// Avatar + popover tài khoản dùng chung cho HỌC SINH và USER công khai
// (đồng bộ với AvatarMenu của giáo viên). Nội dung tuỳ biến qua props.


/** Avatar ring shared by the trigger and the popover header. */
const RING = "ring-2 ring-white dark:ring-slate-800";

export interface AccountMenuProps {
  seed: string; // định danh avatar (id/email/tên)
  avatarUrl?: string | null; // ảnh hồ sơ thật (Google); trống → fallback avatar theo seed
  name: string;
  subtitle?: ReactNode; // email, điểm, hoặc thưởng
  children?: ReactNode; // mục chèn giữa header và Đăng xuất (vd link điều hướng trên mobile)
  childrenClassName?: string; // class cho khối children (vd "sm:hidden" để ẩn nav trên desktop)
  onLogout: () => void;
  logoutLabel?: string;
  triggerSize?: number;
  /** Total points → tier-coloured avatar frame (learners). */
  points?: number | null;
}

export default function AccountMenu({
  seed,
  avatarUrl,
  name,
  subtitle,
  children,
  childrenClassName,
  onLogout,
  logoutLabel = t("common.logout"),
  triggerSize = 36,
  points,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("common.account")}
        className="relative flex items-center rounded-full transition hover:opacity-90"
      >
        <Avatar seed={seed} src={avatarUrl} size={triggerSize} className={points == null ? RING : undefined} points={points} />

        {/* Mobile: gộp "hamburger" vào avatar để gợi ý đây cũng là menu điều hướng
            (chỉ khi có nav lồng trong popover — tức children). Ẩn từ sm trở lên. */}
        {children && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            {/* Cụm vạch nằm DƯỚI avatar: vạch 1 sát mép, vạch 2-3 hẳn ra ngoài. Không phủ
                lên ảnh nên bỏ luôn lớp scrim. Light slate-600 / dark white đều nổi trên header. */}
            <span className="absolute -bottom-[1px] left-1/2 h-[3px] w-3 -translate-x-1/2 rounded-full bg-slate-600 dark:bg-white/90" />
            <span className="absolute -bottom-[6px] left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-slate-600 dark:bg-white/90" />
            <span className="absolute -bottom-[11px] left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-slate-600 dark:bg-white/90" />
          </span>
        )}
      </button>

      {/* Capped to the viewport and split in three: the nav list scrolls, the identity header and
          the logout button stay put. On a short phone the full list used to run off the bottom of
          the screen and take Logout with it. */}
      {open && (
        <div className="absolute right-0 z-50 mt-3 flex max-h-[min(78vh,34rem)] w-[min(86vw,20rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-72 dark:border-slate-800 dark:bg-slate-900">
          {/* Header: avatar + name + subtitle */}
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <Avatar seed={seed} src={avatarUrl} size={48} className={points == null ? RING : undefined} points={points} />
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900 dark:text-white">{name}</p>
              {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
            </div>
          </div>

          {/* Mục tuỳ biến (đóng popover khi bấm bên trong) */}
          {children && (
            <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5", childrenClassName)} onClick={() => setOpen(false)}>
              {children}
            </div>
          )}

          <div className={cn("shrink-0 p-1.5", children && "border-t border-slate-100 dark:border-slate-800")}>
            <LanguageSwitch />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-3 text-[15px] font-semibold text-rose-600 transition hover:bg-rose-50 sm:py-2 sm:text-sm dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut className="size-[18px] sm:size-4" /> {logoutLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
