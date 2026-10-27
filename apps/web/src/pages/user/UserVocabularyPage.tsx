// VOCABULARY page — tabs (Library / My words) in the hero, with the reading-voice picker.
//   · Library  : the teachers' sets (grid → detail → practice).
//   · My words : the learner's own list (typed in or saved from a set).
// Quick practice opens the same setup modal as a set, with one activity pinned.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BookMarked, Headphones, Keyboard, Library, Mic, RefreshCw, Sparkles, Type } from "lucide-react";
import type { VocabActivity } from "@msyen/shared";
import { accountApi } from "../../lib/api";
import { HeroDecor } from "../../components/HeroDecor";
import { VoiceGenderPicker } from "../../components/ui";
import { useUrlState } from "../../lib/navState";
import { cn } from "../../lib/utils";
import { PracticeSetupModal, type PracticeSource } from "../../components/practice/PracticeSetupModal";
import { VocabDeckExercise } from "../../components/practice/VocabDeckExercise";
import { useVocabSession } from "../../components/practice/vocab/useVocabSession";
import VocabLibraryView from "./learn/VocabLibraryView";
import MyVocabView from "./learn/MyVocabView";
import { t } from "../../i18n";

/**
 * 4 lối vào "luyện nhanh". Cùng MỘT modal cấu hình như Practice set — chỉ khác ở chỗ
 * `focus` ghim sẵn dạng bài, nên mỗi ô là một kỹ năng tập trung thay vì một trang riêng.
 */
const QUICK: {
  key: string; label: string; desc: string; icon: typeof Mic; tint: string; focus?: VocabActivity[];
  /** Full width on mobile with the longer wording below — for the one card that leads the page. */
  wide?: boolean; labelWide?: string; descWide?: string;
}[] = [
  // "Review" opens the due queue directly (scope "due"): whatever the brain is about to forget,
  // no set to pick first.
  {
    key: "review", label: "Review", desc: "Due today", icon: RefreshCw,
    tint: "text-amber-600 bg-amber-500/10 ring-amber-500/20 dark:text-amber-400",
    wide: true,
    labelWide: "Review due words",
    descWide: "Words you are about to forget, picked by your memory schedule — practise these first.",
  },
  { key: "mixed", label: "Card deck", desc: "Mixed drills", icon: Sparkles, tint: "text-cyan-600 bg-cyan-500/10 ring-cyan-500/20 dark:text-cyan-400" },
  { key: "pronounce", label: "Pronounce", desc: "Read & score", icon: Mic, tint: "text-rose-600 bg-rose-500/10 ring-rose-500/20 dark:text-rose-400", focus: ["pronounce"] },
  { key: "listen", label: "Listen", desc: "Hear & answer", icon: Headphones, tint: "text-teal-600 bg-teal-500/10 ring-teal-500/20 dark:text-teal-400", focus: ["listen_choice", "dictation"] },
  { key: "type", label: "Type", desc: "See meaning, type", icon: Keyboard, tint: "text-violet-600 bg-violet-500/10 ring-violet-500/20 dark:text-violet-400", focus: ["recall", "spelling"] },
];

const nf = (n: number) => n.toLocaleString("en-US");

