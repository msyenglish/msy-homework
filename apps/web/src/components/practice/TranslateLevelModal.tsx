// Hint-rung picker for a translation exercise, opened from its library card — the same shape as
// PracticeModeModal. Choosing here rather than on a start screen inside the exercise keeps the step
// where the learner already is, and the rung is still switchable mid-session from the drill's header.
import { X } from "lucide-react";
import { TRANSLATE_LEVELS, type TranslateLevel } from "@msyen/shared";
import { t, type TKey } from "../../i18n";

const TONE: Record<TranslateLevel, string> = {
  easy: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20",
  medium: "border-amber-200 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20",
  hard: "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
  hardest: "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/20",
};
const LABEL: Record<TranslateLevel, { title: string; hint: TKey }> = {
  easy: { title: "Easy", hint: "practice2.translate.easyHint" }, medium: { title: "Medium", hint: "practice2.translate.mediumHint" }, hard: { title: "Hard", hint: "practice2.translate.hardHint" }, hardest: { title: "Hardest", hint: "practice2.translate.hardestHint" },
};

export default function TranslateLevelModal({
  title,
  count,
  defaultLevel = "easy",
  onStart,
  onClose,
}: {
  title: string;
  /** Number of sentences, so the learner can size up the session before opening it. */
  count?: number | null;
  defaultLevel?: TranslateLevel;
  onStart: (level: TranslateLevel) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-800 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("practice2.translate.title", { count: count ? t("practice2.translate.count", { n: count }) : "" })}{t("practice2.translate.chooseLevel")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("practice2.setup.close")}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TRANSLATE_LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => onStart(lv)}
              className={`rounded-xl border-2 px-2 py-3 text-center transition ${TONE[lv]} ${lv === defaultLevel ? "ring-2 ring-cyan-400/60" : ""}`}
            >
              <div className="text-sm font-bold">{LABEL[lv].title}</div>
              <div className="text-[11px] opacity-70">{t(LABEL[lv].hint)}</div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">{t("practice2.translate.changeLevel")}</p>
      </div>
    </div>
  );
}
