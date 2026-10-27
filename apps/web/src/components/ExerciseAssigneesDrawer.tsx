import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, School, Trash2, UserPlus, Users } from "lucide-react";
import { exercisesApi, type AssignedStudent } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Avatar } from "./Avatar";
import { LevelBadge } from "./LevelBadge";
import { Badge } from "./Badge";
import { ScoreRing } from "./ScoreRing";
import { IconConfirmButton } from "./IconConfirmButton";
import Drawer from "./Drawer";
import { Button } from "./ui";
import { cn } from "../lib/utils";
import { t } from "../i18n";

type Tab = "students" | "classes";

export default function ExerciseAssigneesDrawer({
  slug,
  open,
  onClose,
  initialTab = "students",
}: {
  slug: string | null;
  open: boolean;
  onClose: () => void;
  /** Channel the caller asked for — the exercise card opens straight into the one it counted. */
  initialTab?: Tab;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  // The drawer stays mounted between openings, so the tab has to follow each new request.
  const [tabFor, setTabFor] = useState<string | null>(null);
  const tabKey = `${slug ?? ""}:${initialTab}`;
  if (open && tabFor !== tabKey) {
    setTabFor(tabKey);
    setTab(initialTab);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["assignees", slug],
    queryFn: () => exercisesApi.assignees(slug!),
    enabled: open && !!slug,
  });
  // Bài giao cho CẢ LỚP — chỉ nạp khi mở tab Lớp học (đỡ query thừa).
  const { data: classData, isLoading: classLoading } = useQuery({
    queryKey: ["exercise-classes", slug],
    queryFn: () => exercisesApi.classAssignees(slug!),
    enabled: open && !!slug && tab === "classes",
  });

  const [pickerOpen, setPickerOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["assignees", slug] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
    qc.invalidateQueries({ queryKey: ["students"] });
  };
  const refreshClasses = () => {
    qc.invalidateQueries({ queryKey: ["exercise-classes", slug] });
    qc.invalidateQueries({ queryKey: ["class-assignments"] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
  };

  async function assign(studentId: string) {
    if (!slug) return;
    try {
      await exercisesApi.addAssignee(slug, studentId);
      toast.success(t("teacherWidgets.assigneesDrawer.assignedSuccess"));
      setPickerOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.assigneesDrawer.error"));
    }
  }

  async function remove(s: AssignedStudent) {
    if (!slug) return;
    await exercisesApi.removeAssignee(slug, s.id);
    toast.success(t("teacherWidgets.assigneesDrawer.removedLearner", { name: s.name }));
    refresh();
  }

  async function toggleClass(id: string, name: string, on: boolean) {
    if (!slug) return;
    try {
      if (on) await exercisesApi.removeClass(slug, id);
      else await exercisesApi.addClass(slug, id);
      toast.success(on ? t("teacherWidgets.assigneesDrawer.removedClass", { name }) : t("teacherWidgets.assigneesDrawer.assignedClass", { name }));
      refreshClasses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.assigneesDrawer.error"));
    }
  }

  const assigned = data?.assigned ?? [];
  const available = data?.available ?? [];
  const classes = classData?.items ?? [];
  const classAssignedCount = classes.filter((k) => k.assigned).length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-md"
      icon={<Users className="size-5" />}
      title={<span className="block truncate">{data?.exercise.title ?? "…"}</span>}
      description={`${t("teacherWidgets.assigneesDrawer.title")} · ${t("teacherWidgets.assigneesDrawer.summaryLearners", { n: assigned.length })} · ${t("teacherWidgets.assigneesDrawer.summaryClasses", { n: classAssignedCount })}`}
      footer={
        // Chỉ tab HỌC SINH có nút chọn thêm — tab Lớp bật/tắt ngay tại chỗ.
        tab === "students" ? (
          <div className="relative w-full">
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                  {available.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">{t("teacherWidgets.assigneesDrawer.allLearnersAssigned")}</p>
                  ) : (
                    available.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => assign(s.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Avatar seed={s.id} size={28} />
                        <span className="font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
            <Button className="w-full" onClick={() => setPickerOpen((v) => !v)}>
              <UserPlus className="size-4" /> {t("teacherWidgets.assigneesDrawer.assignButton")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {/* Tab: Giao cho HỌC SINH ↔ Giao cho LỚP HỌC */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70">
          <TabButton icon={<Users className="size-4" />} label={t("teacherWidgets.assigneesDrawer.tabStudents")} active={tab === "students"} onClick={() => setTab("students")} />
          <TabButton icon={<School className="size-4" />} label={t("teacherWidgets.assigneesDrawer.tabClasses")} active={tab === "classes"} onClick={() => setTab("classes")} />
        </div>

        {tab === "students" ? (
          isLoading ? (
            <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
          ) : assigned.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              <Users className="mb-2 size-6 text-slate-400" />
              {t("teacherWidgets.assigneesDrawer.emptyStudents")}
            </div>
          ) : (
            <div className="space-y-2">
              {assigned.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <Avatar seed={s.id} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{s.name}</p>
                      {s.level && <LevelBadge level={s.level} size="sm" />}
                    </div>
                    <p className="truncate text-xs text-slate-500">{s.done ? t("teacherWidgets.assigneesDrawer.doneAt", { date: fmtDate(s.lastAt) }) : t("teacherWidgets.assigneesDrawer.notDone")}</p>
                  </div>
                  {s.done ? (
                    <ScoreRing score={s.lastScore ?? 0} total={s.lastTotal ?? 0} size={42} />
                  ) : (
                    <Badge tone="slate">{t("teacherWidgets.assigneesDrawer.notDone")}</Badge>
                  )}
                  <IconConfirmButton icon={Trash2} title={t("teacherWidgets.assigneesDrawer.removeFromExercise")} confirmTitle={t("teacherWidgets.assigneesDrawer.confirmRemoveFromExercise")} onConfirm={() => remove(s)} />
                </div>
              ))}
            </div>
          )
        ) : classLoading ? (
          <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            <School className="mb-2 size-6 text-slate-400" />
            {t("teacherWidgets.assigneesDrawer.emptyClasses")}
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="px-1 text-xs text-slate-400">{t("teacherWidgets.assigneesDrawer.classesHint")}</p>
            {classes.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => toggleClass(k.id, k.name, k.assigned)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                  k.assigned
                    ? "border-violet-400 bg-violet-50 dark:border-violet-600 dark:bg-violet-500/10"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800",
                )}
              >
                <div
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                    k.assigned ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 dark:border-slate-600",
                  )}
                >
                  {k.assigned && <Check className="size-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {k.name}
                    {!k.active && <span className="ml-1.5 text-xs font-normal text-amber-600">{t("teacherWidgets.assigneesDrawer.classPaused")}</span>}
                  </p>
                  <p className="text-xs text-slate-400">{t("teacherWidgets.assigneesDrawer.memberCount", { n: k.member_count })}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
        active
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
      )}
    >
      {icon} {label}
    </button>
  );
}
