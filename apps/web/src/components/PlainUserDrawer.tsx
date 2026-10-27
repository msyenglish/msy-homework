// Teacher creates a learner account (email + password), optionally putting it in a class.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, School, UserPlus } from "lucide-react";
import { t, type TKey } from "../i18n";
import { classesApi, levelsApi, teacherUsersApi } from "../lib/api";
import Drawer from "./Drawer";
import { NumberInput } from "./NumberInput";
import { Button, Input, Select } from "./ui";
import { ToggleRow } from "./ui/toggle";

const GENDERS: { value: string; label: TKey }[] = [
  { value: "", label: "teacherDrawers.plainUser.unselectedGender" },
  { value: "male", label: "teacherDrawers.plainUser.genderMale" },
  { value: "female", label: "teacherDrawers.plainUser.genderFemale" },
  { value: "other", label: "teacherDrawers.plainUser.genderOther" },
];

export default function PlainUserDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list });
  const { data: classesData } = useQuery({ queryKey: ["classes"], queryFn: classesApi.list });
  const levels = levelsData?.items ?? [];
  const classes = (classesData?.items ?? []).filter((c) => c.active);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [levelId, setLevelId] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("");

  // Enrol right away? (opt-in) — reveals the class picker.
  const [enroll, setEnroll] = useState(false);
  const [classId, setClassId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      teacherUsersApi.create({
        name: name.trim(),
        email: email.trim(),
        password,
        level_id: levelId || null,
        birth_year: birthYear ? Number(birthYear) : null,
        gender: (gender || null) as "male" | "female" | "other" | null,
        class_id: enroll ? classId || null : null,
      }),
    onSuccess: (r) => {
      if (r.enrolled) toast.success(t("teacherDrawers.plainUser.toastCreatedAndEnrolled", { name: r.user.name ?? r.user.email }));
      else toast.success(t("teacherDrawers.plainUser.toastCreated", { name: r.user.name ?? r.user.email }));
      onSaved();
      // Stays open with a clear form, ready for the next account.
      setName("");
      setEmail("");
      setPassword("");
      setBirthYear("");
      setGender("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.plainUser.errorCreate")),
  });

  const canSubmit =
    name.trim() && email.trim() && password.length >= 6 && (!enroll || !!classId) && !create.isPending;

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-lg"
      icon={<UserPlus className="size-5" />}
      iconTone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
      title={t("teacherDrawers.plainUser.title")}
      description={t("teacherDrawers.plainUser.description")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!canSubmit} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {enroll ? t("teacherDrawers.plainUser.createAndEnrollBtn") : t("teacherDrawers.plainUser.createBtn")}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Login credentials */}
        <Section title={t("teacherDrawers.plainUser.sectionCredentials")}>
          <Input label={t("teacherDrawers.plainUser.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("teacherDrawers.plainUser.namePlaceholder")} autoFocus />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@example.com" />
          <Input label={t("teacherDrawers.plainUser.passwordLabel")} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("teacherDrawers.plainUser.passwordPlaceholder")} />
        </Section>

        {/* Learning profile */}
        <Section title={t("teacherDrawers.plainUser.sectionProfile")}>
          <Select
            label={t("teacherDrawers.plainUser.levelLabel")}
            value={levelId}
            onChange={setLevelId}
            options={[{ value: "", label: t("teacherDrawers.plainUser.unselectedLevel") }, ...levels.map((lv) => ({ value: lv.id, label: lv.name }))]}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label={t("teacherDrawers.plainUser.birthYearLabel")} value={birthYear} onChange={setBirthYear} min={1900} max={new Date().getFullYear()} start={new Date().getFullYear() - 10} placeholder={t("teacherDrawers.plainUser.birthYearPlaceholder")} />
            <Select label={t("teacherDrawers.plainUser.genderLabel")} value={gender} onChange={setGender} options={GENDERS.map((g) => ({ value: g.value, label: t(g.label) }))} />
          </div>
        </Section>

        {/* Enroll in class (opt-in) */}
        <div className="space-y-3">
          <ToggleRow
            icon={<School className="size-5" />}
            title={t("teacherDrawers.plainUser.enrollToggleTitle")}
            desc={t("teacherDrawers.plainUser.enrollToggleDesc")}
            checked={enroll}
            onChange={setEnroll}
          />

          {enroll &&
            (classes.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                {t("teacherDrawers.plainUser.noActiveClasses")}
              </p>
            ) : (
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <Select
                  label={t("teacherDrawers.plainUser.classLabel")}
                  value={classId}
                  onChange={setClassId}
                  options={[{ value: "", label: t("teacherDrawers.plainUser.selectClass") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
            ))}
        </div>
      </div>
    </Drawer>
  );
}

/** Nhóm trường có tiêu đề nhỏ — giữ drawer gọn, dễ quét mắt. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}
