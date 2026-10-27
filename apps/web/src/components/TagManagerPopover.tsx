// Quản lý NHÃN bài tập ngay tại chỗ — popover thay cho drawer (nhãn ít, không cần cả màn).
// Portal ra body + fixed để không bị section cha (overflow) cắt. Form THÊM mặc định thu gọn,
// chỉ hiện danh sách cho gọn; bấm "Thêm nhãn" mới bung form.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, GraduationCap, Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Tag, TagScope } from "@msyen/shared";
import { tagsApi } from "../lib/api";
import { TagBadge } from "./TagBadge";
import { confirmAsk } from "./confirm";
import { cn } from "../lib/utils";
import { t } from "../i18n";

const COLORS = [
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#f59e0b", "#10b981", "#14b8a6", "#64748b",
];

export default function TagManagerPopover({ anchorRef, open, onClose }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const { data } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.list, enabled: open });
  const tags = data?.items ?? [];

  // Form THÊM/SỬA — mặc định đóng (chỉ hiện danh sách cho gọn).
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [scope, setScope] = useState<TagScope>("all");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
  };
  function reset() {
    setEditing(null);
    setName("");
    setColor(COLORS[0]);
    setScope("all");
    setShowForm(false);
  }
  function startEdit(t: Tag) {
    setEditing(t);
    setName(t.name);
    setColor(t.color);
    setScope(t.scope);
    setShowForm(true);
  }

  const saveMut = useMutation({
    mutationFn: () => tagsApi.save({ id: editing?.id, name: name.trim(), color, scope }),
    onSuccess: () => { toast.success(editing ? t("teacherWidgets.tagManagerPopover.updatedToast") : t("teacherWidgets.tagManagerPopover.addedToast")); reset(); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.tagManagerPopover.error")),
  });

  async function remove(tItem: Tag) {
    const ok = await confirmAsk({
      title: t("teacherWidgets.tagManagerPopover.confirmDeleteTitle", { name: tItem.name }),
      message: tItem.scope === "student"
        ? t("teacherWidgets.tagManagerPopover.confirmDeleteStudent")
        : t("teacherWidgets.tagManagerPopover.confirmDeleteAll"),
      danger: true,
      confirmText: t("common.delete"),
    });
    if (!ok) return;
    await tagsApi.remove(tItem.id).then(() => { toast.success(t("common.deleted")); refresh(); }).catch((e) => toast.error(e.message));
  }

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const W = 320;
      const below = window.innerHeight - r.bottom;
      const up = below < 360 && r.top > below;
      // Canh mép PHẢI của popover với mép phải anchor (anchor hẹp, popover rộng hơn).
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.max(8, r.right - W), up });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !anchorRef.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => { if (!open) reset(); }, [open]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, left: pos.left, width: 320 }}
      className="z-[60] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{t("teacherWidgets.tagManagerPopover.title")}</p>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {tags.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">{t("teacherWidgets.tagManagerPopover.empty")}</p>
        ) : (
          tags.map((tItem) => (
            <div
              key={tItem.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-1.5 pl-2.5",
                editing?.id === tItem.id ? "border-cyan-400" : "border-slate-200 dark:border-slate-800",
              )}
            >
              <div className="min-w-0 flex-1"><TagBadge tag={tItem} size="sm" /></div>
              <button type="button" onClick={() => startEdit(tItem)} aria-label={t("common.edit")} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                <Pencil className="size-3.5" />
              </button>
              <button type="button" onClick={() => remove(tItem)} aria-label={t("common.delete")} className="rounded-lg p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Form thêm/sửa — thu gọn mặc định */}
      <div className="border-t border-slate-100 dark:border-slate-800">
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-cyan-600 transition hover:bg-cyan-50/60 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
          >
            <Plus className="size-4" /> {t("teacherWidgets.tagManagerPopover.addTag")}
          </button>
        ) : (
          <div className="space-y-2.5 p-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && saveMut.mutate()}
              placeholder={t("teacherWidgets.tagManagerPopover.namePlaceholder")}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "all" as const, label: t("common.all"), icon: Globe },
                { v: "student" as const, label: t("teacherWidgets.tagManagerPopover.scopeStudentOnly"), icon: GraduationCap },
              ]).map((s) => {
                const on = scope === s.v;
                const Icon = s.icon;
                return (
                  <button
                    key={s.v}
                    type="button"
                    onClick={() => setScope(s.v)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition",
                      on ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300" : "border-slate-200 text-slate-500 dark:border-slate-700",
                    )}
                  >
                    <Icon className="size-3.5" /> {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn("flex size-6 items-center justify-center rounded-full ring-2 ring-offset-1 ring-offset-white transition dark:ring-offset-slate-900", color === c ? "ring-slate-400" : "ring-transparent")}
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="size-3 text-white" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!name.trim() || saveMut.isPending}
                onClick={() => saveMut.mutate()}
                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-40"
              >
                <Check className="size-4" /> {editing ? t("teacherWidgets.tagManagerPopover.update") : t("common.add")}
              </button>
              <button type="button" onClick={reset} className="flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-500 dark:border-slate-700">
                <ChevronDown className="size-4" /> {t("teacherWidgets.tagManagerPopover.collapse")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
