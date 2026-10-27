import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Languages, SpellCheck2 } from "lucide-react";
import type { IpaLine } from "@msyen/shared";
import { useStuckCollapse } from "../../lib/useStuckCollapse";
import { cn } from "../../lib/utils";
import { confirmAsk } from "../confirm";
import { t } from "../../i18n";

// Match split sentence with IPA/translation line: normalize to lowercase alphanumeric (strip punctuation, speaker labels).
const normSentence = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Speaker label at start of line ("Tom: ", "Waiter: "...) — sync regex with ttsJob.stripSpeakerLabels
// (API strips this label before TTS). Allows gender tag "(M)/(F)". Only dialogue if >= 2 lines match.
const SPEAKER_LABEL = /^\s*([A-Za-z][\w .'()-]{0,22}):[ \t]+(?=\S)/;
// Gender tag "(M)/(F)" only selects voice — stripped from displayed chip name.
const GENDER_TAG = /\s*\((?:m|male|f|female)\)\s*$/i;

type Para = { speaker: string | null; sentences: string[] };

// Normalize dialogue saved as one block without newlines: insert newline between turns.
function normalizeDialogue(passage: string): string {
  if (passage.includes("\n")) return passage;
  return passage.replace(/(["”'])\s+(["“'])/g, "$1\n$2");
}

// Split passage into paragraphs; split each paragraph into sentences for highlighting.
function splitParagraphs(passage: string): Para[] {
  const lines = normalizeDialogue(passage)
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const isDialogue = lines.filter((l) => SPEAKER_LABEL.test(l)).length >= 2;
  return lines.map((para) => {
    let speaker: string | null = null;
    let body = para;
    if (isDialogue) {
      const m = para.match(SPEAKER_LABEL);
      if (m) {
        speaker = m[1].trim().replace(GENDER_TAG, "");
        body = para.slice(m[0].length);
      }
    }
    const sentences = body.match(/[^.!?…]+[.!?…]*\s*/g);
    return { speaker, sentences: sentences && sentences.length ? sentences : [body] };
  });
}

// Badge color palette per character assigned in order of appearance, cycling when exhausted.
const SPEAKER_COLORS = [
  "bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300",
  "bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
  "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  "bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-400/10 dark:text-fuchsia-300",
  "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  "bg-teal-500/10 text-teal-700 dark:bg-teal-400/10 dark:text-teal-300",
];
const DEFAULT_SPEAKER_COLOR = "bg-slate-500/10 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300";

// Map character name to badge color class, fixed on first appearance.
function speakerColorMap(paragraphs: Para[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of paragraphs) {
    if (p.speaker && !map.has(p.speaker)) {
      map.set(p.speaker, SPEAKER_COLORS[map.size % SPEAKER_COLORS.length]);
    }
  }
  return map;
}

// Reading passage with clear paragraphs, clickable sentences for highlighting.
export function PassagePanel({
  passage,
  className,
  ipaLines,
  onUseTranslation,
}: {
  passage: string;
  className?: string;
  ipaLines?: IpaLine[] | null;
  onUseTranslation?: () => void;
}) {
  const paragraphs = useMemo(() => splitParagraphs(passage), [passage]);
  const speakerColors = useMemo(() => speakerColorMap(paragraphs), [paragraphs]);
  // Open by default; collapses when stuck to top.
  const { sentinelRef, panelRef, expanded, setExpanded, reservedHeight } = useStuckCollapse();
  const [active, setActive] = useState<string | null>(null);
  // Map sentence to {ipa, vi}
  const infoByText = useMemo(() => {
    const m = new Map<string, { ipa: string; vi?: string | null }>();
    for (const l of ipaLines ?? []) {
      const key = normSentence(l.text.replace(SPEAKER_LABEL, ""));
      if (key && !m.has(key)) m.set(key, { ipa: l.ipa, vi: l.vi });
    }
    return m;
  }, [ipaLines]);
  const hasIpa = useMemo(() => (ipaLines ?? []).some((l) => l.ipa), [ipaLines]);
  const hasVi = useMemo(() => (ipaLines ?? []).some((l) => l.vi), [ipaLines]);
  const [showIpa, setShowIpa] = useState(false);
  const [showVi, setShowVi] = useState(false);
  const blockMode = showIpa || showVi;

  return (
    <>
    {/* Sentinel for sticky detection */}
    <div ref={sentinelRef} aria-hidden className="h-0" />
    <div
      ref={panelRef}
      className={cn(
        "sticky top-0 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900",
        "max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:shadow-none",
        className,
      )}
    >
      {/* Title bar + Expand / Collapse button */}
      <div
        className={cn(
          "relative flex w-full items-center gap-2 overflow-hidden bg-gradient-to-r from-cyan-50 via-white to-white px-4 py-3.5 dark:from-cyan-950/50 dark:via-slate-800/70 dark:to-slate-800/70",
          expanded && "border-b border-slate-200 dark:border-slate-700/70",
        )}
      >
        {/* Subtle dot pattern */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 text-cyan-500/15 dark:text-cyan-400/10"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "11px 11px",
          }}
        />
        <span className="relative flex size-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
          <BookOpen className="size-3.5" />
        </span>
        <span className="relative flex-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {t("practice.panel.passage")}
        </span>

        {/* IPA and Translation toggles */}
        {hasIpa && (
          <button
            type="button"
            onClick={() => {
              setShowIpa((v) => !v);
              if (!expanded) setExpanded(true);
            }}
            aria-pressed={showIpa}
            title={t("practice.panel.ipaTooltip")}
            className={cn(
              "relative flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
              showIpa
                ? "border border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                : "text-slate-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-300",
            )}
          >
            <SpellCheck2 className="size-3.5" /> IPA
          </button>
        )}
        {hasVi && (
          <button
            type="button"
            onClick={async () => {
              if (showVi) return;
              const ok = await confirmAsk({
                title: t("practice.panel.viewTranslationTitle"),
                message: t("practice.panel.viewTranslationMessage"),
                confirmText: t("practice.panel.enableTranslation"),
                cancelText: t("practice.panel.cancelTranslation"),
                danger: true,
              });
              if (!ok) return;
              onUseTranslation?.();
              setShowVi(true);
              if (!expanded) setExpanded(true);
            }}
            aria-pressed={showVi}
            title={showVi ? t("practice.panel.translatingTooltip") : t("practice.panel.translateTooltip")}
            className={cn(
              "relative flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
              showVi
                ? "cursor-default border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                : "text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-300",
            )}
          >
            <Languages className="size-3.5" /> {showVi ? t("practice.panel.translating") : t("practice.panel.translate")}
          </button>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="relative flex items-center gap-1 text-xs font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400"
        >
          {expanded ? t("practice.panel.collapse") : t("practice.panel.expand")}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Content panel */}
      {expanded && (
        <>
          <div className="max-h-[46vh] overflow-auto px-5 py-4 text-[15px] leading-loose text-slate-700 sm:text-base dark:text-slate-200">
            {paragraphs.map(({ speaker, sentences }, pi) => (
              <p key={pi} className={cn("last:mb-0", speaker ? "mb-2.5" : "mb-3")}>
                {speaker && (
                  <span className={cn("mr-2 inline-block rounded-md px-1.5 py-0.5 align-middle text-xs font-bold uppercase tracking-wide", speakerColors.get(speaker) ?? DEFAULT_SPEAKER_COLOR)}>
                    {speaker}
                  </span>
                )}
                {sentences.map((s, si) => {
                  const key = `${pi}-${si}`;
                  const on = active === key;
                  if (blockMode) {
                    const info = infoByText.get(normSentence(s.replace(SPEAKER_LABEL, "")));
                    return (
                      <span key={si} className="mb-2 block last:mb-0">
                        <span className="text-slate-800 dark:text-slate-100">{s}</span>
                        {showIpa && info?.ipa && (
                          <span className="mt-0.5 block font-ipa text-[13px] text-cyan-600 dark:text-cyan-400">{info.ipa}</span>
                        )}
                        {showVi && info?.vi && (
                          <span className="mt-0.5 block text-[13px] italic text-amber-700/90 dark:text-amber-300/90">{info.vi}</span>
                        )}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={si}
                      onClick={() => setActive(on ? null : key)}
                      className={cn(
                        "box-decoration-clone cursor-pointer rounded px-0.5 transition-colors",
                        on
                          ? "bg-cyan-100 font-medium text-slate-900 dark:bg-cyan-500/25 dark:text-white"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800/70",
                      )}
                    >
                      {s}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>

          {/* Bottom collapse button */}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-amber-300 bg-amber-50 py-2.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
          >
            <ChevronUp className="size-4" /> {t("practice.panel.collapseToAnswer")}
          </button>
        </>
      )}
    </div>
    {/* Spacer when collapsed */}
    {reservedHeight ? <div aria-hidden style={{ height: reservedHeight }} /> : null}
    </>
  );
}
