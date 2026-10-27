// Tra cứu NGỮ PHÁP: lọc theo cấp độ CEFR + nhóm (category) + tìm kiếm, gom theo band,
// mở từng mục xem chi tiết. DANH SÁCH tải bản gọn (GET /grammar); chi tiết LAZY-FETCH khi mở
// (GET /grammar/:id) — payload nhẹ hơn cả chục lần. Lọc/tìm/mở đồng bộ URL để deep-link.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight, Blocks, Box, Check, ChevronDown, Clock, Combine, GitBranch,
  Bookmark, BookmarkCheck, KeyRound, Link2, MapPin, Palette, Puzzle, RotateCcw, Search, Tag, Users, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CEFR_BANDS, type Cefr, type GrammarListItem, type GrammarMarked } from "@msyen/shared";
import { accountApi, publicGrammar, publicGrammarOne } from "../../../lib/api";
import { Card, Input } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import { BAND_COLOR, CATEGORY_STYLE } from "../../../lib/cefr";
import GrammarDetail from "../../../components/GrammarDetail";
import { FilterMenu } from "../../../components/FilterMenu";
import { t } from "../../../i18n";

// Tên icon trong CATEGORY_STYLE → component (shared chỉ giữ TÊN, không import lucide được).
const CAT_ICONS: Record<string, LucideIcon> = {
  Clock, Blocks, GitBranch, KeyRound, Palette, Link2, Box, Users, MapPin, Combine, ArrowLeftRight, Puzzle,
};

function CatIcon({ name, color }: { name?: string; color?: string }) {
  const Icon = (name && CAT_ICONS[name]) || Tag;
  return <Icon className="size-4" style={{ color: color ?? "#94a3b8" }} />;
}

