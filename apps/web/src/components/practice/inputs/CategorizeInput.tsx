// Input cho câu hỏi PHÂN LOẠI (categorize): kéo/bấm mỗi item vào đúng nhóm.
// value = JSON { [itemText]: category } (xem lib/practiceAnswers → encodeCategorize).
// - Kéo-thả trên CẢ desktop lẫn mobile (mobile: GIỮ để kéo — PointerSensor delay).
// - Vẫn giữ CHẠM để chọn item rồi chạm nhóm (tiện trên mobile).
// - Chạm item đã ở trong nhóm (mobile) → gỡ về kho; desktop dùng nút X.
import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { QuestionInputProps } from "../types";
import { decodeCategorize, encodeCategorize } from "../../../lib/practiceAnswers";
import { QImage } from "../QImage";
import { cn } from "../../../lib/utils";
import { t } from "../../../i18n";

const POOL_ID = "__pool__";

/** Nội dung 1 chip (ảnh nhỏ nếu có + chữ) — canh giữa. */
function ItemBody({ image, text }: { image?: string | null; text: string }) {
  return (
    <span className="flex flex-col items-center">
      {image ? <QImage src={image} className="mb-1 max-h-16 rounded-md object-contain" /> : null}
      <span>{text}</span>
    </span>
  );
}

/** Chip KÉO-THẢ (dùng chung mobile & desktop). */
function Chip({
  text,
  image,
  isMobile,
  selected,
  inGroup,
  onClick,
  onRemove,
}: {
  text: string;
  image?: string | null;
  isMobile: boolean;
  selected?: boolean;
  inGroup?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: text });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  // Mobile: cả chip = drag (giữ) + tap (onClick); không grip/X.
  if (isMobile) {
    return (
      <button
        ref={setNodeRef}
        style={style}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        {...attributes}
        {...listeners}
        className={cn(
          "inline-flex touch-none items-center rounded-xl border px-3 py-1.5 text-sm shadow-sm",
          "border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
          selected && "border-cyan-500 ring-2 ring-cyan-400 dark:border-cyan-400",
          isDragging && "opacity-40",
        )}
      >
        <ItemBody image={image} text={text} />
      </button>
    );
  }
  // Desktop: grip để kéo + nút X (nếu đang ở trong nhóm).
  return (
    <span
      ref={setNodeRef}
      style={style}
      className={cn(
        "inline-flex touch-none items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm shadow-sm",
        "border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
        isDragging && "opacity-40",
      )}
    >
      <span {...listeners} {...attributes} className="inline-flex cursor-grab select-none items-center gap-1 active:cursor-grabbing">
        <GripVertical className="size-4 shrink-0 text-slate-300 dark:text-slate-500" />
        <ItemBody image={image} text={text} />
      </span>
      {inGroup && onRemove ? (
        <button type="button" aria-label={t("practice2.input.removeFromGroup")} onClick={onRemove} className="ml-0.5 text-slate-400 hover:text-rose-500 dark:text-slate-500">
          <X className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}

/** Chip KHOÁ (đã chấm, read-only). `result` (tuỳ chọn) tô xanh/đỏ theo đúng/sai. */
function StaticChip({ image, text, result }: { image?: string | null; text: string; result?: boolean }) {
  const tone =
    result === undefined
      ? "border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      : result
        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
        : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200";
  return (
    <span className={cn("inline-flex items-center rounded-xl border px-3 py-1.5 text-sm shadow-sm", tone)}>
      <ItemBody image={image} text={text} />
    </span>
  );
}

/** Ô nhận thả (nhóm hoặc kho) — sáng viền khi kéo phủ; mobile bấm được để thả item đã chọn. */
function DropBox({
  id,
  isMobile,
  highlight,
  dashed,
  onTap,
  children,
}: {
  id: string;
  isMobile: boolean;
  highlight?: boolean;
  dashed?: boolean;
  onTap?: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      onClick={isMobile ? onTap : undefined}
      role={isMobile && onTap ? "button" : undefined}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        dashed ? "border-dashed" : "",
        isMobile && onTap && "cursor-pointer",
        isOver
          ? "border-cyan-500 bg-cyan-50/60 dark:border-cyan-400 dark:bg-cyan-950/30"
          : highlight
            ? "border-cyan-400 bg-cyan-50/50 dark:border-cyan-500 dark:bg-cyan-950/20"
            : "border-slate-300 dark:border-slate-600",
      )}
    >
      {children}
    </div>
  );
}

