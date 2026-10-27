import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getBlueprint, inferTemplateId, targetWordsOf } from "@msyen/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3,
  AlertTriangle,
  CalendarDays,
  CircleDashed,
  CircleCheck,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  Hash,
  Layers,
  ListChecks,
  Loader2,
  Mic,
  Pencil,
  PenLine,
  PlayCircle,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  School,
  Users,
} from "lucide-react";
import { aiJobsApi, exercisesApi, levelsApi, tagsApi, topicsApi, type TrashedExercise } from "../../lib/api";
import { SkillFilter } from "../../lib/skills";
import { Badge } from "../../components/Badge";
import { LevelBadge } from "../../components/LevelBadge";
import { TopicBadge } from "../../components/TopicBadge";
import { TagBadge } from "../../components/TagBadge";
import { fmtDateTime } from "../../lib/format";
import { topicSelectOptions } from "../../lib/topics";
import { levelSelectOptions } from "../../lib/levels";
import { HeroDecor } from "../../components/HeroDecor";
import { Button, Input, Pagination, Select } from "../../components/ui";
import { cn } from "../../lib/utils";
import { scrollPageTop } from "../../lib/navState";
import { SkillThumb } from "../../components/SkillThumb";
import { Tooltip } from "../../components/Tooltip";
import { CopyButton } from "../../components/CopyButton";
import { IconConfirmButton } from "../../components/IconConfirmButton";
import { FilterPopover, type FilterGroup } from "../../components/FilterPopover";
import ExerciseAssigneesDrawer from "../../components/ExerciseAssigneesDrawer";
import ReadingSubmissionsDrawer from "../../components/ReadingSubmissionsDrawer";
import ExerciseResultsDrawer from "../../components/ExerciseResultsDrawer";
import TagManagerPopover from "../../components/TagManagerPopover";
import TopicsDrawer from "../../components/TopicsDrawer";
import TrashDrawer from "../../components/TrashDrawer";
import { t, type TKey } from "../../i18n";


const STATUS_OPTIONS = [
  {
    value: "",
    label: "common.all" as TKey,
    icon: <ListChecks className="size-4 text-slate-500" />,
  },
  {
    value: "published",
    label: "teacherMain.exercises.status.published" as TKey,
    icon: <CircleCheck className="size-4 text-emerald-500" />,
  },
  {
    value: "draft",
    label: "teacherMain.exercises.status.draft" as TKey,
    icon: <CircleDashed className="size-4 text-amber-500" />,
  },
];

// Trạng thái → dot màu. Mỗi dạng bài có "nội dung" ở chỗ khác nhau: đọc to/nói (đề bài),
// video (đoạn luyện), bộ thẻ (từ), viết (đề bài) — chỉ quiz mới đếm theo số câu.
function statusDot(e: {
  published: boolean;
  question_count: number;
  read_aloud?: boolean | null;
  deck_words?: number | null;
  segment_count?: number | null;
  skill?: string | null;
  speaking_prompt?: string | null;
}) {
  const published = e.published;
  const hasContent =
    !!e.read_aloud ||
    e.question_count > 0 ||
    (e.deck_words ?? 0) > 0 ||
    (e.segment_count ?? 0) > 0 ||
    (e.skill === "writing" && !!e.speaking_prompt?.trim());
  if (!hasContent)
    return { cls: "bg-slate-400", label: "teacherMain.exercises.status.noContent" as TKey };
  if (!published) return { cls: "bg-amber-400", label: "teacherMain.exercises.status.draftUnpublished" as TKey };
  return { cls: "bg-emerald-500", label: "teacherMain.exercises.status.open" as TKey };
}

