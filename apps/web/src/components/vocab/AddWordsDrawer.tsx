// "Add words" drawer of the teacher vocabulary page: (1) the target set, (2) the input method —
// paste a word list, let the built-in AI pick words for a topic, round-trip through an external
// AI chat (copy prompt → paste JSON back), or type one entry by hand. Jobs that call the AI switch
// the drawer to a live progress view.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Braces,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  FileUp,
  FolderPlus,
  ListPlus,
  RefreshCw,
  Loader2,
  MessagesSquare,
  PenLine,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Undo2,
  Wand2,
} from "lucide-react";
import type { VocabItemInput } from "@msyen/shared";
import type { TeacherVocabSet } from "../../lib/api";
import { copyText, readText } from "../../lib/clipboard";
import { aiApi } from "../../lib/api";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";
import { Button, Checkbox, Drawer, Input, Select, Textarea, ToggleRow } from "../ui";
import { NumberInput } from "../NumberInput";
import { EntryFields } from "./EntryFields";
import { SettingRow, SettingRows, TabButtons } from "./parts";
import { JobProgress, type AiJob } from "./aiJob";
import { entryQuality, externalPrompt, parseVocabJson, SAMPLE_JSON } from "./vocabEntry";

type Method = "paste" | "topic" | "chat" | "manual";
type Form = "word" | "phrase" | "both";

const MAX_PASTE = 300;
const MAX_TOPIC = 200;

const METHODS: { id: Method; label: TKey; hint: TKey; icon: typeof ListPlus }[] = [
  { id: "paste", label: "teacherVocab.add.method.paste", hint: "teacherVocab.add.method.pasteHint", icon: ListPlus },
  { id: "topic", label: "teacherVocab.add.method.topic", hint: "teacherVocab.add.method.topicHint", icon: Wand2 },
  { id: "chat", label: "teacherVocab.add.method.chat", hint: "teacherVocab.add.method.chatHint", icon: MessagesSquare },
  { id: "manual", label: "teacherVocab.add.method.manual", hint: "teacherVocab.add.method.manualHint", icon: PenLine },
];

const wordKey = (w: string) => w.trim().toLowerCase().replace(/\s+/g, " ");
const clampCount = (s: string, max: number) => Math.max(1, Math.min(max, Math.round(Number(s) || 0)));

