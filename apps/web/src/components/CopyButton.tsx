import { useState } from "react";
import { Check, Link2, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { Tooltip } from "./Tooltip";
import { t } from "../i18n";

// Nút copy dạng icon: click → đổi sang dấu ✓ trong ~1.5s, không cần toast.
export function CopyButton({
  value,
  title = "Copy link",
  icon: Icon = Link2,
  ghost = false,
  className,
}: {
  value: string;
  title?: string;
  icon?: LucideIcon;
  ghost?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Tooltip label={copied ? t("shared.copy.done") : title}>
    <button
      type="button"
      onClick={copy}
      aria-label={title}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg transition",
        !ghost && "border",
        copied
          ? ghost
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-emerald-400 bg-emerald-50 text-emerald-600 dark:border-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : ghost
            ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
        className,
      )}
    >
      {copied ? <Check className="size-4" /> : <Icon className="size-4" />}
    </button>
    </Tooltip>
  );
}
