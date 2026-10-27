import { forwardRef, useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { SelectHTMLAttributes, ReactNode } from "react";
import { Check, ChevronDown, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
  /** Short muted tag after the label (e.g. "No key"), shown in the menu and on the button. */
  hint?: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
  value?: string;
  /**
   * Lớp CSS cho MENU thả xuống. Menu mặc định `w-full` (rộng bằng nút) — khi nút được thu nhỏ
   * thành dạng text trần thì menu sẽ hẹp theo và cắt mất nhãn dài; truyền vd "w-56 right-0"
   * để nới rộng và neo mép phải. Không truyền → giữ nguyên hành vi cũ.
   */
  menuClassName?: string;
  /**
   * Trần chiều cao MENU (px) — mặc định 384 (≈8 mục). Danh sách dài hơn sẽ có scrollbar;
   * truyền số lớn hơn để hiện trọn (vd 9 cấp độ). Vẫn bị chặn bởi chỗ trống viewport.
   */
  menuMaxHeight?: number;
  /**
   * Nội dung PHỤ ở đáy menu (vd nút "Quản lý…") — ngăn cách bằng viền trên, luôn dính đáy.
   * Nhận hàm `close` để tự đóng menu khi bấm (mở popover khác). Không truyền → không hiện.
   */
  menuFooter?: (close: () => void) => ReactNode;
  /**
   * Render MENU qua portal (position: fixed) để KHÔNG bị `overflow-hidden` của khối cha cắt
   * (vd Select nằm trong thẻ ghi âm / popover). Bật khi Select đặt trong vùng có overflow ẩn.
   */
  menuPortal?: boolean;
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder = "Select...",
      fullWidth = true,
      disabled,
      required,
      value,
      onChange,
      className = "",
      menuClassName = "",
      menuMaxHeight = 384,
      menuFooter,
      menuPortal = false,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedValue, setSelectedValue] = useState(value || "");
    const dropdownRef = useRef<HTMLDivElement>(null);
    // In portal mode the menu lives on document.body, outside dropdownRef — it needs its own ref
    // so a mousedown on an option is not treated as a click outside (which would unmount the
    // option before its click handler runs).
    const menuRef = useRef<HTMLDivElement>(null);
    // Mở lên trên khi không đủ chỗ phía dưới (tránh bị cắt / phải cuộn trang).
    const [dropUp, setDropUp] = useState(false);
    // Toạ độ fixed cho menu portal (đo từ nút) — chỉ dùng khi menuPortal.
    const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
    // Chiều cao tối đa thực tế của menu (px) — tính theo chỗ trống trong viewport
    // để danh sách dài (vd năm sinh) không tràn màn hình gây cuộn/giật ngang.
    const [menuMaxH, setMenuMaxH] = useState(menuMaxHeight);

    const selectedOption = options.find((opt) => opt.value === selectedValue);

    // Trần chiều cao menu; tối thiểu để còn thấy vài mục; đệm mép màn hình + khoảng cách nút.
    // 384px ≈ vừa đủ 8 mục (~46px/mục) → list ngắn (vd 6 kỹ năng) không dính scrollbar.
    const MENU_CAP = menuMaxHeight;
    const MENU_MIN = 160;
    const VIEWPORT_PAD = 12;
    const GAP = 8;
    // Đo nút → quyết định lật lên/xuống + trần chiều cao; nếu portal thì set luôn toạ độ fixed.
    const place = () => {
      const rect = dropdownRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_PAD;
      const above = rect.top - GAP - VIEWPORT_PAD;
      // Chỉ lật lên khi phía dưới không đủ trần VÀ phía trên rộng hơn.
      const up = below < MENU_CAP && above > below;
      setDropUp(up);
      const room = up ? above : below;
      setMenuMaxH(Math.max(MENU_MIN, Math.min(MENU_CAP, room)));
      if (menuPortal) {
        setCoords({
          left: rect.left,
          width: rect.width,
          top: up ? undefined : rect.bottom + GAP,
          bottom: up ? window.innerHeight - rect.top + GAP : undefined,
        });
      }
    };

    const toggleOpen = () => {
      if (disabled) return;
      if (!isOpen) place();
      setIsOpen((o) => !o);
    };

    // Menu portal: bám nút khi cuộn/đổi kích thước (fixed nên phải đo lại vị trí).
    useLayoutEffect(() => {
      if (!isOpen || !menuPortal) return;
      place();
      const on = () => place();
      window.addEventListener("scroll", on, true);
      window.addEventListener("resize", on);
      return () => {
        window.removeEventListener("scroll", on, true);
        window.removeEventListener("resize", on);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, menuPortal]);

    useEffect(() => {
      if (value !== undefined) {
        setSelectedValue(value);
      }
    }, [value]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const inside =
          dropdownRef.current?.contains(target) || menuRef.current?.contains(target);
        if (dropdownRef.current && !inside) {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isOpen]);

    // preventDefault: inside a <label>, a click on the backdrop would be forwarded to the trigger
    // button and reopen the menu.
    const closeFromBackdrop = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsOpen(false);
    };

    const handleSelect = (optionValue: string) => {
      setSelectedValue(optionValue);
      onChange?.(optionValue);
      setIsOpen(false);
    };

    return (
      <div ref={ref} className={fullWidth ? "w-full" : "inline-block"}>
        {label && (
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {label}
            {required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={toggleOpen}
            className={cn(
              "h-11 w-full px-4 rounded-xl border transition-colors",
              "text-left flex items-center justify-between",
              "focus:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              // Khi mở dropdown → viền cyan (giống trạng thái focus), tránh chồng lớp border.
              error
                ? cn("bg-rose-50 dark:bg-rose-500/10", isOpen ? "border-rose-500" : "border-rose-400 dark:border-rose-600 focus:border-rose-500")
                : cn("bg-white dark:bg-slate-800", isOpen ? "border-cyan-500" : "border-slate-200 dark:border-slate-700 focus:border-cyan-500"),
              className
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {selectedOption?.icon && (
                <span className="text-slate-600 dark:text-slate-400">
                  {selectedOption.icon}
                </span>
              )}
              <span
                className={cn(
                  "truncate",
                  selectedOption
                    ? "text-slate-800 dark:text-white"
                    : "text-slate-400 dark:text-slate-500",
                )}
              >
                {selectedOption?.label || placeholder}
              </span>
              {selectedOption?.hint && <OptionHint text={selectedOption.hint} />}
            </div>
            <div className="flex items-center gap-2">
              {error && <AlertCircle className="h-5 w-5 text-rose-500" />}
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-slate-400 transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </button>

          {isOpen && !disabled && (() => {
            const menuBody = (
              <>
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      option.value === selectedValue
                        ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {option.icon && (
                        <span className={cn("shrink-0", option.value === selectedValue ? "text-cyan-600 dark:text-cyan-400" : "text-slate-500 dark:text-slate-400")}>
                          {option.icon}
                        </span>
                      )}
                      <span className="truncate">{option.label}</span>
                      {option.hint && <OptionHint text={option.hint} />}
                    </div>
                    {option.value === selectedValue && (
                      <Check className="ml-2 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                    )}
                  </button>
                ))}
                {menuFooter && (
                  <div className="sticky bottom-0 mt-1 border-t border-slate-100 bg-white pt-1 dark:border-slate-800 dark:bg-slate-900">
                    {menuFooter(() => setIsOpen(false))}
                  </div>
                )}
              </>
            );
            const menuBase = "py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg overflow-y-auto overflow-x-hidden overscroll-contain";

            // Portal (fixed) → thoát overflow-hidden của khối cha.
            if (menuPortal) {
              return createPortal(
                <>
                  <div className="fixed inset-0 z-[110]" onClick={closeFromBackdrop} />
                  <div
                    ref={menuRef}
                    style={{ position: "fixed", left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom, maxHeight: menuMaxH, zIndex: 111 }}
                    className={cn(menuBase, menuClassName)}
                  >
                    {menuBody}
                  </div>
                </>,
                document.body,
              );
            }

            // Mặc định: absolute inline (giữ hành vi cũ).
            return (
              <>
                <div className="fixed inset-0 z-10" onClick={closeFromBackdrop} />
                <div
                  style={{ maxHeight: menuMaxH }}
                  className={cn("absolute z-20 w-full", menuBase, dropUp ? "bottom-full mb-2" : "mt-2", menuClassName)}
                >
                  {menuBody}
                </div>
              </>
            );
          })()}
        </div>

        {(error || hint) && (
          <p
            className={cn(
              "text-xs mt-1",
              error
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            {error || hint}
          </p>
        )}

        {/* Hidden select for form compatibility */}
        <select
          {...props}
          value={selectedValue}
          onChange={(e) => handleSelect(e.target.value)}
          className="sr-only"
          tabIndex={-1}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);

Select.displayName = "Select";

function OptionHint({ text }: { text: string }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
      {text}
    </span>
  );
}
