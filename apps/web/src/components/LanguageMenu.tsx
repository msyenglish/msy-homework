// Compact interface-language picker for top navs: shows the active code, lists every language.
import { Check, Languages } from "lucide-react";
import { UI_LANGS } from "@msyen/shared";
import { Popover, PopoverItem } from "./ui";
import { getLang, LANG_LABEL, setLang, t } from "../i18n";

export default function LanguageMenu() {
  const cur = getLang();
  return (
    <Popover
      align="right"
      ariaLabel={t("nav.language")}
      panelClassName="w-44 rounded-xl p-1.5"
      triggerClassName="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
      trigger={
        <>
          <Languages className="size-[18px]" />
          <span className="hidden text-xs font-bold uppercase sm:inline">{cur}</span>
        </>
      }
    >
      {(close) =>
        UI_LANGS.map((l) => (
          <PopoverItem
            key={l}
            active={l === cur}
            onClick={() => {
              close();
              if (l !== cur) setLang(l);
            }}
          >
            <span className="w-6 text-xs font-bold uppercase text-slate-400">{l}</span>
            <span className="flex-1">{LANG_LABEL[l]}</span>
            {l === cur && <Check className="size-4" />}
          </PopoverItem>
        ))
      }
    </Popover>
  );
}
