// "Key" tab of /teacher/ai: provider API keys stored encrypted in D1, plus read-only Worker-secret keys.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AudioLines, CheckCircle2, ChevronDown, Circle, ExternalLink, Eye, EyeOff, Globe, KeyRound, Loader2, Lock, Plus, ShieldCheck, Terminal, Trash2, X, XCircle } from "lucide-react";
import { aiGatewayApi, type AiKeyHealth, type AiKeysResponse } from "../../lib/api";
import { confirmAsk } from "../confirm";
import { Button, Card, CardContent, Combobox, Input, Toggle } from "../ui";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { KEY_URL, Pill, ProviderMark, relTime } from "./shared";

type ProviderKeys = AiKeysResponse["providers"][number];

export function AiKeysTab() {
  const { data, isLoading } = useQuery({ queryKey: ["ai-keys"], queryFn: aiGatewayApi.keys, retry: false });
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (isLoading || !data) return <p className="text-slate-500">{t("common.loading")}</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="min-w-0 flex-1 font-semibold text-slate-800 dark:text-slate-100">{t("teacherAi.keys.introTitle")}</p>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                >
                  <Terminal className="size-3.5" /> {t("teacherAi.keys.advanced")}
                  <ChevronDown className={cn("size-3.5 transition", showAdvanced && "rotate-180")} />
                </button>
              </div>
              <p className="mt-0.5">{t("teacherAi.keys.intro")}</p>
              {showAdvanced && (
                <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                  <p>{t("teacherAi.keys.advancedIntro")}</p>
                  <pre className="mt-1.5 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                    {data.providers.flatMap((p) => p.envVar.split(" + ").map((v) => `npx wrangler secret put ${v}`)).join("\n")}
                  </pre>
                  <p className="mt-1.5">{t("teacherAi.keys.advancedOutro")}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {data.providers.filter((p) => !SPEECH.includes(p.id)).map((p) => (
        <ProviderCard key={p.id} p={p} />
      ))}

      <div className="flex items-center gap-2 pt-2">
        <AudioLines className="size-4 text-slate-400" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("teacherAi.keys.speechGroup")}</h2>
        <span className="text-xs text-slate-400">{t("teacherAi.keys.speechGroupHint")}</span>
      </div>
      {data.providers.filter((p) => SPEECH.includes(p.id)).map((p) => (
        <ProviderCard key={p.id} p={p} />
      ))}
    </div>
  );
}

const SPEECH: string[] = ["azure", "deepgram"];
const AZURE_REGIONS = ["southeastasia", "eastasia", "japaneast", "australiaeast", "centralindia", "eastus", "westus2", "westeurope"];

