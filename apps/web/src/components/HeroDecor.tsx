import type { ReactNode } from "react";
import { cn } from "../lib/utils";

// Hoạ tiết trang trí góc phải của header "hero".
// Mỗi seed → chọn CỐ ĐỊNH 1 hoạ tiết (khác nhau giữa các trang, không nhấp nháy khi re-render).

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mỗi phần tử là 1 hoạ tiết SVG (dùng currentColor để ăn theo màu/độ mờ của container).
const PATTERNS: ReactNode[] = [
  // 0 — Lục giác + lưới chấm
  <>
    <polygon points="150,20 200,50 200,110 150,140 100,110 100,50" stroke="currentColor" strokeWidth="2" fill="none" />
    {Array.from({ length: 5 }).map((_, r) =>
      Array.from({ length: 5 }).map((_, c) => <circle key={`h${r}-${c}`} cx={130 + c * 18} cy={70 + r * 18} r="2.5" fill="currentColor" />),
    )}
  </>,

  // 1 — Vòng tròn đồng tâm
  <>
    {[72, 56, 40, 24, 10].map((r) => (
      <circle key={`r${r}`} cx="158" cy="72" r={r} stroke="currentColor" strokeWidth="2" fill="none" />
    ))}
  </>,

  // 2 — Đường chéo song song
  <>
    {Array.from({ length: 10 }).map((_, i) => (
      <line key={`d${i}`} x1={40 + i * 20} y1="0" x2="220" y2={180 - i * 20} stroke="currentColor" strokeWidth="2" />
    ))}
  </>,

  // 3 — Cụm tam giác
  <>
    {Array.from({ length: 3 }).map((_, row) =>
      Array.from({ length: 4 }).map((_, col) => {
        const x = 108 + col * 26;
        const y = 30 + row * 30;
        return <polygon key={`t${row}-${col}`} points={`${x},${y + 22} ${x + 24},${y + 22} ${x + 12},${y}`} stroke="currentColor" strokeWidth="1.8" fill="none" />;
      }),
    )}
  </>,

  // 4 — Sóng lượn
  <>
    {Array.from({ length: 5 }).map((_, i) => (
      <path key={`w${i}`} d={`M92 ${34 + i * 22} q18 -16 36 0 t36 0 t36 0`} stroke="currentColor" strokeWidth="2" fill="none" />
    ))}
  </>,

  // 5 — Lưới dấu cộng
  <>
    {Array.from({ length: 4 }).map((_, r) =>
      Array.from({ length: 5 }).map((_, c) => {
        const x = 120 + c * 20;
        const y = 40 + r * 20;
        return (
          <g key={`p${r}-${c}`} stroke="currentColor" strokeWidth="2">
            <line x1={x - 5} y1={y} x2={x + 5} y2={y} />
            <line x1={x} y1={y - 5} x2={x} y2={y + 5} />
          </g>
        );
      }),
    )}
  </>,

  // 6 — Chấm tròn to nhỏ ngẫu nhiên (bokeh)
  <>
    {[
      [140, 40, 5], [176, 34, 8], [206, 66, 4], [128, 74, 10], [162, 84, 3.5],
      [196, 104, 7], [146, 116, 5.5], [182, 128, 4], [120, 108, 3], [208, 140, 6],
    ].map(([cx, cy, r], i) => (
      <circle key={`b${i}`} cx={cx} cy={cy} r={r} stroke="currentColor" strokeWidth="1.8" fill="none" />
    ))}
  </>,

  // 7 — Vuông xoay lồng nhau
  <>
    {[0, 12, 24, 36].map((d) => (
      <rect key={`s${d}`} x={110 + d} y={30 + d} width={100 - d * 2} height={100 - d * 2} rx="6" stroke="currentColor" strokeWidth="2" fill="none" transform="rotate(12 160 80)" />
    ))}
  </>,
];

// className cấp MÀU cho hoạ tiết (mặc định cyan; trang teacher truyền màu riêng: emerald/violet…).
export function HeroDecor({
  seed,
  className = "text-cyan-500/20 dark:text-cyan-400/15",
  mobile = false,
}: {
  seed: string;
  className?: string;
  /** Hiện hoạ tiết cả trên mobile (mặc định chỉ từ sm trở lên cho đỡ rối chữ). */
  mobile?: boolean;
}) {
  const pattern = PATTERNS[hashSeed(seed) % PATTERNS.length];
  // TỰ cắt trong phạm vi hero (overflow-hidden + bo góc) → hero không cần overflow-hidden,
  // nhờ đó popover (vd dropdown lọc) đặt trong hero không bị cắt.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div className={cn("absolute -right-6 -top-6", mobile ? "scale-75 origin-top-right sm:scale-100" : "hidden sm:block", className)}>
        <svg width="220" height="200" viewBox="0 0 220 200" fill="none">
          {pattern}
        </svg>
      </div>
    </div>
  );
}
