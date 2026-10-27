// Báo cáo tháng cô viết cho em — đặc quyền LỚP.
// Nav + route đã gate bằng user.in_class (UserLayout), nên tới được đây chắc chắn là thành
// viên lớp: trạng thái rỗng nghĩa là "cô chưa viết", không phải "ngoài lớp".
// Lưới các tháng; bấm một tháng → trang chi tiết /u/reports/:month (chart đầy đủ).
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, ListChecks } from "lucide-react";
import { libraryApi } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { HeroDecor } from "../../components/HeroDecor";
import { ScoreRing } from "../../components/ScoreRing";
import { Card, CardContent } from "../../components/ui";
import { t } from "../../i18n";

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return t("userPages.reports.monthLabel", { month: Number(mo), year: y });
}

export default function UserReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["my-reports"], queryFn: libraryApi.myReports, retry: false });
  const items = data?.items ?? [];

  return (
    <>
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-reports" className="text-violet-500/20 dark:text-violet-400/15" />
        <div className="relative flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/30">
            <FileText className="size-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Monthly Report</h1>
            <p className="mt-1 text-sm text-slate-500">{t("userPages.reports.subtitle")}</p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <p className="py-12 text-center text-slate-500">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <FileText className="size-6" />
            </div>
            <p className="mt-3 font-semibold text-slate-600 dark:text-slate-300">{t("userPages.reports.emptyTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">{t("userPages.reports.emptySubtitle")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <Link
              key={r.id}
              to={`/u/reports/${r.month}`}
              className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-violet-700"
            >
              <ScoreRing
                score={r.avg_pct ?? 0}
                total={100}
                size={52}
                showFraction={false}
                empty={r.avg_pct == null}
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 dark:text-slate-100">{monthLabel(r.month)}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {r.exercises_done != null && (
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="size-3.5" /> {t("userPages.reports.exercisesDone", { count: r.exercises_done, n: r.exercises_done })}
                      <span className="mx-0.5 text-slate-300 dark:text-slate-600">·</span>
                    </span>
                  )}
                  {t("userPages.reports.updatedAt", { date: fmtDate(r.updatedAt) })}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500 dark:text-slate-600" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
