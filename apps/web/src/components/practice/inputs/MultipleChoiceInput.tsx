import { useEffect } from "react";
import { Check } from "lucide-react";
import type { QuestionInputProps } from "../types";
import { cn } from "../../../lib/utils";

// Nhãn chữ cái A, B, C, D… cho từng lựa chọn.
function letterFor(index: number): string {
  return String.fromCharCode(65 + index); // 65 = 'A'
}

/**
 * Câu hỏi trắc nghiệm (đơn chọn).
 * encoding: value = ĐÚNG chuỗi option đã chọn.
 * Hỗ trợ phím tắt 1..9 và a..z để chọn nhanh khi chưa chấm.
 */
export function MultipleChoiceInput({ q, value, onChange, graded, correctAnswer, oneCol }: QuestionInputProps) {
  const options = q.options ?? [];

  // Phím tắt: gõ số (1..9) hoặc chữ (a..z) để chọn option tương ứng.
  useEffect(() => {
    if (graded) return; // đã chấm thì không cho thao tác

    function handleKey(e: KeyboardEvent) {
      // Bỏ qua khi người dùng đang gõ ở ô nhập khác (input/textarea/select/contenteditable).
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      let idx = -1;
      if (key >= "1" && key <= "9") {
        idx = Number(key) - 1; // '1' → index 0
      } else if (key >= "a" && key <= "z") {
        idx = key.charCodeAt(0) - 97; // 'a' → index 0
      }
      if (idx >= 0 && idx < options.length) {
        e.preventDefault();
        onChange(options[idx]);
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [options, onChange, graded]);

  // Mobile: nếu MỌI lựa chọn đều ngắn → xếp 2 cột cho cân đối; có lựa chọn dài
  // → 1 cột để không bị bó chữ. Desktop (sm+) luôn 2 cột.
  const compact = options.length > 1 && options.every((o) => o.length <= 14);

  return (
    <div className={cn("grid gap-2", oneCol ? "grid-cols-1" : cn("sm:grid-cols-2", compact ? "grid-cols-2" : "grid-cols-1"))}>
      {options.map((opt, idx) => {
        const selected = value === opt;
        const isCorrect = graded && correctAnswer != null && opt === correctAnswer;
        // Option người dùng chọn nhưng KHÁC đáp án đúng → tô đỏ.
        const isWrongPick = graded && selected && correctAnswer != null && opt !== correctAnswer;

        return (
          <button
            key={idx}
            type="button"
            disabled={graded}
            onClick={() => !graded && onChange(opt)}
            className={cn(
              "group relative flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
              graded ? "cursor-default" : "cursor-pointer",
              // Đáp án đúng (khi chấm) → viền/nền emerald nhạt.
              isCorrect && "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-200",
              // Chọn sai (khi chấm) → viền/nền rose nhạt.
              isWrongPick && "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
              // Đang chọn (chưa chấm) → viền cyan + nền cyan nhạt (đơn sắc, gọn).
              !graded && selected && "border-cyan-500 bg-cyan-50 text-slate-800 dark:border-cyan-400/70 dark:bg-cyan-500/10 dark:text-slate-100",
              // Nghỉ (chưa chấm) → thẻ trắng, viền slate, hover cyan nhạt.
              !graded && !selected && "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/5",
              // Đã chấm, không liên quan → mờ nhẹ.
              graded && !isCorrect && !isWrongPick && "border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-800/40",
            )}
          >
            {/* Badge chữ cái — nhỏ, đơn sắc */}
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-bold transition-colors",
                isCorrect
                  ? "bg-emerald-500 text-white"
                  : isWrongPick
                    ? "bg-rose-500/15 text-rose-600 dark:bg-rose-500/25 dark:text-rose-300"
                    : !graded && selected
                      ? "bg-cyan-500 text-white"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
              )}
            >
              {letterFor(idx)}
            </span>

            {/* Nội dung lựa chọn */}
            <span className="flex-1 text-[15px] font-medium leading-snug">{opt}</span>

            {/* Tick nhỏ khi đang chọn / đáp án đúng */}
            {(isCorrect || (!graded && selected)) && (
              <Check className={cn("size-4 shrink-0", isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-cyan-600 dark:text-cyan-400")} strokeWidth={3} />
            )}
          </button>
        );
      })}
    </div>
  );
}
