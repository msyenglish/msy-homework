import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type IconBoxVariant = "cyan" | "emerald" | "amber" | "violet" | "rose" | "slate";
type IconBoxSize = "sm" | "md" | "lg";

interface IconBoxProps extends HTMLAttributes<HTMLDivElement> {
  variant?: IconBoxVariant;
  size?: IconBoxSize;
  children: ReactNode;
}

const variants: Record<IconBoxVariant, string> = {
  cyan: "bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
  emerald: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400",
  rose: "bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400",
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};

const sizes: Record<IconBoxSize, string> = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-xl",
  lg: "h-12 w-12 rounded-xl",
};

export const IconBox = forwardRef<HTMLDivElement, IconBoxProps>(
  ({ className = "", variant = "cyan", size = "md", children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
IconBox.displayName = "IconBox";
