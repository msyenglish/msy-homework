// The KPI tile of the progress dashboard, in ONE place. Every panel used to carry its own copy of a
// near-identical `Kpi`, which is how four of them drifted apart.
//
// Layout: icon · label + hint · value on the right. The value is the thing being compared across a
// row, so it sits where the eye lands last and is boxed in its own tinted pill. A percentage gets a
// ring instead — a proportion reads faster as a filled arc than as digits.
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Colour set of one tile: icon thumb, value pill, ring stroke. */
export type StatTone = keyof typeof TONES;

const TONES = {
  cyan: {
    thumb: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
    pill: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-800/60",
    ring: "text-cyan-500",
  },
  amber: {
    thumb: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    pill: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-800/60",
    ring: "text-amber-500",
  },
  emerald: {
    thumb: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-800/60",
    ring: "text-emerald-500",
  },
  rose: {
    thumb: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    pill: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-800/60",
    ring: "text-rose-500",
  },
  indigo: {
    thumb: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-800/60",
    ring: "text-indigo-500",
  },
  violet: {
    thumb: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    pill: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-800/60",
    ring: "text-violet-500",
  },
  slate: {
    thumb: "bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-300",
    pill: "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-200 dark:ring-slate-600",
    ring: "text-slate-400",
  },
} as const;

/** 2.728 -> "2.7k": the pill holds four characters, not a full thousands separator. */
export function compactNum(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k.toFixed(k < 10 ? 1 : 0).replace(/\.0$/, "")}k`;
}

/** Percentage as a stroked arc — 44px, the same footprint as the value pill beside it. */
function PercentRing({ value, tone }: { value: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-slate-100 dark:stroke-slate-700/70" />
        <circle
          cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          className={cn("stroke-current", tone)}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="relative text-[11px] font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
        {Math.round(pct)}
      </span>
    </span>
  );
}

export function StatTile({ icon, tone, label, hint, value, percent, onClick, active }: {
  icon: ReactNode;
  tone: StatTone;
  label: string;
  hint?: string;
  /** Rendered in the pill. Pass a pre-formatted string (use compactNum for raw counts). */
  value: string;
  /** 0-100 — swaps the pill for a ring. The value string still labels it underneath the arc. */
  percent?: number | null;
  onClick?: () => void;
  active?: boolean;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5", t.thumb)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
        {hint && <span className="block truncate text-[10px] text-slate-400">{hint}</span>}
      </span>
      {percent == null ? (
        <span className={cn("shrink-0 rounded-lg px-2 py-1 text-base font-extrabold leading-none tabular-nums ring-1 ring-inset", t.pill)}>
          {value}
        </span>
      ) : (
        <PercentRing value={percent} tone={t.ring} />
      )}
    </>
  );
  const cls = cn(
    "flex items-center gap-2 rounded-xl border bg-white p-2 pr-2.5 text-left shadow-sm transition dark:bg-slate-900",
    active
      ? "border-cyan-400 dark:border-cyan-600"
      : "border-slate-200 dark:border-slate-800",
    onClick && "hover:border-cyan-300 dark:hover:border-cyan-700",
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
