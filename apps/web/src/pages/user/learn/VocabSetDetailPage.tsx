// One teacher set (Library): hero + word list + "Practice set" + save words to My words.
// Route: /u/vocabulary/set/:slug.
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BookmarkCheck, BookmarkPlus, BookOpen, GraduationCap, Info, Layers, Play, Search } from "lucide-react";
import { type VocabDeckConfig, type VocabItem } from "@msyen/shared";
import { accountApi } from "../../../lib/api";
import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { useGoBack } from "../../../lib/navState";
import { useDebounced } from "../../../lib/useDebounced";
import { Button, Input, VoiceGenderPicker } from "../../../components/ui";
import { HeroDecor } from "../../../components/HeroDecor";
import { Tooltip } from "../../../components/Tooltip";
import { WordCard } from "../../../components/vocab/WordCard";
import { Masonry } from "../../../components/Masonry";
import { VocabDeckExercise } from "../../../components/practice/VocabDeckExercise";
import { useVocabSession } from "../../../components/practice/vocab/useVocabSession";
import { PracticeSetupModal, ResumeBanner } from "../../../components/practice/PracticeSetupModal";
import { t } from "../../../i18n";

export default function VocabSetDetailPage() {
  const { slug = "" } = useParams();
  const qc = useQueryClient();
  const goBack = useGoBack("/u/vocabulary");
  const [q, setQ] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const key = ["vocab-set", slug];
  const dq = useDebounced(q.trim(), 250);
  // Words come 100 per page (search runs on the server); counts in the hero cover the whole set.
  const { data: pages, isLoading, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...key, dq],
    queryFn: ({ pageParam }) => accountApi.vocabSetDetail(slug, { offset: pageParam, q: dq || undefined }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    placeholderData: keepPreviousData,
  });
  const data = pages?.pages[0];
  useDocumentTitle(data?.set.name ?? "Vocabulary set");

  const shown = useMemo(() => pages?.pages.flatMap((p) => p.words) ?? [], [pages]);
  const wordCount = data?.set.wordCount ?? 0;
  const learnedCount = data?.learned ?? 0;
  const unsavedCount = data?.unsaved ?? 0;

  const { session, start, resume, resumeSession, discardResume, deckHandlers } = useVocabSession({ scope: "set", scopeKey: slug });
  const startSession = async (items: VocabItem[], config: VocabDeckConfig) => {
    await start(items, config, { scope: "set", scopeKey: slug, label: data?.set.name ?? "Practice" });
    setSetupOpen(false);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["my-vocab"] });
  };
  const save = useMutation({
    mutationFn: (ids: string[] | "all") => (ids === "all" ? accountApi.vocabSetSaveAll(slug) : accountApi.myVocabAdd({ fromItemIds: ids })),
    onSuccess: (r) => {
      toast.success(r.added ? t("userVideoProfile.vocabSet.wordsSaved", { n: r.added }) : t("userVideoProfile.vocabSet.wordsAlreadyInMyWords"));
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.saveFailed")),
  });
  const setLearned = useMutation({
    mutationFn: ({ word, learned }: { word: string; learned: boolean }) => accountApi.vocabSetLearned(word, learned),
    onSuccess: refresh,
  });

  if (session) {
    return (
      <VocabDeckExercise
        items={session.items}
        config={session.config}
        title={data?.set.name ?? "Practice"}
        learnerName={data?.set.name ?? "Practice"}
        initialState={session.initialState}
        {...deckHandlers(refresh)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed={slug} />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 ring-1 ring-cyan-500/20 sm:size-14 dark:text-cyan-400">
              <Layers className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl dark:text-white">{data?.set.name ?? "…"}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5"><BookOpen className="size-4 text-slate-400" /> {wordCount} words</span>
                <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-4 text-slate-400" /> {learnedCount} learned</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Tooltip label="Back to Library">
              <button
                type="button"
                onClick={goBack}
                aria-label="Back to Library"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700"
              >
                <ArrowLeft className="size-4" />
              </button>
            </Tooltip>
            <VoiceGenderPicker />
            <Tooltip label={unsavedCount ? t("userVideoProfile.vocabSet.saveAll") : t("userVideoProfile.vocabSet.allSaved")}>
              <button
                type="button"
                aria-label="Save all to My words"
                disabled={!unsavedCount || save.isPending}
                onClick={() => save.mutate("all")}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-cyan-300 hover:text-cyan-600 disabled:cursor-default dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700"
              >
                {unsavedCount ? <BookmarkPlus className="size-4" /> : <BookmarkCheck className="size-4 text-cyan-600 dark:text-cyan-400" />}
              </button>
            </Tooltip>
            <Button size="lg" className="flex-1 justify-center sm:flex-none" disabled={!wordCount} onClick={() => setSetupOpen(true)}>
              <Play className="size-4" /> Practice set
            </Button>
          </div>
        </div>
      </header>

      {resume && <ResumeBanner remaining={resume.remaining} onResume={resumeSession} onDiscard={discardResume} />}

      <PracticeSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        scope="set"
        scopeKey={slug}
        label={data?.set.name ?? "Practice"}
        allowPronounce
        onStart={startSession}
      />

      {data?.set.description && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-800 dark:border-cyan-800/50 dark:bg-cyan-500/10 dark:text-cyan-200">
          <Info className="mt-0.5 size-4 shrink-0 text-cyan-500" />
          <span>{data.set.description}</span>
        </div>
      )}

      <div className="mb-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search words…" leftIcon={<Search className="size-4" />} />
      </div>

      {isLoading || (isFetching && !shown.length) ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : !shown.length ? (
        <p className="py-12 text-center text-sm text-slate-400">No matching words.</p>
      ) : (
        <Masonry
          items={shown}
          render={(w) => (
            <WordCard
              key={w.id}
              w={w}
              onToggleLearned={() => setLearned.mutate({ word: w.word, learned: !w.learned })}
              actions={
                <Tooltip label={w.saved ? "In My words" : "Save to My words"}>
                  <button
                    type="button"
                    disabled={w.saved || save.isPending}
                    onClick={() => save.mutate([w.id])}
                    aria-label="Save to My words"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-cyan-50 hover:text-cyan-600 disabled:cursor-default dark:hover:bg-cyan-500/10"
                  >
                    {w.saved ? <BookmarkCheck className="size-4 text-cyan-600 dark:text-cyan-400" /> : <BookmarkPlus className="size-4" />}
                  </button>
                </Tooltip>
              }
            />
          )}
        />
      )}
      {hasNextPage && (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? t("common.loading") : t("userVideoProfile.vocabSet.loadMore", { n: shown.length, total: data?.total ?? 0 })}
          </Button>
        </div>
      )}
    </div>
  );
}
