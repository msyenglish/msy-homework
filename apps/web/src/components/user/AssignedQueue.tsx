// ============================================================
//  Khối "MSY English assigned" — HÀNG CHỜ TRƯỢT.
//  Four zones: ① open slots · ② attempted but still under the pass mark · ③ blurred next-up
//  teaser · ④ the exercises already passed (always open, paged).
//  Server quyết trạng thái (`assign_state`, `locked`); component chỉ xếp chỗ và vẽ.
// ============================================================
import { useState } from "react";
import { CheckCircle2, ClipboardList, Info, Lock, RotateCcw } from "lucide-react";
import type { AssignedQueueSummary, LibraryItem } from "@msyen/shared";
import { tt } from "../../lib/brand";
import { t } from "../../i18n";

// The passed group is always open, so it pages in small steps to stay out of the way.
const DONE_PAGE = 6;

export function AssignedQueue({
  items,
  summary,
  listWrap,
  renderCard,
}: {
  items: LibraryItem[];
  summary: AssignedQueueSummary;
  /** Lớp bao danh sách (lưới/danh sách) — dùng chung với thư viện. */
  listWrap: string;
  /** Vẽ một bài — `forceList` để nhóm đã làm luôn ở dạng DÒNG kể cả khi đang xem lưới. */
  renderCard: (it: LibraryItem, opts?: { forceList?: boolean; compact?: boolean }) => React.ReactNode;
}) {
  const [shown, setShown] = useState(DONE_PAGE);
  if (!items.length) return null;

  const byRecent = (a: LibraryItem, b: LibraryItem) =>
    (b.last_attempt_at ?? "").localeCompare(a.last_attempt_at ?? "");
  // ① open slots · ② attempted but NOT passed · ③ next locked teaser · ④ passed.
  const active = items.filter((it) => it.queued);
  const lockedNext = items.find((it) => it.assign_state === "locked");
  // Below the pass mark and out of slots, or tried 3 times without passing: these are NOT "done".
  // Dimmed among the passed ones they would read as finished, hiding the work still owed.
  const notPassed = items
    .filter((it) => it.assign_state === "waiting" || it.assign_state === "stuck")
    .sort(byRecent);
  const stuck = notPassed.filter((it) => it.assign_state === "stuck").length;
  // Passed group: most recently finished first.
  const rest = items.filter((it) => it.assign_state === "passed").sort(byRecent);
  const done = summary.passed;
  const progress = summary.total ? Math.round((done / summary.total) * 100) : 0;

  return (
    <section className="mb-5 rounded-2xl border border-violet-200 bg-violet-50/40 p-3 sm:p-4 dark:border-violet-900/60 dark:bg-violet-500/5">
      {/* Đầu khối: tiêu đề + tiến độ lộ trình */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">
          <ClipboardList className="size-4" /> {tt("MSY English assigned")}
        </span>
        <span className="text-xs font-semibold text-slate-500">
          {done}/{summary.total} done
        </span>
        <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-violet-200/70 dark:bg-violet-900/50">
          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Lời nhắc: vì sao chưa mở hết + cần làm gì để mở tiếp. */}
      {(summary.locked > 0 || summary.redo > 0) && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
          <Info className="mt-0.5 size-3.5 shrink-0 text-violet-500" />
          <span>
            {t("userPages.assignedQueue.windowNoticePrefix", { window: summary.window })}
            <b>{t("userPages.assignedQueue.windowNoticeBold", { passPct: summary.pass_pct })}</b>
            {t("userPages.assignedQueue.windowNoticeSuffix")}
            {summary.redo > 0 && t("userPages.assignedQueue.redoSuggestion")}
          </span>
        </p>
      )}

      {/* ① Cần làm ngay */}
      <div className={listWrap}>{active.map((it) => renderCard(it))}</div>

      {/* ② Not passed — shown at full strength: work still owed, not work already finished */}
      {notPassed.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs font-bold text-amber-600 dark:text-amber-400">
            <RotateCcw className="size-3.5" /> {t("userPages.assignedQueue.notPassedTitle", { count: notPassed.length })}
            <span className="font-medium text-slate-500">
              {t("userPages.assignedQueue.passCondition", { passPct: summary.pass_pct })}
              {stuck > 0 && t("userPages.assignedQueue.stuckNotice", { n: stuck, count: stuck })}
            </span>
          </p>
          <div className={listWrap}>{notPassed.map((it) => renderCard(it))}</div>
        </div>
      )}

      {/* ③ Next-up teaser — blurred, not clickable */}
      {lockedNext && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-violet-300 bg-white/60 p-3 dark:border-violet-800 dark:bg-slate-900/40">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-500 dark:bg-violet-500/15">
            <Lock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-500 blur-[3px] select-none dark:text-slate-400">
              {lockedNext.title}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {t("userPages.assignedQueue.remainingLocked", { n: summary.locked, count: summary.locked })}
            </p>
          </div>
        </div>
      )}

      {/* ④ Passed exercises — always open; the list is kept short by paging, not by folding. */}
      {rest.length > 0 && (
        <div className="mt-3">
          <p className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-semibold text-slate-500">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            {t("userPages.assignedQueue.passedCount", { count: rest.length })}
            <span className="h-px flex-1 bg-violet-200 dark:bg-violet-900" />
          </p>
          <div className="mt-1.5 grid gap-2 lg:grid-cols-2">
            {/* Same compact done row as the library's "Done" section. */}
            {rest.slice(0, shown).map((it) => renderCard(it, { compact: true }))}
          </div>
          {rest.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + DONE_PAGE)}
                className="mt-2 w-full rounded-xl bg-violet-100/70 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/15"
              >
                {t("userPages.assignedQueue.showMore", { n: Math.min(DONE_PAGE, rest.length - shown), count: Math.min(DONE_PAGE, rest.length - shown) })}
              </button>
            )}
        </div>
      )}
    </section>
  );
}
