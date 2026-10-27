// Presence indicator for a public user, derived from `last_seen_at`:
// a dot to pin on the avatar + a labelled variant for lists and the detail drawer.
import { fmtAgo, presenceOf, type Presence } from "../lib/format";
import { cn } from "../lib/utils";
import { t } from "../i18n";

const DOT: Record<Presence, string> = {
  online: "bg-emerald-500",
  recent: "bg-amber-400",
  away: "bg-slate-300 dark:bg-slate-600",
  never: "bg-slate-300 dark:bg-slate-700",
};

const TEXT: Record<Presence, string> = {
  online: "text-emerald-600 dark:text-emerald-400",
  recent: "text-amber-600 dark:text-amber-400",
  away: "text-slate-400",
  never: "text-slate-400",
};

/** Human label: online while inside the 5-minute window, otherwise how long ago. */
export function presenceLabel(lastSeenAt: string | null | undefined): string {
  const p = presenceOf(lastSeenAt);
  if (p === "online") return t("shared.presence.online");
  if (p === "never") return t("shared.presence.never");
  return fmtAgo(lastSeenAt);
}

/** Bare dot — pin it on an avatar with absolute positioning. */
export function PresenceDot({ lastSeenAt, className }: { lastSeenAt: string | null | undefined; className?: string }) {
  const p = presenceOf(lastSeenAt);
  return (
    <span
      title={presenceLabel(lastSeenAt)}
      className={cn(
        "block size-3 rounded-full ring-2 ring-white dark:ring-slate-900",
        DOT[p],
        p === "online" && "animate-pulse",
        className,
      )}
    />
  );
}

/** Dot plus the human label. */
export function PresenceLabel({
  lastSeenAt,
  className,
}: {
  lastSeenAt: string | null | undefined;
  className?: string;
}) {
  const p = presenceOf(lastSeenAt);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TEXT[p], className)}>
      <span className={cn("size-2 rounded-full", DOT[p], p === "online" && "animate-pulse")} />
      {presenceLabel(lastSeenAt)}
    </span>
  );
}

/** Avatar wrapper that pins the presence dot at the bottom-right corner. */
export function AvatarPresence({ lastSeenAt, children }: { lastSeenAt: string | null | undefined; children: React.ReactNode }) {
  return (
    <div className="relative shrink-0">
      {children}
      <PresenceDot lastSeenAt={lastSeenAt} className="absolute -bottom-0.5 -right-0.5" />
    </div>
  );
}
