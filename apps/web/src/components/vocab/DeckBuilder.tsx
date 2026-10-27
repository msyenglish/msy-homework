// Vocabulary deck builder — shared by the exercise editor and the AI composer tab.
//   Editor (no `groups` prop): pick one of the teacher's sets, practise the whole set or chosen
//   words, pick the activities.
//   AI composer (`groups` given): an optional word list (empty → AI picks words from the topic);
//   the AI job turns it into a NEW set and a deck that practises it (lib/ai/jobs.ts).
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Mic, Sparkles } from "lucide-react";
import type { VocabDeckConfig } from "@msyen/shared";
import { vocabApi } from "../../lib/api";
import { Select, Textarea, ToggleRow } from "../ui";
import { NumberInput } from "../NumberInput";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { ActivityChips, DEFAULT_DECK_ACTS, parseWordList } from "./deckPickers";

/** What the AI suggests: single words · phrases (collocations, phrasal verbs, idioms) · both. */
export type VocabItemForm = "word" | "phrase" | "both";

export interface VocabDeckHandle {
  /** The deck to save (the editor awaits it before saving the exercise). */
  prepare: () => Promise<VocabDeckConfig>;
  /** Snapshot for the AI job queue — no API call. */
  payload: () => VocabDeckJobPayload;
}

export interface VocabDeckJobPayload {
  words: { word: string }[];
  wordIds: string[];
  activities: string[];
  order: "interleave" | "grouped";
  retryWrong: boolean;
  pronounce: "on" | "optional" | "off";
  count: number;
  enrich: boolean;
  levelId: string | null;
  topicIds: string[];
}

const EMPTY_DECK: VocabDeckConfig = {
  source: "filter",
  filter: { setId: null },
  activities: DEFAULT_DECK_ACTS,
  order: "grouped",
  retryWrong: true,
  pronounce: "off",
};

export const VocabDeckBuilder = forwardRef<
  VocabDeckHandle,
  {
    value: VocabDeckConfig | null;
    onChange: (v: VocabDeckConfig) => void;
    /** AI composer only: level/topic chosen on the composer itself. */
    groups?: { levelId: string | null; topicIds: string[] };
    aiContext?: () => string;
    onAiSuggested?: (words: string[]) => void;
    count?: number;
    onCount?: (n: number) => void;
    itemForm?: VocabItemForm;
    onItemForm?: (v: VocabItemForm) => void;
  }
>(function VocabDeckBuilder({ value, onChange, groups, count: countProp, onCount }, ref) {
  const deck = value ?? EMPTY_DECK;
  const patch = (p: Partial<VocabDeckConfig>) => onChange({ ...deck, ...p });
  const aiMode = !!groups;

  const [list, setList] = useState("");
  const [ownCount, setOwnCount] = useState(15);
  const count = countProp ?? ownCount;
  const setCount = onCount ?? setOwnCount;
  const [enrich, setEnrich] = useState(true);

  // Editor: which set, and which of its words.
  const { data: setsData } = useQuery({ queryKey: ["teacher-vocab-sets"], queryFn: vocabApi.sets, enabled: !aiMode });
  const sets = setsData?.items ?? [];
  const [setId, setSetId] = useState<string>(deck.filter?.setId ?? "");
  const { data: itemsData } = useQuery({
    queryKey: ["teacher-vocab-items", setId],
    queryFn: () => vocabApi.setItems(setId),
    enabled: !aiMode && !!setId,
  });
  const items = useMemo(() => itemsData?.items ?? [], [itemsData]);
  const picked = new Set(deck.source === "fixed" ? deck.wordIds ?? [] : []);
  const wholeSet = deck.source === "filter";

  const chooseSet = (id: string) => {
    setSetId(id);
    patch({ source: "filter", filter: { setId: id || null }, wordIds: undefined });
  };
  const toggleWord = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ source: "fixed", wordIds: items.filter((i) => next.has(i.id)).map((i) => i.id), filter: undefined });
  };

  useImperativeHandle(ref, () => ({
    prepare: async () => {
      if (deck.source === "filter" && !deck.filter?.setId) throw new Error(t("teacherVocab.error.chooseSet"));
      if (deck.source === "fixed" && !deck.wordIds?.length) throw new Error(t("teacherVocab.error.chooseOneWord"));
      return deck;
    },
    payload: () => ({
      words: parseWordList(list).map((word) => ({ word })),
      wordIds: [],
      activities: deck.activities,
      order: deck.order,
      retryWrong: deck.retryWrong !== false,
      pronounce: deck.pronounce ?? "off",
      count,
      enrich,
      levelId: groups?.levelId ?? null,
      topicIds: groups?.topicIds ?? [],
    }),
  }));

  return (
    <div className="space-y-4">
      {aiMode ? (
        <>
          <Textarea
            label={t("teacherVocab.deck.wordListOptional")}
            rows={4}
            value={list}
            onChange={(e) => setList(e.target.value)}
            placeholder={t("teacherVocab.deck.wordListPlaceholder")}
          />
          {!list.trim() && (
            <div className="max-w-40">
              <NumberInput label={t("teacherVocab.deck.wordCount")} value={String(count)} min={5} max={60} onChange={(v) => setCount(Number(v) || 15)} />
            </div>
          )}
          <ToggleRow icon={<Sparkles className="size-5" />} title={t("teacherVocab.deck.aiEnrichTitle")} desc={t("teacherVocab.deck.aiEnrichDescription")} checked={enrich} onChange={setEnrich} />
        </>
      ) : (
        <>
          <Select
            label={t("teacherVocab.deck.set")}
            options={[{ value: "", label: sets.length ? t("teacherVocab.deck.chooseSet") : t("teacherVocab.deck.noSets") }, ...sets.map((s) => ({ value: s.id, label: `${s.name} (${s.wordCount})` }))]}
            value={setId}
            onChange={chooseSet}
          />
          {setId && items.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => chooseSet(setId)}
                  className={cn("rounded-lg border px-3 py-1.5 font-semibold", wholeSet ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300")}
                >
                  {t("teacherVocab.deck.wholeSet", { n: items.length })}
                </button>
                <span className="text-xs text-slate-400">{t("teacherVocab.deck.orChooseWords")}</span>
              </div>
              <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                {items.map((it) => {
                  const on = picked.has(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleWord(it.id)}
                      title={it.meaning ?? undefined}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition",
                        on ? "border-cyan-500 bg-cyan-50 font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" : "border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-300",
                      )}
                    >
                      {on && <Check className="size-3" />} {it.word}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      <ActivityChips value={deck.activities} onChange={(activities) => patch({ activities })} />
      <ToggleRow
        icon={<Mic className="size-5" />}
        title={t("teacherVocab.deck.pronunciationTitle")}
        desc={t("teacherVocab.deck.pronunciationDescription")}
        checked={deck.pronounce === "on" || deck.pronounce === "optional"}
        onChange={(v) => patch({ pronounce: v ? "optional" : "off" })}
      />
    </div>
  );
});
