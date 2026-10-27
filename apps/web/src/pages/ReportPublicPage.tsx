import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { publicApi, type PublicReport } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { HeroDecor } from "../components/HeroDecor";
import { PracticeFooter } from "../components/practice/PracticeFooter";
import { ReportBody } from "../components/report/ReportBody";
import { HeroScore, ratingLabel } from "../components/report/ReportCharts";
import { PageLoading } from "../components/PageLoading";
import { t } from "../i18n";

function monthLabel(m: string) {
  const [y, mo] = (m || "").split("-");
  return mo ? t("userPages.reports.monthLabel", { month: Number(mo), year: y }) : m;
}

export default function ReportPublicPage() {
  const { id } = useParams();
  const { data, isLoading, isError } = useQuery<PublicReport>({
    queryKey: ["public-report", id],
    queryFn: () => publicApi.report(id!),
    enabled: !!id,
    retry: false,
  });
  useDocumentTitle(data ? t("userPages.reports.publicReportTitle", { name: data.studentName }) : null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-950">
        <PageLoading />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-950">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="font-bold text-slate-800 dark:text-slate-100">{t("userPages.reports.notFoundTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("userPages.reports.invalidLinkMessage")}</p>
        </div>
      </div>
    );
  }

  const avg = data.stats?.avg_pct != null ? Math.round(data.stats.avg_pct) : null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 px-4 pt-8 dark:bg-slate-950 sm:pt-12 print:bg-white">
      <div className="mx-auto w-full max-w-[900px] flex-1 space-y-4">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-800 to-cyan-950 px-6 py-6 text-white shadow-sm ring-1 ring-white/5 sm:px-8 print:shadow-none">
          {/* Soft dot grid + a faint cyan glow keep the dark hero from looking flat without glare. */}
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:14px_14px]" />
          <div aria-hidden className="absolute -right-16 -top-24 size-72 rounded-full bg-cyan-500/15 blur-3xl" />
          <HeroDecor seed={`${data.studentName}-${data.month}`} className="text-white/[0.07]" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-extrabold ring-1 ring-white/15 sm:flex">
                {data.studentName.trim().charAt(0).toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold">{t("userPages.reports.learningReportHeading")}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-white/85">
                  <span className="font-semibold text-white">{data.studentName}</span>
                  {avg != null && (
                    <span className="rounded-full bg-cyan-400/15 px-2.5 py-0.5 text-xs font-bold text-cyan-200 ring-1 ring-cyan-300/30">{ratingLabel(avg)}</span>
                  )}
                  <span className="text-white/40">·</span>
                  {monthLabel(data.month)}
                </p>
              </div>
            </div>
            {avg != null ? <HeroScore avg={avg} /> : null}
          </div>
        </header>

        <ReportBody content={data.content} stats={data.stats} />

        {/* Footer */}
        <footer className="flex items-center justify-between px-2 py-2">
          <span className="text-xs text-slate-400">{t("userPages.reports.updatedAt", { date: fmtDate(data.updatedAt) })}</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300 print:hidden"
          >
            <Printer className="size-3.5" /> {t("userPages.reports.printPdf")}
          </button>
        </footer>

      </div>
      <PracticeFooter className="mt-12 print:hidden" />
    </div>
  );
}
