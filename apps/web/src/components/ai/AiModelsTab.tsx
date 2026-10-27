// "Model" tab of /teacher/ai: the models tasks can be routed to — add, edit, remove, test.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Keyboard,
  KeyRound,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import {
  aiGatewayApi,
  type AiBrowseModel,
  type AiConfig,
  type AiModelInfo,
  type AiModelInput,
  type AiModelTestResult,
  type AiProviderId,
} from "../../lib/api";
import { confirmAsk } from "../confirm";
import { Button, Card, CardContent, Drawer, Input, Select, Toggle } from "../ui";
import { cn } from "../../lib/utils";
import { NumberInput } from "../NumberInput";
import { copyText } from "../../lib/clipboard";
import { money, Pill, ProviderLogo, ProviderMark, ProviderSelect } from "./shared";
import { t } from "../../i18n";

const keyOf = (p: AiProviderId, id: string) => `${p}/${id}`;

export function AiModelsTab({ cfg, onGoKeys }: { cfg: AiConfig; onGoKeys: () => void }) {
  const qc = useQueryClient();
  const [tests, setTests] = useState<Record<string, AiModelTestResult | "running">>({});
  const [editor, setEditor] = useState<{ provider: AiProviderId; model?: AiModelInfo } | null>(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-config"] });

  /** How many tasks route to each model (the default counts as "all the rest"). */
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of Object.values(cfg.routes)) m.set(keyOf(r.provider, r.model), (m.get(keyOf(r.provider, r.model)) ?? 0) + 1);
    return m;
  }, [cfg.routes]);
  const isDefault = (m: AiModelInfo) => cfg.default.provider === m.provider && cfg.default.model === m.id;

  const runTest = async (m: AiModelInfo) => {
    const k = keyOf(m.provider, m.id);
    setTests((t) => ({ ...t, [k]: "running" }));
    try {
      const res = await aiGatewayApi.testModel(m.provider, m.id);
      setTests((t) => ({ ...t, [k]: res }));
    } catch (e) {
      setTests((t) => ({ ...t, [k]: { ok: false, latencyMs: 0, error: (e as Error).message } }));
    }
  };

  const remove = useMutation({
    mutationFn: (m: AiModelInfo) => aiGatewayApi.removeModel(m.provider, m.id),
    onSuccess: () => {
      toast.success(t("teacherAi.models.deleted"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: aiGatewayApi.restoreModels,
    onSuccess: (r) => {
      toast.success(r.added ? t("teacherAi.models.restoredCount", { n: r.added }) : t("teacherAi.models.restoredNone"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needle = q.trim().toLowerCase();
  const groups = cfg.providers.filter((p) => !only || p.id === only).map((p) => ({
    provider: p,
    models: cfg.catalog.filter(
      (m) => m.provider === p.id && (!needle || m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle)),
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder={t("teacherAi.models.search")} leftIcon={<Search className="size-4" />} />
        </div>
        <Select
          fullWidth={false}
          className="min-w-52 flex-1 sm:flex-none"
          menuClassName="w-72"
          value={only}
          onChange={setOnly}
          options={[
            { value: "", label: t("teacherAi.models.allProvidersShort") },
            ...cfg.providers.map((p) => ({ value: p.id, label: p.label, icon: <ProviderLogo id={p.id} />, hint: p.keyCount ? undefined : t("teacherAi.provider.noKey") })),
          ]}
        />
        <Button
          variant="neutral"
          disabled={restore.isPending}
          onClick={async () => {
            if (await confirmAsk({
              title: t("teacherAi.models.restoreTitle"),
              message: t("teacherAi.models.restoreMessage"),
              confirmText: t("teacherAi.models.restore"),
            })) restore.mutate();
          }}
        >
          <RotateCcw className="size-4" /> {t("teacherAi.models.default")}
        </Button>
        <Button onClick={() => setEditor({ provider: cfg.providers.find((p) => p.keyCount > 0)?.id ?? "google" })}>
          <Plus className="size-4" /> {t("teacherAi.models.add")}
        </Button>
      </div>

      {groups.map(({ provider: p, models }) =>
        needle && !models.length ? null : (
          <Card key={p.id}>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <ProviderMark id={p.id} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-900 dark:text-white">{p.label}</h2>
                  <p className="text-xs text-slate-500">
                    {t("teacherAi.models.count", { n: models.length })} ·{" "}
                    {p.keyCount > 0 ? (
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("teacherAi.models.keysReady", { n: p.keyCount })}</span>
                    ) : (
                      <button type="button" onClick={onGoKeys} className="font-semibold text-amber-600 hover:underline dark:text-amber-400">
                        {t("teacherAi.models.noKeyAdd")}
                      </button>
                    )}
                  </p>
                </div>
                {p.keyCount > 0 && models.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => models.forEach(runTest)}>
                    <Zap className="size-4" /> {t("teacherAi.models.testAll")}
                  </Button>
                )}
                {p.keyCount > 0 ? (
                  <button type="button" onClick={() => setEditor({ provider: p.id })} className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
                    <Plus className="size-4" /> {t("common.add")}
                  </button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setEditor({ provider: p.id })}>
                    <Plus className="size-4" /> {t("common.add")}
                  </Button>
                )}
              </div>

              {models.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-400">{t("teacherAi.models.none", { provider: p.label })}</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {models.map((m) => {
                    const k = keyOf(m.provider, m.id);
                    const tTest = tests[k];
                    const used = usage.get(k) ?? 0;
                    return (
                      <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                        <div className="min-w-0 flex-1 basis-60">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                            {isDefault(m) && <Pill tone="cyan">{t("teacherAi.models.defaultCommon")}</Pill>}
                            {used > 0 && <Pill tone="violet">{t("teacherAi.models.tasks", { n: used })}</Pill>}
                            {m.audio && (
                              <Pill tone="amber">
                                <Mic className="size-3" /> Audio
                              </Pill>
                            )}
                            {m.free && <Pill tone="emerald">Free tier</Pill>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500" title={m.note || undefined}>
                            <span className="tabular-nums">
                              {m.inPrice || m.outPrice ? t("teacherAi.models.pricePerMillion", { input: money(m.inPrice), output: money(m.outPrice) }) : t("teacherAi.models.noPrice")}
                            </span>
                            {m.note && <span className="text-slate-400"> · {m.note}</span>}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <CodeChip value={m.id} />
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={tTest === "running" || p.keyCount === 0}
                            title={p.keyCount === 0 ? t("teacherAi.models.addKeyFirst") : t("teacherAi.models.testHint")}
                            onClick={() => runTest(m)}
                          >
                            {tTest === "running" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Test
                          </Button>
                          <IconBtn label={t("common.edit")} onClick={() => setEditor({ provider: m.provider, model: m })}>
                            <Pencil className="size-4" />
                          </IconBtn>
                          <IconBtn
                            label={t("common.delete")}
                            danger
                            onClick={async () => {
                              if (await confirmAsk({
                                title: t("teacherAi.models.deleteTitle", { model: m.label }),
                                message: t("teacherAi.models.deleteMessage"),
                                confirmText: t("common.delete"),
                                danger: true,
                              })) remove.mutate(m);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </IconBtn>
                        </div>
                        {tTest && tTest !== "running" && (
                          <div className="w-full md:col-span-3">
                            <TestLine r={tTest} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ),
      )}

      {editor && (
        <ModelEditor
          key={`${editor.provider}/${editor.model?.id ?? "new"}`}
          cfg={cfg}
          initialProvider={editor.provider}
          model={editor.model}
          onClose={() => setEditor(null)}
          // Stays open: a new model switches the drawer to editing it.
          onSaved={(m) => {
            refresh();
            setEditor({ provider: m.provider, model: m });
            runTest({ ...m, label: m.label || m.id, note: m.note });
          }}
        />
      )}
    </div>
  );
}

function TestLine({ r }: { r: AiModelTestResult }) {
  return r.ok ? (
    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-3.5" /> {t("teacherAi.models.working", { seconds: (r.latencyMs / 1000).toFixed(1) })}
      {r.outputTokens != null && <span className="font-normal text-slate-400">{t("teacherAi.models.tokens", { input: r.inputTokens ?? 0, output: r.outputTokens })}</span>}
    </p>
  ) : (
    <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
      <XCircle className="mt-px size-3.5 shrink-0" /> <span className="break-all">{r.error || t("teacherAi.models.error")}</span>
    </p>
  );
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800",
        danger ? "hover:text-rose-500" : "hover:text-slate-700 dark:hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

// ── Add / edit drawer ────────────────────────────────────────────────────────

const AUDIO_PROVIDERS: AiProviderId[] = ["google", "openrouter"];

/** Add flow: pick from the provider's list first; the form only appears once a model is chosen. */
type Step = "browse" | "picked" | "manual";

const EMPTY_FORM = { id: "", label: "", inPrice: "", outPrice: "", audio: false, jsonSchema: true, free: false, note: "" };

function ModelEditor({
  cfg,
  initialProvider,
  model,
  onClose,
  onSaved,
}: {
  cfg: AiConfig;
  initialProvider: AiProviderId;
  model?: AiModelInfo;
  onClose: () => void;
  onSaved: (m: AiModelInfo) => void;
}) {
  const editing = !!model;
  const [provider, setProvider] = useState<AiProviderId>(initialProvider);
  const [step, setStep] = useState<Step>("browse");
  const [form, setForm] = useState(
    model
      ? {
          id: model.id,
          label: model.label,
          inPrice: String(model.inPrice),
          outPrice: String(model.outPrice),
          audio: model.audio ?? false,
          jsonSchema: model.jsonSchema ?? true,
          free: model.free ?? false,
          note: model.note ?? "",
        }
      : EMPTY_FORM,
  );
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pInfo = cfg.providers.find((p) => p.id === provider)!;
  const showForm = editing || step !== "browse";

  const pick = (b: AiBrowseModel) => {
    setForm({
      id: b.id,
      label: b.label,
      inPrice: b.inPrice != null ? String(b.inPrice) : "",
      outPrice: b.outPrice != null ? String(b.outPrice) : "",
      audio: AUDIO_PROVIDERS.includes(provider) && !!b.audio,
      jsonSchema: b.jsonSchema ?? true,
      free: !!b.free,
      note: b.note ?? "",
    });
    setStep("picked");
  };
  const backToList = () => {
    setForm(EMPTY_FORM);
    setStep("browse");
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: AiModelInput = {
        provider,
        id: form.id.trim(),
        label: form.label.trim() || undefined,
        inPrice: Number(form.inPrice) || 0,
        outPrice: Number(form.outPrice) || 0,
        audio: form.audio,
        jsonSchema: form.jsonSchema,
        free: form.free,
        note: form.note.trim() || undefined,
      };
      await aiGatewayApi.saveModel(body);
      return body;
    },
    onSuccess: (b) => {
      toast.success(editing ? t("teacherAi.models.saved") : t("teacherAi.models.addedTesting"));
      onSaved({ ...b, label: b.label || b.id });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      icon={<Cpu className="size-5" />}
      title={editing ? t("teacherAi.models.editTitle", { label: model!.label }) : t("teacherAi.models.add")}
      description={editing ? model!.id : t("teacherAi.models.chooseOrEnter")}
      widthClassName="max-w-xl"
      footer={
        <div className="flex items-center gap-2">
          {!editing && !showForm && (
            <Button variant="neutral" onClick={() => setStep("manual")}>
              <Keyboard className="size-4" /> {t("teacherAi.models.manual")}
            </Button>
          )}
          <Button variant="neutral" className="ml-auto" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!showForm || !form.id.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editing ? t("common.save") : t("teacherAi.models.add")}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!editing && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Provider</p>
            <ProviderSelect
              value={provider}
              onChange={(v) => {
                setProvider(v as AiProviderId);
                backToList();
              }}
              providers={cfg.providers.map((p) => ({ id: p.id, label: p.label, ready: p.keyCount > 0 }))}
            />
          </div>
        )}

        {!showForm && (
          <BrowseList provider={provider} hasKey={pInfo.keyCount > 0} onPick={pick} />
        )}

        {showForm && (
          <div className="space-y-4">
            {step === "picked" ? (
              <div className="flex items-center gap-3 rounded-xl border border-cyan-500/40 bg-cyan-50/60 p-3 dark:bg-cyan-500/5">
                <ProviderMark id={provider} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{form.label || form.id}</p>
                  <code className="block truncate text-[11px] text-slate-500">{form.id}</code>
                </div>
                <Button size="sm" variant="neutral" onClick={backToList}>
                  <ArrowLeftRight className="size-4" /> {t("teacherAi.models.change")}
                </Button>
              </div>
            ) : (
              <Field label={t("teacherAi.models.id")}>
                <Input
                  autoFocus={!editing}
                  value={form.id}
                  disabled={editing}
                  onChange={(e) => set("id", e.target.value)}
                  placeholder={provider === "openrouter" ? "vd anthropic/claude-sonnet-5.5" : "vd gpt-6.1-sol"} // i18n-ignore
                />
              </Field>
            )}

            <Field label={t("teacherAi.models.label")}>
              <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder={t("teacherAi.models.labelPlaceholder")} />
            </Field>

            <div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("teacherAi.models.inputPrice")}>
                  <NumberInput value={form.inPrice} onChange={(v) => set("inPrice", v)} min={0} max={1000} step={0.05} placeholder="0" />
                </Field>
                <Field label={t("teacherAi.models.outputPrice")}>
                  <NumberInput value={form.outPrice} onChange={(v) => set("outPrice", v)} min={0} max={1000} step={0.05} placeholder="0" />
                </Field>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{t("teacherAi.models.priceHint")}</p>
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 dark:divide-slate-800 dark:border-slate-700">
              {AUDIO_PROVIDERS.includes(provider) && (
                <SwitchRow label={t("teacherAi.models.audio")} hint={t("teacherAi.models.audioHint")} checked={form.audio} onChange={(v) => set("audio", v)} />
              )}
              <SwitchRow label={t("teacherAi.models.free")} checked={form.free} onChange={(v) => set("free", v)} />
            </div>

            <Field label={t("teacherAi.models.note")}>
              <Input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={t("teacherAi.models.notePlaceholder")} />
            </Field>

            {step === "manual" && (
              <button type="button" onClick={backToList} className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
                <ArrowLeft className="size-3.5" /> {t("teacherAi.models.backToList")}
              </button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function BrowseList({
  provider,
  hasKey,
  onPick,
}: {
  provider: AiProviderId;
  hasKey: boolean;
  onPick: (m: AiBrowseModel) => void;
}) {
  const [q, setQ] = useState("");
  const enabled = provider === "openrouter" || hasKey;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ai-browse", provider],
    queryFn: () => aiGatewayApi.browseModels(provider),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const needle = q.trim().toLowerCase();
  const rows = useMemo(
    () => (data?.items ?? []).filter((m) => !needle || m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle)),
    [data, needle],
  );

  if (!enabled) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          {t("teacherAi.models.browseNoKey")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder={provider === "openrouter" ? t("teacherAi.models.searchRouter") : t("teacherAi.models.search")} leftIcon={<Search className="size-4" />} />
        </div>
        <Button variant="neutral" onClick={() => refetch()} disabled={isFetching} aria-label={t("teacherAi.models.reload")} title={t("teacherAi.models.reload")} className="w-11 shrink-0 px-0">
          <RotateCcw className={cn("size-4", isFetching && "animate-spin")} />
        </Button>
      </div>
      <div className="max-h-[26rem] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 dark:border-slate-700">
        {isLoading ? (
          <p className="flex items-center justify-center gap-2 p-6 text-sm text-slate-400">
            <Loader2 className="size-4 animate-spin" /> {t("teacherAi.models.loadingList")}
          </p>
        ) : error ? (
          <p className="flex items-start gap-2 p-4 text-sm text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {(error as Error).message}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">{t("teacherAi.models.noneMatch")}</p>
        ) : (
          rows.slice(0, 120).map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={m.added}
              onClick={() => onPick(m)}
              className={cn(
                "flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 transition dark:border-slate-800",
                m.added ? "cursor-default opacity-50" : "hover:bg-slate-50 dark:hover:bg-slate-800",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                <code className="block truncate text-[11px] text-slate-400">{m.id}</code>
              </span>
              {m.audio && provider === "openrouter" && <Mic className="size-3.5 shrink-0 text-amber-500" />}
              {m.inPrice != null && (
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">
                  {money(m.inPrice)}/{money(m.outPrice ?? 0)}
                </span>
              )}
              {m.added && <span className="shrink-0 text-[11px] font-semibold text-slate-400">{t("teacherAi.models.added")}</span>}
            </button>
          ))
        )}
      </div>
      {rows.length > 120 && <p className="mt-1 text-[11px] text-slate-400">{t("teacherAi.models.narrow", { n: rows.length })}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}

/** Model id as a mono chip; a click copies it. */
function CodeChip({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={t("teacherAi.models.copyId")}
      onClick={async () => {
        if (await copyText(value)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={cn(
        "group inline-flex max-w-full items-center gap-1 font-mono text-xs transition",
        done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 hover:text-cyan-700 dark:text-slate-300 dark:hover:text-cyan-300",
      )}
    >
      <span className="truncate">{value}</span>
      {done ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0 opacity-50 group-hover:opacity-100" />}
    </button>
  );
}
