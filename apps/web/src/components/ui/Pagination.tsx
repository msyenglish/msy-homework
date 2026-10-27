// Thanh phân trang dùng chung: [←] 1 … 4 5 6 … 20 [→] + chọn số mục mỗi trang.
// Hiện tối đa 7 nút số (đầu · cuối · quanh trang hiện tại), phần khuyết thay bằng "…".
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { Select } from "./select";
import { t } from "../../i18n";

export const PER_PAGE_OPTIONS = [20, 40, 60, 100];

/** Dãy số trang cần vẽ; `0` = dấu "…". */
function pageList(page: number, last: number): number[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const around = [page - 1, page, page + 1].filter((p) => p > 1 && p < last);
  const out = [1, ...(around[0]! > 2 ? [0] : []), ...around];
  if (around[around.length - 1]! < last - 1) out.push(0);
  return [...out, last];
}

export function Pagination({
  page,
  perPage,
  total,
  onPage,
  onPerPage,
  unit = t("shared.pagination.item"),
  className,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (p: number) => void;
  onPerPage?: (n: number) => void;
  /** Đơn vị đếm hiển thị sau tổng số ("bài", "tài khoản", "học sinh"…). */
  unit?: string;
  className?: string;
}) {
  const last = Math.max(1, Math.ceil(total / perPage));
  // Hidden while everything fits in the smallest page size; page buttons only once there is a page 2.
  if (total <= PER_PAGE_OPTIONS[0]) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition disabled:opacity-40";
  const plain =
    "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2", className)}>
      {/* Trái: "1–24 / 315" + ô chọn số mục — cùng một cụm, không tách xuống dòng riêng.
          Đóng khung (viền + nền bo góc) đồng bộ với ô chọn per-page cạnh nó, thay vì chữ trần. */}
      <div className="flex items-center gap-2">
        <p className="flex h-9 items-center whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          {from}–{to} / <span className="mx-1 font-semibold text-slate-700 dark:text-slate-300">{total}</span> {unit}
        </p>
        {onPerPage && (
          <Select
            options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: t("shared.pagination.perPage", { n }) }))}
            value={String(perPage)}
            onChange={(v) => onPerPage(Number(v))}
            className="!h-9 !w-[7.5rem] !rounded-lg !px-3 !text-sm"
            menuClassName="!w-[7.5rem]"
          />
        )}
      </div>
      {last > 1 && (
      <div className="flex items-center gap-1.5">
        <button type="button" className={cn(btn, plain)} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("shared.pagination.previousPage")}>
          <ChevronLeft className="size-4" />
        </button>
        {pageList(page, last).map((p, i) =>
          p === 0 ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              className={cn(
                btn,
                p === page
                  ? "border-cyan-500 bg-cyan-500 text-white shadow-sm shadow-cyan-500/30"
                  : plain,
              )}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className={cn(btn, plain)} disabled={page >= last} onClick={() => onPage(page + 1)} aria-label={t("shared.pagination.nextPage")}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      )}
    </div>
  );
}
