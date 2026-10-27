// Thân báo cáo tháng — KPI + chart + nhận xét, DÙNG CHUNG cho trang công khai (/r/:slug)
// và trang trong app (/u/reports/:month). Không chứa header (mỗi trang tự dựng hero riêng).
import type { ReactNode } from "react";
import type { ReportStats } from "@msyen/shared";
import {
  Award,
  BarChart3,
  BookText,
  CalendarCheck,
  CircleAlert,
  GraduationCap,
  ListChecks,
  ListTree,
  Mic,
  PencilOff,
  Target,
  TrendingUp,
  TriangleAlert,
  Type,
} from "lucide-react";
import { IconBox } from "../ui";
import { Narrative } from "../Narrative";
import GrammarNotes, { pointsFromWeak } from "../GrammarNotes";
import {
  AttendanceStats,
  BlankList,
  FocusList,
  KpiTile,
  MistakesList,
  QuestionTypeBars,
  ReadingReport,
  ScoreTimeline,
  SkillBars,
  skillLabel,
  VocabStats,
} from "./ReportCharts";
import { t } from "../../i18n";

// Khối nội dung có tiêu đề (icon + tên) — dùng lại cho các phần chart.
export function Section({
  icon,
  title,
  iconVariant = "cyan",
  children,
}: {
  icon: ReactNode;
  title: string;
  iconVariant?: "cyan" | "emerald" | "amber" | "rose" | "violet";
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6 print:border-slate-300 print:shadow-none">
      <div className="mb-4 flex items-center gap-2.5">
        <IconBox variant={iconVariant} size="sm">
          {icon}
        </IconBox>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Thân báo cáo: KPI + mọi chart + nhận xét. `content` là văn bản cô viết. */
export function ReportBody({ content, stats }: { content: string; stats: ReportStats | null }) {
  const avg = stats?.avg_pct != null ? Math.round(stats.avg_pct) : null;
  const best = stats?.by_skill
    .filter((s) => s.avg_pct != null)
    .sort((a, b) => (b.avg_pct as number) - (a.avg_pct as number))[0];
  const hasTimeline = (stats?.timeline.length ?? 0) >= 2;
  // Tách "trả lời sai" khỏi "bỏ trống". Fallback cho báo cáo cũ (chưa có cờ `blank`):
  // coi là bỏ trống khi phần trả lời rỗng.
  const allMistakes = stats?.mistakes ?? [];
  const isBlank = (m: (typeof allMistakes)[number]) => m.blank ?? !m.student_answer?.trim();
  const wrongMistakes = allMistakes.filter((m) => !isBlank(m));
  const blankMistakes = allMistakes.filter(isBlank);
  const hasFocus = (stats?.focus?.length ?? 0) > 0;
  const hasGrammar = (stats?.grammar?.length ?? 0) > 0;
  const hasSkills = stats?.by_skill.some((s) => s.avg_pct != null) ?? false;
  const hasQtypes = (stats?.question_types?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* KPI tiles — chỉ hiện khi có snapshot số liệu */}
      {stats ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            icon={<ListChecks className="size-6" />}
            variant="cyan"
            label={t("report.report.exercisesDone")}
            value={String(stats.exercises_done)}
          />
          <KpiTile
            icon={<Target className="size-6" />}
            variant="emerald"
            label={t("report.report.averageScore")}
            value={avg != null ? `${avg}%` : "—"}
          />
          <KpiTile
            icon={<Award className="size-6" />}
            variant="violet"
            label={t("report.report.bestSkill")}
            value={best ? skillLabel(best.skill) : "—"}
          />
          <KpiTile
            icon={<TriangleAlert className="size-6" />}
            variant="amber"
            label={t("report.report.needsImprovement")}
            value={String(stats.mistakes.length)}
          />
        </div>
      ) : null}

      {/* Chuyên cần & xếp hạng */}
      {stats?.attendance ? (
        <Section icon={<CalendarCheck className="size-4" />} iconVariant="emerald" title={t("report.report.attendance")}>
          <AttendanceStats data={stats.attendance} />
        </Section>
      ) : null}

      {/* Chart theo kỹ năng */}
      {hasSkills && stats ? (
        <Section icon={<BarChart3 className="size-4" />} title={t("report.report.skillScores")}>
          <SkillBars data={stats.by_skill} />
        </Section>
      ) : null}

      {/* Độ chính xác theo loại câu */}
      {hasQtypes && stats?.question_types ? (
        <Section icon={<ListTree className="size-4" />} title={t("report.report.questionAccuracy")}>
          <QuestionTypeBars data={stats.question_types} />
        </Section>
      ) : null}

      {/* Timeline điểm */}
      {hasTimeline && stats ? (
        <Section icon={<TrendingUp className="size-4" />} title={t("report.report.scoreTimeline")}>
          <ScoreTimeline data={stats.timeline} />
        </Section>
      ) : null}

      {/* Luyện đọc to (chấm phát âm) */}
      {stats?.reading && stats.reading.count > 0 ? (
        <Section icon={<Mic className="size-4" />} title={t("report.report.readingPractice")}>
          <ReadingReport data={stats.reading} />
        </Section>
      ) : null}

      {/* Tiến độ từ vựng */}
      {stats?.vocab && (stats.vocab.sessions > 0 || stats.vocab.words_mastered > 0) ? (
        <Section icon={<Type className="size-4" />} title={t("report.report.vocabularyProgress")}>
          <VocabStats data={stats.vocab} />
        </Section>
      ) : null}

      {/* Nhận xét của cô (AI) */}
      <Section icon={<GraduationCap className="size-4" />} title={t("report.report.teacherFeedback")}>
        <Narrative content={content} />
      </Section>

      {/* Trọng tâm cần luyện */}
      {hasFocus && stats?.focus ? (
        <Section icon={<TriangleAlert className="size-4" />} iconVariant="amber" title={t("report.report.focus")}>
          <FocusList data={stats.focus} />
        </Section>
      ) : null}

      {/* Cấu trúc ngữ pháp còn yếu */}
      {hasGrammar && stats?.grammar ? (
        <Section icon={<BookText className="size-4" />} title={t("report.report.grammarReview")}>
          <GrammarNotes points={pointsFromWeak(stats.grammar)} title="" />
        </Section>
      ) : null}

      {/* Câu trả lời sai (có cố gắng nhưng chưa đúng) */}
      {wrongMistakes.length ? (
        <Section icon={<CircleAlert className="size-4" />} iconVariant="rose" title={t("report.report.wrongAnswers")}>
          <MistakesList data={wrongMistakes} />
        </Section>
      ) : null}

      {/* Câu bỏ trống — tách riêng kèm CẢNH BÁO: bỏ trống không giúp em học */}
      {blankMistakes.length ? (
        <Section icon={<PencilOff className="size-4" />} iconVariant="amber" title={t("report.report.blankAnswers", { n: blankMistakes.length })}>
          <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/30">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
              {t("report.report.blankWarningBefore")}<span className="font-bold">{blankMistakes.length}</span>{t("report.report.blankWarningAfter")}
            </p>
          </div>
          <BlankList data={blankMistakes} />
        </Section>
      ) : null}
    </div>
  );
}
