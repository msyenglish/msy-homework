import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";

// Tooltip hover/focus dạng component (thay cho title mặc định của trình duyệt).
export function Tooltip({
  label,
  children,
  side = "top",
  className,
  clickable,
  block,
  hoverOnly,
  holdMs,
  panelClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
  /** How long the tip stays up, ms (default 2000). Raise it for a tip that is read, not glanced at. */
  holdMs?: number;
  /** Extra classes on the floating panel — e.g. a wider box for a rich tip. */
  panelClassName?: string;
  /** Tap to toggle (touch devices have no hover, so the default tooltip never fires).
      Tapping outside or scrolling closes it. */
  clickable?: boolean;
  /** Wrap in a <div> instead of a <span> — needed when the child is a block element (e.g. a truncated <h1>). */
  block?: boolean;
  /** Drop the tooltip entirely on touch devices. For a button that already opens something
      on tap, the tip fires on focus and covers the very panel the tap just opened. */
  hoverOnly?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  function open(e?: { target: EventTarget | null }) {
    if (hoverOnly && window.matchMedia?.("(hover: none)").matches) return;
    // Ignore events coming from a PORTALED descendant (a Popover panel rendered into document.body
    // still bubbles through the React tree). Without this, hovering anything inside the panel
    // reopens the trigger's tooltip — it blinks on and off as the pointer moves over the menu.
    const t = e?.target;
    if (t instanceof Node && ref.current && !ref.current.contains(t)) return;
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: side === "top" ? r.top : r.bottom });
    setShow(true);
  }
  const close = () => setShow(false);

  // Mở rồi thì TỰ ĐÓNG sau 2s. Trên máy cảm ứng, chạm nút = focus → tooltip bật lên mà không
  // bao giờ có onMouseLeave để tắt, nên nó nằm lì đè lên nội dung. Với chuột thì 2s cũng đủ đọc.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(close, holdMs ?? 2000);
    return () => clearTimeout(t);
  }, [show, holdMs]);

  // Cuộn trang là đóng — dù mở bằng chạm hay hover (ngón tay cuộn xong tooltip vẫn treo lơ lửng).
  useEffect(() => {
    if (!show) return;
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [show]);

  // Đang mở bằng CHẠM: đóng khi bấm ra ngoài / cuộn (không có onMouseLeave để tự đóng).
  useEffect(() => {
    if (!clickable || !show) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
    };
  }, [clickable, show]);

  const Wrap = block ? "div" : "span";

  return (
    <Wrap
      ref={ref as never}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onClick={clickable ? () => (show ? close() : open()) : undefined}
      className={cn(block ? "flex" : "inline-flex", className)}
    >
      {children}
      {show &&
        label &&
        createPortal(
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              transform: side === "top" ? "translate(-50%, calc(-100% - 6px))" : "translate(-50%, 6px)",
            }}
            className={cn(
              "pointer-events-none z-[200] max-w-[280px] rounded-md bg-slate-900 px-2 py-1 text-xs font-medium leading-snug text-white shadow-lg dark:bg-slate-700",
              panelClassName,
            )}
          >
            {label}
          </span>,
          document.body,
        )}
    </Wrap>
  );
}
