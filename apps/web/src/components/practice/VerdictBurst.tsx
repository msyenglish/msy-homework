// Right/wrong celebration for typing drills: emoji + a real confetti burst on a correct answer,
// a shake on a wrong one. Emoji are allowed HERE by explicit decision of the project owner — the
// no-emoji rule covers UI chrome and lesson content, not this reaction moment.
//
// Everything is inline CSS keyframes and plain divs: no library, no asset to load.
import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

export type Verdict = "right" | "wrong";

const CONFETTI_COLORS = ["#22d3ee", "#10b981", "#f59e0b", "#f43f5e", "#a855f7", "#facc15"];
const PIECES = 28;

/** One confetti piece: an angle out of the centre, a distance, a spin and a stagger. */
interface Piece {
  dx: number;
  dy: number;
  rot: number;
  delay: number;
  color: string;
  round: boolean;
  size: number;
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => {
    // Spread evenly around the circle, then jitter, so the burst never clumps on one side.
    const angle = (i / PIECES) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist = 90 + Math.random() * 110;
    return {
      dx: Math.cos(angle) * dist,
      // Bias upward: gravity pulls the pieces back down in the second half of the animation.
      dy: Math.sin(angle) * dist - 30,
      rot: (Math.random() - 0.5) * 720,
      delay: Math.random() * 0.12,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: Math.random() > 0.6,
      size: 6 + Math.random() * 6,
    };
  });
}

export function VerdictBurst({ kind }: { kind: Verdict }) {
  const right = kind === "right";
  // Regenerated per mount, and the parent mounts one per Check, so no two bursts look alike.
  const pieces = useMemo(() => (right ? makePieces() : []), [right]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
      <style>{`
        @keyframes vb-pop{0%{transform:scale(.4);opacity:0}45%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
        @keyframes vb-float{0%{transform:translateY(3px)}100%{transform:translateY(-6px)}}
        @keyframes vb-shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-9px)}30%{transform:translateX(8px)}45%{transform:translateX(-6px)}60%{transform:translateX(5px)}80%{transform:translateX(-3px)}}
        @keyframes vb-fly{
          0%{transform:translate(-50%,-50%) rotate(0deg) scale(.6);opacity:0}
          12%{opacity:1;transform:translate(calc(-50% + var(--dx) * .18),calc(-50% + var(--dy) * .18)) rotate(calc(var(--rot) * .18)) scale(1)}
          100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy) + 70px)) rotate(var(--rot)) scale(.85);opacity:0}}
        @media (prefers-reduced-motion: reduce){
          .vb-piece{display:none}
          .vb-emoji{animation:vb-pop .3s ease-out both !important}
        }
      `}</style>

      {pieces.map((p, i) => (
        <span
          key={i}
          className="vb-piece absolute"
          style={
            {
              // Anchored dead centre; the keyframe carries its own -50% so the burst starts there.
              left: "50%",
              top: "50%",
              width: p.size,
              height: p.round ? p.size : p.size * 0.5,
              backgroundColor: p.color,
              borderRadius: p.round ? "9999px" : "2px",
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
              animation: `vb-fly 1.15s cubic-bezier(.2,.6,.3,1) ${p.delay}s both`,
            } as React.CSSProperties
          }
        />
      ))}

      <div className="flex flex-col items-center gap-1.5">
        <span
          className="vb-emoji text-5xl drop-shadow-xl sm:text-6xl"
          style={{
            animation: right
              ? "vb-pop .5s ease-out both, vb-float 1.2s ease-in-out .5s infinite alternate"
              : "vb-pop .3s ease-out both, vb-shake .5s ease-in-out .15s both",
          }}
        >
          {right ? "🎉" : "😕"}
        </span>
        <span
          style={{ animation: "vb-pop .5s ease-out both" }}
          className={cn(
            "rounded-full px-4 py-1.5 text-base font-extrabold text-white shadow-lg sm:text-lg",
            right ? "bg-emerald-500" : "bg-rose-500",
          )}
        >
          {right ? t("practice2.verdict.correct") : t("practice2.verdict.incorrect")}
        </span>
      </div>
    </div>
  );
}