export default function UserVocabularyPage() {
  const [params, setParams] = useSearchParams();
  // Pushed, not replaced: switching tab is a step the learner expects Back to undo.
  const [tabRaw, setTabRaw] = useUrlState("tab", "library", { push: true });
  const tab = tabRaw === "my" ? "my" : "library";
  const setTab = (t: "library" | "my") => setTabRaw(t);

  // Deep-link ?practice=review (from the progress dashboard) opens the review queue directly.
  const [quick, setQuick] = useState<(typeof QUICK)[number] | null>(
    params.get("practice") === "review" ? QUICK[0] : null,
  );
  const { session, start, deckHandlers } = useVocabSession(null);

  // Word sources for quick practice: My words · each Library set.
  const { data: sets } = useQuery({ queryKey: ["vocab-sets"], queryFn: () => accountApi.vocabSets() });
  // Hàng đợi ôn — số từ đến hạn hiện ngay trên thẻ Review (lời kêu gọi hành động duy nhất cần thiết).
  const { data: due } = useQuery({ queryKey: ["vocab-due"], queryFn: accountApi.vocabDue });
  const isReview = quick?.key === "review";
  const closeQuick = () => {
    setQuick(null);
    if (params.get("practice")) setParams(tab === "my" ? { tab: "my" } : {}, { replace: true });
  };
  const sources: PracticeSource[] = [
    { value: "my", label: "My words", scope: "my" },
    ...(sets?.items ?? []).map((s) => ({
      value: `set:${s.slug}`,
      label: s.name,
      scope: "set" as const,
      scopeKey: s.slug,
      count: s.wordCount,
      hint: s.level?.name ?? null,
    })),
  ];

  if (session) {
    return (
      <VocabDeckExercise
        items={session.items}
        config={session.config}
        title="Quick practice"
        learnerName="Quick practice"
        initialState={session.initialState}
        {...deckHandlers()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      {/* Hero — chứa tiêu đề + cụm điều khiển bên phải (chọn giọng + tabs) */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-vocab" />
        {/* Trên mobile: hàng tiêu đề riêng, cụm điều khiển (giọng + tabs) xuống hàng dưới */}
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 sm:size-14 dark:text-cyan-400">
              <Type className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Vocabulary</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {sets?.items.length
                  ? <><b className="font-semibold text-slate-700 dark:text-slate-300">{nf(sets.items.length)}</b> sets from your teacher, plus your own words.</>
                  : "Learn your teacher's word sets, then build your own list."}
              </p>
            </div>
          </div>
          {/* Cụm điều khiển: chọn giọng (popover) + tabs Library/My vocab */}
          <div className="flex items-center gap-2 sm:ml-auto">
            <VoiceGenderPicker triggerClassName="h-[38px] w-[38px]" />
            <div className="inline-flex flex-1 rounded-xl border border-slate-200 bg-white/70 p-0.5 sm:flex-none dark:border-slate-700 dark:bg-slate-800/60">
              <TabButton on={tab === "library"} onClick={() => setTab("library")} icon={<Library className="size-4" />}>Library</TabButton>
              <TabButton on={tab === "my"} onClick={() => setTab("my")} icon={<BookMarked className="size-4" />}>My words</TabButton>
            </div>
          </div>
        </div>
      </header>

      {/* Quick practice — các dạng luyện độc lập (đặt TRÊN toolbar) */}
      <div className="mb-5">
        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
          <Sparkles className="size-3.5" /> Quick practice
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK.map((q) => (
            <QuickLink key={q.key} label={q.label} desc={q.desc} icon={q.icon} tint={q.tint}
              wide={q.wide} labelWide={q.labelWide} descWide={q.descWide}
              badge={q.key === "review" ? due?.due || undefined : undefined}
              onClick={() => setQuick(q)} />
          ))}
        </div>
      </div>

      {/* Cùng modal với "Practice set" — nguồn từ chọn ngay trong modal, dạng bài đã ghim. */}
      <PracticeSetupModal
        open={!!quick}
        onClose={closeQuick}
        label={isReview ? t("userPages.vocab.dueWordsAll") : t("userPages.vocab.chooseSourceAndCount")}
        scope={isReview ? "due" : undefined}
        sources={isReview ? undefined : sources}
        focus={quick?.focus}
        focusLabel={quick ? t("userPages.vocab.quickPracticeLabel", { label: quick.label }) : undefined}
        allowPronounce
        onStart={(items, config, src) => { start(items, config, src); closeQuick(); }}
      />

      {tab === "library" ? <VocabLibraryView /> : <MyVocabView />}
    </div>
  );
}

function TabButton({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition sm:flex-none",
        on ? "bg-cyan-600 text-white shadow-sm dark:bg-cyan-500" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function QuickLink({ label, desc, icon: Icon, tint, badge, onClick, wide, labelWide, descWide }: {
  label: string; desc: string; icon: typeof Mic; tint: string; badge?: number; onClick: () => void;
  wide?: boolean; labelWide?: string; descWide?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-cyan-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-700",
        // Full-width on phones only; from `sm` up it goes back to one cell like the others.
        wide && "col-span-2 sm:col-span-1",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl ring-1", wide && "sm:size-9 size-11", tint)}>
        <Icon className={cn("size-4", wide && "sm:size-4 size-5")} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">
          {wide && labelWide ? <><span className="sm:hidden">{labelWide}</span><span className="hidden sm:inline">{label}</span></> : label}
        </span>
        {wide && descWide ? (
          <>
            <span className="block text-[11px] leading-snug text-slate-500 sm:hidden">{descWide}</span>
            <span className="hidden truncate text-[11px] text-slate-500 sm:block">{desc}</span>
          </>
        ) : (
          <span className="block truncate text-[11px] text-slate-500">{desc}</span>
        )}
      </span>
      {badge != null && badge > 0 && (
        <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{badge}</span>
      )}
    </button>
  );
}
