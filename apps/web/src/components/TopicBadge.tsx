import type { Topic } from "@msyen/shared";
import { cn } from "../lib/utils";
import { TopicIcon } from "../lib/topicIcons";

// Badge chủ đề: pill bo tròn, viền + nền theo màu chủ đề, có icon (fallback chấm màu).
// `plain` — chỉ icon + chữ theo màu, không nền/viền (xem LevelBadge).
export function TopicBadge({
  topic,
  size = "sm",
  plain,
  className,
}: {
  topic: Topic;
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
          ? { color: topic.color }
          : {
              backgroundColor: `${topic.color}1f`,
              color: topic.color,
              boxShadow: `inset 0 0 0 1px ${topic.color}40`,
            }
      }
    >
      {topic.icon ? (
        <TopicIcon icon={topic.icon} className={iconSize} />
      ) : (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: topic.color }} />
      )}
      {topic.name}
    </span>
  );
}
