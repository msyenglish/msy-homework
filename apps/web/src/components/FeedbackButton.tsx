import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { submissionsApi } from "../lib/api";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// Nút nhận xét 1-CLICK bằng AI (không mở modal):
//  - chưa có: "Nhận xét" → click → spinner → tạo + lưu → "Đã nhận xét".
//  - đã có: "Đã nhận xét" (xanh); hover → "Nhận xét lại"; click → tạo lại.
export function FeedbackButton({
  submissionId,
  hasFeedback,
  onDone,
}: {
  submissionId: string;
  hasFeedback: boolean;
  onDone?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function run() {
    if (loading) return;
    setLoading(true);
    try {
      const { feedback } = await submissionsApi.aiFeedback(submissionId);
      await submissionsApi.setFeedback(submissionId, feedback);
      toast.success(hasFeedback ? t("shared.feedback.recreated") : t("shared.feedback.created"));
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("shared.feedback.createError"));
    } finally {
      setLoading(false);
    }
  }

  const done = hasFeedback && !loading;

  return (
    <button
      type="button"
      onClick={run}
      disabled={loading}
      className={cn(
        "group inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition disabled:opacity-70",
        loading
          ? "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800"
          : done
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:border-cyan-500/60 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
      )}
    >
      {loading ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> {t("shared.feedback.creating")}
        </>
      ) : done ? (
        <>
          <Check className="size-3.5 group-hover:hidden" />
          <RefreshCw className="hidden size-3.5 group-hover:inline" />
          <span className="group-hover:hidden">{t("shared.feedback.done")}</span>
          <span className="hidden group-hover:inline">{t("shared.feedback.retry")}</span>
        </>
      ) : (
        <>
          <Sparkles className="size-3.5" /> {t("shared.feedback.create")}
        </>
      )}
    </button>
  );
}
