// Public project page (/about): what MSY Homework is, who it is for, the demo accounts and how to install
// it. Every install ships it, and the learner footer links to the one on the project site.
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Download,
  ExternalLink,
  GraduationCap,
  Headphones,
  Heart,
  Languages,
  Mic,
  PenLine,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Wallet,
} from "lucide-react";
import AppFooter from "../components/AppFooter";
import { HeroDecor } from "../components/HeroDecor";
import { Logo } from "../components/Logo";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { COPYRIGHT_URL, PROJECT_SITE } from "../lib/project";
import { t, type TKey } from "../i18n";

const IMAGE_URLS = import.meta.glob("../../../../docs/guide/images/{20-exercises,21-editor-ai,30-paths,12-learner-detail,60-reports,70-ai,90-learner-library,91-learner-grammar}.jpg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const img = (name: string) => Object.entries(IMAGE_URLS).find(([p]) => p.endsWith(`/${name}.jpg`))?.[1] ?? "";

const WHY: { icon: LucideIcon; title: TKey; desc: TKey; tone: string }[] = [
  { icon: Wallet, title: "about.why.free.title", desc: "about.why.free.desc", tone: "from-emerald-400 to-emerald-600" },
  { icon: ShieldCheck, title: "about.why.own.title", desc: "about.why.own.desc", tone: "from-cyan-400 to-cyan-600" },
  { icon: Bot, title: "about.why.ai.title", desc: "about.why.ai.desc", tone: "from-violet-400 to-violet-600" },
  { icon: Terminal, title: "about.why.easy.title", desc: "about.why.easy.desc", tone: "from-amber-400 to-amber-600" },
];

const SHOTS: { image: string; caption: TKey }[] = [
  { image: "20-exercises", caption: "about.teacher.exercises" },
  { image: "21-editor-ai", caption: "about.teacher.ai" },
  { image: "30-paths", caption: "about.teacher.paths" },
  { image: "12-learner-detail", caption: "about.teacher.learner" },
  { image: "60-reports", caption: "about.teacher.reports" },
  { image: "70-ai", caption: "about.teacher.gateway" },
];
const LEARNER_SHOTS: { image: string; caption: TKey }[] = [
  { image: "90-learner-library", caption: "about.learner.library" },
  { image: "91-learner-grammar", caption: "about.learner.grammar" },
];

const SKILLS: { icon: LucideIcon; label: TKey }[] = [
  { icon: GraduationCap, label: "about.skills.grammar" },
  { icon: BookOpen, label: "about.skills.reading" },
  { icon: Headphones, label: "about.skills.listening" },
  { icon: Languages, label: "about.skills.vocabulary" },
  { icon: PenLine, label: "about.skills.writing" },
  { icon: Mic, label: "about.skills.speaking" },
];

const DEMO = [
  { label: "about.demo.teacher" as TKey, path: "/teacher/login", email: "admin@msyen.com", icon: Users },
  { label: "about.demo.learner" as TKey, path: "/u/login", email: "learner@msyen.com", icon: GraduationCap },
];
const DEMO_PASSWORD = "msyen123";

const STEPS: TKey[] = ["about.install.step1", "about.install.step2", "about.install.step3", "about.install.step4"];

const CTA_PRIMARY =
  "inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-600";
const CTA_SECONDARY =
  "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-cyan-300";

function Shot({ image, caption }: { image: string; caption: TKey }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <img src={img(image)} alt={t(caption)} loading="lazy" className="aspect-[16/10] w-full border-b border-slate-100 object-cover object-top dark:border-slate-800" />
      <figcaption className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">{t(caption)}</figcaption>
    </figure>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-5 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">{children}</h2>;
}

export default function AboutPage() {
  useDocumentTitle(t("about.page.title"));
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo size="sm" to="/home" />
          <nav className="flex items-center gap-1 text-sm">
            <a href={PROJECT_SITE} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <PlayCircle className="size-4" /> <span className="hidden sm:inline">{t("about.nav.demo")}</span>
            </a>
            <a href={`${PROJECT_SITE}/setup`} className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-white hover:bg-cyan-600">
              <Download className="size-4" /> {t("about.nav.setup")}
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-16 px-4 py-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm sm:px-12 dark:border-slate-800 dark:bg-slate-900">
          <HeroDecor seed="about" className="text-cyan-500/15 dark:text-cyan-400/10" />
          <div className="relative mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
              <Sparkles className="size-3.5" /> {t("about.hero.eyebrow")}
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-5xl dark:text-white">{t("about.hero.title")}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">{t("about.hero.subtitle")}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <a href={`${PROJECT_SITE}/setup`} className={CTA_PRIMARY}>
                <Download className="size-4" /> {t("about.hero.install")}
              </a>
              <a href={PROJECT_SITE} target="_blank" rel="noreferrer" className={CTA_SECONDARY}>
                <PlayCircle className="size-4" /> {t("about.hero.demo")}
              </a>
            </div>
          </div>
        </section>

        {/* Why */}
        <section>
          <SectionTitle>{t("about.why.title")}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w) => (
              <div key={w.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${w.tone}`}>
                  <w.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-bold text-slate-900 dark:text-white">{t(w.title)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t(w.desc)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Teacher screens */}
        <section>
          <SectionTitle>{t("about.teacher.title")}</SectionTitle>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SHOTS.map((s) => (
              <Shot key={s.image} {...s} />
            ))}
          </div>
        </section>

        {/* Learner side */}
        <section>
          <SectionTitle>{t("about.learner.title")}</SectionTitle>
          <div className="grid gap-5 md:grid-cols-2">
            {LEARNER_SHOTS.map((s) => (
              <Shot key={s.image} {...s} />
            ))}
          </div>
          <h3 className="mb-3 mt-8 text-lg font-bold text-slate-900 dark:text-white">{t("about.skills.title")}</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SKILLS.map((s) => (
              <li key={s.label} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <s.icon className="mt-0.5 size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                {t(s.label)}
              </li>
            ))}
          </ul>
        </section>

        {/* Demo + install */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t("about.demo.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("about.demo.subtitle")}</p>
            <div className="mt-5 space-y-3">
              {DEMO.map((d) => (
                <div key={d.email} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300">
                    <d.icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-bold text-slate-900 dark:text-white">{t(d.label)}</p>
                    <p className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      {d.email} / {DEMO_PASSWORD}
                    </p>
                  </div>
                  <a href={`${PROJECT_SITE}${d.path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
                    {t("about.demo.open")} <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t("about.install.title")}</h2>
            <ol className="mt-5 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-white">{i + 1}</span>
                  {t(s)}
                </li>
              ))}
            </ol>
            <a href={`${PROJECT_SITE}/setup`} className={`${CTA_PRIMARY} mt-6`}>
              {t("about.install.cta")} <ArrowRight className="size-4" />
            </a>
          </div>
        </section>

        {/* Maker */}
        <section className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-6 text-center dark:border-rose-500/20 dark:from-rose-500/10 dark:to-slate-900">
          <Heart className="mx-auto size-7 text-rose-500" />
          <h2 className="mt-3 text-xl font-extrabold text-slate-900 dark:text-white">{t("about.maker.title")}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t("about.maker.desc")}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-sm">
            <a href={COPYRIGHT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-rose-600 hover:underline dark:text-rose-400">
              {t("about.maker.site")} <ExternalLink className="size-3.5" />
            </a>
            <Link to="/setup" className="inline-flex items-center gap-1 font-semibold text-cyan-700 hover:underline dark:text-cyan-300">
              <Download className="size-3.5" /> {t("about.nav.setup")}
            </Link>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
