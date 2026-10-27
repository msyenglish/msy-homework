// TỔNG KẾT một bài Nghe & Nói. Trước đây làm xong câu cuối là hết — không có chỗ nào nhìn lại
// buổi học, cũng không có chỗ gắn nút nhận xét. Trang gom cả hai chế độ (dictation + shadowing)
// vì chúng là hai kỹ năng trên CÙNG một bài.-4.6.
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  BookText,
  ChevronDown,
  ClipboardList,
  Eye,
  Flame,
  Keyboard,
  Lightbulb,
  Loader2,
  Lock,
  Mic,
  Moon,
  PenLine,
  Play,
  RefreshCw,
  Sparkles,
  Sun,
  Target,
  Trophy,
} from "lucide-react";
import { WEAK_PRON_SCORE } from "@msyen/shared";
import { accountApi, videoLibraryApi, type VideoReport, type VideoReportLine } from "../../lib/api";
import { useGoBack } from "../../lib/navState";
import { HeroDecor } from "../../components/HeroDecor";
import { PracticeFooter } from "../../components/practice/PracticeFooter";
import { Tooltip } from "../../components/Tooltip";
import { useTheme } from "../../lib/theme";
import { t } from "../../i18n";

/** Thang màu điểm phát âm — cùng gam với badge chấm điểm ở trang luyện. */
function scoreTone(score: number): string {
  if (score >= 90) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (score >= 75) return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400";
  if (score >= 60) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
}

/**
 * Vòng ĐIỂM của buổi học — cùng ngôn ngữ thị giác với `ScoreRing` của bài đọc to/nói, nhưng
 * ruột là ĐIỂM (không phải thang 100) nên cung tròn vẽ theo tỉ lệ điểm đã lấy / điểm tối đa.
 */
function PointRing({ points, max }: { points: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (points / max) * 100)) : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <div className="pointer-events-none absolute size-28 rounded-full bg-cyan-500/15 blur-2xl dark:bg-cyan-400/15" />
      <svg viewBox="0 0 120 120" className="size-full -rotate-90 overflow-visible">
        <defs>
          <linearGradient id="vidPointGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" className="stroke-slate-200 dark:stroke-slate-700/60" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#vidPointGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          style={{ filter: "drop-shadow(0 0 5px rgba(34,211,238,0.45))" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-extrabold leading-none text-slate-900 dark:text-white">{points}</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">points</div>
      </div>
    </div>
  );
}

/**
 * Stat tile: thumb on the left, the number on its own row, one single line of meaning.
 * Splitting title and description across two rows ("Avg pronunciation" + "Out of 100") both
 * repeats itself and staggers the tiles when one wraps and its neighbour doesn't.
 */
