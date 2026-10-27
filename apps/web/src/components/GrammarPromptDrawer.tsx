// Two-step drawer that drafts a whole grammar point with an external AI chat:
// 1) describe the point and copy the prompt, 2) paste the JSON back, check it and save.
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, Braces, Check, CheckCircle2, ChevronDown, ClipboardCopy, ClipboardPaste, ExternalLink, Plus, Sparkles, Wand2 } from "lucide-react";
import { CEFR_BANDS, type Cefr, type Grammar } from "@msyen/shared";
import { grammarApi } from "../lib/api";
import { copyText, copyTextSync, readText } from "../lib/clipboard";
import { grammarPointPrompt, parseGrammarPoint } from "../lib/grammarPointPrompt";
import { cn } from "../lib/utils";
import { t } from "../i18n";
import { Button, Drawer, Popover, PopoverItem, Select, Textarea, Toggle, ToggleRow } from "./ui";
import { JsonEditor } from "./JsonEditor";
import GrammarDetail from "./GrammarDetail";

const CHAT_APPS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
];

const smallBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

export default function GrammarPromptDrawer({
  open,
  onClose,
  points,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  points: Grammar[];
  onSaved: (id: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [brief, setBrief] = useState("");
  const [cefr, setCefr] = useState<Cefr | "">("");
  const [category, setCategory] = useState("");
  const [enhanced, setEnhanced] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [json, setJson] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setJson("");
    setOverwrite(false);
  }, [open]);

  const categories = useMemo(() => [...new Set(points.map((p) => p.category))].sort(), [points]);
  const prompt = grammarPointPrompt({ brief, cefr, category, enhanced, existing: points });
  const parsed = useMemo(() => (json.trim() ? parseGrammarPoint(json) : null), [json]);
  const point = parsed?.ok ? parsed.point : null;
  const clash = point ? points.find((p) => p.id === point.id) : undefined;
  useEffect(() => setOverwrite(false), [point?.id]);

  const copyPrompt = async (openUrl?: string) => {
    // Copy synchronously first: the new tab takes focus, and both steps need the click's user activation.
    let ok = openUrl ? copyTextSync(prompt) : false;
    if (openUrl) window.open(openUrl, "_blank", "noopener");
    if (!ok) ok = await copyText(prompt);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(openUrl ? t("teacherGrammar.promptDrawer.copiedOpen") : t("teacherGrammar.toast.promptCopied"));
    } else {
      setShowPrompt(true);
      toast.error(t("teacherGrammar.toast.copyFailed"));
    }
  };

  const pasteJson = async () => {
    const text = await readText();
    if (text) setJson(text);
    else toast.error(t("teacherGrammar.promptDrawer.pasteFailed"));
  };

  const save = useMutation({
    mutationFn: () => grammarApi.save({ ...point!, position: clash?.position ?? points.length + 1 }),
    onSuccess: (r) => {
      toast.success(t("teacherGrammar.promptDrawer.saved", { title: point!.title }));
      setBrief("");
      onSaved(r.id);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const footer =
    step === 1 ? (
      <div className="flex justify-end">
        <Button onClick={() => setStep(2)}>
          {t("teacherGrammar.promptDrawer.next")} <ArrowRight className="size-4" />
        </Button>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep(1)}>
          <ArrowLeft className="size-4" /> {t("teacherGrammar.promptDrawer.back")}
        </Button>
        <Button disabled={!point || (!!clash && !overwrite) || save.isPending} onClick={() => save.mutate()}>
          <Plus className="size-4" /> {t("teacherGrammar.promptDrawer.save")}
        </Button>
      </div>
    );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      widthClassName="max-w-2xl"
      icon={<Wand2 className="size-5" />}
      title={t("teacherGrammar.promptDrawer.title")}
      description={t("teacherGrammar.promptDrawer.description")}
      footer={footer}
    >
      <div className="mb-5 grid grid-cols-2 gap-2">
        {([1, 2] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStep(n)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
              step === n
                ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
            )}
          >
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", step === n ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>
              {n === 2 && point ? <Check className="size-3.5" /> : n}
            </span>
            {n === 1 ? t("teacherGrammar.promptDrawer.stepDescribe") : t("teacherGrammar.promptDrawer.stepImport")}
          </button>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{t("teacherGrammar.promptDrawer.brief")}</label>
            <Textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={t("teacherGrammar.promptDrawer.briefPlaceholder")} autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("teacherGrammar.promptDrawer.cefr")}
              options={[{ value: "", label: t("teacherGrammar.promptDrawer.auto") }, ...CEFR_BANDS.map((b) => ({ value: b, label: b }))]}
              value={cefr}
              onChange={(v) => setCefr(v as Cefr | "")}
            />
            <Select
              label={t("teacherGrammar.promptDrawer.category")}
              options={[{ value: "", label: t("teacherGrammar.promptDrawer.auto") }, ...categories.map((c) => ({ value: c, label: c }))]}
              value={category}
              onChange={setCategory}
              menuMaxHeight={360}
            />
          </div>
          <ToggleRow
            icon={<Sparkles className="size-5" />}
            title={t("teacherGrammar.promptDrawer.enhanced")}
            desc={t("teacherGrammar.promptDrawer.enhancedHint")}
            checked={enhanced}
            onChange={setEnhanced}
          />

          <div className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/40 p-3 dark:border-cyan-500/30 dark:bg-cyan-500/5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-slate-500">{t("teacherGrammar.promptDrawer.copyHint")}</p>
              <button type="button" className={smallBtn} onClick={() => setShowPrompt((s) => !s)}>
                <Braces className="size-3.5" /> {showPrompt ? t("teacherGrammar.promptDrawer.hidePrompt") : t("teacherGrammar.promptDrawer.showPrompt")}
              </button>
              <Popover
                align="right"
                panelClassName="w-56 rounded-xl p-1.5"
                triggerClassName={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-500 px-3 text-sm font-medium text-white shadow-md shadow-cyan-500/25 transition hover:bg-cyan-600",
                  !brief.trim() && "pointer-events-none opacity-50",
                )}
                trigger={
                  <>
                    {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                    {copied ? t("teacherGrammar.promptDrawer.copied") : t("teacherGrammar.promptDrawer.copy")}
                    <ChevronDown className="size-4" />
                  </>
                }
              >
                {(close) => (
                  <>
                    <PopoverItem
                      onClick={() => {
                        close();
                        void copyPrompt();
                      }}
                    >
                      <ClipboardCopy className="size-4 text-slate-400" /> {t("teacherGrammar.promptDrawer.copyOnly")}
                    </PopoverItem>
                    {CHAT_APPS.map((a) => (
                      <PopoverItem
                        key={a.name}
                        onClick={() => {
                          close();
                          void copyPrompt(a.url);
                        }}
                      >
                        <ExternalLink className="size-4 text-slate-400" /> {t("teacherGrammar.promptDrawer.copyOpen", { app: a.name })}
                      </PopoverItem>
                    ))}
                  </>
                )}
              </Popover>
            </div>
            {showPrompt && <Textarea readOnly rows={12} value={prompt} className="font-mono text-xs" />}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <Braces className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("teacherGrammar.promptDrawer.importTitle")}</p>
              <p className="text-xs text-slate-500">{t("teacherGrammar.promptDrawer.importHint")}</p>
            </div>
            <button type="button" className={smallBtn} onClick={pasteJson}>
              <ClipboardPaste className="size-3.5" /> {t("teacherGrammar.promptDrawer.paste")}
            </button>
          </div>
          <JsonEditor value={json} onChange={setJson} placeholder={t("teacherGrammar.promptDrawer.jsonPlaceholder")} ariaLabel="JSON" className="h-[280px]" />

          {parsed && !parsed.ok && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" /> {t("teacherGrammar.promptDrawer.invalid")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono text-xs">
                {parsed.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {point && (
            <>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> {t("teacherGrammar.promptDrawer.valid")}
              </p>
              {clash && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  <span className="min-w-0 flex-1">{t("teacherGrammar.promptDrawer.exists", { id: clash.id, title: clash.title })}</span>
                  <label className="flex items-center gap-2 font-semibold">
                    {t("teacherGrammar.promptDrawer.overwrite")} <Toggle checked={overwrite} onChange={setOverwrite} aria-label={t("teacherGrammar.promptDrawer.overwrite")} />
                  </label>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{point.title}</h3>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{point.cefr}</span>
                  <span className="text-xs text-slate-500">{point.category}</span>
                  <code className="ml-auto text-[11px] text-slate-400">{point.id}</code>
                </div>
                <p className="mb-3 rounded-xl bg-cyan-50/70 px-3 py-2 text-sm text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-100">{point.summary}</p>
                <GrammarDetail g={point as Grammar} />
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
