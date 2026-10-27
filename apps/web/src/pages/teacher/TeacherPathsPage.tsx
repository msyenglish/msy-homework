// Trang GIÁO VIÊN — quản lý "lộ trình" của từng level cho user công khai.
// Level = 1 lộ trình xếp DỌC (trên→dưới = thứ tự mở khóa); gồm các CHẶNG (khung);
// mỗi chặng chứa bài kéo-thả để sắp; bài chưa xếp nằm ở "Kho" cuối trang.
// Quản lý chặng (thêm/sửa/xóa/đổi thứ tự) ở DRAWER; chặng có collapse/expand.
// Lưu → ghi exercises.stage_id + path_order; engine gạn giọt đọc path_order.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  GripVertical,
  Layers,
  ListChecks,
  Lock,
  Package,
  Route,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type { PathItem } from "@msyen/shared";
import { levelsApi, pathsApi } from "../../lib/api";
import { SkillFilter } from "../../lib/skills";
import { HeroDecor } from "../../components/HeroDecor";
import { SkillThumb } from "../../components/SkillThumb";
import { LevelDot } from "../../lib/levels";
import StagesDrawer, { type StageRow } from "../../components/StagesDrawer";
import { Button, Card, Input, Select } from "../../components/ui";
import { useHistoryState } from "../../lib/navState";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

const UNSTAGED = "__unstaged__";
type Containers = Record<string, string[]>; // stageId | UNSTAGED → danh sách slug bài
type StatusTab = "all" | "staged" | "kho";
const FIRST_STAGE = "__first__";


export default function TeacherPathsPage() {
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list });

  // Level + the exercise-picker filters live in the URL: a shared link opens the same board,
  // and switching level/filter is a step Back should undo. Typing in the search box only replaces.
  const [searchParams, setSearchParams] = useSearchParams();
  const [levelId, setLevelId] = useState(() => searchParams.get("level") ?? "");
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [skill, setSkill] = useState(() => searchParams.get("skill") ?? "");
  const [tab, setTab] = useState<StatusTab>(() => (searchParams.get("tab") as StatusTab) ?? "all");

  useEffect(() => {
    if (!levelId && levelsData?.items?.length) setLevelId(levelsData.items[0].id);
  }, [levelsData, levelId]);

  const lastQuery = useRef(query);
  useEffect(() => {
    const p = new URLSearchParams();
    if (levelId) p.set("level", levelId);
    if (query) p.set("q", query);
    if (skill) p.set("skill", skill);
    if (tab !== "all") p.set("tab", tab);
    const typing = lastQuery.current !== query;
    lastQuery.current = query;
    setSearchParams(p, { replace: typing });
  }, [levelId, query, skill, tab, setSearchParams]);

  // Label kèm số thứ tự "Level N ·" nên tự map; icon dùng LevelDot chung.
  const levelOptions = (levelsData?.items ?? []).map((l, i) => ({
    value: l.id,
    label: `Level ${i + 1} · ${l.name}`,
    icon: <LevelDot icon={l.icon} color={l.color} />,
  }));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      {/* Hero — Select cấp độ NẰM TRONG hero; chỉ HeroDecor bị clip nên popover không bị cắt */}
      <header className="relative mb-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <HeroDecor seed="teacher-paths" />
        </div>
        <div className="relative flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
            <Route className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherMain.paths.title")}</h1>
            <p className="mt-0.5 truncate text-sm text-slate-500" title={t("teacherMain.paths.description")}>
              {t("teacherMain.paths.description")}
            </p>
          </div>
          <div className="hidden w-72 shrink-0 sm:block">
            <Select options={levelOptions} value={levelId} onChange={setLevelId} placeholder={t("teacherMain.paths.selectLevel")} />
          </div>
        </div>
        <div className="relative mt-4 sm:hidden">
          <Select options={levelOptions} value={levelId} onChange={setLevelId} placeholder={t("teacherMain.paths.selectLevel")} />
        </div>
      </header>

      {levelId ? (
        <PathBoard
          key={levelId}
          levelId={levelId}
          query={query}
          onQueryChange={setQuery}
          skill={skill}
          onSkillChange={setSkill}
          tab={tab}
          onTabChange={setTab}
        />
      ) : null}
    </div>
  );
}

