// Session setup for the GRAMMAR QUIZ drill: pick up to MAX_SESSION_POINTS grammar points, how many
// questions, and which question types. There is deliberately NO ordering picker — the server mixes
// each session itself (wrong items first, then unseen, then due).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookText, ListChecks, Play } from "lucide-react";
import {
  DEFAULT_DRILL_COUNT,
  DRILL_COUNTS,
  QTYPE_LABEL_EN,
  type GrammarSessionInput,
  type QuestionType,
} from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { cn } from "../../lib/utils";
import { CountSlider, DraftList, PointPicker, SetupShell, usePointList } from "./grammarSetupShared";
import { t } from "../../i18n";

// `categorize` is deliberately absent: bucket sorting is retired from grammar drills
// (see genGrammarItemsSql.mjs), so it must not be offerable here.
const TYPES: QuestionType[] = ["multiple_choice", "fill_blank", "ordering", "matching"];

export function GrammarQuizSetupModal({
  open,
  onClose,
  initialIds = [],
  userBand,
  onStart,
  onResume,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-selected grammar point (entering from a handbook entry). */
  initialIds?: string[];
  /** CEFR band of the learner's own level — the band filter opens on it. */
  userBand?: string | null;
  onStart: (config: GrammarSessionInput) => void;
  onResume: (draftId: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initialIds);
  const [countIdx, setCountIdx] = useState(DRILL_COUNTS.indexOf(DEFAULT_DRILL_COUNT));
  const [types, setTypes] = useState<Set<QuestionType>>(new Set());
  const { list, byBand, search, setSearch, band, setBand } = usePointList(open, userBand);

  const { data: state } = useQuery({ queryKey: ["grammar-state"], queryFn: accountApi.grammarState, enabled: open, retry: false });
  const { data: drafts, refetch: refetchDrafts } = useQuery({
    queryKey: ["grammar-drafts"], queryFn: accountApi.grammarDrafts, enabled: open, retry: false,
  });

  useEffect(() => { if (open) setPicked(initialIds); }, [open, initialIds.join(",")]);

  const masteryBy = useMemo(() => new Map((state?.items ?? []).map((m) => [m.grammar_id, m])), [state]);
  // Before `/state` arrives every point is assumed drillable, so the list does not flash as locked.
  const hasBank = (id: string) => !state || (masteryBy.get(id)?.bank ?? 0) > 0;

  // If the learner's own band has no bank yet, opening on it would show a wall of disabled rows.
  const bandsWithBank = useMemo(() => {
    const set = new Set<string>();
    for (const g of list?.items ?? []) if ((masteryBy.get(g.id)?.bank ?? 0) > 0) set.add(g.cefr);
    return set;
  }, [list, masteryBy]);
  useEffect(() => {
    if (!open || !state || !list) return;
    if (band !== "all" && !bandsWithBank.has(band)) setBand("all");
  }, [open, state, list, bandsWithBank, band, setBand]);

  // Only offer the types the chosen points actually declare.
  const availableTypes = useMemo(() => {
    if (!picked.length) return TYPES;
    const set = new Set<QuestionType>();
    for (const id of picked) for (const t of list?.items.find((g) => g.id === id)?.drill_types ?? []) set.add(t);
    return set.size ? TYPES.filter((t) => set.has(t)) : TYPES;
  }, [picked, list]);

  if (!open) return null;

  const count = DRILL_COUNTS[Math.min(countIdx, DRILL_COUNTS.length - 1)];
  const toggleType = (t: QuestionType) =>
    setTypes((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });

  return (
    <SetupShell
      title={t("practice2.setup.grammarTitle")}
      subtitle={t("practice2.setup.grammarSubtitle")}
      icon={<BookText className="size-5" />}
      onClose={onClose}
      footer={
        <>
          <button type="button" disabled={!picked.length}
            onClick={() => onStart({ grammarIds: picked, count, types: types.size ? [...types] : null })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50">
            <Play className="size-4" /> {t("practice2.setup.startCount", { n: count })}
          </button>
        </>
      }
    >
      <PointPicker
        byBand={byBand} search={search} setSearch={setSearch} band={band} setBand={setBand}
        picked={picked} setPicked={setPicked} hasBank={hasBank}
        emptyLabel={t("practice2.setup.noQuestions")}
        badgeOf={(g) => {
          const m = masteryBy.get(g.id);
          return (
            <>
              {m && m.mastery > 0 && (
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">{m.mastery}%</span>
              )}
              {m?.due && <span className="size-1.5 shrink-0 rounded-full bg-amber-400" title={t("practice2.setup.dueReview")} />}
            </>
          );
        }}
      />

      <CountSlider counts={DRILL_COUNTS} idx={countIdx} setIdx={setCountIdx} />

      {!!drafts?.items.length && (
        <DraftList
          drafts={drafts.items}
          onResume={onResume}
          onDrop={async (id) => { await accountApi.grammarDraftDrop(id); refetchDrafts(); }}
        />
      )}

      {/* Question types — empty selection means "whatever the point declares". */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <ListChecks className="size-4 text-cyan-500" /> {t("practice2.setup.questionTypes")}
        </p>
        <div className="flex flex-wrap gap-2">
          {availableTypes.map((t) => {
            const on = types.has(t);
            return (
              <button key={t} type="button" onClick={() => toggleType(t)}
                className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                  on ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                    : "border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-300")}>
                {QTYPE_LABEL_EN[t]}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-400">{t("practice2.setup.allTypes")}</p>
      </div>
    </SetupShell>
  );
}