export function AddWordsDrawer({
  open,
  onClose,
  sets,
  defaultSetId,
  existingWords,
  job,
  onCancelJob,
  onRetryJob,
  onPaste,
  onSuggest,
  onImport,
  onManual,
  onFillDraft,
  onCreateSet,
}: {
  open: boolean;
  onClose: () => void;
  sets: TeacherVocabSet[];
  defaultSetId: string;
  existingWords: (setId: string) => string[];
  job: AiJob | null;
  onCancelJob: () => void;
  onRetryJob?: () => void;
  /** Adds bare words; `fill` starts an AI job that completes them. */
  onPaste: (words: string[], setId: string, opts: { fill: boolean; instruction: string }) => void;
  /** Starts an AI job that picks `count` new words for the description. */
  onSuggest: (body: { prompt: string; count: number; form: Form }, setId: string) => void;
  /** Merges parsed entries; `filling` = an AI job was started for the missing fields. */
  onImport: (items: VocabItemInput[], setId: string, opts: { overwrite: boolean; fillMissing: boolean }) => { added: number; merged: number; filling: boolean };
  /** Returns false when the word is already in the set. */
  onManual: (item: VocabItemInput, setId: string) => boolean;
  /** AI completes a draft entry without adding it. */
  onFillDraft: (item: VocabItemInput, setId: string) => Promise<VocabItemInput | null>;
  /** Creates an empty set and returns its id (null on failure). */
  onCreateSet: (name: string) => Promise<string | null>;
}) {
  const [setId, setSetId] = useState(defaultSetId);
  const [method, setMethod] = useState<Method>("paste");
  const [showJob, setShowJob] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSetId(defaultSetId);
    setCreating(false);
    setShowJob(!!job?.running);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const target = sets.find((s) => s.id === setId);

  // ── Inline "new set" ──
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingSet, setSavingSet] = useState(false);
  const startCreate = () => {
    setNewName(t("teacherVocab.defaultSetName", { n: sets.length + 1 }));
    setCreating(true);
  };
  const createSet = async () => {
    setSavingSet(true);
    const id = await onCreateSet(newName.trim());
    setSavingSet(false);
    if (id) {
      setSetId(id);
      setCreating(false);
    }
  };
  const level = target?.levelName ?? null;
  // Recomputed every render: words land in the set while the drawer stays open.
  const known = new Set(existingWords(setId).map(wordKey));
  const jobRunning = !!job?.running;

  // ── Paste ──
  const [paste, setPaste] = useState("");
  const [pasteFill, setPasteFill] = useState(true);
  const [pasteNote, setPasteNote] = useState("");
  const pasted = useMemo(() => {
    const seen = new Set<string>();
    const fresh: string[] = [];
    const existing: string[] = [];
    let dup = 0;
    for (const raw of paste.split(/\r?\n|,|;|\t/)) {
      // Drop list markers ("1.", "-", "•") that come with copied lists.
      const w = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
      if (!w) continue;
      const k = wordKey(w);
      if (seen.has(k)) {
        dup++;
        continue;
      }
      seen.add(k);
      (known.has(k) ? existing : fresh).push(w);
    }
    return { fresh, existing, dup };
  }, [paste, known]);

  // ── Built-in AI topic ──
  const [topic, setTopic] = useState("");
  const [topicCount, setTopicCount] = useState("20");
  const [topicForm, setTopicForm] = useState<Form>("word");

  // ── External AI chat ──
  const [chatSource, setChatSource] = useState<"topic" | "list">("topic");
  const [chatText, setChatText] = useState("");
  const [chatCount, setChatCount] = useState("20");
  const [chatForm, setChatForm] = useState<Form>("word");
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const prompt = externalPrompt({
    topic: chatText.trim(),
    level,
    count: chatSource === "topic" ? clampCount(chatCount, MAX_TOPIC) : null,
    form: chatForm,
    exclude: chatSource === "topic" ? existingWords(setId) : [],
  });
  const copyPrompt = async () => {
    if (await copyText(prompt)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t("teacherVocab.toast.promptCopied"));
    } else {
      setShowPrompt(true);
      toast.error(t("teacherVocab.add.chat.copyFailed"));
    }
  };

  const [json, setJson] = useState("");
  const preview = useMemo(() => (json.trim() ? parseVocabJson(json) : null), [json]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  useEffect(() => setPicked(new Set(preview?.items.map((_, i) => i) ?? [])), [preview]);
  const [overwrite, setOverwrite] = useState(false);
  const [fillMissing, setFillMissing] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickedItems = preview?.items.filter((_, i) => picked.has(i)) ?? [];
  const pickedMissing = pickedItems.filter((it) => entryQuality(it).missing.length).length;
  const pasteJson = async () => {
    const text = await readText();
    if (text) setJson(text);
    else toast.error(t("teacherVocab.add.chat.pasteFailed"));
  };

  // ── By hand ──
  const [draft, setDraft] = useState<VocabItemInput>({ word: "" });
  const [drafting, setDrafting] = useState(false);
  const [addedNow, setAddedNow] = useState<string[]>([]);
  const draftExists = !!draft.word.trim() && known.has(wordKey(draft.word));

  // ── Submit ──
  const submit = async () => {
    if (!target) return;
    if (method === "paste") {
      onPaste(pasted.fresh, setId, { fill: pasteFill, instruction: pasteNote.trim() });
      setPaste("");
      if (pasteFill) setShowJob(true);
      else toast.success(t("teacherVocab.toast.wordsAdded", { n: pasted.fresh.length }));
    } else if (method === "topic") {
      onSuggest({ prompt: topic.trim(), count: clampCount(topicCount, MAX_TOPIC), form: topicForm }, setId);
      setShowJob(true);
    } else if (method === "chat") {
      const r = onImport(pickedItems, setId, { overwrite, fillMissing: fillMissing && pickedMissing > 0 });
      toast.success(t("teacherVocab.toast.imported", { added: r.added, merged: r.merged }));
      setJson("");
      if (r.filling) setShowJob(true);
    } else if (method === "manual") {
      const word = draft.word.trim();
      if (onManual({ ...draft, word }, setId)) {
        setAddedNow((a) => [word, ...a]);
        setDraft({ word: "" });
      }
    }
  };

  const canSubmit =
    !!target &&
    (method === "paste"
      ? pasted.fresh.length > 0 && pasted.fresh.length <= MAX_PASTE && !(pasteFill && jobRunning)
      : method === "topic"
        ? topic.trim().length >= 2 && !jobRunning
        : method === "chat"
          ? !!preview && !preview.error && pickedItems.length > 0 && !(fillMissing && pickedMissing > 0 && jobRunning)
          : !!draft.word.trim() && !draftExists);

  const submitLabel =
    method === "paste"
      ? pasteFill
        ? t("teacherVocab.add.paste.submitFill", { n: pasted.fresh.length })
        : t("teacherVocab.add.paste.submit", { n: pasted.fresh.length })
      : method === "topic"
        ? t("teacherVocab.add.topic.submit", { n: clampCount(topicCount, MAX_TOPIC) })
        : method === "chat"
          ? t("teacherVocab.add.chat.submit", { n: pickedItems.length })
          : t("teacherVocab.add.manual.submit");

  const methodInfo = METHODS.find((m) => m.id === method)!;
  const inJobView = showJob && !!job;

  const footer = inJobView ? (
    <div className="flex flex-wrap items-center gap-2">
      {job!.running ? (
        <>
          <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10" onClick={onCancelJob}>
            <Square className="size-4" /> {t("teacherVocab.job.stop")}
          </Button>
          <Button className="ml-auto" variant="secondary" onClick={onClose}>
            {t("teacherVocab.job.background")}
          </Button>
        </>
      ) : (
        <>
          {onRetryJob && job!.items.some((i) => i.status === "error") && (
            <Button variant="secondary" onClick={onRetryJob}>
              <RotateCcw className="size-4" /> {t("teacherVocab.job.retryFailed")}
            </Button>
          )}
          <Button variant="ghost" className="ml-auto" onClick={() => setShowJob(false)}>
            <Plus className="size-4" /> {t("teacherVocab.add.addMore")}
          </Button>
          <Button onClick={onClose}>{t("teacherVocab.action.done")}</Button>
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {method === "manual" && (
        <Button
          variant="secondary"
          disabled={!draft.word.trim() || drafting || !target}
          onClick={async () => {
            setDrafting(true);
            const filled = await onFillDraft({ ...draft, word: draft.word.trim() }, setId);
            if (filled) setDraft((d) => ({ ...filled, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length))), word: d.word }));
            setDrafting(false);
          }}
        >
          {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("teacherVocab.add.manual.aiFill")}
        </Button>
      )}
      <Button className="flex-1" disabled={!canSubmit} onClick={submit}>
        {method === "manual" ? <Plus className="size-4" /> : method === "chat" ? <Check className="size-4" /> : <Sparkles className="size-4" />} {submitLabel}
      </Button>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      widthClassName="max-w-2xl"
      icon={<ListPlus className="size-5" />}
      title={t("teacherVocab.add.title")}
      description={inJobView ? job!.title : t("teacherVocab.add.description")}
      footer={footer}
    >
      {inJobView ? (
        <JobProgress job={job!} />
      ) : (
        <div className="space-y-5">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t("teacherVocab.add.targetSet")}
                options={sets.map((s) => ({ value: s.id, label: `${s.name} (${t("teacherVocab.set.wordCount", { n: s.wordCount })})` }))}
                value={setId}
                onChange={setSetId}
                placeholder={t("teacherVocab.deck.chooseSet")}
                menuFooter={(close) => (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      startCreate();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                  >
                    <FolderPlus className="size-4" /> {t("teacherVocab.action.newSet")}
                  </button>
                )}
              />
              <Select
                label={t("teacherVocab.add.methodTitle")}
                options={METHODS.map((m) => ({ value: m.id, label: t(m.label), icon: <m.icon className="size-4" /> }))}
                value={method}
                onChange={(v) => setMethod(v as Method)}
              />
            </div>
            {creating ? (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 dark:border-cyan-500/30 dark:bg-cyan-500/5">
                <div className="min-w-48 flex-1">
                  <Input
                    label={t("teacherVocab.add.newSetName")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && newName.trim() && createSet()}
                    autoFocus
                  />
                </div>
                <Button disabled={!newName.trim() || savingSet} onClick={createSet}>
                  {savingSet ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />} {t("teacherVocab.action.createSet")}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {t(methodInfo.hint)} {level ? t("teacherVocab.ai.levelHint", { level }) : t("teacherVocab.ai.noLevelHint")}{" "}
                <button type="button" onClick={startCreate} className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300">
                  {t("teacherVocab.add.createSetLink")}
                </button>
              </p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
            {method === "paste" && (
              <div className="space-y-3">
                <Textarea label={t("teacherVocab.add.paste.label")} rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t("teacherVocab.paste.placeholder")} />
                {paste.trim() && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Stat tone="cyan">{t("teacherVocab.add.paste.new", { n: pasted.fresh.length })}</Stat>
                      {pasted.existing.length > 0 && <Stat tone="slate">{t("teacherVocab.add.paste.existing", { n: pasted.existing.length })}</Stat>}
                      {pasted.dup > 0 && <Stat tone="slate">{t("teacherVocab.add.paste.dup", { n: pasted.dup })}</Stat>}
                      {pasted.fresh.length > MAX_PASTE && <Stat tone="rose">{t("teacherVocab.add.paste.tooMany", { max: MAX_PASTE })}</Stat>}
                    </div>
                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      {pasted.fresh.slice(0, 80).map((w) => (
                        <span key={w} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {w}
                        </span>
                      ))}
                      {pasted.existing.slice(0, 40).map((w) => (
                        <span key={w} className="rounded-md px-2 py-0.5 text-xs text-slate-400 line-through" title={t("teacherVocab.add.paste.existingTitle")}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <ToggleRow icon={<Sparkles className="size-5" />} title={t("teacherVocab.add.paste.fillToggle")} desc={t("teacherVocab.paste.description")} checked={pasteFill} onChange={setPasteFill} />
                {pasteFill && <Input label={t("teacherVocab.add.noteLabel")} value={pasteNote} onChange={(e) => setPasteNote(e.target.value.slice(0, 500))} placeholder={t("teacherVocab.add.notePlaceholder")} />}
              </div>
            )}

            {method === "topic" && (
              <div className="space-y-3">
                <PromptField
                  value={topic}
                  onChange={setTopic}
                  context={enhanceContext(level, topicCount, topicForm)}
                  hint={`${t("teacherVocab.ai.noDuplicates")} ${t("teacherVocab.add.topic.batchHint")}`}
                />
                <SettingRows>
                  <CountRow value={topicCount} onChange={setTopicCount} />
                  <FormRow value={topicForm} onChange={setTopicForm} />
                </SettingRows>
              </div>
            )}

            {method === "chat" && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <SettingRows>
                    <SettingRow label={t("teacherVocab.add.chat.source")}>
                      <TabButtons
                        value={chatSource}
                        onChange={setChatSource}
                        options={[
                          { value: "topic", label: t("teacherVocab.add.chat.byTopic") },
                          { value: "list", label: t("teacherVocab.add.chat.byList") },
                        ]}
                      />
                    </SettingRow>
                    {chatSource === "topic" && (
                      <>
                        <CountRow value={chatCount} onChange={setChatCount} />
                        <FormRow value={chatForm} onChange={setChatForm} />
                      </>
                    )}
                  </SettingRows>
                  {chatSource === "topic" ? (
                    <PromptField value={chatText} onChange={setChatText} context={enhanceContext(level, chatCount, chatForm)} />
                  ) : (
                    <Textarea label={t("teacherVocab.add.paste.label")} rows={4} value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder={t("teacherVocab.paste.placeholder")} />
                  )}
                  <Button className="w-full" variant="outline" disabled={!chatText.trim()} onClick={copyPrompt}>
                    {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {copied ? t("teacherVocab.add.chat.copied") : t("teacherVocab.action.copyPrompt")}
                  </Button>
                  <p className="text-xs text-slate-500">{t("teacherVocab.add.chat.step2Hint")}</p>
                  <ToggleRow icon={<Braces className="size-5" />} title={t("teacherVocab.add.chat.showPrompt")} desc={t("teacherVocab.add.chat.showPromptHint")} checked={showPrompt} onChange={setShowPrompt} />
                  {showPrompt && <Textarea readOnly rows={10} value={prompt} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />}
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-auto text-sm font-medium text-slate-700 dark:text-slate-300">{t("teacherVocab.add.chat.step3")}</span>
                    <Button size="sm" variant="ghost" onClick={pasteJson}>
                      <ClipboardPaste className="size-4" /> {t("teacherVocab.add.chat.pasteClipboard")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                      <FileUp className="size-4" /> {t("teacherVocab.add.chat.pickFile")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setJson(SAMPLE_JSON)}>
                      <Braces className="size-4" /> {t("teacherVocab.add.chat.sample")}
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".json,application/json,text/plain"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) setJson(await f.text());
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <Textarea rows={6} value={json} onChange={(e) => setJson(e.target.value)} className="font-mono text-xs" placeholder={t("teacherVocab.json.placeholder")} />
                  {preview?.error && (
                    <p className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {preview.error}
                    </p>
                  )}
                  {preview && !preview.error && (
                    <>
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                          <Checkbox
                            checked={picked.size === preview.items.length && picked.size > 0}
                            indeterminate={picked.size > 0 && picked.size < preview.items.length}
                            onChange={(on) => setPicked(new Set(on ? preview.items.map((_, i) => i) : []))}
                            aria-label={t("teacherVocab.add.chat.pickAll")}
                          />
                          <span>{t("teacherVocab.add.chat.parsed", { picked: picked.size, total: preview.items.length })}</span>
                          {preview.skipped > 0 && <span className="text-amber-600">· {t("teacherVocab.json.skippedNoWord", { n: preview.skipped })}</span>}
                        </div>
                        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                          {preview.items.map((it, i) => {
                            const exists = known.has(wordKey(it.word));
                            const missing = entryQuality(it).missing.length;
                            return (
                              <li key={i} className="flex items-center gap-3 px-3 py-2">
                                <Checkbox
                                  checked={picked.has(i)}
                                  onChange={(on) =>
                                    setPicked((p) => {
                                      const n = new Set(p);
                                      if (on) n.add(i);
                                      else n.delete(i);
                                      return n;
                                    })
                                  }
                                  aria-label={it.word}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {it.word} {it.pos && <span className="text-xs font-normal text-slate-400">({it.pos})</span>}
                                  </span>
                                  <span className="block truncate text-xs text-slate-500">{it.meaning || "—"}</span>
                                </span>
                                {missing > 0 && <span className="shrink-0 text-xs font-semibold text-amber-600">{t("teacherVocab.row.missingCount", { n: missing })}</span>}
                                <Stat tone={exists ? "slate" : "cyan"}>{exists ? t("teacherVocab.add.chat.existsBadge") : t("teacherVocab.add.chat.newBadge")}</Stat>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <ToggleRow icon={<RefreshCw className="size-5" />} tone="amber" title={t("teacherVocab.form.overwriteExisting")} desc={t("teacherVocab.add.chat.overwriteHint")} checked={overwrite} onChange={setOverwrite} />
                      {pickedMissing > 0 && (
                        <ToggleRow icon={<Sparkles className="size-5" />} title={t("teacherVocab.add.chat.fillMissing", { n: pickedMissing })} desc={t("teacherVocab.paste.description")} checked={fillMissing} onChange={setFillMissing} />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {method === "manual" && (
              <div className="space-y-3">
                <EntryFields row={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} autoFocus />
                {draftExists && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                    <AlertTriangle className="size-3.5" /> {t("teacherVocab.toast.wordExists", { word: draft.word.trim() })}
                  </p>
                )}
                {addedNow.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="font-semibold text-slate-500">{t("teacherVocab.add.manual.added")}</span>
                    {addedNow.map((w) => (
                      <span key={w} className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ tone, children }: { tone: "cyan" | "slate" | "rose"; children: React.ReactNode }) {
  const tones = {
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  };
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

const FORM_TEXT: Record<Form, string> = { word: "single words", phrase: "phrases / collocations / phrasal verbs", both: "a mix of words and phrases" };

/** Already-chosen settings the Enhance step must not restate. */
const enhanceContext = (level: string | null, count: string, form: Form) =>
  [`Level: ${level ?? "not set"}`, `Entries: ${clampCount(count, MAX_TOPIC)}`, `Form: ${FORM_TEXT[form]}`, "Learners: Vietnamese"].join("\n");

/** Topic description with an Enhance action: the AI rewrites the notes into clear English word-selection instructions. */
function PromptField({ value, onChange, context, hint }: { value: string; onChange: (v: string) => void; context: string; hint?: string }) {
  const [refining, setRefining] = useState(false);
  const [before, setBefore] = useState<string | null>(null);
  const enhance = async () => {
    setRefining(true);
    try {
      const r = await aiApi.refineVocabPrompt(value.trim(), context);
      if (r.prompt?.trim()) {
        setBefore(value);
        onChange(r.prompt.trim().slice(0, 1000));
        toast.success(t("teacherVocab.add.enhance.done"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherVocab.add.enhance.failed"));
    } finally {
      setRefining(false);
    }
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="mr-auto text-sm font-medium text-slate-700 dark:text-slate-300">{t("teacherVocab.add.topic.label")}</span>
        {before != null && (
          <button
            type="button"
            onClick={() => {
              onChange(before);
              setBefore(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Undo2 className="size-3.5" /> {t("teacherVocab.add.enhance.undo")}
          </button>
        )}
        <button
          type="button"
          onClick={enhance}
          disabled={refining || value.trim().length < 2}
          title={t("teacherVocab.add.enhance.tooltip")}
          className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-40"
        >
          {refining ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {refining ? t("teacherVocab.add.enhance.running") : "Enhance"}
        </button>
      </div>
      <Textarea
        rows={refining || before != null ? 7 : 4}
        value={value}
        onChange={(e) => {
          onChange(e.target.value.slice(0, 1000));
          setBefore(null);
        }}
        placeholder={t("teacherVocab.ai.promptPlaceholder")}
        hint={`${value.length}/1000${hint ? ` · ${hint}` : ""}`}
      />
    </div>
  );
}

function CountRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <SettingRow label={t("teacherVocab.deck.wordCount")} hint={t("teacherVocab.add.countHint", { max: MAX_TOPIC })}>
      <div className="w-36">
        <NumberInput value={value} onChange={onChange} min={1} max={MAX_TOPIC} step={5} />
      </div>
    </SettingRow>
  );
}

function FormRow({ value, onChange }: { value: Form; onChange: (v: Form) => void }) {
  return (
    <SettingRow label={t("teacherVocab.ai.formLabel")}>
      <TabButtons
        value={value}
        onChange={onChange}
        options={[
          { value: "word", label: t("teacherVocab.ai.formWord") },
          { value: "phrase", label: t("teacherVocab.ai.formPhrase") },
          { value: "both", label: t("teacherVocab.ai.formBoth") },
        ]}
      />
    </SettingRow>
  );
}
