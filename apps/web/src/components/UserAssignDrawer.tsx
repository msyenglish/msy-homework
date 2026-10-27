// Giao bài RIÊNG cho một em (ngoài bài của lớp) — vd giao thêm cho em còn yếu.
// Lưu là REPLACE-SET và CHỈ đụng phần giao riêng; bài của lớp không bị ảnh hưởng.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ClipboardList, Loader2 } from "lucide-react";
import { exercisesApi, levelsApi, teacherUsersApi, type LearnerRef } from "../lib/api";
import Drawer from "./Drawer";
import { Button, Input, Select } from "./ui";
import { t } from "../i18n";

export default function UserAssignDrawer({
  user,
  onClose,
  onSaved,
}: {
  user: LearnerRef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"todo" | "done">("todo"); // mặc định: bài CHƯA giao
  const [levelFilter, setLevelFilter] = useState<string | null>(null); // null = chưa khởi tạo; "" = tất cả

  const { data: exData } = useQuery({ queryKey: ["exercises", "pick"], queryFn: exercisesApi.pick });
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list });
  const { data: cur } = useQuery({
    queryKey: ["user-assignments", user.id],
    queryFn: () => teacherUsersApi.assignedSlugs(user.id),
  });

  const levels = levelsData?.items ?? [];

  useEffect(() => {
    if (cur?.slugs) setPicked(new Set(cur.slugs));
  }, [cur]);

  // Mặc định lọc theo ĐÚNG cấp độ của em (chuyển level_id → tên vì bài lưu theo tên level).
  useEffect(() => {
    if (levelFilter === null && levels.length) {
      setLevelFilter(levels.find((l) => l.id === user.level_id)?.name ?? "");
    }
  }, [levels, user.level_id, levelFilter]);
  const lf = levelFilter ?? "";

  const save = useMutation({
    mutationFn: () => teacherUsersApi.setAssignments(user.id, [...(picked ?? [])]),
    onSuccess: (r) => {
      toast.success(r.count ? t("teacherWidgets.userAssignDrawer.assignedCountToast", { count: r.count, n: r.count }) : t("teacherWidgets.userAssignDrawer.removedAllToast"));
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.userAssignDrawer.error")),
  });

  const all = exData?.items ?? [];

  // Lọc chung (tìm + cấp độ) rồi tách theo trạng thái giao để đếm cho hai tab.
  const { todo, done } = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const filtered = all.filter(
      (e) => (!qq || e.title.toLowerCase().includes(qq)) && (!lf || e.level === lf),
    );
    const set = picked ?? new Set<string>();
    return {
      todo: filtered.filter((e) => !set.has(e.exercise_id)),
      done: filtered.filter((e) => set.has(e.exercise_id)),
    };
  }, [all, q, lf, picked]);

  const shown = tab === "todo" ? todo : done;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      icon={<ClipboardList className="size-5" />}
      iconTone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
      title={t("teacherWidgets.userAssignDrawer.title", { name: user.name ?? user.email })}
      description={t("teacherWidgets.userAssignDrawer.description")}
      footer={
        <Button className="w-full" disabled={save.isPending || picked === null} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} {t("teacherWidgets.userAssignDrawer.saveChanges", { count: picked?.size ?? 0 })}
        </Button>
      }
    >
      {/* Bộ lọc: tìm theo tên + lọc cấp độ (mặc định cấp độ của em, chọn "Tất cả" để xem hết). */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Input label={t("teacherWidgets.userAssignDrawer.searchLabel")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("teacherWidgets.userAssignDrawer.searchPlaceholder")} />
        <Select
          label={t("teacherWidgets.userAssignDrawer.levelLabel")}
          value={lf}
          onChange={setLevelFilter}
          options={[{ value: "", label: t("teacherWidgets.userAssignDrawer.allLevels") }, ...levels.map((l) => ({ value: l.name, label: l.name }))]}
        />
      </div>

      {user.classes.length > 0 && (
        <p className="mb-3 text-xs text-slate-400">
          {t("teacherWidgets.userAssignDrawer.classesNote", { classes: user.classes.map((c) => c.name).join(", ") })}
        </p>
      )}

      {/* Tabs: Chưa giao (mặc định) · Đã giao — có count theo bộ lọc hiện tại. */}
      <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <TabBtn active={tab === "todo"} onClick={() => setTab("todo")} label={t("teacherWidgets.userAssignDrawer.tabTodo")} count={todo.length} />
        <TabBtn active={tab === "done"} onClick={() => setTab("done")} label={t("teacherWidgets.userAssignDrawer.tabDone")} count={done.length} />
      </div>

      <div className="space-y-1.5">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            {tab === "todo" ? t("teacherWidgets.userAssignDrawer.emptyTodo") : t("teacherWidgets.userAssignDrawer.emptyDone")}
          </p>
        ) : (
          shown.map((e) => {
            const on = picked?.has(e.exercise_id) ?? false;
            return (
              <button
                key={e.exercise_id}
                type="button"
                onClick={() => toggle(e.exercise_id)}
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
                    {!e.published && <span className="ml-1 text-amber-600">{t("teacherWidgets.userAssignDrawer.unpublished")}</span>}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </Drawer>
  );
}

/** Nút tab kèm số đếm. */
function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition " +
        (active
          ? "bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300"
          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300")
      }
    >
      {label}
      <span
        className={
          "rounded-full px-1.5 text-xs font-bold " +
          (active ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-slate-200 text-slate-500 dark:bg-slate-700")
        }
      >
        {count}
      </span>
    </button>
  );
}
