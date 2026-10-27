// Voice (TTS) tab of /teacher/ai: which provider and voices each use takes, with previews.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BookA, Check, Headphones, Info, KeyRound, Loader2, MessagesSquare, Play, Save, Square } from "lucide-react";
import {
  TTS_ACCENT_LABEL,
  TTS_PROVIDER_LABEL,
  type TtsAccent,
  type TtsConfig,
  type TtsProvider,
  type TtsUseConfig,
  type TtsVoice,
} from "@msyen/shared";
import { aiGatewayApi } from "../../lib/api";
import { Button, Card, CardContent, Select } from "../ui";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { ProviderLogo, ProviderSelect } from "./shared";

const ACCENTS: TtsAccent[] = ["US", "UK", "AU", "IE", "IN"];

export function AiVoiceTab({ onGoKeys }: { onGoKeys: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["ai-tts"], queryFn: aiGatewayApi.tts, retry: false });
  const [draft, setDraft] = useState<TtsConfig | null>(null);
  const cfg = draft ?? data?.config ?? null;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(data?.config);

  const save = useMutation({
    mutationFn: () => aiGatewayApi.saveTts(cfg!),
    onSuccess: () => {
      toast.success(t("teacherAi.voice.saved"));
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["ai-tts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data || !cfg) return <p className="text-slate-500">{t("common.loading")}</p>;
  const { voices, ready } = data;
  const set = (patch: Partial<TtsConfig>) => setDraft({ ...cfg, ...patch });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <ProviderStatus
            id="azure"
            name={TTS_PROVIDER_LABEL.azure}
            ok={ready.azure}
            desc={t("teacherAi.voice.azureDesc")}
            onGoKeys={onGoKeys}
            addLabel={t("teacherAi.voice.addAzure")}
            gift={t("teacherAi.voice.azureGift")}
          />
          <ProviderStatus
            id="deepgram"
            name={TTS_PROVIDER_LABEL.deepgram}
            ok={ready.deepgram}
            desc={t("teacherAi.voice.deepgramDesc")}
            onGoKeys={onGoKeys}
            addLabel={t("teacherAi.voice.addDeepgram")}
            gift={t("teacherAi.voice.gift")}
          />
        </CardContent>
      </Card>

      <UseCard
        icon={BookA}
        title={t("teacherAi.voice.pronunciation")}
        desc={t("teacherAi.voice.pronunciationDesc")}
        value={cfg.pronounce}
        voices={voices}
        ready={ready}
        onChange={(pronounce) => set({ pronounce })}
      />
      <UseCard
        icon={Headphones}
        title={t("teacherAi.voice.listening")}
        desc={t("teacherAi.voice.listeningDesc")}
        value={cfg.listening}
        voices={voices}
        ready={ready}
        onChange={(listening) => set({ listening })}
      />

      <Card>
        <CardContent className="p-5">
          <Head icon={MessagesSquare} title={t("teacherAi.voice.dialogue")} desc={t("teacherAi.voice.dialogueDesc")} />
          <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr] sm:gap-x-10">
            <TtsProviderField value={cfg.dialogue.provider} ready={ready} onChange={(provider) => set({ dialogue: { ...cfg.dialogue, provider } })} />
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("teacherAi.voice.accents")}</p>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.filter((a) => voices.some((v) => v.provider === cfg.dialogue.provider && v.accent === a)).map((a) => {
                  const on = cfg.dialogue.accents.includes(a);
                  const n = voices.filter((v) => v.provider === cfg.dialogue.provider && v.accent === a).length;
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? cfg.dialogue.accents.filter((x) => x !== a) : [...cfg.dialogue.accents, a];
                        if (next.length) set({ dialogue: { ...cfg.dialogue, accents: next } });
                      }}
                      className={cn(
                        "inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition",
                        on
                          ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
                      )}
                    >
                      <span className={cn("flex size-4 items-center justify-center rounded border", on ? "border-cyan-500 bg-cyan-500 text-white" : "border-slate-300 dark:border-slate-600")}>
                        {on && <Check className="size-3" />}
                      </span>
                      {TTS_ACCENT_LABEL[a]}
                      <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-300">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
            <Info className="mt-px size-3.5 shrink-0 text-slate-400" />
            <span>
              {t("teacherAi.voice.accentsHint")}
              {cfg.dialogue.provider === "deepgram" && t("teacherAi.voice.deepgramEmotion")}
            </span>
          </p>
        </CardContent>
      </Card>

      {dirty && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("teacherAi.voice.unsaved")}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4" /> {save.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderStatus({
  id,
  name,
  ok,
  desc,
  onGoKeys,
  addLabel,
  gift,
}: {
  id: TtsProvider;
  name: string;
  ok: boolean;
  desc: string;
  onGoKeys: () => void;
  addLabel: string;
  gift: string;
}) {
  const link = "font-semibold text-cyan-600 hover:underline dark:text-cyan-400";
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
        <ProviderLogo id={id} />
        {name}
        <span className={cn("ml-auto inline-flex items-center gap-1.5 text-xs font-semibold", ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")}>
          <span className={cn("size-2 rounded-full", ok ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
          {ok ? t("teacherAi.keys.ready") : t("teacherAi.voice.unavailable")}
        </span>
      </p>
      <p className="mt-1 flex-1 text-xs text-slate-500">{desc}</p>
      <p className={cn("mt-2 flex items-start gap-1.5 border-t border-slate-100 pt-2 text-xs dark:border-slate-800", ok ? "text-slate-500" : "text-amber-700 dark:text-amber-300")}>
        <KeyRound className="mt-px size-3.5 shrink-0" />
        {ok ? (
          <span>
            {t("teacherAi.voice.hasKey")}{" "}
            <button type="button" onClick={onGoKeys} className={link}>
              {t("teacherAi.voice.manageKeys")}
            </button>
          </span>
        ) : (
          <span>
            {t("teacherAi.voice.noKey")}{" "}
            <button type="button" onClick={onGoKeys} className={link}>
              {addLabel}
            </button>{" "}
            {gift}
          </span>
        )}
      </p>
    </div>
  );
}

function Head({ icon: Icon, title, desc }: { icon: typeof BookA; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
        <Icon className="size-5" />
      </span>
      <div>
        <h2 className="font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </div>
  );
}

function TtsProviderField({ value, ready, onChange }: { value: TtsProvider; ready: Record<TtsProvider, boolean>; onChange: (p: TtsProvider) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{t("teacherAi.voice.provider")}</p>
      <ProviderSelect
        value={value}
        onChange={(v) => onChange(v as TtsProvider)}
        notReadyHint={t("teacherAi.provider.notReady")}
        menuClassName="w-72"
        providers={(["azure", "deepgram"] as TtsProvider[]).map((p) => ({ id: p, label: TTS_PROVIDER_LABEL[p], ready: ready[p] }))}
      />
      {!ready[value] && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3" /> {t("teacherAi.voice.saveRejected")}
        </p>
      )}
    </div>
  );
}

function UseCard({
  icon,
  title,
  desc,
  value,
  voices,
  ready,
  onChange,
}: {
  icon: typeof BookA;
  title: string;
  desc: string;
  value: TtsUseConfig;
  voices: TtsVoice[];
  ready: Record<TtsProvider, boolean>;
  onChange: (v: TtsUseConfig) => void;
}) {
  const first = (p: TtsProvider, g: "female" | "male") => voices.find((v) => v.provider === p && v.gender === g)?.id ?? "";
  return (
    <Card>
      <CardContent className="p-5">
        <Head icon={icon} title={title} desc={desc} />
        <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr_1fr]">
          <TtsProviderField
            value={value.provider}
            ready={ready}
            onChange={(provider) => onChange({ provider, female: first(provider, "female"), male: first(provider, "male") })}
          />
          <VoicePicker label={t("teacherAi.voice.female")} gender="female" provider={value.provider} voices={voices} value={value.female} canPlay={ready[value.provider]} onChange={(female) => onChange({ ...value, female })} />
          <VoicePicker label={t("teacherAi.voice.male")} gender="male" provider={value.provider} voices={voices} value={value.male} canPlay={ready[value.provider]} onChange={(male) => onChange({ ...value, male })} />
        </div>
      </CardContent>
    </Card>
  );
}

function VoicePicker({
  label,
  gender,
  provider,
  voices,
  value,
  canPlay,
  onChange,
}: {
  label: string;
  gender: "female" | "male";
  provider: TtsProvider;
  voices: TtsVoice[];
  value: string;
  canPlay: boolean;
  onChange: (id: string) => void;
}) {
  const options = voices
    .filter((v) => v.provider === provider && v.gender === gender)
    .map((v) => ({ value: v.id, label: `${v.name} · ${TTS_ACCENT_LABEL[v.accent]}` }));
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</p>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Select value={value} onChange={onChange} options={options} />
        </div>
        <PreviewButton voice={value} disabled={!canPlay} />
      </div>
    </div>
  );
}

/** Plays a short sample of a voice; a second click stops it. */
function PreviewButton({ voice, disabled }: { voice: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const play = async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const url = await aiGatewayApi.previewVoice(voice);
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      await a.play();
      setState("playing");
    } catch (e) {
      toast.error((e as Error).message);
      setState("idle");
    }
  };

  return (
    <Button variant="secondary" disabled={disabled || state === "loading"} onClick={play} aria-label={t("teacherAi.voice.preview")} title={t("teacherAi.voice.preview")}>
      {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : state === "playing" ? <Square className="size-4" /> : <Play className="size-4" />}
    </Button>
  );
}
