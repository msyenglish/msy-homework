// Public install guide (/setup). The content IS docs/SETUP.md, bundled at build time, so the page on the
// demo site and the file on GitHub never drift apart. Links to other docs open on GitHub: the reader of
// this page has no account here. The page adds what a Markdown file cannot: a contents rail that follows
// the reader, and an install-command builder at the `<!-- install-builder -->` marker.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Apple, ArrowLeft, Bot, Check, Github, KeyRound, ListTree, LogIn, Monitor, Rocket, ShieldCheck } from "lucide-react";
import { anchor, Markdown, slugify } from "../components/guide/Markdown";
import AppFooter from "../components/AppFooter";
import { CodeBlock } from "../components/guide/CodeBlock";
import { HeroDecor } from "../components/HeroDecor";
import { Logo } from "../components/Logo";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { REPO_PRIVATE, REPO_URL } from "../lib/project";
import { cn } from "../lib/utils";
import { getLang, t } from "../i18n";

const SOURCES = import.meta.glob("../../../../docs/SETUP.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const IMAGE_URLS = import.meta.glob("../../../../docs/guide/images/*.{jpg,png}", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const IMAGES: Record<string, string> = Object.fromEntries(Object.entries(IMAGE_URLS).map(([path, url]) => [path.split("/").pop()!, url]));

/** Relative links to other docs ("DEPLOY.md", "guide/03-cong-ai.md#x") → the file on GitHub. */
const SOURCE = (Object.values(SOURCES)[0] ?? "").replace(
  /\]\((?!https?:|#|mailto:)([^)\s]+\.md)(#[^)\s]*)?\)/g,
  (_, file: string, hash = "") => `](${REPO_URL}/blob/main/docs/${file.replace(/^\.?\//, "")}${hash})`,
);
// Screenshots are referenced as guide/images/… (right on GitHub); the bundle knows them by file name.
const SOURCE_IN_APP = SOURCE.replace(/\]\(guide\/images\//g, "](images/");
const MARKER = "<!-- install-builder -->";
const [BEFORE, AFTER] = SOURCE_IN_APP.includes(MARKER) ? SOURCE_IN_APP.split(MARKER) : [SOURCE_IN_APP, ""];

/** What "Copy for an AI assistant" puts on the clipboard: a brief for the assistant, then the whole guide. */
function aiPrompt(): string {
  const origin = window.location.origin;
  return [
    "You are helping me install MSY Homework (a free English-homework web app) on my own Cloudflare account.",
    "I am not technical: guide me one step at a time, in Vietnamese, and wait for me to confirm each step.",
    `The full guide is below (also at ${origin}/setup). Follow it in order: Cloudflare account, enable R2,`,
    "create an API token, then run the install command.",
    "",
    "Rules:",
    "- Ask me for my Cloudflare API token (<TOKEN_CLOUDFLARE>). While the source code is private I also need a",
    "  read-only deploy key (<API_DEPLOY>) from the project owner — ask whether I have it.",
    "- If you can run commands on my computer (e.g. a coding agent with a terminal), run them for me; otherwise",
    `  give me the exact command to paste, with my values filled in. Install script: ${origin}/install.sh (macOS/Linux)`,
    `  or ${origin}/install.ps1 (Windows).`,
    "- Never send my token or key anywhere except in the install command on my own machine.",
    "- After install, help me sign in with the default account and change its password (last section).",
    "",
    "=== GUIDE ===",
    "",
    SOURCE.replace(MARKER, ""),
  ].join("\n");
}

/** Section headings (##) for the contents rail. */
const SECTIONS = [...SOURCE.matchAll(/^##\s+(.+)$/gm)].map((m) => ({ title: m[1].trim(), id: slugify(m[1].trim()) }));

const docHref = (file: string, hash: string) => `${REPO_URL}/blob/main/docs/${file}.md${hash}`;

export default function SetupGuidePage() {
  useDocumentTitle(t("setupGuide.page.title"));
  const active = useActiveSection();
  // The copy button sits in the hero; it joins the header only once the hero has scrolled away.
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroOut, setHeroOut] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHeroOut(!e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Old links carry Vietnamese anchors with diacritics → jump to the matching heading and tidy the URL.
  // A heading inside a collapsed <details> opens it first.
  useEffect(() => {
    const go = () => {
      const { hash } = window.location;
      const id = anchor(hash);
      if (!id) return;
      const el = document.getElementById(id.slice(1));
      const box = el?.closest("details");
      if (box && !box.open) box.open = true;
      else if (id === hash) return;
      el?.scrollIntoView({ block: "start" });
      if (id !== hash) history.replaceState(null, "", id);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo size="sm" to="/home" />
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/home" className="hidden items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 sm:flex dark:text-slate-300 dark:hover:bg-slate-800">
              <ArrowLeft className="size-4" /> {t("setupGuide.nav.home")}
            </Link>
            {heroOut && <CopyForAi compact />}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <Github className="size-4" /> <span className="hidden sm:inline">{t("setupGuide.nav.github")}</span>
            </a>
            <Link to="/teacher/login" className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-white hover:bg-cyan-600">
              <LogIn className="size-4" /> <span className="hidden sm:inline">{t("setupGuide.nav.teacherLogin")}</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div ref={heroRef} className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <HeroDecor seed="setup-guide" className="text-cyan-500/15 dark:text-cyan-400/10" />
          <div className="relative flex flex-wrap items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <Rocket className="size-7" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("setupGuide.page.title")}</h1>
              <p className="mt-0.5 truncate text-sm text-slate-500" title={t("setupGuide.page.subtitle")}>
                {t("setupGuide.page.subtitle")}
              </p>
            </div>
            <div className="w-full sm:ml-auto sm:w-auto">
              <CopyForAi />
            </div>
          </div>
          {getLang() !== "vi" && <p className="relative mt-3 text-xs text-amber-600">{t("setupGuide.page.vietnameseOnly")}</p>}
        </div>

        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-2 flex items-center gap-1.5 px-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <ListTree className="size-3.5" /> {t("setupGuide.toc.title")}
              </p>
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "block truncate rounded-lg px-2 py-1.5 text-sm transition",
                    active === s.id
                      ? "bg-cyan-50 font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                      : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                  title={s.title}
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <Markdown source={BEFORE} images={IMAGES} docHref={docHref} />
            {AFTER && (
              <>
                <InstallBuilder />
                <Markdown source={AFTER} images={IMAGES} docHref={docHref} />
              </>
            )}
          </article>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}

/** Copies the guide plus a brief, so an AI assistant can walk a beginner through the install. */
function CopyForAi({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(aiPrompt()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? t("setupGuide.ai.copied") : t("setupGuide.ai.hint")}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        compact ? "" : "w-full justify-center border border-slate-200 bg-white sm:w-auto dark:border-slate-700 dark:bg-slate-900",
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      {copied ? <Check className="size-4" /> : <Bot className="size-4" />}
      <span className={compact ? "hidden md:inline" : ""}>{copied ? t("setupGuide.ai.copiedShort") : t("setupGuide.ai.copy")}</span>
    </button>
  );
}

/** The ## section currently at the top of the viewport. */
function useActiveSection(): string {
  const [active, setActive] = useState(SECTIONS[0]?.id ?? "");
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const onScroll = () => {
      let current = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top < 140) current = el.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return active;
}

type Os = "unix" | "windows";

/** Fills the install command in from what the reader pastes; nothing leaves the browser. */
function InstallBuilder() {
  const [os, setOs] = useState<Os>(() => (/windows/i.test(navigator.userAgent) ? "windows" : "unix"));
  const [token, setToken] = useState("");
  const [key, setKey] = useState("");
  const [domain, setDomain] = useState("");

  const command = useMemo(() => {
    const origin = window.location.origin;
    const tk = token.trim() || "<TOKEN_CLOUDFLARE>";
    const k = key.trim().replace(/\s+/g, "") || "<API_DEPLOY>";
    const dm = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (os === "windows") {
      return [
        REPO_PRIVATE ? `$env:API_DEPLOY = "${k}"; ` : "",
        `$env:CF_TOKEN = "${tk}"; `,
        dm ? `$env:CF_DOMAIN = "${dm}"; ` : "",
        `irm ${origin}/install.ps1 | iex`,
      ].join("");
    }
    return `curl -fsSL ${origin}/install.sh | bash -s -- ${REPO_PRIVATE ? `--key ${k} ` : ""}${tk}${dm ? ` --domain ${dm}` : ""}`;
  }, [os, token, key, domain]);

  const field =
    "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm text-slate-800 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <section className="my-6 rounded-2xl border-2 border-cyan-200 bg-gradient-to-br from-cyan-50/80 to-emerald-50/60 p-4 sm:p-5 dark:border-cyan-500/30 dark:from-cyan-500/10 dark:to-emerald-500/5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{t("setupGuide.builder.title")}</h3>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{t("setupGuide.builder.subtitle")}</p>
        </div>
        <div className="flex shrink-0 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {(["unix", "windows"] as const).map((o) => {
            const Icon = o === "unix" ? Apple : Monitor;
            return (
              <button
                key={o}
                type="button"
                onClick={() => setOs(o)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  os === o ? "bg-cyan-500 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <Icon className="size-4" /> {t(o === "unix" ? "setupGuide.builder.os.unix" : "setupGuide.builder.os.windows")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">{t("setupGuide.builder.token")}</span>
          <input className={field} value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("setupGuide.builder.tokenPlaceholder")} spellCheck={false} autoComplete="off" />
        </label>
        {REPO_PRIVATE && (
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <KeyRound className="size-3.5 text-amber-500" /> {t("setupGuide.builder.key")}
              <span className="truncate text-xs font-normal text-slate-500">· {t("setupGuide.builder.keyHint")}</span>
            </span>
            <input className={field} value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("setupGuide.builder.keyPlaceholder")} spellCheck={false} autoComplete="off" />
          </label>
        )}
        <label className={cn("block", REPO_PRIVATE && "sm:col-span-2")}>
          <span className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">{t("setupGuide.builder.domain")}</span>
          <input className={field} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t("setupGuide.builder.domainPlaceholder")} spellCheck={false} autoComplete="off" />
        </label>
      </div>

      <CodeBlock code={command} lang={os === "windows" ? "powershell" : "bash"} />
      <p className="text-sm text-slate-600 dark:text-slate-300">{t(os === "windows" ? "setupGuide.builder.run.windows" : "setupGuide.builder.run.unix")}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="size-3.5 shrink-0 text-emerald-500" /> {t("setupGuide.builder.privacy")}
      </p>
    </section>
  );
}
