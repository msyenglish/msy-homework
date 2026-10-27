// Teacher VOCABULARY page: every word of every set in one list, with search and filters (the set is
// one of the filters). Sets are managed in a drawer; words come in four ways from the Add drawer
// (paste words, ask the AI for a topic, import JSON, type one by hand) and are edited in their own
// drawer. The AI completes every field; edits stay local until "Save list" writes every touched set.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Layers,
  ListPlus,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import type { VocabItemInput } from "@msyen/shared";
import { levelsApi, vocabApi, type TeacherVocabSet } from "../../lib/api";
import { levelSelectOptions } from "../../lib/levels";
import { HeroDecor } from "../../components/HeroDecor";
import { FilterPopover, type FilterGroup } from "../../components/FilterPopover";
import { Button, Drawer, Input, Pagination, Select, Textarea, ToggleRow } from "../../components/ui";
import { confirmAsk } from "../../components/confirm";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useUrlState } from "../../lib/navState";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";
import { entryQuality, exportItems } from "../../components/vocab/vocabEntry";
import { CEFR_LEVELS, EntryFields } from "../../components/vocab/EntryFields";
import { AddWordsDrawer } from "../../components/vocab/AddWordsDrawer";
import { AiCompleteDrawer, type CompleteCandidate } from "../../components/vocab/AiCompleteDrawer";
import { JobBar, type AiJob, type JobItemStatus } from "../../components/vocab/aiJob";
import { toolBtn } from "../../components/vocab/parts";

type Row = VocabItemInput & { key: string; setId: string };
type Quality = { missing: string[]; warnings: string[] };
type Status = "complete" | "missing" | "review";
type SortMode = "order" | "az" | "issues";

let rowSeq = 0;
const toRow = (it: VocabItemInput, setId: string): Row => ({ ...it, setId, key: `r${++rowSeq}` });
const strip = ({ key: _key, setId: _setId, ...it }: Row): VocabItemInput => it;
const wordKey = (w: string) => w.trim().toLowerCase().replace(/\s+/g, " ");
const statusOf = (q: Quality): Status => (q.warnings.length ? "review" : q.missing.length ? "missing" : "complete");
// i18n-ignore: AI context
const aiContext = (levelName?: string | null) => (levelName ? `trình độ ${levelName}` : null);

const STATUS_LABELS: Record<Status, TKey> = {
  complete: "teacherVocab.filter.complete",
  missing: "teacherVocab.filter.missing",
  review: "teacherVocab.filter.review",
};

