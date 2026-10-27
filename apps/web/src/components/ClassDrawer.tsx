// Teacher CLASSES — a class is a rights overlay on `users`, not a second learner table.
// Create a class → add a learner (account + password) → they sign in at /u/login.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlignLeft, Check, ClipboardList, KeyRound, Loader2, Pencil, Plus, Power, School, Trash2, UserPlus, Users, X } from "lucide-react";
import type { Classroom } from "@msyen/shared";
import { t } from "../i18n";
import { classesApi, exercisesApi, type ClassMemberRow } from "../lib/api";
import Drawer from "./Drawer";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { Button, Card, CardContent, Input, Textarea, ToggleRow } from "./ui";
import { Avatar } from "./Avatar";
import { cn } from "../lib/utils";
import EnrollStudentDrawer from "./EnrollStudentDrawer";

/**
 * Quản lý LỚP HỌC — mở từ nút "Lớp học" trên hero của /teacher/students.
 * Là drawer chứ không phải trang riêng: lớp chỉ là cách nhóm học sinh, không đáng một tab.
 */
export default function ClassDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["classes"], queryFn: classesApi.list });
  const items = data?.items ?? [];

  const [newName, setNewName] = useState("");
  // ô "Tên lớp mới" ẩn cho gọn, bấm mới hiện
  const [adding, setAdding] = useState(false);
  const [openClass, setOpenClass] = useState<Classroom | null>(null);
  const [assignClass, setAssignClass] = useState<Classroom | null>(null);

  const createMut = useMutation({
    mutationFn: () => classesApi.create(newName.trim()),
    onSuccess: () => {
      setNewName("");
      setAdding(false);
      toast.success(t("teacherDrawers.class.toastCreated"));
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.class.errorCreate")),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => classesApi.remove(id),
    onSuccess: () => {
      toast.success(t("teacherDrawers.class.toastDeleted"));
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      icon={<School className="size-5" />}
      iconTone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
      title={t("teacherDrawers.class.title")}
      description={t("teacherDrawers.class.description")}
      footer={
        // Nút tạo lớp ở đáy drawer — ô nhập ẩn cho gọn, bấm mới hiện.
        adding ? (
          <div className="flex w-full items-end gap-2">
            <Input
              label={t("teacherDrawers.class.newClassNameLabel")}
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("teacherDrawers.class.newClassNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) createMut.mutate();
                if (e.key === "Escape") { setAdding(false); setNewName(""); }
              }}
            />
            <Button disabled={!newName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t("teacherDrawers.class.createBtn")}
            </Button>
            <Button variant="secondary" onClick={() => { setAdding(false); setNewName(""); }}>{t("common.cancel")}</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t("teacherDrawers.class.newClassBtn")}
          </Button>
        )
      }
    >
      {isLoading ? (
        <p className="py-10 text-center text-slate-500">{t("common.loading")}</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <School className="size-6" />
            </div>
            <p className="mt-3 text-sm text-slate-500">{t("teacherDrawers.class.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((cls) => (
            <div
              key={cls.id}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-cyan-700"
            >
              <button
                type="button"
                onClick={() => setOpenClass(cls)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                  <School className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-800 dark:text-slate-100">{cls.name}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-400">
                    <Users className="size-3.5" /> {t("teacherDrawers.class.memberCount", { n: cls.member_count ?? 0 })}
                    {!cls.active && <span className="ml-1 text-amber-600">{t("teacherDrawers.class.paused")}</span>}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAssignClass(cls)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300"
              >
                <ClipboardList className="size-3.5" /> {t("teacherDrawers.class.assignBtn")}
              </button>
              <button
                type="button"
                title={t("teacherDrawers.class.deleteClassTitle")}
                onClick={() => {
                  if (confirm(t("teacherDrawers.class.confirmDelete", { name: cls.name })))
                    removeMut.mutate(cls.id);
                }}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <MembersDrawer cls={openClass} onClose={() => setOpenClass(null)} />
      <AssignDrawer cls={assignClass} onClose={() => setAssignClass(null)} />
    </Drawer>
  );
}

/** Tick chọn bài giao cho cả lớp. Lưu là REPLACE-SET: trạng thái cô nhìn thấy = trạng thái lưu. */
function AssignDrawer({ cls, onClose }: { cls: Classroom | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [q, setQ] = useState("");

  const { data: exData } = useQuery({ queryKey: ["exercises", "pick"], queryFn: exercisesApi.pick, enabled: !!cls });
  const { data: cur } = useQuery({
    queryKey: ["class-assignments", cls?.id],
    queryFn: () => classesApi.assignments(cls!.id),
    enabled: !!cls,
  });

  // Nạp tick ban đầu từ server một lần cho mỗi lớp; sau đó state cục bộ làm chủ tới khi lưu.
  useEffect(() => {
    if (cur?.slugs) setPicked(new Set(cur.slugs));
  }, [cur, cls?.id]);

  const saveMut = useMutation({
    mutationFn: () => classesApi.setAssignments(cls!.id, [...(picked ?? [])]),
    onSuccess: (r) => {
      toast.success(t("teacherDrawers.class.toastAssigned", { n: r.count }));
      qc.invalidateQueries({ queryKey: ["class-assignments", cls?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.class.errorAssign")),
  });

  const all = exData?.items ?? [];
  const shown = q.trim() ? all.filter((e) => e.title.toLowerCase().includes(q.trim().toLowerCase())) : all;

  return (
    <Drawer
      open={!!cls}
      onClose={() => {
        setPicked(null);
        onClose();
      }}
      width="max-w-2xl"
      icon={<ClipboardList className="size-5" />}
      iconTone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
      title={t("teacherDrawers.class.assignTitle", { name: cls?.name ?? "" })}
      description={t("teacherDrawers.class.assignDesc")}
    >
      <div className="mb-3 flex items-end gap-2">
        <Input label={t("teacherDrawers.class.searchExercisesLabel")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("teacherDrawers.class.searchExercisesPlaceholder")} />
        <Button disabled={saveMut.isPending || picked === null} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : null} {t("common.save")} ({picked?.size ?? 0})
        </Button>
      </div>

      <div className="space-y-1.5">
        {shown.map((e) => {
          const on = picked?.has(e.exercise_id) ?? false;
          return (
            <button
              key={e.exercise_id}
              type="button"
              onClick={() =>
                setPicked((prev) => {
                  const next = new Set(prev ?? []);
                  if (next.has(e.exercise_id)) next.delete(e.exercise_id);
                  else next.add(e.exercise_id);
                  return next;
                })
              }
              className={
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition " +
                (on
                  ? "border-violet-400 bg-violet-50 dark:border-violet-600 dark:bg-violet-500/10"
                  : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800")
              }
            >
              <div
                className={
                  "flex size-5 shrink-0 items-center justify-center rounded-md border-2 " +
                  (on ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 dark:border-slate-600")
                }
              >
                {on && <Check className="size-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{e.title}</p>
                <p className="text-xs text-slate-400">
                  {e.level ?? "—"} · {e.skill ?? "—"}
                  {!e.published && <span className="ml-1 text-amber-600">{t("teacherDrawers.class.unpublished")}</span>}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}

/** Tên lớp ở tiêu đề drawer — bấm ✏️ để sửa tại chỗ. */
function EditableClassTitle({ cls, onRenamed }: { cls: Classroom; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cls.name);

  // Lớp khác mở lên → đồng bộ lại tên hiển thị, thoát chế độ sửa.
  useEffect(() => {
    setName(cls.name);
    setEditing(false);
  }, [cls.id, cls.name]);

  const rename = useMutation({
    mutationFn: () => classesApi.update(cls.id, { name: name.trim() }),
    onSuccess: () => {
      toast.success(t("teacherDrawers.class.toastRenamed"));
      setEditing(false);
      onRenamed();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.class.errorRename")),
  });

  if (editing) {
    return (
      <span className="flex items-center gap-1.5">
        <input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) rename.mutate();
            if (e.key === "Escape") { setName(cls.name); setEditing(false); }
          }}
          className="w-48 rounded-lg border border-cyan-400 bg-white px-2 py-0.5 text-lg font-bold text-slate-900 focus:outline-none dark:bg-slate-800 dark:text-white"
        />
        <button
          type="button"
          title={t("teacherDrawers.class.saveNameTitle")}
          disabled={!name.trim() || rename.isPending}
          onClick={() => rename.mutate()}
          className="rounded-lg p-1 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40 dark:hover:bg-emerald-500/10"
        >
          {rename.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </button>
        <button
          type="button"
          title={t("common.cancel")}
          onClick={() => { setName(cls.name); setEditing(false); }}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="size-4" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {cls.name}
      <button
        type="button"
        title={t("teacherDrawers.class.renameTitle")}
        onClick={() => setEditing(true)}
        className="rounded-lg p-1 text-slate-400 opacity-70 transition hover:bg-slate-100 hover:text-slate-600 hover:opacity-100 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      >
        <Pencil className="size-4" />
      </button>
    </span>
  );
}

function MembersDrawer({ cls, onClose }: { cls: Classroom | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["class-members", cls?.id],
    queryFn: () => classesApi.members(cls!.id),
    enabled: !!cls,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["class-members", cls?.id] });
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["teacher-users"] });
    qc.invalidateQueries({ queryKey: ["teacher-users"] });
  };

  return (
    <Drawer
      open={!!cls}
      onClose={onClose}
      width="max-w-2xl"
      icon={<School className="size-5" />}
      iconTone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
      title={cls ? <EditableClassTitle cls={cls} onRenamed={refresh} /> : t("teacherDrawers.class.membersTitle")}
      description={t("teacherDrawers.class.membersDesc")}
      footer={
        <Button className="w-full" onClick={() => setEnrolling(true)}>
          <UserPlus className="size-4" /> {t("teacherDrawers.class.addStudent")}
        </Button>
      }
    >
      {enrolling && cls && (
        <EnrollStudentDrawer
          fixedClassId={cls.id}
          onClose={() => setEnrolling(false)}
          onSaved={refresh}
        />
      )}

      {cls && <ClassSettings cls={cls} onChanged={refresh} />}

      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("teacherDrawers.class.noMembers")}</p>
      ) : (
        <div className="space-y-2">
          {data.items.map((m) => (
            <MemberRow key={m.id} classId={cls!.id} member={m} onChanged={refresh} />
          ))}
        </div>
      )}
    </Drawer>
  );
}

/** Class settings: description + active switch. */
function ClassSettings({ cls, onChanged }: { cls: Classroom; onChanged: () => void }) {
  const [note, setNote] = useState(cls.note ?? "");
  const [active, setActive] = useState(cls.active);

  // Resync when another class is opened.
  useEffect(() => {
    setNote(cls.note ?? "");
    setActive(cls.active);
  }, [cls.id, cls.note, cls.active]);

  const saveNote = useMutation({
    mutationFn: () => classesApi.update(cls.id, { note: note.trim() || null }),
    onSuccess: () => {
      toast.success(t("teacherDrawers.class.toastSavedNote"));
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.class.errorSaveNote")),
  });
  const toggleActive = useMutation({
    mutationFn: (v: boolean) => classesApi.update(cls.id, { active: v }),
    onSuccess: (_r, v) => {
      setActive(v);
      toast.success(v ? t("teacherDrawers.class.toastResumed") : t("teacherDrawers.class.toastPaused"));
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherDrawers.class.errorUpdate")),
  });
  const dirty = (note.trim() || "") !== (cls.note ?? "").trim();
  return (
    <div className="mb-3 space-y-2.5">
      <ToggleRow
        icon={<Power className="size-5" />}
        title={t("teacherDrawers.class.activeTitle")}
        desc={active ? t("teacherDrawers.class.activeDescActive") : t("teacherDrawers.class.activeDescInactive")}
        checked={active}
        onChange={(v) => toggleActive.mutate(v)}
      />
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <AlignLeft className="size-3.5" /> {t("teacherDrawers.class.noteLabel")}
        </div>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("teacherDrawers.class.notePlaceholder")}
        />
        {dirty && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" disabled={saveNote.isPending} onClick={() => saveNote.mutate()}>
              {saveNote.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("teacherDrawers.class.saveNote")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ classId, member, onChanged }: { classId: string; member: ClassMemberRow; onChanged: () => void }) {
  const [resetting, setResetting] = useState(false);

  const removeMut = useMutation({
    mutationFn: () => classesApi.removeMember(classId, member.id),
    onSuccess: () => {
      toast.success(t("teacherDrawers.class.toastRemovedMember"));
      onChanged();
    },
  });

  const realEmail = !member.email.endsWith("@lop.msyen.local");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center gap-3">
        <Avatar seed={member.id} src={member.avatar_url} size={40} className="!rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{member.name ?? t("teacherDrawers.class.unnamed")}</p>
          {/* The @lop.msyen.local placeholder is plumbing — showing it only adds noise. */}
          {realEmail && <p className="truncate text-xs text-slate-400">{member.email}</p>}
        </div>

        <button
          type="button"
          title={t("teacherDrawers.class.resetPassTitle")}
          onClick={() => setResetting(!resetting)}
          className={cn(
            "rounded-lg p-1.5 transition",
            resetting
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700",
          )}
        >
          <KeyRound className="size-4" />
        </button>
        <button
          type="button"
          title={t("teacherDrawers.class.removeMemberTitle")}
          onClick={() => {
            if (confirm(t("teacherDrawers.class.confirmRemoveMember", { name: member.name ?? t("teacherDrawers.class.fallbackStudentName") }))) removeMut.mutate();
          }}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {resetting && (
        <TeacherPasswordReset className="mt-2" userId={member.id} name={member.name} email={member.email} />
      )}
    </div>
  );
}
