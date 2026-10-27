import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { useOverlayHistory } from "../lib/useOverlayHistory";
import { lockScroll, unlockScroll } from "../lib/scrollLock";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  // Biểu tượng thumb chuẩn đứng trước tiêu đề (truyền icon lucide, Drawer tự bọc ô).
  // Bỏ trống nếu `title` đã tự chứa thumb riêng (vd SkillThumb).
  icon?: ReactNode;
  // Class màu cho ô thumb (mặc định tông cyan).
  iconTone?: string;
}

// Drawer trượt từ phải — thay cho popup modal, giữ không gian phía trái vẫn dùng được.
export default function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-md",
  icon,
  iconTone,
}: DrawerProps) {
  // Back (browser or phone gesture) closes the drawer instead of leaving the page.
  useOverlayHistory(open, onClose);

  useEffect(() => {
    if (!open) return;
    lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal ra body: tránh bị neo sai khi tổ tiên có transform/filter/backdrop-blur.
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-full flex-col bg-slate-50 shadow-2xl dark:bg-slate-900",
          width,
        )}
        style={{ animation: "fade-in 0.2s ease-out" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div
                className={cn(
                  "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
                  iconTone || "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
                )}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>}
              {description && (
                <p className="mt-0.5 truncate text-sm text-slate-500" title={typeof description === "string" ? description : undefined}>
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
