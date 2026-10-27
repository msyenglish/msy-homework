// Chips chọn nhiều CHỦ ĐỀ (topic) — dùng cho onboarding + hồ sơ user.
// Bấm để bật/tắt; chip bật tô màu chủ đề. Rỗng = quan tâm tất cả.
import type { ReactNode } from "react";
import type { Topic } from "@msyen/shared";
import { Check } from "lucide-react";
import { TopicIcon } from "../lib/topicIcons";
import { cn } from "../lib/utils";

export function TopicChips({
  topics,
  selected,
  onChange,
  trailing,
  mutedUnselected = false,
}: {
  topics: Topic[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Phần tử phụ hiển thị INLINE cuối hàng chip (vd nút "Xem thêm"). */
  trailing?: ReactNode;
  /** Chip CHƯA chọn tô xám hẳn (bỏ màu chủ đề) → tránh hiểu nhầm là đang chọn. */
  mutedUnselected?: boolean;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((t) => {
        const on = selected.includes(t.id);
        // Icon chip chưa chọn: mặc định vẫn màu chủ đề; chế độ muted → xám.
        const iconColor = on ? undefined : mutedUnselected ? undefined : { color: t.color };
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition",
              on
                ? "border-transparent text-white shadow-sm"
                : mutedUnselected
                  ? "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
            style={on ? { backgroundColor: t.color } : undefined}
          >
            <span className={cn("inline-flex", !on && mutedUnselected && "text-slate-400 dark:text-slate-500")} style={iconColor}>
              {t.icon ? (
                <TopicIcon icon={t.icon} className="size-3.5" />
              ) : (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: on ? "#fff" : mutedUnselected ? "currentColor" : t.color }}
                />
              )}
            </span>
            {t.name}
            {on && <Check className="size-3.5" />}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
