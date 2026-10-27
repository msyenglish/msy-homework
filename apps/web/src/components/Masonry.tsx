// Masonry grid: items are dealt into columns left to right (item i → column i % n), so reading order
// stays row by row and appending more items never moves the ones already shown.
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";

/** Column count per breakpoint (Tailwind sm = 640px, lg = 1024px). */
function useColumns(cols: { base: number; sm: number; lg: number }) {
  const pick = () =>
    typeof window === "undefined"
      ? cols.base
      : window.matchMedia("(min-width: 1024px)").matches
        ? cols.lg
        : window.matchMedia("(min-width: 640px)").matches
          ? cols.sm
          : cols.base;
  const [n, setN] = useState(pick);
  useEffect(() => {
    const onResize = () => setN(pick());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols.base, cols.sm, cols.lg]);
  return n;
}

export function Masonry<T>({
  items,
  render,
  columns = { base: 1, sm: 2, lg: 3 },
  className,
}: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  columns?: { base: number; sm: number; lg: number };
  className?: string;
}) {
  const n = useColumns(columns);
  const cols: { item: T; i: number }[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => cols[i % n].push({ item, i }));
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {cols.map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map(({ item, i }) => render(item, i))}
        </div>
      ))}
    </div>
  );
}