export default function TeacherVocabPage() {
  useDocumentTitle(t("teacherVocab.page.title"));
  const qc = useQueryClient();
  const { data: setsData } = useQuery({ queryKey: ["teacher-vocab-sets"], queryFn: vocabApi.sets });
  const sets = useMemo(() => setsData?.items ?? [], [setsData]);
  const setById = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);
  const { data: itemsData, isLoading } = useQuery({ queryKey: ["teacher-vocab-all-items"], queryFn: vocabApi.allItems });

  // ── Local working copy of every word ──
  const [rows, setRowsState] = useState<Row[]>([]);
  // Mirror of `rows` read synchronously by merge/AI steps that run across awaits.
  const rowsRef = useRef<Row[]>([]);
  const setRows = (next: Row[]) => {
    rowsRef.current = next;
    setRowsState(next);
  };
  /** Sets whose word list differs from the server. */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const dirty = touched.size > 0;
  const loadRows = () => {
    if (itemsData) setRows(itemsData.items.map(({ setId, ...it }) => toRow({ ...it, cefr: (it.cefr as VocabItemInput["cefr"]) ?? null }, setId)));
    setTouched(new Set());
  };
  useEffect(() => {
    if (itemsData && !dirty) loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsData]);

  const update = (fn: (cur: Row[]) => Row[], setIds: string[]) => {
    setRows(fn(rowsRef.current));
    setTouched((prev) => new Set([...prev, ...setIds]));
  };

  /** Adds entries to a set; a word already in that set is merged (empty fields filled, or replaced when `overwrite`). */
  const merge = (incoming: VocabItemInput[], setId: string, overwrite = false) => {
    const addedRows: Row[] = [];
    let merged = 0;
    update((cur) => {
      const next = [...cur];
      const at = new Map<string, number>();
      next.forEach((r, i) => r.setId === setId && at.set(wordKey(r.word), i));
      for (const it of incoming) {
        const i = at.get(wordKey(it.word));
        if (i == null) {
          const row = toRow(it, setId);
          next.push(row);
          addedRows.push(row);
          at.set(wordKey(it.word), next.length - 1);
        } else {
          const old = next[i];
          const patch: Partial<VocabItemInput> = {};
          for (const [k, v] of Object.entries(it) as [keyof VocabItemInput, unknown][]) {
            if (k === "word" || k === "id" || v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
            const mine = old[k];
            const empty = mine == null || mine === "" || (Array.isArray(mine) && !mine.length);
            if (overwrite || empty) (patch as Record<string, unknown>)[k] = v;
          }
          next[i] = { ...old, ...patch };
          merged++;
        }
      }
      return next;
    }, [setId]);
    return { added: addedRows.length, merged, addedRows };
  };

  // ── AI jobs: one at a time, word-by-word progress, stoppable ──
  const [job, setJob] = useState<AiJob | null>(null);
  const cancelRef = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);
  const patchJob = (fn: (j: AiJob) => AiJob) => setJob((j) => (j ? fn(j) : j));
  const markItems = (keys: string[], status: JobItemStatus) => {
    const set = new Set(keys);
    patchJob((j) => ({ ...j, items: j.items.map((it) => (set.has(it.key) ? { ...it, status } : it)) }));
  };
  const errMsg = (e: unknown, fallback: TKey) => (e instanceof Error ? e.message : t(fallback));
  const busy = !!job?.running;

  /** AI completes rows, per set (for the set's level) in batches of 10, merging answers back by word. */
  const runFill = async (targets: Row[], opts: { overwrite: boolean; instruction?: string; title: string }) => {
    if (!targets.length || busy) return;
    cancelRef.current = false;
    setJob({ kind: "fill", title: opts.title, items: targets.map((r) => ({ key: r.key, word: r.word, status: "pending" })), target: targets.length, running: true, cancelled: false, errors: [] });
    const bySet = new Map<string, string[]>();
    for (const r of targets) bySet.set(r.setId, [...(bySet.get(r.setId) ?? []), r.key]);
    const failed: string[] = [];
    for (const [setId, keys] of bySet) {
      for (let i = 0; i < keys.length && !cancelRef.current; i += 10) {
        const batchKeys = keys.slice(i, i + 10);
        // Read the rows now: the teacher may have edited or removed them since the job started.
        const batch = batchKeys.map((k) => rowsRef.current.find((r) => r.key === k)).filter((r): r is Row => !!r && !!r.word.trim());
        markItems(batchKeys, "running");
        try {
          if (batch.length) {
            const r = await vocabApi.aiFill({ items: batch.map(strip), context: aiContext(setById.get(setId)?.levelName), overwrite: opts.overwrite, instruction: opts.instruction || null });
            merge(r.items, setId, true);
          }
          markItems(batchKeys, "done");
        } catch (e) {
          failed.push(...batchKeys);
          markItems(batchKeys, "error");
          patchJob((j) => ({ ...j, errors: [...j.errors, errMsg(e, "teacherVocab.error.aiFill")] }));
        }
      }
    }
    patchJob((j) => ({ ...j, running: false, cancelled: cancelRef.current }));
    retryRef.current = failed.length ? () => runFill(rowsRef.current.filter((r) => failed.includes(r.key)), opts) : null;
    const ok = targets.length - failed.length;
    if (cancelRef.current) toast.info(t("teacherVocab.job.cancelledToast"));
    else if (failed.length) toast.error(t("teacherVocab.job.finishedWithErrors", { done: ok, failed: failed.length }));
    else toast.success(t("teacherVocab.toast.aiFilled", { n: ok }));
  };

  /** AI picks new words for a description, 20 per round, until `count` are added or it runs dry. */
  const runSuggest = async (body: { prompt: string; count: number; form: "word" | "phrase" | "both" }, setId: string) => {
    if (busy) return;
    cancelRef.current = false;
    retryRef.current = null;
    setJob({ kind: "suggest", title: t("teacherVocab.job.suggestTitle", { n: body.count }), items: [], target: body.count, running: true, cancelled: false, errors: [] });
    let added = 0;
    let note: string | undefined;
    while (added < body.count && !cancelRef.current) {
      const exclude = rowsRef.current.filter((x) => x.setId === setId).map((x) => x.word);
      try {
        const r = await vocabApi.aiSuggest({ ...body, count: Math.min(20, body.count - added), exclude, context: aiContext(setById.get(setId)?.levelName) });
        const { addedRows } = merge(r.items, setId);
        if (!addedRows.length) {
          note = t("teacherVocab.job.suggestDry", { n: added });
          break;
        }
        added += addedRows.length;
        patchJob((j) => ({ ...j, items: [...j.items, ...addedRows.map((x) => ({ key: x.key, word: x.word, status: "done" as const }))] }));
      } catch (e) {
        patchJob((j) => ({ ...j, errors: [...j.errors, errMsg(e, "teacherVocab.error.aiCreate")] }));
        break;
      }
    }
    patchJob((j) => ({ ...j, running: false, cancelled: cancelRef.current, note }));
    if (added) toast.success(t("teacherVocab.toast.wordsAdded", { n: added }));
    else if (!cancelRef.current) toast.error(t("teacherVocab.toast.noNewWords"));
  };

  // ── Saving ──
  const saveWords = useMutation({
    mutationFn: async () => {
      let total = 0;
      for (const id of touched) {
        if (!setById.has(id)) continue;
        const r = await vocabApi.saveItems(id, rowsRef.current.filter((x) => x.setId === id && x.word.trim()).map(strip));
        total += r.wordCount;
      }
      return total;
    },
    onSuccess: (n) => {
      toast.success(t("teacherVocab.toast.wordsSaved", { n }));
      setTouched(new Set());
      qc.invalidateQueries({ queryKey: ["teacher-vocab-sets"] });
      qc.invalidateQueries({ queryKey: ["teacher-vocab-all-items"] });
      qc.invalidateQueries({ queryKey: ["teacher-vocab-items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });

  // ── Filters ──
  const [setFilter, setSetFilter] = useUrlState("set", "all");
  const filteredSet = setById.get(setFilter) ?? null;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [cefr, setCefr] = useState("all");
  const [pos, setPos] = useState("all");
  const [sort, setSort] = useState<SortMode>("order");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(40);
  useEffect(() => setPage(1), [q, setFilter, status, cefr, pos, sort]);

  const quality = useMemo(() => new Map(rows.map((r) => [r.key, entryQuality(r)])), [rows]);
  const inSet = useMemo(() => (filteredSet ? rows.filter((r) => r.setId === filteredSet.id) : rows), [rows, filteredSet]);
  const counts = useMemo(() => {
    const c = { complete: 0, missing: 0, review: 0 };
    for (const r of inSet) c[statusOf(quality.get(r.key)!)]++;
    return c;
  }, [inSet, quality]);
  const posOptions = useMemo(() => [...new Set(inSet.map((r) => r.pos?.trim()).filter((p): p is string => !!p))].sort(), [inSet]);

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    const out = inSet.filter((r) => {
      if (needle && !`${r.word} ${r.meaning ?? ""} ${r.definition ?? ""} ${r.example ?? ""}`.toLowerCase().includes(needle)) return false;
      if (status !== "all" && statusOf(quality.get(r.key)!) !== status) return false;
      if (cefr !== "all" && (cefr === "none" ? !!r.cefr : r.cefr !== cefr)) return false;
      if (pos !== "all" && r.pos?.trim() !== pos) return false;
      return true;
    });
    if (sort === "az") out.sort((a, b) => a.word.localeCompare(b.word));
    if (sort === "issues") {
      const rank: Record<Status, number> = { review: 0, missing: 1, complete: 2 };
      out.sort((a, b) => rank[statusOf(quality.get(a.key)!)] - rank[statusOf(quality.get(b.key)!)]);
    }
    return out;
  }, [inSet, quality, needle, status, cefr, pos, sort]);
  const lastPage = Math.max(1, Math.ceil(visible.length / perPage));
  const curPage = Math.min(page, lastPage);
  const pageRows = visible.slice((curPage - 1) * perPage, curPage * perPage);
  const candidates: CompleteCandidate[] = visible
    .filter((r) => r.word.trim() && statusOf(quality.get(r.key)!) !== "complete")
    .map((r) => ({ key: r.key, word: r.word, setName: filteredSet ? null : (setById.get(r.setId)?.name ?? null), ...quality.get(r.key)! }));

  const setOptions = [
    { value: "all", label: t("teacherVocab.filter.allSets"), icon: <Layers className="size-4" /> },
    ...sets.map((s) => ({ value: s.id, label: `${s.name} (${s.wordCount})` })),
  ];
  const statusOptions = [
    { value: "all", label: t("teacherVocab.filter.anyStatus") },
    ...(Object.keys(STATUS_LABELS) as Status[]).map((s) => ({ value: s, label: `${t(STATUS_LABELS[s])} (${counts[s]})` })),
  ];
  const filterGroups: FilterGroup[] = [
    {
      label: t("teacherVocab.field.cefr"),
      value: cefr,
      defaultValue: "all",
      onChange: setCefr,
      options: [{ value: "all", label: t("common.all") }, ...CEFR_LEVELS.map((c) => ({ value: c, label: c })), { value: "none", label: t("teacherVocab.filter.noCefr") }],
    },
    ...(posOptions.length
      ? [
          {
            label: t("teacherVocab.field.partOfSpeech"),
            value: pos,
            defaultValue: "all",
            onChange: setPos,
            options: [{ value: "all", label: t("common.all") }, ...posOptions.map((p) => ({ value: p, label: p }))],
          },
        ]
      : []),
    {
      label: t("teacherVocab.filter.sort"),
      value: sort,
      defaultValue: "order",
      onChange: (v) => setSort(v as SortMode),
      options: [
        { value: "order", label: t("teacherVocab.sort.order") },
        { value: "az", label: t("teacherVocab.sort.az") },
        { value: "issues", label: t("teacherVocab.sort.issues") },
      ],
    },
  ];

  // ── Row actions ──
  /** Swaps a word with the nearest word of the same set. */
  const move = (key: string, d: -1 | 1) => {
    const cur = rowsRef.current;
    const i = cur.findIndex((r) => r.key === key);
    if (i < 0) return;
    let j = i + d;
    while (j >= 0 && j < cur.length && cur[j].setId !== cur[i].setId) j += d;
    if (j < 0 || j >= cur.length) return;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    update(() => next, [cur[i].setId]);
  };
  const removeRow = (r: Row) => update((cur) => cur.filter((x) => x.key !== r.key), [r.setId]);
  const patchRow = (r: Row, patch: Partial<Row>) =>
    update((cur) => cur.map((x) => (x.key === r.key ? { ...x, ...patch } : x)), [r.setId, ...(patch.setId ? [patch.setId] : [])]);

  // ── Drawers ──
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState(false);
  const cancelJob = () => {
    cancelRef.current = true;
  };
  const existingWords = useCallback((setId: string) => rowsRef.current.filter((r) => r.setId === setId).map((r) => r.word), []);
  /** After adding to another set than the one filtered, switch the filter so the new words are visible. */
  const showSet = (setId: string) => {
    if (filteredSet && filteredSet.id !== setId) setSetFilter(setId);
  };
  const [manage, setManage] = useState<{ view: SetsView } | null>(null);
  const editingRow = rows.find((r) => r.key === editing) ?? null;
  const editIndex = editingRow ? visible.findIndex((r) => r.key === editingRow.key) : -1;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ items: exportItems(visible.map(strip)) }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filteredSet?.slug || "tu-vung"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const gridCols = filteredSet
    ? "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_6.5rem_5rem]"
    : "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_6.5rem_5rem]";

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-28">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="teacher-vocab" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
            <Type className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherVocab.page.title")}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t("teacherVocab.hero.summary", { words: rows.length, sets: sets.length })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={() => setManage({ view: "list" })}>
              <Settings2 className="size-4" /> {t("teacherVocab.header.manageSets")}
            </Button>
            <Button size="lg" onClick={() => (sets.length ? setAdding(true) : setManage({ view: "new" }))}>
              <ListPlus className="size-4" /> {t("teacherVocab.action.addWords")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-[2_1_16rem]">
          <Input className="h-11 py-0" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder={t("teacherVocab.search.words")} leftIcon={<Search className="size-4" />} />
        </div>
        <div className="min-w-48 flex-[1_1_12rem]">
          <Select
            options={setOptions}
            value={filteredSet ? filteredSet.id : "all"}
            onChange={setSetFilter}
            menuMaxHeight={420}
            menuFooter={(close) => (
              <button
                type="button"
                onClick={() => {
                  close();
                  setManage({ view: "list" });
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
              >
                <Settings2 className="size-4" /> {t("teacherVocab.header.manageSets")}
              </button>
            )}
          />
        </div>
        <div className="min-w-44 flex-[1_1_10rem]">
          <Select options={statusOptions} value={status} onChange={(v) => setStatus(v as typeof status)} />
        </div>
        <FilterPopover panelClassName="w-72" groups={filterGroups} />
        <button type="button" className={toolBtn} onClick={() => setCompleting(true)} title={t("teacherVocab.complete.title")}>
          {busy ? <Loader2 className="size-4 animate-spin text-cyan-500" /> : <Sparkles className="size-4 text-cyan-500" />}
          <span className="hidden lg:inline">{t("teacherVocab.complete.title")}</span>
          {candidates.length > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{candidates.length}</span>}
        </button>
        <button type="button" className={toolBtn} disabled={!visible.length} onClick={exportJson} title={t("teacherVocab.action.exportJson")} aria-label={t("teacherVocab.action.exportJson")}>
          <Download className="size-4" />
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          {filteredSet ? (
            <>
              <Layers className="size-4 text-cyan-500" />
              <h2 className="font-bold text-slate-800 dark:text-slate-100">{filteredSet.name}</h2>
              <Badge tone={filteredSet.active ? "emerald" : "slate"}>{filteredSet.active ? t("teacherVocab.set.open") : t("teacherVocab.set.draftBadge")}</Badge>
              {filteredSet.levelName && <Badge tone="slate">{filteredSet.levelName}</Badge>}
              <button type="button" onClick={() => setManage({ view: filteredSet })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
                <PenLine className="size-3.5" /> {t("teacherVocab.action.editSet")}
              </button>
            </>
          ) : (
            <h2 className="font-bold text-slate-800 dark:text-slate-100">{t("teacherVocab.list.allTitle")}</h2>
          )}
          <span className="ml-auto text-sm text-slate-500">{t("teacherVocab.list.showing", { shown: visible.length, total: inSet.length })}</span>
        </div>
        {job?.running && !adding && !completing && (
          <div className="flex items-center gap-3 border-b border-slate-100 bg-cyan-50/50 px-4 py-2.5 dark:border-slate-800 dark:bg-cyan-500/5">
            <JobBar job={job} className="min-w-0 flex-1" />
            <button type="button" onClick={() => setCompleting(true)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
              {t("teacherVocab.job.details")}
            </button>
            <button type="button" onClick={cancelJob} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
              {t("teacherVocab.job.stop")}
            </button>
          </div>
        )}
        {visible.length > 0 && (
          <div className={cn("hidden items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid dark:border-slate-800 dark:bg-slate-800/40", gridCols)}>
            <span>{t("teacherVocab.form.word")}</span>
            <span>{t("teacherVocab.field.meaning")}</span>
            <span>{t("teacherVocab.field.example")}</span>
            {!filteredSet && <span>{t("teacherVocab.col.set")}</span>}
            <span>{t("teacherVocab.col.status")}</span>
            <span />
          </div>
        )}

        {isLoading ? (
          <p className="py-10 text-center text-sm text-slate-400">{t("common.loading")}</p>
        ) : !inSet.length ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">{sets.length ? t("teacherVocab.empty.noWords") : t("teacherVocab.empty.noSets")}</p>
            <Button className="mt-4" onClick={() => (sets.length ? setAdding(true) : setManage({ view: "new" }))}>
              {sets.length ? <ListPlus className="size-4" /> : <Plus className="size-4" />} {sets.length ? t("teacherVocab.action.addWords") : t("teacherVocab.action.newSet")}
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pageRows.map((r) => (
              <WordRow
                key={r.key}
                row={r}
                setName={filteredSet ? null : (setById.get(r.setId)?.name ?? "")}
                gridCols={gridCols}
                quality={quality.get(r.key)!}
                busy={busy}
                onEdit={() => setEditing(r.key)}
                onRegenerate={() => runFill([r], { overwrite: true, title: t("teacherVocab.busy.aiRewriting") })}
                onRemove={() => removeRow(r)}
              />
            ))}
            {!visible.length && <li className="py-8 text-center text-sm text-slate-400">{t("teacherVocab.empty.noMatchingWords")}</li>}
          </ul>
        )}
      </div>

      <Pagination
        className="mt-4"
        page={curPage}
        perPage={perPage}
        total={visible.length}
        onPage={setPage}
        onPerPage={(n) => {
          setPerPage(n);
          setPage(1);
        }}
        unit={t("teacherVocab.unit.word")}
      />

      <AddWordsDrawer
        open={adding}
        onClose={() => setAdding(false)}
        sets={sets}
        defaultSetId={filteredSet?.id ?? sets[0]?.id ?? ""}
        existingWords={existingWords}
        job={job}
        onCancelJob={cancelJob}
        onRetryJob={retryRef.current ?? undefined}
        onPaste={(words, setId, opts) => {
          const known = new Set(rowsRef.current.filter((r) => r.setId === setId).map((r) => wordKey(r.word)));
          const newRows = words.filter((w) => !known.has(wordKey(w))).map((word) => toRow({ word }, setId));
          update((cur) => [...cur, ...newRows], [setId]);
          showSet(setId);
          if (opts.fill) void runFill(newRows, { overwrite: false, instruction: opts.instruction, title: t("teacherVocab.job.fillNewTitle", { n: newRows.length }) });
        }}
        onSuggest={(body, setId) => {
          showSet(setId);
          void runSuggest(body, setId);
        }}
        onImport={(items, setId, opts) => {
          const touchedKeys = new Set(items.map((i) => wordKey(i.word)));
          const { added, merged } = merge(items, setId, opts.overwrite);
          showSet(setId);
          const toFill = opts.fillMissing
            ? rowsRef.current.filter((r) => r.setId === setId && touchedKeys.has(wordKey(r.word)) && entryQuality(r).missing.length)
            : [];
          if (toFill.length) void runFill(toFill, { overwrite: false, title: t("teacherVocab.job.fillImportTitle", { n: toFill.length }) });
          return { added, merged, filling: toFill.length > 0 };
        }}
        onManual={(item, setId) => {
          if (rowsRef.current.some((r) => r.setId === setId && wordKey(r.word) === wordKey(item.word))) {
            toast.error(t("teacherVocab.toast.wordExists", { word: item.word }));
            return false;
          }
          merge([item], setId);
          showSet(setId);
          toast.success(t("teacherVocab.toast.wordAdded", { word: item.word }));
          return true;
        }}
        onCreateSet={async (name) => {
          try {
            const r = await vocabApi.saveSet({ name, active: false });
            await qc.invalidateQueries({ queryKey: ["teacher-vocab-sets"] });
            toast.success(t("teacherVocab.toast.setCreated"));
            return r.set.id;
          } catch (e) {
            toast.error(errMsg(e, "teacherVocab.error.createSet"));
            return null;
          }
        }}
        onFillDraft={async (item, setId) => {
          try {
            const r = await vocabApi.aiFill({ items: [item], context: aiContext(setById.get(setId)?.levelName) });
            return r.items[0] ?? null;
          } catch (e) {
            toast.error(errMsg(e, "teacherVocab.error.aiFill"));
            return null;
          }
        }}
      />

      <AiCompleteDrawer
        open={completing}
        onClose={() => setCompleting(false)}
        candidates={candidates}
        job={job}
        onCancelJob={cancelJob}
        onRetryJob={retryRef.current ?? undefined}
        onStart={(keys, opts) => {
          const set = new Set(keys);
          void runFill(
            rowsRef.current.filter((r) => set.has(r.key)),
            { ...opts, title: opts.overwrite ? t("teacherVocab.job.rewriteTitle", { n: keys.length }) : t("teacherVocab.job.fillTitle", { n: keys.length }) },
          );
        }}
      />

      <EntryDrawer
        row={editingRow}
        sets={sets}
        quality={editingRow ? quality.get(editingRow.key)! : null}
        position={editIndex >= 0 ? { i: editIndex + 1, n: visible.length } : null}
        busy={busy}
        onClose={() => setEditing(null)}
        onChange={(patch) => editingRow && patchRow(editingRow, patch)}
        onStep={(d) => {
          const next = visible[editIndex + d];
          if (next) setEditing(next.key);
        }}
        onMove={(d) => editingRow && move(editingRow.key, d)}
        onRegenerate={() => editingRow && runFill([editingRow], { overwrite: true, title: t("teacherVocab.busy.aiRewriting") })}
        onRemove={() => {
          if (!editingRow) return;
          removeRow(editingRow);
          setEditing(null);
        }}
      />

      <SetsDrawer
        open={!!manage}
        initialView={manage?.view ?? "list"}
        sets={sets}
        onClose={() => setManage(null)}
        onPick={(id) => {
          setManage(null);
          setSetFilter(id);
        }}
        onCreated={(id) => setSetFilter(id)}
        onDeleted={(id) => {
          setRows(rowsRef.current.filter((r) => r.setId !== id));
          setTouched((prev) => new Set([...prev].filter((x) => x !== id)));
          if (setFilter === id) setSetFilter("all");
          qc.invalidateQueries({ queryKey: ["teacher-vocab-items", id] });
        }}
      />

      {dirty && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("teacherVocab.list.unsavedSets", { n: touched.size })}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={loadRows}>
                {t("teacherVocab.action.cancelChanges")}
              </Button>
              <Button disabled={saveWords.isPending || busy} onClick={() => saveWords.mutate()}>
                {saveWords.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("teacherVocab.action.saveList")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "emerald" | "cyan" | "slate"; children: React.ReactNode }) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

// ── One row of the list ──────────────────────────────────────────────────────

function StatusMark({ quality }: { quality: Quality }) {
  const s = statusOf(quality);
  if (s === "complete")
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-4" /> {t("teacherVocab.row.complete")}
      </span>
    );
  if (s === "review")
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400" title={quality.warnings.join("; ")}>
        <AlertTriangle className="size-3.5" /> {t("teacherVocab.row.review")}
      </span>
    );
  return (
    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400" title={t("teacherVocab.row.missingFields", { fields: quality.missing.join(", ") })}>
      {t("teacherVocab.row.missingCount", { n: quality.missing.length })}
    </span>
  );
}

function WordRow({
  row,
  setName,
  gridCols,
  quality,
  busy,
  onEdit,
  onRegenerate,
  onRemove,
}: {
  row: Row;
  /** Shown in its own column in the all-sets view; null when one set is filtered. */
  setName: string | null;
  gridCols: string;
  quality: Quality;
  busy: boolean;
  onEdit: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50/80 md:grid dark:hover:bg-slate-800/30", gridCols)}>
      <button
        type="button"
        onClick={onEdit}
        className={cn("min-w-0 flex-1 text-left md:grid md:grid-cols-subgrid md:items-center md:gap-3", setName == null ? "md:col-span-4" : "md:col-span-5")}
      >
        <span className="block min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-slate-800 dark:text-slate-100">{row.word || <em className="font-normal text-slate-400">{t("teacherVocab.row.newWord")}</em>}</span>
            {row.pos && <span className="text-xs text-slate-400">({row.pos})</span>}
            {row.cefr && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">{row.cefr}</span>}
          </span>
          {row.ipa && <span className="font-ipa block truncate text-sm text-cyan-600 dark:text-cyan-400">/{row.ipa}/</span>}
          <span className="block truncate text-sm text-slate-500 md:hidden">
            {row.meaning || "—"}
            {setName ? ` · ${setName}` : ""}
          </span>
        </span>
        <span className="hidden truncate text-sm text-slate-600 md:block dark:text-slate-300">{row.meaning || "—"}</span>
        <span className="hidden truncate text-sm italic text-slate-500 md:block">{row.example || "—"}</span>
        {setName != null && (
          <span className="hidden min-w-0 md:block">
            <span className="inline-block max-w-full truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{setName}</span>
          </span>
        )}
        <span className="hidden md:block">
          <StatusMark quality={quality} />
        </span>
      </button>
      <span className="flex shrink-0 justify-end gap-0.5">
        <IconBtn label={t("teacherVocab.action.aiRewriteItem")} disabled={busy || !row.word.trim()} onClick={onRegenerate}>
          <RefreshCw className="size-4" />
        </IconBtn>
        <IconBtn label={t("common.delete")} onClick={onRemove} className="hover:!bg-rose-50 hover:!text-rose-600 dark:hover:!bg-rose-500/10">
          <Trash2 className="size-4" />
        </IconBtn>
      </span>
    </li>
  );
}

const setSelectOptions = (sets: TeacherVocabSet[]) => sets.map((s) => ({ value: s.id, label: s.name }));

// ── Entry drawer: edit one word ──────────────────────────────────────────────

function EntryDrawer({
  row,
  sets,
  quality,
  position,
  busy,
  onClose,
  onChange,
  onStep,
  onMove,
  onRegenerate,
  onRemove,
}: {
  row: Row | null;
  sets: TeacherVocabSet[];
  quality: Quality | null;
  position: { i: number; n: number } | null;
  busy: boolean;
  onClose: () => void;
  onChange: (patch: Partial<Row>) => void;
  onStep: (d: -1 | 1) => void;
  onMove: (d: -1 | 1) => void;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      widthClassName="max-w-2xl"
      icon={<Type className="size-5" />}
      title={row?.word.trim() || t("teacherVocab.row.newWord")}
      description={
        <>
          {position && <span className="font-semibold">{t("teacherVocab.entry.position", { i: position.i, n: position.n })} · </span>}
          {t("teacherVocab.entry.hint")}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center gap-1">
          <IconBtn label={t("teacherVocab.action.prevWord")} disabled={!position || position.i <= 1} onClick={() => onStep(-1)}>
            <ChevronLeft className="size-4" />
          </IconBtn>
          <IconBtn label={t("teacherVocab.action.nextWord")} disabled={!position || position.i >= position.n} onClick={() => onStep(1)}>
            <ChevronRight className="size-4" />
          </IconBtn>
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <IconBtn label={t("teacherVocab.action.moveUp")} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </IconBtn>
          <IconBtn label={t("teacherVocab.action.moveDown")} onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </IconBtn>
          <IconBtn label={t("common.delete")} onClick={onRemove} className="hover:!bg-rose-50 hover:!text-rose-600 dark:hover:!bg-rose-500/10">
            <Trash2 className="size-4" />
          </IconBtn>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" disabled={busy || !row?.word.trim()} onClick={onRegenerate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} <span className="hidden sm:inline">{t("teacherVocab.action.aiRewriteItem")}</span>
            </Button>
            <Button onClick={onClose}>{t("teacherVocab.action.done")}</Button>
          </div>
        </div>
      }
    >
      {row && quality && (
        <div className="space-y-3">
          {(quality.missing.length > 0 || quality.warnings.length > 0) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs dark:bg-amber-500/10">
              {quality.missing.length > 0 && <span className="text-amber-700 dark:text-amber-300">{t("teacherVocab.row.missingDetails", { fields: quality.missing.join(", ") })} </span>}
              {quality.warnings.map((w) => (
                <span key={w} className="text-rose-600 dark:text-rose-400">
                  {w}.{" "}
                </span>
              ))}
            </p>
          )}
          <Select label={t("teacherVocab.col.set")} options={setSelectOptions(sets)} value={row.setId} onChange={(setId) => onChange({ setId })} />
          <EntryFields row={row} onChange={onChange} />
        </div>
      )}
    </Drawer>
  );
}

// ── Sets drawer: list · create · edit · delete ───────────────────────────────

type SetsView = "list" | "new" | TeacherVocabSet;

function SetsDrawer({
  open,
  initialView,
  sets,
  onClose,
  onPick,
  onCreated,
  onDeleted,
}: {
  open: boolean;
  initialView: SetsView;
  sets: TeacherVocabSet[];
  onClose: () => void;
  onPick: (id: string) => void;
  onCreated: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [view, setView] = useState<SetsView>(initialView);
  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = sets.filter((s) => !needle || `${s.name} ${s.levelName ?? ""} ${s.description ?? ""}`.toLowerCase().includes(needle));
  // Opened straight on a form: leaving the form closes the drawer.
  const back = () => (initialView === "list" ? setView("list") : onClose());
  // The open set, read from the latest list so a save is reflected without reopening it.
  const set = view === "list" || view === "new" ? null : (sets.find((s) => s.id === view.id) ?? view);
  const form = useSetForm({
    formKey: view === "list" ? null : (set?.id ?? "new"),
    set,
    defaultName: t("teacherVocab.defaultSetName", { n: sets.length + 1 }),
    onBack: back,
    // Saving keeps the drawer on this set; a new set switches to editing it.
    onSaved: (saved) => {
      if (!set) {
        onCreated(saved.id);
        setView(saved);
      }
    },
    // The deleted set is gone, so fall back to the list of sets instead of closing.
    onDeleted: (id) => {
      onDeleted(id);
      setView("list");
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={view === "list" ? <Layers className="size-5" /> : set ? <Settings2 className="size-5" /> : <Plus className="size-5" />}
      title={view === "list" ? t("teacherVocab.sets.title") : set ? t("teacherVocab.info.editTitle") : t("teacherVocab.info.createTitle")}
      description={view === "list" ? t("teacherVocab.sets.description", { n: sets.length }) : t("teacherVocab.info.description")}
      footer={
        view === "list" ? (
          <Button className="w-full" onClick={() => setView("new")}>
            <Plus className="size-4" /> {t("teacherVocab.action.newSet")}
          </Button>
        ) : (
          form.footer
        )
      }
    >
      {view !== "list" ? (
        form.body
      ) : (
        <>
          {sets.length > 5 && (
            <div className="mb-3">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder={t("teacherVocab.sets.search")} leftIcon={<Search className="size-4" />} />
            </div>
          )}
          <div className="space-y-2">
            {visible.map((s) => (
              <div key={s.id} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white pr-1 transition hover:border-cyan-300 dark:border-slate-800 dark:bg-slate-900">
                <button type="button" onClick={() => onPick(s.id)} title={t("teacherVocab.sets.viewWords")} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
                  <Layers className="size-5 shrink-0 text-cyan-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800 dark:text-slate-100">{s.name}</span>
                    <span className="block text-xs text-slate-400">
                      {t("teacherVocab.set.wordCount", { n: s.wordCount })}
                      {s.levelName ? ` · ${s.levelName}` : ""}
                    </span>
                  </span>
                  <Badge tone={s.active ? "emerald" : "slate"}>{s.active ? t("teacherVocab.set.open") : t("teacherVocab.set.draftBadge")}</Badge>
                </button>
                <IconBtn label={t("teacherVocab.action.editSet")} onClick={() => setView(s)}>
                  <PenLine className="size-4" />
                </IconBtn>
              </div>
            ))}
            {!visible.length && <p className="py-6 text-center text-sm text-slate-400">{sets.length ? t("teacherVocab.sets.noMatch") : t("teacherVocab.empty.noSets")}</p>}
          </div>
        </>
      )}
    </Drawer>
  );
}

/** Create / edit / delete one set: the form body and the drawer footer for the sets drawer. */
function useSetForm({
  formKey,
  set,
  defaultName,
  onBack,
  onSaved,
  onDeleted,
}: {
  /** Changes whenever another set (or "new") is opened; null while the list is shown. */
  formKey: string | null;
  set: TeacherVocabSet | null;
  defaultName: string;
  onBack: () => void;
  onSaved: (set: TeacherVocabSet) => void;
  onDeleted: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list, enabled: !!formKey });
  const levelOptions = levelSelectOptions(levelsData?.items, { all: { value: "", label: t("teacherVocab.form.noLevel") } });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [levelId, setLevelId] = useState("");
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!formKey) return;
    setName(set?.name ?? defaultName);
    setDescription(set?.description ?? "");
    setLevelId(set?.levelId ?? "");
    setActive(set?.active ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);
  const dirty = !set || name !== set.name || description !== (set.description ?? "") || levelId !== (set.levelId ?? "") || active !== set.active;

  const save = useMutation({
    mutationFn: () => vocabApi.saveSet({ ...(set ? { id: set.id } : {}), name: name.trim(), description: description || null, levelId: levelId || null, active }),
    onSuccess: (r) => {
      toast.success(set ? t("teacherVocab.toast.setInfoSaved") : t("teacherVocab.toast.setCreated"));
      qc.invalidateQueries({ queryKey: ["teacher-vocab-sets"] });
      onSaved(r.set);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : set ? t("common.saveFailed") : t("teacherVocab.error.createSet")),
  });
  const remove = useMutation({
    mutationFn: () => vocabApi.deleteSet(set!.id),
    onSuccess: () => {
      toast.success(t("teacherVocab.toast.setDeleted"));
      qc.invalidateQueries({ queryKey: ["teacher-vocab-sets"] });
      onDeleted(set!.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });

  const body = (
    <div className="space-y-3">
      <Input key={formKey ?? ""} label={t("teacherVocab.form.setName")} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!set} />
      <Select label={t("teacherVocab.form.level")} options={levelOptions} value={levelId} onChange={setLevelId} />
      <Textarea label={t("teacherVocab.form.descriptionOptional")} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <ToggleRow icon={<Eye className="size-5" />} title={t("teacherVocab.form.openToLearners")} desc={t("teacherVocab.info.openHint")} checked={active} onChange={setActive} />
    </div>
  );

  const footer = (
    <div className="flex gap-2">
      <Button variant="outline" onClick={onBack} aria-label={t("common.back")} title={t("common.back")}>
        <ArrowLeft className="size-4" />
      </Button>
      {set && (
        <Button
          variant="outline"
          className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-400 dark:hover:bg-rose-500/10"
          disabled={remove.isPending}
          aria-label={t("teacherVocab.action.deleteSet")}
          title={t("teacherVocab.action.deleteSet")}
          onClick={async () => {
            if (await confirmAsk({ title: t("teacherVocab.confirm.deleteTitle", { name: set.name }), message: t("teacherVocab.confirm.deleteMessage"), confirmText: t("common.delete"), danger: true })) remove.mutate();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
      <Button className="flex-1" disabled={!name.trim() || !dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : set ? <Save className="size-4" /> : <Plus className="size-4" />} {set ? t("teacherVocab.action.saveInfo") : t("teacherVocab.action.createSet")}
      </Button>
    </div>
  );

  return { body, footer };
}

function IconBtn({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200",
        className,
      )}
    >
      {children}
    </button>
  );
}
