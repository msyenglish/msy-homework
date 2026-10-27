import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { libraryApi, type GameTop } from "../../lib/api";

// Mini game "endless runner" giải trí trong lúc CHỜ chấm bài.
// Chạm (hoặc phím Space/↑) để nhảy qua chướng ngại; chạm phải thì chơi lại. Có nền
// parallax (trời/mây/đồi/đất), nhân vật chạy, độ khó tăng dần, kỷ lục bản thân + TOP chung.
// `onPlay` báo cha biết em ĐANG chơi (để đừng tự nhảy trang).
//
// Kỷ lục lưu theo TÀI KHOẢN USER (cookie) — không cần truyền danh tính vào đây nữa.
// Lỗi mạng thì nuốt: đây là trò chơi cho vui, không đáng chen báo lỗi vào màn chờ chấm.
export function WaitingGame({ onPlay }: { onPlay?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [top, setTop] = useState<GameTop["top"]>([]);
  const [dead, setDead] = useState(false);
  const [started, setStarted] = useState(false);
  const bestRef = useRef(0);

  // Kỷ lục + TOP lúc mở.
  useEffect(() => {
    let active = true;
    libraryApi
      .gameTop()
      .then((r) => {
        if (!active) return;
        setBest(r.best);
        bestRef.current = r.best;
        setTop(r.top);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  // Giữ onPlay trong ref → effect canvas KHÔNG phụ thuộc nó (cha re-render mỗi lần poll
  // tạo onPlay mới; nếu để vào deps sẽ tear-down + dựng lại game → RESET giữa chừng).
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = 22; // cạnh nhân vật
    const RX = 40; // x nhân vật
    const g = {
      y: 0,
      vy: 0,
      onGround: true,
      obstacles: [] as { x: number; w: number; h: number }[],
      clouds: [] as { x: number; y: number; s: number }[],
      hills: 0,
      ground: 0,
      speed: 210,
      spawn: 0.7,
      dist: 0,
      legT: 0,
      dead: false,
      started: false,
      submitted: false,
    };
    for (let i = 0; i < 3; i++) g.clouds.push({ x: Math.random() * 400, y: 14 + Math.random() * 34, s: 0.5 + Math.random() * 0.6 });

    let raf = 0;
    let lastT = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const isDark = () =>
      document.documentElement.classList.contains("dark") ||
      (!document.documentElement.classList.contains("light") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const reset = () => {
      g.y = 0;
      g.vy = 0;
      g.onGround = true;
      g.obstacles = [];
      g.speed = 210;
      g.spawn = 0.7;
      g.dist = 0;
      g.dead = false;
      g.submitted = false;
      setDead(false);
      setScore(0);
    };

    const die = () => {
      g.dead = true;
      setDead(true);
      const sc = Math.floor(g.dist / 10);
      if (!g.submitted) {
        g.submitted = true;
        if (sc > bestRef.current) {
          // Hiện kỷ lục mới NGAY, đừng bắt em chờ mạng; server trả về best/TOP chuẩn sau.
          bestRef.current = sc;
          setBest(sc);
          libraryApi
            .gameScore(sc)
            .then((r) => {
              bestRef.current = r.best;
              setBest(r.best);
              setTop(r.top);
            })
            .catch(() => {});
        }
      }
    };

    const loop = (t: number) => {
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const baseline = H - 22;
      const dark = isDark();

      if (g.started && !g.dead) {
        g.dist += g.speed * dt;
        g.speed += dt * 11; // nhanh dần
        g.legT += dt * g.speed * 0.04;
        g.vy += 1600 * dt;
        g.y += g.vy * dt;
        if (g.y > 0) {
          g.y = 0;
          g.vy = 0;
          g.onGround = true;
        }
        g.spawn -= dt;
        if (g.spawn <= 0) {
          const tall = Math.random() < 0.35;
          const h = tall ? 30 + Math.random() * 16 : 15 + Math.random() * 12;
          g.obstacles.push({ x: W + 20, w: 12 + Math.random() * 10, h });
          // Khoảng cách sinh ngắn dần theo tốc độ (khó dần) nhưng không quá gắt.
          g.spawn = Math.max(0.55, 1.05 - g.speed / 900) + Math.random() * 0.55;
        }
        for (const o of g.obstacles) o.x -= g.speed * dt;
        g.obstacles = g.obstacles.filter((o) => o.x + o.w > -14);
        for (const o of g.obstacles) {
          if (RX + S > o.x + 2 && RX + 2 < o.x + o.w && g.y > -o.h + 4) die();
        }
        setScore(Math.floor(g.dist / 10));
      }
      // Nền parallax luôn nhích nhẹ kể cả khi chờ.
      const bgSpeed = g.started && !g.dead ? g.speed : 40;
      g.ground = (g.ground + bgSpeed * dt) % 24;
      g.hills = (g.hills + bgSpeed * 0.25 * dt) % 80;
      for (const c of g.clouds) {
        c.x -= bgSpeed * 0.12 * c.s * dt;
        if (c.x < -40) {
          c.x = W + 20;
          c.y = 12 + Math.random() * 34;
        }
      }

      // ── VẼ ──
      // Trời (gradient)
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      if (dark) {
        sky.addColorStop(0, "#0b1220");
        sky.addColorStop(1, "#1e293b");
      } else {
        sky.addColorStop(0, "#cffafe");
        sky.addColorStop(1, "#ecfeff");
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // Mặt trời / trăng
      ctx.fillStyle = dark ? "rgba(226,232,240,0.25)" : "rgba(250,204,21,0.55)";
      ctx.beginPath();
      ctx.arc(W - 44, 34, 16, 0, Math.PI * 2);
      ctx.fill();
      // Mây
      ctx.fillStyle = dark ? "rgba(148,163,184,0.20)" : "rgba(255,255,255,0.85)";
      for (const c of g.clouds) {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 18 * c.s, 8 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 14 * c.s, c.y + 2, 12 * c.s, 7 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Đồi (parallax chậm)
      ctx.fillStyle = dark ? "#334155" : "#a7f3d0";
      for (let hx = -g.hills; hx < W + 80; hx += 80) {
        ctx.beginPath();
        ctx.arc(hx + 40, baseline + 6, 46, Math.PI, 0);
        ctx.fill();
      }
      // Đất
      ctx.fillStyle = dark ? "#1f2937" : "#86efac";
      ctx.fillRect(0, baseline + 1, W, H - baseline);
      ctx.strokeStyle = dark ? "#0f172a" : "#4ade80";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, baseline + 1);
      ctx.lineTo(W, baseline + 1);
      ctx.stroke();
      // Vạch đất chạy
      ctx.strokeStyle = dark ? "rgba(148,163,184,0.35)" : "rgba(22,101,52,0.35)";
      ctx.lineWidth = 2;
      for (let dx = -g.ground; dx < W; dx += 24) {
        ctx.beginPath();
        ctx.moveTo(dx, baseline + 9);
        ctx.lineTo(dx + 10, baseline + 9);
        ctx.stroke();
      }

      // Chướng ngại (cây xương rồng) — MÀU XANH LÁ rõ để dễ nhìn
      ctx.fillStyle = dark ? "#22c55e" : "#15803d";
      for (const o of g.obstacles) {
        ctx.beginPath();
        ctx.roundRect(o.x, baseline - o.h, o.w, o.h, 3);
        ctx.fill();
        if (o.h > 26) {
          ctx.beginPath();
          ctx.roundRect(o.x - 5, baseline - o.h + 8, 5, 10, 2);
          ctx.roundRect(o.x + o.w, baseline - o.h + 14, 5, 10, 2);
          ctx.fill();
        }
      }

      // Nhân vật (thân bo góc + mắt + 2 chân chạy)
      const ry = baseline - S + g.y;
      ctx.fillStyle = "#06b6d4";
      ctx.beginPath();
      ctx.roundRect(RX, ry, S, S, 5);
      ctx.fill();
      // chân — bám THÂN (cộng g.y) để nhảy theo, KHÔNG dính mặt đất khi bay lên
      const legUp = g.onGround ? Math.floor(g.legT) % 2 === 0 : false;
      const legBase = baseline - 3 + g.y;
      ctx.fillStyle = "#0e7490";
      ctx.fillRect(RX + 3, legBase + (legUp ? -2 : 0), 5, 4);
      ctx.fillRect(RX + S - 8, legBase + (legUp ? 0 : -2), 5, 4);
      // mắt
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(RX + S - 7, ry + 8, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(RX + S - 6, ry + 8, 1.3, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const jump = () => {
      if (!g.started) {
        g.started = true;
        setStarted(true);
        onPlayRef.current?.();
      }
      if (g.dead) {
        reset();
        onPlayRef.current?.();
        return;
      }
      if (g.onGround) {
        g.vy = -580;
        g.onGround = false;
        onPlayRef.current?.();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    const onPointer = (e: Event) => {
      e.preventDefault();
      jump();
    };
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
    // Chỉ dựng game 1 lần (onPlay đọc qua ref) → không reset khi cha re-render.
  }, []);

  return (
    <div className="select-none">
      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          className="h-[22rem] w-full touch-none rounded-xl border border-slate-200 shadow-inner dark:border-slate-800 sm:h-96"
        />
        {/* Điểm hiện tại + kỷ lục */}
        <div className="pointer-events-none absolute inset-x-0 top-2 flex items-center justify-between px-3 text-xs font-bold">
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-amber-600 dark:bg-slate-900/60 dark:text-amber-400">
            Best {Math.max(best, score)}
          </span>
          <span className="rounded-full bg-white/70 px-2 py-0.5 tabular-nums text-slate-700 dark:bg-slate-900/60 dark:text-slate-100">
            {score}
          </span>
        </div>
        {!started && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-800/90 dark:text-slate-100">
              Tap / Space to jump 🏃
            </span>
          </div>
        )}
        {dead && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="rounded-full bg-rose-500/90 px-3 py-1 text-sm font-bold text-white shadow-sm">
              Scored {score}! Tap to play again
            </span>
          </div>
        )}
      </div>

      {/* TOP chung — chỉ hiện khi đã có ai đó lập kỷ lục (bảng vừa reset thì trống). */}
      {top.length > 0 && (
        <div className="mt-2 flex items-center gap-2 overflow-x-auto rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] dark:bg-slate-800/60">
          <span className="flex shrink-0 items-center gap-1 font-bold text-amber-500">
            <Trophy className="size-3.5" /> TOP
          </span>
          {top.slice(0, 5).map((t, i) => (
            <span key={i} className="shrink-0 whitespace-nowrap text-slate-500 dark:text-slate-300">
              <span className="font-bold text-slate-700 dark:text-slate-100">{i + 1}.</span> {t.name.split(" ").slice(-1)[0]}{" "}
              <span className="font-semibold text-cyan-600 dark:text-cyan-400">{t.score}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
