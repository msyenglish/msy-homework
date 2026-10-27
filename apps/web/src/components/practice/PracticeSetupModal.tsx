// Vocabulary practice-session setup: word source · count · mode · activities, with a live card
// estimate, then hands off to VocabDeckExercise. Shared by sets, My words and the review queue.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, Layers, Library, RotateCcw, AlertTriangle, ListChecks, Play, Search, Check, ChevronDown } from "lucide-react";
import { type VocabActivity, type VocabDeckConfig, type VocabDeckMode, type VocabItem } from "@msyen/shared";
import { accountApi, type VocabScope } from "../../lib/api";
import { estimateCards } from "./vocab/registry";
import { VOCAB_CARDS } from "./vocab/registry";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import { cn } from "../../lib/utils";
import { useOverlayHistory } from "../../lib/useOverlayHistory";
import { t, type TKey } from "../../i18n";

const PRESETS = [10, 20, 30, 40, 50];

const MODES: { id: VocabDeckMode; labelKey: TKey; hintKey: TKey }[] = [
  { id: "all", labelKey: "practice.setup.modeAll", hintKey: "practice.setup.modeAllHint" },
  { id: "unlearned", labelKey: "practice.setup.modeUnlearned", hintKey: "practice.setup.modeUnlearnedHint" },
  { id: "review", labelKey: "practice.setup.modeReview", hintKey: "practice.setup.modeReviewHint" },
  { id: "wrong", labelKey: "practice.setup.modeWrong", hintKey: "practice.setup.modeWrongHint" },
  { id: "due", labelKey: "practice.setup.modeDue", hintKey: "practice.setup.modeDueHint" },
];

// Activity definitions (badge). flashcard at the end + noted as not graded.
const ACTIVITY_DEFS = Object.values(VOCAB_CARDS)
  .map((d) => d!)
  .sort((a, b) => (a.id === "flashcard" ? 1 : 0) - (b.id === "flashcard" ? 1 : 0));

const DEFAULT_ACTIVITIES: VocabActivity[] = ["matching", "listen_choice", "recall", "dictation", "spelling"];

/** Word source selectable in the modal (quick practice) — Library set · My vocab · whole bank. */
export interface PracticeSource {
  value: string;
  label: string;
  scope: VocabScope;
  scopeKey?: string | null;
  /** Quick identification color (Library set has its own color); falls back to cyan. */
  color?: string | null;
  /** Word count in source. */
  count?: number;
  /** Secondary label (the set's level). */
  hint?: string | null;
}

