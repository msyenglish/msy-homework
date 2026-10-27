import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Settings, ShieldCheck, Type } from "lucide-react";
import { auth } from "../lib/api";
import { Avatar } from "./Avatar";
import SettingsDrawer from "./SettingsDrawer";
import LanguageSwitch from "./LanguageSwitch";
import { t } from "../i18n";

// Avatar giáo viên → dropdown: tên, email, cài đặt, đăng xuất.
export default function AvatarMenu() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["auth", "me"], queryFn: auth.me });
  const teacher = data?.teacher;
  const name = teacher?.name || t("common.teacher");
  const email = teacher?.email || "";
  const seed = teacher?.id || email || name;

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  async function signOut() {
    await auth.logout().catch(() => {});
    await qc.invalidateQueries({ queryKey: ["auth", "me"] });
    navigate("/teacher/login", { replace: true });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("common.account")}
        className="flex items-center rounded-full transition hover:opacity-90"
      >
        <Avatar seed={seed} size={36} className="ring-2 ring-white dark:ring-slate-800" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header: avatar + tên + email */}
          <div className="flex items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <Avatar seed={seed} size={48} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-bold text-slate-900 dark:text-white">{name}</p>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                  <ShieldCheck className="size-3" /> {t("common.teacherBadge")}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
          </div>

          {/* Mục */}
          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Settings className="size-4 text-slate-400" /> {t("common.settings")}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                navigate("/teacher/texts");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Type className="size-4 text-slate-400" /> {t("teacherTexts.page.title")}
            </button>
            <LanguageSwitch />
          </div>

          <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut className="size-4" /> {t("common.logout")}
            </button>
          </div>
        </div>
      )}

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
