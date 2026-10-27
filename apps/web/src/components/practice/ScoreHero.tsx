import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

// ============================================================
//  Cụm điểm HERO dùng chung cho trang kết quả ĐỌC TO và NÓI.
//  Vòng điểm gradient phát sáng ở trên · các chỉ số thành phần (ô icon riêng màu)
//  xếp một hàng ở dưới, ngăn bằng gạch dọc. THEME-AWARE + hoạ tiết sóng hạt.
//  Đây là NGUỒN DUY NHẤT của cụm này — đừng chép JSX sang view khác.
// ============================================================

/** Một chỉ số thành phần. `tile`/`num` chỉ dùng khi colorBy="metric" (mỗi chỉ số một họ màu). */
export interface ScoreMetric {
  key: string;
  label: string;
  icon: LucideIcon;
  value: number;
  tile?: string;
  num?: string;
}

// Màu theo MỨC ĐIỂM (colorBy="score"): ≥80 xanh · 60–79 hổ phách · <60 đỏ.
// Dùng cho bài NÓI — 6 chỉ số mà tô 6 họ màu trang trí thì rối và đánh nhau với vòng điểm;
// để màu mang NGHĨA thì liếc phát ra ngay chỗ yếu.
function scoreNum(n: number) {
  if (n >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (n >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
const NEUTRAL_TILE = "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";

// Hoạ tiết SÓNG HẠT nền hero — nhiều đường sin chấm nhỏ, RÕ ở 2 mép, MỜ dần vào giữa
// (sau vòng điểm để không rối). Dùng currentColor → tự đổi theo theme.
function ScoreDecor() {
  const rows = 5;
  const cols = 34;
  return (
    <svg
      aria-hidden
      preserveAspectRatio="none"
      viewBox="0 0 400 170"
      className="pointer-events-none absolute inset-0 size-full text-cyan-500/25 dark:text-cyan-300/25"
    >
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const x = (c / (cols - 1)) * 400;
          const y = 85 + Math.sin((c / cols) * Math.PI * 3 + r * 0.9) * (16 + r * 5);
          const edge = Math.abs(x - 200) / 200; // 0 ở giữa → 1 ở mép
          const op = Math.max(0, edge - 0.15) * 0.9; // mờ hẳn quanh vòng điểm
          return <circle key={`${r}-${c}`} cx={x} cy={y} r={1.2} fill="currentColor" opacity={op} />;
        }),
      )}
    </svg>
  );
}

// Vòng điểm tổng: SVG stroke GRADIENT (xanh lá→cyan→hổ phách) bo tròn đầu + glow nhẹ.
// dasharray "dash circ" → chỉ hiện đúng cung = % điểm; -rotate-90 để bắt đầu từ đỉnh.
export function ScoreRing({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="relative grid size-32 place-items-center">
      {/* overflow-visible: để glow (drop-shadow) không bị viewBox/SVG cắt cạnh. */}
      <svg viewBox="0 0 120 120" className="size-full -rotate-90 overflow-visible">
        <defs>
          <linearGradient id="scoreHeroGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" className="stroke-slate-200 dark:stroke-slate-700/60" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#scoreHeroGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ filter: "drop-shadow(0 0 5px rgba(34,211,238,0.45))" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-extrabold leading-none text-slate-900 dark:text-white">{Math.round(pct)}</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{t("practice2.score.points")}</div>
      </div>
    </div>
  );
}

/**
 * `children` — optional slot right under the score ring.
 * `colorBy` — "metric": mỗi chỉ số một họ màu (đọc to, 4 chỉ số) · "score": màu theo mức điểm.
 */
export function ScoreHero({
  score,
  metrics,
  colorBy = "metric",
  children,
}: {
  score: number;
  metrics: ScoreMetric[];
  colorBy?: "metric" | "score";
  children?: ReactNode;
}) {
  // >4 chỉ số (bài nói có 6) xếp 1 hàng sẽ TRÀN → chuyển sang lưới 3 cột (mobile 2 cột).
  const grid = metrics.length > 4;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-6 shadow-lg dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 sm:px-8">
      {/* Hoạ tiết sóng hạt + vầng sáng nền sau vòng điểm. */}
      <ScoreDecor />
      <div className="pointer-events-none absolute left-1/2 top-2 size-48 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/15" />
      <div className="relative flex flex-col items-center gap-6">
        <ScoreRing score={score} />
        {children}
        <div
          className={cn(
            "grid w-full grid-cols-2 gap-x-2 gap-y-5",
            grid ? "sm:grid-cols-3" : "sm:flex sm:items-center sm:justify-center",
          )}
        >
          {metrics.map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={m.key}
                className={cn(
                  // Mobile: căn TRÁI trong ô lưới → icon/số thẳng cột (hết thụt ra thụt vào).
                  "flex items-center gap-2.5 max-sm:justify-start max-sm:pl-5",
                  // Lưới: giữ căn trái ở mọi khổ (gạch dọc sẽ rối khi xuống 2 hàng nên bỏ).
                  // Hàng ngang: chia đều, có gạch phân cách giữa các chỉ số.
                  grid
                    ? "sm:justify-start sm:pl-5"
                    : cn("sm:flex-1 sm:justify-center sm:px-2", i > 0 && "sm:border-l sm:border-slate-200 dark:sm:border-slate-700/60"),
                )}
              >
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-lg border",
                    colorBy === "score" ? NEUTRAL_TILE : m.tile,
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <div
                    className={cn(
                      "text-2xl font-extrabold leading-none",
                      colorBy === "score" ? scoreNum(m.value) : m.num,
                    )}
                  >
                    {Math.round(m.value)}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{m.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
