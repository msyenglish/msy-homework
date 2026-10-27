import { Hash } from "lucide-react";
import type { ReactNode } from "react";
import { TopicIcon } from "./topicIcons";
import type { SelectOption } from "../components/ui/select";

// Tiện ích DÙNG CHUNG cho bộ lọc/picker CHỦ ĐỀ (song song lib/levels.tsx, lib/skills.tsx).
// Gom logic dựng options + icon chủ đề về 1 chỗ.

type TopicLike = { id: string; name: string; color?: string | null; icon?: string | null; position?: number | null };

// Icon 1 chủ đề: TopicIcon tô theo màu; không có icon → chấm tròn màu.
export function TopicDot({
  icon,
  color,
  className = "size-4",
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  return icon ? (
    <span className="inline-flex" style={{ color: color ?? undefined }}>
      <TopicIcon icon={icon} className={className} />
    </span>
  ) : (
    <span className="size-2.5 rounded-full" style={{ backgroundColor: color ?? undefined }} />
  );
}

// Options cho <Select> lọc/chọn chủ đề (value = id).
//  • all — mục đầu (vd { value:"", label:"Tất cả chủ đề" }); bỏ qua nếu không cần.
//  • allIcon — icon mục "all" (mặc định Hash cyan).
//  • sort — sắp theo position (mặc định true).
export function topicSelectOptions(
  topics: TopicLike[] | undefined,
  { all, allIcon, sort = true }: { all?: { value: string; label: string }; allIcon?: ReactNode; sort?: boolean } = {},
): SelectOption[] {
  const list = [...(topics ?? [])];
  if (sort) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const opts: SelectOption[] = list.map((t) => ({
    value: t.id,
    label: t.name,
    icon: <TopicDot icon={t.icon} color={t.color} />,
  }));
  if (!all) return opts;
  return [{ value: all.value, label: all.label, icon: allIcon ?? <Hash className="size-4 text-cyan-500" /> }, ...opts];
}