// "Load" label of an exercise (replaces the old badge), per exercise kind. null = nothing worth showing.
function loadInfo(e: {
  skill?: string | null;
  read_aloud?: boolean | null;
  speaking_prompt?: string | null;
  passage?: string | null;
  wordlist?: unknown[] | null;
  question_count: number;
  deck_words?: number | null;
  segment_count?: number | null;
}): { Icon: typeof Mic; text: string } | null {
  if (e.skill === "writing") return { Icon: PenLine, text: `~${t("teacherMain.exercises.count.words", { n: targetWordsOf(e.speaking_prompt) })}` };
  // Bài video: "câu" = ĐOẠN luyện (nghe-viết/shadowing), không phải questions.
  if (e.segment_count != null) return { Icon: ListChecks, text: t("teacherMain.exercises.count.sentences", { n: e.segment_count }) };
  if (e.read_aloud) {
    const words = (e.passage ?? "").trim().split(/\s+/).filter(Boolean).length;
    return { Icon: Mic, text: t("teacherMain.exercises.count.words", { n: words }) };
  }
  // Bộ thẻ từ vựng: không có câu hỏi, "0 câu" là vô nghĩa → đếm TỪ.
  if (e.deck_words != null) return { Icon: Layers, text: t("teacherMain.exercises.count.words", { n: e.deck_words }) };
  return { Icon: ListChecks, text: t("teacherMain.exercises.count.sentences", { n: e.question_count }) };
}

// Tooltip "đã giao cho ai": tối đa 10 tên, còn lại gộp thành "+N em nữa".
const NAMES_IN_TOOLTIP = 10;

// Số bài mỗi trang (mặc định); đổi được ở thanh phân trang, nhớ qua URL (?per=).
const DEFAULT_PER_PAGE = 20;
function assigneeTooltip(names: string[]): string {
  if (!names.length) return t("teacherMain.exercises.assignee.none");
  const head = names.slice(0, NAMES_IN_TOOLTIP).join(", ");
  const rest = names.length - NAMES_IN_TOOLTIP;
  return rest > 0 ? t("teacherMain.exercises.assignee.more", { names: head, n: rest }) : head;
}

function classTooltip(names: string[]): string {
  if (!names.length) return t("teacherMain.exercises.class.none");
  const head = names.slice(0, NAMES_IN_TOOLTIP).join(", ");
  const rest = names.length - NAMES_IN_TOOLTIP;
  return t("teacherMain.exercises.class.assigned", { names: rest > 0 ? t("teacherMain.exercises.class.more", { names: head, n: rest }) : head });
}

