import type { Tag } from "@msyen/shared";
import { GraduationCap, Globe } from "lucide-react";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// Badge nhãn: pill theo màu nhãn. Icon nói lên PHẠM VI (thứ khiến nhãn khác chủ đề):
// mũ tốt nghiệp = chỉ học sinh của cô · quả địa cầu = dùng chung cả user công khai.
// `plain` — chỉ icon + chữ theo màu, không nền/viền (xem LevelBadge).
export function TagBadge({
  tag,
  size = "sm",
  plain,
  className,
}: {
  tag: Tag;
  size?: "sm" | "md" | "lg";
  plain?: boolean;
  className?: string;
}) {
  const pad =
    size === "lg" ? "px-3 py-1 text-sm gap-1.5" : size === "md" ? "px-2.5 py-0.5 text-[13px] gap-1.5" : "px-2 py-0.5 text-xs gap-1";
  const iconSize = size === "lg" ? "size-4" : "size-3.5";
  const Icon = tag.scope === "student" ? GraduationCap : Globe;
  return (
    <span
      title={tag.scope === "student" ? t("teacherWidgets.tagBadge.scopeStudent") : t("teacherWidgets.tagBadge.scopeGlobal")}
      className={cn(
        "inline-flex items-center rounded-full font-semibold leading-none",
        plain ? (size === "lg" ? "gap-1.5 text-sm" : size === "md" ? "gap-1.5 text-[13px]" : "gap-1 text-xs") : pad,
        className,
      )}
      style={
        plain
          ? { color: tag.color }
          : {
              backgroundColor: `${tag.color}1f`,
              color: tag.color,
              boxShadow: `inset 0 0 0 1px ${tag.color}40`,
            }
      }
    >
      <Icon className={iconSize} />
      {tag.name}
    </span>
  );
}
