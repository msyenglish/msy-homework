// Interface language picker for account menus: a two-way segmented switch.
import { Languages } from "lucide-react";
import { UI_LANGS } from "@msyen/shared";
import { getLang, setLang, t } from "../i18n";
import { cn } from "../lib/utils";

export default function LanguageSwitch() {
  const cur = getLang();
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
      <Languages className="size-4 text-slate-400" />
      <span className="flex-1 font-medium">{t("common.language")}</span>
      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
        {UI_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (l !== cur) setLang(l);
            }}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-bold uppercase transition",
              l === cur ? "bg-cyan-500 text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
