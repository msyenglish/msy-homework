// Range slider CHUẨN của repo — thay input[type=range] mặc định (viền/nền đen xấu).
// Track tô cyan phần đã chọn (biến --slider-fill), thumb tròn viền cyan; style ở index.css.
import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";

export function Slider({
  value, min = 0, max = 100, step = 1, onChange, className, "aria-label": ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  // Gradient tô phần đã chọn (cyan) — webkit dùng biến này; Firefox dùng ::-moz-range-progress.
  const style = { "--slider-fill": `linear-gradient(to right, #06b6d4 ${pct}%, rgb(148 163 184 / 0.35) ${pct}%)` } as CSSProperties;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      style={style}
      className={cn("msyen-slider", className)}
    />
  );
}
