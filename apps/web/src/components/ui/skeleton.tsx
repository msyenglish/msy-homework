// Loading placeholders. A skeleton the same SHAPE as the content it replaces is the point: the page
// does not jump when data lands, and the learner can see what is coming instead of reading "Loading…".
import { cn } from "../../lib/utils";

/** One shimmering block. Give it a size through `className`. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/50", className)} />;
}

/**
 * Placeholder for one exercise card. `list` matches the row layout, otherwise the grid tile —
 * the library remembers which view the learner picked, so the skeleton has to follow it.
 */
export function CardSkeleton({ list = false }: { list?: boolean }) {
  if (list) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="size-9 shrink-0 rounded-xl" />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="space-y-2.5 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/3" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** A titled block of card placeholders — one section of the library. */
export function CardGridSkeleton({
  count = 6,
  list = false,
  wrap,
}: {
  count?: number;
  list?: boolean;
  /** Same grid/stack classes the real list uses, so nothing shifts when data arrives. */
  wrap: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-lg" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className={wrap} aria-hidden>
        {Array.from({ length: count }, (_, i) => (
          <CardSkeleton key={i} list={list} />
        ))}
      </div>
    </div>
  );
}
