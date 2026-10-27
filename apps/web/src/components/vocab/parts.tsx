// Small building blocks shared by the vocabulary drawers.

/** Numbered section heading inside a drawer. */
export function SectionTitle({ n, children, aside }: { n: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-white">{n}</span>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{children}</h3>
      {aside && <span className="ml-auto">{aside}</span>}
    </div>
  );
}

/** Toolbar control matching the h-11 inputs, selects and the filter button. */
export const toolBtn =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";


/** One setting per row: label (and hint) on the left, its control on the right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Frame that stacks SettingRows with dividers. */
export function SettingRows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">{children}</div>;
}

/** Single-choice button tabs, sized to sit in a SettingRow. */
export function TabButtons<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={
            value === o.value
              ? "h-8 rounded-md bg-white px-3 text-sm font-semibold text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300"
              : "h-8 rounded-md px-3 text-sm font-medium text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
