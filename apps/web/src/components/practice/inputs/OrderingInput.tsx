import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import type { QuestionInputProps } from "../types";
import { encodeOrdering, decodeOrdering } from "../../../lib/practiceAnswers";
import { cn } from "../../../lib/utils";
import { t } from "../../../i18n";

// ============================================================
//  OrderingInput — học sinh xếp các token thành câu đúng thứ tự.
//  - value (đã mã hoá) = các token nối bằng dấu cách (encodeOrdering).
//  - Token có thể TRÙNG text ⇒ quản theo id = index trong q.tokens.
//  - KÉO-THẢ (1 DndContext, 2 vùng):
//      • Kéo thẻ từ "Kho từ" → thả vào vùng xếp (chèn/nối).
//      • Kéo thẻ trong vùng xếp để đổi thứ tự; kéo về Kho để bỏ.
//  - Desktop: có grip + nút X. Mobile: bỏ grip/X → CHẠM để thêm/gỡ, GIỮ để kéo.
// ============================================================

interface Tok {
  id: number;
  text: string;
}

const SEQ_ZONE = "SEQ_ZONE";
const POOL_ZONE = "POOL_ZONE";

// Kho từ phải hiện thẻ theo thứ tự XÁO TRỘN, không thì tokens (lưu đúng thứ tự đáp án)
// sẽ bày sẵn câu trả lời. Xáo ỔN ĐỊNH (seed theo nội dung) để không nhảy khi render lại,
// và đảm bảo KHÁC thứ tự gốc cho câu ≥ 2 thẻ.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Trả về hoán vị chỉ số các thẻ (ổn định theo nội dung, khác thứ tự gốc khi có thể). */
function shuffledOrder(tokens: string[]): number[] {
  const n = tokens.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return idx;
  const rnd = mulberry32(hashStr(tokens.join("")));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (idx.every((v, i) => v === i)) idx.push(idx.shift() as number); // né trùng thứ tự gốc
  return idx;
}

export function OrderingInput({ q, value, onChange, graded, isMobile }: QuestionInputProps) {
  const allTokens = q.tokens ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);

  // Khôi phục dãy đã xếp (seq) từ value; phần còn lại là pool.
  const { seq, pool } = useMemo(() => {
    const restored = decodeOrdering(value, allTokens);
    const used = new Array(allTokens.length).fill(false);
    const seqIds: Tok[] = [];
    for (const text of restored) {
      const idx = allTokens.findIndex((t, i) => !used[i] && t === text);
      if (idx === -1) continue;
      used[idx] = true;
      seqIds.push({ id: idx, text: allTokens[idx] });
    }
    // Kho từ theo thứ tự xáo trộn ổn định (id vẫn = index gốc để chấm/kéo-thả đúng).
    const poolIds: Tok[] = shuffledOrder(allTokens)
      .filter((i) => !used[i])
      .map((i) => ({ id: i, text: allTokens[i] }));
    return { seq: seqIds, pool: poolIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, allTokens.join("")]);

  function commit(nextSeq: Tok[]) {
    onChange(encodeOrdering(nextSeq.map((t) => t.text)));
  }
  const addToSeq = (id: number) => {
    if (allTokens[id] === undefined) return;
    commit([...seq, { id, text: allTokens[id] }]);
  };
  const removeFromSeq = (id: number) => commit(seq.filter((t) => t.id !== id));

  const sentence = seq.map((t) => t.text).join(" ");

  // Distance-based: chạm không di = click (thêm/gỡ) · chạm-kéo = drag. Hợp cả chuột lẫn cảm ứng.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: isMobile ? 6 : 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const a = String(active.id);
    const o = String(over.id);
    const aTid = Number(a.slice(1));
    const fromSeq = a[0] === "s";

    if (fromSeq) {
      if (o === POOL_ZONE) return removeFromSeq(aTid); // kéo về kho → bỏ
      if (o[0] === "s") {
        const from = seq.findIndex((t) => t.id === aTid);
        const to = seq.findIndex((t) => t.id === Number(o.slice(1)));
        if (from !== -1 && to !== -1 && from !== to) commit(arrayMove(seq, from, to));
      }
      return;
    }
    // Kéo từ kho (pool)
    if (o === POOL_ZONE) return;
    const tok = { id: aTid, text: allTokens[aTid] };
    if (o[0] === "s") {
      const idx = seq.findIndex((t) => t.id === Number(o.slice(1)));
      const next = seq.slice();
      next.splice(idx === -1 ? seq.length : idx, 0, tok);
      commit(next);
      return;
    }
    commit([...seq, tok]); // thả vào vùng trống → nối cuối
  }

  // ===================== READ-ONLY (đã chấm) =====================
  if (graded) {
    return (
      <div className="space-y-2">
        <div className="flex min-h-[52px] flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-600">
          {seq.length === 0 ? (
            <span className="text-sm text-slate-400 dark:text-slate-500">{t("practice2.input.unordered")}</span>
          ) : (
            seq.map((t) => (
              <span key={t.id} className="rounded-xl border border-cyan-400 bg-cyan-50 px-3 py-1.5 text-sm dark:bg-cyan-500/10">
                {t.text}
              </span>
            ))
          )}
        </div>
        {sentence && (
          <p className="pt-1 text-center text-base font-semibold text-slate-800 dark:text-slate-100">{sentence}</p>
        )}
      </div>
    );
  }

  const activeTok = activeId ? { id: Number(activeId.slice(1)), text: allTokens[Number(activeId.slice(1))] } : null;

  // ===================== TƯƠNG TÁC (kéo-thả) =====================
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {/* Vùng xếp câu */}
        <div className="space-y-2">
          <SortableContext items={seq.map((t) => `s${t.id}`)} strategy={horizontalListSortingStrategy}>
            <DropZone id={SEQ_ZONE} className="border-dashed">
              {seq.length === 0 ? (
                <span className="text-sm text-slate-400 dark:text-slate-500">
                  {isMobile ? t("practice2.input.tapToOrder") : t("practice2.input.clickToOrder")}
                </span>
              ) : (
                seq.map((t) => (
                  <SeqChip key={t.id} tok={t} isMobile={isMobile} onRemove={() => removeFromSeq(t.id)} />
                ))
              )}
            </DropZone>
          </SortableContext>
          {sentence && (
            <p className="pt-1 text-center text-base font-semibold text-slate-800 dark:text-slate-100">{sentence}</p>
          )}
        </div>

        {/* Kho từ (pool) */}
        <div className="space-y-2">
          <div className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">{t("practice2.input.poolWithWords")}</div>
          <DropZone id={POOL_ZONE} bare>
            {pool.length === 0 ? (
              <span className="text-sm text-slate-400 dark:text-slate-500">{t("practice2.input.allUsed")}</span>
            ) : (
              pool.map((t) => <PoolChip key={t.id} tok={t} isMobile={isMobile} onAdd={() => addToSeq(t.id)} />)
            )}
          </DropZone>
        </div>
      </div>

      {/* Overlay thẻ đang kéo */}
      <DragOverlay>
        {activeTok ? (
          <span className="flex items-center gap-1 rounded-xl border border-cyan-400 bg-cyan-50 px-3 py-1.5 text-sm shadow-lg dark:bg-cyan-500/10">
            {!isMobile && <GripVertical className="size-4 text-cyan-400/70" />}
            {activeTok.text}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Vùng nhận thả (bọc các thẻ). bare = không viền/không khung (dùng cho Kho từ).
function DropZone({
  id,
  className,
  bare,
  children,
}: {
  id: string;
  className?: string;
  bare?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  if (bare) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-wrap items-center justify-center gap-2 rounded-xl py-1 transition-colors",
          isOver && "bg-cyan-50/60 dark:bg-cyan-500/5",
          className,
        )}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[52px] flex-wrap items-center justify-center gap-2 rounded-xl border p-3 transition-colors",
        isOver ? "border-cyan-400 bg-cyan-50/60 dark:border-cyan-500/60 dark:bg-cyan-500/5" : "border-slate-300 dark:border-slate-600",
        className,
      )}
    >
      {children}
    </div>
  );
}

