// Bảng xếp hạng điểm dùng chung (teacher + user công khai).
// Chọn kỳ (tuần/tháng/quý/năm/tất cả) + danh sách hạng; tô sáng dòng "của tôi".
import { Crown, Medal, Trophy } from "lucide-react";
import { formatPoints } from "@msyen/shared";
import type { LeaderboardEntry, LeaderboardPeriod } from "../lib/api";
import { Avatar } from "./Avatar";
import { LevelBadge } from "./LevelBadge";
import { cn } from "../lib/utils";
import { t, type TKey } from "../i18n";

// Nhãn các kỳ (dùng chung cho tab và dropdown).
export const LEADERBOARD_PERIOD_LABELS: { value: LeaderboardPeriod; label: TKey }[] = [
  { value: "week", label: "shared.leaderboard.week" },
  { value: "month", label: "shared.leaderboard.month" },
  { value: "quarter", label: "shared.leaderboard.quarter" },
  { value: "year", label: "shared.leaderboard.year" },
  { value: "all", label: "shared.leaderboard.all" },
];
const PERIODS = LEADERBOARD_PERIOD_LABELS;

export function LeaderboardView({
  period,
  onPeriod,
  items,
  loading,
  meId,
  hideTabs,
}: {
  period: LeaderboardPeriod;
  onPeriod: (p: LeaderboardPeriod) => void;
  items: LeaderboardEntry[];
  loading?: boolean;
  meId?: string;
  /** Ẩn hàng tab chọn kỳ (khi bộ lọc đã nằm nơi khác, vd dropdown ở hero). */
  hideTabs?: boolean;
}) {
  return (
    <div>
      {/* Chọn kỳ */}
      {!hideTabs && (
      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => onPeriod(p.value)}
            className={cn(
              "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition",
              period === p.value
                ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-500/60 dark:bg-cyan-500/10 dark:text-cyan-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
          >
            {t(p.label)}
          </button>
        ))}
      </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-slate-500">{t("shared.leaderboard.loading")}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-14 text-center dark:border-slate-700">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Trophy className="size-7" />
          </div>
          <p className="font-semibold text-slate-600 dark:text-slate-300">{t("shared.leaderboard.emptyTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{t("shared.leaderboard.emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <div
              key={e.user_id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 shadow-sm transition sm:gap-4 sm:p-4",
                e.user_id === meId
                  ? "border-cyan-400 bg-cyan-50/60 dark:border-cyan-500/50 dark:bg-cyan-500/10"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
              )}
            >
              {/* Desktop: hạng ở cột riêng. Mobile: lồng vào dưới avatar để tiết kiệm chỗ. */}
              <RankBadge rank={e.rank} className="hidden sm:flex" />
              <div className="relative shrink-0">
                {/* Tier frame only on all-time points: period points would understate a learner's tier. */}
                <Avatar seed={e.user_id} src={e.avatar_url} size={44} className="!rounded-2xl" points={period === "all" ? e.points : undefined} />
                <RankPin rank={e.rank} className="sm:hidden" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-[15px] font-bold text-slate-900 sm:text-base dark:text-white">{e.name || t("shared.leaderboard.user")}</h3>
                  {e.user_id === meId && (
                    <span className="shrink-0 rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      {t("shared.leaderboard.you")}
                    </span>
                  )}
                  {e.level && <LevelBadge level={e.level} className="shrink-0" />}
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {t("shared.leaderboard.exercisesDone", { n: e.exercises_done })}
                  {e.accuracy > 0 && (
                    <>
                      <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Avg {e.accuracy}%</span>
                    </>
                  )}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-extrabold text-amber-600 dark:text-amber-400">
                <Trophy className="size-4" /> {formatPoints(e.points)}
                <span className="hidden text-xs font-medium text-amber-500/80 sm:inline">{t("shared.leaderboard.points")}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Màu + icon huy hiệu theo hạng (top 1-2-3 vàng/bạc/đồng, còn lại null).
function medalMeta(rank: number) {
  return rank === 1
    ? { cls: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", Icon: Crown }
    : rank === 2
      ? { cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200", Icon: Medal }
      : rank === 3
        ? { cls: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300", Icon: Medal }
        : null;
}

// Huy hiệu hạng ở cột riêng (desktop).
function RankBadge({ rank, className }: { rank: number; className?: string }) {
  const m = medalMeta(rank);
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold tabular-nums",
        m ? m.cls : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
        className,
      )}
    >
      {m ? <m.Icon className="size-4" /> : rank}
    </span>
  );
}

// Huy hiệu hạng THU GỌN lồng ở góc dưới avatar (mobile) — tiết kiệm chỗ.
function RankPin({ rank, className }: { rank: number; className?: string }) {
  const m = medalMeta(rank);
  return (
    <span
      className={cn(
        "absolute -bottom-1.5 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-extrabold tabular-nums shadow ring-2 ring-white dark:ring-slate-900",
        m ? m.cls : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
        className,
      )}
    >
      {m ? <m.Icon className="size-3" /> : rank}
    </span>
  );
}
