import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// Nút chuyển sáng/tối. Dùng ở header các trang.
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t("shared.theme.toLight") : t("shared.theme.toDark")}
      title={dark ? t("shared.theme.light") : t("shared.theme.dark")}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white",
        className,
      )}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
