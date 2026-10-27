// Drawer trượt từ phải — panel đầy đủ tính năng (quản lý nhóm…). Portal + backdrop, đóng khi
// bấm nền / Escape. Header chuẩn: icon thumb + tiêu đề + mô tả. Có footer dính đáy tuỳ chọn.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useOverlayHistory } from "../../lib/useOverlayHistory";
import { lockScroll, unlockScroll } from "../../lib/scrollLock";

export function Drawer({
  open,
  onClose,
  title,
  description,
  icon,
  footer,
  actions,
  children,
  widthClassName = "max-w-md",
  bodyClassName,
  history = true,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra header controls, shown left of the close button. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  widthClassName?: string;
  /** Overrides for the scrolling body, e.g. when the content brings its own fixed bar and scroller. */
  bodyClassName?: string;
  /** false when the caller already ties the drawer to the URL, so Back is handled there. */
  history?: boolean;
}) {
  // Back (browser or phone gesture) closes the drawer instead of leaving the page.
  useOverlayHistory(open && history, onClose);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div className={cn("relative flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900", widthClassName)}>
        {/* Header chuẩn: icon thumb + title + mô tả */}
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
          {icon && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/12 text-cyan-600 ring-1 ring-cyan-500/20 dark:text-cyan-400">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", bodyClassName)}>{children}</div>
        {/* px-4 matches the header and body, so a full-width footer button lines up with them. */}
        {footer && <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