// ============================================================
//  Bảng lộ trình cho 1 level (state cục bộ + kéo-thả)
// ============================================================
function PathBoard({
  levelId,
  query,
  onQueryChange,
  skill,
  onSkillChange,
  tab,
  onTabChange,
}: {
  levelId: string;
  query: string;
  onQueryChange: (v: string) => void;
  skill: string;
  onSkillChange: (v: string) => void;
  tab: StatusTab;
  onTabChange: (v: StatusTab) => void;
}) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["path", levelId], queryFn: () => pathsApi.get(levelId), retry: false });

  const [stageOrder, setStageOrder] = useState<string[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [containers, setContainers] = useState<Containers>({ [UNSTAGED]: [] });
  // Accordion: one expanded stage at a time ("" = all collapsed, FIRST_STAGE = default).
  const [openStage, setOpenStage] = useHistoryState<string>("openStage", FIRST_STAGE);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const meta = useMemo(() => {
    const m: Record<string, PathItem> = {};
    (data?.items ?? []).forEach((it) => (m[it.exercise_id] = it));
    return m;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const cont: Containers = { [UNSTAGED]: [] };
    data.stages.forEach((s) => (cont[s.id] = []));
    data.items.forEach((it) => {
      if (it.stage_id && cont[it.stage_id]) cont[it.stage_id].push(it.exercise_id);
      else cont[UNSTAGED].push(it.exercise_id);
    });
    setContainers(cont);
    setStageOrder(data.stages.map((s) => s.id));
    setTitles(Object.fromEntries(data.stages.map((s) => [s.id, s.title])));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const findContainer = (id: string): string | undefined =>
    id in containers ? id : Object.keys(containers).find((k) => containers[k].includes(id));

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeC = findContainer(String(active.id));
    const overC = findContainer(String(over.id));
    if (!activeC || !overC || activeC === overC) return;
    setContainers((prev) => {
      const activeItems = prev[activeC];
      const overItems = prev[overC];
      const overIsContainer = String(over.id) in prev;
      const overIndex = overIsContainer ? overItems.length : overItems.indexOf(String(over.id));
      const insertAt = overIndex < 0 ? overItems.length : overIndex;
      return {
        ...prev,
        [activeC]: activeItems.filter((i) => i !== String(active.id)),
        [overC]: [...overItems.slice(0, insertAt), String(active.id), ...overItems.slice(insertAt)],
      };
    });
    setDirty(true);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeC = findContainer(String(active.id));
    const overC = findContainer(String(over.id));
    if (!activeC || !overC || activeC !== overC) return;
    const items = containers[activeC];
    const oldI = items.indexOf(String(active.id));
    const newI = String(over.id) in containers ? items.length - 1 : items.indexOf(String(over.id));
    if (oldI !== newI && newI >= 0) {
      setContainers((prev) => ({ ...prev, [activeC]: arrayMove(prev[activeC], oldI, newI) }));
      setDirty(true);
    }
  }

  // Bỏ 1 bài khỏi chặng → đưa về Kho (không kéo, bấm nút X).
  function removeFromStage(eid: string, fromId: string) {
    setContainers((prev) => ({
      ...prev,
      [fromId]: (prev[fromId] ?? []).filter((i) => i !== eid),
      [UNSTAGED]: [...(prev[UNSTAGED] ?? []), eid],
    }));
    setDirty(true);
  }

  // ---- Thao tác chặng (gọi từ drawer) ----
  async function addStage(title: string) {
    const { id } = await pathsApi.addStage(levelId, title);
    setContainers((prev) => ({ ...prev, [id]: [] }));
    setStageOrder((prev) => [...prev, id]);
    setTitles((prev) => ({ ...prev, [id]: title }));
  }
  async function renameStage(id: string, title: string) {
    setTitles((prev) => ({ ...prev, [id]: title }));
    await pathsApi.renameStage(id, title).catch(() => {});
  }
  async function deleteStage(id: string) {
    if (!confirm(t("teacherMain.paths.confirmDelete"))) return;
    await pathsApi.deleteStage(id);
    setContainers((prev) => {
      const moved = prev[id] ?? [];
      const rest = { ...prev };
      delete rest[id];
      return { ...rest, [UNSTAGED]: [...prev[UNSTAGED], ...moved] };
    });
    setStageOrder((prev) => prev.filter((s) => s !== id));
  }
  function reorderStages(ids: string[]) {
    setStageOrder(ids);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const staged: { exercise_id: string; stage_id: string }[] = [];
      stageOrder.forEach((sid) => (containers[sid] ?? []).forEach((eid) => staged.push({ exercise_id: eid, stage_id: sid })));
      await pathsApi.saveLayout(levelId, stageOrder, staged);
      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2000);
      await refetch();
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <p className="py-16 text-center text-slate-500">{t("common.loading")}</p>;

  // Thứ tự mở khóa toàn cục (đánh số chạy qua các chặng).
  let running = 0;
  const orderOf: Record<string, number> = {};
  stageOrder.forEach((sid) => (containers[sid] ?? []).forEach((eid) => (orderOf[eid] = ++running)));
  const totalStaged = running;
  const unstaged = containers[UNSTAGED] ?? [];
  const totalAll = totalStaged + unstaged.length;

  // Hàm khớp bộ lọc cho 1 bài.
  const q = query.trim().toLowerCase();
  const match = (eid: string) => {
    const it = meta[eid];
    if (!it) return false;
    if (skill && it.skill !== skill) return false;
    if (q) {
      const hay = (it.title + " " + (it.tags ?? []).join(" ")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const filtering = !!q || !!skill;

  const expandedStage = openStage === FIRST_STAGE ? stageOrder[0] : openStage;
  const stageRows: StageRow[] = stageOrder.map((id) => ({ id, title: titles[id] ?? "", count: (containers[id] ?? []).length }));

  // Dropdown lọc theo trạng thái (kèm số lượng động).
  const statusOptions = [
    { value: "all", label: t("teacherMain.paths.filter.all"), icon: <Layers className="size-4 text-slate-400" /> },
    { value: "staged", label: t("teacherMain.paths.filter.staged", { n: totalStaged }), icon: <ListChecks className="size-4 text-cyan-500" /> },
    { value: "kho", label: t("teacherMain.paths.filter.warehouse", { n: unstaged.length }), icon: <Package className="size-4 text-amber-500" /> },
  ];

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      {/* Stats card */}
      <Card className="mb-4">
        <div className="grid grid-cols-4 divide-x divide-slate-100 p-3 text-center dark:divide-slate-800">
          <Stat value={totalAll} label={t("teacherMain.paths.total")} />
          <Stat value={totalStaged} label={t("teacherMain.paths.staged")} tone="cyan" />
          <Stat value={unstaged.length} label={t("teacherMain.paths.inWarehouse")} tone="amber" />
          <Stat value={stageOrder.length} label={t("teacherMain.paths.stages")} />
        </div>
      </Card>

      {/* Toolbar 1 hàng: search · lọc Kho · lọc Kỹ năng · Quản lý chặng · Lưu bố cục */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="min-w-[180px] flex-1">
          <Input
            className="h-11 py-0"
            leftIcon={<Search className="size-4" />}
            placeholder={t("teacherMain.paths.search")}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onClear={() => onQueryChange("")}
          />
        </div>
        <div className="w-40 shrink-0">
          <Select options={statusOptions} value={tab} onChange={(v) => onTabChange(v as StatusTab)} />
        </div>
        <div className="w-52 shrink-0">
          <SkillFilter value={skill} onChange={onSkillChange} />
        </div>
        <Button variant="outline" onClick={() => setDrawer(true)}>
          <Settings2 className="size-4" /> {t("teacherMain.paths.manageStages")}
        </Button>
        <Button onClick={save} disabled={(!dirty && !savedAt) || saving}>
          {savedAt ? (
            <>
              <Check className="size-4" /> {t("teacherMain.paths.saved")}
            </>
          ) : (
            <>
              <Save className="size-4" /> {saving ? t("common.saving") : t("teacherMain.paths.saveLayout")}
            </>
          )}
        </Button>
      </div>

      {/* Các chặng (thứ tự dọc = thứ tự mở khóa) */}
      {tab !== "kho" && (
        <div className="space-y-3">
          {stageOrder.length === 0 && (
            <Card className="border-dashed">
              <p className="p-6 text-center text-sm text-slate-500">
                {t("teacherMain.paths.emptyStages")} <b>{t("teacherMain.paths.manageStages")}</b> {t("teacherMain.paths.emptyStagesEnd")}
              </p>
            </Card>
          )}
          {stageOrder.map((sid, i) => (
            <StageColumn
              key={sid}
              id={sid}
              index={i}
              title={titles[sid] ?? ""}
              itemIds={containers[sid] ?? []}
              meta={meta}
              orderOf={orderOf}
              match={match}
              filtering={filtering}
              collapsed={!filtering && expandedStage !== sid}
              onToggle={() => setOpenStage(expandedStage === sid ? "" : sid)}
              onRemove={(eid) => removeFromStage(eid, sid)}
            />
          ))}
        </div>
      )}

      {/* Kho — bài chưa xếp */}
      {tab !== "staged" && (
        <div className="mt-6">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Layers className="size-3.5" /> {t("teacherMain.paths.warehouse", { n: unstaged.length })}
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <DropList id={UNSTAGED} itemIds={unstaged} meta={meta} orderOf={orderOf} match={match} muted />
        </div>
      )}

      <DragOverlay>{activeId ? <ChipBody item={meta[activeId]} order={orderOf[activeId]} dragging /> : null}</DragOverlay>

      <StagesDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        levelName={data?.level.name ?? ""}
        stages={stageRows}
        onAdd={addStage}
        onRename={renameStage}
        onDelete={deleteStage}
        onReorder={reorderStages}
      />
    </DndContext>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "cyan" | "amber" }) {
  const color =
    tone === "cyan" ? "text-cyan-600 dark:text-cyan-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-100";
  return (
    <div>
      <div className={cn("text-2xl font-extrabold tabular-nums", color)}>{value}</div>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ---- Một chặng (header collapse + danh sách bài droppable) ----
function StageColumn({
  id,
  index,
  title,
  itemIds,
  meta,
  orderOf,
  match,
  filtering,
  collapsed,
  onToggle,
  onRemove,
}: {
  id: string;
  index: number;
  title: string;
  itemIds: string[];
  meta: Record<string, PathItem>;
  orderOf: Record<string, number>;
  match: (eid: string) => boolean;
  filtering: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onRemove: (eid: string) => void;
}) {
  const matchCount = filtering ? itemIds.filter(match).length : itemIds.length;
  const header = (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left"
    >
      <ChevronDown className={cn("size-5 shrink-0 text-slate-400 transition-transform", collapsed && "-rotate-90")} />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-sm font-bold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-800 dark:text-slate-100">{title || t("teacherMain.paths.unnamedStage")}</span>
      <span className="shrink-0 text-sm font-medium text-slate-400">
        {filtering ? `${matchCount}/${itemIds.length}` : itemIds.length} {t("teacherMain.paths.exercises", { n: itemIds.length })}
      </span>
    </button>
  );
  if (collapsed) return <CollapsedStage id={id}>{header}</CollapsedStage>;
  return (
    <Card>
      {header}
      <div className="px-3 pb-3">
        <DropList id={id} itemIds={itemIds} meta={meta} orderOf={orderOf} match={match} onRemove={onRemove} />
      </div>
    </Card>
  );
}

// A collapsed stage is still a drop target: dropping on its header appends to the stage.
function CollapsedStage({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("rounded-2xl transition-shadow", isOver && "ring-2 ring-cyan-400")}>
      <Card>{children}</Card>
    </div>
  );
}

// ---- Danh sách droppable (dùng cho cả chặng lẫn kho) ----
function DropList({
  id,
  itemIds,
  meta,
  orderOf,
  match,
  muted,
  onRemove,
}: {
  id: string;
  itemIds: string[];
  meta: Record<string, PathItem>;
  orderOf: Record<string, number>;
  match: (eid: string) => boolean;
  muted?: boolean;
  onRemove?: (eid: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const visible = itemIds.filter(match);
  return (
    <SortableContext items={visible} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[52px] flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver ? "border-cyan-400 bg-cyan-50/50 dark:border-cyan-500 dark:bg-cyan-950/20" : "border-slate-200 dark:border-slate-700",
          muted && !isOver && "bg-slate-50/60 dark:bg-slate-900/30",
        )}
      >
        {visible.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-400">{itemIds.length ? t("teacherMain.paths.noMatch") : t("teacherMain.paths.dragHere")}</p>
        ) : (
          visible.map((eid) => (
            <SortableChip
              key={eid}
              id={eid}
              item={meta[eid]}
              order={orderOf[eid]}
              onRemove={onRemove ? () => onRemove(eid) : undefined}
            />
          ))
        )}
      </div>
    </SortableContext>
  );
}

function SortableChip({ id, item, order, onRemove }: { id: string; item?: PathItem; order?: number; onRemove?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <ChipBody item={item} order={order} handleProps={{ ...attributes, ...listeners }} onRemove={onRemove} />
    </div>
  );
}

function ChipBody({
  item,
  order,
  handleProps,
  dragging,
  onRemove,
}: {
  item?: PathItem;
  order?: number;
  handleProps?: Record<string, unknown>;
  dragging?: boolean;
  onRemove?: () => void;
}) {
  if (!item) return null;
  return (
    // handleProps đặt trên CẢ card → kéo-thả bằng cả thẻ (không chỉ icon grip).
    <div
      {...handleProps}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2 pr-2 shadow-sm dark:border-slate-700 dark:bg-slate-800",
        handleProps && "cursor-grab touch-none active:cursor-grabbing",
        dragging && "ring-2 ring-cyan-400",
      )}
    >
      <span className="px-0.5 text-slate-300 dark:text-slate-500">
        <GripVertical className="size-4" />
      </span>
      {order != null && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500 tabular-nums dark:bg-slate-700 dark:text-slate-300">
          {order}
        </span>
      )}
      <SkillThumb skill={item.skill} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</span>
      {!item.published && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
          <Lock className="size-3" /> {t("teacherMain.exercises.status.draft")}
        </span>
      )}
      {onRemove && (
        // Dừng pointerdown để bấm nút không kích hoạt kéo card.
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          title={t("teacherMain.paths.removeStage")}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
