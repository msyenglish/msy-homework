// Câu hỏi NỐI CẶP (matching): 2 cột — bấm 1 ô cột A rồi 1 ô cột B để nối.
// - Mỗi cặp 1 MÀU riêng (2 ô + đường cong cùng màu) → dễ nhìn, không cần số.
// - Bấm lại ô đã nối (A hoặc B) để gỡ cặp, chọn lại.
// - Đường cong SVG mềm mại nối tâm mép trong của 2 ô.
// value = JSON { [leftText]: rightText } — giữ nguyên encoding để server chấm.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { QuestionInputProps } from "../types";
import { decodeMatching, encodeMatching } from "../../../lib/practiceAnswers";
import { QImage } from "../QImage";
import { cn } from "../../../lib/utils";
import type { VisualItem } from "@msyen/shared";

// Bảng màu cho từng cặp (card + chấm nối + nét vẽ). Mỗi cặp lấy 1 màu theo thứ tự cột A.
// CỐ Ý bỏ đỏ (rose) và xanh lá (emerald): đó là màu KẾT QUẢ đúng/sai — nếu dùng để tô cặp
// vừa chọn, người học tưởng mình đã chấm đúng/sai. Giữ 6 màu trung tính (đủ cho tối đa 5 cặp).
const PAIR_COLORS = [
  { card: "border-cyan-400 bg-cyan-50 text-cyan-800 dark:border-cyan-500/60 dark:bg-cyan-500/15 dark:text-cyan-200", dot: "bg-cyan-500", stroke: "stroke-cyan-500 dark:stroke-cyan-400" },
  { card: "border-violet-400 bg-violet-50 text-violet-800 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200", dot: "bg-violet-500", stroke: "stroke-violet-500 dark:stroke-violet-400" },
  { card: "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-200", dot: "bg-amber-500", stroke: "stroke-amber-500 dark:stroke-amber-400" },
  { card: "border-fuchsia-400 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/60 dark:bg-fuchsia-500/15 dark:text-fuchsia-200", dot: "bg-fuchsia-500", stroke: "stroke-fuchsia-500 dark:stroke-fuchsia-400" },
  { card: "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-500/60 dark:bg-sky-500/15 dark:text-sky-200", dot: "bg-sky-500", stroke: "stroke-sky-500 dark:stroke-sky-400" },
  { card: "border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-500/60 dark:bg-orange-500/15 dark:text-orange-200", dot: "bg-orange-500", stroke: "stroke-orange-500 dark:stroke-orange-400" },
];

// Tô ĐÚNG/SAI sau khi chấm (chỉ khi có `pairResult`) — đè lên màu cặp để phản hồi tức thì.
const RESULT = {
  ok: { card: "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-200", dot: "bg-emerald-500" },
  bad: { card: "border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-200", dot: "bg-rose-500" },
};

