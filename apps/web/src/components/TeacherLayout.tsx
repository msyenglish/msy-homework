import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BookOpen, BookText, BookOpenText, Cpu, FileText, HandHeart, Menu, Route, Type, Users } from "lucide-react";
import { cn } from "../lib/utils";
import ThemeToggle from "./ThemeToggle";
import AvatarMenu from "./AvatarMenu";
import LanguageMenu from "./LanguageMenu";
import TeacherSettingsMenu from "./TeacherSettingsMenu";
import { Logo } from "./Logo";
import AppFooter from "./AppFooter";
import DonateDrawer from "./DonateDrawer";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { t, type TKey } from "../i18n";

const TAB_DEFS: { to: string; key: TKey; icon: typeof Users }[] = [
  { to: "students", key: "nav.learners", icon: Users },
  { to: "exercises", key: "nav.exercises", icon: BookOpen },
  { to: "vocab", key: "nav.vocabulary", icon: Type },
  { to: "grammar", key: "nav.grammar", icon: BookText },
  { to: "paths", key: "nav.paths", icon: Route },
  { to: "reports", key: "nav.reports", icon: FileText },
  { to: "ai", key: "nav.ai", icon: Cpu },
];


const linkClass = (isActive: boolean) =>
  cn(
    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
    isActive
      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white",
  );

export default function TeacherLayout() {
  const { pathname } = useLocation();
  const TABS = TAB_DEFS.map((d) => ({ ...d, label: t(d.key) }));
  // Tab title follows the active teacher section.
  const active = TABS.find((tab) => pathname.includes(`/teacher/${tab.to}`));
  useDocumentTitle(active ? t("nav.teacherTitleSuffix", { page: active.label }) : t("common.teacher"));

  // Fixed shell: only <main> scrolls, so the scrollbar starts below the header.
  useEffect(() => {
    document.documentElement.classList.add("shell-fixed");
    return () => document.documentElement.classList.remove("shell-fixed");
  }, []);

  // Mobile: nav collapses into a popover triggered by the hamburger.
  const [menuOpen, setMenuOpen] = useState(false);
  const [donate, setDonate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMenuOpen(false), [pathname]); // close on navigation
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="app-shell flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <header className="no-print relative z-20 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <nav className="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
          {/* Mobile: hamburger + popover */}
          <div ref={menuRef} className="relative sm:hidden">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("nav.menu")}
              aria-expanded={menuOpen}
              className="flex size-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Menu className="size-5" />
            </button>
            {menuOpen && (
              <div className="absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <NavLink
                      key={tab.to}
                      to={tab.to}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                          isActive
                            ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                        )
                      }
                    >
                      <Icon className="size-4" /> {tab.label}
                    </NavLink>
                  );
                })}
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                <NavLink
                  to="texts"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )
                  }
                >
                  <Type className="size-4" /> {t("teacherTexts.page.title")}
                </NavLink>
                <NavLink
                  to="guide"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10",
                    )
                  }
                >
                  <BookOpenText className="size-4" /> {t("teacherGuide.page.title")}
                </NavLink>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setDonate(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  <HandHeart className="size-4" /> {t("nav.footer.donate")}
                </button>
              </div>
            )}
          </div>

          <Logo size="sm" to="/teacher" />

          {/* Desktop: centered horizontal nav */}
          <div className="hidden flex-1 justify-center sm:flex">
            <div className="flex flex-wrap justify-center gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <NavLink key={tab.to} to={tab.to} className={({ isActive }) => linkClass(isActive)}>
                    <Icon className="size-4" />
                    <span>{tab.label}</span>
                  </NavLink>
                );
              })}
              <TeacherSettingsMenu triggerClassName={linkClass} />
              <button
                type="button"
                onClick={() => setDonate(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <HandHeart className="size-4" />
                <span>{t("nav.footer.donate")}</span>
              </button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <LanguageMenu />
            <ThemeToggle />
            <AvatarMenu />
          </div>
        </nav>
      </header>
      <main data-scroll-root className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="flex min-h-full flex-col">
          <div className="flex-1">
            <Outlet />
          </div>
          <AppFooter />
        </div>
      </main>
      <DonateDrawer open={donate} onClose={() => setDonate(false)} />
    </div>
  );
}
