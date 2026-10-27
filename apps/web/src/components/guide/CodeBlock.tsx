// A command block for the guides: wraps long lines, has a copy button, and colours what matters —
// the command, its flags, comments, and above all the <PLACEHOLDERS> the reader has to replace.
import { useState, type ReactNode } from "react";
import { Check, Copy, SquareTerminal } from "lucide-react";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

const COMMANDS = /^(pnpm|npx|curl|bash|irm|iex|git|cd|node|wrangler|base64)$/;

/** A <PLACEHOLDER> the reader must replace — the one thing in a command that is theirs. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-amber-400/20 px-1 font-semibold text-amber-300 ring-1 ring-amber-400/40">{children}</span>
  );
}

/** One line of shell / PowerShell, tokenised just enough to colour it. */
function Line({ text }: { text: string }) {
  if (/^\s*#/.test(text)) return <span className="italic text-slate-500">{text}</span>;
  const parts = text.split(/(<[^<>\s]+>|"[^"]*"|'[^']*'|\s+|\|)/).filter((p) => p !== "");
  let expectCommand = true;
  return (
    <>
      {parts.map((p, i) => {
        if (/^<[^<>\s]+>$/.test(p)) {
          expectCommand = false;
          return <Placeholder key={i}>{p}</Placeholder>;
        }
        if (/^\s+$/.test(p)) return p;
        if (p === "|" || p === ";") {
          expectCommand = true;
          return <span key={i} className="text-slate-500">{p}</span>;
        }
        const cmd = expectCommand && COMMANDS.test(p.replace(/;$/, ""));
        expectCommand = p.endsWith(";");
        if (cmd) return <span key={i} className="font-semibold text-emerald-400">{p}</span>;
        if (/^--?[\w-]+/.test(p)) return <span key={i} className="text-sky-300">{p}</span>;
        if (/^\$env:/i.test(p)) return <span key={i} className="text-violet-300">{p}</span>;
        if (/^["'].*["']$/.test(p)) {
          // A quoted placeholder ("<TOKEN>") keeps its highlight inside the quotes.
          const inner = p.slice(1, -1);
          return /^<[^<>\s]+>$/.test(inner) ? (
            <span key={i} className="text-lime-300">
              {p[0]}
              <Placeholder>{inner}</Placeholder>
              {p[0]}
            </span>
          ) : (
            <span key={i} className="text-lime-300">{p}</span>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const isPs = /^(powershell|ps1?|pwsh)$/i.test(lang ?? "");
  const hasPlaceholder = /<[^<>\s]+>/.test(code);
  const copy = () =>
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/60 px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-400">
          <SquareTerminal className="size-3.5 shrink-0" />
          {isPs ? t("teacherGuide.code.powershell") : t("teacherGuide.code.terminal")}
          {hasPlaceholder && (
            <span className="truncate text-amber-300/80">· {t("teacherGuide.code.replaceHint")}</span>
          )}
        </span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition",
            copied ? "bg-emerald-500/15 text-emerald-300" : "text-slate-300 hover:bg-slate-800",
          )}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t("teacherGuide.code.copied") : t("teacherGuide.code.copy")}
        </button>
      </div>
      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] p-4 font-mono text-[13px] leading-relaxed text-slate-100">
        {code.split("\n").map((l, i) => (
          <div key={i}>
            <Line text={l} />
          </div>
        ))}
      </pre>
    </div>
  );
}
