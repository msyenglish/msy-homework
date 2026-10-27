import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
  resize?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      fullWidth = true,
      resize = true,
      disabled,
      required,
      className = "",
      rows = 4,
      ...props
    },
    ref
  ) => {
    return (
      <div className={fullWidth ? "w-full" : ""}>
        {label && (
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            {label}
            {required && <span className="text-rose-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <textarea
            ref={ref}
            rows={rows}
            disabled={disabled}
            className={cn(
              "w-full px-4 py-3 rounded-xl border transition-all",
              "text-slate-800 dark:text-white",
              "placeholder:text-slate-400 dark:placeholder:text-slate-500",
              "focus:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              !resize ? "resize-none" : "resize-y",
              error
                ? "border-rose-400 dark:border-rose-600 bg-rose-50 dark:bg-rose-500/10 focus:border-rose-500"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-cyan-500",
              className
            )}
            {...props}
          />

          {error && (
            <div className="absolute right-3 top-3">
              <AlertCircle className="h-5 w-5 text-rose-500" />
            </div>
          )}
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

Textarea.displayName = "Textarea";
