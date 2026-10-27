import type { QuestionInputProps } from "../types";
import { Input } from "../../ui";
import { cn } from "../../../lib/utils";
import { t } from "../../../i18n";

// Nhận diện chỗ trống trong câu: `___` (≥3 gạch dưới) · `{}` · `[...]`.
const BLANK_RE = /_{3,}|\{\}|\[[^\]]*\]/g;

// Render một đoạn text: gợi ý trong ngoặc "(be)"/"(never/be)" hiện MỜ, nhỏ (không bỏ đi —
// vì câu này là ĐỀ chính, không còn dòng đề lặp ở trên). Phần chữ thường giữ nguyên.
function renderSegment(text: string) {
  return text.split(/(\([^)]*\))/g).map((part, i) =>
    /^\([^)]*\)$/.test(part) ? (
      <span key={i} className="text-[0.8em] font-normal text-slate-400 dark:text-slate-500">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Câu hỏi điền vào chỗ trống.
 * encoding: value = chuỗi học sinh gõ (plain text).
 * - Nếu câu có marker chỗ trống → chèn ô điền inline ngay tại vị trí đó
 *   (chỉ chỗ trống ĐẦU tiên là ô nhập; các chỗ sau hiển thị tĩnh).
 * - Nếu không có marker → hiện 1 ô điền đầy đủ.
 */
export function FillBlankInput({
  q,
  value,
  onChange,
  graded,
}: QuestionInputProps) {
  // Tách câu thành các đoạn text + đánh dấu vị trí chỗ trống.
  const segments: { text: string; blank: boolean }[] = [];
  const question = q.question ?? "";
  let lastIndex = 0;
  BLANK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLANK_RE.exec(question)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: question.slice(lastIndex, match.index),
        blank: false,
      });
    }
    segments.push({ text: "", blank: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < question.length) {
    segments.push({ text: question.slice(lastIndex), blank: false });
  }

  const hasBlank = segments.some((s) => s.blank);

  // ----- Không có marker: 1 ô điền đầy đủ -----
  if (!hasBlank) {
    return (
      <Input
        label={t("practice2.input.answer")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={graded}
        placeholder={t("practice2.input.answerPlaceholder")}
        autoCapitalize="none"
        autoCorrect="off"
      />
    );
  }

  // ----- Có marker: điền inline ngay trong câu -----
  // Không khung/không nền — câu chữ thoáng, chỗ trống chỉ là gạch chân.
  let firstBlankUsed = false;
  return (
    <div className="px-1 py-2 text-lg leading-[2.6] text-slate-700 dark:text-slate-200">
      {segments.map((seg, i) => {
        if (!seg.blank) {
          return <span key={i}>{renderSegment(seg.text)}</span>;
        }
        // Chỗ trống đầu tiên → ô nhập; các chỗ sau → gạch tĩnh.
        if (!firstBlankUsed) {
          firstBlankUsed = true;
          return (
            <input
              key={i}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={graded}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="…"
              className={cn(
                // Chỉ gạch chân — không khung, không viền focus, không ring.
                "mx-1.5 inline-block min-w-[120px] border-0 border-b-2 border-cyan-300 bg-transparent px-1 pb-0.5 text-center align-baseline text-lg",
                "font-semibold text-cyan-700 outline-none transition-colors placeholder:text-slate-300 focus:border-cyan-500 focus:outline-none focus:ring-0",
                "dark:border-cyan-500/50 dark:text-cyan-300 dark:placeholder:text-slate-600 dark:focus:border-cyan-400",
                "disabled:cursor-not-allowed disabled:opacity-70",
              )}
            />
          );
        }
        return (
          <span key={i} className="mx-1 select-none font-semibold text-slate-300 dark:text-slate-600">
            ____
          </span>
        );
      })}
    </div>
  );
}
