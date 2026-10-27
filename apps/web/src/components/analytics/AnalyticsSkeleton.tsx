// Placeholder mirroring the analytics layout, used both while the data loads and while the
// recharts chunk is still coming down. No recharts import — it must stay out of that chunk.
function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 ${className}`} />;
}

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Block key={i} className="h-[76px]" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Block className="h-[106px]" />
        <Block className="h-[106px]" />
      </div>
      <Block className="h-[352px]" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Block className="h-[352px]" />
        <Block className="h-[352px]" />
      </div>
      <Block className="h-[230px]" />
    </div>
  );
}

/** Streak ring placeholder — keeps the hero row at its final height while loading. */
export function StreakRingSkeleton() {
  return (
    <div className="flex shrink-0 animate-pulse flex-col items-center gap-1">
      <div className="size-20 rounded-full bg-slate-200/70 sm:size-24 dark:bg-slate-800/70" />
      <div className="h-4 w-14 rounded-full bg-slate-200/70 dark:bg-slate-800/70" />
    </div>
  );
}
