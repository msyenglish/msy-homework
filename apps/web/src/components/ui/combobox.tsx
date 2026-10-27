// Free-text input with a suggestion menu styled like <Select> — replaces the browser's <datalist> popup.
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input, type InputProps } from "./input";

export function Combobox({
  value,
  onChange,
  options,
  menuClassName,
  ...rest
}: Omit<InputProps, "value" | "onChange" | "list"> & {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const needle = value.trim().toLowerCase();
  // Typed text narrows the list; an exact pick shows every option again.
  const exact = options.some((o) => o.toLowerCase() === needle);
  const shown = !needle || exact ? options : options.filter((o) => o.toLowerCase().includes(needle));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => setActive(-1), [needle, open]);

  const pick = (o: string) => {
    onChange(o);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Input
        {...rest}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          rest.onFocus?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            const d = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (shown.length ? (i + d + shown.length) % shown.length : -1));
          } else if (e.key === "Enter" && open && active >= 0 && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
          rest.onKeyDown?.(e);
        }}
      />
      {open && shown.length > 0 && (
        <div
          role="listbox"
          className={cn(
            "absolute z-20 mt-2 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900",
            menuClassName,
          )}
        >
          {shown.map((o, i) => {
            const selected = o.toLowerCase() === needle;
            return (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors",
                  selected
                    ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400"
                    : i === active
                      ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <span className="truncate">{o}</span>
                {selected && <Check className="ml-2 size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
