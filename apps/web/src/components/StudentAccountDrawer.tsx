// EDIT one learner account: name · level · class · password reset.
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Loader2 } from "lucide-react";
import { classesApi, levelsApi, teacherUsersApi, type LearnerRef } from "../lib/api";
import Drawer from "./Drawer";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { Button, Input, Select } from "./ui";
import { t } from "../i18n";

export default function StudentAccountDrawer({
  student,
  onClose,
  onSaved,
}: {
  student: LearnerRef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list });
  const { data: classesData } = useQuery({ queryKey: ["classes"], queryFn: classesApi.list });
  const levels = levelsData?.items ?? [];
  const classes = classesData?.items ?? [];

  const [name, setName] = useState(student.name ?? "");
  const [levelId, setLevelId] = useState(student.level_id ?? "");
  const [classId, setClassId] = useState(student.classes[0]?.id ?? "");
  // The class as last saved — `student` is a snapshot taken when the drawer opened.
  const [savedClassId, setSavedClassId] = useState(student.classes[0]?.id ?? "");

  const save = useMutation({
    mutationFn: async () => {
      await teacherUsersApi.update(student.id, {
        name: name.trim() || null,
        level_id: levelId || null,
      });
      // One class per learner on this screen (several classes are managed in the Classes drawer):
      // move out of the current one, then into the new one; empty = take out of the class.
      const cur = savedClassId;
      if (classId !== cur) {
        if (cur) await classesApi.removeMember(cur, student.id);
        if (classId) await classesApi.linkMember(classId, student.id);
      }
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      setSavedClassId(classId);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.studentAccountDrawer.error")),
  });

  const realEmail = student.email.endsWith("@lop.msyen.local") ? null : student.email;

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-lg"
      icon={<GraduationCap className="size-5" />}
      iconTone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
      title={t("teacherWidgets.studentAccountDrawer.title", { name: student.name ?? student.email })}
      description={t("teacherWidgets.studentAccountDrawer.description")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} {t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label={t("teacherWidgets.studentAccountDrawer.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("teacherWidgets.studentAccountDrawer.namePlaceholder")} autoFocus />

        <Select
          label={t("teacherWidgets.studentAccountDrawer.classLabel")}
          value={classId}
          onChange={setClassId}
          options={[{ value: "", label: classes.length ? t("teacherWidgets.studentAccountDrawer.noClass") : t("teacherWidgets.studentAccountDrawer.noClassesAvailable") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
        />

        <Select
          label={t("teacherWidgets.studentAccountDrawer.levelLabel")}
          value={levelId}
          onChange={setLevelId}
          options={[{ value: "", label: t("teacherWidgets.studentAccountDrawer.noLevel") }, ...levels.map((lv) => ({ value: lv.id, label: lv.name }))]}
        />

        <TeacherPasswordReset userId={student.id} name={student.name ?? null} email={student.email} />

        {/* The address a placeholder email stands for is meaningless to the teacher — say so plainly. */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40">
          {realEmail
            ? t("teacherWidgets.studentAccountDrawer.loginWithEmail", { email: realEmail })
            : t("teacherWidgets.studentAccountDrawer.noRealEmail")}
        </div>
      </div>
    </Drawer>
  );
}
