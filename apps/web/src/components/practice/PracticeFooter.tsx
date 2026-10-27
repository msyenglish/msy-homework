// Learner footer (library shell, practice pages, public report): centred column — full logo, intro,
// skills, contact icons and a note set by the teacher in Settings → Brand, then © and version.
// Placed last in a flex column with `mt-auto`, it sits at the bottom of short pages.
import { Facebook, Globe, Mail, MessageCircle, Youtube, type LucideIcon } from "lucide-react";
import { FOOTER_LINK_KEYS, type FooterLinks } from "@msyen/shared";
import { getBrand } from "../../lib/brand";
import { APP_VERSION, PROJECT_SITE } from "../../lib/project";
import { cn } from "../../lib/utils";
import { getLang, t, type TKey } from "../../i18n";
import { BrandLogo } from "../Logo";

const LINK_META: Record<keyof FooterLinks, { Icon: LucideIcon; label: TKey; href: (v: string) => string }> = {
  website: { Icon: Globe, label: "practice2.footer.website", href: (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`) },
  facebook: { Icon: Facebook, label: "practice2.footer.facebook", href: (v) => (/^https?:\/\//i.test(v) ? v : `https://facebook.com/${v}`) },
  youtube: { Icon: Youtube, label: "practice2.footer.youtube", href: (v) => (/^https?:\/\//i.test(v) ? v : `https://youtube.com/${v}`) },
  // A bare phone number opens Zalo chat; a full link is used as is.
  zalo: { Icon: MessageCircle, label: "practice2.footer.zalo", href: (v) => (/^https?:\/\//i.test(v) ? v : `https://zalo.me/${v.replace(/[^\d]/g, "")}`) },
  email: { Icon: Mail, label: "practice2.footer.email", href: (v) => `mailto:${v}` },
};

// Project attribution: literal text rather than i18n keys, so Settings → Interface text cannot change it.
const POWERED = {
  vi: { by: "Chạy trên", install: "Tự cài miễn phí" }, // i18n-ignore: fixed attribution
  en: { by: "Powered by", install: "Install it free" },
} as const;

const SKILLS = "Grammar · Reading · Listening · Vocabulary · Writing · Speaking"; // i18n-ignore: skill names

export function PracticeFooter({ className }: { className?: string }) {
  const brand = getBrand();
  const links = FOOTER_LINK_KEYS.filter((k) => brand.footerLinks[k]);
  return (
    <footer className={cn("no-print mt-auto w-full", className)}>
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 px-4 pb-6 pt-8 text-center">
        <BrandLogo height={44} />

        <p className="max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {brand.footerTagline ? (
            brand.footerTagline
          ) : (
            <>
              {t("practice2.footer.description")} <span className="font-semibold text-slate-700 dark:text-slate-200">{brand.name}</span>
              {t("practice2.footer.suffix")}
            </>
          )}
        </p>

        {brand.footerSkills && <p className="text-xs font-medium tracking-wide text-slate-400 dark:text-slate-500">{SKILLS}</p>}

        {links.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {links.map((k) => {
              const m = LINK_META[k];
              const v = brand.footerLinks[k];
              return (
                <a
                  key={k}
                  href={m.href(v)}
                  target={k === "email" ? undefined : "_blank"}
                  rel="noreferrer"
                  title={`${t(m.label)}: ${v}`}
                  aria-label={t(m.label)}
                  className="flex size-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-cyan-600 hover:ring-cyan-300 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800 dark:hover:text-cyan-300"
                >
                  <m.Icon className="size-4" />
                </a>
              );
            })}
          </div>
        )}

        {brand.footerNote && <p className="max-w-lg whitespace-pre-line text-xs leading-relaxed text-slate-400 dark:text-slate-500">{brand.footerNote}</p>}

        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} {brand.name} · <span className="font-mono">v{APP_VERSION}</span>
        </p>
        <p className="-mt-2 flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] text-slate-400 dark:text-slate-600">
          {POWERED[getLang() === "en" ? "en" : "vi"].by}
          <a href={`${PROJECT_SITE}/about`} target="_blank" rel="noreferrer" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            MSY Homework
          </a>
          ·
          <a href={`${PROJECT_SITE}/setup`} target="_blank" rel="noreferrer" className="font-semibold text-slate-500 hover:text-cyan-600 hover:underline dark:text-slate-400">
            {POWERED[getLang() === "en" ? "en" : "vi"].install}
          </a>
        </p>
      </div>
    </footer>
  );
}
