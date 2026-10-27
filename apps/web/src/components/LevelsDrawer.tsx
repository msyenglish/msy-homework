import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import type { Level } from "@msyen/shared";
import { levelsApi } from "../lib/api";
import { LEVEL_ICONS, LEVEL_ICON_KEYS } from "../lib/levelIcons";
import { LevelBadge } from "./LevelBadge";
import { confirmAsk } from "./confirm";
import Drawer from "./Drawer";
import { Button, Input } from "./ui";
import { cn } from "../lib/utils";
import { t } from "../i18n";

const COLORS = [
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#ef4444", "#f59e0b", "#eab308", "#10b981",
  "#14b8a6", "#64748b",
];

export default function LevelsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list, enabled: open });
  const levels = data?.items ?? [];

  const [editing, setEditing] = useState<Level | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState<string | null>("sprout");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["levels"] });
    qc.invalidateQueries({ queryKey: ["students"] });
  };

  function startEdit(l: Level) {
    setEditing(l);
    setName(l.name);
    setColor(l.color);
    setIcon(l.icon ?? null);
  }
  function reset() {
    setEditing(null);
    setName("");
    setColor(COLORS[0]);
    setIcon("sprout");
  }

  const saveMut = useMutation({
    mutationFn: () => levelsApi.save({ id: editing?.id, name: name.trim(), color, icon }),
    onSuccess: () => {
      toast.success(editing ? t("teacherWidgets.levelsDrawer.updatedToast") : t("teacherWidgets.levelsDrawer.addedToast"));
      reset();
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.levelsDrawer.error")),
  });

  async function remove(l: Level) {
    const ok = await confirmAsk({
      title: t("teacherWidgets.levelsDrawer.confirmDeleteTitle", { name: l.name }),
      message: t("teacherWidgets.levelsDrawer.confirmDeleteMessage"),
      danger: true,
      confirmText: t("common.delete"),
    });
    if (!ok) return;
    await levelsApi.remove(l.id).then(() => { toast.success(t("common.deleted")); refresh(); }).catch((e) => toast.error(e.message));
  }

  const preview: Level = { id: "preview", name: name.trim() || t("teacherWidgets.levelsDrawer.preview"), color, icon };

  return (
    <Drawer open={open} onClose={onClose} width="max-w-md" icon={<Tag className="size-5" />} title={t("teacherWidgets.levelsDrawer.title")} description={t("teacherWidgets.levelsDrawer.description")}>
      <div className="space-y-5">
        {/* Form thêm / sửa */}
        <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <Input
            label={editing ? t("teacherWidgets.levelsDrawer.editLabel") : t("teacherWidgets.levelsDrawer.newLabel")}
            className="h-11 py-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("teacherWidgets.levelsDrawer.placeholder")}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && saveMut.mutate()}
          />

          {/* Màu */}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("teacherWidgets.levelsDrawer.colorLabel")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900",
                    color === c ? "ring-slate-400 dark:ring-slate-500" : "ring-transparent",
                  )}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Biểu tượng */}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("teacherWidgets.levelsDrawer.iconLabel")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {LEVEL_ICON_KEYS.map((key) => {
                const Icon = LEVEL_ICONS[key];
                const on = icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(on ? null : key)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg border transition",
                      on
                        ? "border-transparent text-white"
                        : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
                    )}
                    style={on ? { backgroundColor: color } : undefined}
                  >
                    <Icon className="size-[18px]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Xem trước */}
          <div className="flex items-center justify-center rounded-xl bg-slate-50 py-3 dark:bg-slate-800/50">
            <LevelBadge level={preview} size="lg" />
          </div>

          {/* Nút */}
          {editing ? (
            <div className="flex gap-2">
              <Button className="h-11 flex-1" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                <Check className="size-4" /> {t("teacherWidgets.levelsDrawer.update")}
              </Button>
              <Button variant="secondary" className="h-11 flex-1" onClick={reset}>
                <X className="size-4" /> {t("teacherWidgets.levelsDrawer.cancelEdit")}
              </Button>
            </div>
          ) : (
            <Button className="h-11 w-full" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Plus className="size-4" /> {t("teacherWidgets.levelsDrawer.addLevel")}
            </Button>
          )}
        </div>

        {/* Danh sách */}
        <div className="space-y-2">
          {levels.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              <Tag className="mb-2 size-6 text-slate-400" />
              {t("teacherWidgets.levelsDrawer.empty")}
            </div>
          ) : (
            levels.map((l) => (
              <div
                key={l.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border bg-white p-2.5 transition dark:bg-slate-900",
                  editing?.id === l.id ? "border-cyan-400" : "border-slate-200 dark:border-slate-800",
                )}
              >
                <div className="flex-1"><LevelBadge level={l} size="md" /></div>
                <Button size="sm" variant="ghost" className="!px-2" aria-label={t("common.edit")} onClick={() => startEdit(l)}><Pencil className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" className="!px-2 text-rose-500" aria-label={t("common.delete")} onClick={() => remove(l)}><Trash2 className="size-3.5" /></Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Drawer>
  );
}
