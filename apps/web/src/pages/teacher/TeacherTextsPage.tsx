// Teacher copy editor: override any interface text per language. Overrides live in D1 and survive
// core updates; an override whose built-in text changed since it was written is flagged for review.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Pencil, RotateCcw, Save, Search, Type, X } from "lucide-react";
import { UI_LANGS, type UiLang } from "@msyen/shared";
import { HeroDecor } from "../../components/HeroDecor";
import { Button, Input, Select, Textarea } from "../../components/ui";
import { catalogEntries, forgetOverrides, LANG_LABEL, t } from "../../i18n";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { cn } from "../../lib/utils";

type Override = { text: string; base: string; at: string };
type Overrides = Partial<Record<UiLang, Record<string, Override>>>;

async function call<T>(init?: RequestInit): Promise<T> {
  const res = await fetch("/api/v1/teacher/ui-texts", {
    credentials: "include",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

type Show = "" | "edited" | "stale";

const PAGE = 60;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export default function TeacherTextsPage() {
  useDocumentTitle(t("teacherTexts.page.title"));
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ui-texts"], queryFn: () => call<{ overrides: Overrides }>() });
  const overrides = data?.overrides ?? {};
  const entries = useMemo(() => catalogEntries(), []);
  const [lang, setLangTab] = useState<UiLang>("vi");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("");
  const [group, setGroup] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const save = useMutation({
    mutationFn: (body: { lang: UiLang; key: string; text: string | null; base: string }) => call({ method: "PUT", body: JSON.stringify(body) }),
    onSuccess: (_r, v) => {
      toast.success(v.text ? t("teacherTexts.toast.saved") : t("teacherTexts.toast.reset"));
      forgetOverrides();
      setChanged(true);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["ui-texts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mine = overrides[lang] ?? {};
  const builtIn = (e: (typeof entries)[number]) => (lang === "en" ? e.en : e.vi);
  const isStale = (e: (typeof entries)[number]) => !!mine[e.key] && !!mine[e.key].base && mine[e.key].base !== builtIn(e);
  const editedCount = entries.filter((e) => mine[e.key]).length;
  const staleCount = entries.filter(isStale).length;

  const groupOptions = useMemo(
    () => [{ value: "", label: t("teacherTexts.filter.allGroups") }, ...[...new Set(entries.map((e) => e.ns))].sort().map((ns) => ({ value: ns, label: ns }))],
    [entries],
  );

  const view: Show = show === "stale" && !staleCount ? "" : show;
  const needle = fold(q.trim());
  const rows = entries.filter((e) => {
    if (group && e.ns !== group) return false;
    if (view === "edited" && !mine[e.key]) return false;
    if (view === "stale" && !isStale(e)) return false;
    if (!needle) return true;
    return fold(`${e.key} ${e.vi} ${e.en} ${mine[e.key]?.text ?? ""}`).includes(needle);
  });

  const showOptions = [
    { value: "", label: t("teacherTexts.filter.all") },
    { value: "edited", label: `${t("teacherTexts.filter.onlyEdited")} (${editedCount})` },
    ...(staleCount > 0 ? [{ value: "stale", label: `${t("teacherTexts.filter.onlyStale")} (${staleCount})` }] : []),
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="teacher-texts" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30 sm:size-16">
            <Type className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherTexts.page.title")}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span>{t("teacherTexts.page.subtitle")}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{t("teacherTexts.stats.total", { n: entries.length })}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="font-bold text-cyan-600 dark:text-cyan-400">{t("teacherTexts.stats.edited", { n: editedCount })}</span>
              {staleCount > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{t("teacherTexts.stats.stale", { n: staleCount })}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {changed && (
              <Button size="lg" variant="outline" onClick={() => location.reload()}>
                <RotateCcw className="size-4" /> {t("teacherTexts.hint.reload")}
              </Button>
            )}
            <div role="tablist" aria-label={t("teacherTexts.filter.editing")} className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {UI_LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lang === l}
                  onClick={() => {
                    setLangTab(l);
                    setEditing(null);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
                    lang === l ? "bg-cyan-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  <span className="text-[11px] font-bold uppercase opacity-70">{l}</span>
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} onClear={() => setQ("")} placeholder={t("teacherTexts.filter.search")} leftIcon={<Search className="size-4" />} />
        </div>
        <Select fullWidth={false} className="min-w-40 flex-1 sm:flex-none" options={groupOptions} value={group} onChange={(v) => { setGroup(v); setLimit(PAGE); }} menuClassName="w-56" menuMaxHeight={520} />
        <Select fullWidth={false} className="min-w-40 flex-1 sm:flex-none" options={showOptions} value={view} onChange={(v) => { setShow(v as Show); setLimit(PAGE); }} menuClassName="w-64" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden items-center gap-x-4 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,1fr)_2rem] dark:border-slate-800 dark:bg-slate-800/40">
          <span>{t("teacherTexts.col.key")}</span>
          <span>{LANG_LABEL[lang]}</span>
          <span>{LANG_LABEL[lang === "en" ? "vi" : "en"]}</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.slice(0, limit).map((e) => (
            <TextRow
              key={e.key}
              entryKey={e.key}
              builtIn={builtIn(e)}
              other={lang === "en" ? e.vi : e.en}
              override={mine[e.key]}
              stale={isStale(e)}
              open={editing === e.key}
              busy={save.isPending}
              onOpen={() => setEditing(e.key)}
              onClose={() => setEditing(null)}
              onSave={(text) => save.mutate({ lang, key: e.key, text, base: builtIn(e) })}
            />
          ))}
          {!rows.length && <p className="p-8 text-center text-sm text-slate-400">{t("teacherTexts.empty")}</p>}
        </div>
      </div>
      {rows.length > limit && (
        <div className="mt-3 text-center">
          <Button variant="neutral" onClick={() => setLimit((n) => n + PAGE * 2)}>
            <ChevronDown className="size-4" /> {t("teacherTexts.showMore", { n: rows.length - limit })}
          </Button>
        </div>
      )}
    </div>
  );
}

function TextRow({
  entryKey,
  builtIn,
  other,
  override,
  stale,
  open,
  busy,
  onOpen,
  onClose,
  onSave,
}: {
  entryKey: string;
  builtIn: string;
  other: string;
  override?: Override;
  stale: boolean;
  open: boolean;
  busy: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (text: string | null) => void;
}) {
  const [draft, setDraft] = useState(override?.text ?? builtIn);
  return (
    <div className={cn(open ? "bg-slate-50/70 dark:bg-slate-800/30" : "hover:bg-slate-50/60 dark:hover:bg-slate-800/20")}>
      <div
        onClick={open ? undefined : onOpen}
        className={cn(
          "grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-4 gap-y-0.5 px-4 py-2 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,1fr)_2rem]",
          !open && "cursor-pointer",
        )}
      >
        <div className="col-start-1 flex min-w-0 items-center gap-1.5">
          <code className="truncate text-[11px] text-slate-400" title={entryKey}>
            {entryKey}
          </code>
          {override && !stale && <span className="size-1.5 shrink-0 rounded-full bg-cyan-500" title={t("teacherTexts.badge.edited")} />}
          {stale && (
            <span title={t("teacherTexts.badge.stale")}>
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
            </span>
          )}
        </div>
        <div className="col-start-1 min-w-0 text-sm md:col-start-2 md:row-start-1">
          {override ? (
            <>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{override.text}</span>
              <span className="ml-2 text-xs text-slate-400 line-through decoration-slate-300">{builtIn}</span>
            </>
          ) : (
            <span className="text-slate-800 dark:text-slate-100">{builtIn}</span>
          )}
        </div>
        <p className="col-start-1 truncate text-xs text-slate-400 md:col-start-3 md:row-start-1 md:text-sm" title={other}>
          {other}
        </p>
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            if (open) onClose();
            else onOpen();
          }}
          aria-label={open ? t("common.close") : t("teacherTexts.action.edit")}
          className="col-start-2 row-span-3 row-start-1 flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:col-start-4 md:row-span-1 dark:hover:bg-slate-800"
        >
          {open ? <X className="size-4" /> : <Pencil className="size-4" />}
        </button>
      </div>
      {open && (
        <div className="space-y-2 px-4 pb-3 md:pl-[calc(15rem+2rem)]">
          {stale && <p className="text-xs text-amber-700 dark:text-amber-300">{t("teacherTexts.staleHint", { base: builtIn })}</p>}
          <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("teacherTexts.placeholder.override")} autoFocus />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !draft.trim() || draft.trim() === builtIn} onClick={() => onSave(draft)}>
              <Save className="size-4" /> {t("common.save")}
            </Button>
            {stale && override && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onSave(override.text)}>
                {t("teacherTexts.action.keep")}
              </Button>
            )}
            {override && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(null)}>
                <RotateCcw className="size-4" /> {t("teacherTexts.action.reset")}
              </Button>
            )}
            <span className="ml-auto text-xs text-slate-400">{t("teacherTexts.hint.placeholders")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
