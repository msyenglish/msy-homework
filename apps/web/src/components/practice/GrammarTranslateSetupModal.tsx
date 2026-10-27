// Session setup for the TRANSLATION drill: pick grammar points, how many sentences, and the rung to
// open at. Separate from the quiz modal because almost nothing lines up — the translation bank
// covers different points, its counts are shorter, and the rung replaces the question-type filter.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Languages, Play, Shuffle } from "lucide-react";
import {
  CEFR_BANDS,
  DEFAULT_TRANSLATE_COUNT,
  DEFAULT_TRANSLATE_LEVEL,
  TRANSLATE_COUNTS,
  type Cefr,
  type GrammarTranslateSessionInput,
  type TranslateLevel,
} from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { BAND_COLOR, cefrFromLabel } from "../../lib/cefr";
import { ToggleRow } from "../ui/toggle";
import { cn } from "../../lib/utils";
import { CountSlider, DraftList, PointPicker, SetupShell, usePointList } from "./grammarSetupShared";
import { t, type TKey } from "../../i18n";

// Each rung takes support away rather than adding blanks. `detail` is spelled out under the row so
// the cards can stay small enough to sit four-across.
const LEVELS: { id: TranslateLevel; label: string; hint: TKey; detail: TKey; cls: string }[] = [
  {
    id: "easy",
    label: "Easy",
    hint: "practice.translateSetup.easyHint",
    detail: "practice.translateSetup.easyDetail",
    cls: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
  },
  {
    id: "medium",
    label: "Medium",
    hint: "practice.translateSetup.mediumHint",
    detail: "practice.translateSetup.mediumDetail",
    cls: "border-amber-200 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20",
  },
  {
    id: "hard",
    label: "Hard",
    hint: "practice.translateSetup.hardHint",
    detail: "practice.translateSetup.hardDetail",
    cls: "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
  },
  {
    id: "hardest",
    label: "Hardest",
    hint: "practice.translateSetup.hardestHint",
    detail: "practice.translateSetup.hardestDetail",
    cls: "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/20",
  },
];

