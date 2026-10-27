// Thumbnail SINH BẰNG CODE (Memphis/geometric) cho thẻ bài ở lưới thư viện — thay ảnh thật khi
// bài chưa có ảnh. Mỗi LOẠI bài có bộ hoạ tiết + bảng màu riêng; slug quyết định bố cục nên
// một bài luôn ra đúng một hình (không nhấp nháy khi re-render, không cần lưu gì).
//
// Quy tắc dựng: nền tint theo loại → 1 lớp nền lặp (lưới/chấm/sọc) → 5 hoạ tiết đặt vào các
// NEO cố định quanh mép (giữa để trống cho icon + tiêu đề chồng lên).
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type ThumbKind = "grammar" | "reading" | "listening" | "vocabulary" | "writing" | "record" | "video" | "mixed";

// PRNG tất định: seed chuỗi → chuỗi số ổn định.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bảng màu 3 tông cho từng loại (pastel, đọc được trên cả nền sáng lẫn tối).
const PALETTE: Record<ThumbKind, [string, string, string]> = {
  grammar: ["#0ea5e9", "#6366f1", "#facc15"],
  reading: ["#10b981", "#14b8a6", "#f97316"],
  listening: ["#8b5cf6", "#e879f9", "#38bdf8"],
  vocabulary: ["#f59e0b", "#fb923c", "#10b981"],
  writing: ["#f43f5e", "#ec4899", "#f59e0b"],
  record: ["#f43f5e", "#fb7185", "#6366f1"],
  video: ["#d946ef", "#e879f9", "#6366f1"],
  mixed: ["#06b6d4", "#8b5cf6", "#f59e0b"],
};

// Nền tint (lớp Tailwind literal để Tailwind quét được).
// Kept light so the solid skill chip on top stays legible (see THUMB_CHIP).
const TINT: Record<ThumbKind, string> = {
  grammar: "bg-sky-500/15 dark:bg-sky-400/20",
  reading: "bg-emerald-500/15 dark:bg-emerald-400/20",
  listening: "bg-violet-500/15 dark:bg-violet-400/20",
  vocabulary: "bg-amber-500/15 dark:bg-amber-400/20",
  writing: "bg-rose-500/15 dark:bg-rose-400/20",
  record: "bg-rose-500/15 dark:bg-rose-400/20",
  video: "bg-fuchsia-500/15 dark:bg-fuchsia-400/20",
  mixed: "bg-cyan-500/15 dark:bg-cyan-400/20",
};

type Motif = "ring" | "rings3" | "dotgrid" | "crossCol" | "squiggle" | "halfDisc" | "triOutline" | "bars" | "zigzag" | "sprinkles" | "arcs" | "pill" | "play" | "diamond" | "stairs";
type BgLayer = "grid" | "dots" | "stripes";

// Bộ hoạ tiết + lớp nền theo loại bài.
const KIND: Record<ThumbKind, { bg: BgLayer; motifs: Motif[] }> = {
  grammar: { bg: "grid", motifs: ["crossCol", "diamond", "dotgrid", "pill", "rings3"] },
  reading: { bg: "dots", motifs: ["bars", "halfDisc", "arcs", "ring", "dotgrid"] },
  listening: { bg: "dots", motifs: ["squiggle", "rings3", "halfDisc", "sprinkles", "ring"] },
  vocabulary: { bg: "dots", motifs: ["sprinkles", "pill", "ring", "stairs", "dotgrid"] },
  writing: { bg: "stripes", motifs: ["zigzag", "halfDisc", "squiggle", "ring", "sprinkles"] },
  record: { bg: "stripes", motifs: ["zigzag", "arcs", "ring", "squiggle", "dotgrid"] },
  video: { bg: "stripes", motifs: ["play", "triOutline", "arcs", "dotgrid", "pill"] },
  mixed: { bg: "grid", motifs: ["diamond", "squiggle", "halfDisc", "sprinkles", "stairs"] },
};

