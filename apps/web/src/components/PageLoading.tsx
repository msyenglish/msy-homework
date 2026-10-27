import { cn } from "../lib/utils";
import { LogoMark } from "./Logo";
import { t } from "../i18n";

// Màn chờ dùng chung. `full` = trọn khung nhìn; mặc định = trong khung của khu vực đang tải.
export function PageLoading({
  label,
  full = false,
  className,
}: {
  label?: string;
  full?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-slate-400",
        full ? "min-h-dvh bg-slate-100 dark:bg-slate-950" : "py-16",
        className,
      )}
    >
      <LogoMark size={44} className="animate-pulse" />
      <p className="text-sm font-medium">{label ?? t("common.loading")}</p>
    </div>
  );
}