export function GrammarTranslateSetupModal({
  open,
  onClose,
  initialIds = [],
  userBand,
  onStart,
  onResume,
}: {
  open: boolean;
  onClose: () => void;
  initialIds?: string[];
  userBand?: string | null;
  onStart: (config: GrammarTranslateSessionInput) => void;
  onResume: (draftId: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(initialIds);
  const [countIdx, setCountIdx] = useState(TRANSLATE_COUNTS.indexOf(DEFAULT_TRANSLATE_COUNT));
  const [level, setLevel] = useState<TranslateLevel>(DEFAULT_TRANSLATE_LEVEL);
  // Random mode is on by default; a point handed in from the handbook opens on the point picker instead.
  const [random, setRandom] = useState(initialIds.length === 0);
  const [bands, setBands] = useState<Cefr[]>([]);
  const { list, byBand, search, setSearch, band, setBand } = usePointList(open, userBand);

  const { data: trState } = useQuery({
    queryKey: ["grammar-translate-state"], queryFn: accountApi.grammarTranslateState, enabled: open, retry: false,
  });
  const { data: drafts, refetch: refetchDrafts } = useQuery({
    queryKey: ["grammar-translate-drafts"], queryFn: accountApi.grammarTranslateDrafts, enabled: open, retry: false,
  });

  useEffect(() => {
    if (!open) return;
    setPicked(initialIds);
    setRandom(initialIds.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIds.join(",")]);

  // Turning random mode on starts from the learner's own band — the one they want most of the time,
  // same default the point picker's band filter uses.
  useEffect(() => {
    if (!random || bands.length) return;
    const own = cefrFromLabel(userBand) as Cefr | "";
    if (own) setBands([own]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [random, userBand]);

  // The translation bank is far younger than the quiz bank, so most points have none yet. Until
  // `/translate/state` lands nothing is selectable, which is honest: a point with no sentences
  // cannot start a session.
  const totalBy = new Map((trState?.items ?? []).map((t) => [t.grammar_id, t.total]));
  const hasBank = (id: string) => (totalBy.get(id) ?? 0) > 0;

  // Drop picks the translation bank cannot serve, so the start button never fires a request the
  // server will reject (the caller may have pre-selected a point from the handbook).
  useEffect(() => {
    if (!trState) return;
    setPicked((p) => p.filter((id) => (totalBy.get(id) ?? 0) > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trState]);

  if (!open) return null;

  const count = TRANSLATE_COUNTS[Math.min(countIdx, TRANSLATE_COUNTS.length - 1)];

  // Sentences per band, so a band with an empty bank is visibly empty instead of failing on start.
  const bandTotals = new Map<string, number>();
  for (const g of list?.items ?? []) {
    const n = totalBy.get(g.id) ?? 0;
    if (n > 0) bandTotals.set(g.cefr, (bandTotals.get(g.cefr) ?? 0) + n);
  }
  const bandPool = bands.reduce((s, b) => s + (bandTotals.get(b) ?? 0), 0);
  const toggleBand = (b: Cefr) => setBands((v) => (v.includes(b) ? v.filter((x) => x !== b) : [...v, b]));
  const ready = random ? bands.length > 0 : picked.length > 0;

  return (
    <SetupShell
      title={t("practice.translateSetup.title")}
      subtitle={t("practice.translateSetup.subtitle")}
      icon={<Languages className="size-5" />}
      onClose={onClose}
      footer={
        <>
          <button type="button" disabled={!ready}
            onClick={() =>
              onStart(random ? { grammarIds: [], bands, count, level } : { grammarIds: picked, count, level })
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50">
            <Play className="size-4" /> {t("practice.translateSetup.startAction", { count })}
            <span className="opacity-70">· {LEVELS.find((l) => l.id === level)?.label}</span>
          </button>
        </>
      }
    >
      {/* Scaffolding ladder FIRST: it changes what the whole session looks like, so it belongs
          above the point picker rather than buried under it. */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
          <Languages className="size-4 text-cyan-500" /> {t("practice.translateSetup.difficulty")}
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {LEVELS.map((lv) => (
            <button key={lv.id} type="button" onClick={() => setLevel(lv.id)}
              className={cn("rounded-xl border-2 px-1 py-2.5 text-center transition", lv.cls,
                level === lv.id ? "ring-2 ring-cyan-400 ring-offset-1 dark:ring-offset-slate-900" : "opacity-60 hover:opacity-100")}>
              <div className="text-[13px] font-bold leading-tight">{lv.label}</div>
              <div className="mt-0.5 text-[10px] leading-tight opacity-70">{t(lv.hint)}</div>
            </button>
          ))}
        </div>
        {/* Detail for the chosen rung, outside the cards so they stay small enough to sit 4-across. */}
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {t(LEVELS.find((l) => l.id === level)?.detail ?? "practice.translateSetup.easyDetail")}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{t("practice.translateSetup.changeAnytime")}</p>
        </div>
      </div>

      {/* Random mode REPLACES the point picker rather than sitting next to it: picking points and
          picking bands are two answers to the same question, and showing both invites setting one
          then wondering why the other was ignored. */}
      <div>
        <ToggleRow
          icon={<Shuffle className="size-5" />}
          title={t("practice.translateSetup.randomByLevelTitle")}
          desc={t("practice.translateSetup.randomByLevelDesc")}
          checked={random}
          onChange={setRandom}
        />
        {random && (
          <div className="mt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t("practice.translateSetup.practiceLevels")}</p>
              <span className="text-xs font-bold tabular-nums text-slate-400">
                {bandPool > 0 ? t("practice.translateSetup.sentenceCount", { n: bandPool }) : t("practice.translateSetup.notSelected")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CEFR_BANDS.map((b) => {
                const n = bandTotals.get(b) ?? 0;
                const locked = n === 0;
                const on = bands.includes(b);
                return (
                  <button key={b} type="button" disabled={locked} onClick={() => toggleBand(b)}
                    title={n === 0 ? t("practice.translateSetup.levelNoSentences") : undefined}
                    className={cn("flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition",
                      locked ? "cursor-not-allowed border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600"
                        : on ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                          : "border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-300")}>
                    {!locked && <span className="size-2.5 rounded-full" style={{ backgroundColor: BAND_COLOR[b] }} />}
                    {b}
                    {!locked && <span className="text-[10px] font-semibold tabular-nums opacity-60">{n}</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {t("practice.translateSetup.randomMultiLevelHint")}
            </p>
          </div>
        )}
      </div>

      {!random && (
        <PointPicker
          byBand={byBand} search={search} setSearch={setSearch} band={band} setBand={setBand}
          picked={picked} setPicked={setPicked} hasBank={hasBank}
          emptyLabel={t("practice.translateSetup.emptyLabel")}
          badgeOf={(g) => {
            const n = totalBy.get(g.id) ?? 0;
            return n > 0 ? (
              <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">{t("practice.translateSetup.sentenceCount", { n })}</span>
            ) : null;
          }}
        />
      )}

      <CountSlider counts={TRANSLATE_COUNTS} idx={countIdx} setIdx={setCountIdx} />

      {!!drafts?.items.length && (
        <DraftList
          drafts={drafts.items}
          onResume={onResume}
          onDrop={async (id) => { await accountApi.grammarDraftDrop(id); refetchDrafts(); }}
        />
      )}

    </SetupShell>
  );
}
