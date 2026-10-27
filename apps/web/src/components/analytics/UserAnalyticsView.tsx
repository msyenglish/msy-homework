// Dashboard "Đánh giá toàn diện quá trình học" — dùng chung giáo viên & user tự xem.
// Recharts (được code-split qua React.lazy ở nơi gọi) — không phình bundle chính.
import { useRef, useState, type ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AudioLines, BookCheck, Keyboard, Mic, Percent, PenLine, Route, Sparkles, Target, TriangleAlert, Trophy } from "lucide-react";
import { formatPoints, SKILL_LIST } from "@msyen/shared";
import { Link } from "react-router-dom";
import type { UserAnalytics } from "../../lib/api";
import { cn } from "../../lib/utils";
import { StatTile, compactNum } from "./StatTile";
import { t as translate, type TKey } from "../../i18n";

// Màu đọc tốt ở cả sáng/tối (recharts không tự theo theme).
const CYAN = "#06b6d4";
const AMBER = "#f59e0b";
const EMERALD = "#10b981";
const GRID = "rgba(100,116,139,0.2)";
const AXIS = "rgba(100,116,139,0.9)";

// Thứ tự kỹ năng cố định → radar luôn đủ đỉnh (bài chưa làm = 0). Lấy từ registry
// dùng chung, bỏ "mixed" (là nhãn tổng hợp, không phải 1 trục năng lực riêng).
const SKILL_ORDER = SKILL_LIST.filter((m) => m.key !== "mixed");

