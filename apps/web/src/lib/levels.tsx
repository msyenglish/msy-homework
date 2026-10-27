import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { LevelIcon } from "./levelIcons";
import type { SelectOption } from "../components/ui/select";

// Tiện ích DÙNG CHUNG cho bộ lọc/picker CẤP ĐỘ (như lib/skills.tsx cho kỹ năng).
// Trước đây ~8 trang tự dựng mảng level options (mỗi nơi mỗi kiểu icon/màu/value).
// Gom về đây: icon chuẩn + hàm sinh options linh hoạt (value theo id hoặc name).

type LevelLike = { id: string; name: string; color?: string | null; icon?: string | null; position?: number | null };

// Icon 1 cấp độ: LevelIcon tô theo màu; không có icon → chấm tròn màu.
export function LevelDot({
  icon,
  color,
  className = "size-4",
}: {
  icon?: string | null;
  color?: string | null;
  className?: string;
}) {
  return (
    <span className="inline-flex items-center" style={{ color: color ?? undefined }}>
      {icon ? (
        <LevelIcon icon={icon} className={className} />
      ) : (
        <span className="size-2.5 rounded-full" style={{ backgroundColor: color ?? undefined }} />
      )}
    </span>
  );
}

// Options cho <Select> lọc/chọn cấp độ.
//  • by   — trường làm value: "id" (mặc định) hay "name" (vd lọc bài theo tên cấp độ).
//  • all  — mục đầu (vd { value:"", label:"Tất cả cấp độ" }); bỏ qua nếu không cần.
//  • allIcon — icon cho mục "all" (mặc định GraduationCap cyan).
//  • sort — sắp theo position (mặc định true).
export function levelSelectOptions(
  levels: LevelLike[] | undefined,
  {
    by = "id",
    all,
    allIcon,
    sort = true,
  }: { by?: "id" | "name"; all?: { value: string; label: string }; allIcon?: ReactNode; sort?: boolean } = {},
): SelectOption[] {
  const list = [...(levels ?? [])];
  if (sort) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const opts: SelectOption[] = list.map((l) => ({
    value: by === "name" ? l.name : l.id,
    label: l.name,
    icon: <LevelDot icon={l.icon} color={l.color} />,
  }));
  if (!all) return opts;
  return [
    { value: all.value, label: all.label, icon: allIcon ?? <GraduationCap className="size-4 text-cyan-500" /> },
    ...opts,
  ];
}
