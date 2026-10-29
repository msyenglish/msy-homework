// Renders the teacher guide's Markdown (docs/guide/*.md) as React elements — no raw HTML is injected.
// Covers what the guide uses: headings, paragraphs, lists, tables, blockquotes (incl. GitHub alerts
// `> [!NOTE]`), `<details>` blocks, code fences, images, links, **bold**, *italic* and `code`.
import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Info, Lightbulb, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { cn } from "../../lib/utils";

/** Heading anchor: lowercase ASCII without diacritics ("Quên mật khẩu" → "quen-mat-khau"), spaces → "-". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/** A "#…" fragment written GitHub style (with diacritics) → the anchor slugify gives the heading. */
export const anchor = (hash: string) => (hash ? `#${slugify(decodeURIComponent(hash.replace(/^#/, "")))}` : "");

export interface MarkdownProps {
  source: string;
  /** Image file name (e.g. "10-learners.jpg") → URL. */
  images: Record<string, string>;
  /** Turns a link to another guide file ("02-cai-dat.md#x") into an in-app path. */
  docHref: (file: string, hash: string) => string;
  onImage?: (src: string, alt: string) => void;
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string, p: MarkdownProps, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`;
    if (!part) return null;
    if (part.startsWith("**")) return <strong key={k} className="font-bold text-slate-900 dark:text-white">{inline(part.slice(2, -2), p, k)}</strong>;
    if (part.startsWith("`")) {
      const code = part.slice(1, -1);
      // A placeholder the reader replaces (<TOKEN_CLOUDFLARE>) stands out the same way as in command blocks.
      if (/^<[^<>\s]+>$/.test(code))
        return (
          <code key={k} className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40">
            {code}
          </code>
        );
      return (
        <code key={k} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-rose-600 [overflow-wrap:anywhere] dark:bg-slate-800 dark:text-rose-300">
          {code}
        </code>
      );
    }
    if (part.startsWith("*")) return <em key={k}>{inline(part.slice(1, -1), p, k)}</em>;
    const img = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) return <GuideImage key={k} alt={img[1]} src={resolveImage(img[2], p)} onOpen={p.onImage} />;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      const doc = href.match(/^([\w-]+)\.md(#.*)?$/);
      const cls = "font-semibold text-cyan-700 underline decoration-cyan-300 underline-offset-2 hover:decoration-cyan-600 dark:text-cyan-300";
      if (doc) return <Link key={k} to={p.docHref(doc[1], doc[2] ?? "")} className={cls}>{inline(label, p, k)}</Link>;
      if (href.startsWith("#")) return <a key={k} href={anchor(href)} className={cls}>{inline(label, p, k)}</a>;
      return (
        <a key={k} href={href} target="_blank" rel="noreferrer" className={cls}>
          {inline(label, p, k)}
        </a>
      );
    }
    return <Fragment key={k}>{part}</Fragment>;
  });
}