// -------- Thẻ trong vùng xếp (sortable) --------
function SeqChip({ tok, isMobile, onRemove }: { tok: Tok; isMobile: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `s${tok.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition };

  // Mobile: cả thẻ = chạm để gỡ, giữ để kéo (không grip/X).
  if (isMobile) {
    return (
      <button
        ref={setNodeRef}
        style={style}
        type="button"
        onClick={onRemove}
        {...attributes}
        {...listeners}
        className={cn(
          "touch-none rounded-xl border border-cyan-400 bg-cyan-50 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm dark:bg-cyan-500/10 dark:text-slate-100",
          isDragging && "opacity-60 shadow-lg",
        )}
      >
        {tok.text}
      </button>
    );
  }
  // Desktop: CẢ thẻ = vùng kéo (giữ+kéo cả card); nút X để gỡ.
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab touch-none select-none items-center gap-1 rounded-xl border border-cyan-400 bg-cyan-50 py-1.5 pl-2 pr-1.5 text-sm shadow-sm active:cursor-grabbing dark:bg-cyan-500/10",
        isDragging && "opacity-60 shadow-lg",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-cyan-400/70" />
      {tok.text}
      {/* Ngăn pointerdown trên nút X kích hoạt kéo thẻ */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={t("practice2.input.returnToPool")}
        className="rounded p-0.5 text-slate-400 hover:text-rose-500"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

// -------- Thẻ trong kho (draggable) --------
function PoolChip({ tok, isMobile, onAdd }: { tok: Tok; isMobile: boolean; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `p${tok.id}` });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  // Mobile: cả thẻ = chạm để thêm, giữ để kéo (không grip).
  if (isMobile) {
    return (
      <button
        ref={setNodeRef}
        style={style}
        type="button"
        onClick={onAdd}
        {...attributes}
        {...listeners}
        className={cn(
          "touch-none rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
          isDragging && "opacity-40",
        )}
      >
        {tok.text}
      </button>
    );
  }
  // Desktop: CẢ thẻ = vùng kéo; bấm (không di) để thêm nhanh.
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onAdd}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab touch-none select-none items-center gap-1.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-2 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300",
        isDragging && "opacity-40",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-slate-300 dark:text-slate-500" />
      {tok.text}
    </button>
  );
}