function ItemBody({ item }: { item: VisualItem }) {
  return (
    <div className="min-w-0 flex-1">
      {item.image ? <QImage src={item.image} className="mb-1 max-h-16 rounded-md object-contain" /> : null}
      <span className="break-words text-sm font-medium">{item.text}</span>
    </div>
  );
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

// `pairResult` (tuỳ chọn): map leftText → đúng/sai, để tô xanh/đỏ sau khi chấm. Bài Quiz
// KHÔNG truyền (giữ nguyên hành vi khoá + màu cặp); bộ thẻ từ vựng truyền để phản hồi ngay.
export function MatchingInput({ q, value, onChange, graded, pairResult }: QuestionInputProps & { pairResult?: Record<string, boolean> | null }) {
  const lefts: VisualItem[] = q.lefts ?? [];
  const rights: VisualItem[] = q.rights ?? [];

  // Chia width HAI cột theo ĐỘ DÀI nội dung (lấp đủ 100%, dùng fr): cột chữ ngắn hẹp hơn nhưng
  // không bao giờ dưới 30% (khỏi cụt) cũng không quá 50% (khỏi lấn) → linh động mà vẫn cân.
  const gridCols = useMemo(() => {
    const maxLen = (arr: VisualItem[]) => arr.reduce((m, x) => Math.max(m, (x.text ?? "").trim().length), 1);
    const a = maxLen(lefts), b = maxLen(rights);
    const aFr = Math.max(0.3, Math.min(0.5, a / (a + b)));
    return `${aFr.toFixed(3)}fr ${(1 - aFr).toFixed(3)}fr`;
  }, [lefts, rights]);

  const [assign, setAssign] = useState<Record<string, string>>(() => decodeMatching(value));
  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [selRight, setSelRight] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const leftEls = useRef(new Map<string, HTMLElement>());
  const rightEls = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });

  function commit(next: Record<string, string>) {
    setAssign(next);
    onChange(encodeMatching(next));
  }
  // Gán right vào left: gỡ right khỏi mọi left khác rồi gán.
  function pair(leftText: string, rightText: string) {
    const next: Record<string, string> = {};
    for (const [l, r] of Object.entries(assign)) if (r !== rightText) next[l] = r;
    next[leftText] = rightText;
    commit(next);
  }
  function clearLeft(leftText: string) {
    const next = { ...assign };
    delete next[leftText];
    commit(next);
  }
  const clearSel = () => {
    setSelLeft(null);
    setSelRight(null);
  };
  // Chủ hiện tại của 1 right (left nào đang giữ), hoặc null.
  const rightOwner = (rt: string) => lefts.find((l) => assign[l.text] === rt)?.text ?? null;
  const colorIdxOfLeft = (lt: string) => lefts.findIndex((l) => l.text === lt) % PAIR_COLORS.length;

  function clickLeft(lt: string) {
    if (graded) return;
    if (assign[lt]) {
      clearLeft(lt);
      clearSel();
      return;
    }
    if (selRight != null) {
      pair(lt, selRight);
      clearSel();
      return;
    }
    setSelLeft((cur) => (cur === lt ? null : lt));
    setSelRight(null);
  }
  function clickRight(rt: string) {
    if (graded) return;
    const owner = rightOwner(rt);
    if (owner != null) {
      clearLeft(owner);
      clearSel();
      return;
    }
    if (selLeft != null) {
      pair(selLeft, rt);
      clearSel();
      return;
    }
    setSelRight((cur) => (cur === rt ? null : rt));
    setSelLeft(null);
  }

  // Đo vị trí các ô → tính điểm đầu/cuối đường cong (theo toạ độ trong container).
  useLayoutEffect(() => {
    const measure = () => {
      const cont = containerRef.current;
      if (!cont) return;
      const cr = cont.getBoundingClientRect();
      setBox({ w: cr.width, h: cr.height });
      const out: Line[] = [];
      for (const l of lefts) {
        const rt = assign[l.text];
        if (!rt) continue;
        const le = leftEls.current.get(l.text);
        const re = rightEls.current.get(rt);
        if (!le || !re) continue;
        const lb = le.getBoundingClientRect();
        const rb = re.getBoundingClientRect();
        out.push({
          x1: lb.right - cr.left,
          y1: lb.top + lb.height / 2 - cr.top,
          x2: rb.left - cr.left,
          y2: rb.top + rb.height / 2 - cr.top,
          stroke:
            graded && pairResult
              ? pairResult[l.text]
                ? "stroke-emerald-500 dark:stroke-emerald-400"
                : "stroke-rose-500 dark:stroke-rose-400"
              : PAIR_COLORS[colorIdxOfLeft(l.text)].stroke,
        });
      }
      setLines(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assign, value, graded, pairResult]);

  // 1 ô (dùng chung cột A/B) — colIdx quyết định chấm nối nằm mép trái hay phải.
  function Card({
    item,
    side,
    paired,
    ci,
    selected,
    result,
    onClick,
    setRef,
  }: {
    item: VisualItem;
    side: "left" | "right";
    paired: boolean;
    ci: number;
    selected: boolean;
    result?: boolean; // sau chấm: true=đúng · false=sai · undefined=không tô kết quả
    onClick: () => void;
    setRef: (el: HTMLElement | null) => void;
  }) {
    const res = result === undefined ? null : result ? RESULT.ok : RESULT.bad;
    const color = res ?? (paired ? PAIR_COLORS[ci] : null);
    return (
      <button
        ref={setRef}
        type="button"
        disabled={graded}
        onClick={onClick}
        className={cn(
          "relative flex w-full items-center gap-2 rounded-xl border-2 p-3 text-left transition",
          graded ? "cursor-default" : "cursor-pointer",
          color
            ? color.card
            : selected
              ? "border-cyan-500 bg-cyan-50 ring-2 ring-cyan-400/40 dark:border-cyan-400 dark:bg-cyan-500/10"
              : "border-slate-200 bg-white hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-800",
        )}
      >
        <ItemBody item={item} />
        {/* Chấm nối ở mép trong, canh đúng điểm đầu/cuối đường cong */}
        <span
          className={cn(
            "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-slate-900",
            side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
            color ? color.dot : selected ? "bg-cyan-500" : "bg-slate-300 dark:bg-slate-600",
          )}
        />
      </button>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="relative">
        {/* Lớp SVG vẽ đường cong (không chặn click) */}
        <svg
          className="pointer-events-none absolute inset-0"
          width={box.w}
          height={box.h}
          viewBox={`0 0 ${box.w} ${box.h}`}
          fill="none"
          aria-hidden
        >
          {lines.map((ln, i) => {
            const dx = Math.max(24, Math.abs(ln.x2 - ln.x1) * 0.5);
            const d = `M ${ln.x1} ${ln.y1} C ${ln.x1 + dx} ${ln.y1}, ${ln.x2 - dx} ${ln.y2}, ${ln.x2} ${ln.y2}`;
            return <path key={i} d={d} strokeWidth={2.5} strokeLinecap="round" className={ln.stroke} />;
          })}
        </svg>

        {/* Lấp đủ 100% bề ngang; tỉ lệ 2 cột tính động theo độ dài chữ (gridCols). */}
        <div className="grid gap-x-11 gap-y-3 sm:gap-x-16" style={{ gridTemplateColumns: gridCols }}>
          {/* Cột A */}
          <div className="space-y-3">
            {lefts.map((l) => (
              <Card
                key={l.text}
                item={l}
                side="left"
                paired={!!assign[l.text]}
                ci={colorIdxOfLeft(l.text)}
                selected={selLeft === l.text}
                result={graded && pairResult ? !!pairResult[l.text] : undefined}
                onClick={() => clickLeft(l.text)}
                setRef={(el) => {
                  if (el) leftEls.current.set(l.text, el);
                  else leftEls.current.delete(l.text);
                }}
              />
            ))}
          </div>
          {/* Cột B */}
          <div className="space-y-3">
            {rights.map((r) => {
              const owner = rightOwner(r.text);
              return (
                <Card
                  key={r.text}
                  item={r}
                  side="right"
                  paired={owner != null}
                  ci={owner != null ? colorIdxOfLeft(owner) : 0}
                  selected={selRight === r.text}
                  result={graded && pairResult && owner != null ? !!pairResult[owner] : undefined}
                  onClick={() => clickRight(r.text)}
                  setRef={(el) => {
                    if (el) rightEls.current.set(r.text, el);
                    else rightEls.current.delete(r.text);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
