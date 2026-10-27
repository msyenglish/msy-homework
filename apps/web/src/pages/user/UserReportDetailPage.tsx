// Chi tiết một báo cáo tháng CỦA CHÍNH user — mở trong shell app (giữ header/nav).
// Tái dùng ReportBody (chung với trang công khai /r/:slug); dữ liệu qua endpoint có xác thực.
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Printer, Share2 } from "lucide-react";
import { libraryApi, type PublicReport } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useGoBack } from "../../lib/navState";
import { HeroDecor } from "../../components/HeroDecor";
import { ReportBody } from "../../components/report/ReportBody";
import { HeroScore, ratingLabel } from "../../components/report/ReportCharts";
import { PageLoading } from "../../components/PageLoading";
import { t } from "../../i18n";

function monthLabel(m: string) {
  const [y, mo] = (m || "").split("-");
  return mo ? t("userPages.reports.monthLabel", { month: Number(mo), year: y }) : m;
}

export default function UserReportDetailPage() {
  const { month } = useParams();
  const goBack = useGoBack("/u/reports");
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError } = useQuery<PublicReport>({
    queryKey: ["my-report", month],
    queryFn: () => libraryApi.myReport(month!),
    enabled: !!month,
    retry: false,
  });
  useDocumentTitle(data ? t("userPages.reports.reportTitleWithMonth", { month: monthLabel(data.month) }) : "Monthly Report");

  // Link công khai /r/<slug> — gửi cho bố mẹ, không cần đăng nhập. Ưu tiên chia sẻ hệ thống
  // (mobile) rồi mới rơi về copy clipboard.
  const shareUrl = data?.slug ? `${window.location.origin}/r/${data.slug}` : null;
  async function share() {
    if (!shareUrl) return;
    const title = t("userPages.reports.shareTitle", { name: data?.studentName ?? "" });
    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        /* người dùng huỷ hộp chia sẻ → rơi xuống copy */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bị chặn → thôi */
    }
  }

  if (isLoading) return <PageLoading />;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="font-bold text-slate-800 dark:text-slate-100">{t("userPages.reports.notFoundTitle")}</p>
        <p className="mt-1 text-sm text-slate-500">{t("userPages.reports.noTeacherFeedbackThisMonth")}</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 inline-block text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
        >
          {t("userPages.reports.backToReportsList")}
        </button>
      </div>
    );
  }

  const avg = data.stats?.avg_pct != null ? Math.round(data.stats.avg_pct) : null;

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      {/* Header — gradient violet→cyan (đồng bộ hero /u/reports) + vòng điểm tổng */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-700 to-cyan-800 px-6 py-7 text-white shadow-sm sm:px-8 print:shadow-none">
        <HeroDecor seed={`${data.studentName}-${data.month}`} className="text-white/10" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <button
              type="button"
              onClick={goBack}
              className="-ml-1 flex w-fit items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white print:hidden"
            >
              <ArrowLeft className="size-4" /> {t("userPages.reports.allReports")}
            </button>
            <h1 className="mt-2 text-2xl font-extrabold">{t("userPages.reports.learningReportHeading")}</h1>
            <p className="mt-1 text-white/90">
              <span className="font-semibold">{data.studentName}</span>
              <span className="mx-1.5 text-white/50">·</span>
              {monthLabel(data.month)}
            </p>
          </div>
          {avg != null ? <HeroScore avg={avg} rating={ratingLabel(avg)} /> : null}
        </div>
      </header>

      <ReportBody content={data.content} stats={data.stats} />

      <footer className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
        <span className="text-xs text-slate-400">{t("userPages.reports.updatedAt", { date: fmtDate(data.updatedAt) })}</span>
        <div className="flex items-center gap-2 print:hidden">
          {shareUrl ? (
            <button
              type="button"
              onClick={share}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
              {copied ? t("userPages.reports.copiedLink") : t("userPages.reports.shareForParents")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <Printer className="size-3.5" /> {t("userPages.reports.printPdf")}
          </button>
        </div>
      </footer>
    </div>
  );
}