function Stat({ icon: Icon, label, value, tone = "slate" }: {
  icon: typeof Target;
  label: string;
  value: string;
  tone?: "slate" | "cyan" | "amber" | "rose" | "violet";
}) {
  const TONE = {
    slate: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
    cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return (
    <div className="flex h-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
      {/* Thumb spans BOTH text rows — a smaller tile leaves the block top-heavy and loose. */}
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-none tabular-nums text-slate-800 dark:text-white">{value}</p>
        <p className="mt-1.5 text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/** Một câu trong "Hardest lines" / "Weakest pronunciation". */
function Line({ l, right, tone }: { l: VideoReportLine; right: string; tone?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
      <span className="w-6 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-slate-400 dark:text-slate-600">{l.segment + 1}</span>
      <span className="min-w-0 flex-1 text-sm leading-snug text-slate-700 dark:text-slate-300">{l.text}</span>
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${tone ?? "bg-slate-500/10 text-slate-500 dark:text-slate-400"}`}>
        {right}
      </span>
    </li>
  );
}

function Section({ icon: Icon, title, tone, points, children }: {
  icon: typeof Target;
  title: string;
  tone: string;
  /** Points this mode earned — sits in the title so the hero doesn't need a badge row. */
  points: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <span className={`flex size-7 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        {title}
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${tone}`}>{points} points</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * "Grammar to review" — mấy điểm ngữ pháp cô rút ra từ bài này. Mỗi mục GHIM được: ghim xong
 * trang /u/grammar sẽ nhắc lại cho tới khi em tự gỡ, nên buổi học không kết thúc ở trang này.
 */
function GrammarToReview({
  items,
  onRegen,
  regenBusy,
  regenLeft,
}: {
  items: { id: string; title: string; cefr: string }[];
  /** Viết lại nhận xét theo dữ liệu MỚI — học tiếp rồi thì bản cũ không còn đúng nữa. */
  onRegen: () => void;
  regenBusy: boolean;
  regenLeft: number;
}) {
  const [open, setOpen] = useState(true);
  const [marked, setMarked] = useState<Set<string>>(new Set());

  useEffect(() => {
    accountApi
      .grammarMarked()
      .then((r) => setMarked(new Set(r.items.map((m) => m.id))))
      .catch(() => {});
  }, []);

  const toggle = (id: string) => {
    const next = new Set(marked);
    const on = !next.has(id);
    if (on) next.add(id);
    else next.delete(id);
    setMarked(next);
    accountApi.grammarSetMarked(id, on).catch(() => setMarked(marked)); // hỏng thì trả lại như cũ
  };
  const markAll = () => {
    const ids = items.map((g) => g.id);
    setMarked(new Set([...marked, ...ids]));
    accountApi.grammarSetMarked(ids, true).catch(() => setMarked(marked));
  };
  const allMarked = items.every((g) => marked.has(g.id));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <BookText className="h-5 w-5" />
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Grammar to review</p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
            {t("userPages.videoReport.grammarToReviewDesc", { n: items.length })}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          className="shrink-0 text-slate-400 transition hover:text-cyan-500"
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1.5 border-t border-slate-100 p-3 dark:border-slate-800">
          {items.map((g) => {
            const on = marked.has(g.id);
            return (
              <div
                key={g.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-pressed={on}
                  title={on ? t("userPages.videoReport.unmarkTooltip") : t("userPages.videoReport.markTooltip")}
                  className={`grid size-8 shrink-0 place-items-center rounded-lg transition ${
                    on
                      ? "bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20"
                      : "text-slate-300 hover:bg-slate-100 hover:text-cyan-400 dark:text-slate-600 dark:hover:bg-slate-800"
                  }`}
                >
                  <Bookmark className={`h-4 w-4 ${on ? "fill-current" : ""}`} />
                </button>
                <Link to={`/u/grammar?focus=${g.id}`} className="min-w-0 flex-1 text-sm font-semibold text-slate-700 hover:text-cyan-600 dark:text-slate-200 dark:hover:text-cyan-400">
                  <span className="block truncate">{g.title}</span>
                </Link>
                <span className="shrink-0 rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {g.cefr}
                </span>
              </div>
            );
          })}
          {/* Hai hành động ĐÓNG buổi học, chia đôi hàng: ghim hết · nhờ cô xem lại lần nữa. */}
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={markAll}
              disabled={allMarked}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 text-sm font-semibold text-cyan-600 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:text-cyan-400 dark:disabled:border-slate-800 dark:disabled:text-slate-600"
            >
              <Bookmark className={`h-4 w-4 ${allMarked ? "fill-current" : ""}`} /> {allMarked ? "All marked" : "Mark all"}
            </button>
            <button
              onClick={onRegen}
              disabled={regenBusy || regenLeft <= 0}
              title={regenLeft > 0 ? t("userPages.videoReport.regenLeftTooltip", { n: regenLeft }) : t("userPages.videoReport.regenExhaustedTooltip")}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 text-sm font-semibold text-amber-600 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:text-amber-400 dark:disabled:border-slate-800 dark:disabled:text-slate-600"
            >
              {regenBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : regenLeft <= 0 ? <Lock className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {regenBusy ? t("userPages.videoReport.teacherReviewing") : t("userPages.videoReport.redoFeedback")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function VideoReportPage() {
  const { slug = "" } = useParams();
  const [sp] = useSearchParams();
  const goBack = useGoBack("/u/library");
  const { theme, toggle } = useTheme();
  const level = sp.get("level") ?? "medium";
  const [data, setData] = useState<VideoReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    videoLibraryApi.report(slug).then(setData).catch((e) => setErr((e as Error).message));
  }, [slug]);

  const askFeedback = async (regen = false) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await videoLibraryApi.feedback(slug, level, regen);
      setData((d) =>
        d
          ? {
              ...d,
              feedback: r.feedback,
              // Viết lại thì danh sách ngữ pháp cũng thay theo; giữ bản cũ chỉ đúng ở lần đầu.
              grammar: regen ? (r.grammar ?? []) : r.grammar?.length ? r.grammar : d.grammar,
              feedback_left: r.cached ? d.feedback_left : Math.max(0, d.feedback_left - 1),
            }
          : d,
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !data) return <p className="p-6 text-center text-sm text-rose-500">{err}</p>;
  if (!data)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const d = data.dictation;
  const sh = data.shadow;
  const pct = data.total ? Math.round((d.done / data.total) * 100) : 0;
  const locked = !data.feedback && data.feedback_left <= 0;
  const maxTotal = (data.max.dictation[data.level ?? level] ?? 0) + data.max.shadow;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
      {/* HERO — hoạ tiết + vầng gradient, vòng ĐIỂM làm tâm điểm bên phải (giống report đọc to). */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-cyan-50/40 to-slate-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-cyan-950/20 dark:to-slate-950 sm:p-6">
        <HeroDecor seed={slug} mobile />
        <div className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-400/10" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 dark:text-cyan-400">
                <ClipboardList className="size-5.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
                  Session summary{data.level ? ` · ${data.level}` : ""}
                </p>
                <h1 className="mt-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-xl">
                  {data.title}
                </h1>
              </div>
            </div>
            {/* Dictation progress as a bar, not a long sentence. */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>
                  {d.done}/{data.total} lines
                  {sh.done > 0 && ` · ${sh.done} spoken`}
                  {d.days > 1 && ` · ${d.days} days`}
                </span>
                <span className="tabular-nums">{pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="flex justify-center sm:justify-end">
            <PointRing points={d.points + sh.points} max={maxTotal} />
          </div>
        </div>
      </header>

      <div className="space-y-5">
        <Section icon={PenLine} title="Dictation" points={d.points} tone="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Stat icon={Keyboard} label="Words typed by ear" value={d.typed_words.toLocaleString()} tone="cyan" />
            <Stat icon={Flame} label="Longest first-try streak" value={`${d.streak}`} tone="amber" />
            <Stat icon={Target} label="Lines typed right on the first try" value={`${d.first_ok}`} tone="cyan" />
            <Stat icon={PenLine} label={`Lines finished, out of ${data.total}`} value={`${d.done}`} />
            <Stat icon={Lightbulb} label="Lines where you peeked at a hint" value={`${d.hint_lines}`} tone="amber" />
            <Stat icon={Eye} label="Lines you revealed the answer for" value={`${d.revealed}`} tone="rose" />
          </div>
          {d.tricky.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Words to look up again{" "}
                <span className="font-normal text-slate-400">· needed the full hint or the answer</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {d.tricky.map((t) => (
                  <span
                    key={`${t.segment}-${t.word}`}
                    title={`Line ${t.segment + 1}`}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      t.why === "revealed"
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {t.why === "revealed" ? <Eye className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />}
                    {t.word}
                  </span>
                ))}
              </div>
            </div>
          )}
          {d.hardest.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Hardest lines</p>
              <ul className="space-y-1.5">
                {d.hardest.map((l) => (
                  <Line key={l.segment} l={l} right={`${l.attempts ?? 0}×`} tone="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
                ))}
              </ul>
            </div>
          )}
        </Section>

        {sh.done > 0 && (
          <Section icon={Mic} title="Shadowing" points={sh.points} tone="bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Stat icon={Mic} label={`Lines spoken, out of ${data.total}`} value={`${sh.done}`} tone="violet" />
              <Stat icon={Target} label="Average pronunciation, out of 100" value={`${sh.avg}`} tone="violet" />
              <Stat icon={Trophy} label="Points earned from speaking out loud" value={`${sh.points}`} tone="violet" />
              <Stat icon={Trophy} label="Points if you speak every line" value={`${data.max.shadow}`} />
            </div>
            {sh.weakest.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Weakest pronunciation <span className="font-normal text-slate-400">· below {WEAK_PRON_SCORE}/100</span>
                </p>
                <ul className="space-y-1.5">
                  {sh.weakest.map((l) => (
                    <Line key={l.segment} l={l} right={`${Math.round(l.score ?? 0)}`} tone={scoreTone(l.score ?? 0)} />
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {/* NHẬN XÉT — icon + tiêu đề + mô tả bên trái, nút inline bên phải. */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t("userPages.videoReport.feedbackTitle")}</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                {data.feedback
                  ? t("userPages.videoReport.feedbackDone")
                  : locked
                    ? t("userPages.videoReport.feedbackExhaustedDesc")
                    : t("userPages.videoReport.feedbackAvailableDesc", { n: data.feedback_left })}
              </p>
            </div>
            {!data.feedback && (
              <button
                onClick={() => askFeedback()}
                disabled={busy || locked}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : locked ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Writing…" : locked ? "Locked" : t("userPages.videoReport.askTeacher")}
              </button>
            )}
          </div>
          {data.feedback && (
            <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:text-slate-200">
              {data.feedback}
            </p>
          )}
          {err && <p className="mt-2 text-sm text-rose-500">{err}</p>}
        </section>

        {/* Nối thẳng sang sổ tay ngữ pháp — nhận xét chỉ ra chỗ yếu thì phải có đường học tiếp. */}
        {data.grammar?.length > 0 && (
          <GrammarToReview
            items={data.grammar}
            onRegen={() => askFeedback(true)}
            regenBusy={busy}
            regenLeft={data.feedback_left}
          />
        )}

        {/* Nhận xét rồi mà KHÔNG có điểm ngữ pháp nào → nút viết lại đứng riêng, khỏi mất lối. */}
        {data.feedback && !data.grammar?.length && (
          <button
            onClick={() => askFeedback(true)}
            disabled={busy || data.feedback_left <= 0}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 text-sm font-semibold text-amber-600 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:text-amber-400 dark:disabled:border-slate-800 dark:disabled:text-slate-600"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : data.feedback_left <= 0 ? <Lock className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {busy ? t("userPages.videoReport.teacherReviewing") : t("userPages.videoReport.redoFeedback")}
          </button>
        )}
      </div>

      <PracticeFooter />

      {/* Thanh hành động DÍNH ĐÁY — cùng khuôn với trang kết quả đọc to (ReadingPractice). */}
      <div className="sticky bottom-0 z-30 -mx-3 mt-4 flex gap-2 border-t border-slate-200 bg-slate-100/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:-mx-4 sm:px-4">
        <Tooltip label="Back to library">
          <button
            onClick={goBack}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> Library
          </button>
        </Tooltip>
        <Tooltip label={theme === "dark" ? "Light mode" : "Dark mode"}>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </Tooltip>
        <Link
          to={`/u/video/${slug}?mode=dictation&level=${level}`}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 text-sm font-semibold text-white transition hover:bg-cyan-600"
        >
          <Play className="h-4 w-4" /> Keep practising
        </Link>
      </div>
    </div>
  );
}
