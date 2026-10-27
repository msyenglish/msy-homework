import type { Level } from "@msyen/shared";
import { cn } from "../lib/utils";
import { t } from "../i18n";
import { LevelIcon } from "../lib/levelIcons";

// Huy hiệu cấp độ dạng "vinh danh" — dùng ở hero (góc phải): quầng sáng thở nhẹ,
// vệt sáng quét ngang, huy chương tròn có icon. Tô theo màu của cấp độ.
export function LevelMedal({ level, className }: { level: Level; className?: string }) {
  const c = level.color;
  return (
    <div
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-2xl border px-3 py-2 backdrop-blur",
        "border-white/60 dark:border-white/10",
        className,
      )}
      style={{
        // Nền chuyển sắc nhạt theo màu cấp độ + viền phát sáng.
        background: `linear-gradient(135deg, ${c}22, ${c}0d)`,
        boxShadow: `inset 0 0 0 1px ${c}33, 0 6px 18px -8px ${c}66`,
      }}
    >
      {/* Vệt sáng quét ngang (shine) */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="animate-medal-shine absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/25" />
      </span>

      <div className="relative flex items-center gap-2.5">
        {/* Huy chương tròn + quầng sáng thở */}
        <div className="relative flex size-9 items-center justify-center">
          <span
            className="animate-medal-glow absolute inset-0 rounded-full blur-[6px]"
            style={{ backgroundColor: `${c}66` }}
          />
          <span
            className="relative flex size-9 items-center justify-center rounded-full text-white shadow-inner"
            style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)`, boxShadow: `0 2px 6px -1px ${c}88, inset 0 1px 1px #ffffff55` }}
          >
            {level.icon ? (
              <LevelIcon icon={level.icon} className="size-[18px]" />
            ) : (
              <span className="size-2 rounded-full bg-white/90" />
            )}
          </span>
        </div>

        {/* Nhãn "Level N" + tên cấp độ */}
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            {level.position ? `Level ${level.position}` : t("shared.levelMedal.level")}
          </p>
          <p className="truncate text-sm font-extrabold" style={{ color: c }}>
            {level.name}
          </p>
        </div>
      </div>
    </div>
  );
}
