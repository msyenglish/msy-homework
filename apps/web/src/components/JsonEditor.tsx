import { useEffect, useRef, type ReactNode } from "react";

// Hand-rolled JSON syntax highlighting (no external library).
// A transparent <textarea> sits over a highlighted <pre>; only the textarea scrolls, the <pre> follows it.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tailwind classes written literally so the JIT picks them up.
const TOK = {
  key: "text-sky-600 dark:text-sky-300",
  str: "text-emerald-600 dark:text-emerald-300",
  num: "text-amber-600 dark:text-amber-300",
  bool: "text-violet-600 dark:text-violet-300",
  null: "text-rose-500 dark:text-rose-400",
};

function highlightJson(src: string): string {
  const esc = escapeHtml(src);
  return esc.replace(
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls: keyof typeof TOK = "num";
      if (m.startsWith("&quot;") || m.startsWith('"')) cls = /:\s*$/.test(m) ? "key" : "str";
      else if (m === "true" || m === "false") cls = "bool";
      else if (m === "null") cls = "null";
      return `<span class="${TOK[cls]}">${m}</span>`;
    },
  );
}

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  actions?: ReactNode; // floating buttons in the editor's top-right corner
}

export function JsonEditor({ value, onChange, placeholder, className = "", ariaLabel, actions }: JsonEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Mirror the textarea's scroll onto the highlight layer
  useEffect(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    const sync = () => {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  }, []);

  // Re-align after edits: the highlight re-renders and must land on the textarea's offset.
  useEffect(() => {
    if (taRef.current && preRef.current) preRef.current.scrollTop = taRef.current.scrollTop;
  }, [value]);

  // Tab inserts 2 spaces instead of moving focus
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + "  " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  const shared =
    "m-0 w-full font-mono text-xs leading-relaxed whitespace-pre-wrap break-words p-4 [scrollbar-gutter:stable]";

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      {/* Floating actions in the editor's top-right corner (e.g. Format). */}
      {actions && <div className="absolute right-2 top-2 z-10 flex items-center gap-1">{actions}</div>}
      <pre ref={preRef} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${shared} text-slate-800 dark:text-slate-100`}>
        <code dangerouslySetInnerHTML={{ __html: highlightJson(value) + "\n" }} />
      </pre>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent text-transparent caret-slate-800 outline-none placeholder:text-slate-400 dark:caret-white ${shared}`}
      />
    </div>
  );
}
