// Page footer for the teacher area: copyright, version, license, source link and donate.
import { useState } from "react";
import DonateDrawer from "./DonateDrawer";
import { APP_VERSION, COPYRIGHT_HOLDER, COPYRIGHT_URL, PROJECT_SITE, REPO_URL } from "../lib/project";
import { t } from "../i18n";

const Dot = () => <span className="text-slate-300 dark:text-slate-700">•</span>;

export default function AppFooter() {
  const [donate, setDonate] = useState(false);
  return (
    <footer className="app-footer no-print">
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-5 text-center text-xs text-slate-500">
        <span>
          © {new Date().getFullYear()}{" "}
          <a href={COPYRIGHT_URL} target="_blank" rel="noreferrer" className="font-semibold text-slate-600 hover:underline dark:text-slate-300">
            {COPYRIGHT_HOLDER}
          </a>
        </span>
        <Dot />
        <span className="font-mono">v{APP_VERSION}</span>
        <Dot />
        <span>{t("nav.footer.license")}</span>
        <Dot />
        <a href={`${PROJECT_SITE}/about`} target="_blank" rel="noreferrer" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
          {t("about.nav.menu")}
        </a>
        <Dot />
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
          {t("nav.footer.source")}
        </a>
        <Dot />
        <button type="button" onClick={() => setDonate(true)} className="font-semibold text-rose-600 hover:underline dark:text-rose-400">
          {t("nav.footer.donate")}
        </button>
      </p>
      <DonateDrawer open={donate} onClose={() => setDonate(false)} />
    </footer>
  );
}