function IconBtn({
  onClick,
  title,
  danger,
  badge,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  badge?: number; // số nhỏ ở góc (vd số học sinh được giao); 0/undefined → không hiện
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={title}>
      <button
        onClick={onClick}
        aria-label={title}
        className={`relative flex size-9 items-center justify-center rounded-lg transition ${
          danger
            ? "text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        }`}
      >
        {children}
        {!!badge && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export default function ExercisesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Hàng chờ AI — poll 4s; khi có job đang chạy thì cũng refetch danh sách bài.
  const { data: jobsData } = useQuery({
    queryKey: ["ai-jobs"],
    queryFn: aiJobsApi.list,
    refetchInterval: 4000,
  });
  const jobs = jobsData?.items ?? [];
  // Filters + PAGE live in the URL (?q&skill&status&level&topic&tag&page&per) → back/forward/
  // reload land on the same view. Server filters & paginates, the client only renders.
  // The URL is read directly every render (no useState snapshot) so a POP navigation (Back/Forward)
  // is picked up immediately — a `useState(() => searchParams.get(...))` initializer only runs once
  // at mount and goes stale on Back, which is the bug this page used to have.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const skillFilter = searchParams.get("skill") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const levelFilter = searchParams.get("level") ?? "";
  const topicFilter = searchParams.get("topic") ?? "";
  const tagFilter = searchParams.get("tag") ?? ""; // teacher's LABEL.
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Number(searchParams.get("per")) || DEFAULT_PER_PAGE;

  // Writes several URL params as ONE navigation. Calling setSearchParams once per changed key
  // (the way `useUrlState` does) is unsafe here: each call computes its diff from the same
  // pre-update snapshot, so the second call silently overwrites the first's change. Bundling every
  // key touched by a single user action (e.g. a filter change + the page reset it causes) into one
  // call avoids that.
  const patchParams = useCallback(
    (patch: Record<string, string | null>, opts?: { push?: boolean; resetPage?: boolean }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (!v) next.delete(k);
          else next.set(k, v);
        }
        if (opts?.resetPage) next.delete("page");
        return next;
      }, { replace: !opts?.push });
    },
    [setSearchParams],
  );

  // Calling the API on every keystroke would be wasteful — keep a local typing state for a smooth
  // input, wait 300ms, THEN search (and only then write to the URL with `replace`, so typing does
  // not add a history step per keystroke).
  const [search, setSearch] = useState(urlQuery);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (searchQuery === urlQuery) return; // avoid a no-op patch (e.g. right after mount)
    patchParams({ q: searchQuery || null }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);
  // POP navigation changes `urlQuery` from outside this box (Back/Forward) — sync the input back
  // so it does not show stale text next to an already-updated list.
  useEffect(() => {
    if (urlQuery === search) return;
    setSearch(urlQuery);
    setSearchQuery(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const setSkillFilter = (v: string) => patchParams({ skill: v || null }, { push: true, resetPage: true });
  const setStatusFilter = (v: string) => patchParams({ status: v || null }, { push: true, resetPage: true });
  const setLevelFilter = (v: string) => patchParams({ level: v || null }, { push: true, resetPage: true });
  const setTopicFilter = (v: string) => patchParams({ topic: v || null }, { push: true, resetPage: true });
  const setTagFilter = (v: string) => patchParams({ tag: v || null }, { push: true, resetPage: true });
  // Flipping a page is a step Back should undo → push, and leave the other filters untouched.
  const setPage = (p: number) => patchParams({ page: p > 1 ? String(p) : null }, { push: true });
  const setPerPage = (p: number) => patchParams({ per: p !== DEFAULT_PER_PAGE ? String(p) : null }, { push: true, resetPage: true });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["exercises", { q: searchQuery, skill: skillFilter, status: statusFilter, level: levelFilter, topic: topicFilter, tag: tagFilter, page, perPage }],
    queryFn: () =>
      exercisesApi.list({
        q: searchQuery, skill: skillFilter, status: statusFilter, level: levelFilter,
        topic_id: topicFilter, tag_id: tagFilter, page, per_page: perPage,
      }),
    refetchInterval: jobs.length ? 4000 : false,
    placeholderData: (prev) => prev, // giữ danh sách cũ khi lật trang → không nháy trắng
  });
  const [manageTopics, setManageTopics] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  // Which exercise's assignment drawer is open, and on which channel it should land.
  const [assignees, setAssignees] = useState<{ slug: string; tab: "students" | "classes" } | null>(null);
  const [readingSlug, setReadingSlug] = useState<string | null>(null);
  const [results, setResults] = useState<{ slug: string; title: string } | null>(null);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // Cấp độ (để hiện badge icon+màu theo tên level của bài)
  const { data: levelsData } = useQuery({
    queryKey: ["levels"],
    queryFn: levelsApi.list,
  });
  const levelByName = useMemo(
    () => new Map((levelsData?.items ?? []).map((l) => [l.name, l])),
    [levelsData],
  );

  // Chủ đề (để lọc + đổ options).
  const { data: topicsData } = useQuery({
    queryKey: ["topics"],
    queryFn: topicsApi.list,
  });
  // Lọc theo chủ đề GỐC (server tự lấy cả bài gắn chủ đề con) — cây ~230 dòng đổ hết vào
  // <Select> không tìm kiếm thì không dùng nổi.
  const topicOptions = useMemo(
    () =>
      topicSelectOptions((topicsData?.items ?? []).filter((t) => !t.parent_id), {
        all: { value: "", label: t("teacherMain.exercises.filter.allTopics") },
      }),
    [topicsData],
  );

  // Nhãn (để lọc + badge + options).
  const [manageTags, setManageTags] = useState(false);
  const filterAnchor = useRef<HTMLDivElement>(null); // neo popover Quản lý nhãn vào nút Bộ lọc
  const { data: tagsData } = useQuery({ queryKey: ["tags"], queryFn: tagsApi.list });
  const tagById = useMemo(() => new Map((tagsData?.items ?? []).map((t) => [t.id, t])), [tagsData]);
  const tagOptions = useMemo(
    () => [
      { value: "", label: t("teacherMain.exercises.filter.allTags") },
      ...(tagsData?.items ?? []).map((tag) => ({
        value: tag.id,
        label: tag.scope === "student" ? `${tag.name} · ${t("teacherMain.students.inClass")}` : tag.name,
      })),
    ],
    [tagsData],
  );

  // Thống kê hero do SERVER tính trên TOÀN thư viện — không đổi theo bộ lọc/trang đang xem.
  const stats = data?.stats ?? { total: 0, published: 0, attempts: 0, avg_pct: 0 };
  // Placeholder for counts until the first response, so they do not flash 0 → real value.
  const n = (v: number | string) => (data ? v : "–");

  // Options lọc theo cấp độ (tag đã tìm được bằng ô tìm kiếm nên bỏ filter tag)
  const levelOptions = useMemo(
    () => levelSelectOptions(levelsData?.items, { by: "name", all: { value: "", label: t("teacherMain.exercises.filter.allLevels") } }),
    [levelsData],
  );

  // Kỹ năng + cấp độ để NGOÀI (lọc thường xuyên nhất, bấm 1 nhịp); 3 mục còn lại gom vào
  // popover, mỗi mục 1 <Select> full-width → menu rộng theo panel (w-72), nhãn dài không bị cắt.
  // Mục nào chưa có dữ liệu thì ẩn hẳn.
  const filterGroups: FilterGroup[] = useMemo(() => {
    const g: FilterGroup[] = [
      {
        label: t("teacherMain.exercises.filter.status"),
        value: statusFilter,
        defaultValue: "",
        onChange: setStatusFilter,
        control: (
          <Select options={STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={statusFilter} onChange={setStatusFilter} placeholder={t("teacherMain.exercises.filter.status")} />
        ),
      },
    ];
    if ((topicsData?.items?.length ?? 0) > 0)
      g.push({
        label: t("teacherMain.exercises.filter.topic"),
        value: topicFilter,
        defaultValue: "",
        onChange: setTopicFilter,
        control: (
          <Select options={topicOptions} value={topicFilter} onChange={setTopicFilter} placeholder={t("teacherMain.exercises.filter.topic")} menuMaxHeight={520} />
        ),
      });
    // Nhãn KHÔNG còn trong popover — đã đưa ra toolbar chính cạnh Cấp độ.
    return g;
  }, [statusFilter, topicFilter, tagFilter, topicOptions, tagOptions, topicsData, tagsData]);

  // Server đã lọc + phân trang → `items` chính là danh sách cần vẽ.
  const filtered = items;

  const hasFilter = !!(search || skillFilter || statusFilter || levelFilter || topicFilter || tagFilter);
  const refresh = () => qc.invalidateQueries({ queryKey: ["exercises"] });
  const refreshJobs = () => qc.invalidateQueries({ queryKey: ["ai-jobs"] });

  async function retryJob(id: string) {
    await aiJobsApi
      .retry(id)
      .then(refreshJobs)
      .catch((e) => toast.error(e.message));
  }
  async function seenJob(id: string) {
    await aiJobsApi
      .seen(id)
      .then(refreshJobs)
      .catch((e) => toast.error(e.message));
  }
  async function removeJob(id: string) {
    await aiJobsApi
      .remove(id)
      .then(refreshJobs)
      .catch((e) => toast.error(e.message));
  }

  async function togglePublish(slug: string, published: boolean) {
    await exercisesApi
      .setPublished(slug, published)
      .catch((e) => toast.error(e.message));
    refresh();
  }
  async function remove(slug: string) {
    // Xác nhận ngay tại nút (IconConfirmButton) → xóa luôn, không popup.
    await exercisesApi
      .remove(slug)
      .then(() => {
        toast.success(t("teacherMain.exercises.toast.trashed"));
        refresh();
      })
      .catch((e) => toast.error(e.message));
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      {/* Hero header */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        {/* decorative dot-grid + hexagon */}
        <HeroDecor
          seed="teacher-exercises"
          className="text-emerald-500/20 dark:text-emerald-400/15"
        />

        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/30 sm:size-16">
            <ClipboardList className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {t("teacherMain.exercises.title")}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span>
                {t("teacherMain.exercises.hero.manage")}{" "}
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {n(stats.total)}
                </span>{" "}
                {t("teacherMain.exercises.hero.exercises")}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {n(stats.published)}
                </span>{" "}
                {t("teacherMain.exercises.hero.published")}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-violet-600 dark:text-violet-400">
                  {n(stats.attempts)}
                </span>{" "}
                {t("teacherMain.exercises.hero.attempts")}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {n(`${stats.avg_pct}%`)}
                </span>{" "}
                {t("teacherMain.exercises.hero.average")}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              variant="outline"
              onClick={() => setManageTopics(true)}
            >
              <Hash className="size-4" /> {t("teacherMain.exercises.topics")}
            </Button>
            <Button
              size="lg"
              onClick={() => navigate("/teacher/exercises/new?mode=ai")}
            >
              <Sparkles className="size-4" /> {t("teacherMain.exercises.createAi")}
            </Button>
          </div>
        </div>
      </header>

      {/* Search + kỹ năng + cấp độ để ngoài; trạng thái/chủ đề/nhãn gom trong popover */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <Input
            leftIcon={<Search className="size-4" />}
            placeholder={t("teacherMain.exercises.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
        </div>
        <SkillFilter
          fullWidth={false}
          className="min-w-44"
          value={skillFilter}
          onChange={setSkillFilter}
          allTone="cyan"
        />
        {(levelsData?.items?.length ?? 0) > 0 && (
          <Select
            fullWidth={false}
            className="min-w-44"
            options={levelOptions}
            value={levelFilter}
            onChange={setLevelFilter}
            placeholder={t("teacherMain.exercises.level")}
            // Nút chỉ rộng 11rem → menu w-full sẽ cắt "Pre A1 Starters"; 9 mục ≈ 414px cũng
            // vượt trần 384 mặc định. Nới cả hai chiều để không truncate/scroll.
            menuClassName="w-64"
            menuMaxHeight={520}
          />
        )}
        {(tagsData?.items?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5">
            <Select
              fullWidth={false}
              className="min-w-44"
              options={tagOptions}
              value={tagFilter}
              onChange={setTagFilter}
              placeholder={t("teacherMain.exercises.tags")}
              menuClassName="w-64"
              menuMaxHeight={520}
            />
            <button
              type="button"
              onClick={() => setManageTags(true)}
              className="whitespace-nowrap text-xs font-semibold text-cyan-600 transition hover:underline dark:text-cyan-400"
            >
              {t("teacherMain.exercises.manage")}
            </button>
          </div>
        )}
        <div ref={filterAnchor}>
          <FilterPopover panelClassName="w-72" groups={filterGroups} />
        </div>
        <Button variant="neutral" onClick={() => setTrashOpen(true)}>
          <Trash2 className="size-4" /> {t("teacherMain.exercises.trash")}
        </Button>
      </div>

      {/* Hàng chờ AI — card đang tạo / lỗi */}
      {jobs.length > 0 && (
        <div className="mb-3 space-y-2">
          {jobs.map((j) => {
            const err = j.status === "error";
            // Finished but lost questions — a notice, not a failure.
            const warn = !err && j.status === "done" && j.dropped > 0;
            return (
              <div
                key={j.id}
                className={`flex items-center gap-3 rounded-xl border p-4 ${
                  err
                    ? "border-rose-300 bg-rose-50/60 dark:border-rose-800 dark:bg-rose-500/10"
                    : warn
                      ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-500/10"
                      : "border-cyan-300 bg-cyan-50/50 dark:border-cyan-800 dark:bg-cyan-500/10"
                }`}
              >
                <div
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${err ? "bg-rose-500/15 text-rose-600" : warn ? "bg-amber-500/15 text-amber-600" : "bg-cyan-500/15 text-cyan-600"}`}
                >
                  {err ? (
                    <Sparkles className="size-5" />
                  ) : warn ? (
                    <AlertTriangle className="size-5" />
                  ) : (
                    <Loader2 className="size-5 animate-spin" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                    {j.title || t("teacherMain.exercises.job.creating")}
                  </p>
                  <p
                    className={`truncate text-xs ${err ? "text-rose-600 dark:text-rose-400" : warn ? "text-amber-700 dark:text-amber-400" : "text-slate-500"}`}
                  >
                    {err
                      ? t("teacherMain.exercises.job.error", { error: j.error || t("teacherMain.exercises.job.unknown") })
                      : warn
                        ? t("teacherMain.exercises.job.warning", { n: j.dropped })
                        : j.status === "queued"
                          ? t("teacherMain.exercises.job.queued")
                          : t("teacherMain.exercises.job.creating")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {err && (
                    <IconBtn title={t("teacherMain.exercises.job.retry")} onClick={() => retryJob(j.id)}>
                      <RotateCcw className="size-4" />
                    </IconBtn>
                  )}
                  {warn && (
                    <IconBtn title={t("teacherMain.exercises.job.seen")} onClick={() => seenJob(j.id)}>
                      <Check className="size-4" />
                    </IconBtn>
                  )}
                  <IconBtn
                    title={t("teacherMain.exercises.job.remove")}
                    danger
                    onClick={() => removeJob(j.id)}
                  >
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <p className="py-16 text-center text-slate-500">{t("common.loading")}</p>
      ) : filtered.length === 0 && jobs.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-14 text-center dark:border-slate-700">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <ClipboardList className="size-7" />
          </div>
          <p className="font-semibold text-slate-600 dark:text-slate-300">
            {hasFilter ? t("teacherMain.exercises.empty.noMatch") : t("teacherMain.exercises.empty.none")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {hasFilter
              ? t("teacherMain.exercises.empty.changeFilters")
              : t("teacherMain.exercises.empty.start")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const dot = statusDot(e);
            const load = loadInfo(e);
            // Badge NHẬN DẠNG DẠNG BÀI (template) — bù cho SkillThumb chỉ cho biết kỹ năng.
            // Old exercise without a template → infer it from skill + read_aloud/video flags.
            const tmpl = getBlueprint(
              e.template_id ?? inferTemplateId({ skill: e.skill, read_aloud: e.read_aloud, video: e.video }),
            );
            return (
              <div
                key={e.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-400/60 dark:border-slate-800 dark:bg-slate-900"
              >
                <SkillThumb
                  skill={e.skill}
                  readAloud={e.read_aloud ?? false}
                  showLabel
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Tooltip label={t(dot.label)}>
                      <span
                        className={`size-2.5 shrink-0 rounded-full ${dot.cls}`}
                      />
                    </Tooltip>
                    <h3 className="truncate font-bold text-slate-900 dark:text-white">
                      {e.title}
                    </h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {/* Type badge (template) — identifies the exercise format (Dictation,
                        Reading comprehension…), complementing SkillThumb which only shows the skill.
                        English label to stay consistent with the six skill labels. */}
                    {tmpl && <Badge tone="cyan">{tmpl.label}</Badge>}
                    {/* Định danh (cấp độ · chủ đề · nhãn của cô): icon + chữ theo màu, bỏ nền/viền
                        — 3 pill đặc cạnh nhau làm hàng meta nặng mắt, màu là đủ để phân biệt. */}
                    {e.level &&
                      (levelByName.get(e.level) ? (
                        <LevelBadge level={levelByName.get(e.level)!} plain />
                      ) : (
                        <Badge tone="slate">{e.level}</Badge>
                      ))}
                    {e.topic && <TopicBadge topic={e.topic} plain />}
                    {tagById.get(e.tag_id ?? "") && <TagBadge tag={tagById.get(e.tag_id!)!} plain />}
                    {/* Số liệu phụ (khối lượng · ngày tạo) → text + icon mờ, không badge.
                        null (vd bài nói tự do) → không có đơn vị đo lượng nào có ý nghĩa, bỏ hẳn. */}
                    {load && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <load.Icon className="size-3.5" /> {load.text}
                      </span>
                    )}
                    {e.created_at && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                        <CalendarDays className="size-3.5" /> {fmtDateTime(e.created_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <CopyButton
                    value={`${window.location.origin}/u/practice/${e.exercise_id}`}
                    ghost
                    title={t("teacherMain.exercises.copyPractice")}
                  />
                  {e.read_aloud ? (
                    <IconBtn
                      title={t("teacherMain.exercises.gradeReading")}
                      onClick={() => setReadingSlug(e.exercise_id)}
                    >
                      <Mic className="size-4" />
                    </IconBtn>
                  ) : (
                    <IconBtn
                      title={
                        e.attempts
                          ? t("teacherMain.exercises.results.tooltip", { n: e.attempts, avg: e.avg_pct ?? 0 })
                          : t("teacherMain.exercises.results.tooltipEmpty")
                      }
                      badge={e.attempts}
                      onClick={() => setResults({ slug: e.exercise_id, title: e.title })}
                    >
                      <BarChart3 className="size-4" />
                    </IconBtn>
                  )}
                  <IconBtn
                    title={t("teacherMain.exercises.preview")}
                    onClick={() => navigate(`/teacher/exercises/${e.exercise_id}/preview`)}
                  >
                    <PlayCircle className="size-4" />
                  </IconBtn>
                  {/* Two SEPARATE assignment channels: whole class, and one
                      learner at a time. Merged into a single count, neither is readable. */}
                  <IconBtn
                    title={classTooltip(e.class_names ?? [])}
                    badge={e.class_count}
                    onClick={() => setAssignees({ slug: e.exercise_id, tab: "classes" })}
                  >
                    <School className="size-4" />
                  </IconBtn>
                  <IconBtn
                    title={assigneeTooltip(e.assignee_names ?? [])}
                    badge={e.assignee_count}
                    onClick={() => setAssignees({ slug: e.exercise_id, tab: "students" })}
                  >
                    <Users className="size-4" />
                  </IconBtn>
                  {/* Icon tả TRẠNG THÁI HIỆN TẠI (mắt mở = đang hiện), tooltip nói HÀNH ĐỘNG khi
                      bấm. Trước đây icon tả hành động nên nhìn vào tưởng bài đang bị ẩn. */}
                  <IconBtn
                    title={e.published ? t("teacherMain.exercises.hide") : t("teacherMain.exercises.show")}
                    onClick={() => togglePublish(e.exercise_id, !e.published)}
                  >
                    {e.published ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </IconBtn>
                  <IconBtn
                    title={t("teacherMain.exercises.edit")}
                    onClick={() =>
                      // Dùng id (UUID) cho URL sửa — ổn định, không phụ thuộc slug (link không hỏng dù đổi slug/trùng tiêu đề).
                      // Mọi loại bài (kể cả Nghe & Nói theo câu) nay sửa trong 1 editor thống nhất.
                      navigate(`/teacher/exercises/${e.id}/edit`)
                    }
                  >
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconConfirmButton
                    icon={Trash2}
                    title={t("teacherMain.exercises.delete")}
                    onConfirm={() => remove(e.exercise_id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phân trang — server đã cắt trang, đây chỉ đổi ?page/?per trên URL. */}
      {total > 0 && (
        <Pagination
          className={cn("mt-5", isFetching && "opacity-60")}
          page={page}
          perPage={perPage}
          total={total}
          onPage={(p) => {
            setPage(p);
            scrollPageTop();
          }}
          onPerPage={setPerPage}
          unit={t("teacherMain.exercises.unit", { n: total })}
        />
      )}

      <ExerciseAssigneesDrawer
        slug={assignees?.slug ?? null}
        initialTab={assignees?.tab ?? "students"}
        open={!!assignees}
        onClose={() => setAssignees(null)}
      />
      <ExerciseResultsDrawer
        slug={results?.slug ?? null}
        title={results?.title}
        open={!!results}
        onClose={() => setResults(null)}
      />
      <ReadingSubmissionsDrawer
        slug={readingSlug}
        open={!!readingSlug}
        onClose={() => setReadingSlug(null)}
      />
      <TopicsDrawer open={manageTopics} onClose={() => setManageTopics(false)} />
      <TagManagerPopover anchorRef={filterAnchor} open={manageTags} onClose={() => setManageTags(false)} />
      <TrashDrawer<TrashedExercise>
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        title={t("teacherMain.exercises.trashTitle")}
        description={t("teacherMain.exercises.trashDescription")}
        icon={<Trash2 className="size-5" />}
        queryKey="exercises-trash"
        fetchItems={exercisesApi.trash}
        itemKey={(e) => e.exercise_id}
        deletedAt={(e) => e.deleted_at}
        restore={(e) => exercisesApi.restore(e.exercise_id)}
        purge={(e) => exercisesApi.purge(e.exercise_id)}
        invalidateKeys={["exercises"]}
        emptyText={t("teacherMain.exercises.trashEmpty")}
        renderItem={(e) => {
          const tmpl = getBlueprint(
            e.template_id ?? inferTemplateId({ skill: e.skill, read_aloud: e.read_aloud, video: e.video }),
          );
          const count = e.deck_words != null ? t("teacherMain.exercises.count.words", { n: e.deck_words }) : t("teacherMain.exercises.count.sentences", { n: e.question_count });
          return (
            <div className="flex items-center gap-2.5">
              <SkillThumb skill={e.skill} readAloud={e.read_aloud} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{e.title}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  {tmpl && <Badge tone="cyan">{tmpl.label}</Badge>}
                  {e.level && <span>{e.level}</span>}
                  <span>{count}</span>
                </div>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
