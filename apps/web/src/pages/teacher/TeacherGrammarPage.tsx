// Teacher GRAMMAR page: the handbook points learners read and drill.
// Left: a sticky, searchable list grouped by CEFR band. Right: the selected point —
//   · Preview: the point as learners see it.
//   · Edit: a form for the core fields, plus raw JSON for the rarely used extras.
//   · Drill: items copied from the grammar-tagged questions of grammar exercises, plus ones pasted as JSON.
//   · Translate: Vietnamese → English sentences, typed or pasted as JSON from a copied AI prompt.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  BookText,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  Eye,
  Languages,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { CEFR_BANDS, grammarInputSchema, QTYPE_LABEL, QTYPE_LABEL_EN, type Cefr, type Grammar, type GrammarDrillItemInput, type GrammarInput, type QuestionType } from "@msyen/shared";
import { grammarApi } from "../../lib/api";
import { HeroDecor } from "../../components/HeroDecor";
import { JsonEditor } from "../../components/JsonEditor";
import { NumberInput } from "../../components/NumberInput";
import GrammarDetail from "../../components/GrammarDetail";
import GrammarPromptDrawer from "../../components/GrammarPromptDrawer";
import { Button, Combobox, Drawer, Input, Select, Textarea } from "../../components/ui";
import { confirmAsk } from "../../components/confirm";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { BAND_COLOR } from "../../lib/cefr";
import { cn } from "../../lib/utils";
import { fmtAgo, fmtDate } from "../../lib/format";
import { QTYPE_THUMB } from "../../lib/questionTypes";
import { getLang, t } from "../../i18n";

type Tab = "preview" | "edit" | "drill" | "translate";

const NEW_POINT: GrammarInput = {
  id: "",
  title: "",
  category: "",
  cefr: "A1",
  summary: "",
  forms: [{ label: "Affirmative", formula: "" }],
  usage: [""],
  examples: [{ en: "", vi: "" }],
};

/** Splits "English — Vietnamese" titles into their two halves. */
const splitTitle = (t: string): [string, string] => {
  const i = t.indexOf(" — ");
  return i < 0 ? [t, ""] : [t.slice(0, i), t.slice(i + 3)];
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0111/g, "d").toLowerCase();

type Point = Awaited<ReturnType<typeof grammarApi.list>>["items"][number];
type Practice = "" | "none" | "ready";

