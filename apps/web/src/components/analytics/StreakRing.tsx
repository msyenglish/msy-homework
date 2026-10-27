// Vòng "chuỗi ngày học" kiểu ring-progress (không nền, chỉ vòng lửa), đặt ở hero.
// File riêng (KHÔNG import recharts) để hero không kéo theo chunk biểu đồ.
import { t } from "../../i18n";
export function StreakRing({ days, best, compact = false, hideBest = false }: { days: number; best?: number; compact?: boolean; hideBest?: boolean }) {
  const R = 34; // bán kính vòng (viewBox 80×80)
  const C = 2 * Math.PI * R;
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
    <div className={compact ? "relative flex size-14 items-center justify-center sm:size-16" : "relative flex size-20 items-center justify-center sm:size-24"}>
      {/* Hào quang lửa CHỈ quanh vòng ngoài (viền mờ, tâm trong suốt → không lấn số) */}
      <span className="animate-flame absolute inset-0 rounded-full border-4 border-orange-500/70 blur-md" />
      <span
        className="animate-flame absolute -inset-px rounded-full border-2 border-amber-400/60 blur-sm"
        style={{ animationDelay: "0.5s" }}
      />

      {/* Vòng ring gradient lửa (nền trong suốt) */}
      <svg viewBox="0 0 80 80" className="relative size-full -rotate-90">
        <defs>
          <linearGradient id="streakGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="55%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>
        <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke="url(#streakGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={0}
        />
      </svg>

      {/* Nội dung giữa: số · gạch · streak */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-black leading-none tabular-nums text-orange-600 dark:text-orange-400 ${compact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"}`}>
          {days}
        </span>
        <span className={`my-0.5 h-px bg-orange-400/40 ${compact ? "w-5" : "w-7"}`} />
        <span className={`font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 ${compact ? "text-[8px]" : "text-[9px]"}`}>
          streak
        </span>
      </div>
    </div>
    {/* Kỷ lục chuỗi dài nhất từ trước tới nay */}
    {!hideBest && best != null && best > 0 && (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">
        {compact ? `Best ${best}` : t("report.streak.best", { n: best })}
      </span>
    )}
    </div>
  );
}

/**
 * The scoring rules, written out for the learner. The streak decays in steps instead of resetting,
 * which nobody can guess from a number on a ring — so the ring carries this tip.
 */
export function StreakRules({ missedDays = 0, nextPenalty = 0 }: { missedDays?: number; nextPenalty?: number }) {
  // Spans, not divs: the tooltip panel itself is a <span>, so block-level children would nest badly.
  return (
    <span className="block space-y-1.5 text-left">
      <span className="block font-bold text-white">{t("report.streak.title")}</span>
      <span className="block">
        {t("report.streak.studyToday").split("<b>+1</b>")[0]}<b className="text-emerald-300">+1</b>{t("report.streak.studyToday").split("<b>+1</b>")[1]}
      </span>
      <span className="block">
        {t("report.streak.missedRule").split("<b>1</b>")[0]}<b className="text-orange-300">1</b>{t("report.streak.missedRule").split("<b>1</b>")[1].split("<b>2</b>")[0]}<b className="text-orange-300">2</b>{t("report.streak.missedRule").split("<b>2</b>")[1].split("<b>3</b>")[0]}<b className="text-orange-300">3</b>{t("report.streak.missedRule").split("<b>3</b>")[1]}
      </span>
      <span className="block">{t("report.streak.continue")}</span>
      {missedDays > 0 && <span className="block text-orange-300">{t("report.streak.missedDays", { n: missedDays })}</span>}
      {nextPenalty > 0 && (
        <span className="block text-orange-300">{t("report.streak.nextPenalty", { n: nextPenalty })}</span>
      )}
    </span>
  );
}

/** The "Best N" chip on its own, so a hero can place it inline with its title. */
export function StreakBest({ best }: { best?: number }) {
  if (best == null || best <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">
      Best {best}
    </span>
  );
}