export function PracticeSetupModal({
  open, onClose, scope, scopeKey, label, sources, initialSource, focus, focusLabel, allowPronounce, onStart,
}: {
  open: boolean;
  onClose: () => void;
  /** Fixed scope; ignored when `sources` is passed (learner chooses in modal). */
  scope?: VocabScope;
  scopeKey?: string | null;
  label: string;
  /** Select source directly in modal (quick practice from Vocabulary page). */
  sources?: PracticeSource[];
  /** Pre-selected source when opening — still changeable in modal. */
  initialSource?: string | null;
  /** Pinned activities — used for "focus 1 skill" entries; hides activity picker. */
  focus?: VocabActivity[];
  focusLabel?: string;
  allowPronounce: boolean;
  onStart: (items: VocabItem[], config: VocabDeckConfig, src: { scope: VocabScope; scopeKey?: string | null; label: string }) => void;
}) {
  const [mode, setMode] = useState<VocabDeckMode>("all");
  const [countIdx, setCountIdx] = useState(1); // default ~30
  const [acts, setActs] = useState<Set<VocabActivity>>(new Set(DEFAULT_ACTIVITIES));
  const [srcValue, setSrcValue] = useState<string>(initialSource ?? sources?.[0]?.value ?? "");
  // Reopening modal with another set -> jump to that set.
  useEffect(() => { if (open && initialSource) setSrcValue(initialSource); }, [open, initialSource]);

  const src = sources?.find((s) => s.value === srcValue) ?? sources?.[0];
  const curScope: VocabScope = src?.scope ?? scope ?? "my";
  const curKey = src ? src.scopeKey ?? null : scopeKey ?? null;
  const srcLabel = src ? src.label : label;

  // Words for (scope, mode) — up to 50 (the largest preset); the slider cuts client-side.
  const { data, isFetching } = useQuery({
    queryKey: ["vocab-pool", curScope, curKey, mode],
    queryFn: () => accountApi.vocabSessionResolve({ scope: curScope, scopeKey: curKey, mode, count: 50 }),
    enabled: open,
  });
  const pool = data?.items ?? [];
  const available = data?.available ?? 0;
  const maxWords = Math.min(available, 50);

  // Preset count stops <= available words (+ last stop = maxWords if odd).
  const stops = useMemo(() => {
    if (maxWords <= 0) return [];
    const s = PRESETS.filter((p) => p < maxWords);
    if (!s.includes(maxWords)) s.push(maxWords);
    return s.length ? s : [maxWords];
  }, [maxWords]);

  useEffect(() => { setCountIdx((i) => Math.min(i, Math.max(0, stops.length - 1))); }, [stops.length]);
  // Back closes the sheet instead of leaving the page under it.
  useOverlayHistory(open, onClose);
  const count = stops[Math.min(countIdx, stops.length - 1)] ?? 0;
  const sliced = pool.slice(0, count);

  const activities = focus ?? [...acts];
  const config: VocabDeckConfig = {
    source: "fixed", wordIds: sliced.map((w) => w.id), activities,
    order: "grouped", retryWrong: true,
    pronounce: allowPronounce ? "optional" : "off",
  };
  const estimate = sliced.length && activities.length ? estimateCards(sliced, config, allowPronounce) : 0;

  if (!open) return null;
  const toggle = (id: VocabActivity) => setActs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canStart = sliced.length > 0 && activities.length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">{focusLabel ?? t("practice.setup.customTitle")}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{sources ? label : srcLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Word source — only shown for quick practice entry */}
          {sources && sources.length > 1 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200"><Library className="size-4 text-cyan-500" /> {t("practice.setup.wordSource")}</p>
              <SourcePicker sources={sources} value={srcValue} onChange={setSrcValue} />
            </div>
          )}

          {/* Mode — the review queue already is a mode, so it is not asked again */}
          <div className={cn(curScope === "due" && "hidden")}>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200"><Layers className="size-4 text-cyan-500" /> {t("practice.setup.mode")}</p>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button key={m.id} type="button" onClick={() => setMode(m.id)}
                  className={cn("rounded-lg border px-3 py-2 text-left transition",
                    mode === m.id ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/15" : "border-slate-200 hover:border-cyan-300 dark:border-slate-700")}>
                  <span className={cn("block text-sm font-semibold", mode === m.id ? "text-cyan-700 dark:text-cyan-300" : "text-slate-700 dark:text-slate-200")}>{t(m.labelKey)}</span>
                  <span className="block text-[11px] text-slate-400">{t(m.hintKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Word count */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200"><ListChecks className="size-4 text-cyan-500" /> {t("practice.setup.wordCount")}</p>
              <span className="text-lg font-extrabold tabular-nums text-cyan-600 dark:text-cyan-400">{count}</span>
            </div>
            {stops.length > 1 ? (
              <>
                <Slider min={0} max={stops.length - 1} step={1} value={Math.min(countIdx, stops.length - 1)}
                  onChange={setCountIdx} aria-label={t("practice.setup.wordCount")} />
                <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-400">
                  {stops.map((s) => <span key={s}>{s}</span>)}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {maxWords > 0
                  ? t("practice.setup.wordsAvailableCount", { n: maxWords })
                  : t("practice.setup.noWordsForMode")}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {t("practice.setup.availableSummary", {
                count: available,
                n: available,
                byMode: mode !== "all" ? t("practice.setup.byModeSuffix") : "",
              })}
            </p>
          </div>

          {/* Activity types */}
          <div className={cn(focus && "hidden")}>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">{t("practice.setup.activityTypes")}</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_DEFS.map((d) => {
                const on = acts.has(d.id);
                const isFlash = d.id === "flashcard";
                return (
                  <button key={d.id} type="button" onClick={() => toggle(d.id)}
                    className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                      on ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-300")}>
                    <d.Icon className="size-4" /> {d.label}
                    {isFlash && <span className="text-[10px] font-medium text-slate-400">{t("practice.setup.notGraded")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer: card estimate + start */}
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          {curScope === "due" && available === 0 && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><AlertTriangle className="size-3.5" /> {t("practice.setup.noDueWords")}</p>
          )}
          {mode === "wrong" && available === 0 && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3.5" /> {t("practice.setup.noWrongWords")}</p>
          )}
          <button type="button" disabled={!canStart}
            onClick={() => onStart(sliced, config, { scope: curScope, scopeKey: curKey, label: srcLabel })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50">
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t("practice.setup.start")}{estimate > 0 ? t("practice.setup.estimatedCards", { n: estimate }) : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Banner shown when an unfinished session exists. */
export function ResumeBanner({ remaining, onResume, onDiscard }: { remaining: number; onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 dark:border-cyan-900 dark:bg-cyan-500/10">
      <RotateCcw className="size-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t("practice.setup.unfinishedSession")}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("practice.setup.remainingQuestions", { n: remaining })}</p>
      </div>
      <button type="button" onClick={onDiscard} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white dark:hover:bg-slate-800">{t("practice.setup.discard")}</button>
      <button type="button" onClick={onResume} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-cyan-600">{t("practice.setup.resume")}</button>
    </div>
  );
}

/**
 * Word source picker with search + color/count.
 */
function SourcePicker({
  sources,
  value,
  onChange,
}: {
  sources: PracticeSource[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = sources.find((s) => s.value === value) ?? sources[0];
  const needle = q.trim().toLowerCase();
  const list = needle
    ? sources.filter((s) => `${s.label} ${s.hint ?? ""}`.toLowerCase().includes(needle))
    : sources;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 transition hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <SourceDot source={cur} />
        <span className="min-w-0 flex-1 truncate">{cur?.label}</span>
        {cur?.count != null && <span className="shrink-0 text-xs font-medium text-slate-400">{cur.count}</span>}
        <ChevronDown className={cn("size-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[85]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-[86] mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-2 dark:border-slate-800">
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onClear={() => setQ("")}
                placeholder={t("practice.setup.searchSetsPlaceholder")}
                leftIcon={<Search className="size-4" />}
              />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {list.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">{t("practice.setup.noSetsMatch")}</li>}
              {list.map((s) => (
                <li key={s.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(s.value); setOpen(false); setQ(""); }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800",
                      s.value === value && "bg-cyan-50/60 dark:bg-cyan-500/10",
                    )}
                  >
                    <SourceDot source={s} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">{s.label}</span>
                    {s.hint && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{s.hint}</span>}
                    {s.count != null && <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-slate-400">{s.count}</span>}
                    {s.value === value && <Check className="size-4 shrink-0 text-cyan-500" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** Source color indicator. */
function SourceDot({ source }: { source?: PracticeSource }) {
  const color = source?.color || undefined;
  return color ? (
    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  ) : (
    <span className="size-2.5 shrink-0 rounded-full bg-cyan-500" />
  );
}
