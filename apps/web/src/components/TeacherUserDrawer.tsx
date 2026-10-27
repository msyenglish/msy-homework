// Detail drawer for one account (opened from the learners page row menu): profile, privacy,
// basic study stats and email history. Full analytics live at /teacher/students/:id.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Radio,
  Repeat,
  Trophy,
  VenetianMask,
} from "lucide-react";
import { anonAlias, formatPoints } from "@msyen/shared";
import { t } from "../i18n";
import { teacherUsersApi, type TeacherUserRow } from "../lib/api";
import Drawer from "./Drawer";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { Badge } from "./Badge";
import { Avatar } from "./Avatar";
import { LevelBadge } from "./LevelBadge";
import { Button, Input, Select, ToggleRow } from "./ui";
import { fmtDateTime, fmtDay } from "../lib/format";
import { AvatarPresence, PresenceLabel, presenceLabel } from "./PresenceDot";
import { cn } from "../lib/utils";

export function TeacherUserDrawer({
  user,
  onToggleAnon,
  anonPending,
  onClose,
}: {
  user: TeacherUserRow | null;
  // toggle anonymous on leaderboard
  onToggleAnon: (anonymous: boolean) => void;
  anonPending?: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      width="max-w-lg"
      icon={<BarChart3 className="size-5" />}
      title={t("teacherDrawers.user.title")}
      description={t("teacherDrawers.user.description")}
    >
      {user && (
        <div className="space-y-4">
          {/* Profile */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <AvatarPresence lastSeenAt={user.last_seen_at}>
              <Avatar seed={user.id} src={user.avatar_url} size={56} className="!rounded-2xl" points={user.points} />
            </AvatarPresence>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                  {user.name || t("teacherDrawers.user.unnamed")}
                </h3>
                {!user.active && (
                  <Badge tone="rose">
                    <Lock className="size-3" /> {t("teacherDrawers.user.locked")}
                  </Badge>
                )}
                <Badge tone={user.provider === "google" ? "cyan" : "slate"}>
                  {user.provider === "google" ? "Google" : "Email"}
                </Badge>
                {user.level && <LevelBadge level={user.level} />}
              </div>
              <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-cyan-700/80 dark:text-cyan-400/80">
                <Mail className="size-3.5 shrink-0" /> {user.email}
              </p>
              <PresenceLabel className="mt-1" lastSeenAt={user.last_seen_at} />
            </div>
          </div>

          {/* Edit profile: name, email, gender, birth year */}
          <EditProfileSection user={user} />

          <TeacherPasswordReset userId={user.id} name={user.name ?? null} email={user.email} />

          {/* Privacy — leaderboard anonymity */}
          <ToggleRow
            tone="violet"
            icon={<VenetianMask className="size-5" />}
            title={t("teacherDrawers.user.anonTitle")}
            desc={
              anonPending
                ? t("common.saving")
                : user.anonymous
                  ? <>{t("teacherDrawers.user.anonDescOnPrefix")}<b className="text-violet-600 dark:text-violet-400">{anonAlias(user.id)}</b>{t("teacherDrawers.user.anonDescOnSuffix")}</>
                  : t("teacherDrawers.user.anonDescOff")
            }
            checked={user.anonymous}
            onChange={(v) => onToggleAnon(v)}
          />

          {/* Basic study stats */}
          <Section title={t("teacherDrawers.user.studySection")}>
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={<Trophy className="size-4 text-amber-500" />} value={formatPoints(user.points)} label={t("teacherDrawers.user.points")} />
              <Stat
                icon={<CheckCircle2 className="size-4 text-emerald-500" />}
                value={String(user.exercises_done)}
                label={t("teacherDrawers.user.exercisesDone")}
              />
              <Stat icon={<Repeat className="size-4 text-slate-400" />} value={String(user.attempts)} label={t("teacherDrawers.user.attempts")} />
              <Stat
                icon={<CalendarClock className="size-4 text-cyan-500" />}
                value={fmtDay(user.created_at) || "—"}
                label={t("teacherDrawers.user.accountCreated")}
              />
              <Stat
                className="col-span-2"
                icon={<Radio className="size-4 text-emerald-500" />}
                value={presenceLabel(user.last_seen_at)}
                label={user.last_seen_at ? t("teacherDrawers.user.lastSeenAt", { time: fmtDateTime(user.last_seen_at) }) : t("teacherDrawers.user.lastSeen")}
              />
            </div>
            <Link
              to={`/teacher/students/${user.id}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400"
            >
              <BarChart3 className="size-4" /> {t("teacherDrawers.user.viewAnalytics")}
            </Link>
          </Section>

          {/* Email history */}
          <EmailHistorySection userId={user.id} />
        </div>
      )}
    </Drawer>
  );
}

// Form cô sửa hồ sơ user (mở khi bấm "Sửa"). Đổi email áp ngay + ghi lịch sử ở server.
function EditProfileSection({ user }: { user: TeacherUserRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [gender, setGender] = useState<string>(user.gender ?? "");
  const [birthYear, setBirthYear] = useState(user.birth_year ? String(user.birth_year) : "");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  const openForm = () => {
    setName(user.name ?? "");
    setEmail(user.email);
    setGender(user.gender ?? "");
    setBirthYear(user.birth_year ? String(user.birth_year) : "");
    setErr("");
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () =>
      teacherUsersApi.update(user.id, {
        name: name.trim() || null,
        email: email.trim().toLowerCase(),
        gender: (gender || null) as "male" | "female" | "other" | null,
        birth_year: birthYear ? Number(birthYear) : null,
      }),
    onSuccess: async () => {
      setErr("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await qc.invalidateQueries({ queryKey: ["teacher-users"] });
      await qc.invalidateQueries({ queryKey: ["teacher-user-email-history", user.id] });
    },
    onError: (e: unknown) => setErr((e as Error)?.message || t("teacherDrawers.user.saveFailed")),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      {/* Same shape as the anonymity row: icon tile · title + desc · action on the right. */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
          <Pencil className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("teacherDrawers.user.editProfile")}</p>
          <p className="text-xs text-slate-500">{t("teacherDrawers.user.editProfileDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openForm())}
          aria-label={open ? t("teacherDrawers.user.closeEditProfile") : t("teacherDrawers.user.editProfile")}
          aria-expanded={open}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border transition",
            open
              ? "border-cyan-500 bg-cyan-500 text-white"
              : "border-slate-200 bg-white text-slate-500 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
          )}
        >
          <Pencil className="size-4" />
        </button>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <Input label={t("teacherDrawers.user.displayName")} value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">{t("teacherDrawers.user.emailHint")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t("teacherDrawers.user.gender")}
              placeholder="—"
              value={gender}
              onChange={setGender}
              options={[
                { value: "male", label: t("teacherDrawers.user.genderMale") },
                { value: "female", label: t("teacherDrawers.user.genderFemale") },
                { value: "other", label: t("teacherDrawers.user.genderOther") },
              ]}
            />
            <Input
              label={t("teacherDrawers.user.birthYear")}
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setErr(""); }}>
              {t("common.close")}
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !email.trim()}>
              {save.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {t("common.saving")}
                </>
              ) : saved ? (
                <>
                  <Check className="size-4" /> {t("common.saved")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Lịch sử đổi email của user (áp/hủy/chờ) — chỉ hiện khi có bản ghi.
function EmailHistorySection({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["teacher-user-email-history", userId],
    queryFn: () => teacherUsersApi.emailHistory(userId),
  });
  const items = data?.items ?? [];
  if (!items.length) return null;
  return (
    <Section title={t("teacherDrawers.user.emailHistoryTitle", { count: items.length })}>
      <div className="space-y-2">
        {items.map((h, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-800">
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="break-all text-slate-400 line-through">{h.old_email}</span>
              <span className="text-slate-400">→</span>
              <b className="break-all text-slate-700 dark:text-slate-200">{h.new_email}</b>
              <Badge tone={h.source === "admin" ? "cyan" : "slate"}>{h.source === "admin" ? t("teacherDrawers.user.changedByTeacher") : t("teacherDrawers.user.changedByUser")}</Badge>
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {h.applied_at
                ? t("teacherDrawers.user.emailApplied", { time: fmtDateTime(h.applied_at) })
                : h.canceled_at
                  ? t("teacherDrawers.user.emailCanceled", { time: fmtDateTime(h.canceled_at) })
                  : t("teacherDrawers.user.emailPending", { time: fmtDateTime(h.effective_at) })}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50", className)}>
      {icon}
      <div className="min-w-0">
        <p className="truncate font-bold text-slate-800 dark:text-slate-100">{value}</p>
        <p className="truncate text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}
