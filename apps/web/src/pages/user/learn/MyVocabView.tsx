// "My words" tab of /u/vocabulary: the learner's own list.
//   Add: type words one per line → optional AI fill (meaning / IPA / example) → review → save.
//   List: search, practise, mark learned, edit, delete.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Play, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import type { VocabDeckConfig, VocabItem, VocabItemInput } from "@msyen/shared";
import { accountApi, type VocabWordState } from "../../../lib/api";
import { Button, Input, Textarea } from "../../../components/ui";
import { WordCard } from "../../../components/vocab/WordCard";
import { Masonry } from "../../../components/Masonry";
import { VocabDeckExercise } from "../../../components/practice/VocabDeckExercise";
import { useVocabSession } from "../../../components/practice/vocab/useVocabSession";
import { PracticeSetupModal, ResumeBanner } from "../../../components/practice/PracticeSetupModal";
import { confirmAsk } from "../../../components/confirm";
import { useDebounced } from "../../../lib/useDebounced";
import { t, type TKey } from "../../../i18n";

const FIELDS: { key: "pos" | "ipa" | "meaning" | "example"; labelKey: TKey }[] = [
  { key: "pos", labelKey: "userVideoProfile.myVocab.pos" },
  { key: "ipa", labelKey: "userVideoProfile.myVocab.ipa" },
  { key: "meaning", labelKey: "userVideoProfile.myVocab.meaning" },
  { key: "example", labelKey: "userVideoProfile.myVocab.example" },
];

