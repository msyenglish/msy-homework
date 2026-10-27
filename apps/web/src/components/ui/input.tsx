import { forwardRef, useRef } from "react";
import type { InputHTMLAttributes } from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  /** Set → shows an X clear button while the field has content; ESC clears too (search fields). */
  onClear?: () => void;
  /**
   * Interactive control docked inside the right edge (e.g. a scope dropdown). Unlike `rightIcon`
   * it can be clicked. Pass the matching right padding through `className` (e.g. `pr-32`).
   */
  rightSlot?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      fullWidth = true,
      className = "",
      disabled,
      required,
      onClear,
      rightSlot,
      value,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    // Ref nội bộ để lấy focus lại sau khi bấm X; vẫn chuyển tiếp ref cho nơi gọi.
    const innerRef = useRef<HTMLInputElement>(null);
    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };
    const hasValue = value != null && String(value).length > 0;
    const showClear = !!onClear && hasValue && !disabled;
    const clear = () => { onClear?.(); innerRef.current?.focus(); };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (onClear && e.key === "Escape" && hasValue) { e.preventDefault(); clear(); }
      onKeyDown?.(e);
    };
    return (
      <div className={fullWidth ? "w-full" : ""}>
        {label && (
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {label}
            {required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {leftIcon}
            </div>
          )}

          <input
            ref={setRefs}
            disabled={disabled}
            value={value}
            onKeyDown={handleKeyDown}
            className={cn(
              "h-11 w-full px-4 rounded-xl border transition-colors",
              "text-slate-800 dark:text-white",
              "placeholder:text-slate-400 dark:placeholder:text-slate-500",
              "focus:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              leftIcon ? "pl-10" : "",
              !rightSlot && (rightIcon || error || showClear) ? "pr-10" : "",
              error
                ? "border-rose-400 dark:border-rose-600 bg-rose-50 dark:bg-rose-500/10 focus:border-rose-500"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-cyan-500",
              className
            )}
            {...props}
          />

          {rightSlot ? (
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {showClear && (
                <button
                  type="button"
                  aria-label={t("shared.input.clearSearch")}
                  title={t("shared.input.clear")}
                  onClick={clear}
                  className="flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <X className="size-4" />
                </button>
              )}
              {rightSlot}
            </div>
          ) : error ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
          ) : showClear ? (
            <button
              type="button"
              aria-label={t("shared.input.clearSearch")}
              title={t("shared.input.clear")}
              onClick={clear}
              className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <X className="size-4" />
            </button>
          ) : rightIcon ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <span className="text-slate-400">{rightIcon}</span>
            </div>
          ) : null}
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
      </div>
    );
  }
);

Input.displayName = "Input";
