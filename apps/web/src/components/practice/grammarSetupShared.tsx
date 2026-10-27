// Pieces both grammar setup modals are built from. The two drills share a point picker, a count
// slider and a resume list, but nothing else: the quiz picks question types, translation picks a
// scaffolding rung, and their banks cover different points. Keeping them as separate modals means
// neither has to branch on the other's mode.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookText, Check, ChevronDown, ChevronRight, Layers, ListChecks, RotateCcw, Search, Trash2, X } from "lucide-react";
import { CEFR_BANDS, MAX_SESSION_POINTS, type Cefr, type GrammarListItem } from "@msyen/shared";
import { publicGrammar, type GrammarDraft } from "../../lib/api";
import { BAND_COLOR, cefrFromLabel } from "../../lib/cefr";
import { Select } from "../ui/select";
import { Slider } from "../ui/slider";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

/** Colour swatch for a CEFR band — same palette as the band headings in the list. */
function BandDot({ band }: { band: Cefr }) {
  return <span className="block size-2.5 rounded-full" style={{ backgroundColor: BAND_COLOR[band] }} />;
}

/** Diacritic-insensitive: learners type Vietnamese without tone marks just as often. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Full-screen on mobile, centred card from `sm` up. The point list, the count slider and the
 * difficulty grid do not fit in a bottom sheet without squeezing every one of them.
 */
export function SetupShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 dark:text-cyan-400">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">{title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("practice2.setup.close")}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">{children}</div>
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">{footer}</div>
      </div>
    </div>
  );
}

/** Shared list state: search box, band filter and the handbook itself. */
export function usePointList(open: boolean, userBand?: string | null) {
  const [search, setSearch] = useState("");
  // Band filter defaults to the learner's own level: 129 points across 7 bands is unusable
  // otherwise, and the band they are studying is the one they want ~all of the time.
  const [band, setBand] = useState<string>(() => cefrFromLabel(userBand) || "all");
  const { data: list } = useQuery({ queryKey: ["grammar"], queryFn: publicGrammar, staleTime: Infinity, retry: false });

  useEffect(() => { if (open) setBand(cefrFromLabel(userBand) || "all"); }, [open, userBand]);

  const byBand = useMemo(() => {
    const q = norm(search.trim());
    // A search looks across every band: the learner typing "past simple" from Pre-A1 means that point.
    const items = (list?.items ?? []).filter(
      (g) => (q ? norm(g.title).includes(q) || norm(g.category).includes(q) : band === "all" || g.cefr === band),
    );
    return CEFR_BANDS.map((b) => ({ band: b, items: items.filter((g) => g.cefr === b) })).filter((b) => b.items.length);
  }, [list, search, band]);

  return { list, byBand, search, setSearch, band, setBand };
}

/**
 * The grammar point chooser. `hasBank` decides which points this drill can actually serve — the two
 * banks are far apart in coverage, so a point that is drillable as a quiz may have no translation
 * sentences at all.
 */
export function PointPicker({
  byBand,
  search,
  setSearch,
  band,
  setBand,
  picked,
  setPicked,
  hasBank,
  emptyLabel,
  badgeOf,
}: {
  byBand: { band: string; items: GrammarListItem[] }[];
  search: string;
  setSearch: (v: string) => void;
  band: string;
  setBand: (v: string) => void;
  picked: string[];
  setPicked: React.Dispatch<React.SetStateAction<string[]>>;
  hasBank: (id: string) => boolean;
  emptyLabel: string;
  badgeOf?: (g: GrammarListItem) => React.ReactNode;
}) {
  const full = picked.length >= MAX_SESSION_POINTS;
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : full ? p : [...p, id]));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <BookText className="size-4 text-cyan-500" /> {t("practice2.setup.grammarPoints")}
        </p>
        <span className={cn("text-xs font-bold tabular-nums", full ? "text-amber-600 dark:text-amber-400" : "text-slate-400")}>
          {picked.length}/{MAX_SESSION_POINTS}
        </span>
      </div>
      <div className="mb-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("practice2.setup.searchGrammar")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </div>
        <div className="w-32 shrink-0">
          <Select
            options={[
              { value: "all", label: "All", icon: <Layers className="size-4" /> },
              ...CEFR_BANDS.map((b) => ({ value: b, label: b, icon: <BandDot band={b} /> })),
            ]}
            value={band}
            onChange={setBand}
            menuPortal
          />
        </div>
      </div>
      <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-2.5 sm:max-h-64 dark:border-slate-700">
        {byBand.map(({ band: b, items }) => (
          <div key={b}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: BAND_COLOR[b as Cefr] }}>{b}</p>
            <div className="space-y-0.5">
              {items.map((g) => {
                const on = picked.includes(g.id);
                const empty = !hasBank(g.id);
                const locked = empty;
                return (
                  <button key={g.id} type="button" disabled={locked || (!on && full)}
                    title={empty ? emptyLabel : undefined}
                    onClick={() => toggle(g.id)}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                      locked ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                        : on ? "bg-cyan-50 font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                          : !on && full ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800")}>
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-cyan-500 bg-cyan-500 text-white" : "border-slate-300 dark:border-slate-600")}>
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    {empty ? (
                      <span className="shrink-0 text-[10px] font-semibold text-slate-400">{emptyLabel}</span>
                    ) : (
                      badgeOf?.(g)
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!byBand.length && <p className="px-2 py-4 text-center text-sm text-slate-400">{t("practice2.setup.noPoints")}</p>}
      </div>
    </div>
  );
}

/** How many sentences this session draws. */
export function CountSlider({
  counts, idx, setIdx,
}: {
  counts: readonly number[];
  idx: number;
  setIdx: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <ListChecks className="size-4 text-cyan-500" /> {t("practice2.setup.sentenceCount")}
        </p>
        <span className="text-lg font-extrabold tabular-nums text-cyan-600 dark:text-cyan-400">
          {counts[Math.min(idx, counts.length - 1)]}
        </span>
      </div>
      <Slider min={0} max={counts.length - 1} step={1} value={idx} onChange={setIdx} aria-label={t("practice2.setup.sentenceCount")} />
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-slate-400">
        {counts.map((n) => <span key={n}>{n}</span>)}
      </div>
    </div>
  );
}

/**
 * Resume list: one box, two rows per draft (what it covers, how far in). Collapsed past three.
 * The items were already drawn (and their cooldown already spent), so resuming hands back the SAME
 * sentences rather than burning a fresh set.
 */
export function DraftList({
  drafts, onResume, onDrop,
}: {
  drafts: GrammarDraft[];
  onResume: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? drafts : drafts.slice(0, 3);
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
        <RotateCcw className="size-4 text-cyan-500" /> {t("practice2.setup.inProgress")}
        <span className="ml-1 rounded-full bg-cyan-100 px-1.5 text-[11px] font-bold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
          {drafts.length}
        </span>
      </p>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {shown.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <BookText className="size-4" />
            </span>
            <button type="button" onClick={() => onResume(d.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{d.label}</span>
              <span className="block text-[11px] text-slate-400">
                {t("practice2.setup.draftProgress", { answered: d.answered, total: d.total, date: new Date(d.updated_at).toLocaleDateString("vi-VN") })}
              </span>
            </button>
            <button type="button" onClick={() => onDrop(d.id)} aria-label={t("practice2.setup.dropSession")}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      {drafts.length > 3 && (
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {open ? t("practice2.setup.collapse") : t("practice2.setup.showMore", { n: drafts.length - 3 })}
        </button>
      )}
    </div>
  );
}