export default function MyVocabView() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const { data, isLoading } = useQuery({ queryKey: ["my-vocab", dq], queryFn: () => accountApi.myVocab(dq || undefined) });
  const words = data?.words ?? [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<VocabWordState | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-vocab"] });
  const { session, start, resume, resumeSession, discardResume, deckHandlers } = useVocabSession({ scope: "my" });
  const startSession = async (items: VocabItem[], config: VocabDeckConfig) => {
    await start(items, config, { scope: "my", label: "My words" });
    setSetupOpen(false);
  };
  const setLearned = useMutation({
    mutationFn: ({ word, learned }: { word: string; learned: boolean }) => accountApi.vocabSetLearned(word, learned),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => accountApi.myVocabDelete(id),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : t("userVideoProfile.myVocab.deleteFailed")),
  });

  if (session) {
    return (
      <VocabDeckExercise
        items={session.items}
        config={session.config}
        title="My words"
        learnerName="My words"
        initialState={session.initialState}
        {...deckHandlers(refresh)}
      />
    );
  }

  return (
    <div>
      {resume && <ResumeBanner remaining={resume.remaining} onResume={resumeSession} onDiscard={discardResume} />}
      <PracticeSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} scope="my" label="My words" allowPronounce onStart={startSession} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-52 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search my words…" leftIcon={<Search className="size-4" />} />
        </div>
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add words
        </Button>
        <Button disabled={!words.length} onClick={() => setSetupOpen(true)}>
          <Play className="size-4" /> Practice
        </Button>
      </div>
      {data && <p className="mb-3 text-xs text-slate-400">{data.total} / {data.max.toLocaleString("en-US")} words</p>}

      {adding && <AddWords onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
      {editing && <EditWord w={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : !words.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <p className="font-semibold text-slate-600 dark:text-slate-300">{dq ? "No matching words" : "Your list is empty"}</p>
          <p className="mt-1 text-sm text-slate-500">{dq ? "Try another keyword." : "Add words here, or save them from a set in the Library."}</p>
        </div>
      ) : (
        <Masonry
          items={words}
          render={(w) => (
            <WordCard
              key={w.id}
              w={w}
              onToggleLearned={() => setLearned.mutate({ word: w.word, learned: !w.learned })}
              actions={
                <div className="flex shrink-0 gap-0.5">
                  <IconBtn label={t("common.edit")} onClick={() => setEditing(w)}><Pencil className="size-4" /></IconBtn>
                  <IconBtn
                    label={t("common.delete")}
                    onClick={async () => {
                      if (
                        await confirmAsk({
                          title: t("userVideoProfile.myVocab.deleteConfirmTitle", { word: w.word }),
                          message: t("userVideoProfile.myVocab.deleteConfirmMessage"),
                          confirmText: t("common.delete"),
                          danger: true,
                        })
                      )
                        remove.mutate(w.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              }
            />
          )}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {children}
    </button>
  );
}

/** Panel: type words (one per line) → AI fill → edit the rows → save. */
function AddWords({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<VocabItemInput[]>([]);
  const typed = text.split(/\r?\n|,/).map((w) => w.trim()).filter(Boolean);

  const fill = useMutation({
    mutationFn: () => accountApi.myVocabFill(typed),
    onSuccess: (r) => setRows(r.items),
    onError: (e) => toast.error(e instanceof Error ? e.message : t("userVideoProfile.myVocab.aiFillFailed")),
  });
  const save = useMutation({
    mutationFn: () => accountApi.myVocabAdd({ items: rows.length ? rows : typed.map((word) => ({ word })) }),
    onSuccess: (r) => {
      toast.success(
        r.skipped
          ? t("userVideoProfile.myVocab.wordsAddedWithSkipped", { added: r.added, skipped: r.skipped, n: r.added })
          : t("userVideoProfile.myVocab.wordsAdded", { n: r.added })
      );
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });
  const patchRow = (i: number, k: keyof VocabItemInput, v: string) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div className="mb-5 rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm dark:border-cyan-900 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold text-slate-800 dark:text-slate-100">Add words</p>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="text-slate-400 hover:text-slate-600"><X className="size-5" /></button>
      </div>
      {!rows.length ? (
        <>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("userVideoProfile.myVocab.addWordsPlaceholder")} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!typed.length || fill.isPending} onClick={() => fill.mutate()}>
              {fill.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("userVideoProfile.myVocab.aiFill", { n: typed.length })}
            </Button>
            <Button variant="secondary" disabled={!typed.length || save.isPending} onClick={() => save.mutate()}>
              {t("userVideoProfile.myVocab.saveWithoutAi")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
                <Input value={r.word} onChange={(e) => patchRow(i, "word", e.target.value)} placeholder={t("userVideoProfile.myVocab.wordPlaceholder")} />
                {FIELDS.map((f) => (
                  <Input key={f.key} value={(r[f.key] as string | null | undefined) ?? ""} onChange={(e) => patchRow(i, f.key, e.target.value)} placeholder={t(f.labelKey)} />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} {t("userVideoProfile.myVocab.saveWords", { n: rows.length })}
            </Button>
            <Button variant="secondary" onClick={() => setRows([])}>{t("common.back")}</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Inline editor for one own word. */
function EditWord({ w, onClose, onSaved }: { w: VocabWordState; onClose: () => void; onSaved: () => void }) {
  const [row, setRow] = useState<VocabItemInput>({ word: w.word, pos: w.pos, ipa: w.ipa, meaning: w.meaning, example: w.example, synonyms: w.synonyms });
  const save = useMutation({
    mutationFn: () => accountApi.myVocabUpdate(w.id, row),
    onSuccess: onSaved,
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });
  return (
    <div className="mb-5 rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm dark:border-cyan-900 dark:bg-slate-900">
      <p className="mb-3 font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.myVocab.editWordTitle", { word: w.word })}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input value={row.word} onChange={(e) => setRow({ ...row, word: e.target.value })} placeholder={t("userVideoProfile.myVocab.wordPlaceholder")} />
        {FIELDS.map((f) => (
          <Input key={f.key} value={(row[f.key] as string | null | undefined) ?? ""} onChange={(e) => setRow({ ...row, [f.key]: e.target.value })} placeholder={t(f.labelKey)} />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={!row.word.trim() || save.isPending} onClick={() => save.mutate()}>{t("common.save")}</Button>
        <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}
