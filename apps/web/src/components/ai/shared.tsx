// Helpers shared by the AI gateway tabs (/teacher/ai).
import type { TtsProvider } from "@msyen/shared";
import type { AiKeyProviderId } from "../../lib/api";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { Select, type SelectProps } from "../ui";
import geminiLogo from "../../assets/providers/google-gemini-icon.svg";
import openaiLogo from "../../assets/providers/openai-icon.svg";
import claudeLogo from "../../assets/providers/claude-icon.svg";
import openrouterLogo from "../../assets/providers/openrouter-icon.svg";
import deepseekLogo from "../../assets/providers/deepseek-icon.svg";
import grokLogo from "../../assets/providers/grok-icon.svg";
import deepgramLogo from "../../assets/providers/deepgram-icon.svg";
import azureLogo from "../../assets/providers/microsoft-azure.svg";

export const money = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : +n.toFixed(3)}`;
export const num = (n: number) => n.toLocaleString();

export function relTime(iso: string | null): string {
  if (!iso) return t("teacherAi.time.never");
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return t("teacherAi.time.justNow");
  if (m < 60) return t("teacherAi.time.minutes", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("teacherAi.time.hours", { n: h });
  return t("teacherAi.time.days", { n: Math.floor(h / 24) });
}

/** Where to create a key, per provider. */
export const KEY_URL: Record<AiKeyProviderId, string> = {
  google: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  openrouter: "https://openrouter.ai/settings/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  xai: "https://console.x.ai",
  azure: "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices",
  deepgram: "https://console.deepgram.com",
};

/** Any provider shown with a brand logo: AI key providers plus TTS engines. */
export type BrandId = AiKeyProviderId | TtsProvider;

/** Provider logos (svglogos.dev); `mono` marks all-black logos that are inverted in dark mode. */
const BRAND: Record<BrandId, { src: string; mono?: boolean }> = {
  google: { src: geminiLogo },
  openai: { src: openaiLogo, mono: true },
  anthropic: { src: claudeLogo },
  openrouter: { src: openrouterLogo },
  deepseek: { src: deepseekLogo },
  xai: { src: grokLogo, mono: true },
  deepgram: { src: deepgramLogo, mono: true },
  azure: { src: azureLogo },
};

/** Bare provider logo; renders nothing for an unknown id. */
export function ProviderLogo({ id, className }: { id: string; className?: string }) {
  const b = BRAND[id as BrandId];
  if (!b) return null;
  return <img src={b.src} alt="" aria-hidden className={cn("size-4 shrink-0 object-contain", b.mono && "dark:invert", className)} />;
}

/** Provider logo on a small rounded tile. */
export function ProviderMark({ id, className }: { id: BrandId; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700",
        className,
      )}
    >
      <ProviderLogo id={id} className="size-5" />
    </span>
  );
}

export interface ProviderChoice {
  id: BrandId;
  label: string;
  /** false → the option gets a "no key" tag (still selectable). */
  ready?: boolean;
}

/** Provider dropdown with logos; not-ready providers carry `notReadyHint` (default "No key"). */
export function ProviderSelect({
  providers,
  value,
  onChange,
  notReadyHint,
  ...rest
}: Omit<SelectProps, "options" | "value" | "onChange"> & {
  providers: ProviderChoice[];
  value: string;
  onChange: (id: string) => void;
  notReadyHint?: string;
}) {
  const hint = notReadyHint ?? t("teacherAi.provider.noKey");
  return (
    <Select
      {...rest}
      value={value}
      onChange={onChange}
      options={providers.map((p) => ({
        value: p.id,
        label: p.label,
        icon: <ProviderLogo id={p.id} />,
        hint: p.ready === false ? hint : undefined,
      }))}
    />
  );
}

export function Pill({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: "slate" | "cyan" | "amber" | "rose" | "emerald" | "violet";
  className?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
