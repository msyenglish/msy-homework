// Teacher nav "Settings" dropdown: general settings drawer + interface text editor.
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpenText, ChevronDown, Settings, SlidersHorizontal, Type } from "lucide-react";
import { Popover, PopoverItem } from "./ui";
import SettingsDrawer from "./SettingsDrawer";
import { t } from "../i18n";

export default function TeacherSettingsMenu({ triggerClassName }: { triggerClassName: (active: boolean) => string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const onTexts = pathname.startsWith("/teacher/texts");
  const onGuide = pathname.startsWith("/teacher/guide");
  return (
    <>
      <Popover
        panelClassName="w-56 rounded-xl p-1.5"
        triggerClassName={triggerClassName(onTexts || onGuide)}
        trigger={
          <>
            <Settings className="size-4" />
            <span>{t("common.settings")}</span>
            <ChevronDown className="size-3.5 opacity-60" />
          </>
        }
      >
        {(close) => (
          <>
            <PopoverItem
              onClick={() => {
                close();
                setDrawer(true);
              }}
            >
              <SlidersHorizontal className="size-4 text-slate-400" /> {t("nav.settingsGeneral")}
            </PopoverItem>
            <PopoverItem
              active={onTexts}
              onClick={() => {
                close();
                navigate("/teacher/texts");
              }}
            >
              <Type className="size-4 text-slate-400" /> {t("teacherTexts.page.title")}
            </PopoverItem>
            <PopoverItem
              active={onGuide}
              onClick={() => {
                close();
                navigate("/teacher/guide");
              }}
            >
              <BookOpenText className="size-4 text-slate-400" /> {t("teacherGuide.page.title")}
            </PopoverItem>
          </>
        )}
      </Popover>
      <SettingsDrawer open={drawer} onClose={() => setDrawer(false)} />
    </>
  );
}
