// Bọc dashboard trong React.lazy → tách recharts thành chunk riêng (không phình bundle chính).
import { lazy, Suspense } from "react";
import type { UserAnalytics } from "../../lib/api";
import type { AnalyticsLang } from "./UserAnalyticsView";
import { AnalyticsSkeleton } from "./AnalyticsSkeleton";

const View = lazy(() => import("./UserAnalyticsView"));

export function UserAnalyticsLazy({ data, lang = "vi" }: { data: UserAnalytics; lang?: AnalyticsLang }) {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <View data={data} lang={lang} />
    </Suspense>
  );
}
