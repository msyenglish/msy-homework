// Field dùng chung cho onboarding + hồ sơ user công khai: năm sinh + giới tính (tab icon).
import { User, UserRound, Users } from "lucide-react";
import { cn } from "./utils";
import { t, type TKey } from "../i18n";

export type Gender = "male" | "female" | "other";

// Năm sinh theo tuổi 6→50 (mỗi tuổi 1 năm) + mục "Trên 50" — giống màn học sinh.
const NOW_YEAR = new Date().getFullYear();
const MIN_AGE = 6;
const MAX_AGE = 50;
export const OVER_50_YEAR = NOW_YEAR - (MAX_AGE + 1);
export const BIRTH_YEAR_OPTS = [
  ...Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => {
    const age = MIN_AGE + i;
    const y = NOW_YEAR - age;
    return Object.defineProperty({ value: String(y) }, "label", {
      enumerable: true,
      get: () => t("lib.userFields.ageYear", { age, year: y }),
    }) as { value: string; label: string };
  }),
  Object.defineProperty({ value: String(OVER_50_YEAR) }, "label", {
    enumerable: true,
    get: () => t("lib.userFields.over50"),
  }) as { value: string; label: string },
];

const GENDERS: { value: Gender; label: TKey; icon: typeof User; color: string }[] = [
  { value: "male", label: "lib.userFields.gender.male", icon: User, color: "#0ea5e9" },
  { value: "female", label: "lib.userFields.gender.female", icon: UserRound, color: "#f43f5e" },
  { value: "other", label: "lib.userFields.gender.other", icon: Users, color: "#8b5cf6" },
];

// Nhãn giới tính suy từ GENDERS (nguồn sự thật) → { male:"Nam", female:"Nữ", other:"Khác" }.
export const GENDER_LABEL = new Proxy({} as Record<Gender, string>, {
  get: (_target, key: Gender) => {
    const gender = GENDERS.find((g) => g.value === key);
    return gender ? t(gender.label) : undefined;
  },
});

// Bộ chọn giới tính: 3 tab, icon + chữ INLINE, màu nhạt khi chọn (không tô đậm).
export function GenderTabs({ value, onChange }: { value: Gender | ""; onChange: (g: Gender) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {GENDERS.map((g) => {
        const active = value === g.value;
        const Icon = g.icon;
        return (
          <button
            key={g.value}
            type="button"
            onClick={() => onChange(g.value)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition",
              !active &&
                "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60",
            )}
            // Chọn → nền + viền tô màu NHẠT (alpha thấp), chữ/icon theo màu.
            style={active ? { backgroundColor: `${g.color}14`, borderColor: `${g.color}66`, color: g.color } : undefined}
          >
            <Icon className="size-4" /> {t(g.label)}
          </button>
        );
      })}
    </div>
  );
}
