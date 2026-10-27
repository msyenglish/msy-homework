// Pieces shared by every place that builds a vocabulary deck (exercise editor, AI composer).
import type { VocabActivity } from "@msyen/shared";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";
import { VOCAB_ACTIVITY_LIST } from "../practice/vocab/registry";

/** Default activities (everything except pronunciation). */
export const DEFAULT_DECK_ACTS: VocabActivity[] = [
  "flashcard",
  "matching",
  "listen_choice",
  "recall",
  "dictation",
];

/** Tách danh sách từ thô: xuống dòng và/hoặc dấu phẩy, trim + khử trùng (không phân biệt hoa thường). */
export function parseWordList(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Hàng chip bật/tắt dạng luyện. */
export function ActivityChips({
  value,
  onChange,
  label = "teacherVocab.deck.activityTypes",
  note,
}: {
  value: VocabActivity[];
  onChange: (v: VocabActivity[]) => void;
  label?: TKey | null;
  note?: string;
}) {
  const toggle = (id: VocabActivity) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t(label)}</label>
      )}
      <div className="flex flex-wrap gap-1.5">
        {VOCAB_ACTIVITY_LIST.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => toggle(a.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              value.includes(a.id)
                ? "border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      {note && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}