const resolveImage = (src: string, p: MarkdownProps) => p.images[src.replace(/^images\//, "")] ?? src;

function GuideImage({ src, alt, onOpen }: { src: string; alt: string; onOpen?: (src: string, alt: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(src, alt)}
      className="my-2 block w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700"
    >
      <img src={src} alt={alt} loading="lazy" className="w-full" />
      {alt && <span className="block border-t border-slate-100 px-3 py-1.5 text-left text-xs text-slate-500 dark:border-slate-800">{alt}</span>}
    </button>
  );
}

/** GitHub alert kinds (`> [!WARNING]`) → icon and colours. */
const ALERTS: Record<string, { Icon: LucideIcon; box: string; icon: string }> = {
  NOTE: { Icon: Info, box: "border-cyan-400 bg-cyan-50/70 dark:bg-cyan-500/10", icon: "text-cyan-600 dark:text-cyan-300" },
  TIP: { Icon: Lightbulb, box: "border-emerald-400 bg-emerald-50/70 dark:bg-emerald-500/10", icon: "text-emerald-600 dark:text-emerald-300" },
  IMPORTANT: { Icon: Info, box: "border-violet-400 bg-violet-50/70 dark:bg-violet-500/10", icon: "text-violet-600 dark:text-violet-300" },
  WARNING: { Icon: TriangleAlert, box: "border-amber-400 bg-amber-50/80 dark:bg-amber-500/10", icon: "text-amber-600 dark:text-amber-300" },
  CAUTION: { Icon: OctagonAlert, box: "border-rose-400 bg-rose-50/70 dark:bg-rose-500/10", icon: "text-rose-600 dark:text-rose-300" },
};

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown(p: MarkdownProps) {
  const lines = p.source.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    // Code fence
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      out.push(<CodeBlock key={k} code={body.join("\n")} lang={lang} />);
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const id = slugify(h[2]);
      const cls = [
        "mt-2 mb-5 text-3xl font-extrabold tracking-tight",
        "mt-10 mb-3 border-b border-slate-200 pb-2 text-xl font-extrabold dark:border-slate-800",
        "mt-7 mb-2 text-lg font-bold",
        "mt-5 mb-2 font-bold",
      ][level - 1];
      const Tag = (["h1", "h2", "h3", "h4"] as const)[level - 1];
      out.push(
        <Tag key={k} id={id} className={cn("scroll-mt-24 text-slate-900 dark:text-white", cls)}>
          {inline(h[2], p, k)}
        </Tag>,
      );
      i++;
      continue;
    }
    // Table
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push(
        <div key={k} className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="px-3 py-2 font-bold">
                    {inline(c, p, `${k}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top text-slate-600 dark:text-slate-300">
                      {inline(c, p, `${k}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Collapsible block: <details>, <summary>…</summary>, Markdown body, </details>
    if (line.trim() === "<details>") {
      const body: string[] = [];
      let summary = "";
      i++;
      while (i < lines.length && lines[i].trim() !== "</details>") {
        const sm = lines[i].trim().match(/^<summary>(.*)<\/summary>$/);
        if (sm && !summary) summary = sm[1];
        else body.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        <details key={k} className="group my-4 rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-open:rotate-90" />
            {inline(summary, p, `${k}s`)}
          </summary>
          <div className="border-t border-slate-200 px-4 pb-2 dark:border-slate-700 [&>:first-child]:mt-3">
            <Markdown {...p} source={body.join("\n")} />
          </div>
        </details>,
      );
      continue;
    }
    // Blockquote; a "[!KIND]" first line makes it a GitHub alert. A bare ">" line separates paragraphs.
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      const alert = ALERTS[body[0]?.trim().match(/^\[!(\w+)\]$/)?.[1] ?? ""];
      if (alert) body.shift();
      const paras = body.join("\n").split(/\n\s*\n/).map((s) => s.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
      const content = paras.map((para, j) => (
        <p key={j} className={j ? "mt-2" : ""}>
          {inline(para, p, `${k}q${j}`)}
        </p>
      ));
      out.push(
        alert ? (
          <div key={k} className={cn("my-4 flex gap-3 rounded-r-xl border-l-4 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200", alert.box)}>
            <alert.Icon className={cn("mt-0.5 size-4 shrink-0", alert.icon)} />
            <div className="min-w-0">{content}</div>
          </div>
        ) : (
          <blockquote key={k} className="my-4 rounded-r-xl border-l-4 border-cyan-400 bg-cyan-50/70 px-4 py-3 text-sm text-slate-700 dark:bg-cyan-500/10 dark:text-slate-200">
            {content}
          </blockquote>
        ),
      );
      continue;
    }
    // Lists (continuation lines are indented)
    const listItem = /^(\s*)(?:[-*]|\d+\.)\s+/;
    if (listItem.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && (listItem.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (listItem.test(lines[i])) items.push(lines[i].replace(listItem, ""));
        else items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      out.push(
        <Tag key={k} className={cn("my-3 space-y-1.5 pl-6 text-slate-700 dark:text-slate-300", ordered ? "list-decimal" : "list-disc marker:text-cyan-500")}>
          {items.map((it, j) => (
            <li key={j} className="pl-1">
              {inline(it, p, `${k}l${j}`)}
            </li>
          ))}
        </Tag>,
      );
      continue;
    }
    // Image on its own line
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      out.push(<GuideImage key={k} alt={img[1]} src={resolveImage(img[2], p)} onOpen={p.onImage} />);
      i++;
      continue;
    }
    // Paragraph: consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\||!\[|<details>)/.test(lines[i]) && !listItem.test(lines[i])) para.push(lines[i++].trim());
    // A line no block rule claimed (e.g. a lone "|") still advances, or the loop would never end.
    if (!para.length) para.push(lines[i++].trim());
    out.push(
      <p key={k} className="my-3 leading-relaxed text-slate-700 dark:text-slate-300">
        {inline(para.join(" "), p, k)}
      </p>,
    );
  }
  return <>{out}</>;
}
