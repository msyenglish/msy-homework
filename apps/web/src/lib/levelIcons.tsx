// Bộ icon cơ bản cho cấp độ học sinh (lưu key trong DB, map sang lucide ở client).
import {
  Sprout,
  BookOpen,
  Pencil,
  GraduationCap,
  Star,
  Target,
  Flame,
  Rocket,
  Trophy,
  Medal,
  Crown,
  Gem,
  Brain,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export const LEVEL_ICONS: Record<string, LucideIcon> = {
  sprout: Sprout,
  book: BookOpen,
  pencil: Pencil,
  graduation: GraduationCap,
  star: Star,
  target: Target,
  flame: Flame,
  rocket: Rocket,
  trophy: Trophy,
  medal: Medal,
  crown: Crown,
  gem: Gem,
  brain: Brain,
  sparkles: Sparkles,
};

export const LEVEL_ICON_KEYS = Object.keys(LEVEL_ICONS);

export function LevelIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const Cmp = icon ? LEVEL_ICONS[icon] : undefined;
  return Cmp ? <Cmp className={className} /> : null;
}