// Tooltip chuẩn — theo theme sáng/tối, đọc unit từ từng series (payload[].unit).
interface TipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  stroke?: string;
  fill?: string;
  unit?: string;
}
// Màu chấm tooltip: bỏ qua giá trị gradient "url(...)" → dùng stroke/fill/mặc định.
function dotColor(p: TipEntry): string {
  if (p.color && !p.color.startsWith("url(")) return p.color;
  if (p.stroke && !p.stroke.startsWith("url(")) return p.stroke;
  if (p.fill && !p.fill.startsWith("url(")) return p.fill;
  return "#94a3b8";
}
function ChartTooltip({
  active,
  payload,
  label,
  defaultUnit,
}: {
  active?: boolean;
  payload?: TipEntry[];
  label?: string;
  defaultUnit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      {label != null && label !== "" && (
        <p className="mb-1 font-bold text-slate-700 dark:text-slate-200">{label}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <p key={i} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="size-2 shrink-0 rounded-full" style={{ background: dotColor(p) }} />
            <span>{p.name}</span>
            <span className="ml-auto font-semibold text-slate-800 dark:text-slate-100">
              {p.value}
              {p.unit ?? defaultUnit ?? ""}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}


// This dashboard is shared by the teacher page (Vietnamese) and the public user page (English),
// so every label goes through the table below instead of being written inline in the JSX.
export type AnalyticsLang = "vi" | "en";
const ANALYTICS_KEYS = ["points", "rank", "done", "accuracy", "rankHint", "doneHint", "accuracyHint", "noData", "noDataHint", "weekly", "pointsUnit", "bySkill", "byType", "noTypeData", "heat", "less", "more", "attempts", "pronRadar", "pronTrend", "pAccuracy", "pFluency", "pCompleteness", "pProsody", "pronScore", "takes", "journey", "journeyDone", "xpLevel", "xpToNext", "writing", "writingTrend", "wTask", "wCoherence", "wGrammar", "wLexical", "avgWords", "score", "overall", "weakGrammar", "weakWrong", "weakSeen", "video", "vLessons", "vDictDone", "vFirstOk", "vHints", "vRevealed", "vShadowSegs", "vShadowAvg", "vDictation", "vShadowing"] as const;
type AnalyticsKey = (typeof ANALYTICS_KEYS)[number];

function Card({ title, icon, children, className }: { title?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900", className)}>
      {title && (
        <div className="mb-3 flex items-center gap-2">
          {icon && <span className="text-cyan-500">{icon}</span>}
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

// Thẻ KPI: thumb icon bên trái, (value + label) inline bên phải — cao 2 dòng.
// Lịch nhiệt kiểu GitHub — full-width: mỗi tuần là 1 cột co giãn (flex-1), ô vuông.
function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
// Số cột (tuần) hiện theo bề ngang màn hình — dữ liệu vẫn là 26 tuần, chỉ giấu bớt cột cũ.
const HEAT_COLS = { sm: 13, md: 20 };

// Thang nhiệt 6 bậc — MỘT dải liên tục vàng → cam → đỏ, đi từ nhạt đến đậm (sáng) và từ tối
// đến rực (tối), không nhảy tông. Bậc 0 để xám cho khỏi nhầm "học ít" với "nghỉ".
const HEAT_SCALE = [
  "bg-slate-100 dark:bg-slate-800",
  "bg-amber-100 dark:bg-amber-950",
  "bg-amber-200 dark:bg-amber-900",
  "bg-amber-400 dark:bg-amber-700",
  "bg-orange-500 dark:bg-orange-600",
  "bg-red-600 dark:bg-red-500",
];
/** Ô nhiệt theo số lượt trong ngày: 0 · 1 · 2 · 3 · 4-5 · 6+. */
function heatTone(n: number): string {
  const idx = n === 0 ? 0 : n <= 3 ? n : n <= 5 ? 4 : 5;
  return HEAT_SCALE[idx];
}

function Heatmap({ cells, t }: { cells: UserAnalytics["heatmap"]; t: Record<AnalyticsKey, string> }) {
  const [hover, setHover] = useState<{ date: string; count: number; left: number; top: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const weeks: UserAnalytics["heatmap"][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  // Cột cũ nhất được GIẤU dần theo bề ngang: điện thoại 13 tuần · tablet 20 · desktop 26.
  // 26 cột trên màn hình hẹp thì mỗi ô còn ~8px, bấm không trúng mà cũng chẳng đọc được.
  const colVisibility = (i: number) => {
    const fromEnd = weeks.length - i;
    if (fromEnd <= HEAT_COLS.sm) return "flex";
    if (fromEnd <= HEAT_COLS.md) return "hidden sm:flex";
    return "hidden lg:flex";
  };
  const onMove = (c: { date: string; count: number }, e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const half = 62; // nửa bề rộng ước lượng của tooltip
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Kẹp trong khung để tooltip không bị cắt ở mép trái/phải thiết bị.
    const left = Math.max(half, Math.min(rect.width - half, x));
    setHover({ date: c.date, count: c.count, left, top: y, below: y < 54 });
  };
  return (
    <div ref={ref} className="relative">
      <div className="flex w-full gap-1">
        {weeks.map((w, i) => (
          <div key={i} className={cn("flex-1 flex-col gap-1", colVisibility(i))}>
            {w.map((c) => (
              <div
                key={c.date}
                onMouseEnter={(e) => onMove(c, e)}
                onMouseMove={(e) => onMove(c, e)}
                onMouseLeave={() => setHover(null)}
                className={cn("aspect-square w-full rounded-[3px] transition hover:ring-2 hover:ring-orange-400/60", heatTone(c.count))}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Tooltip chuẩn khi hover ô */}
      {hover && (
        <div
          className={cn(
            "pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95",
            hover.below ? "translate-y-0" : "-translate-y-full",
          )}
          style={{ left: hover.left, top: hover.below ? hover.top + 16 : hover.top - 8 }}
        >
          <p className="font-bold text-slate-700 dark:text-slate-200">{fmtDate(hover.date)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
            <span className={cn("size-2 shrink-0 rounded-full", heatTone(hover.count))} />
            <span className="font-semibold text-slate-800 dark:text-slate-100">{hover.count}</span> {t.attempts}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-slate-500">
        <span>{t.less}</span>
        {HEAT_SCALE.map((tone) => (
          <span key={tone} className={cn("size-3 rounded-sm", tone)} />
        ))}
        <span>{t.more}</span>
      </div>
    </div>
  );
}

// Radar dùng chung (kỹ năng / phát âm).
function AccuracyRadar({ data, name }: { data: { subject: string; value: number }[]; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} outerRadius="66%" margin={{ top: 34, right: 34, bottom: 24, left: 34 }}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="subject" tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar name={name} dataKey="value" stroke={CYAN} fill={CYAN} fillOpacity={0.35} dot={{ r: 3, fill: CYAN }} />
        <Tooltip content={<ChartTooltip defaultUnit="%" />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Small horizontal criterion bar (0-100) used by the writing card.
 *  One row per criterion with a thin, muted track — the overall score above stays the focal point. */
function CriterionBar({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[72px] shrink-0 truncate text-xs font-medium sm:w-[92px] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span className={cn("block h-full rounded-full opacity-70", tone)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </span>
      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{value}</span>
    </div>
  );
}

/** Big number of the card: the score, its caption, and optional trailing chips. */
function ScoreHead({ value, caption, children }: { value: number; caption: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div className="min-w-0">
        <p className="text-4xl font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">
          {value}
          <span className="ml-0.5 text-base font-semibold text-slate-400 dark:text-slate-500">/100</span>
        </p>
        <p className="mt-1.5 truncate text-xs font-medium text-slate-500">{caption}</p>
      </div>
      {children}
    </div>
  );
}

/** Ring progress (0-100) for the dictation / shadowing tiles — no recharts, plain SVG. */
function ScoreRing({
  id,
  value,
  label,
  from,
  to,
  text,
  suffix = "",
}: {
  id: string;
  value: number;
  label: string;
  from: string;
  to: string;
  text: string;
  suffix?: string;
}) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex w-20 shrink-0 flex-col items-center gap-1.5 sm:w-24">
      <div className="relative flex size-20 items-center justify-center sm:size-24">
        <svg viewBox="0 0 80 80" className="size-full -rotate-90">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={from} />
              <stop offset="100%" stopColor={to} />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * C} ${C}`}
          />
        </svg>
        <span className={cn("absolute text-xl font-black leading-none tabular-nums sm:text-2xl", text)}>
          {Math.round(value)}
          {suffix && <span className="text-[11px] font-bold">{suffix}</span>}
        </span>
      </div>
      <span className="text-center text-[11px] font-medium leading-tight text-slate-500">{label}</span>
    </div>
  );
}

/** Score-over-time area chart shared by pronunciation / writing. */
function TrendChart({ data, name, color }: { data: { label: string; score: number }[]; name: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID }} />
        <Area dataKey="score" name={name} stroke={color} strokeWidth={2.5} fill={color} fillOpacity={0.15} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default function UserAnalyticsView({ data, lang = "vi" }: { data: UserAnalytics; lang?: AnalyticsLang }) {
  const { kpis, timeline, skills, question_types, heatmap, pronunciation, xp, path, writing, grammar_weak, video } = data;
  const t = new Proxy({} as Record<AnalyticsKey, string>, { get: (_, key: AnalyticsKey) => translate(`report.analytics.${key}` as TKey) });
  const vi = lang === "vi";
  const hasSubs = kpis.exercises_done > 0;

  const skillMap = new Map(skills.map((s) => [s.skill, s.accuracy]));
  const radarSkills = SKILL_ORDER.map((m) => ({ subject: vi ? m.labelVi : m.label, value: skillMap.get(m.key) ?? 0 }));

  return (
    <div className="space-y-5">
      {/* Headline KPIs (the streak moved to the hero) — inline tiles, value on the right. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<Trophy className="size-4.5" />} tone="amber" label={t.points} hint={t.xpLevel + " " + xp.level} value={compactNum(kpis.total_points)} />
        <StatTile icon={<Target className="size-4.5" />} tone="cyan" label={t.rank} hint={t.rankHint} value={kpis.rank ? `#${kpis.rank}` : "—"} />
        <StatTile icon={<BookCheck className="size-4.5" />} tone="emerald" label={t.done} hint={t.doneHint} value={compactNum(kpis.exercises_done)} />
        <StatTile icon={<Percent className="size-4.5" />} tone="indigo" label={t.accuracy} hint={t.accuracyHint} value={`${kpis.avg_accuracy}%`} percent={kpis.avg_accuracy} />
      </div>

      {/* Hai thanh tiến độ "dài hơi": cấp XP (điểm) và lộ trình cấp độ (số bài). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {t.xpLevel} {xp.level}
            </h3>
            <span className="ml-auto text-xs font-medium text-slate-500">
              {formatPoints(Math.max(0, xp.need - xp.into))} {t.xpToNext}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${Math.max(2, xp.percent)}%` }} />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-slate-500">
            {formatPoints(xp.into)} / {formatPoints(xp.need)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2">
            <Route className="size-4 text-cyan-500" />
            <h3 className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">
              {t.journey}{path.level ? ` · ${path.level}` : ""}
            </h3>
            <span className="ml-auto text-xs font-medium tabular-nums text-slate-500">{path.percent}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.max(2, path.percent)}%` }} />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-slate-500">
            {path.done} / {path.total} {t.journeyDone}
          </p>
        </div>
      </div>

      {!hasSubs ? (
        <Card>
          <div className="flex flex-col items-center py-14 text-center">
            <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Activity className="size-7" />
            </div>
            <p className="font-semibold text-slate-600 dark:text-slate-300">{t.noData}</p>
            <p className="mt-1 text-sm text-slate-500">{t.noDataHint}</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Tiến độ theo thời gian: điểm (cột) + độ chính xác (đường) */}
          <Card title={t.weekly} icon={<Activity className="size-4" />}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={timeline} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="ptsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CYAN} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis yAxisId="pts" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="acc" orientation="right" domain={[0, 100]} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
                <Bar yAxisId="pts" dataKey="points" name={t.points} unit={t.pointsUnit} fill="url(#ptsFill)" stroke={CYAN} radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Line yAxisId="acc" dataKey="accuracy" name={t.accuracy} unit="%" stroke={AMBER} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Radar kỹ năng — luôn đủ đỉnh */}
            <Card title={t.bySkill} icon={<Target className="size-4" />}>
              <AccuracyRadar data={radarSkills} name={t.accuracy} />
            </Card>

            {/* Loại câu hỏi */}
            <Card title={t.byType} icon={<BookCheck className="size-4" />}>
              {question_types.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart layout="vertical" data={question_types} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: AXIS, fontSize: 11 }} unit="%" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={80} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
                    <Bar dataKey="accuracy" name={t.accuracy} unit="%" fill={EMERALD} radius={[0, 6, 6, 0]} maxBarSize={22} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-20 text-center text-sm text-slate-500">{t.noTypeData}</p>
              )}
            </Card>
          </div>

          {/* Writing — four criteria */}
          {writing.has_data && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title={`${t.writing} (${writing.count} ${t.takes})`} icon={<PenLine className="size-4" />}>
                <ScoreHead value={writing.avg_overall} caption={`${t.overall} · ~${Math.round(writing.avg_words)} ${t.avgWords}`} />
                <div className="space-y-2.5">
                  <CriterionBar label={t.wTask} value={writing.avg_task} tone="bg-teal-500" />
                  <CriterionBar label={t.wCoherence} value={writing.avg_coherence} tone="bg-cyan-500" />
                  <CriterionBar label={t.wGrammar} value={writing.avg_grammar} tone="bg-violet-500" />
                  <CriterionBar label={t.wLexical} value={writing.avg_lexical} tone="bg-amber-500" />
                </div>
              </Card>
              <Card title={t.writingTrend} icon={<Activity className="size-4" />}>
                <TrendChart data={writing.trend} name={t.score} color="#14b8a6" />
              </Card>
            </div>
          )}

          {/* Phát âm (bài đọc to) */}
          {pronunciation.has_data && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title={t.pronRadar} icon={<Target className="size-4" />}>
                <AccuracyRadar
                  name={t.pronScore}
                  data={[
                    { subject: t.pAccuracy, value: pronunciation.avg_accuracy },
                    { subject: t.pFluency, value: pronunciation.avg_fluency },
                    { subject: t.pCompleteness, value: pronunciation.avg_completeness },
                    ...(pronunciation.avg_prosody != null ? [{ subject: t.pProsody, value: pronunciation.avg_prosody }] : []),
                  ]}
                />
              </Card>
              <Card title={`${t.pronTrend} (${pronunciation.count} ${t.takes})`} icon={<Activity className="size-4" />}>
                <TrendChart data={pronunciation.trend} name={t.pronScore} color={AMBER} />
              </Card>
            </div>
          )}

          {/* NGHE & NÓI (bài video): nghe-viết theo câu + nói nhại theo đoạn */}
          {video?.has_data && (
            <Card title={`${t.video} · ${video.lessons} ${t.vLessons}`} icon={<AudioLines className="size-4" />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-violet-500">
                      <Keyboard className="size-3.5" /> {t.vDictation}
                    </p>
                    <p className="text-3xl font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">
                      {video.dict_segments}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{t.vDictDone}</p>
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="tabular-nums">{video.hints} {t.vHints}</span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="tabular-nums">{video.revealed} {t.vRevealed}</span>
                    </p>
                  </div>
                  <ScoreRing
                    id="ringDict"
                    value={video.dict_first_ok_pct}
                    label={t.vFirstOk}
                    from="#a78bfa"
                    to="#7c3aed"
                    text="text-violet-600 dark:text-violet-400"
                    suffix="%"
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-rose-500">
                      <Mic className="size-3.5" /> {t.vShadowing}
                    </p>
                    <p className="text-3xl font-extrabold leading-none tabular-nums text-slate-900 dark:text-white">
                      {video.shadow_segments}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{t.vShadowSegs}</p>
                  </div>
                  {video.shadow_segments > 0 && (
                    <ScoreRing
                      id="ringShadow"
                      value={video.shadow_avg}
                      label={t.vShadowAvg}
                      from="#fb7185"
                      to="#e11d48"
                      text="text-rose-600 dark:text-rose-400"
                    />
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Ngữ pháp hay sai — nhãn grammar_id ở cấp CÂU, dẫn thẳng sang bài học tương ứng. */}
          {grammar_weak.length > 0 && (
            <Card title={t.weakGrammar} icon={<TriangleAlert className="size-4" />}>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {grammar_weak.map((g) => (
                  <li key={g.id}>
                    <Link
                      to={`/u/grammar?focus=${g.id}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-cyan-400/60 hover:bg-cyan-50/40 dark:border-slate-800 dark:hover:bg-cyan-500/5"
                    >
                      {/* Band chip grows with its text (36px floor): "Pre-A1" is three times as wide
                          as "A2", so a fixed square would wrap and break the row. */}
                      <span className="flex h-9 min-w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-rose-100 px-1.5 text-[11px] font-bold uppercase leading-none text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                        {g.cefr ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{g.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {g.wrong} {t.weakWrong} / {g.seen} {t.weakSeen}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Lịch nhiệt — full width */}
          <Card title={t.heat} icon={<Activity className="size-4" />}>
            <Heatmap cells={heatmap} t={t} />
          </Card>
        </>
      )}
    </div>
  );
}
