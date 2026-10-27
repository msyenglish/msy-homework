import { ScoreRing } from "../ScoreRing";
import { t } from "../../i18n";

// Thẻ kết quả sau khi nộp — dùng lại ScoreRing, tông theo điểm.
export function ResultSummary({ score, total }: { score: number; total: number }) {
  const percent = total ? Math.round((score / total) * 100) : 0;
  const msg =
    percent === 100
      ? t("practice2.result.perfect")
      : percent >= 80
        ? t("practice2.result.great")
        : percent >= 50
          ? t("practice2.result.good")
          : t("practice2.result.keepPracticing");
  return (
    <div className="mb-6 flex items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <ScoreRing score={score} total={total} size={92} />
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-slate-900 dark:text-white">
          {t("practice2.result.correct", { score, total })}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{msg}</p>
      </div>
    </div>
  );
}
