import { cn } from "../lib/utils";

// Vòng tròn tiến độ: ring ngoài theo %, bên trong nửa trên = %, gạch ngang, nửa dưới = điểm/tổng.
export function ScoreRing({
  score,
  total,
  size = 54,
  showFraction = true,
  empty = false,
  className,
}: {
  score: number;
  total: number;
  size?: number;
  showFraction?: boolean;
  // Bài CHƯA làm: vẫn vẽ vòng (cho thẳng hàng với thẻ đã làm) nhưng rỗng + chữ "N/A".
  empty?: boolean;
  className?: string;
}) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const stroke = Math.max(3, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.min(100, pct) / 100);

  const tone = empty
    ? { arc: "stroke-transparent", text: "text-slate-400 dark:text-slate-500" }
    : pct >= 80
      ? { arc: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
      : pct >= 50
        ? { arc: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400" }
        : { arc: "stroke-rose-500", text: "text-rose-600 dark:text-rose-400" };

  return (
    <div className={cn("relative shrink-0", tone.text, className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Nền tròn mờ bên trong: che họa tiết/lưới hero để số điểm luôn đọc rõ (không trong suốt). */}
        <circle cx={size / 2} cy={size / 2} r={r} className="fill-white/90 dark:fill-slate-900/90" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={C}
          strokeDashoffset={off}
          strokeLinecap="round"
          className={cn("fill-none transition-all", tone.arc)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {empty ? (
          <span style={{ fontSize: size * 0.26 }} className="font-extrabold leading-none">N/A</span>
        ) : showFraction ? (
          <>
            <span style={{ fontSize: size * 0.24 }} className="font-extrabold leading-none">
              {pct}
              <span className="text-[0.62em] font-bold">%</span>
            </span>
            <span className="my-[3px] h-px bg-current opacity-30" style={{ width: size * 0.42 }} />
            <span style={{ fontSize: size * 0.18 }} className="font-semibold leading-none opacity-80">{score}/{total}</span>
          </>
        ) : (
          <span style={{ fontSize: size * 0.3 }} className="font-extrabold leading-none">
            {pct}
            <span className="text-[0.5em] font-bold">%</span>
          </span>
        )}
      </div>
    </div>
  );
}
