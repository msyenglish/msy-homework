// Drawer quản lý CHỦ ĐỀ (topic) bài tập — global, cắt ngang level/kỹ năng.
// Nhân bản LevelsDrawer; tái dùng LevelBadge (Topic cùng hình dạng Level).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Hash, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Topic } from "@msyen/shared";
import { topicsApi } from "../lib/api";
import { TOPIC_ICONS, TOPIC_ICON_KEYS } from "../lib/topicIcons";
import { TopicBadge } from "./TopicBadge";
import { confirmAsk } from "./confirm";
import Drawer from "./Drawer";
import { Button, Input, Select } from "./ui";
import { cn } from "../lib/utils";
import { t } from "../i18n";

const COLORS = [
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#ef4444", "#f59e0b", "#eab308", "#10b981",
  "#14b8a6", "#64748b",
];

export default function TopicsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["topics"], queryFn: topicsApi.list, enabled: open });
  const topics = data?.items ?? [];

  const [editing, setEditing] = useState<Topic | null>(null);
  const [showForm, setShowForm] = useState(false); // form tạo/sửa gập lại cho gọn
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState<string | null>("star");
  const [parent, setParent] = useState(""); // chủ đề cha ("" = chủ đề gốc)
  // Chủ đề gốc (cấp 1) làm cha được — trừ chính mình. Cây 2 cấp.
  const parentOptions = [
    { value: "", label: t("teacherWidgets.topicsDrawer.parentNone") },
    ...topics.filter((tItem) => !tItem.parent_id && tItem.id !== editing?.id).map((tItem) => ({ value: tItem.id, label: tItem.name })),
  ];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["topics"] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
  };

  function startEdit(tItem: Topic) {
    setEditing(tItem);
    setShowForm(true);
    setName(tItem.name);
    setColor(tItem.color);
    setIcon(tItem.icon ?? null);
    setParent(tItem.parent_id ?? "");
  }
  function reset() {
    setEditing(null);
    setName("");
    setColor(COLORS[0]);
    setIcon("sprout");
    setParent("");
  }

  const saveMut = useMutation({
    mutationFn: () => topicsApi.save({ id: editing?.id, name: name.trim(), color, icon, parent_id: parent || null }),
    onSuccess: () => {
      toast.success(editing ? t("teacherWidgets.topicsDrawer.updatedToast") : t("teacherWidgets.topicsDrawer.addedToast"));
      reset();
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.topicsDrawer.error")),
  });

  async function remove(tItem: Topic) {
    const ok = await confirmAsk({
      title: t("teacherWidgets.topicsDrawer.confirmDeleteTitle", { name: tItem.name }),
      message: t("teacherWidgets.topicsDrawer.confirmDeleteMessage"),
      danger: true,
      confirmText: t("common.delete"),
    });
    if (!ok) return;
    await topicsApi.remove(tItem.id).then(() => { toast.success(t("common.deleted")); refresh(); }).catch((e) => toast.error(e.message));
  }

  const preview: Topic = { id: "preview", name: name.trim() || t("teacherWidgets.topicsDrawer.preview"), color, icon };

  // Cây 2 cấp: gốc (không cha / cha đã mất) → con thụt lề dưới cha.
  const byId = new Map(topics.map((tItem) => [tItem.id, tItem]));
  const roots = topics.filter((tItem) => !tItem.parent_id || !byId.has(tItem.parent_id));
  const childrenOf = (id: string) => topics.filter((tItem) => tItem.parent_id === id);
  const renderRow = (tItem: Topic, child = false) => (
    <div
      key={tItem.id}
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-white p-2.5 transition dark:bg-slate-900",
        child && "ml-5",
        editing?.id === tItem.id ? "border-cyan-400" : "border-slate-200 dark:border-slate-800",
      )}
    >
      {child && <span className="text-slate-300 dark:text-slate-600">↳</span>}
      <div className="flex-1"><TopicBadge topic={tItem} size="md" /></div>
      <Button size="sm" variant="ghost" className="!px-2" aria-label={t("common.edit")} onClick={() => startEdit(tItem)}><Pencil className="size-3.5" /></Button>
      <Button size="sm" variant="ghost" className="!px-2 text-rose-500" aria-label={t("common.delete")} onClick={() => remove(tItem)}><Trash2 className="size-3.5" /></Button>
    </div>
  );

  return (
    <Drawer open={open} onClose={onClose} width="max-w-md" icon={<Hash className="size-5" />} title={t("teacherWidgets.topicsDrawer.title")} description={t("teacherWidgets.topicsDrawer.description")}>
      <div className="space-y-4">
        {/* Nút gập/mở form tạo-sửa — đỡ chật diện tích */}
        <button
          type="button"
          onClick={() => {
            if (showForm && editing) reset();
            setShowForm((v) => !v);
          }}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <span className="flex items-center gap-2"><Plus className="size-4" /> {editing ? t("teacherWidgets.topicsDrawer.editingTopic") : t("teacherWidgets.topicsDrawer.addTopic")}</span>
          <ChevronDown className={cn("size-4 transition-transform", showForm && "rotate-180")} />
        </button>

        {showForm && (
        /* Form thêm / sửa */
        <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <Input
            label={editing ? t("teacherWidgets.topicsDrawer.editLabel") : t("teacherWidgets.topicsDrawer.newLabel")}
            className="h-11 py-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("teacherWidgets.topicsDrawer.placeholder")}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && saveMut.mutate()}
          />

          {/* Chủ đề cha — để tạo chủ đề CON (cây 2 cấp). Bỏ trống = chủ đề gốc. */}
          <Select label={t("teacherWidgets.topicsDrawer.parentLabel")} options={parentOptions} value={parent} onChange={setParent} placeholder={t("teacherWidgets.topicsDrawer.parentNone")} />

          {/* Màu */}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("teacherWidgets.topicsDrawer.colorLabel")}</p>
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
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">{t("teacherWidgets.topicsDrawer.iconLabel")}</p>
            <div className="flex max-h-40 flex-wrap justify-center gap-2 overflow-y-auto rounded-xl border border-slate-100 p-2 dark:border-slate-800">
              {TOPIC_ICON_KEYS.map((key) => {
                const Icon = TOPIC_ICONS[key];
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
            <TopicBadge topic={preview} size="lg" />
          </div>

          {/* Nút */}
          {editing ? (
            <div className="flex gap-2">
              <Button className="h-11 flex-1" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
                <Check className="size-4" /> {t("teacherWidgets.topicsDrawer.update")}
              </Button>
              <Button variant="secondary" className="h-11 flex-1" onClick={reset}>
                <X className="size-4" /> {t("teacherWidgets.topicsDrawer.cancelEdit")}
              </Button>
            </div>
          ) : (
            <Button className="h-11 w-full" disabled={!name.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
              <Plus className="size-4" /> {t("teacherWidgets.topicsDrawer.addTopic")}
            </Button>
          )}
        </div>
        )}

        {/* Danh sách */}
        <div className="space-y-2">
          {topics.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              <Hash className="mb-2 size-6 text-slate-400" />
              {t("teacherWidgets.topicsDrawer.empty")}
            </div>
          ) : (
            roots.map((t) => (
              <div key={t.id} className="space-y-2">
                {renderRow(t)}
                {childrenOf(t.id).map((c) => renderRow(c, true))}
              </div>
            ))
          )}
        </div>
      </div>
    </Drawer>
  );
}