function ProviderCard({ p }: { p: ProviderKeys }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [region, setRegion] = useState("");
  const azure = p.id === "azure";
  const [reveal, setReveal] = useState(false);
  const [checks, setChecks] = useState<Record<string, { ok: boolean; error?: string } | "running">>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ai-keys"] });
    qc.invalidateQueries({ queryKey: ["ai-config"] });
    qc.invalidateQueries({ queryKey: ["ai-browse", p.id] });
  };

  const add = useMutation({
    mutationFn: (check: boolean) =>
      aiGatewayApi.addKey({ provider: p.id, key: key.trim(), label: label.trim() || undefined, region: azure ? region.trim() : undefined, check }),
    onSuccess: () => {
      toast.success(t("teacherAi.keys.saved", { provider: p.label }));
      setKey("");
      setLabel("");
      setRegion("");
      setAdding(false);
      refresh();
    },
    onError: async (e: Error, check) => {
      // A provider outage should not block saving a key the teacher trusts.
      if (check && /kh\u00f4ng d\u00f9ng \u0111\u01b0\u1ee3c/.test(e.message)) {
        const ok = await confirmAsk({
          title: t("teacherAi.keys.uncheckedTitle"),
          message: `${e.message}\n\n${t("teacherAi.keys.saveAnyway")}`,
          confirmText: t("teacherAi.keys.saveAnywayConfirm"),
        });
        if (ok) add.mutate(false);
        return;
      }
      toast.error(e.message);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => aiGatewayApi.updateKey(id, { enabled }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => aiGatewayApi.removeKey(id),
    onSuccess: () => {
      toast.success(t("teacherAi.keys.deleted"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const check = async (k: AiKeyHealth) => {
    setChecks((c) => ({ ...c, [k.id]: "running" }));
    try {
      const r = await aiGatewayApi.checkKey(k.id);
      setChecks((c) => ({ ...c, [k.id]: r }));
    } catch (e) {
      setChecks((c) => ({ ...c, [k.id]: { ok: false, error: (e as Error).message } }));
    }
  };

  const active = p.keys.filter((k) => k.enabled && k.readable).length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <ProviderMark id={p.id} />
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-slate-900 dark:text-white">{p.label}</h2>
            <p className="text-xs text-slate-500">
              {active > 0 ? (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t("teacherAi.keys.active", { n: active })}</span>
              ) : (
                t("teacherAi.keys.none")
              )}
              {p.hasBaseUrl && t("teacherAi.keys.baseUrl")}
              {" · "}
              <a href={KEY_URL[p.id]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-cyan-600 hover:underline dark:text-cyan-400">
                {t("teacherAi.keys.get")} <ExternalLink className="size-3" />
              </a>
            </p>
          </div>
          {!adding &&
            (active ? (
              <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
                <Plus className="size-4" /> {t("teacherAi.keys.addAnother")}
              </button>
            ) : (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> {t("teacherAi.keys.add")}
              </Button>
            ))}
        </div>

        {adding && (
          <form
            className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/30"
            onSubmit={(e) => {
              e.preventDefault();
              if (key.trim() && (!azure || region.trim())) add.mutate(true);
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-64 flex-1">
                <Input
                  autoFocus
                  type={reveal ? "text" : "password"}
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={t("teacherAi.keys.paste", { provider: p.label })}
                  leftIcon={<Lock className="size-4" />}
                  rightSlot={
                    <button type="button" onClick={() => setReveal((v) => !v)} className="p-1 text-slate-400 hover:text-slate-600" aria-label={reveal ? t("teacherAi.keys.hide") : t("teacherAi.keys.show")}>
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                />
              </div>
              {azure && (
                <div className="w-44">
                  <Combobox value={region} onChange={setRegion} options={AZURE_REGIONS} placeholder={t("teacherAi.keys.region")} leftIcon={<Globe className="size-4" />} menuClassName="w-56" />
                </div>
              )}
              <div className="w-56">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("teacherAi.keys.label")} />
              </div>
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="neutral" onClick={() => setAdding(false)}>
                  <X className="size-4" /> {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={!key.trim() || (azure && !region.trim()) || add.isPending}>
                  {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {add.isPending ? t("teacherAi.keys.checking") : t("teacherAi.keys.checkSave")}
                </Button>
              </div>
            </div>
            {azure && <p className="text-xs text-slate-500">{t("teacherAi.keys.azureHint")}</p>}
          </form>
        )}

        {p.keys.length > 0 && (
          <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {p.keys.map((k) => {
              const c = checks[k.id];
              return (
                <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:grid md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      !k.readable
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : k.enabled && !k.cooling
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800",
                    )}
                  >
                    {k.source === "env" ? <Terminal className="size-4" /> : <KeyRound className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">{t("teacherAi.keys.keyPrefix")}</span>
                      <code className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">{k.hint.replace(/^…/, "••••")}</code>
                      {k.label && <span className="truncate text-sm text-slate-600 dark:text-slate-300">{k.label}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {k.source === "env" ? t("teacherAi.keys.sourceEnv") : t("teacherAi.keys.sourceDb", { time: relTime(k.created_at) })}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <Status k={k} />
                    {c && c !== "running" && (
                      <p className={cn("mt-1 flex items-start gap-1 text-xs font-semibold", c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                        {c.ok ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <XCircle className="mt-px size-3.5 shrink-0" />}
                        <span className="break-all">{c.ok ? t("teacherAi.keys.working") : c.error}</span>
                      </p>
                    )}
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="text-slate-400">{t("teacherAi.keys.lastUsedLabel")}</p>
                    <p className="font-semibold text-slate-600 dark:text-slate-300">
                      {relTime(k.last_used_at)}
                      {k.fail_count > 0 && <span className="font-normal text-rose-500">{t("teacherAi.keys.failures", { n: k.fail_count })}</span>}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" disabled={c === "running"} onClick={() => check(k)}>
                      {c === "running" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {t("teacherAi.keys.check")}
                    </Button>
                    {k.source === "db" && (
                      <>
                        <Toggle checked={k.enabled} onChange={(v) => update.mutate({ id: k.id, enabled: v })} aria-label={k.enabled ? t("teacherAi.keys.disable") : t("teacherAi.keys.enable")} />
                        <button
                          type="button"
                          aria-label={t("teacherAi.keys.deleteLabel")}
                          onClick={async () => {
                            if (await confirmAsk({
                              title: t("teacherAi.keys.deleteTitle", { hint: k.hint.replace(/^…/, "••••") }),
                              message: t("teacherAi.keys.deleteMessage"),
                              confirmText: t("common.delete"),
                              danger: true,
                            })) remove.mutate(k.id);
                          }}
                          className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Status({ k }: { k: AiKeyHealth }) {
  if (!k.readable) return <Pill tone="rose">{t("teacherAi.keys.unreadable")}</Pill>;
  if (!k.enabled) return <Pill>{t("teacherAi.keys.disabled")}</Pill>;
  if (k.cooling)
    return (
      <Pill tone="amber">
        <Circle className="size-2 fill-current stroke-none" /> {t("teacherAi.keys.cooling", { time: new Date(k.cooldown_until!).toLocaleTimeString() })}
      </Pill>
    );
  return (
    <Pill tone="emerald">
      <Circle className="size-2 fill-current stroke-none" /> {t("teacherAi.keys.ready")}
    </Pill>
  );
}