// Props tuỳ chọn (bộ thẻ từ vựng dùng; Quiz KHÔNG truyền → giữ nguyên):
//  • `resultOf`  — itemText → đúng/sai, tô xanh/đỏ chip sau khi chấm.
//  • `forceTap`  — luôn bật CHẠM-chọn (cả desktop) song song kéo-thả, chip kiểu cảm ứng.
//  • `maxCols`   — số cột nhóm tối đa (mặc định 2; vocab dùng 3).
export function CategorizeInput({
  q, value, onChange, graded, isMobile, resultOf, forceTap, maxCols = 2, poolLabel = t("practice2.input.pool"), emptyLabel = t("practice2.input.allSorted"),
}: QuestionInputProps & { resultOf?: (itemText: string) => boolean; forceTap?: boolean; maxCols?: 2 | 3; poolLabel?: string; emptyLabel?: string }) {
  const categories = q.categories ?? [];
  const items = q.items ?? [];
  const touch = isMobile || !!forceTap; // CHẠM-chọn bật khi mobile HOẶC forceTap

  const map = useMemo(() => decodeCategorize(value), [value]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Distance-based: chạm không di = tap (chọn/gỡ) · chạm-kéo = drag. Hợp cả chuột lẫn cảm ứng.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: touch ? 6 : 5 } }));

  const imageOf = (text: string) => items.find((it) => it.text === text)?.image ?? null;
  const poolItems = items.filter((it) => !map[it.text]);
  const itemsIn = (cat: string) => items.filter((it) => map[it.text] === cat);

  function assign(itemText: string, cat: string | null) {
    if (graded) return;
    const next = { ...map };
    if (cat) next[itemText] = cat;
    else delete next[itemText];
    onChange(encodeCategorize(next));
  }

  // Kéo-thả
  function onDragStart(e: DragStartEvent) {
    setSelected(null);
    setDragging(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const itemText = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    assign(itemText, over === POOL_ID ? null : over);
  }

  // Chạm-chọn (mobile)
  const tapPool = (t: string) => setSelected((cur) => (cur === t ? null : t));
  const tapCategory = (cat: string) => {
    if (!selected) return;
    assign(selected, cat);
    setSelected(null);
  };

  // 3 nhóm → chia 3 cột inline kể cả mobile (tên nhóm ngắn, xếp dọc thì phải cuộn nhiều).
  // Còn lại: mobile 1 cột, desktop 2.
  const cols =
    categories.length <= 1
      ? "grid-cols-1"
      : categories.length === 3 || (maxCols === 3 && categories.length >= 3)
        ? "grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";

  function groupChips(cat: string) {
    return itemsIn(cat).map((it) =>
      graded ? (
        <StaticChip key={it.text} image={it.image} text={it.text} result={resultOf?.(it.text)} />
      ) : (
        <Chip
          key={it.text}
          text={it.text}
          image={it.image}
          isMobile={touch}
          inGroup
          onClick={() => touch && assign(it.text, null)}
          onRemove={() => assign(it.text, null)}
        />
      ),
    );
  }

  const groups = (
    <div className={cn("grid gap-2 sm:gap-3", cols)}>
      {categories.map((cat) => {
        const inner = (
          <>
            <div className="mb-2 break-words border-b border-slate-200 pb-1.5 text-center text-xs font-semibold text-slate-700 sm:text-sm dark:border-slate-700 dark:text-slate-200">{cat}</div>
            <div className="flex min-h-[60px] flex-wrap content-center justify-center gap-1.5 sm:gap-2">{groupChips(cat)}</div>
          </>
        );
        if (graded) {
          return (
            <div key={cat} className="rounded-xl border border-slate-300 p-3 dark:border-slate-600">
              {inner}
            </div>
          );
        }
        return (
          <DropBox key={cat} id={cat} isMobile={touch} highlight={touch && !!selected} onTap={() => tapCategory(cat)}>
            {inner}
          </DropBox>
        );
      })}
    </div>
  );

  const poolInner = (
    <>
      <div className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{poolLabel}</div>
      {poolItems.length ? (
        <div className="flex flex-wrap justify-center gap-2">
          {poolItems.map((it) =>
            graded ? (
              <StaticChip key={it.text} image={it.image} text={it.text} />
            ) : (
              <Chip
                key={it.text}
                text={it.text}
                image={it.image}
                isMobile={touch}
                selected={selected === it.text}
                onClick={() => touch && tapPool(it.text)}
              />
            ),
          )}
        </div>
      ) : (
        <div className="text-center text-sm text-slate-400 dark:text-slate-500">{emptyLabel}</div>
      )}
    </>
  );

  const pool = graded ? (
    <div className="min-h-[48px] rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-600">{poolInner}</div>
  ) : (
    <DropBox id={POOL_ID} isMobile={touch} dashed>
      {poolInner}
    </DropBox>
  );

  if (graded) {
    return (
      <div className="space-y-3">
        {groups}
        {pool}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        {groups}
        {pool}
      </div>
      <DragOverlay>{dragging ? <StaticChip image={imageOf(dragging)} text={dragging} /> : null}</DragOverlay>
    </DndContext>
  );
}
