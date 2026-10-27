import { AudioLines, FileText, Mic } from "lucide-react";
import { skillUi } from "../lib/skills";
import { cn } from "../lib/utils";

// Thumbnail phân loại theo kỹ năng — icon/màu/nhãn ngắn lấy từ registry dùng chung
// (lib/skills.tsx → @msyen/shared). Bài đọc to (record) và fallback định nghĩa riêng dưới.
// Bài đọc to (thu âm) — thumbnail riêng, ưu tiên hơn skill.
const RECORD_META = {
  Icon: Mic,
  box: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  label: "Record",
};
// Dictation & Shadowing (video/audio, sentence by sentence) — surfaced as its own kind, not as
// plain Listening: it is a destination learners look for by name.
const VIDEO_META = {
  Icon: AudioLines,
  box: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  label: "Dictation & Shadowing",
};
const DEFAULT_META = {
  Icon: FileText,
  box: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
  label: "Other",
};

const SIZES = { sm: "size-11 rounded-lg", md: "size-14 rounded-xl" } as const;
const ICON_SIZES = { sm: "size-6", md: "size-7" } as const;

export function SkillThumb({
  skill,
  readAloud = false,
  video = false,
  size = "md",
  showLabel = false,
  className,
}: {
  skill?: string | null;
  readAloud?: boolean;
  video?: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const ui = skill ? skillUi(skill) : null;
  const m = video
    ? VIDEO_META
    : readAloud
    ? RECORD_META
    : ui
      ? { Icon: ui.Icon, box: ui.box, label: ui.short }
      : DEFAULT_META;

  if (showLabel) {
    // Ô VUÔNG cố định (đồng đều mọi kỹ năng) — nhãn ngắn để không bị chữ nhật.
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl",
          size === "sm" ? "size-12" : "size-14",
          m.box,
          className,
        )}
      >
        <m.Icon className={size === "sm" ? "size-4" : "size-5"} />
        <span
          className={cn(
            "px-0.5 text-center font-bold uppercase leading-tight tracking-tight",
            m.label.length > 8 ? "text-[8px]" : "text-[9px]",
          )}
        >
          {m.label}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        SIZES[size],
        m.box,
        className,
      )}
    >
      <m.Icon className={ICON_SIZES[size]} />
    </div>
  );
}
