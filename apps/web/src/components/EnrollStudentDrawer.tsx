// ENROL A STUDENT — search the existing accounts.
// Type a name/email to find an account, or type a full unknown email to create one on the spot.
// A brand-new account gets a generated password, shown once here so the teacher can pass it on.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Copy, GraduationCap, KeyRound, Loader2, Search, UserPlus, X } from "lucide-react";
import { t } from "../i18n";
import { classesApi, levelsApi, teacherUsersApi, type TeacherUserRow } from "../lib/api";
import Drawer from "./Drawer";
import { Button, Input, Select } from "./ui";
import { Avatar } from "./Avatar";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isPlaceholder = (email: string) => email.endsWith("@lop.msyen.local");

export default function EnrollStudentDrawer({
  fixedClassId,
  onClose,
  onSaved,
}: {
  // opened inside a class: lock class, hide picker
  fixedClassId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: usersData } = useQuery({ queryKey: ["teacher-users"], queryFn: () => teacherUsersApi.list() });
  const { data: classesData } = useQuery({ queryKey: ["classes"], queryFn: classesApi.list });
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list });
  const users = usersData?.items ?? [];
  const classes = classesData?.items ?? [];
  const levels = levelsData?.items ?? [];

  const [query, setQuery] = useState("");
  // user picked from search results
  const [picked, setPicked] = useState<TeacherUserRow | null>(null);

  const [classId, setClassId] = useState(fixedClassId ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [levelId, setLevelId] = useState("");
  // Credentials of an account just created — shown once, the server keeps no plaintext.
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);

  useEffect(() => {
    if (!fixedClassId && !classId && classes.length) setClassId(classes[0].id);
  }, [fixedClassId, classId, classes]);

  // Client-side search (users already loaded) — match name OR email, skip placeholder email.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (picked || q.length < 1) return [];
    return users
      .filter((u) => {
        const inName = (u.name ?? "").toLowerCase().includes(q);
        const inEmail = !isPlaceholder(u.email) && u.email.toLowerCase().includes(q);
        return inName || inEmail;
      })
      .slice(0, 8);
  }, [users, q, picked]);

  // Type a valid email not matching anyone -> create account on the spot.
  const emailValid = EMAIL_RE.test(q);
  const exact = users.find((u) => u.email.toLowerCase() === q);
  const isNewAccount = !picked && emailValid && !exact;

  const enroll = useMutation({
    mutationFn: () => {
      const email = picked ? picked.email : q;
      return classesApi.enroll(classId, {
        email,
        name: isNewAccount ? name.trim() : null,
        password: isNewAccount ? password.trim() || null : null,
        level_id: isNewAccount ? levelId || null : null,
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.created
          ? t("teacherDrawers.enroll.toastCreated", { name: r.member.name ?? t("teacherDrawers.enroll.defaultStudent") })
          : t("teacherDrawers.enroll.toastEnrolled", { name: r.member.name ?? t("teacherDrawers.enroll.defaultStudent") }),
      );
      onSaved();
      // A new account shows its password to copy; otherwise the form clears for the next learner.
      if (r.password) setIssued({ name: r.member.name ?? "", email: r.member.email, password: r.password });
      else {
        setPicked(null);
        setQuery("");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.enroll.errorEnroll")),
  });

  const canSubmit =
    !!classId && (picked || isNewAccount) && (!isNewAccount || name.trim()) && !enroll.isPending;

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-lg"
      icon={<GraduationCap className="size-5" />}
      iconTone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
      title={t("teacherDrawers.enroll.title")}
      description={t("teacherDrawers.enroll.description")}
      footer={
        issued ? (
          <Button className="w-full" onClick={onClose}>
            <CheckCircle2 className="size-4" /> {t("teacherDrawers.enroll.done")}
          </Button>
        ) : (
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button disabled={!canSubmit} onClick={() => enroll.mutate()}>
              {enroll.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              {isNewAccount ? t("teacherDrawers.enroll.createAndEnroll") : t("teacherDrawers.enroll.enrollOnly")}
            </Button>
          </div>
        )
      }
    >
      {issued ? (
        <IssuedCredentials {...issued} />
      ) : (
      <div className="space-y-4">
        {/* Selected student card or search input */}
        {picked ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-500/10">
            <Avatar seed={picked.id} src={picked.avatar_url} size={44} className="!rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> {picked.name || t("teacherDrawers.enroll.unnamed")}
              </p>
              <p className="truncate text-xs text-slate-500">
                {!isPlaceholder(picked.email) ? picked.email : t("teacherDrawers.enroll.noRealEmail")}
                {picked.level?.name ? ` · ${picked.level.name}` : ""}
              </p>
            </div>
            <button
              type="button"
              title={t("teacherDrawers.enroll.changeStudent")}
              onClick={() => { setPicked(null); setQuery(""); }}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <div>
            <Input
              label={t("teacherDrawers.enroll.searchLabel")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("teacherDrawers.enroll.searchPlaceholder")}
              leftIcon={<Search className="size-4" />}
              autoFocus
            />

            {/* Search results */}
            {matches.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {matches.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setPicked(u)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-cyan-700"
                  >
                    <Avatar seed={u.id} src={u.avatar_url} size={36} className="!rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{u.name || t("teacherDrawers.enroll.unnamed")}</p>
                      <p className="truncate text-xs text-slate-400">
                        {!isPlaceholder(u.email) ? u.email : t("teacherDrawers.enroll.noRealEmail")}
                        {u.level?.name ? ` · ${u.level.name}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* No match but valid email -> create new */}
            {isNewAccount && (
              <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-500/10">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {t("teacherDrawers.enroll.newAccountNoticePrefix")}<b>{q}</b>{t("teacherDrawers.enroll.newAccountNoticeSuffix")}
                </p>
                <Input label={t("teacherDrawers.enroll.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("teacherDrawers.enroll.namePlaceholder")} />
                <Input label={t("teacherDrawers.enroll.passwordLabel")} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("teacherDrawers.enroll.passwordPlaceholder")} />
                <Select
                  label={t("teacherDrawers.enroll.levelLabel")}
                  value={levelId}
                  onChange={setLevelId}
                  options={[{ value: "", label: t("teacherDrawers.enroll.unselectedLevel") }, ...levels.map((lv) => ({ value: lv.id, label: lv.name }))]}
                />
              </div>
            )}

            {/* Hint if no match */}
            {q.length >= 1 && matches.length === 0 && !isNewAccount && (
              <p className="mt-2 text-xs text-slate-400">
                {t("teacherDrawers.enroll.noMatchesPrefix")}<b>{t("teacherDrawers.enroll.emailWord")}</b>{t("teacherDrawers.enroll.noMatchesSuffix")}
              </p>
            )}
          </div>
        )}

        {!fixedClassId && (
          <Select
            label={t("teacherDrawers.enroll.classLabel")}
            value={classId}
            onChange={setClassId}
            options={[{ value: "", label: classes.length ? t("teacherDrawers.enroll.selectClass") : t("teacherDrawers.enroll.noClasses") }, ...classes.map((cc) => ({ value: cc.id, label: cc.name }))]}
          />
        )}

      </div>
      )}
    </Drawer>
  );
}

/** Credentials of a freshly created account — the only moment the password is visible. */
function IssuedCredentials({ name, email, password }: { name: string; email: string; password: string }) {
  const note = [
    t("teacherDrawers.enroll.noteHeader", { name: name || t("teacherDrawers.enroll.defaultStudent") }),
    t("teacherDrawers.enroll.noteStudyPage", { url: `${window.location.origin}/u/login` }),
    t("teacherDrawers.enroll.noteEmail", { email }),
    t("teacherDrawers.enroll.notePassword", { password }),
    t("teacherDrawers.enroll.noteFooter"),
  ].join("\n");
  const copy = (text: string, label: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(label));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        {t("teacherDrawers.enroll.createdAccountPrefix")}<b>{name || email}</b>{t("teacherDrawers.enroll.createdAccountSuffix")}
      </div>
      <p className="text-xs font-semibold text-slate-500">
        {t("teacherDrawers.enroll.passwordOneTimeHint")}
      </p>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
        <div>
          <p className="text-xs text-slate-400">{t("teacherDrawers.enroll.loginEmail")}</p>
          <p className="break-all font-mono text-sm text-slate-700 dark:text-slate-200">{email}</p>
        </div>
        <button
          type="button"
          onClick={() => copy(password, t("teacherDrawers.enroll.copiedPassword"))}
          className="flex w-full items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 font-mono text-lg font-bold tracking-wide text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
        >
          <span className="inline-flex items-center gap-2">
            <KeyRound className="size-4" /> {password}
          </span>
          <Copy className="size-4 shrink-0" />
        </button>
      </div>
      <Button variant="secondary" size="sm" onClick={() => copy(note, t("teacherDrawers.enroll.copiedNote"))}>
        <Copy className="size-4" /> {t("teacherDrawers.enroll.copyNoteForParents")}
      </Button>
    </div>
  );
}
