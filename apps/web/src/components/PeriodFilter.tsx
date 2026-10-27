import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, History } from "lucide-react";
import type { LeaderboardPeriod } from "../lib/api";
import { cn } from "../lib/utils";
import { t, type TKey } from "../i18n";

// Bộ lọc kỳ cho bảng xếp hạng: các kỳ HIỆN TẠI ở danh sách phẳng + nhóm "Kỳ trước"
// (quá khứ) tách sang 1 SUBMENU FLYOUT bên cạnh — không kéo dài popover chính (tránh
// scroll dọc/ngang). Flyout tự LẬT SANG TRÁI khi mép phải sát viewport → không bị lề
// màn hình cắt trên mobile.
const CURRENT: { value: LeaderboardPeriod; labelKey: TKey }[] = [
  { value: "week", labelKey: "teacherWidgets.periodFilter.week" },
  { value: "month", labelKey: "teacherWidgets.periodFilter.month" },
  { value: "quarter", labelKey: "teacherWidgets.periodFilter.quarter" },
  { value: "year", labelKey: "teacherWidgets.periodFilter.year" },
  { value: "all", labelKey: "common.all" },
];
const PAST: { value: LeaderboardPeriod; labelKey: TKey }[] = [
  { value: "last_week", labelKey: "teacherWidgets.periodFilter.lastWeek" },
  { value: "last_month", labelKey: "teacherWidgets.periodFilter.lastMonth" },
  { value: "last_quarter", labelKey: "teacherWidgets.periodFilter.lastQuarter" },
  { value: "last_year", labelKey: "teacherWidgets.periodFilter.lastYear" },
];

const LABELS: Record<string, TKey> = Object.fromEntries(
  [...CURRENT, ...PAST].map((o) => [o.value, o.labelKey]),
);

const FLYOUT_W = 176; // w-44

export function PeriodFilter({
  value,
  onChange,
}: {
  value: LeaderboardPeriod;
  onChange: (p: LeaderboardPeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [flyoutLeft, setFlyoutLeft] = useState(false);
  const [flyVert, setFlyVert] = useState<{ top?: number; bottom?: number }>({ top: 0 });
  const [menuMaxH, setMenuMaxH] = useState(360);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pastRowRef = useRef<HTMLButtonElement>(null);

  const isPast = useMemo(() => PAST.some((o) => o.value === value), [value]);

  // Mở popover: đo chỗ trống để lật lên/xuống + giới hạn chiều cao theo viewport.
  function toggle() {
    if (!open) {
      const r = ref.current?.getBoundingClientRect();
      if (r) {
        const below = window.innerHeight - r.bottom - 8 - 12;
        const above = r.top - 8 - 12;
        const up = below < 360 && above > below;
        setDropUp(up);
        setMenuMaxH(Math.max(200, Math.min(360, up ? above : below)));
      }
      setShowPast(isPast); // đang chọn kỳ trước → mở sẵn flyout cho dễ thấy
    }
    setOpen((o) => !o);
  }

  // Khi flyout mở: đặt nó SÁT popover & BÁM HÀNG "Kỳ trước".
  useEffect(() => {
    if (!open || !showPast) return;
    const outer = ref.current?.getBoundingClientRect();
    const row = pastRowRef.current?.getBoundingClientRect();
    if (!outer || !row) return;
    // Ngang: thiếu chỗ bên phải → lật sang trái.
    setFlyoutLeft(window.innerWidth - outer.right - 8 < FLYOUT_W + 12);
    // Dọc: đủ chỗ xuống → mép TRÊN flyout trùng mép trên hàng (Tuần trước ngang "Kỳ trước");
    //       thiếu chỗ → mép DƯỚI flyout trùng mép dưới hàng (Năm trước ngang "Kỳ trước", đổ lên).
    const flyoutH = PAST.length * 44 + 16;
    const goUp = window.innerHeight - row.top - 8 < flyoutH && row.bottom - flyoutH > 8;
    setFlyVert(goUp ? { bottom: outer.bottom - row.bottom } : { top: row.top - outer.top });
  }, [open, showPast]);

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

  function pick(p: LeaderboardPeriod) {
    onChange(p);
    setOpen(false);
  }

  const rowCls = (active: boolean) =>
    cn(
      "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
      active
        ? "bg-cyan-50 font-semibold text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400"
        : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
    );

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border px-4 text-left transition-colors focus:outline-none",
          open ? "border-cyan-500" : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
          "bg-white dark:bg-slate-800",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {isPast ? (
            <History className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
          ) : (
            <CalendarRange className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
          )}
          <span className="truncate text-slate-800 dark:text-white">{LABELS[value] ? t(LABELS[value]) : t("teacherWidgets.periodFilter.selectPeriod")}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          {/* Popover chính: chỉ các kỳ hiện tại + 1 dòng "Kỳ trước" mở flyout. */}
          <div
            ref={menuRef}
            style={{ maxHeight: menuMaxH }}
            className={cn(
              "absolute z-20 w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900",
              dropUp ? "bottom-full mb-2" : "mt-2",
            )}
          >
            {CURRENT.map((o) => (
              <button key={o.value} type="button" onClick={() => pick(o.value)} className={rowCls(o.value === value)}>
                <span className="flex items-center gap-2">
                  <CalendarRange className="size-4 text-slate-400" />
                  {t(o.labelKey)}
                </span>
                {o.value === value && <Check className="size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />}
              </button>
            ))}

            {/* Dòng "Kỳ trước" — bấm để mở/đóng submenu flyout bên cạnh. */}
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button
              ref={pastRowRef}
              type="button"
              onClick={() => setShowPast((v) => !v)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium transition-colors",
                isPast || showPast
                  ? "bg-slate-50 text-cyan-600 dark:bg-slate-800 dark:text-cyan-400"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <span className="flex items-center gap-2">
                <History className="size-4 text-slate-400" />
                {t("teacherWidgets.periodFilter.previousPeriod")}
              </span>
              {flyoutLeft ? (
                <ChevronLeft className={cn("size-4 shrink-0 text-slate-400 transition-colors", showPast && "text-cyan-500")} />
              ) : (
                <ChevronRight className={cn("size-4 shrink-0 text-slate-400 transition-colors", showPast && "text-cyan-500")} />
              )}
            </button>
          </div>

          {/* Submenu flyout: SÁT cạnh popover (ngoài vùng overflow → không bị cắt), bám
              đúng hàng "Kỳ trước"; lật trái khi sát mép phải. */}
          {showPast && (
            <div
              style={{ width: FLYOUT_W, ...flyVert }}
              className={cn(
                "absolute z-30 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900",
                flyoutLeft ? "right-full" : "left-full",
              )}
            >
              {PAST.map((o) => (
                <button key={o.value} type="button" onClick={() => pick(o.value)} className={rowCls(o.value === value)}>
                  <span className="flex items-center gap-2">
                    <History className="size-4 text-slate-400" />
                    {t(o.labelKey)}
                  </span>
                  {o.value === value && <Check className="size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
