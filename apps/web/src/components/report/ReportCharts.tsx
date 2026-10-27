// Thành phần trình bày cho trang báo cáo tháng: KPI, chart kỹ năng, timeline, câu sai.
// Vẽ bằng SVG/div thuần (không thêm dependency) — bám theme cyan/slate, chạy tốt khi in.
import type { ReactNode } from "react";
import { questionTypeLabel, type ReportStats } from "@msyen/shared";
import { SKILL_LABEL } from "../../lib/format";
import { IconBox } from "../ui";
import { t } from "../../i18n";

// Màu theo mức điểm % (kèm số hiển thị nên không phụ thuộc mỗi màu).
type Tone = "emerald" | "cyan" | "amber" | "rose";
function scoreTone(pct: number): Tone {
  if (pct >= 80) return "emerald";
  if (pct >= 60) return "cyan";
  if (pct >= 40) return "amber";
  return "rose";
}
const FILL: Record<Tone, string> = {
  emerald: "fill-emerald-500 dark:fill-emerald-400",
  cyan: "fill-cyan-500 dark:fill-cyan-400",
  amber: "fill-amber-500 dark:fill-amber-400",
  rose: "fill-rose-500 dark:fill-rose-400",
};
const BAR_BG: Record<Tone, string> = {
  emerald: "bg-emerald-500 dark:bg-emerald-400",
  cyan: "bg-cyan-500 dark:bg-cyan-400",
  amber: "bg-amber-500 dark:bg-amber-400",
  rose: "bg-rose-500 dark:bg-rose-400",
};

export const skillLabel = (s: string) =>
  // i18n-ignore: stored skill value
  SKILL_LABEL[s] ?? (s === "khác" ? t("report.charts.other") : s);

// Thứ tự hiển thị kỹ năng cố định (đồng bộ toàn hệ thống).
const SKILL_ORDER = ["grammar", "reading", "listening", "vocabulary", "writing", "mixed"];
const bySkillOrder = (a: { skill: string }, b: { skill: string }) => {
  const ia = SKILL_ORDER.indexOf(a.skill);
  const ib = SKILL_ORDER.indexOf(b.skill);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
};

// ---------- KPI tile (icon-trái, 2 dòng value+label bên phải) ----------
export function KpiTile({
  icon,
  variant,
  label,
  value,
}: {
  icon: ReactNode;
  variant: "cyan" | "emerald" | "amber" | "rose" | "violet" | "slate";
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 print:border-slate-300">
      <IconBox variant={variant} size="lg" className="shrink-0">
        {icon}
      </IconBox>
      <div className="min-w-0">
        <div className="truncate text-xl font-extrabold leading-tight text-slate-800 dark:text-slate-100">
          {value}
        </div>
        <div className="mt-0.5 text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">
          {label}
        </div>
      </div>
    </div>
  );
}

// Xếp loại tổng quát theo điểm TB (%) — suy ra từ số liệu thật, không cần AI.
export function ratingLabel(avg: number): string {
  if (avg >= 90) return t("report.charts.excellent");
  if (avg >= 75) return t("report.charts.good");
  if (avg >= 60) return t("report.charts.fair");
  if (avg >= 40) return t("report.charts.average");
  return t("report.charts.needsEffort");
}

// Vòng điểm tổng thể đặt ở góc phải hero (trắng trên nền gradient).
export function HeroScore({ avg, rating }: { avg: number; rating?: string }) {
  const size = 78;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.min(100, avg) / 100);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            className="fill-none stroke-white/25"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={C}
            strokeDashoffset={off}
            strokeLinecap="round"
            className="fill-none stroke-white transition-all"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-extrabold text-white">
            {avg}
            <span className="text-sm font-bold">%</span>
          </span>
        </div>
      </div>
      {rating && (
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white backdrop-blur-sm">
          {rating}
        </span>
      )}
    </div>
  );
}

