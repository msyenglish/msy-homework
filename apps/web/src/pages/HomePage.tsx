// Public home page (landing). Always reachable at /home; it also serves "/" unless the teacher turns
// it off in Settings → Branding (then "/" goes straight to the learner sign-in).
// Every illustration is drawn with markup (no real data, no images), so it themes with the app.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  BookText,
  Check,
  CheckCircle2,
  Flame,
  Gift,
  GraduationCap,
  Headphones,
  Layers,
  Lock,
  Menu,
  Mic,
  PenLine,
  Route,
  Sparkles,
  Star,
  Type,
  Volume2,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import LanguageMenu from "../components/LanguageMenu";
import { buttonClass } from "../components/ui";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { getBrand } from "../lib/brand";
import { cn } from "../lib/utils";
import { t, type TKey } from "../i18n";

/** Dot grid used as the pattern layer on the gradient blocks. */
const DOTS = "bg-[radial-gradient(rgba(255,255,255,0.22)_1px,transparent_1px)] [background-size:22px_22px]";

const NAV_LINKS = [
  ["#skills", "home.nav.skills"],
  ["#features", "home.nav.features"],
  ["#steps", "home.nav.steps"],
  ["#teachers", "home.nav.teachers"],
] as const satisfies readonly (readonly [string, TKey])[];

const STRIP: { icon: LucideIcon; label: TKey }[] = [
  { icon: Gift, label: "home.strip.free" },
  { icon: Layers, label: "home.strip.skills" },
  { icon: Mic, label: "home.strip.ai" },
  { icon: BarChart3, label: "home.strip.reports" },
];

const SKILLS: { icon: LucideIcon; grad: string; title: TKey; desc: TKey }[] = [
  { icon: BookText, grad: "from-sky-400 to-blue-600", title: "home.skills.grammar", desc: "home.skills.grammarDesc" },
  { icon: BookOpen, grad: "from-emerald-400 to-teal-600", title: "home.skills.reading", desc: "home.skills.readingDesc" },
  { icon: Headphones, grad: "from-violet-400 to-purple-600", title: "home.skills.listening", desc: "home.skills.listeningDesc" },
  { icon: Type, grad: "from-amber-400 to-orange-500", title: "home.skills.vocabulary", desc: "home.skills.vocabularyDesc" },
  { icon: PenLine, grad: "from-teal-400 to-cyan-600", title: "home.skills.writing", desc: "home.skills.writingDesc" },
  { icon: Mic, grad: "from-rose-400 to-pink-600", title: "home.skills.speaking", desc: "home.skills.speakingDesc" },
];

const STEPS: { title: TKey; desc: TKey }[] = [
  { title: "home.steps.one.title", desc: "home.steps.one.desc" },
  { title: "home.steps.two.title", desc: "home.steps.two.desc" },
  { title: "home.steps.three.title", desc: "home.steps.three.desc" },
];

const TEACHER_POINTS: { icon: LucideIcon; label: TKey }[] = [
  { icon: Wand2, label: "home.teacher.p1" },
  { icon: Route, label: "home.teacher.p2" },
  { icon: CheckCircle2, label: "home.teacher.p3" },
  { icon: BarChart3, label: "home.teacher.p4" },
];

