// Popover tối giản: 1 nút mở + panel nổi. Panel render qua PORTAL (document.body) nên KHÔNG bị
// cắt bởi `overflow-hidden` của khối cha (vd hero). Tự đóng khi bấm ra ngoài / Escape / cuộn.
// `children` là render-prop nhận `close` để panel tự đóng sau khi chọn.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "../Tooltip";
import { cn } from "../../lib/utils";

export function Popover({
  trigger,
  triggerClassName,
  triggerStyle,
  ariaLabel,
  title,
  align = "left",
  side = "down",
  panelClassName,
  matchTriggerWidth,
  children,
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Inline style for the trigger (e.g. a colour taken from data). */
  triggerStyle?: React.CSSProperties;
  ariaLabel?: string;
  title?: string; // tooltip (mặc định = ariaLabel) — nút icon-only vẫn có gợi ý khi hover
  align?: "left" | "right";
  side?: "down" | "up";
  panelClassName?: string;
  /** Panel takes the trigger's width — a menu narrower than the control it drops from reads broken. */
  matchTriggerWidth?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const [triggerW, setTriggerW] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Đo nút + panel để đặt panel (fixed) rồi KẸP trong viewport (fallback không để bị cắt lề).
  const place = useCallback(() => {
    if (!btnRef.current) return;
    const M = 8; // lề an toàn với mép màn hình
    const r = btnRef.current.getBoundingClientRect();
    setTriggerW(r.width);
    const pw = matchTriggerWidth ? r.width : panelRef.current?.offsetWidth ?? 160;
    const ph = panelRef.current?.offsetHeight ?? 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "right" ? r.right - pw : r.left;
    left = Math.max(M, Math.min(left, vw - pw - M));
    let top = side === "up" ? r.top - 4 - ph : r.bottom + 4;
    top = Math.max(M, Math.min(top, vh - ph - M));
    setPos({ top, left });
  }, [align, side, matchTriggerWidth]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  // Định vị LẠI khi panel đổi kích thước (vd menu → form Edit phình rộng) để không tràn/cắt lề.
  useEffect(() => {
    if (!open || !panelRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => place());
    ro.observe(panelRef.current);
    return () => ro.disconnect();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Scrolling the page moves the trigger away; scrolling a list inside the panel does not.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      {/* Gợi ý dùng <Tooltip> chứ KHÔNG phải `title` của trình duyệt: title hiện chậm ~1s, kiểu
          dáng do OS quyết, và trên máy cảm ứng thì không bao giờ hiện. Ẩn tooltip khi panel đang
          mở — chú thích che mất chính cái vừa bấm ra thì vô duyên. */}
      <Tooltip label={open ? "" : (title ?? ariaLabel ?? "")} side={side === "up" ? "top" : "bottom"} hoverOnly>
        <button ref={btnRef} type="button" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={triggerClassName} style={triggerStyle}>
          {trigger}
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              ...(matchTriggerWidth && triggerW ? { width: triggerW } : null),
            }}
            className={cn(
              // z cao hơn mọi modal (tối đa z-100) để popover mở TỪ TRONG modal không bị nấp sau.
              "z-[110] min-w-[10rem] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900",
              panelClassName,
            )}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

// Một dòng chọn trong popover (đánh dấu mục đang chọn).
export function PopoverItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition",
        active
          ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
          : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}
