// Teacher guide inside the app. The content IS docs/guide/*.md (bundled at build time), so the guide on
// GitHub and the one in the app can never drift apart. Screenshots come from docs/guide/images.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpenText, Search, X } from "lucide-react";
import { anchor, Markdown } from "../../components/guide/Markdown";
import { HeroDecor } from "../../components/HeroDecor";
import { Input } from "../../components/ui";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { scrollPageTop } from "../../lib/navState";
import { cn } from "../../lib/utils";
import { getLang, t } from "../../i18n";

const SOURCES = import.meta.glob("../../../../../docs/guide/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const IMAGE_URLS = import.meta.glob("../../../../../docs/guide/images/*.{jpg,png}", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const IMAGES: Record<string, string> = Object.fromEntries(Object.entries(IMAGE_URLS).map(([path, url]) => [path.split("/").pop()!, url]));

interface Chapter {
  slug: string;
  title: string;
  source: string;
}

/** README is the index; numbered files are the chapters, in file-name order. */
const CHAPTERS: Chapter[] = Object.entries(SOURCES)
  .map(([path, source]) => {
    const file = path.split("/").pop()!.replace(/\.md$/, "");
    return { slug: file === "README" ? "" : file, title: source.match(/^#\s+(.+)$/m)?.[1] ?? file, source };
  })
  .sort((a, b) => (a.slug === "" ? -1 : b.slug === "" ? 1 : a.slug.localeCompare(b.slug)));

/** Plain text of a chapter, for search. */
const plain = (md: string) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`|_[\]()]/g, " ")
    .replace(/\s+/g, " ");

export default function TeacherGuidePage() {
  const { slug = "" } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  const index = Math.max(0, CHAPTERS.findIndex((c) => c.slug === slug));
  const chapter = CHAPTERS[index];
  useDocumentTitle(t("teacherGuide.page.title"));

  // New chapter → top of the page, or the heading the link pointed at.
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(anchor(hash).slice(1));
      if (el) return el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    scrollPageTop();
  }, [slug, hash]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return CHAPTERS.flatMap((c) => {
      const text = plain(c.source);
      const at = text.toLowerCase().indexOf(q);
      return at < 0 ? [] : [{ chapter: c, snippet: text.slice(Math.max(0, at - 40), at + q.length + 60).trim() }];
    });
  }, [query]);

  const href = (s: string, h = "") => `/teacher/guide${s ? `/${s}` : ""}${h}`;
  const prev = CHAPTERS[index - 1];
  const next = CHAPTERS[index + 1];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="teacher-guide" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <BookOpenText className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherGuide.page.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("teacherGuide.page.subtitle")}</p>
          </div>
        </div>
        {getLang() !== "vi" && (
          <p className="relative mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            {t("teacherGuide.page.vietnameseOnly")}
          </p>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-4 dark:border-slate-800 dark:bg-slate-900">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder={t("teacherGuide.search.placeholder")}
            leftIcon={<Search className="size-4" />}
          />
          <nav className="mt-3 space-y-0.5">
            {hits
              ? hits.length
                ? hits.map(({ chapter: c, snippet }) => (
                    <Link
                      key={c.slug}
                      to={href(c.slug)}
                      onClick={() => setQuery("")}
                      className="block rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{c.title}</span>
                      <span className="line-clamp-2 text-xs text-slate-500">…{snippet}…</span>
                    </Link>
                  ))
                : <p className="px-3 py-4 text-center text-sm text-slate-400">{t("teacherGuide.search.empty")}</p>
              : CHAPTERS.map((c, i) => (
                  <Link
                    key={c.slug}
                    to={href(c.slug)}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm font-semibold transition",
                      i === index
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
                    )}
                  >
                    {c.slug ? c.title : t("teacherGuide.nav.overview")}
                  </Link>
                ))}
          </nav>
        </aside>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <Markdown
            source={chapter.source}
            images={IMAGES}
            docHref={(file, h) => href(file === "README" ? "" : file, h)}
            onImage={(src, alt) => setZoom({ src, alt })}
          />
          <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
            {prev ? (
              <button type="button" onClick={() => navigate(href(prev.slug))} className="group flex max-w-[48%] items-center gap-2 text-left">
                <ArrowLeft className="size-4 shrink-0 text-slate-400 group-hover:text-cyan-600" />
                <span>
                  <span className="block text-xs text-slate-400">{t("teacherGuide.nav.prev")}</span>
                  <span className="block text-sm font-bold text-slate-700 group-hover:text-cyan-700 dark:text-slate-200">{prev.slug ? prev.title : t("teacherGuide.nav.overview")}</span>
                </span>
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button type="button" onClick={() => navigate(href(next.slug))} className="group ml-auto flex max-w-[48%] items-center gap-2 text-right">
                <span>
                  <span className="block text-xs text-slate-400">{t("teacherGuide.nav.next")}</span>
                  <span className="block text-sm font-bold text-slate-700 group-hover:text-cyan-700 dark:text-slate-200">{next.title}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-slate-400 group-hover:text-cyan-600" />
              </button>
            )}
          </div>
        </article>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={() => setZoom(null)}>
          <button type="button" aria-label={t("common.close")} className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="size-5" />
          </button>
          <figure className="max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.src} alt={zoom.alt} className="max-h-[85vh] w-auto rounded-xl shadow-2xl" />
            {zoom.alt && <figcaption className="mt-2 text-center text-sm text-white/80">{zoom.alt}</figcaption>}
          </figure>
        </div>
      )}
    </div>
  );
}
