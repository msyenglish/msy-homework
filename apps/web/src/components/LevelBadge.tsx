import type { Level } from "@msyen/shared";
import { cn } from "../lib/utils";
import { LevelIcon } from "../lib/levelIcons";

// Badge cấp độ: pill bo tròn, viền + nền theo màu của cấp độ, có icon.
// `plain` — bỏ nền/viền/đệm, chỉ còn icon + chữ theo màu cấp độ (dùng ở thẻ bài tập,
// nơi đã có nhiều badge cạnh nhau nên pill đặc làm rối mắt).
export function LevelBadge({
  level,
  size = "sm",
  plain,
  className,
}: {
  level: Level;
  size?: "sm" | "md" | "lg";
  plain?: boolean;
  className?: string;
}) {
  const pad =
    size === "lg" ? "px-3 py-1 text-sm gap-1.5" : size === "md" ? "px-2.5 py-0.5 text-[13px] gap-1.5" : "px-2 py-0.5 text-xs gap-1";
  const iconSize = size === "lg" ? "size-4" : "size-3.5";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold leading-none",
        plain ? (size === "lg" ? "gap-1.5 text-sm" : size === "md" ? "gap-1.5 text-[13px]" : "gap-1 text-xs") : pad,
        className,
      )}
      style={
        plain
          ? { color: level.color }
          : {
              backgroundColor: `${level.color}1f`,
              color: level.color,
              boxShadow: `inset 0 0 0 1px ${level.color}40`,
            }
      }
    >
      {level.icon ? (
        <LevelIcon icon={level.icon} className={iconSize} />
      ) : (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: level.color }} />
      )}
      {level.name}
    </span>
  );
}
