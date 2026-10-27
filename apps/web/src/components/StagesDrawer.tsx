// Drawer managing a path's (level's) stages — add, rename, delete, drag to reorder.
// The real state lives in TeacherPathsPage (so an unsaved drag layout survives); this
// drawer only drives it through callbacks. Styled like LevelsDrawer.
import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import Drawer from "./Drawer";
import { Button, Input } from "./ui";
import { Popover } from "./ui/popover";
import { cn } from "../lib/utils";
import { t } from "../i18n";

export interface StageRow {
  id: string;
  title: string;
  count: number;
}

export default function StagesDrawer({
  open,
  onClose,
  levelName,
  stages,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: {
  open: boolean;
  onClose: () => void;
  levelName: string;
  stages: StageRow[];
  onAdd: (title: string) => Promise<void> | void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function commit() {
    if (editId && draft.trim()) onRename(editId, draft.trim());
    setEditId(null);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = stages.map((s) => s.id);
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-md"
      icon={<Layers className="size-5" />}
      title={t("teacherWidgets.stagesDrawer.title")}
      description={t("teacherWidgets.stagesDrawer.description", { levelName })}
      footer={<AddStagePopover onAdd={onAdd} />}
    >
      {stages.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          <Layers className="mb-2 size-6 text-slate-400" />
          {t("teacherWidgets.stagesDrawer.empty")}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {stages.map((s, i) => (
                <SortableStage
                  key={s.id}
                  stage={s}
                  index={i}
                  editing={editId === s.id}
                  draft={draft}
                  onDraft={setDraft}
                  onCommit={commit}
                  onEdit={() => {
                    setEditId(s.id);
                    setDraft(s.title);
                  }}
                  onDelete={() => onDelete(s.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Drawer>
  );
}

// Footer button that opens an upward popover with the new-stage form.
function AddStagePopover({ onAdd }: { onAdd: (title: string) => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await onAdd(title);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover
      side="up"
      align="right"
      panelClassName="w-80 p-2"
      triggerClassName="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 text-sm font-medium text-white shadow-md shadow-cyan-500/25 transition-all hover:bg-cyan-600"
      trigger={
        <>
          <Plus className="size-4" /> {t("teacherWidgets.stagesDrawer.addStage")}
        </>
      }
    >
      {() => (
        <div className="flex gap-2">
          <Input
            autoFocus
            className="h-9 py-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("teacherWidgets.stagesDrawer.placeholder")}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button size="sm" className="shrink-0" disabled={!name.trim() || busy} onClick={add}>
            {t("common.add")}
          </Button>
        </div>
      )}
    </Popover>
  );
}

function SortableStage({
  stage,
  index,
  editing,
  draft,
  onDraft,
  onCommit,
  onEdit,
  onDelete,
}: {
  stage: StageRow;
  index: number;
  editing: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onCommit: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id, disabled: editing });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-white p-2.5 dark:bg-slate-900",
        editing ? "border-cyan-400" : "border-slate-200 dark:border-slate-800",
        isDragging && "relative z-10 shadow-lg ring-2 ring-cyan-400",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t("teacherWidgets.stagesDrawer.dragToReorder")}
        title={t("teacherWidgets.stagesDrawer.dragToReorder")}
        className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-xs font-bold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
        {index + 1}
      </span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 rounded-md border border-cyan-300 bg-white px-2 py-1 text-sm font-semibold text-slate-800 outline-none dark:bg-slate-800 dark:text-slate-100"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {stage.title || t("teacherWidgets.stagesDrawer.untitled")}
        </span>
      )}
      <span className="shrink-0 text-xs text-slate-400">{t("teacherWidgets.stagesDrawer.exerciseCount", { n: stage.count })}</span>
      {editing ? (
        <Button size="sm" variant="ghost" className="!px-2 text-emerald-600" aria-label={t("teacherWidgets.stagesDrawer.done")} onClick={onCommit}>
          <Check className="size-4" />
        </Button>
      ) : (
        <div className="flex shrink-0 items-center">
          <IconBtn label={t("teacherWidgets.stagesDrawer.rename")} onClick={onEdit}>
            <Pencil className="size-3.5" />
          </IconBtn>
          <IconBtn label={t("common.delete")} danger onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </IconBtn>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg transition disabled:opacity-30",
        danger
          ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}
