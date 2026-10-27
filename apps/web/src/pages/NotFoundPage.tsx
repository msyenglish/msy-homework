// 404 for every unmatched route. It used to redirect to /u/login, which read as "you were logged
// out" and dumped the learner in the library with no explanation of what went wrong. Standalone on
// purpose: it must render whether or not anyone is signed in, so it depends on no layout context.
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Compass, LifeBuoy } from "lucide-react";
import { Logo } from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { HeroDecor } from "../components/HeroDecor";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { t } from "../i18n";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useDocumentTitle(t("userPages.notFound.pageTitle"));

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <Logo size="sm" showText to="/u/library" />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 text-center shadow-sm sm:p-8 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
          <HeroDecor seed="not-found" />
          <div className="relative">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 dark:text-cyan-400">
              <Compass className="size-7" />
            </span>
            <p className="mt-4 text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">404</p>
            <h1 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">{t("userPages.notFound.title")}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {t("userPages.notFound.description")}
            </p>
            {/* The path helps the learner spot a typo, and helps us when they report it. */}
            <p className="mx-auto mt-3 max-w-md truncate rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              {pathname}
            </p>

            <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Link
                to="/u/library"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-600 sm:w-auto"
              >
                <BookOpen className="size-4" /> {t("userPages.notFound.backToLibrary")}
              </Link>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-600 sm:w-auto dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-700"
              >
                <ArrowLeft className="size-4" /> {t("common.back")}
              </button>
            </div>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <LifeBuoy className="size-3.5" /> {t("userPages.notFound.hint")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
