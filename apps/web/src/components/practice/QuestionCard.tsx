import { useState } from "react";
import { Lightbulb } from "lucide-react";
import type { TranslateLevel } from "@msyen/shared";
import type { PublicQuestionResp } from "../../lib/api";
import { Badge } from "../Badge";
import { cn } from "../../lib/utils";
import { QImage } from "./QImage";
import { MultipleChoiceInput } from "./inputs/MultipleChoiceInput";
import { FillBlankInput } from "./inputs/FillBlankInput";
import { MatchingInput } from "./inputs/MatchingInput";
import { OrderingInput } from "./inputs/OrderingInput";
import { CategorizeInput } from "./inputs/CategorizeInput";
import { TranslateInput } from "./inputs/TranslateInput";
import { QTYPE_THUMB, QTYPE_HOWTO } from "../../lib/questionTypes";
import { t } from "../../i18n";

export function QuestionCard({
  q,
  index,
  value,
  onChange,
  graded,
  correct,
  credit,
  correctAnswer,
  isMobile,
  oneCol,
  translateLevel,
  onUseHint,
}: {
  q: PublicQuestionResp;
  index: number;
  value: string | undefined;
  onChange: (v: string) => void;
  graded: boolean;
  correct?: boolean;
  credit?: number; // điểm phần 0..1 — matching/categorize có thể đúng một phần
  correctAnswer?: string | null;
  isMobile: boolean;
  oneCol?: boolean;
  translateLevel?: TranslateLevel; // scaffolding rung for `translate` questions (per exercise)
  onUseHint?: () => void; // records that the hint was opened (saved with the submission)
}) {
  // Đúng một phần: có điểm phần trong (0,1) và chưa đúng hoàn toàn.
  const partial = graded && !correct && typeof credit === "number" && credit > 0 && credit < 1;
  const pctCredit = partial ? Math.round((credit as number) * 100) : 0;
  // Ép PublicQuestionResp → PublicQuestion (cùng hình dạng) cho các input.
  const inputProps = { q: q as never, value: value ?? "", onChange, graded, correctAnswer, isMobile, oneCol, translateLevel };
  const hasWordBank = !!q.word_bank && q.word_bank.length > 0;
  const [showHint, setShowHint] = useState(false);
  // Câu điền từ có "chỗ trống" inline (___ / {} / [..]) không: CÓ → câu do
  // FillBlankInput tự render (không cần dòng đề); KHÔNG → `question` là câu hỏi
  // dạng prompt (vd bài nghe "Where does Karen work?") nên PHẢI hiện làm đề chính.
  const fillHasBlank = q.type === "fill_blank" && /_{3,}|\{\}|\[[^\]]*\]/.test(q.question ?? "");
  // Đề bài (dòng chính, to, TIẾNG ANH) — như các dạng khác, câu điền từ CŨNG có đề riêng:
  // 1 lời DẪN tiếng Anh (không lặp lại câu), còn CÂU + ô điền + gợi ý "(...)" nằm ở thân dưới.
  const fillHasCue = /\([^)]*\)/.test(q.question ?? ""); // có gợi ý dạng "(be)"/"(live)"
  const headerText =
    q.type === "fill_blank"
      ? hasWordBank
        ? `Choose the correct word to fill in the blank: ${q.word_bank!.join(", ")}`
        : fillHasBlank
          ? fillHasCue
            ? "Complete the sentence with the correct form of the word in brackets."
            : "Fill in the blank with the correct word."
          : q.question || null // câu điền dạng prompt (không có marker chỗ trống)
      : q.question || null;
  // Dòng hướng dẫn CÁCH LÀM (tiếng Việt, nhỏ) — nằm DƯỚI đề tiếng Anh, như mọi dạng câu khác.
  const howto =
    q.type === "fill_blank"
      ? hasWordBank
        ? t("practice2.question.fill.chooseWord")
        : fillHasBlank
          ? fillHasCue
            ? t("practice2.question.fill.conjugate")
            : t("practice2.question.fill.complete")
          : t("practice2.question.fill.enter")
      : QTYPE_HOWTO[q.type] ?? null;
  // Hint (text-only, no chip) — ONE-WAY: opening costs half the points, so it cannot be
  // closed again. Rendered twice: floating on the card's top border on mobile, inline right
  // of the title on desktop.
  const hintBtn = (className: string) =>
    !graded && q.hint && !showHint ? (
      <button
        type="button"
        onClick={() => {
          onUseHint?.();
          setShowHint(true);
        }}
        className={cn(
          "items-center gap-1 whitespace-nowrap font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
          className,
        )}
      >
        <Lightbulb className="size-3 sm:size-3.5" />
        {t("practice2.question.hint")}
      </button>
    ) : null;
  return (
    <div
      id={`q-${q.position}`}
      className={cn(
        // Mobile: padding hẹp hơn (p-3.5) để tăng tiết diện nội dung; PC giữ p-5.
        "relative scroll-mt-24 rounded-2xl border bg-white p-3.5 sm:p-5 dark:bg-slate-900",
        !graded && "border-slate-200 dark:border-slate-800",
        graded && correct && "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-500/10",
        graded && partial && "border-sky-300 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-500/10",
        graded && !correct && !partial && "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-500/10",
      )}
    >
      {/* Mobile: nút gợi ý NỔI trên mép viền trên của card (nền theo card để che viền) →
          không chiếm dòng nào, hàng đề bài giữ nguyên chiều cao. */}
      {hintBtn(
        "absolute -top-2.5 right-3 z-10 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-slate-200 sm:hidden dark:bg-slate-900 dark:ring-slate-800",
      )}
      {/* Header: thumb số thứ tự (trái) · đề bài (phải). Không còn tagline loại.
          items-center để câu 1 dòng canh giữa theo thumb (không lệch lên trên). */}
      <div className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold tabular-nums ring-1",
            QTYPE_THUMB[q.type],
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          {graded && (
            <div className="mb-1.5 flex">
              <Badge tone={correct ? "emerald" : partial ? "sky" : "amber"} className="ml-auto">
                {correct ? t("practice2.question.correct") : partial ? t("practice2.question.partiallyCorrect", { n: pctCredit }) : t("practice2.question.incorrect")}
              </Badge>
            </div>
          )}
          {/* Đề bài — to hơn ở PC cho dễ đọc (đã bỏ tagline nên có chỗ). */}
          <div className="flex items-start gap-3">
            {headerText && (
              <p className="min-w-0 flex-1 text-base font-medium leading-snug text-slate-800 sm:text-lg dark:text-slate-100">
                {headerText}
              </p>
            )}
            {hintBtn("mt-1 ml-auto hidden shrink-0 text-xs sm:inline-flex")}
          </div>
          {/* Dòng hướng dẫn CÁCH LÀM (nhỏ, mờ) — chỉ khi chưa chấm, chỉ ở PC. */}
          {!graded && howto && (
            <p className="mt-1 hidden text-xs leading-snug text-slate-400 sm:block dark:text-slate-500">{howto}</p>
          )}
        </div>
      </div>

      <QImage src={q.image} />

      {/* Gợi ý NGHE per-câu: nút vàng → hiện ĐOẠN hội thoại ngắn chứa manh mối cho CHÍNH câu này
          (không phải cả bài). Ghi hintUsed khi mở. */}
      {!graded && q.hint && showHint && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-slate-700 dark:border-amber-700 dark:bg-amber-500/10 dark:text-slate-200">
          <p className="whitespace-pre-line">{q.hint}</p>
        </div>
      )}

      {q.type === "multiple_choice" ? (
        <MultipleChoiceInput {...inputProps} />
      ) : q.type === "fill_blank" ? (
        <FillBlankInput {...inputProps} />
      ) : q.type === "matching" ? (
        <MatchingInput {...inputProps} />
      ) : q.type === "ordering" ? (
        <OrderingInput {...inputProps} />
      ) : q.type === "categorize" ? (
        <CategorizeInput {...inputProps} />
      ) : q.type === "translate" ? (
        <TranslateInput {...inputProps} />
      ) : null}

      {/* Đáp án đúng (dạng text) — bổ trợ cho các loại không tô trực tiếp trong input. */}
      {graded && !correct && correctAnswer && q.type !== "multiple_choice" && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
          {t("practice2.question.correctAnswer")} <strong className="text-emerald-700 dark:text-emerald-400">{correctAnswer}</strong>
        </p>
      )}

      {/* Giải thích (nếu có) — hiện khi đã chấm. KHÔNG khung/nền, chỉ icon + chữ. */}
      {graded && q.explanation && (
        <div className="mt-3 flex gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-cyan-500" />
          <p className="whitespace-pre-line leading-relaxed">{q.explanation}</p>
        </div>
      )}
    </div>
  );
}
