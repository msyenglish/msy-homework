// User công khai xem BẢNG XẾP HẠNG điểm theo kỳ (tô sáng hạng của mình).
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Trophy } from "lucide-react";
import { formatPoints } from "@msyen/shared";
import { libraryApi, type LeaderboardEntry, type LeaderboardPeriod } from "../../lib/api";
import { HeroDecor } from "../../components/HeroDecor";
import { LeaderboardView } from "../../components/Leaderboard";
import { PeriodFilter } from "../../components/PeriodFilter";
import { Select } from "../../components/ui/select";
import { LevelDot } from "../../lib/levels";
import { useUrlState } from "../../lib/navState";
import { t } from "../../i18n";

export default function UserLeaderboardPage() {
  // Both filters live in the URL (push) — switching period/level is a step Back should undo,
  // and the link stays shareable ("check the leaderboard for this month, level X").
  // Default "This month" (matches the backend): "This week" is usually empty early in the week.
  const [periodParam, setPeriodParam] = useUrlState("period", "month", { push: true });
  // A hand-typed ?period= must not reach the query key as garbage.
  const PERIODS = ["week", "month", "quarter", "year", "all", "last_week", "last_month", "last_quarter", "last_year"] as const;
  const period: LeaderboardPeriod = PERIODS.includes(periodParam as (typeof PERIODS)[number])
    ? (periodParam as LeaderboardPeriod)
    : "month";
  const setPeriod = (v: LeaderboardPeriod) => setPeriodParam(v);
  const [levelId, setLevelId] = useUrlState("level", "all", { push: true });
  const { data, isLoading } = useQuery({
    queryKey: ["user-leaderboard", period],
    queryFn: () => libraryApi.leaderboard(period),
  });
  const me = data?.me ?? null;

  // Các cấp độ có mặt trong kỳ → dựng option lọc (kèm chấm màu của cấp độ).
  const levelOptions = useMemo(() => {
    const seen = new Map<string, { value: string; label: string; icon: ReactNode }>();
    for (const e of data?.items ?? []) {
      if (e.level && !seen.has(e.level.id)) {
        seen.set(e.level.id, {
          value: e.level.id,
          label: e.level.name,
          icon: <LevelDot icon={e.level.icon} color={e.level.color} />,
        });
      }
    }
    return [{ value: "all", label: t("userPages.leaderboard.allLevels"), icon: <Layers className="size-4" /> }, ...seen.values()];
  }, [data]);

  // Lọc theo cấp độ + xếp lại hạng trong tập đã lọc (để so sánh cùng mức độ).
  const items = useMemo<LeaderboardEntry[]>(() => {
    const base = data?.items ?? [];
    const sel = levelId === "all" ? base : base.filter((e) => e.level?.id === levelId);
    let rank = 0;
    let seen = 0;
    let prev = Number.NaN;
    return sel.map((e) => {
      seen++;
      if (e.points !== prev) {
        rank = seen;
        prev = e.points;
      }
      return { ...e, rank };
    });
  }, [data, levelId]);

  // Hạng của mình TRONG cấp độ của mình (để so với "toàn bảng" ở dòng hero).
  const myLevelRank = useMemo(() => {
    if (!me?.level) return null;
    let rank = 0;
    let seen = 0;
    let prev = Number.NaN;
    for (const e of data?.items ?? []) {
      if (e.level?.id !== me.level.id) continue;
      seen++;
      if (e.points !== prev) {
        rank = seen;
        prev = e.points;
      }
      if (e.user_id === me.user_id) return rank;
    }
    return null;
  }, [data, me]);

  return (
    <>
      <header className="relative mb-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-leaderboard" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 sm:size-14 dark:text-cyan-400">
            <Trophy className="size-6 sm:size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("userPages.leaderboard.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {me ? (
                <>
                  {me.level && myLevelRank && (
                    <>
                      {t("userPages.leaderboard.rankPrefix")} <b className="text-slate-700 dark:text-slate-200">#{myLevelRank}</b> {t("userPages.leaderboard.inLevel", { level: me.level.name })}
                      <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                    </>
                  )}
                  <b className="text-slate-700 dark:text-slate-200">#{me.rank}</b> {t("userPages.leaderboard.overall")}
                  <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                  {t("userPages.leaderboard.pointsCount", { points: formatPoints(me.points) })}
                </>
              ) : (
                t("userPages.leaderboard.emptyHint")
              )}
            </p>
          </div>

          {/* Desktop: 2 bộ lọc gọn ngay trong hero (popover không còn bị cắt vì hero bỏ overflow-hidden). */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <div className="w-52">
              <Select options={levelOptions} value={levelId} onChange={setLevelId} fullWidth />
            </div>
            <div className="w-44">
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile: 2 bộ lọc xuống hàng riêng, chia 50/50 (không chen trong hero). */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:hidden">
        <Select options={levelOptions} value={levelId} onChange={setLevelId} fullWidth />
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <LeaderboardView
        period={period}
        onPeriod={setPeriod}
        items={items}
        loading={isLoading}
        meId={me?.user_id}
        hideTabs
      />
    </>
  );
}