export default function TeacherGrammarPage() {
  useDocumentTitle(t("teacherGrammar.page.title"));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["teacher-grammar"], queryFn: grammarApi.list });
  const points = useMemo(() => data?.items ?? [], [data]);
  // The open point lives in the URL (?p=) so a link opens its drawer and Back closes it.
  const [params, setParams] = useSearchParams();
  const selected = params.get("p") ?? "";
  const pushed = useRef(false);
  const [creating, setCreating] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [band, setBand] = useState<Cefr | "">("");
  const [category, setCategory] = useState("");
  const [practice, setPractice] = useState<Practice>("");
  const [q, setQ] = useState("");
  const dirty = useRef<Record<string, boolean>>({});
  const onDirty = useCallback((k: string, d: boolean) => {
    dirty.current[k] = d;
  }, []);

  const current = points.find((p) => p.id === selected) ?? null;
  const needle = fold(q.trim());
  const visible = points.filter(
    (p) =>
      (!band || p.cefr === band) &&
      (!category || p.category === category) &&
      (!practice || (practice === "none") === !(p.drill_count + p.translate_count)) &&
      (!needle || fold(`${p.title} ${p.category} ${p.id} ${(p.keywords ?? []).join(" ")}`).includes(needle)),
  );
  const grouped = CEFR_BANDS.map((b) => ({ band: b, items: visible.filter((p) => p.cefr === b) })).filter((g) => g.items.length);
  const categories = useMemo(() => [...new Set(points.map((p) => p.category))].sort(), [points]);
  // Prev/next follow the grid's reading order (band by band).
  const ordered = grouped.flatMap((g) => g.items);
  const idx = ordered.findIndex((p) => p.id === selected);

  const setP = (id: string, push: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("p", id);
        else next.delete("p");
        return next;
      },
      { replace: !push },
    );
  const open = (id: string) => {
    dirty.current = {};
    pushed.current = true;
    setP(id, true);
  };
  /** Asks before dropping unsaved edits; resolves true when it is fine to leave. */
  const canLeave = async () => {
    if (!Object.values(dirty.current).some(Boolean)) return true;
    const ok = await confirmAsk({ title: t("teacherGrammar.confirm.discardTitle"), message: t("teacherGrammar.confirm.discardMessage"), confirmText: t("teacherGrammar.confirm.discard"), danger: true });
    if (ok) dirty.current = {};
    return ok;
  };
  const close = async () => {
    if (!(await canLeave())) return;
    qc.invalidateQueries({ queryKey: ["teacher-grammar"] });
    if (pushed.current) navigate(-1);
    else setP("", false);
    pushed.current = false;
  };
  const step = async (d: 1 | -1) => {
    const next = ordered[idx + d];
    if (!next || !(await canLeave())) return;
    setP(next.id, false);
  };
  useEffect(() => {
    if (!selected) pushed.current = false;
  }, [selected]);

  const bandOptions = [
    { value: "", label: t("teacherGrammar.filter.allBands") },
    ...CEFR_BANDS.filter((b) => points.some((p) => p.cefr === b)).map((b) => ({ value: b, label: `${b} · ${points.filter((p) => p.cefr === b).length}` })),
  ];
  const categoryOptions = [{ value: "", label: t("teacherGrammar.filter.allCategories") }, ...categories.map((c) => ({ value: c, label: c }))];
  const practiceOptions = [
    { value: "", label: t("teacherGrammar.filter.allPractice") },
    { value: "ready", label: t("teacherGrammar.filter.hasPractice") },
    { value: "none", label: t("teacherGrammar.filter.noPractice") },
  ];
  const [curEn, curVi] = current ? splitTitle(current.title) : ["", ""];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="teacher-grammar" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
            <BookText className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherGrammar.page.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-bold text-cyan-600 dark:text-cyan-400">{points.length}</span> {t("teacherGrammar.hero.description", { n: points.length })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPrompting(true)}>
              <Wand2 className="size-4" /> {t("teacherGrammar.promptDrawer.open")}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t("teacherGrammar.actions.newPoint")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder={t("teacherGrammar.search.placeholder")} leftIcon={<Search className="size-4" />} />
        </div>
        <Select fullWidth={false} className="min-w-40 flex-1 sm:flex-none" options={bandOptions} value={band} onChange={(v) => setBand(v as Cefr | "")} />
        <Select fullWidth={false} className="min-w-44 flex-1 sm:flex-none" options={categoryOptions} value={category} onChange={setCategory} menuClassName="w-60" menuMaxHeight={420} />
        <Select fullWidth={false} className="min-w-44 flex-1 sm:flex-none" options={practiceOptions} value={practice} onChange={(v) => setPractice(v as Practice)} menuClassName="w-56" />
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">{t("common.loading")}</p>
      ) : !grouped.length ? (
        <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400 dark:border-slate-700">{t("teacherGrammar.empty.noMatchingPoints")}</p>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.band}>
              <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <span className="rounded-md px-1.5 py-0.5 text-xs font-extrabold text-white" style={{ background: BAND_COLOR[g.band] }}>
                  {g.band}
                </span>
                {t("teacherGrammar.overview.pointCount", { n: g.items.length })}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((p) => (
                  <PointCard key={p.id} p={p} active={p.id === selected} onOpen={() => open(p.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={!!current}
        onClose={close}
        history={false}
        widthClassName="max-w-4xl"
        bodyClassName="overflow-y-hidden p-0"
        icon={<BookText className="size-5" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {curEn}
            {current && (
              <span className="rounded-md px-1.5 py-0.5 text-xs font-extrabold text-white" style={{ background: BAND_COLOR[current.cefr] }}>
                {current.cefr}
              </span>
            )}
          </span>
        }
        description={current && [curVi, current.category, current.id].filter(Boolean).join(" · ")}
        actions={
          idx >= 0 && (
            <div className="flex items-center gap-0.5">
              <span className="mr-1 text-xs tabular-nums text-slate-400">
                {idx + 1}/{ordered.length}
              </span>
              <IconBtn label={t("teacherGrammar.drawer.prev")} disabled={idx <= 0} onClick={() => step(-1)}>
                <ChevronLeft className="size-4" />
              </IconBtn>
              <IconBtn label={t("teacherGrammar.drawer.next")} disabled={idx >= ordered.length - 1} onClick={() => step(1)}>
                <ChevronRight className="size-4" />
              </IconBtn>
            </div>
          )
        }
      >
        {current && (
          <PointPanel
            key={current.id}
            point={current}
            isNew={false}
            categories={categories}
            onDirty={onDirty}
            onSaved={() => qc.invalidateQueries({ queryKey: ["teacher-grammar"] })}
            onDeleted={() => {
              dirty.current = {};
              qc.invalidateQueries({ queryKey: ["teacher-grammar"] });
              void close();
            }}
          />
        )}
      </Drawer>

      <Drawer
        open={creating}
        onClose={async () => {
          if (await canLeave()) setCreating(false);
        }}
        history={false}
        widthClassName="max-w-4xl"
        bodyClassName="overflow-y-hidden p-0"
        icon={<Plus className="size-5" />}
        title={t("teacherGrammar.panel.newPoint")}
      >
        {creating && (
          <PointPanel
            key="new"
            point={NEW_POINT}
            isNew
            categories={categories}
            onDirty={onDirty}
            onSaved={(id) => {
              dirty.current = {};
              qc.invalidateQueries({ queryKey: ["teacher-grammar"] });
              setCreating(false);
              open(id);
            }}
            onDeleted={() => setCreating(false)}
            onCancel={async () => {
              if (await canLeave()) setCreating(false);
            }}
          />
        )}
      </Drawer>

      <GrammarPromptDrawer
        open={prompting}
        onClose={() => setPrompting(false)}
        points={points}
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey: ["teacher-grammar"] });
          qc.invalidateQueries({ queryKey: ["grammar"] });
          setP(id, false);
        }}
      />
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {children}
    </button>
  );
}