export default function HomePage() {
  const brand = getBrand();
  useDocumentTitle(t("home.page.title", { name: brand.name }));

  // The header floats as glass over the hero, then turns solid once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-3 sm:px-6">
        <nav
          className={cn(
            "mx-auto flex w-full max-w-6xl items-center gap-2 rounded-2xl border px-3 py-2 transition-all sm:px-4",
            scrolled
              ? "border-slate-200 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
              : "border-white/30 bg-white/70 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/50",
          )}
        >
          <Logo size="sm" to="/home" />
          <div className="ml-6 hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map(([href, key]) => (
              <a key={href} href={href} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white">
                {t(key)}
              </a>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageMenu />
            <ThemeToggle />
            <Link to="/u/login" className={buttonClass("ghost", "sm", "hidden font-semibold sm:inline-flex")}>
              {t("home.nav.login")}
            </Link>
            <Link to="/u/login?mode=register" className={buttonClass("primary", "sm")}>
              {t("home.nav.register")}
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("home.nav.menu")}
              aria-expanded={menuOpen}
              className="flex size-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-900/5 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </nav>
        {/* Small screens: the section links and sign-in drop down under the bar. */}
        {menuOpen && (
          <div className="mx-auto mt-2 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
            {NAV_LINKS.map(([href, key]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t(key)}
              </a>
            ))}
            <div className="mt-1 border-t border-slate-100 pt-2 sm:hidden dark:border-slate-800">
              <Link to="/u/login" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
                {t("home.nav.login")}
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <Hero teacher={brand.teacherName} />

        {/* Highlights strip, overlapping the hero's lower edge */}
        <section className="relative z-10 mx-auto -mt-10 w-full max-w-5xl px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/5 sm:grid-cols-4 sm:p-4 dark:border-slate-800 dark:bg-slate-900">
            {STRIP.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 text-white">
                  <Icon className="size-[18px]" />
                </span>
                <span className="text-sm leading-tight font-bold">{t(label)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Six skills */}
        <section id="skills" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <SectionHead kicker="home.skills.kicker" title="home.skills.title" subtitle="home.skills.subtitle" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SKILLS.map(({ icon: Icon, grad, title, desc }) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
              >
                <div className={cn("absolute -top-12 -right-12 size-36 rounded-full bg-gradient-to-br opacity-10 transition group-hover:opacity-20", grad)} />
                <span className={cn("relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", grad)}>
                  <Icon className="size-6" />
                </span>
                <h3 className="relative mt-5 text-lg font-extrabold">{t(title)}</h3>
                <p className="relative mt-1 text-sm text-slate-600 dark:text-slate-400">{t(desc)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature showcases, alternating sides */}
        <div id="features" className="scroll-mt-24 space-y-24 pb-24">
          <Showcase
            kicker="home.show.path.kicker"
            title="home.show.path.title"
            desc="home.show.path.desc"
            points={["home.show.path.p1", "home.show.path.p2", "home.show.path.p3"]}
            grad="from-cyan-500 to-blue-600"
            visual={<PathVisual />}
          />
          <Showcase
            reverse
            kicker="home.show.speak.kicker"
            title="home.show.speak.title"
            desc="home.show.speak.desc"
            points={["home.show.speak.p1", "home.show.speak.p2", "home.show.speak.p3"]}
            grad="from-violet-500 to-fuchsia-600"
            visual={<SpeakVisual />}
          />
          <Showcase
            kicker="home.show.report.kicker"
            title="home.show.report.title"
            desc="home.show.report.desc"
            points={["home.show.report.p1", "home.show.report.p2", "home.show.report.p3"]}
            grad="from-emerald-500 to-teal-600"
            visual={<ReportVisual />}
          />
        </div>

        {/* Steps on a tinted band */}
        <section id="steps" className="relative scroll-mt-24 overflow-hidden bg-gradient-to-b from-cyan-50 to-emerald-50 py-20 dark:from-cyan-950/40 dark:to-emerald-950/30">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <SectionHead kicker="home.steps.kicker" title="home.steps.title" />
            <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
              {/* Connector behind the step numbers (desktop) */}
              <div className="absolute top-7 right-[16%] left-[16%] hidden h-0.5 bg-gradient-to-r from-cyan-300 via-teal-300 to-emerald-300 md:block dark:from-cyan-700 dark:via-teal-700 dark:to-emerald-700" />
              {STEPS.map(({ title, desc }, i) => (
                <li key={title} className="relative text-center">
                  <span className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-xl font-extrabold text-white shadow-lg shadow-cyan-500/30 ring-8 ring-cyan-50 dark:ring-slate-950">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-extrabold">{t(title)}</h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600 dark:text-slate-400">{t(desc)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* For teachers: dark panel with pattern */}
        <section id="teachers" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 p-8 text-white sm:p-12 dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
            <div className={cn("absolute inset-0 opacity-60", DOTS)} />
            <div className="absolute -top-24 -right-24 size-72 rounded-full bg-violet-500/30 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 size-72 rounded-full bg-cyan-500/25 blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-violet-200 uppercase">
                  <GraduationCap className="size-3.5" /> {t("home.teacher.kicker")}
                </span>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t("home.teacher.title")}</h2>
                <p className="mt-3 text-slate-300">{t("home.teacher.desc")}</p>
                <Link
                  to="/teacher/login"
                  className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-violet-50"
                >
                  {t("home.teacher.cta")} <ArrowRight className="size-4" />
                </Link>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {TEACHER_POINTS.map(({ icon: Icon, label }) => (
                  <li key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <Icon className="size-5 text-violet-300" />
                    <p className="mt-3 text-sm font-semibold">{t(label)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-500 px-6 py-16 text-center text-white shadow-2xl shadow-cyan-500/25 sm:px-12">
            <div className={cn("absolute inset-0", DOTS)} />
            <div className="absolute -top-20 left-1/4 size-64 rounded-full bg-white/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("home.cta.title")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/90">{t("home.cta.subtitle")}</p>
              <Link
                to="/u/login?mode=register"
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-teal-700 shadow-lg transition hover:bg-cyan-50"
              >
                {t("home.hero.start")} <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden text-sm text-slate-500 sm:inline">{t("home.footer.tagline")}</span>
          </div>
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-slate-500">
            <span>
              © {new Date().getFullYear()} {brand.name}
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link to="/teacher/login" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
              {t("home.footer.teacherLogin")}
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link to="/setup" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
              {t("setupGuide.home.footerLink")}
            </Link>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link to="/about" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
              {t("about.nav.menu")}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Hero({ teacher }: { teacher: string }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-cyan-600 via-teal-500 to-emerald-500 pt-28 pb-28 text-white sm:pt-32 sm:pb-40 dark:from-cyan-950 dark:via-teal-900 dark:to-emerald-950">
      {/* Pattern layers: dot grid, soft colour blobs, a faint ring */}
      <div className={cn("absolute inset-0", DOTS)} />
      <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-cyan-300/40 blur-3xl dark:bg-cyan-500/20" />
      <div className="absolute top-1/3 -right-32 size-[30rem] rounded-full bg-emerald-300/40 blur-3xl dark:bg-emerald-500/20" />
      <div className="absolute -bottom-40 left-1/3 size-[26rem] rounded-full bg-sky-400/30 blur-3xl dark:bg-sky-500/10" />
      <div className="absolute top-24 right-[8%] size-72 rounded-full border-[28px] border-white/10" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-xs font-bold tracking-wide uppercase backdrop-blur">
            <Sparkles className="size-3.5" /> {t("home.hero.eyebrow")}
          </span>
          <h1 className="mt-5 text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t("home.hero.titleA")}{" "}
            <span className="relative whitespace-nowrap">
              <span className="relative z-10 bg-gradient-to-r from-amber-200 to-yellow-100 bg-clip-text text-transparent">{t("home.hero.titleB")}</span>
              <svg className="absolute -bottom-2 left-0 h-3 w-full text-amber-300/80" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden>
                <path d="M2 9 C 50 2, 150 2, 198 8" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>{" "}
            {t("home.hero.titleC", { teacher })}
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/90 sm:text-lg">{t("home.hero.subtitle")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/u/login?mode=register"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-teal-700 shadow-xl shadow-teal-900/20 transition hover:-translate-y-0.5 hover:bg-cyan-50"
            >
              {t("home.hero.start")} <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/u/login"
              className="inline-flex h-12 items-center rounded-xl border border-white/40 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            >
              {t("home.hero.haveAccount")}
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-white/80">
            <CheckCircle2 className="size-4" /> {t("home.hero.note")}
          </p>
        </div>

        <HeroCards />
      </div>

      {/* Wave into the page background */}
      <svg className="absolute inset-x-0 -bottom-px h-16 w-full text-slate-50 sm:h-24 dark:text-slate-950" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden>
        <path fill="currentColor" d="M0,64 C240,120 480,0 720,40 C960,80 1200,120 1440,56 L1440,120 L0,120 Z" />
      </svg>
    </section>
  );
}

/** The exercise card plus three floating chips around it. */
function HeroCards() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mr-0" aria-hidden>
      <div className="home-float relative rounded-3xl border border-white/40 bg-white p-5 text-slate-900 shadow-2xl shadow-teal-900/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
          <span>{t("home.mock.question")}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 font-bold text-cyan-700 dark:text-cyan-300">Grammar</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full w-[30%] rounded-full bg-gradient-to-r from-cyan-400 to-emerald-500" />
        </div>
        <p className="mt-5 text-lg font-bold">{t("home.mock.prompt")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {["go", "goes", "going", "went"].map((o) => (
            <span
              key={o}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-center text-sm font-semibold",
                o === "goes"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
              )}
            >
              {o}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4" /> {t("home.mock.correct")}
          </span>
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Star className="size-4 fill-current" /> {t("home.mock.points", { n: 10 })}
          </span>
        </div>
      </div>

      {/* Streak chip */}
      <div className="home-float-slow absolute -top-6 -left-10 hidden items-center gap-2 sm:flex rounded-2xl bg-white px-3 py-2 text-slate-900 shadow-xl sm:-left-10 dark:bg-slate-800 dark:text-white">
        <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <Flame className="size-4" />
        </span>
        <span className="text-sm font-extrabold">{t("home.mock.streak", { n: 12 })}</span>
      </div>

      {/* Pronunciation chip */}
      <div className="home-float-slow absolute -right-8 -bottom-16 hidden w-48 rounded-2xl sm:block bg-white p-3 text-slate-900 shadow-xl sm:-right-8 dark:bg-slate-800 dark:text-white">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 text-violet-600 dark:text-violet-300">
            <Mic className="size-3.5" /> {t("home.mock.pron")}
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">92%</span>
        </div>
        <Wave className="mt-2 h-8" bars={22} />
      </div>
    </div>
  );
}

/** Audio-waveform bars with fixed pseudo-random heights. */
function Wave({ className, bars = 24 }: { className?: string; bars?: number }) {
  return (
    <div className={cn("flex items-center gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, i) => {
        const h = 25 + ((i * 37) % 70);
        return <span key={i} className="flex-1 rounded-full bg-gradient-to-t from-violet-500 to-fuchsia-400" style={{ height: `${h}%` }} />;
      })}
    </div>
  );
}

function SectionHead({ kicker, title, subtitle }: { kicker: TKey; title: TKey; subtitle?: TKey }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-extrabold tracking-[0.2em] text-cyan-600 uppercase dark:text-cyan-400">{t(kicker)}</span>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t(title)}</h2>
      {subtitle && <p className="mt-3 text-slate-600 dark:text-slate-300">{t(subtitle)}</p>}
    </div>
  );
}

function Showcase({
  kicker,
  title,
  desc,
  points,
  grad,
  visual,
  reverse,
}: {
  kicker: TKey;
  title: TKey;
  desc: TKey;
  points: TKey[];
  grad: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
      <div className={cn(reverse && "lg:order-2")}>
        <span className={cn("bg-gradient-to-r bg-clip-text text-xs font-extrabold tracking-[0.2em] text-transparent uppercase", grad)}>{t(kicker)}</span>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{t(title)}</h2>
        <p className="mt-4 text-slate-600 dark:text-slate-300">{t(desc)}</p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white", grad)}>
                <Check className="size-3.5" />
              </span>
              <span className="font-medium">{t(p)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 sm:p-10", grad, reverse && "lg:order-1")}>
        <div className={cn("absolute inset-0", DOTS)} />
        <div className="absolute -top-16 -right-16 size-56 rounded-full bg-white/20 blur-2xl" />
        <div className="relative">{visual}</div>
      </div>
    </section>
  );
}

/** Daily path: done, today, locked. */
function PathVisual() {
  const days = [1, 2, 3, 4, 5];
  return (
    <div className="mx-auto max-w-sm space-y-3" aria-hidden>
      {days.map((d) => {
        const state = d < 3 ? "done" : d === 3 ? "today" : "locked";
        return (
          <div
            key={d}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg",
              state === "today" ? "scale-[1.04] bg-white text-slate-900 ring-4 ring-white/40" : "bg-white/90 text-slate-700",
              state === "locked" && "opacity-70",
              d % 2 === 0 ? "ml-8" : "mr-8",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-white",
                state === "done" ? "bg-emerald-500" : state === "today" ? "bg-gradient-to-br from-cyan-500 to-blue-600" : "bg-slate-300",
              )}
            >
              {state === "done" ? <Check className="size-4" /> : state === "today" ? <Star className="size-4 fill-current" /> : <Lock className="size-4" />}
            </span>
            <span className="text-sm font-bold">{t("home.mock.day", { n: d })}</span>
            {state === "today" && (
              <span className="ml-auto rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-bold text-cyan-700">{t("home.mock.today")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Pronunciation: a sentence with per-word colours and a waveform. */
function SpeakVisual() {
  const words: [string, string][] = [
    ["I", "text-emerald-600"],
    ["went", "text-emerald-600"],
    ["to", "text-emerald-600"],
    ["the", "text-amber-500"],
    ["beach", "text-emerald-600"],
    ["yesterday", "text-rose-500"],
  ];
  return (
    <div className="mx-auto max-w-sm rounded-3xl bg-white p-5 text-slate-900 shadow-2xl" aria-hidden>
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg">
          <Volume2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-violet-600">{t("home.mock.pron")}</p>
          <p className="text-2xl leading-none font-extrabold">92%</p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40">
          <Mic className="size-5" />
        </span>
      </div>
      <p className="mt-5 flex flex-wrap gap-x-2 text-xl font-bold">
        {words.map(([w, c]) => (
          <span key={w} className={c}>
            {w}
          </span>
        ))}
      </p>
      <Wave className="mt-5 h-14" bars={32} />
    </div>
  );
}

/** Monthly report: skill bars and a progress figure. */
function ReportVisual() {
  const bars: [string, number, string][] = [
    ["Grammar", 82, "from-sky-400 to-blue-600"],
    ["Reading", 74, "from-emerald-400 to-teal-600"],
    ["Listening", 68, "from-violet-400 to-purple-600"],
    ["Vocabulary", 90, "from-amber-400 to-orange-500"],
  ];
  return (
    <div className="mx-auto max-w-sm rounded-3xl bg-white p-5 text-slate-900 shadow-2xl" aria-hidden>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500">{t("home.mock.month")}</p>
          <p className="mt-1 text-3xl font-extrabold">
            +18<span className="text-lg">%</span>
          </p>
          <p className="text-xs text-slate-500">{t("home.mock.progress")}</p>
        </div>
        <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
          <BarChart3 className="size-5" />
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {bars.map(([label, v, g]) => (
          <div key={label}>
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>{label}</span>
              <span>{v}%</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full bg-gradient-to-r", g)} style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