// Viên nhãn màu (band CEFR / nhóm).
function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${color}1a`, color }}>
      {text}
    </span>
  );
}

export default function GrammarView() {
  const { data, isLoading } = useQuery({ queryKey: ["grammar"], queryFn: publicGrammar, staleTime: Infinity, retry: false });
  // Lọc/tìm/mở đồng bộ URL (?band=&cat=&q=&id=) → deep-link, share, nút back của trình duyệt.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const band = (params.get("band") as Cefr | null) ?? "all";
  const cat = params.get("cat") ?? "all";
  const openId = params.get("id");
  const focusId = params.get("focus"); // FOCUS 1 điểm (từ "Cần ôn") — chỉ hiện đúng điểm đó.

  // Cập nhật 1 tham số URL (bỏ khỏi URL khi về giá trị mặc định cho gọn).
  function patch(key: string, value: string, dflt: string) {
    const next = new URLSearchParams(params);
    if (value === dflt) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key === "q" }); // gõ tìm kiếm → replace để không kẹt lịch sử
  }

  // FOCUS một điểm — ẩn hết danh sách + bộ lọc, chỉ hiện đúng điểm đó (dùng khi bấm ở "Cần ôn").
  function openOnly(id: string) {
    setParams(new URLSearchParams({ focus: id }));
  }
  // Thoát FOCUS — về danh sách đầy đủ (xoá mọi tham số).
  function exitFocus() {
    setParams(new URLSearchParams());
  }

  // Ô tìm kiếm dùng STATE CỤC BỘ, không buộc thẳng vào URL. Buộc value vào URL khiến
  // mỗi phím gõ round-trip qua setParams ghi đè bộ đệm IME → gõ tiếng Việt có dấu
  // (Telex/VNI) bị rớt/loạn dấu. Đồng bộ ngược URL→ô chỉ khi KHÔNG đang gõ IME.
  const [text, setText] = useState(q);
  const composing = useRef(false);
  // Gõ xong (dừng ~250ms) mới ghi vào URL để giữ deep-link/chia sẻ; lọc thì tức thời theo `text`.
  useEffect(() => {
    const t = setTimeout(() => { if (text !== q) patch("q", text, ""); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  // URL đổi từ ngoài (back/forward, xoá lọc) → nạp lại ô, trừ khi đang gõ dở IME.
  useEffect(() => {
    if (!composing.current && q !== text) setText(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // "Needs review" — grammar points the user still gets wrong (from their own submissions).

  const { data: review } = useQuery({ queryKey: ["grammar-review"], queryFn: accountApi.grammarReview, retry: false });
  const weak = review?.items ?? [];

  // "Đã học" — tập id user tự đánh dấu; toggle optimistic để bấm là thấy ngay.
  const qc = useQueryClient();
  const { data: learnedData } = useQuery({ queryKey: ["grammar-learned"], queryFn: accountApi.grammarLearned, retry: false });
  const learnedSet = useMemo(() => new Set(learnedData?.ids ?? []), [learnedData]);
  const toggleLearned = useMutation({
    mutationFn: ({ id, learned }: { id: string; learned: boolean }) => accountApi.grammarSetLearned(id, learned),
    onMutate: async ({ id, learned }) => {
      await qc.cancelQueries({ queryKey: ["grammar-learned"] });
      const prev = qc.getQueryData<{ ids: string[] }>(["grammar-learned"]);
      const ids = new Set(prev?.ids ?? []);
      if (learned) ids.add(id);
      else ids.delete(id);
      qc.setQueryData(["grammar-learned"], { ids: [...ids] });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["grammar-learned"], ctx.prev),
  });

  // "Đã ghim" — điểm user muốn luyện tiếp. Khác `learned` (đã xong): ghim là việc CÒN PHẢI LÀM.
  const { data: markedData } = useQuery({ queryKey: ["grammar-marked"], queryFn: accountApi.grammarMarked, retry: false });
  const marked = useMemo(() => markedData?.items ?? [], [markedData]);
  const markedSet = useMemo(() => new Set(marked.map((m) => m.id)), [marked]);
  const onlyMarked = params.get("marked") === "1";
  const toggleMarked = useMutation({
    mutationFn: ({ id, marked }: { id: string; marked: boolean }) => accountApi.grammarSetMarked(id, marked),
    // Optimistic: dựng hàng từ danh sách ĐANG có (khỏi chờ round-trip mới thấy khu nhắc đổi).
    onMutate: async ({ id, marked }) => {
      await qc.cancelQueries({ queryKey: ["grammar-marked"] });
      const prev = qc.getQueryData<{ items: GrammarMarked[] }>(["grammar-marked"]);
      const g = data?.items.find((x) => x.id === id);
      const next = marked
        ? g
          ? [{ ...g, marked_at: new Date().toISOString() }, ...(prev?.items ?? [])]
          : (prev?.items ?? [])
        : (prev?.items ?? []).filter((m) => m.id !== id);
      qc.setQueryData(["grammar-marked"], { items: next });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["grammar-marked"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["grammar-marked"] }),
  });

  const items = data?.items ?? [];
  const focusItem = focusId ? items.find((g) => g.id === focusId) : undefined;

  // Lựa chọn cho dropdown NHÓM (category) — chỉ nhóm có thật trong dữ liệu, kèm số đếm.
  const catOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of items) m.set(g.category, (m.get(g.category) ?? 0) + 1);
    return [
      { value: "all", label: "All grammar", count: items.length, icon: <CatIcon /> },
      ...[...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => ({
          value: name,
          label: name,
          count: n,
          icon: <CatIcon name={CATEGORY_STYLE[name]?.icon} color={CATEGORY_STYLE[name]?.color} />,
        })),
    ];
  }, [items]);

  // Lựa chọn cho dropdown CẤP ĐỘ — bỏ band không có điểm nào để menu khỏi có dòng chết.
  const bandOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of items) m.set(g.cefr, (m.get(g.cefr) ?? 0) + 1);
    return [
      { value: "all", label: "All levels", count: items.length },
      ...CEFR_BANDS.filter((b) => m.has(b)).map((b) => ({
        value: b,
        label: b,
        count: m.get(b),
        color: BAND_COLOR[b],
      })),
    ];
  }, [items]);

  const filtered = useMemo(() => {
    const kw = text.trim().toLowerCase();
    return items.filter((g) => {
      if (onlyMarked && !markedSet.has(g.id)) return false;
      if (band !== "all" && g.cefr !== band) return false;
      if (cat !== "all" && g.category !== cat) return false;
      if (!kw) return true;
      // Quét rộng: tiêu đề, tóm tắt, nhóm, dấu hiệu nhận biết, và từ khoá (có cả tiếng Việt).
      return (
        g.title.toLowerCase().includes(kw) ||
        g.summary.toLowerCase().includes(kw) ||
        g.category.toLowerCase().includes(kw) ||
        (g.signals ?? []).some((s) => s.toLowerCase().includes(kw)) ||
        (g.keywords ?? []).some((k) => k.toLowerCase().includes(kw))
      );
    });
  }, [items, text, band, cat, onlyMarked, markedSet]);

  // Gom theo band, theo thứ tự ladder; trong band giữ position.
  const groups = useMemo(() => {
    return CEFR_BANDS.map((b) => ({
      band: b,
      entries: filtered.filter((g) => g.cefr === b).sort((a, c) => (a.position ?? 0) - (c.position ?? 0)),
    })).filter((g) => g.entries.length > 0);
  }, [filtered]);

  if (isLoading) return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  if (!items.length) return <p className="py-10 text-center text-sm text-slate-400">No grammar content yet.</p>;

  // FOCUS: bấm 1 điểm ở "Cần ôn" → chỉ hiện đúng điểm đó (ẩn danh sách + bộ lọc), kèm nút quay lại.
  if (focusItem) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={exitFocus}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-cyan-600 dark:hover:text-cyan-400"
        >
          <ArrowLeft className="size-4" /> See all grammar
        </button>
        {/* Vẫn giữ dải "Cần ôn" để nhảy nhanh sang điểm khác; tô sáng điểm đang xem. */}
        <WeakReview weak={weak} onPick={openOnly} activeId={focusItem.id} />
        <GrammarCard
          g={focusItem}
          open
          onToggle={exitFocus}
          learned={learnedSet.has(focusItem.id)}
          onToggleLearned={() => toggleLearned.mutate({ id: focusItem.id, learned: !learnedSet.has(focusItem.id) })}
          marked={markedSet.has(focusItem.id)}
          onToggleMarked={() => toggleMarked.mutate({ id: focusItem.id, marked: !markedSet.has(focusItem.id) })}
          linkTo={(id) => `?focus=${id}`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ĐÃ GHIM — lời nhắc do chính user (hoặc nhận xét của cô) đặt ra; gỡ ngay tại đây. */}
      <MarkedReminder
        marked={marked}
        onPick={openOnly}
        onUnmark={(id) => toggleMarked.mutate({ id, marked: false })}
        onSeeAll={() => patch("marked", "1", "0")}
      />

      {/* CẦN ÔN — điểm còn sai của chính user (bỏ qua nếu chưa làm bài nào có nhãn ngữ pháp). */}
      <WeakReview weak={weak} onPick={openOnly} />

      {/* Bộ lọc — ô tìm kiếm + 2 dropdown (nhóm · cấp độ) trên CÙNG một hàng.
          Mobile: search chiếm nguyên dòng, 2 dropdown tự xuống hàng chia đôi. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Input tự bọc div w-full nên phải chỉnh flex ở lớp bọc ngoài, không qua className của Input. */}
        <div className="w-full sm:min-w-[16rem] sm:flex-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={(e) => { composing.current = false; setText((e.target as HTMLInputElement).value); }}
            onClear={() => setText("")}
            placeholder="Search grammar (e.g. present simple, yesterday, passive…)"
            leftIcon={<Search className="size-4" />}
          />
        </div>
        <FilterMenu
          label="All grammar"
          value={cat}
          defaultValue="all"
          options={catOptions}
          onChange={(v) => patch("cat", v, "all")}
          className="min-w-0 flex-1 sm:w-56 sm:flex-none"
        />
        <FilterMenu
          label="All levels"
          value={band}
          defaultValue="all"
          options={bandOptions}
          onChange={(v) => patch("band", v, "all")}
          align="end"
          className="min-w-0 flex-1 sm:w-36 sm:flex-none"
        />
        {/* Lọc nhanh "đã ghim" — inline cùng hàng với ô tìm & 2 dropdown. */}
        <button
          type="button"
          onClick={() => patch("marked", onlyMarked ? "0" : "1", "0")}
          aria-pressed={onlyMarked}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition max-sm:w-full max-sm:justify-center",
            onlyMarked
              ? "border-cyan-500 bg-cyan-500 text-white hover:bg-cyan-600"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
          )}
        >
          <Bookmark className={cn("size-4", onlyMarked && "fill-current")} />
          Marked
          {marked.length > 0 && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                onlyMarked ? "bg-white/20" : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
              )}
            >
              {marked.length}
            </span>
          )}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No matching grammar found.</p>
      ) : (
        groups.map(({ band: b, entries }) => (
          <div key={b}>
            <BandHeader band={b} count={entries.length} />
            <div className="flex flex-col gap-2">
              {entries.map((g) => (
                <GrammarCard
                  key={g.id}
                  g={g}
                  open={openId === g.id}
                  onToggle={() => patch("id", openId === g.id ? "" : g.id, "")}
                  learned={learnedSet.has(g.id)}
                  onToggleLearned={() => toggleLearned.mutate({ id: g.id, learned: !learnedSet.has(g.id) })}
                  marked={markedSet.has(g.id)}
                  onToggleMarked={() => toggleMarked.mutate({ id: g.id, marked: !markedSet.has(g.id) })}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Khu NHẮC — các điểm user đã ghim để luyện tiếp. Đây là lời nhắc do chính họ đặt (hoặc nhận
 * từ nhận xét của cô sau một buổi học) nên phải GỠ ĐƯỢC NGAY tại chỗ, không bắt đi tìm.
 */
function MarkedReminder({
  marked,
  onPick,
  onUnmark,
  onSeeAll,
}: {
  marked: GrammarMarked[];
  onPick: (id: string) => void;
  onUnmark: (id: string) => void;
  onSeeAll: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!marked.length) return null;
  const show = expanded ? marked : marked.slice(0, 3);
  return (
    <div className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 p-4 dark:border-cyan-900/50 dark:from-cyan-500/10 dark:to-sky-500/10">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
          <BookmarkCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-cyan-800 dark:text-cyan-200">
            {marked.length} point{marked.length > 1 ? "s" : ""} to practise
          </p>
          <p className="mt-0.5 text-xs text-cyan-700/70 dark:text-cyan-300/70">
            {t("userVideoProfile.grammarView.markedHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-500/10 dark:text-cyan-300"
        >
          Filter list
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {show.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded-xl border border-cyan-200/70 bg-white px-2.5 py-2 dark:border-cyan-900/40 dark:bg-slate-900/70"
          >
            <Pill text={m.cefr} color={BAND_COLOR[m.cefr]} />
            <button type="button" onClick={() => onPick(m.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.title}</span>
              <span className="block truncate text-xs text-slate-500">{m.summary}</span>
            </button>
            <button
              type="button"
              onClick={() => onUnmark(m.id)}
              title="Remove this reminder"
              aria-label="Remove this reminder"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {marked.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-dashed border-cyan-300 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-500/10 dark:border-cyan-800/60 dark:text-cyan-300"
          >
            {expanded ? "Show less" : `+${marked.length - 3} more`}
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
    </div>
  );
}

// Số badge "Cần ôn" hiện lúc thu gọn — phần còn lại giấu sau nút "+N more" để card khỏi phình.
const WEAK_COLLAPSED = 6;

/** Dải "Cần ôn" — điểm còn sai của user; bấm 1 badge để FOCUS xem riêng điểm đó. */
function WeakReview({
  weak,
  onPick,
  activeId,
}: {
  weak: { id: string; title: string; summary: string; wrong: number; seen: number }[];
  onPick: (id: string) => void;
  activeId?: string;
}) {
  // Điểm đang xem nằm ở phần bị giấu → mở sẵn để thấy nó được tô sáng.
  const activeHidden = !!activeId && weak.findIndex((w) => w.id === activeId) >= WEAK_COLLAPSED;
  const [expanded, setExpanded] = useState(false);
  if (!weak.length) return null;
  const show = expanded || activeHidden ? weak : weak.slice(0, WEAK_COLLAPSED);
  const hidden = weak.length - show.length;
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 dark:border-amber-900/50 dark:from-amber-500/10 dark:to-orange-500/10">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-300">
        <RotateCcw className="size-4" /> To review — points you often miss
      </p>
      <div className="flex flex-wrap gap-1.5">
        {show.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onPick(w.id)}
            title={`${w.wrong}/${w.seen} wrong · ${w.summary}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-amber-100 dark:border-amber-800/60 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-amber-500/15",
              activeId === w.id && "ring-2 ring-amber-400 dark:ring-amber-500/60",
            )}
          >
            <span className="truncate max-w-[14rem]">{w.title.split("—")[0].trim()}</span>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              {w.wrong}/{w.seen} wrong
            </span>
          </button>
        ))}
        {(hidden > 0 || (expanded && !activeHidden)) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-800/60 dark:text-amber-300 dark:hover:bg-amber-500/15"
          >
            {hidden > 0 ? `+${hidden} more` : "Show less"}
            <ChevronDown className={cn("size-3.5 transition-transform", hidden === 0 && "rotate-180")} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Đầu mỗi nhóm cấp độ — thẻ nhỏ tô theo màu band, thay cho dòng pill trơn trước đây. */
function BandHeader({ band, count }: { band: Cefr; count: number }) {
  const c = BAND_COLOR[band];
  return (
    <div
      className="mb-2 flex items-center gap-2.5 rounded-xl border px-3 py-2"
      style={{ borderColor: `${c}40`, backgroundColor: `${c}0d` }}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold text-white" style={{ backgroundColor: c }}>
        {band.replace("Pre-", "P")}
      </span>
      <span className="text-sm font-extrabold" style={{ color: c }}>
        {band}
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{count} points</span>
    </div>
  );
}

function GrammarCard({
  g,
  open,
  onToggle,
  learned,
  onToggleLearned,
  marked,
  onToggleMarked,
  linkTo = (id) => `?id=${id}`,
}: {
  g: GrammarListItem;
  open: boolean;
  onToggle: () => void;
  learned: boolean;
  onToggleLearned: () => void;
  marked: boolean;
  onToggleMarked: () => void;
  linkTo?: (id: string) => string;
}) {
  // Chi tiết đầy đủ chỉ tải khi MỞ (giữ cache khi thu lại rồi mở lại) — pattern như GrammarNotes.
  const { data: full, isLoading, isError } = useQuery({
    queryKey: ["grammar-one", g.id],
    queryFn: () => publicGrammarOne(g.id),
    enabled: open,
    staleTime: Infinity,
    retry: false,
  });

  return (
    <Card className={cn("overflow-hidden", learned && "opacity-70")}>
      <div className="flex items-center gap-2 p-4">
        {/* Nút ĐÃ HỌC — bấm để bật/tắt, KHÔNG mở accordion (tách khỏi nút mở). */}
        <button
          type="button"
          onClick={onToggleLearned}
          aria-pressed={learned}
          title={learned ? "Learned — tap to unmark" : "Mark as learned"}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg transition",
            learned
              ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
              : "text-slate-300 hover:bg-slate-100 hover:text-emerald-400 dark:text-slate-600 dark:hover:bg-slate-800",
          )}
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="-my-4 flex min-w-0 flex-1 items-center gap-3 py-4 text-left transition"
        >
          <Pill text={g.cefr} color={BAND_COLOR[g.cefr]} />
          <div className="min-w-0 flex-1">
            <span className={cn("block truncate font-bold text-slate-800 dark:text-slate-100", learned && "line-through decoration-slate-300")}>
              {g.title}
            </span>
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{g.summary}</p>
          </div>
        </button>
        {/* GHIM để luyện tiếp — ngay trước nhãn nhóm. Phải NGOÀI nút mở accordion (nút lồng
            trong nút là HTML sai), nên nhãn nhóm + mũi tên cũng ra theo. */}
        <button
          type="button"
          onClick={onToggleMarked}
          aria-pressed={marked}
          title={marked ? t("userVideoProfile.grammarView.unmark") : t("userVideoProfile.grammarView.markForPractice")}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg transition",
            marked
              ? "bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20"
              : "text-slate-300 hover:bg-slate-100 hover:text-cyan-400 dark:text-slate-600 dark:hover:bg-slate-800",
          )}
        >
          <Bookmark className={cn("size-4", marked && "fill-current")} />
        </button>
        <span className="hidden shrink-0 text-[11px] font-semibold text-slate-400 sm:inline">{g.category}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "Collapse" : "Expand"}
          className="-my-4 flex shrink-0 items-center py-4 text-slate-400 transition hover:text-cyan-500"
        >
          <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-slate-400">Loading details…</p>
          ) : isError || !full ? (
            <p className="py-4 text-center text-sm text-rose-500">Couldn't load details. Please try again later.</p>
          ) : (
            // linkTo: bấm "Xem thêm"/"Phân biệt" → mở điểm khác ngay trong sổ tay (giữ nguyên lọc/focus).
            <GrammarDetail g={full} linkTo={linkTo} />
          )}
        </div>
      )}
    </Card>
  );
}