/** One handbook point in the grid: titles, group and how much practice it has. */
function PointCard({ p, active, onOpen }: { p: Point; active: boolean; onOpen: () => void }) {
  const [en, vi] = splitTitle(p.title);
  const empty = !p.drill_count && !p.translate_count;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-white p-3 pl-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900",
        active ? "border-cyan-400 ring-2 ring-cyan-400/30" : "border-slate-200 hover:border-cyan-300 dark:border-slate-800 dark:hover:border-cyan-500/50",
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: BAND_COLOR[p.cefr] }} />
      <span className="truncate text-sm font-bold text-slate-800 group-hover:text-cyan-700 dark:text-slate-100 dark:group-hover:text-cyan-300">{en}</span>
      <span className="truncate text-xs text-slate-500">{vi || " "}</span>
      <span className="mt-2.5 flex items-center gap-2 text-[11px]">
        <span className="min-w-0 truncate rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{p.category}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 font-semibold">
          {empty ? (
            <span className="text-amber-600 dark:text-amber-400">{t("teacherGrammar.card.noPractice")}</span>
          ) : (
            <>
              <span className={cn("inline-flex items-center gap-0.5", p.drill_count ? "text-slate-600 dark:text-slate-300" : "text-slate-300 dark:text-slate-600")} title={t("teacherGrammar.tabs.drill")}>
                <ListChecks className="size-3.5" /> {p.drill_count}
              </span>
              <span className={cn("inline-flex items-center gap-0.5", p.translate_count ? "text-slate-600 dark:text-slate-300" : "text-slate-300 dark:text-slate-600")} title={t("teacherGrammar.tabs.translate")}>
                <Languages className="size-3.5" /> {p.translate_count}
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function PointPanel({
  point,
  isNew,
  categories,
  onDirty,
  onSaved,
  onDeleted,
  onCancel,
}: {
  point: Grammar | GrammarInput;
  isNew: boolean;
  categories: string[];
  onDirty: (k: string, d: boolean) => void;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onCancel?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(isNew ? "edit" : "preview");
  const practice = useQuery({ queryKey: ["teacher-grammar-practice", point.id], queryFn: () => grammarApi.practice(point.id), enabled: !isNew });
  const tabs: { id: Tab; label: string; icon: typeof BookText; count?: number }[] = [
    ...(isNew ? [] : [{ id: "preview" as const, label: t("teacherGrammar.tabs.preview"), icon: Eye }]),
    { id: "edit", label: isNew ? t("teacherGrammar.tabs.composeNew") : t("common.edit"), icon: Pencil },
    ...(isNew
      ? []
      : [
          { id: "drill" as const, label: t("teacherGrammar.tabs.drill"), icon: ListChecks, count: practice.data?.drill.length },
          { id: "translate" as const, label: t("teacherGrammar.tabs.translate"), icon: Languages, count: practice.data?.translate.length },
        ]),
  ];

  return (
    <div className="flex h-full flex-col">
      {tabs.length > 1 && (
        <div className="flex shrink-0 border-b border-slate-100 px-2 dark:border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-sm font-semibold transition",
                tab === t.id
                  ? "border-cyan-500 text-cyan-700 dark:text-cyan-300"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <t.icon className="size-4 shrink-0" /> <span className="truncate">{t.label}</span>
              {t.count != null && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500 dark:bg-slate-800">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "preview" && (
          <div className="space-y-3">
            <p className="rounded-xl bg-cyan-50/70 px-3 py-2 text-sm text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-100">{point.summary}</p>
            <GrammarDetail g={point as Grammar} />
          </div>
        )}
        {/* Kept mounted while switching tabs so unsaved edits survive a look at another tab. */}
        <div className={tab === "edit" ? undefined : "hidden"}>
          <PointForm
            point={point}
            isNew={isNew}
            categories={categories}
            onDirty={(d) => onDirty("form", d)}
            onSaved={(id) => {
              onSaved(id);
              if (!isNew) setTab("preview");
            }}
            onDeleted={onDeleted}
            onCancel={onCancel}
          />
        </div>
        {tab === "drill" && <DrillTab point={point} />}
        <div className={tab === "translate" ? undefined : "hidden"}>{!isNew && <TranslateTab point={point} onDirty={(d) => onDirty("translate", d)} />}</div>
      </div>
    </div>
  );
}

/** Tab intro: icon thumb, a short two-line description and the tab's actions; "More" unfolds details underneath. */
function TabHead({ icon, title, desc, more, children }: { icon: React.ReactNode; title: string; desc: string; more?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
          <p className="line-clamp-2 text-xs text-slate-500">
            {desc}
            {more && (
              <button type="button" onClick={() => setOpen((v) => !v)} className="ml-1 font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
                {open ? t("teacherGrammar.tabHead.less") : t("teacherGrammar.tabHead.more")}
              </button>
            )}
          </p>
        </div>
        {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      </div>
      {more && open && <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">{more}</div>}
    </div>
  );
}

// ── Edit form ────────────────────────────────────────────────────────────────

/** Strips server-only fields so the object round-trips through the input schema. */
function toInput(p: Grammar | GrammarInput): GrammarInput {
  const { created_at: _c, drill_types: _d, ...rest } = p as Grammar;
  return rest as GrammarInput;
}

function PointForm({
  point,
  isNew,
  categories,
  onSaved,
  onDeleted,
  onCancel,
  onDirty,
}: {
  point: Grammar | GrammarInput;
  isNew: boolean;
  categories: string[];
  onSaved: (id: string) => void;
  onDeleted: () => void;
  onCancel?: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [g, setG] = useState<GrammarInput>(() => toInput(point));
  const [baseline, setBaseline] = useState(() => JSON.stringify(g));
  const dirty = JSON.stringify(g) !== baseline;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const [showJson, setShowJson] = useState(false);
  const [json, setJson] = useState("");
  const set = <K extends keyof GrammarInput>(k: K, v: GrammarInput[K]) => setG((cur) => ({ ...cur, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      // Empty rows are editing leftovers, not content.
      const clean: GrammarInput = {
        ...g,
        forms: g.forms.filter((f) => f.formula.trim()),
        usage: g.usage.filter((u) => u.trim()),
        examples: g.examples.filter((e) => e.en.trim()),
        signals: g.signals?.filter((s) => s.trim()) ?? null,
        tips: g.tips?.filter((s) => s.trim()) ?? null,
        mistakes: g.mistakes?.filter((s) => s.trim()) ?? null,
      };
      const parsed = grammarInputSchema.safeParse(clean);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(`${issue?.path.join(".") || t("teacherGrammar.validation.data")}: ${issue?.message}`);
      }
      return grammarApi.save(parsed.data);
    },
    onSuccess: (r) => {
      toast.success(t("teacherGrammar.toast.pointSaved"));
      setBaseline(JSON.stringify(g));
      onDirty(false);
      onSaved(r.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });
  const remove = useMutation({
    mutationFn: () => grammarApi.remove(point.id),
    onSuccess: () => {
      toast.success(t("teacherGrammar.toast.pointDeleted"));
      onDeleted();
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("teacherGrammar.form.titleLabel")} hint={t("teacherGrammar.form.titleHint")}>
          <Input value={g.title} onChange={(e) => set("title", e.target.value)} placeholder={t("teacherGrammar.form.titlePlaceholder")} />
        </Field>
        <Field label={t("teacherGrammar.form.slugLabel")} hint={isNew ? t("teacherGrammar.form.slugNewHint") : t("teacherGrammar.form.slugLockedHint")}>
          <Input value={g.id} disabled={!isNew} onChange={(e) => set("id", e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} placeholder="present-simple" />
        </Field>
        <Field label={t("teacherGrammar.form.categoryLabel")}>
          <Combobox value={g.category} onChange={(v) => set("category", v)} options={categories} placeholder="Tenses" />
        </Field>
        <Field label={t("teacherGrammar.form.cefrLabel")}>
          <Select value={g.cefr} onChange={(v) => set("cefr", v as Cefr)} options={CEFR_BANDS.map((b) => ({ value: b, label: b }))} />
        </Field>
      </div>
      <Field label={t("teacherGrammar.form.summaryLabel")} hint={t("teacherGrammar.form.summaryHint")}>
        <Textarea rows={2} value={g.summary} onChange={(e) => set("summary", e.target.value)} />
      </Field>

      <ListBlock
        title={t("teacherGrammar.form.formulasTitle")}
        rows={g.forms}
        onChange={(v) => set("forms", v)}
        blank={{ label: "", formula: "" }}
        render={(f, patch) => (
          <div className="grid flex-1 gap-2 sm:grid-cols-[140px_1fr]">
            <Input value={f.label} onChange={(e) => patch({ ...f, label: e.target.value })} placeholder="Affirmative" />
            <Input value={f.formula} onChange={(e) => patch({ ...f, formula: e.target.value })} placeholder="S + V(s/es)" className="font-mono" />
            <div className="sm:col-span-2">
              <Input value={f.example ?? ""} onChange={(e) => patch({ ...f, example: e.target.value || undefined })} placeholder={t("teacherGrammar.form.exampleHint")} />
            </div>
          </div>
        )}
      />
      <StringList title={t("teacherGrammar.form.usageTitle")} rows={g.usage} onChange={(v) => set("usage", v)} placeholder={t("teacherGrammar.form.usagePlaceholder")} />
      <ListBlock
        title={t("teacherGrammar.form.examplesTitle")}
        rows={g.examples}
        onChange={(v) => set("examples", v)}
        blank={{ en: "", vi: "" }}
        render={(ex, patch) => (
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <Input value={ex.en} onChange={(e) => patch({ ...ex, en: e.target.value })} placeholder="She plays tennis." />
            <Input value={ex.vi} onChange={(e) => patch({ ...ex, vi: e.target.value })} placeholder={t("teacherGrammar.form.exampleVietnamesePlaceholder")} />
          </div>
        )}
      />
      <StringList title={t("teacherGrammar.form.signalsTitle")} rows={g.signals ?? []} onChange={(v) => set("signals", v)} placeholder="always, usually…" optional />
      <StringList title={t("teacherGrammar.form.mistakesTitle")} rows={g.mistakes ?? []} onChange={(v) => set("mistakes", v)} placeholder={t("teacherGrammar.form.mistakesPlaceholder")} optional />
      <StringList title={t("teacherGrammar.form.tipsTitle")} rows={g.tips ?? []} onChange={(v) => set("tips", v)} placeholder="…" optional />

      <div className="rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            if (!showJson) setJson(JSON.stringify(g, null, 2));
            setShowJson((v) => !v);
          }}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-slate-600 dark:text-slate-300"
        >
          <Braces className="size-4" /> {t("teacherGrammar.json.advanced")}
          <span className="font-normal text-slate-400">{t("teacherGrammar.json.description")}</span>
          <ChevronDown className={cn("ml-auto size-4 transition", showJson && "rotate-180")} />
        </button>
        {showJson && (
          <div className="border-t border-slate-200 p-3 dark:border-slate-700">
            <JsonEditor value={json} onChange={setJson} ariaLabel="Grammar point JSON" className="h-[420px]" />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  try {
                    setG(JSON.parse(json) as GrammarInput);
                    toast.success(t("teacherGrammar.toast.jsonApplied"));
                  } catch {
                    toast.error(t("common.invalidJson"));
                  }
                }}
              >
                {t("teacherGrammar.actions.applyJson")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        {!isNew && (
          <Button
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            onClick={async () => {
              if (await confirmAsk({ title: t("teacherGrammar.confirm.deleteTitle", { title: point.title }), message: t("teacherGrammar.confirm.deleteMessage"), confirmText: t("common.delete"), danger: true })) remove.mutate();
            }}
          >
            <Trash2 className="size-4" /> {t("teacherGrammar.actions.deletePoint")}
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Save className="size-4" /> {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {label}
        {hint && <span className="font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ListBlock<T>({
  title,
  rows,
  onChange,
  blank,
  render,
  optional,
}: {
  title: string;
  rows: T[];
  onChange: (v: T[]) => void;
  blank: T;
  render: (row: T, patch: (v: T) => void) => React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {title} {optional && <span className="font-normal text-slate-400">({t("common.optional")})</span>}
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            {render(row, (v) => onChange(rows.map((r, j) => (j === i ? v : r))))}
            <button
              type="button"
              aria-label={t("teacherGrammar.actions.deleteRow")}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="mt-2.5 shrink-0 text-slate-300 hover:text-rose-500 dark:text-slate-600"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, blank])}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
      >
        <Plus className="size-3.5" /> {t("common.addRow")}
      </button>
    </div>
  );
}

function StringList({ title, rows, onChange, placeholder, optional }: { title: string; rows: string[]; onChange: (v: string[]) => void; placeholder: string; optional?: boolean }) {
  return (
    <ListBlock
      title={title}
      rows={rows}
      onChange={onChange}
      blank=""
      optional={optional}
      render={(v, patch) => (
        <div className="flex-1">
          <Input value={v} onChange={(e) => patch(e.target.value)} placeholder={placeholder} />
        </div>
      )}
    />
  );
}

// ── Drill & translate ────────────────────────────────────────────────────────

/** The point's own content, so a pasted prompt needs no other context. */
function pointBrief(p: Grammar | GrammarInput): string {
  const lines = [`Grammar point: ${p.title} (CEFR ${p.cefr})`, `Summary: ${p.summary}`];
  const forms = p.forms.filter((f) => f.formula.trim());
  if (forms.length) lines.push("Forms:", ...forms.map((f) => `- ${f.label}: ${f.formula}`));
  const ex = p.examples.filter((e) => e.en.trim()).slice(0, 6);
  if (ex.length) lines.push("Examples:", ...ex.map((e) => `- ${e.en}`));
  return lines.join("\n");
}

const avoidList = (items: string[]) =>
  items.length ? `\nDo NOT repeat or closely paraphrase these existing items:\n${items.slice(0, 60).map((x) => `- ${x}`).join("\n")}\n` : "";

function drillPrompt(p: Grammar | GrammarInput, n: number, existing: string[]): string {
  return `You write grammar drill questions for Vietnamese learners of English.

${pointBrief(p)}

Write ${n} NEW questions that each test THIS point and nothing else, using CEFR ${p.cefr} vocabulary. Mix the three types roughly evenly.
${avoidList(existing)}
Return ONLY a JSON array (no prose, no code fence). Each item has one of these shapes:
{"type":"multiple_choice","question":"She ___ at home yesterday.","options":["was","were","is","be"],"answer":"was","explanation":"<one short sentence in Vietnamese>"}
{"type":"fill_blank","question":"They ___ (be) tired last night.","accept":["were"],"explanation":"..."}
{"type":"ordering","question":"Put the words in order.","tokens":["The film","was","really","good."],"answer":"The film was really good.","explanation":"..."}

Rules:
- multiple_choice: EXACTLY 4 options, exactly one correct; "answer" equals one option character for character. Distractors are the wrong forms learners really pick, each clearly wrong in this sentence.
- fill_blank: EXACTLY ONE "___" — the element being tested. A hint in parentheses right after the blank is the BASE form only, e.g. "(be)"; never list choices. "accept" lists every correct spelling (contraction and full form).
- ordering: "question" is a short instruction only; "tokens" joined with single spaces MUST equal "answer"; do not list the words in "question".
- Natural, idiomatic English; one unambiguous answer per item.`;
}

function translatePrompt(p: Grammar | GrammarInput, n: number, existing: string[]): string {
  // i18n-ignore-start: AI prompt
  return `You write Vietnamese → English translation sentences for Vietnamese learners of English.

${pointBrief(p)}

Write ${n} NEW sentence pairs that each practise THIS point, using CEFR ${p.cefr} vocabulary, from short and simple to slightly longer.
${avoidList(existing)}
Return ONLY a JSON array (no prose, no code fence):
[{"vi":"<Vietnamese sentence the learner translates>","en":"<the canonical English sentence>","accept":["<other equally correct English renderings>"],"noteVi":"<optional short Vietnamese note shown after grading>"}]

Rules:
- Grading is exact string matching, so the Vietnamese must pin ONE English rendering. TENSE MUST BE MARKED in Vietnamese (đã, rồi, sẽ, hôm qua, tuần trước, ngày mai…) whenever the English is past or future.
- "vi" contains no English word from the answer.
- "accept" lists the OTHER equally correct renderings (contraction/full form: didn't / did not, a moved time adverbial, a synonym the Vietnamese does not rule out). Never repeat "en" in "accept". Use [] when there are none.
- SELF-TEST each pair: read the Vietnamese alone and write the English. If a second sentence is just as faithful, tighten the Vietnamese or add it to "accept".`;
  // i18n-ignore-end
}

/** Parses pasted AI output: a bare array or {items: [...]}, tolerating a ```json fence. */
function parseImport(raw: string): unknown[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  if (!text) throw new Error(t("teacherGrammar.import.empty"));
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error(t("common.invalidJson"));
  }
  const arr = Array.isArray(v) ? v : (v as { items?: unknown })?.items;
  if (!Array.isArray(arr)) throw new Error(t("teacherGrammar.import.notArray"));
  return arr;
}

/** Copy-prompt → paste-JSON panel shared by the drill and translate tabs. */
function ImportPanel({
  prompt,
  busy,
  onImport,
  allowReplace,
  placeholder,
}: {
  prompt: (n: number) => string;
  busy?: boolean;
  onImport: (items: unknown[], mode: "append" | "replace") => void | Promise<void>;
  allowReplace?: boolean;
  placeholder: string;
}) {
  const [n, setN] = useState(20);
  const [json, setJson] = useState("");
  const run = async (mode: "append" | "replace") => {
    try {
      await onImport(parseImport(json), mode);
      setJson("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.invalidJson"));
    }
  };
  return (
    <div className="mb-4 space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3 dark:border-cyan-500/30 dark:bg-cyan-500/5">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t("teacherGrammar.import.step1")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">{t("teacherGrammar.import.count")}</span>
          <NumberInput size="sm" className="w-32" value={String(n)} onChange={(v) => setN(Math.max(1, Math.min(100, Number(v) || 1)))} min={1} max={100} step={5} />
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(prompt(n));
                toast.success(t("teacherGrammar.toast.promptCopied"));
              } catch {
                toast.error(t("teacherGrammar.toast.copyFailed"));
              }
            }}
          >
            <ClipboardCopy className="size-4" /> {t("teacherGrammar.import.copyPrompt")}
          </Button>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t("teacherGrammar.import.step2")}</p>
      <JsonEditor value={json} onChange={setJson} placeholder={placeholder} ariaLabel="JSON" className="h-[260px]" />
      <div className="flex flex-wrap justify-end gap-2">
        {allowReplace && (
          <Button size="sm" variant="ghost" disabled={busy || !json.trim()} onClick={() => run("replace")}>
            {t("teacherGrammar.import.replace")}
          </Button>
        )}
        <Button size="sm" disabled={busy || !json.trim()} onClick={() => run("append")}>
          <Plus className="size-4" /> {allowReplace ? t("teacherGrammar.import.append") : t("teacherGrammar.import.add")}
        </Button>
      </div>
    </div>
  );
}

type DrillRow = Awaited<ReturnType<typeof grammarApi.practice>>["drill"][number];

const joinBar = (xs: string[] | null | undefined) => (xs ?? []).join(" | ");
const splitBar = (s: string) => s.split("|").map((x) => x.trim()).filter(Boolean);

/** Created-at stamp shown on each bank row; the full timestamp sits in the tooltip. */
function AddedAt({ iso }: { iso?: string | null }) {
  if (!iso) return <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{t("teacherGrammar.translate.unsaved")}</span>;
  return (
    <time dateTime={iso} title={fmtDate(iso)} className="whitespace-nowrap text-[11px] tabular-nums text-slate-400">
      {fmtAgo(iso)}
    </time>
  );
}

/** Inline form for one manually added drill item. */
function DrillEditor({ point, item, onDone }: { point: Grammar | GrammarInput; item: DrillRow; onDone: () => void }) {
  const qc = useQueryClient();
  const type = item.type as GrammarDrillItemInput["type"];
  const [question, setQuestion] = useState(item.question);
  const [options, setOptions] = useState(joinBar(item.options));
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [accept, setAccept] = useState(joinBar(item.accept));
  const [tokens, setTokens] = useState(joinBar(item.tokens));
  const [explanation, setExplanation] = useState(item.explanation ?? "");
  const save = useMutation({
    mutationFn: () =>
      grammarApi.updateDrill(point.id, item.id, {
        type,
        question,
        options: type === "multiple_choice" ? splitBar(options) : null,
        answer: type === "fill_blank" ? null : answer.trim(),
        accept: type === "fill_blank" ? splitBar(accept) : null,
        tokens: type === "ordering" ? splitBar(tokens) : null,
        explanation: explanation.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      qc.invalidateQueries({ queryKey: ["teacher-grammar-practice", point.id] });
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });
  return (
    <div className="space-y-2 bg-cyan-50/40 px-3 py-2.5 dark:bg-cyan-500/5">
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("teacherGrammar.drill.questionPlaceholder")} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {type === "multiple_choice" && <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t("teacherGrammar.drill.optionsPlaceholder")} />}
        {type === "ordering" && <Input value={tokens} onChange={(e) => setTokens(e.target.value)} placeholder={t("teacherGrammar.drill.tokensPlaceholder")} />}
        {type === "fill_blank" ? (
          <Input value={accept} onChange={(e) => setAccept(e.target.value)} placeholder={t("teacherGrammar.drill.acceptPlaceholder")} />
        ) : (
          <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("teacherGrammar.drill.answerPlaceholder")} />
        )}
        <Input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder={t("teacherGrammar.drill.explanationPlaceholder")} className="sm:col-span-2" />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={save.isPending || !question.trim()} onClick={() => save.mutate()}>
          <Save className="size-4" /> {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function DrillTab({ point }: { point: Grammar | GrammarInput }) {
  const qc = useQueryClient();
  const key = ["teacher-grammar-practice", point.id];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => grammarApi.practice(point.id) });
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (itemId: string) => grammarApi.removeDrill(point.id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const add = useMutation({
    mutationFn: (items: unknown[]) => grammarApi.addDrill(point.id, items),
    onSuccess: (r) => {
      toast.success(t("teacherGrammar.toast.drillAdded", { n: r.count }));
      qc.invalidateQueries({ queryKey: key });
      setImporting(false);
    },
  });
  const drill = data?.drill ?? [];
  return (
    <div>
      <TabHead
        icon={<ListChecks className="size-5" />}
        title={t("teacherGrammar.drill.whatTitle")}
        desc={t("teacherGrammar.drill.short")}
        more={
          <>
            <p>{t("teacherGrammar.drill.what")}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>{t("teacherGrammar.drill.fromExercise")}</li>
              <li>{t("teacherGrammar.drill.manual")}</li>
            </ul>
          </>
        }
      >
        <Button size="sm" variant={importing ? "ghost" : "secondary"} onClick={() => setImporting((v) => !v)}>
          {importing ? <X className="size-4" /> : <Braces className="size-4" />} {importing ? t("common.close") : t("teacherGrammar.actions.addDrillJson")}
        </Button>
      </TabHead>
      {importing && (
        <ImportPanel
          prompt={(n) => drillPrompt(point, n, drill.map((d) => d.question))}
          busy={add.isPending}
          onImport={(items) => add.mutateAsync(items).then(() => undefined)}
          placeholder='[{ "type": "multiple_choice", "question": "…", "options": […], "answer": "…" }]'
        />
      )}
      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("common.loading")}</p>
      ) : !drill.length ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("teacherGrammar.empty.noDrill")}</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {drill.map((d) =>
            editing === d.id ? (
              <DrillEditor key={d.id} point={point} item={d} onDone={() => setEditing(null)} />
            ) : (
              <div key={d.id} className="group flex items-start gap-2 px-3 py-1.5 text-sm">
                <span className={cn("mt-0.5 w-20 shrink-0 truncate rounded px-1.5 py-0.5 text-center text-[10px] font-bold uppercase", QTYPE_THUMB[d.type as QuestionType])}>
                  {(getLang() === "vi" ? QTYPE_LABEL : QTYPE_LABEL_EN)[d.type as QuestionType] ?? d.type}
                </span>
                <p className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">
                  {d.question}
                  {d.answer && <span className="ml-1.5 font-medium text-emerald-600 dark:text-emerald-400">→ {d.answer}</span>}
                  {d.options && <span className="ml-2 text-xs text-slate-400">({d.options.join(" · ")})</span>}
                </p>
                <div className="mt-0.5 flex shrink-0 items-center gap-2">
                  {d.exercise ? (
                    <Link
                      to={`/teacher/exercises/${d.exercise.slug}/edit`}
                      title={`${t("teacherGrammar.drill.sourceExercise")}: ${d.exercise.title}`}
                      className="inline-flex max-w-[10rem] items-center gap-1 text-[11px] font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                    >
                      <span className="truncate">{d.exercise.title}</span> <ExternalLink className="size-3 shrink-0" />
                    </Link>
                  ) : (
                    <span className="text-[11px] text-slate-400">{t("teacherGrammar.drill.sourceManual")}</span>
                  )}
                  <AddedAt iso={d.createdAt} />
                  {!d.exercise && (
                    <button type="button" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => setEditing(d.id)} className="text-slate-400 hover:text-cyan-600">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  <button type="button" aria-label={t("common.delete")} title={t("teacherGrammar.drill.remove")} onClick={() => remove.mutate(d.id)} className="text-slate-400 hover:text-rose-500">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

type TRow = { key: string; id?: string; vi: string; en: string; accept: string; noteVi: string; createdAt?: string };
let trSeq = 0;

/** Reads one pasted translation row; `accept` may be an array or a "|"-separated string. */
function toRow(v: unknown): TRow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const vi = str(o.vi);
  const en = str(o.en);
  if (!vi || !en) return null;
  const accept = Array.isArray(o.accept) ? o.accept.map(str).filter(Boolean).join(" | ") : str(o.accept);
  return { key: `t${++trSeq}`, vi, en, accept, noteVi: str(o.noteVi ?? o.note) };
}

function TranslateTab({ point, onDirty }: { point: Grammar | GrammarInput; onDirty: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const key = ["teacher-grammar-practice", point.id];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => grammarApi.practice(point.id) });
  const [rows, setRows] = useState<TRow[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const toggleEdit = (k: string) =>
    setEditing((cur) => {
      const next = new Set(cur);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  useEffect(() => {
    if (data) {
      setRows(data.translate.map((t) => ({ key: `t${++trSeq}`, id: t.id, vi: t.vi, en: t.en, accept: t.accept.join(" | "), noteVi: t.noteVi ?? "", createdAt: t.createdAt })));
      setEditing(new Set());
      setDirty(false);
    }
  }, [data]);
  const save = useMutation({
    mutationFn: () =>
      grammarApi.saveTranslate(
        point.id,
        rows
          .filter((r) => r.vi.trim() && r.en.trim())
          .map((r) => ({ id: r.id, vi: r.vi, en: r.en, accept: r.accept.split("|").map((a) => a.trim()).filter(Boolean), noteVi: r.noteVi || null })),
      ),
    onSuccess: (r) => {
      toast.success(t("teacherGrammar.toast.translationsSaved", { n: r.count }));
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });
  const patchRow = (k: string, field: keyof TRow, v: string) => {
    setRows((cur) => cur.map((r) => (r.key === k ? { ...r, [field]: v } : r)));
    setDirty(true);
  };
  const importRows = (items: unknown[], mode: "append" | "replace") => {
    const parsed = items.map(toRow);
    const good = parsed.filter((r): r is TRow => !!r);
    if (!good.length) throw new Error(t("teacherGrammar.toast.translationsSkipped", { n: parsed.length }));
    setRows((cur) => (mode === "replace" ? good : [...good, ...cur]));
    setDirty(true);
    setImporting(false);
    toast.success(t("teacherGrammar.toast.translationsImported", { n: good.length }));
    if (good.length < parsed.length) toast.warning(t("teacherGrammar.toast.translationsSkipped", { n: parsed.length - good.length }));
  };
  const addRow = () => {
    const key = `t${++trSeq}`;
    setRows((cur) => [{ key, vi: "", en: "", accept: "", noteVi: "" }, ...cur]);
    setEditing((cur) => new Set(cur).add(key));
    setDirty(true);
  };

  return (
    <div>
      <TabHead icon={<Languages className="size-5" />} title={t("teacherGrammar.translate.title")} desc={t("teacherGrammar.translate.info")}>
        <Button size="sm" variant={importing ? "ghost" : "secondary"} onClick={() => setImporting((v) => !v)}>
          {importing ? <X className="size-4" /> : <Braces className="size-4" />} {importing ? t("common.close") : t("teacherGrammar.actions.importJson")}
        </Button>
        <Button size="sm" onClick={addRow}>
          <Plus className="size-4" /> {t("teacherGrammar.actions.addTranslation")}
        </Button>
      </TabHead>
      {importing && (
        <ImportPanel
          prompt={(n) => translatePrompt(point, n, rows.map((r) => r.en).filter(Boolean))}
          onImport={importRows}
          allowReplace={rows.length > 0}
          // i18n-ignore: sample JSON with Vietnamese content
          placeholder='[{ "vi": "Hôm qua tôi đã ở nhà.", "en": "I was at home yesterday.", "accept": ["Yesterday I was at home."] }]'
        />
      )}
      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("common.loading")}</p>
      ) : !rows.length ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
          <Languages className="size-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t("teacherGrammar.translate.emptyTitle")}</p>
          <p className="mt-0.5 max-w-sm text-xs text-slate-500">{t("teacherGrammar.translate.emptyHint")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid dark:border-slate-700 dark:bg-slate-800/40">
            <span>{t("teacherGrammar.translate.colVi")}</span>
            <span>{t("teacherGrammar.translate.colEn")}</span>
            <span />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const open = editing.has(r.key) || !r.vi.trim() || !r.en.trim();
              const accept = r.accept.split("|").map((a) => a.trim()).filter(Boolean);
              const drop = () => {
                setRows((cur) => cur.filter((x) => x.key !== r.key));
                setDirty(true);
              };
              const actions = (
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={open ? t("teacherGrammar.translate.collapse") : t("common.edit")}
                    title={open ? t("teacherGrammar.translate.collapse") : t("common.edit")}
                    onClick={() => toggleEdit(r.key)}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-cyan-600 dark:hover:bg-slate-800"
                  >
                    {open ? <Check className="size-4" /> : <Pencil className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label={t("common.delete")}
                    title={t("common.delete")}
                    onClick={drop}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
              return open ? (
                <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-3 bg-cyan-50/40 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] dark:bg-cyan-500/5">
                  <div className="space-y-2">
                    <Input value={r.vi} onChange={(e) => patchRow(r.key, "vi", e.target.value)} placeholder={t("teacherGrammar.translate.vietnamesePlaceholder")} />
                    <Input value={r.noteVi} onChange={(e) => patchRow(r.key, "noteVi", e.target.value)} placeholder={t("teacherGrammar.translate.notePlaceholder")} />
                  </div>
                  <div className="col-start-1 row-start-2 space-y-2 sm:col-start-2 sm:row-start-1">
                    <Input value={r.en} onChange={(e) => patchRow(r.key, "en", e.target.value)} placeholder={t("teacherGrammar.translate.englishPlaceholder")} />
                    <Input value={r.accept} onChange={(e) => patchRow(r.key, "accept", e.target.value)} placeholder={t("teacherGrammar.translate.alternativesPlaceholder")} />
                  </div>
                  <div className="col-start-2 row-span-2 row-start-1 pt-1.5 sm:col-start-3 sm:row-span-1">{actions}</div>
                </div>
              ) : (
                <div key={r.key} className="group grid grid-cols-[minmax(0,1fr)_4.5rem] items-start gap-x-3 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem]">
                  <button type="button" onClick={() => toggleEdit(r.key)} className="min-w-0 text-left">
                    <span className="text-slate-700 dark:text-slate-200">{r.vi}</span>
                    {r.noteVi.trim() && <span className="mt-0.5 block text-xs italic text-slate-400">{r.noteVi}</span>}
                  </button>
                  <button type="button" onClick={() => toggleEdit(r.key)} className="col-start-1 row-start-2 min-w-0 text-left sm:col-start-2 sm:row-start-1">
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">{r.en}</span>
                    {accept.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {accept.map((a) => (
                          <span key={a} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {a}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                  <div className="col-start-2 row-span-2 row-start-1 flex flex-col items-end sm:col-start-3 sm:row-span-1">
                    {actions}
                    <AddedAt iso={r.createdAt} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {dirty && (
        <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <span className="size-2 shrink-0 rounded-full bg-amber-500" /> {t("teacherGrammar.translate.dirty")}
          </span>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            <Save className="size-4" /> {save.isPending ? t("common.saving") : t("teacherGrammar.actions.saveTranslations")}
          </Button>
        </div>
      )}
    </div>
  );
}
