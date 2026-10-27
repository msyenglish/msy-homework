// Full-page state for the grammar drill pages while a session is drawn, or when it cannot open.
// The pages sit outside UserLayout, so this brings its own top nav.
import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import UserTopNav from "../UserTopNav";
import { t } from "../../i18n";

export function DrillPageStatus({
  icon,
  title,
  hint,
  error,
  onBack,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  /** Set → the error card instead of the loading one. */
  error?: string | null;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <UserTopNav />
      <div className="mx-auto w-full max-w-xl px-4 py-12 sm:py-20">
        <div
          role="status"
          aria-live="polite"
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900"
        >
          {error ? (
            <>
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="size-7" />
              </span>
              <h1 className="mt-4 text-lg font-extrabold text-slate-900 dark:text-white">{t("userPages.grammarDrill.openErrorTitle")}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{error}</p>
              <button
                type="button"
                onClick={onBack}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-600"
              >
                <ArrowLeft className="size-4" /> {t("userPages.grammarDrill.backToHandbook")}
              </button>
            </>
          ) : (
            <>
              <span className="relative mx-auto flex size-14 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-2xl bg-cyan-400/25" />
                <span className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-cyan-500/30">
                  {icon}
                </span>
              </span>
              <h1 className="mt-5 text-lg font-extrabold text-slate-900 dark:text-white">{title}</h1>
              {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
              {/* Skeleton of the question card that is about to appear. */}
              <div className="mt-6 space-y-3 text-left" aria-hidden>
                <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="h-11 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
                <div className="flex gap-1.5 pt-1">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="h-1.5 flex-1 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" style={{ animationDelay: `${i * 90}ms` }} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