// Neo đặt hoạ tiết — bám mép, chừa vùng giữa cho icon kỹ năng + tiêu đề.
const ANCHORS: [number, number][] = [
  [30, 32], [290, 28], [34, 132], [286, 134], [160, 20], [160, 142], [92, 28], [236, 138],
];

/** Một hoạ tiết vẽ quanh gốc toạ độ (bán kính ~18) — fill dùng bảng màu, nét dùng currentColor. */
function motif(kind: Motif, c: [string, string, string], r: () => number): ReactNode {
  const c1 = c[Math.floor(r() * 3)];
  const c2 = c[Math.floor(r() * 3)];
  switch (kind) {
    case "ring":
      return (
        <>
          <circle r="15" fill={c1} opacity="0.9" />
          <circle r="20" fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      );
    case "rings3":
      return (
        <>
          {[20, 14, 8].map((rad) => (
            <circle key={rad} r={rad} fill="none" stroke={c1} strokeWidth="2.5" />
          ))}
        </>
      );
    case "dotgrid":
      return (
        <>
          {Array.from({ length: 4 }).map((_, row) =>
            Array.from({ length: 4 }).map((_, col) => (
              <circle key={`${row}-${col}`} cx={-15 + col * 10} cy={-15 + row * 10} r="1.8" fill="currentColor" />
            )),
          )}
        </>
      );
    case "crossCol":
      return (
        <>
          {[-16, 0, 16].map((y) => (
            <g key={y} stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="-6" y1={y - 6} x2="6" y2={y + 6} />
              <line x1="6" y1={y - 6} x2="-6" y2={y + 6} />
            </g>
          ))}
        </>
      );
    case "squiggle":
      return <path d="M-22 6 q7 -14 14 0 t14 0 t14 0" fill="none" stroke={c1} strokeWidth="4" strokeLinecap="round" />;
    case "halfDisc":
      return (
        <>
          <path d="M-20 8 a20 20 0 0 1 40 0 z" fill={c1} opacity="0.95" />
          <path d="M-20 8 a20 20 0 0 1 40 0" fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      );
    case "triOutline":
      return <polygon points="0,-18 18,14 -18,14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />;
    case "bars":
      return (
        <>
          {[26, 18, 22, 12].map((w, i) => (
            <rect key={i} x={-14} y={-16 + i * 9} width={w} height="4.5" rx="2.25" fill={i % 2 ? c2 : c1} opacity="0.95" />
          ))}
        </>
      );
    case "zigzag":
      return <polyline points="-22,8 -13,-8 -4,8 5,-8 14,8 22,-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />;
    case "sprinkles":
      return (
        <>
          {[[-16, -12, 20], [-2, -16, -35], [12, -8, 15], [-12, 6, -20], [4, 10, 40], [16, 4, -10]].map(([x, y, rot], i) => (
            <line key={i} x1={x} y1={y} x2={x + 7} y2={y} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${rot} ${x} ${y})`} />
          ))}
        </>
      );
    case "arcs":
      return (
        <>
          {[10, 16, 22].map((rad) => (
            <path key={rad} d={`M${-rad} 12 a${rad} ${rad} 0 0 1 ${rad * 2} 0`} fill="none" stroke={c1} strokeWidth="2.5" />
          ))}
        </>
      );
    case "pill":
      return <rect x="-20" y="-8" width="40" height="16" rx="8" fill={c2} opacity="0.9" stroke="currentColor" strokeWidth="1.6" />;
    case "play":
      return (
        <>
          <circle r="19" fill="none" stroke="currentColor" strokeWidth="2" />
          <polygon points="-6,-9 11,0 -6,9" fill={c1} />
        </>
      );
    case "diamond":
      return <rect x="-13" y="-13" width="26" height="26" fill={c1} opacity="0.85" stroke="currentColor" strokeWidth="2" transform="rotate(45)" />;
    case "stairs":
      return (
        <>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={-18 + i * 12} y={6 - i * 12} width="11" height="11" rx="2" fill={i === 1 ? c2 : c1} opacity="0.9" />
          ))}
        </>
      );
  }
}

/** Lớp nền lặp (mờ) — lưới ô, ma trận chấm hoặc sọc chéo. */
function bgLayer(layer: BgLayer, id: string): ReactNode {
  const common = { patternUnits: "userSpaceOnUse" as const };
  return (
    <>
      <defs>
        {layer === "grid" && (
          <pattern id={id} width="16" height="16" {...common}>
            <path d="M16 0H0V16" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        )}
        {layer === "dots" && (
          <pattern id={id} width="14" height="14" {...common}>
            <circle cx="2" cy="2" r="1.4" fill="currentColor" />
          </pattern>
        )}
        {layer === "stripes" && (
          <pattern id={id} width="14" height="14" patternTransform="rotate(35)" {...common}>
            <line x1="0" y1="0" x2="0" y2="14" stroke="currentColor" strokeWidth="2" />
          </pattern>
        )}
      </defs>
      <rect width="320" height="160" fill={`url(#${id})`} opacity="0.08" />
    </>
  );
}

/**
 * Thumbnail hoạ tiết theo loại bài. `seed` (slug bài) giữ bố cục cố định cho từng bài.
 */
export function PatternThumb({ kind, seed, className }: { kind: ThumbKind; seed: string; className?: string }) {
  const rnd = mulberry32(hashSeed(`${kind}:${seed}`));
  const cfg = KIND[kind] ?? KIND.mixed;
  const colors = PALETTE[kind] ?? PALETTE.mixed;
  const patternId = `bg-${(hashSeed(seed) % 100000).toString(36)}`;

  // Xáo neo theo seed rồi lấy 5 vị trí; 2 vị trí đầu là hoạ tiết LỚN (nhấn), còn lại nhỏ.
  const anchors = [...ANCHORS];
  for (let i = anchors.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
  }
  const picks = anchors.slice(0, 5).map(([x, y], i) => ({
    x,
    y,
    scale: (i < 2 ? 1.05 : 0.62) + rnd() * 0.22,
    rot: Math.round((rnd() * 2 - 1) * 24),
    motif: cfg.motifs[Math.floor(rnd() * cfg.motifs.length)],
    key: `${x}-${y}`,
  }));

  return (
    <svg
      viewBox="0 0 320 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn("absolute inset-0 size-full text-slate-900/60 opacity-[0.11] dark:text-white/70 dark:opacity-[0.10]", className)}
    >
      {bgLayer(cfg.bg, patternId)}
      {picks.map((p) => (
        <g key={p.key} transform={`translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.scale.toFixed(2)})`} opacity="1">
          {motif(p.motif, colors, rnd)}
        </g>
      ))}
    </svg>
  );
}

/** Loại thumbnail của một bài — record/video tách khỏi skill vì có giao diện riêng. */
export function thumbKind(o: { skill?: string | null; read_aloud?: boolean | null; video?: boolean | null }): ThumbKind {
  if (o.video) return "video";
  if (o.read_aloud) return "record";
  const s = o.skill as ThumbKind | undefined;
  return s && s in KIND ? s : "mixed";
}

// Skill chip on the thumb — deep solid fill (600/700) so it reads on top of TINT, which is
// the same hue but far lighter. Same shades in dark mode: white text needs the dark fill.
export const THUMB_CHIP: Record<ThumbKind, string> = {
  grammar: "bg-sky-700",
  reading: "bg-emerald-700",
  listening: "bg-violet-700",
  vocabulary: "bg-amber-600",
  writing: "bg-rose-600",
  record: "bg-rose-700",
  video: "bg-fuchsia-700",
  mixed: "bg-cyan-700",
};

export { TINT as THUMB_TINT };
