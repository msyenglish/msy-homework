// Screen shown when an exercise cannot be opened (public user practice).
// Classifies the error and provides relevant guidance and exit actions.
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarClock, Home, ListChecks, Lock, Search, SignalHigh, TriangleAlert } from "lucide-react";
import { Button } from "../ui";
import { PracticeFooter } from "./PracticeFooter";
import { t, type TKey } from "../../i18n";

type Kind = "locked" | "queue" | "level" | "notfound" | "other";

/** Maps the API error message to an icon + a way out. */
function classify(message: string): Kind {
  const m = message.toLowerCase();
  // Server error messages: "chưa tới lượt", "chưa mở khóa", "cấp độ", "không tìm thấy"
  if (/ch\u01b0a t\u1edbi l\u01b0\u1ee3t/.test(m)) return "queue";
  if (/ch\u01b0a m\u1edf kh\u00f3a|ch\u01b0a m\u1edf kho\u00e1/.test(m)) return "locked";
  if (/c\u1ea5p \u0111\u1ed9/.test(m)) return "level";
  if (/kh\u00f4ng t\u00ecm th\u1ea5y/.test(m)) return "notfound";
  return "other";
}

const FACE: Record<Kind, { Icon: typeof Lock; tone: string; ring: string; titleKey: TKey; hintKey: TKey }> = {
  locked: {
    Icon: Lock,
    tone: "from-amber-400 to-orange-500 shadow-amber-500/30",
    ring: "border-amber-200 dark:border-amber-900/60",
    titleKey: "practice.unavailable.lockedTitle",
    hintKey: "practice.unavailable.lockedHint",
  },
  queue: {
    Icon: ListChecks,
    tone: "from-amber-400 to-orange-500 shadow-amber-500/30",
    ring: "border-amber-200 dark:border-amber-900/60",
    titleKey: "practice.unavailable.queueTitle",
    hintKey: "practice.unavailable.queueHint",
  },
  level: {
    Icon: SignalHigh,
    tone: "from-sky-400 to-indigo-500 shadow-sky-500/30",
    ring: "border-sky-200 dark:border-sky-900/60",
    titleKey: "practice.unavailable.levelTitle",
    hintKey: "practice.unavailable.levelHint",
  },
  notfound: {
    Icon: Search,
    tone: "from-slate-400 to-slate-500 shadow-slate-500/30",
    ring: "border-slate-200 dark:border-slate-800",
    titleKey: "practice.unavailable.notfoundTitle",
    hintKey: "practice.unavailable.notfoundHint",
  },
  other: {
    Icon: TriangleAlert,
    tone: "from-rose-400 to-rose-500 shadow-rose-500/30",
    ring: "border-rose-200 dark:border-rose-900/60",
    titleKey: "practice.unavailable.otherTitle",
    hintKey: "practice.unavailable.otherHint",
  },
};

export function PracticeUnavailable({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const nav = useNavigate();
  const kind = classify(message);
  const f = FACE[kind];
  return (
    <div className="mx-auto max-w-lg pt-10 sm:pt-16">
      <div className={`rounded-2xl border ${f.ring} bg-white p-6 text-center shadow-sm sm:p-8 dark:bg-slate-900`}>
        <div
          className={`mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${f.tone} text-white shadow-lg`}
        >
          <f.Icon className="size-8" />
        </div>

        <h1 className="mt-4 text-xl font-extrabold text-slate-900 dark:text-white">{t(f.titleKey)}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t(f.hintKey)}</p>

        {/* Raw API error message — kept for transparency, placed as secondary text. */}
        <p className="mx-auto mt-4 max-w-sm rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          {message}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" className="flex-1" onClick={() => nav("/u/library")}>
            <ArrowLeft className="size-4" /> {t("practice.unavailable.backToLibrary")}
          </Button>
          {kind === "other" && onRetry ? (
            <Button variant="outline" size="lg" className="flex-1" onClick={onRetry}>
              {t("practice.unavailable.retry")}
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="flex-1" onClick={() => nav("/u")}>
              <Home className="size-4" /> {t("practice.unavailable.home")}
            </Button>
          )}
        </div>

        {kind === "locked" && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <CalendarClock className="size-3.5" /> {t("practice.unavailable.newEveryDay")}
          </p>
        )}
      </div>
      <PracticeFooter />
    </div>
  );
}
