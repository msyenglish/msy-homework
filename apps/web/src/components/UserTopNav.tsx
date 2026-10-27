// Header + nav of the public USER area. Lives in its own component because the practice pages sit
// OUTSIDE UserLayout (they carry their own hero and full-height layout) yet must show the same
// shell Self-contained: it fetches what it needs and owns logout.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, BookText, FileText, Info, LineChart, MoreHorizontal, Trophy, Type, UserRound } from "lucide-react";
import { formatPoints } from "@msyen/shared";
import { accountApi, libraryApi } from "../lib/api";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import { Logo } from "./Logo";
import { Popover } from "./ui";
import { useStudyPing } from "../lib/useStudyPing";
import { cn } from "../lib/utils";
import { LEARNING_QUERY_OPTS } from "../lib/learningRefresh";
import { t } from "../i18n";

// Nav labels stay ENGLISH: every one is a word an English learner already knows.
const TABS = [
  { to: "/u/library", label: "Library", icon: BookOpen },
  { to: "/u/grammar", label: "Grammar", icon: BookText },
  { to: "/u/vocabulary", label: "Vocabulary", icon: Type },
  { to: "/u/progress", label: "Progress", icon: LineChart },
  { to: "/u/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function UserTopNav() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });
  const { data: stats } = useQuery({ queryKey: ["user-stats"], queryFn: libraryApi.stats, ...LEARNING_QUERY_OPTS });
  // The shell is on every logged-in page, practice pages included, so the study clock lives here.
  useStudyPing(!!me?.user);

  async function logout() {
    await accountApi.logout().catch(() => {});
    qc.clear();
    navigate("/u/login", { replace: true });
  }

  const user = me?.user;

  // Account entries live only in the avatar popover, never in the horizontal nav.
  // "Monthly Report" is a CLASS privilege: only class members see it.
  const accountItems = [
    ...(user?.in_class ? [{ to: "/u/reports", label: "Monthly Report", icon: FileText }] : []),
    { to: "/u/account", label: "Account", icon: UserRound },
    { to: "/about", label: t("about.nav.menu"), icon: Info },
  ];

  return (
    <header className="relative z-30 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <nav className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3">
        <Logo size="sm" to="/u/library" />

        {/* Middle nav (desktop) — same shape as the student/teacher shells. */}
        <DesktopTabs />
        <div className="flex-1 sm:hidden" />

        {/* Points live in the nav, not in the hero. */}
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Trophy className="size-4" />
          <span className="text-sm font-bold tabular-nums">{formatPoints(stats?.points ?? 0)}</span>
        </span>
        <ThemeToggle />

        {user && (
          <AccountMenu
            seed={user.id}
            avatarUrl={user.avatar_url}
            name={user.name || t("userPages.topNav.you")}
            subtitle={user.email}
            points={stats?.points}
            onLogout={logout}
          >
            {/* Mobile: the main nav nests into the avatar popover (desktop already has the row). */}
            <div className="flex flex-col gap-1 sm:hidden">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} className={mobileItemCls}>
                  <t.icon className="size-[18px] sm:size-4" /> {t.label}
                  </NavLink>
              ))}
              <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
            </div>

            {/* Account entries — shown on desktop and mobile alike. */}
            <div className="flex flex-col gap-1">
              {accountItems.map((t) => (
                <NavLink key={t.to} to={t.to} className={mobileItemCls}>
                  <t.icon className="size-[18px] sm:size-4" /> {t.label}
                </NavLink>
              ))}
            </div>
          </AccountMenu>
        )}
      </nav>

    </header>
  );
}

/** Width reserved for the overflow button (icon + padding + gap). */
const MORE_W = 40;

/**
 * The horizontal nav, collapsing instead of wrapping. Below ~1000px the six tabs used to fold onto a
 * second line and make the header grow; now whatever does not fit moves into a "..." menu, in order,
 * so the row stays one line at every width.
 *
 * Measured, not guessed at breakpoints: the labels are words, and their width depends on the font
 * the browser actually loaded.
 */
function DesktopTabs() {
  const wrap = useRef<HTMLDivElement>(null);
  const widths = useRef<number[]>([]);
  const [shown, setShown] = useState(TABS.length);
  // While true everything is rendered, so the row can be measured; useLayoutEffect trims it back
  // before the browser paints, so the overflowing frame is never visible.
  const [measuring, setMeasuring] = useState(true);

  useLayoutEffect(() => {
    if (!measuring) return;
    const el = wrap.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-tab]"));
    if (items.length === TABS.length) widths.current = items.map((i) => i.offsetWidth + 4);
    const avail = el.clientWidth;
    const fits = (budget: number) => {
      let used = 0;
      let n = 0;
      for (const w of widths.current) {
        if (used + w > budget) break;
        used += w;
        n += 1;
      }
      return n;
    };
    const all = fits(avail);
    setShown(all === TABS.length ? all : fits(avail - MORE_W));
    setMeasuring(false);
  }, [measuring]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setMeasuring(true));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = measuring ? TABS : TABS.slice(0, shown);
  const hidden = measuring ? [] : TABS.slice(shown);

  return (
    <div className="hidden min-w-0 flex-1 sm:block">
      <div ref={wrap} className="flex items-center justify-center gap-1 overflow-hidden">
        {visible.map((t) => (
          <NavLink key={t.to} to={t.to} data-tab className={navLinkCls}>
            <t.icon className="size-[18px] sm:size-4" /> {t.label}
          </NavLink>
        ))}
        {hidden.length > 0 && (
          <Popover
            ariaLabel="More"
            align="right"
            triggerClassName="flex shrink-0 items-center rounded-lg px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            trigger={<MoreHorizontal className="size-[18px]" />}
          >
            {/* NavLink directly, not PopoverItem: that one is a <button>, and an anchor inside a
                button is invalid markup. */}
            {(close) => (
              <>
                {hidden.map((t) => (
                  <NavLink key={t.to} to={t.to} onClick={close} className={overflowItemCls}>
                    <t.icon className="size-4" /> {t.label}
                  </NavLink>
                ))}
              </>
            )}
          </Popover>
        )}
      </div>
    </div>
  );
}

// Nav link in the header (desktop).
const navLinkCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
    isActive
      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white",
  );

// Nav item inside the "..." overflow menu.
const overflowItemCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
    isActive
      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
  );

// Nav item inside the mobile popover.
const mobileItemCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-[15px] font-semibold transition sm:gap-2 sm:py-2 sm:text-sm",
    isActive
      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  );

/** Labels used for the browser tab title, kept next to the nav they come from. */
export const USER_NAV_ITEMS = [
  ...TABS,
  { to: "/u/reports", label: "Monthly Report" },
  { to: "/u/account", label: "Account" },
];
