// Avatar frame tiers by XP level (derived from total points): the frame colour shows progress at a glance.
import { pointsToLevel } from "@msyen/shared";
import type { TKey } from "../i18n";

export type AvatarTier = { key: string; label: TKey; from: number; gradient: string; glow: string };

const TIERS: AvatarTier[] = [
  { key: "bronze", label: "shared.avatarTier.bronze", from: 1, gradient: "linear-gradient(135deg,#f59e0b,#b45309,#fbbf24)", glow: "#d9770655" },
  { key: "silver", label: "shared.avatarTier.silver", from: 5, gradient: "linear-gradient(135deg,#e2e8f0,#94a3b8,#f8fafc)", glow: "#94a3b866" },
  { key: "gold", label: "shared.avatarTier.gold", from: 10, gradient: "linear-gradient(135deg,#fde047,#eab308,#fef08a)", glow: "#eab30866" },
  { key: "platinum", label: "shared.avatarTier.platinum", from: 20, gradient: "linear-gradient(135deg,#67e8f9,#0891b2,#a5f3fc)", glow: "#06b6d466" },
  { key: "diamond", label: "shared.avatarTier.diamond", from: 30, gradient: "linear-gradient(135deg,#c4b5fd,#7c3aed,#e9d5ff)", glow: "#8b5cf666" },
  { key: "master", label: "shared.avatarTier.master", from: 40, gradient: "conic-gradient(from 210deg,#f43f5e,#f59e0b,#8b5cf6,#06b6d4,#f43f5e)", glow: "#f43f5e66" },
];

export function avatarTier(points: number): AvatarTier & { level: number } {
  const level = pointsToLevel(points).level;
  const tier = [...TIERS].reverse().find((x) => level >= x.from) ?? TIERS[0];
  return { ...tier, level };
}