// ---------- Chart điểm TB theo kỹ năng (thanh ngang) ----------
export function SkillBars({ data }: { data: ReportStats["by_skill"] }) {
  const rows = data.filter((d) => d.avg_pct != null).sort(bySkillOrder);
  if (!rows.length) return null;
  return (
    <div className="space-y-3.5">
      {rows.map((d) => {
        const pct = Math.round(d.avg_pct as number);
        const tone = scoreTone(pct);
        return (
          <div key={d.skill}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {skillLabel(d.skill)}
              </span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {pct}%
                </span>
                <span className="mx-1 text-slate-300 dark:text-slate-600">
                  ·
                </span>
                {t("report.charts.exerciseCount", { n: d.done })}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${BAR_BG[tone]}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Timeline điểm theo thời gian (cột SVG) ----------
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function ScoreTimeline({ data }: { data: ReportStats["timeline"] }) {
  if (data.length < 2) return null;
  // viewBox cố định, cột trải đều toàn bề rộng (đẹp với mọi số lượng bài).
  const n = data.length;
  const W = 700;
  const H = 170;
  const padX = 24;
  const topPad = 22; // chỗ cho nhãn %
  const botPad = 26; // chỗ cho nhãn ngày
  const plotH = H - topPad - botPad;
  const slot = (W - padX * 2) / n;
  const bw = Math.min(48, slot * 0.55);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-44 w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t("report.charts.timelineAria")}
    >
      {/* Đường mốc 50% & 100% (mờ) */}
      {[0, 50, 100].map((g) => {
        const y = topPad + plotH - (g / 100) * plotH;
        return (
          <line
            key={g}
            x1={padX}
            x2={W - padX}
            y1={y}
            y2={y}
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth={1}
            strokeDasharray={g === 0 ? undefined : "3 3"}
          />
        );
      })}
      {data.map((p, i) => {
        const cx = padX + slot * (i + 0.5);
        const barH = Math.max((p.pct / 100) * plotH, 3);
        const y = topPad + plotH - barH;
        const tone = scoreTone(p.pct);
        return (
          <g key={i}>
            <title>{`${p.title} · ${p.pct}%`}</title>
            <rect
              x={cx - bw / 2}
              y={y}
              width={bw}
              height={barH}
              rx={4}
              className={FILL[tone]}
            />
            <text
              x={cx}
              y={y - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[13px] font-bold dark:fill-slate-300"
            >
              {p.pct}%
            </text>
            <text
              x={cx}
              y={H - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[12px]"
            >
              {shortDate(p.date)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Trọng tâm cần luyện (chủ điểm gom từ câu sai) ----------
export function FocusList({
  data,
}: {
  data: NonNullable<ReportStats["focus"]>;
}) {
  if (!data.length) return null;
  return (
    <ul className="space-y-2.5">
      {data.map((f, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 print:border-slate-300"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-sm font-bold text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 dark:text-slate-100">{f.topic}</div>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {f.note}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Phần ĐỌC TO (chấm phát âm) ----------
export function ReadingReport({ data }: { data: NonNullable<ReportStats["reading"]> }) {
  const pron = data.avg_pron ?? 0;
  const tone = scoreTone(pron);
  const subs = [
    { label: t("report.charts.pronunciationAccuracy"), value: data.avg_accuracy },
    { label: t("report.charts.fluency"), value: data.avg_fluency },
    { label: t("report.charts.completeness"), value: data.avg_completeness },
  ].filter((s) => s.value != null) as { label: string; value: number }[];

  return (
    <div className="space-y-4">
      {/* Điểm phát âm TB + số lượt + sub-scores */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row print:border-slate-300">
        <div className="flex shrink-0 items-center gap-3">
          <div className={`text-4xl font-extrabold tabular-nums ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "cyan" ? "text-cyan-600 dark:text-cyan-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
            {pron}
          </div>
          <div className="text-xs leading-tight text-slate-500 dark:text-slate-400">
            {t("report.charts.pronunciationAverage").split("<br />").map((line, i) => <span key={line}>{i > 0 && <br />}{line}</span>)}
            <div className="mt-0.5 font-semibold text-slate-600 dark:text-slate-300">{t("report.charts.readCount", { n: data.count })}</div>
          </div>
        </div>
        {subs.length > 0 && (
          <div className="grid flex-1 grid-cols-3 gap-2">
            {subs.map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2 text-center dark:bg-slate-800/60">
                <div className={`text-lg font-bold tabular-nums ${s.value >= 80 ? "text-emerald-600 dark:text-emerald-400" : s.value >= 60 ? "text-cyan-600 dark:text-cyan-400" : s.value >= 40 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {s.value}
                </div>
                <div className="text-[11px] text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tiến bộ phát âm theo thời gian */}
      {data.timeline.length >= 2 && (
        <ScoreTimeline data={data.timeline.map((t) => ({ date: t.date, pct: t.pron, title: t.title, skill: null }))} />
      )}

      {/* Từ hay phát âm chưa chuẩn / thiếu */}
      {data.weak_words.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t("report.charts.wordsToPractise")}</p>
          <div className="flex flex-wrap gap-1.5">
            {data.weak_words.map((w) => (
              <span
                key={w.word}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-sm font-medium text-amber-600 dark:border-amber-900/70 dark:bg-slate-900 dark:text-amber-400 print:border-slate-300"
              >
                {w.word}
                {w.count > 1 && <span className="text-[10px] font-semibold opacity-70">×{w.count}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Ô số liệu nhỏ (value đậm + nhãn) — dùng cho chuyên cần / từ vựng ----------
const STAT_TONE: Record<Tone | "violet", string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  violet: "text-violet-600 dark:text-violet-400",
};
function StatCell({ value, label, tone }: { value: string; label: string; tone: Tone | "violet" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center dark:border-slate-800 dark:bg-slate-900 print:border-slate-300">
      <div className={`text-xl font-extrabold tabular-nums ${STAT_TONE[tone]}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

// ---------- Chuyên cần & xếp hạng ----------
export function AttendanceStats({ data }: { data: NonNullable<ReportStats["attendance"]> }) {
  const cells: { value: string; label: string; tone: Tone | "violet" }[] = [
    { value: String(data.active_days), label: t("report.charts.activeDays"), tone: "cyan" },
    { value: `${data.streak_days}`, label: t("report.charts.currentStreak"), tone: "emerald" },
    { value: `${data.best_streak_days}`, label: t("report.charts.bestStreak"), tone: "violet" },
    { value: data.total_points.toLocaleString("vi-VN"), label: t("report.charts.totalPoints"), tone: "amber" },
  ];
  if (data.rank != null) cells.push({ value: `#${data.rank}`, label: t("report.charts.leaderboardRank"), tone: "rose" });
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((c) => (
        <StatCell key={c.label} {...c} />
      ))}
    </div>
  );
}

// ---------- Độ chính xác theo LOẠI câu hỏi ----------
export function QuestionTypeBars({ data }: { data: NonNullable<ReportStats["question_types"]> }) {
  const rows = [...data].sort((a, b) => b.accuracy - a.accuracy);
  if (!rows.length) return null;
  return (
    <div className="space-y-3.5">
      {rows.map((d) => {
        const tone = scoreTone(d.accuracy);
        return (
          <div key={d.type}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{questionTypeLabel(d.type)}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-200">{d.accuracy}%</span>
                <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                {t("report.charts.questionCount", { correct: d.correct, total: d.total })}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full ${BAR_BG[tone]}`} style={{ width: `${Math.max(d.accuracy, 2)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Tiến độ từ vựng ----------
export function VocabStats({ data }: { data: NonNullable<ReportStats["vocab"]> }) {
  const cells: { value: string; label: string; tone: Tone | "violet" }[] = [
    { value: String(data.sessions), label: t("report.charts.practiceSessions"), tone: "cyan" },
    { value: data.avg_pct != null ? `${data.avg_pct}%` : "—", label: t("report.report.averageScore"), tone: "emerald" },
    { value: String(data.words_learned), label: t("report.charts.wordsLearned"), tone: "violet" },
    { value: String(data.words_mastered), label: t("report.charts.wordsMastered"), tone: "amber" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {cells.map((c) => (
        <StatCell key={c.label} {...c} />
      ))}
    </div>
  );
}

// ---------- Danh sách câu cần cải thiện ----------
export function MistakesList({ data }: { data: ReportStats["mistakes"] }) {
  if (!data.length) return null;
  return (
    <ul className="space-y-2.5">
      {data.map((m, i) => (
        <li
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 print:border-slate-300"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {m.question}
            </p>
            {m.skill ? (
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {skillLabel(m.skill)}
              </span>
            ) : null}
          </div>
          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-slate-400">
                {t("report.charts.answer")}
              </span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {m.student_answer || t("report.submission.blank")}
              </span>
            </div>
            {m.correct_answer ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-slate-400">
                  {t("report.charts.correctAnswer")}
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {m.correct_answer}
                </span>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Danh sách câu BỎ TRỐNG (không trả lời) — chỉ nêu đề + đáp án đúng ----------
export function BlankList({ data }: { data: ReportStats["mistakes"] }) {
  if (!data.length) return null;
  return (
    <ul className="space-y-2.5">
      {data.map((m, i) => (
        <li
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 print:border-slate-300"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{m.question}</p>
            {m.skill ? (
              <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {skillLabel(m.skill)}
              </span>
            ) : null}
          </div>
          {m.correct_answer ? (
            <div className="mt-2 flex items-baseline gap-1.5 text-sm">
              <span className="text-xs font-medium text-slate-400">{t("report.charts.correctAnswer")}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{m.correct_answer}</span>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
