// Thư viện bài của user công khai — GIAO DIỆN học theo trang bài tập học sinh.
// Cấu trúc: hero → cụm 6 kỹ năng (bộ lọc trực quan) →
// thanh công cụ (tìm/lọc + đổi lưới·danh sách) → bài (grid card ảnh hoặc list).
// Bài mở dần theo ngày: card đã mở bấm được,
// card khóa mờ + 🔒. Xem lưới/danh sách lưu theo TÀI KHOẢN (đồng bộ đa thiết bị), đệm localStorage.
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useHistoryState, useUrlState } from "../../lib/navState";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  GraduationCap,
  Loader2,
  ChevronDown,
  Check,
  LayoutGrid,
  List as ListIcon,
  ListFilter,
  Lock,
  MessageSquareText,
  Mic,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
  Repeat,
  Search,
} from "lucide-react";
import { DAILY_UNLOCK_MAX, SKILL_LIST, UNLOCK_PASS_PCT, formatPoints, CEFR_BANDS, CEFR_GROUP, type Cefr, type LibraryItem, type LibraryMeta, type PracticeMode, type PublicUser } from "@msyen/shared";
import { accountApi, libraryApi, publicLevels } from "../../lib/api";
import { pct, fmtDate } from "../../lib/format";
import { BAND_COLOR, cefrFromLabel } from "../../lib/cefr";
import { Badge } from "../../components/Badge";
import { HeroDecor } from "../../components/HeroDecor";
import { Avatar } from "../../components/Avatar";
import { PatternThumb, THUMB_CHIP, THUMB_TINT, thumbKind } from "../../components/PatternThumb";
import { SkillThumb } from "../../components/SkillThumb";
import { ScoreRing } from "../../components/ScoreRing";
import { TopicIcon } from "../../lib/topicIcons";
import { Button, Card, Input, Popover, PopoverItem } from "../../components/ui";
import { LevelDot } from "../../lib/levels";
import PracticeModeModal from "../../components/practice/PracticeModeModal";
import TranslateLevelModal from "../../components/practice/TranslateLevelModal";
import { Select } from "../../components/ui/select";
import { skillUi, skillFilterOptions } from "../../lib/skills";
import { cn } from "../../lib/utils";
import { answeredCount, getDraft } from "../../lib/draftStore";
import { AssignedQueue } from "../../components/user/AssignedQueue";
import { usePublicUser } from "./UserLayout";
import { LEARNING_QUERY_OPTS } from "../../lib/learningRefresh";
import { CardGridSkeleton } from "../../components/ui/skeleton";
import { t, type TKey } from "../../i18n";

type Filter = "done" | "doing" | "todo";
type ViewMode = "grid" | "list";

// Kiểu xem (lưới/danh sách) — mặc định "grid".
// Nguồn sự thật là TÀI KHOẢN (users.library_view) để đồng bộ giữa các thiết bị;
// localStorage chỉ là bộ đệm cho lần vẽ đầu (tránh nhấp nháy trước khi hồ sơ về).
const VIEW_KEY = "u-library-view";
function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

// Render dần cho danh sách dài (một cấp độ có thể 200+ bài): mỗi lần thêm bấy nhiêu thẻ.
const LOAD_STEP = 24;
// Dictation & Shadowing is the secondary block — keep it short so it does not crowd out the path.
const VIDEO_STEP = 6;
// Secondary shelves open on exactly ONE row of cards (3 at lg) and grow from the "show more" block.
// A folded-away section that unfolds into 24 cards is not a section, it is a second page.
const ROW = 3;
// How many half-finished lessons may hold the front of the Dictation & Shadowing shelf. Enough to
// pick work back up, few enough that new lessons still appear above the fold.
const IN_PROGRESS_SLOTS = 3;
// Score at which a learning-path exercise folds away into "Mastered". Deliberately ABOVE
// UNLOCK_PASS_PCT (50): that one only means the drip may open the next lesson, and hiding
// everything scraped through at 51% would bury exactly the lessons worth redoing.
const MASTERED_PCT = 80;

// Short blurb for each skill in the filter hub.
const SKILL_DESC: Record<string, TKey> = {
  grammar: "userPages.library.skillDescGrammar",
  reading: "userPages.library.skillDescReading",
  listening: "userPages.library.skillDescListening",
  vocabulary: "userPages.library.skillDescVocabulary",
  writing: "userPages.library.skillDescWriting",
  mixed: "userPages.library.skillDescMixed",
};

// Dictation & Shadowing lives under Listening, but learners look for it BY NAME — give it two
// cards of its own in the hub. These keys are virtual filters, not skills: they match video
// lessons by practice mode instead of `item.skill`.
const PRACTICE_MODE_CARDS: { key: PracticeMode; labelKey: TKey; descKey: TKey; Icon: typeof AudioLines }[] = [
  { key: "dictation", labelKey: "userPages.library.dictation", descKey: "userPages.library.practiceModeDescDictation", Icon: AudioLines },
  { key: "shadowing", labelKey: "userPages.library.shadowing", descKey: "userPages.library.practiceModeDescShadowing", Icon: Repeat },
];
const PRACTICE_MODE_KEYS: string[] = PRACTICE_MODE_CARDS.map((c) => c.key);
const isPracticeMode = (k: string): k is PracticeMode => PRACTICE_MODE_KEYS.includes(k);
// Fuchsia sets the whole Dictation & Shadowing family apart from the 7 skills (chip on the
// thumbnail, section title, hub cards) — see components/PatternThumb.tsx.
const PRACTICE_MODE_BOX = "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400";

// Every card of the skill hub: the 7 skills + the 2 practice modes, all shown at once (3 rows of 3).
const HUB_CARDS = [
  ...SKILL_LIST.map((m) => {
    const ui = skillUi(m.key)!;
    return { key: m.key as string, label: m.label, descKey: SKILL_DESC[m.key], Icon: ui.Icon, box: ui.box };
  }),
  ...PRACTICE_MODE_CARDS.map((c) => ({ key: c.key as string, label: "", labelKey: c.labelKey, descKey: c.descKey, Icon: c.Icon, box: PRACTICE_MODE_BOX })),
];

export default function UserLibraryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = usePublicUser();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["library"],
    queryFn: libraryApi.list,
    ...LEARNING_QUERY_OPTS,
  });
  // Cấp XP cho badge avatar — dùng chung cache "user-stats" với shell (UserLayout), không gọi thêm.
  const { data: stats } = useQuery({
    queryKey: ["user-stats"],
    queryFn: libraryApi.stats,
    ...LEARNING_QUERY_OPTS,
  });
  // Filters live in the URL: the view survives a reload, is shareable, and Back undoes a tab
  // change instead of leaving the library. Typing is `replace` so it does not flood history.
  const [search, setSearch] = useUrlState("q");
  const [skill, setSkill] = useUrlState("skill", "", { push: true });
  const [filterParam, setFilterParam] = useUrlState("status", "", { push: true });
  const filter = (filterParam || null) as Filter | null;
  const setFilter = (v: Filter | null) => setFilterParam(v ?? "");
  const [view, setView] = useState<ViewMode>(readView);
  const [lockedItem, setLockedItem] = useState<LibraryItem | null>(null); // bài khóa đang xem lý do
  const [modeItem, setModeItem] = useState<LibraryItem | null>(null); // bài Nghe & Nói đang chọn cách luyện
  // Translation exercise waiting on its hint rung — see TranslateLevelModal.
  const [translateItem, setTranslateItem] = useState<LibraryItem | null>(null);
  // Số thẻ đang vẽ của 2 danh sách (đã mở / khóa) — dữ liệu vẫn tải hết, chỉ render dần.
  // How much of each list is drawn — kept per history entry, so coming back from an exercise
  // rebuilds the same number of rows and the scroll position has somewhere to land.
  const [shownOpen, setShownOpen] = useHistoryState("shownOpen", LOAD_STEP);
  const [shownLocked, setShownLocked] = useHistoryState("shownLocked", LOAD_STEP);
  const [shownMastered, setShownMastered] = useHistoryState("shownMastered", ROW * 2);
  const [shownVideos, setShownVideos] = useHistoryState("shownVideos", ROW);

  // Hồ sơ về → lấy kiểu xem đã lưu trên tài khoản (thiết bị khác đổi thì máy này theo).
  useEffect(() => {
    const saved = user?.library_view;
    if (saved !== "grid" && saved !== "list") return;
    setView(saved);
    try {
      localStorage.setItem(VIEW_KEY, saved);
    } catch {
      /* bỏ qua nếu chặn storage */
    }
  }, [user?.library_view]);

  const setViewMode = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* bỏ qua nếu chặn storage */
    }
    // Lưu lên tài khoản (cập nhật lạc quan cache "me"; lỗi mạng thì nuốt im lặng).
    const me = qc.getQueryData<{ user: PublicUser }>(["account", "me"]);
    if (me?.user) {
      qc.setQueryData<{ user: PublicUser }>(["account", "me"], { user: { ...me.user, library_view: v } });
      accountApi.updateProfile({ library_view: v }).catch(() => {});
    }
  };

  const items = data?.items ?? [];
  const assignedItems = data?.assigned ?? [];
  // Bài Đọc-to / Nói nay NẰM THẲNG trong `items` (server gộp chung pool drip, gạn giọt cùng nhịp)
  // → hiển thị == path, record rải đều thay vì đổ hết. Không còn ghép danh sách record riêng.
  const unlockedItems = items.filter((i) => !i.locked);
  const lockedItems = items.filter((i) => i.locked);

  // Thống kê ở hero tính trên TẤT CẢ bài em có thể luyện: đã mở (lộ trình + record) ∪ cô giao.
  // Record giờ cũng qua cổng path/assignment ở server nên không còn thổi phồng con số.
  // Khử trùng theo slug (bài cô giao đọc-to có thể trùng record) — ưu tiên bản "đã làm"/nhiều lượt.
  const statBase = new Map<string, LibraryItem>();
  for (const it of [...unlockedItems, ...assignedItems]) {
    const prev = statBase.get(it.exercise_id);
    if (
      !prev ||
      (it.done && !prev.done) ||
      (it.attempts || 0) > (prev.attempts || 0)
    )
      statBase.set(it.exercise_id, it);
  }
  const practiceItems = [...statBase.values()];
  const totalCount = practiceItems.length;
  const doneCount = practiceItems.filter((i) => i.done).length;
  const attempts = practiceItems.reduce((s, i) => s + (i.attempts || 0), 0);

  // Thống kê mỗi kỹ năng (trên danh sách ĐÃ GỘP quiz + Đọc to/Nói): tổng bài · đã làm · điểm
  // TB các bài đã làm (%). Vừa để đếm cho cụm lọc, vừa vẽ vòng tổng quát trên từng card.
  const skillStats: Record<
    string,
    { total: number; done: number; sum: number }
  > = {};
  for (const it of unlockedItems) {
    if (!it.skill) continue;
    const s = (skillStats[it.skill] ||= { total: 0, done: 0, sum: 0 });
    s.total++;
    if (it.done) {
      s.done++;
      s.sum += pct(it.best_correct ?? 0, it.total ?? 0);
    }
  }

  // Dictation & Shadowing đứng ngoài lộ trình (không nằm trong unlockedItems) → đếm riêng từ
  // danh sách video; một bài bật cả 2 chế độ thì tính cho cả 2 card.
  for (const v of data?.videos ?? []) {
    const modes = v.video_modes?.length ? v.video_modes : (["dictation", "shadowing"] as PracticeMode[]);
    for (const m of modes) {
      const s = (skillStats[m] ||= { total: 0, done: 0, sum: 0 });
      s.total++;
      if (v.done) {
        s.done++;
        s.sum += pct(v.best_correct ?? 0, v.total ?? 0);
      }
    }
  }

  // Bài làm dở (draft) — key "user:<slug>" (Quiz lưu theo draftKey này).
  const draftOf = (it: LibraryItem) =>
    it.done ? null : getDraft(`user:${it.exercise_id}`, it.exercise_id);
  // Vocab decks resume from a SERVER session instead of a local draft — read both.
  const progressOf = (it: LibraryItem): { answered: number; total: number } | null => {
    if (it.done) return null;
    if ((it.doing_answered ?? 0) > 0) return { answered: it.doing_answered!, total: it.doing_total ?? 0 };
    const d = draftOf(it);
    const answered = d ? answeredCount(d.answers) : 0;
    return answered > 0 ? { answered, total: d?.total ?? 0 } : null;
  };
  const statusOf = (it: LibraryItem): Filter => {
    if (it.done) return "done";
    return progressOf(it) ? "doing" : "todo";
  };
  // Chip trạng thái chỉ tính trên bài ĐÃ MỞ (bài khóa chưa có trạng thái).
  const count = { done: 0, doing: 0, todo: 0 };
  unlockedItems.forEach((it) => (count[statusOf(it)] += 1));

  // Lọc theo Dictation/Shadowing = lọc theo CHẾ ĐỘ của bài Nghe & Nói, không phải theo skill
  // (bài nào cũng mang skill "listening") → mọi bài không phải video đều rớt.
  const modeFilter = isPracticeMode(skill) ? skill : null;
  const matchText = (it: LibraryItem) =>
    (modeFilter
      ? !!it.video && (it.video_modes?.length ? it.video_modes.includes(modeFilter) : true)
      : !skill || it.skill === skill) &&
    (!search.trim() ||
      it.title.toLowerCase().includes(search.trim().toLowerCase()));

  const filteredUnlocked = unlockedItems.filter(
    (it) => matchText(it) && (!filter || statusOf(it) === filter),
  );
  // Split the path: what still needs work stays in the grid, what is already mastered folds into a
  // strip at the bottom. Keeps a 200-lesson level readable without hiding anything. While a status
  // filter is on, the learner asked for a specific slice — do not second-guess it.
  const mastered = (it: LibraryItem) =>
    it.done && pct(it.best_correct ?? 0, it.total ?? 0) >= MASTERED_PCT;
  // Open slots = exercises not done yet; everything done folds below, weakest first.
  const pathActive = filter ? filteredUnlocked : filteredUnlocked.filter((it) => !it.done);
  const pathMastered = filter
    ? []
    : filteredUnlocked
        .filter((it) => it.done)
        .sort((a, b) => Number(mastered(a)) - Number(mastered(b)) || pct(a.best_correct ?? 0, a.total ?? 0) - pct(b.best_correct ?? 0, b.total ?? 0));
  const retryCount = pathMastered.filter((it) => !mastered(it)).length;
  // Bài khóa: cùng lọc kỹ năng/tìm kiếm, nhưng ẩn khi đang lọc theo trạng thái.
  const filteredLocked = filter ? [] : lockedItems.filter(matchText);
  // Nghe & Nói đi đường riêng (không gạn giọt) nên chỉ ăn theo tìm kiếm + lọc kỹ năng.
  // Order for Dictation & Shadowing: a few lessons already under way first, then the newest.
  // Server hands them over oldest-first within the CEFR group, which buries every new lesson at
  // the bottom of a 70-card shelf. Unfinished work is capped at IN_PROGRESS_SLOTS so a learner
  // who dabbled in fifteen lessons does not get a wall of half-done ones and never see anything new.
  const filteredVideos = (() => {
    const list = (data?.videos ?? []).filter(matchText);
    const started = (it: LibraryItem) => (it.seg_done ?? 0) > 0 && (it.seg_done ?? 0) < (it.q_count ?? 0);
    const byNewest = (a: LibraryItem, b: LibraryItem) =>
      (b.last_attempt_at ?? "") > (a.last_attempt_at ?? "") ? 1 : -1;
    const doing = list.filter(started).sort(byNewest).slice(0, IN_PROGRESS_SLOTS);
    const shown = new Set(doing.map((it) => it.exercise_id));
    // Server order = own level first, then the rest of the CEFR group, each oldest-first. Keep the
    // level grouping (own level stays on top) but flip the order INSIDE each level to newest-first.
    const at = new Map(list.map((it, i) => [it.exercise_id, i]));
    const levelRank = new Map<string, number>();
    list.forEach((it, i) => {
      const k = it.level ?? "";
      if (!levelRank.has(k)) levelRank.set(k, i);
    });
    const rest = list
      .filter((it) => !shown.has(it.exercise_id))
      .sort((a, b) => {
        const la = levelRank.get(a.level ?? "") ?? 1e9;
        const lb = levelRank.get(b.level ?? "") ?? 1e9;
        return la !== lb ? la - lb : (at.get(b.exercise_id) ?? 0) - (at.get(a.exercise_id) ?? 0);
      });
    return [...doing, ...rest];
  })();
  // The pool spans a whole CEFR group (see CEFR_GROUP in shared), so name the range, not one level.
  const videoBandNote = (() => {
    const band = cefrFromLabel(data?.level) as Cefr | "";
    const group = band ? CEFR_GROUP[band] : null;
    const range = CEFR_BANDS.filter((b) => group && CEFR_GROUP[b] === group);
    return range.length > 1 ? `${range[0]}–${range[range.length - 1]}` : `every ${data?.level}`;
  })();

  // Changing a filter starts the lists over — otherwise the previous "show more" carries across.
  useEffect(() => {
    setShownOpen(LOAD_STEP);
    setShownLocked(LOAD_STEP);
    setShownVideos(ROW);
    setShownMastered(ROW * 2);
  }, [search, skill, filter]);

  // Gọi thư viện HỎNG (mạng/lỗi máy chủ) → nói đúng là lỗi + cho thử lại. Trước đây mọi lỗi đều
  // rơi vào ô "chưa chọn cấp độ" bên dưới, khiến sự cố máy chủ trông như em chưa chọn cấp.
  if (isError) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="flex flex-col items-center gap-3 p-6">
          <AlertTriangle className="size-10 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t("userPages.library.loadErrorTitle")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("userPages.library.loadErrorDescription")}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> {t("userPages.library.retry")}
          </button>
        </div>
      </Card>
    );
  }

  // Chưa có cấp độ (hiếm — onboarding thường lo việc này) → nhắc chọn.
  if (!isLoading && !data?.level) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="flex flex-col items-center gap-3 p-6">
          <BookOpen className="size-10 text-cyan-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t("userPages.library.noLevelTitle")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("userPages.library.noLevelDescription")}
          </p>
          <Link
            to="/u/account"
            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
          >
            {t("userPages.library.chooseLevelAction")} <ChevronRight className="size-4" />
          </Link>
        </div>
      </Card>
    );
  }

  // Cấp độ có thật nhưng lộ trình chưa xếp bài nào → nói rõ là cấp độ chưa có bài, đừng để em
  // tưởng mình chọn sai. Chỉ hiện khi KHÔNG có bất kỳ nguồn bài nào (lộ trình · cô giao · video).
  if (!isLoading && data?.level && !items.length && !assignedItems.length && !(data.videos ?? []).length) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <div className="flex flex-col items-center gap-3 p-6">
          <BookOpen className="size-10 text-cyan-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t("userPages.library.emptyLevelTitle", { level: data.level })}
          </h2>
          <p className="text-sm text-slate-500">
            {t("userPages.library.emptyLevelDescription")}
          </p>
          <Link
            to="/u/account"
            className="mt-1 inline-flex items-center gap-1 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
          >
            {t("userPages.library.changeLevelAction")} <ChevronRight className="size-4" />
          </Link>
        </div>
      </Card>
    );
  }

  // ---- Render 1 bài (dạng lưới hoặc danh sách) ----
  // Nút "Làm bài / Làm tiếp / Làm lại" → LUÔN vào trang luyện (Nghe & Nói mở modal chọn cách).
  const goPractice = (it: LibraryItem) => {
    if (it.video) return setModeItem(it);
    // Translation: the hint rung is chosen here, in a modal, not on a start screen inside the exercise.
    if (it.template_id === "grammar_translate") return setTranslateItem(it);
    navigate(`/u/practice/${it.exercise_id}`);
  };
  // Tapping a CARD opens the report of the BEST attempt (/s/:id — retry button + attempt history),
  // so the report matches the score printed on the card. Not done yet → straight to practice.
  // Vocab decks have no report of their own (no submission id) → practice as well.
  const reportId = (it: LibraryItem) => it.best_submission_id ?? it.last_submission_id ?? null;
  const goOpen = (it: LibraryItem) => {
    if (it.video) return setModeItem(it);
    const id = reportId(it);
    if (it.done && id) return navigate(`/s/${id}`);
    if (it.template_id === "grammar_translate") return setTranslateItem(it);
    navigate(`/u/practice/${it.exercise_id}`);
  };
  // Bài Nghe & Nói: chọn cách luyện ở thư viện (modal) rồi vào thẳng với mode/level đã chọn.
  const goVideo = (it: LibraryItem, mode: "dictation" | "shadowing", level?: string) => {
    const q = new URLSearchParams({ mode });
    if (level) q.set("level", level);
    navigate(`/u/video/${it.exercise_id}?${q.toString()}`);
  };

  // `cover` = the Dictation & Shadowing template (photo thumb + title in the body). Everything
  // else — the learning path above all — keeps the original overlay-title card.
  const renderUnlocked = (it: LibraryItem, opts?: { forceList?: boolean; cover?: boolean; compact?: boolean }) => {
    const status = statusOf(it);
    const progress = progressOf(it);
    const outline = it.done && pct(it.best_correct ?? 0, it.total ?? 0) >= 50;
    const btnLabel = it.done ? (
      <><RotateCcw className="size-3.5" /> Retry</>
    ) : status === "doing" ? (
      <><PenLine className="size-3.5" /> Continue</>
    ) : (
      <><Play className="size-3.5" /> Start</>
    );
    // Bài Nghe & Nói → mở MODAL chọn cách luyện; khác → vào thẳng.
    // min-w cố định + căn giữa → "Làm bài"/"Làm lại"/"Làm tiếp" bằng width nhau giữa các thẻ.
    const btn = (
      <Button
        size="sm"
        variant={outline ? "outline" : "primary"}
        onClick={(e) => { e.stopPropagation(); goPractice(it); }}
        className={cn("min-w-[96px] justify-center", status === "doing" && "!bg-amber-500 hover:!bg-amber-600")}
      >
        {btnLabel}
      </Button>
    );
    // Video lessons report on their own page (/u/video/:slug/report) — they have no submission id,
    // so without this branch the whole Dictation & Shadowing family never showed a Feedback button.
    const feedbackBtn = it.video ? (
      (it.seg_done ?? 0) > 0 ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => { e.stopPropagation(); navigate(`/u/video/${it.exercise_id}/report`); }}
          className="min-w-[96px] justify-center border-emerald-500/60 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
        >
          <MessageSquareText className="size-3.5" /> Feedback
        </Button>
      ) : null
    ) : it.done && reportId(it) ? (
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => { e.stopPropagation(); navigate(`/s/${reportId(it)}`); }}
        className="min-w-[96px] justify-center border-emerald-500/60 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
      >
        <MessageSquareText className="size-3.5" /> Feedback
      </Button>
    ) : null;
    // Cụm nút phải: gộp Nhận xét + hành động chính (dồn phải, cùng width).
    const actions = (
      <div className="flex items-center gap-2">
        {feedbackBtn}
        {btn}
      </div>
    );
    // Trạng thái = vòng tròn: đã làm → % màu; chưa làm → vòng xám "N/A" (thống nhất, thẳng
    // hàng); đang làm dở → badge hổ phách kèm số câu đã trả lời (thông tin không có ở vòng).
    // Video lessons are measured in COVERAGE: 12 of 268 sentences worked. The average score would
    // be the wrong headline — 3 sentences at 90 is not a 90 on the lesson.
    const statusNode = it.video ? (
      <ScoreRing
        score={it.seg_done ?? 0}
        total={it.q_count ?? 0}
        size={44}
        showFraction={false}
        empty={!(it.seg_done ?? 0)}
      />
    ) : it.done ? (
      <ScoreRing
        score={it.best_correct ?? 0}
        total={it.total ?? 0}
        size={44}
        showFraction={false}
      />
    ) : status === "doing" ? (
      <Badge tone="amber">
        <PenLine className="size-3.5" /> Continue · {progress?.answered ?? 0}/
        {progress?.total || "?"}
      </Badge>
    ) : (
      <ScoreRing score={0} total={0} size={44} empty />
    );
    // Dòng meta. Trạng thái/thời gian (leadNode):
    //  • ĐÃ làm → "Lần cuối <giờ> · N lần" (tooltip = giờ cô giao, nếu là bài cô giao);
    //  • CHƯA làm + cô giao → "Giao lúc <giờ>";
    //  • đang làm dở → "Đang làm dở";  • lộ trình chưa làm → "N câu/từ" (liệu sức).
    // Sau đó: badge Level + Topic (thông tin bài).
    const unit = it.video
      ? "segments"
      : it.read_aloud || it.skill === "vocabulary" || it.skill === "writing"
        ? "words"
        : "questions";
    const leadNode = it.done ? (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400"
        title={
          it.unlocked_at
            ? `Unlocked ${fmtDate(it.unlocked_at)}`
            : it.assigned_at
              ? `Assigned ${fmtDate(it.assigned_at)}`
              : undefined
        }
      >
        <CheckCircle2 className="size-3.5" />
        {it.last_attempt_at
          ? `Last ${fmtDate(it.last_attempt_at)}`
          : "Done"}
        {it.attempts > 1 ? ` · ${it.attempts} tries` : ""}
      </span>
    ) : it.unlocked_at || it.assigned_at ? (
      // Ngày GIAO không nói lên gì với em (cô giao cả lộ trình một lần) → hiện ngày bài TỚI LƯỢT.
      <span className="inline-flex items-center gap-1 whitespace-nowrap font-light text-slate-500 dark:text-slate-400">
        <CalendarClock className="size-3.5" />{" "}
        {it.unlocked_at ? `Unlocked ${fmtDate(it.unlocked_at)}` : `Assigned ${fmtDate(it.assigned_at!)}`}
      </span>
    ) : status === "doing" ? (
      <span className="whitespace-nowrap">In progress</span>
    ) : it.q_count ? (
      // Writing's count is a TARGET (parsed from the prompt), not an exact tally → prefix "~".
      // Speaking has no analogous count (q_count stays 0) → falls through to null, no meta shown.
      <span className="whitespace-nowrap">
        {it.skill === "writing" ? `~${it.q_count} ${unit}` : `${it.q_count} ${unit}`}
      </span>
    ) : null;
    // Badge chủ đề — dùng riêng (grid: căn trái) và trong metaLine (list).
    const topicBadge = it.topic ? (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
        style={{ color: it.topic.color, backgroundColor: `${it.topic.color}1a` }}
      >
        {it.topic.icon ? (
          <TopicIcon icon={it.topic.icon} className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full" style={{ backgroundColor: it.topic.color }} />
        )}
        {it.topic.name}
      </span>
    ) : null;
    const topicChip = topicChipOf(it);
    const metaLine = (
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
        {leadNode}
        {/* Grid: cấp độ đã nằm cạnh chip loại bài trên thumb → ẩn ở đây. List: giữ vì không có thumb. */}
        {it.level && view !== "grid" && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <GraduationCap className="size-3" /> {it.level}
          </span>
        )}
        {topicBadge}
      </p>
    );

    if (view === "grid" && !opts?.forceList && !opts?.compact) {
      return (
        <div
          key={it.exercise_id}
          onClick={() => goOpen(it)}
          className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-400/60 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Topic + item count sit ON the thumb, matching the Record / Speaking cards.
              Cover template moves both into the metadata line, keeping only the STATUS chip
              (last attempt / in progress) on the picture. */}
          <ExerciseThumb
            item={it}
            variant={opts?.cover ? "cover" : "overlay"}
            overlayTitle={!opts?.cover}
            topic={opts?.cover ? undefined : topicChip}
            meta={opts?.cover ? (it.done || status === "doing" ? leadNode : null) : leadNode}
          />
          <div className="flex flex-1 flex-col p-4">
            {/* Cover template: title below the picture, one clipped line so the row stays even.
                Overlay template: the title is already on the thumb → body is score + button only. */}
            {opts?.cover && (
              <div className="mb-3">
                <CardTitle title={it.title} />
                <CoverMeta item={it} />
              </div>
            )}
            <div
              className={cn(
                "mt-auto flex flex-wrap items-center justify-between gap-2",
                opts?.cover && "border-t border-slate-100 pt-3 dark:border-slate-800/80",
              )}
            >
              {statusNode}
              {actions}
            </div>
          </div>
        </div>
      );
    }
    // Compact row for done exercises: thumb · title + (template · date · Feedback) · score ring.
    // The whole row opens the feedback report (which has Retry); without a report it opens the
    // exercise and keeps a Retry button.
    if (opts?.compact) {
      const ui = skillUi(it.skill);
      const template = it.video ? "Dictation & Shadowing" : it.read_aloud ? "Record" : ui?.short ?? "";
      const reportHref = it.video ? ((it.seg_done ?? 0) > 0 ? `/u/video/${it.exercise_id}/report` : null) : reportId(it) ? `/s/${reportId(it)}` : null;
      const dot = <span className="text-slate-300 dark:text-slate-600">·</span>;
      return (
        <div
          key={it.exercise_id}
          onClick={() => (reportHref ? navigate(reportHref) : goOpen(it))}
          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-cyan-400/60 dark:border-slate-800 dark:bg-slate-900"
        >
          <SkillThumb skill={it.skill} readAloud={!!it.read_aloud} video={!!it.video} size="sm" />
          <div className="min-w-0 flex-1">
            <p title={it.title} className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {it.title}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
              {template && <span className={cn("shrink-0 font-semibold", it.video ? "text-fuchsia-600 dark:text-fuchsia-400" : it.read_aloud ? "text-rose-600 dark:text-rose-400" : ui?.text)}>{template}</span>}
              {it.last_attempt_at && (
                <>
                  {dot}
                  <span className="shrink-0 whitespace-nowrap sm:hidden">{new Date(it.last_attempt_at).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })}</span>
                  <span className="hidden truncate whitespace-nowrap sm:inline">{fmtDate(it.last_attempt_at)}</span>
                </>
              )}
              {reportHref && (
                <>
                  {dot}
                  <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <MessageSquareText className="size-3.5" /> Feedback
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!reportHref && btn}
            {statusNode}
          </div>
        </div>
      );
    }
    // Danh sách (template cũ)
    return (
      <div
        key={it.exercise_id}
        onClick={() => goOpen(it)}
        className="flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-400/60 hover:shadow-md sm:flex-row sm:items-center sm:gap-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          {opts?.cover ? (
            <ListThumb item={it} />
          ) : (
            <SkillThumb skill={it.skill} readAloud={!!it.read_aloud} video={!!it.video} showLabel />
          )}
          <div className="min-w-0 flex-1">
            <p title={it.title} className="truncate font-bold text-slate-900 dark:text-white">
              {it.title}
            </p>
            {metaLine}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 pt-3 sm:justify-end sm:gap-2.5 sm:border-0 sm:pt-0 dark:border-slate-800">
          {statusNode}
          {actions}
        </div>
      </div>
    );
  };

  const renderLocked = (it: LibraryItem) => {
    if (view === "grid") {
      return (
        <button
          key={it.exercise_id}
          type="button"
          onClick={() => setLockedItem(it)}
          className="group flex flex-col overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-left opacity-80 transition hover:border-slate-300 hover:opacity-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700"
        >
          <div className="grayscale">
            <ExerciseThumb item={it} locked overlayTitle topic={topicChipOf(it)} />
          </div>
          {/* Same footer as an unlocked card (status ring + button) so the grid keeps its rhythm;
              only the ring is empty and the button reads "Unlock" → opens the explainer modal. */}
          <div className="flex flex-1 flex-col p-4">
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <ScoreRing score={0} total={0} size={44} empty />
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setLockedItem(it); }}
                className="min-w-[96px] justify-center"
              >
                <Lock className="size-3.5" /> Unlock
              </Button>
            </div>
          </div>
        </button>
      );
    }
    return (
      <button
        key={it.exercise_id}
        type="button"
        onClick={() => setLockedItem(it)}
        className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-left opacity-80 transition hover:border-slate-300 hover:opacity-100 sm:gap-4 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 grayscale sm:gap-4">
          <SkillThumb skill={it.skill} readAloud={!!it.read_aloud} video={!!it.video} showLabel />
          <div className="min-w-0 flex-1">
            <p title={it.title} className="truncate font-bold text-slate-500 dark:text-slate-400">
              {it.title}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Locked · tap to view
            </p>
          </div>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-400 transition group-hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-500">
          <Lock className="size-4" />
        </span>
      </button>
    );
  };

  const listWrap =
    view === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3";

  // Level pill tinted with the level colour; it opens a menu to switch level on the spot.
  const levelPill = user.level ? <LevelPicker current={user.level} /> : null;

  return (
    <>
      {/* Hero — cùng phong cách trang học sinh */}
      <header className="relative mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="user-library" />
        <div className="relative flex min-w-0 items-center gap-4">
          {/* Avatar + badge "Lv N" ở đáy-giữa (tô màu cấp độ) — nền cho hệ lên cấp sau này. */}
          <div className="relative shrink-0">
            <Avatar
              seed={user.id}
              src={user.avatar_url}
              size={64}
              className="!rounded-2xl"
              points={stats?.points}
            />
            {stats?.level && (
              // Badge "Lv N" = cấp XP (quy đổi ngầm từ tổng điểm). Màu theo cấp CEFR nếu có.
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white shadow-md ring-2 ring-white dark:ring-slate-900"
                style={{ backgroundColor: user.level?.color ?? "#0891b2" }}
                title={`Level ${stats.level.level} · ${formatPoints(stats.points)} pts`}
              >
                Lv {stats.level.level}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {user.name || "You"}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400">
                  {totalCount}
                </span>{" "}
                exercises
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {doneCount}
                </span>{" "}
                done
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {attempts}
                </span>{" "}
                attempts
              </span>
            </p>
          </div>

          {/* Desktop: level pill on the right (natural width). */}
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            {levelPill}
          </div>
        </div>

        {/* Mobile: level pill on its own row. */}
        <div className="mt-3 flex gap-2 sm:hidden">
          {levelPill}
        </div>
      </header>

      {/* Bài cô giao cho lớp — LÊN ĐẦU, trước cả bộ lọc kỹ năng: cô giao là việc cần làm
          trước, không phải một mục trong thư viện tự chọn. Không dính bộ lọc/tìm kiếm bên
          dưới vì đây là danh sách ngắn và có thời hạn. */}
      {assignedItems.length > 0 && data?.assigned_queue && (
        <AssignedQueue
          items={assignedItems}
          summary={data.assigned_queue}
          listWrap={listWrap}
          renderCard={renderUnlocked}
        />
      )}

      {/* Cụm 6 kỹ năng — bộ lọc trực quan + vòng điểm TB mỗi kỹ năng */}
      <SkillHub
        selected={skill}
        stats={skillStats}
        onSelect={(k) => setSkill(skill === k ? "" : k)}
      />

      {/* Danh sách bài tập — quiz + Đọc to/Nói gộp CHUNG một list, lọc theo cụm kỹ năng ở trên */}
      {true && (
        <>
          {/* Thanh công cụ. PC (lg+): 1 hàng — tìm kiếm (giãn) · Trạng thái · Kỹ năng · lưới/danh sách.
              Mobile & iPad (<lg): hàng 1 = tìm kiếm + toggle; hàng 2 = 2 dropdown 50/50 (tránh
              tràn menu khi màn chưa đủ rộng cho 1 hàng). */}
          <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2.5 lg:min-w-0 lg:flex-1">
              <div className="min-w-0 flex-1">
                <Input
                  className="h-11 py-0"
                  leftIcon={<Search className="size-4" />}
                  placeholder="Search exercises…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => setSearch("")}
                />
              </div>
              {/* Toggle cạnh search khi <lg (mobile + iPad); PC dời về cuối hàng. */}
              <ViewToggle
                view={view}
                onChange={setViewMode}
                className="lg:hidden"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:flex lg:shrink-0">
              <div className="lg:w-44">
                <Select
                  options={[
                    {
                      value: "",
                      label: "All statuses",
                      icon: <ListFilter className="size-4 text-slate-400" />,
                    },
                    {
                      value: "done",
                      label: `Done (${count.done})`,
                      icon: (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ),
                    },
                    {
                      value: "doing",
                      label: `In progress (${count.doing})`,
                      icon: <PenLine className="size-4 text-amber-500" />,
                    },
                    {
                      value: "todo",
                      label: `Not done (${count.todo})`,
                      icon: <Circle className="size-4 text-slate-400" />,
                    },
                  ]}
                  value={filter ?? ""}
                  onChange={(v) => setFilter(v ? (v as Filter) : null)}
                  placeholder="Status"
                />
              </div>
              <div className="lg:w-44">
                <Select
                  options={[
                    ...skillFilterOptions("All skills"),
                    ...PRACTICE_MODE_CARDS.map((c) => ({
                      value: c.key,
                      label: t(c.labelKey),
                      icon: <c.Icon className="size-4 text-fuchsia-500" />,
                    })),
                  ]}
                  value={skill}
                  onChange={setSkill}
                  placeholder="All skills"
                />
              </div>
            </div>
            <ViewToggle
              view={view}
              onChange={setViewMode}
              className="hidden lg:flex"
            />
          </div>

          {/* Dictation & shadowing — outside the path: no stages, no drip, the whole level is open. */}
          {filteredVideos.length > 0 && (
            <div className="mb-6 space-y-3">
              <SectionTitle
                icon={<AudioLines className="size-3.5" />}
                label="Dictation & Shadowing"
                count={filteredVideos.length}
                note={`Sentence by sentence — ${videoBandNote} lessons are open, no waiting.`}
                tone="fuchsia"
              />
              <div className={listWrap}>
                {filteredVideos
                  .slice(0, shownVideos)
                  .map((it) => renderUnlocked(it, { cover: true }))}
              </div>
              <LoadMore
                remaining={filteredVideos.length - shownVideos}
                step={VIDEO_STEP}
                onMore={() => setShownVideos((n) => n + VIDEO_STEP)}
              />
            </div>
          )}

          {isLoading ? (
            // Two blocks, because that is what almost every learner lands on: the assigned queue
            // and the learning path. Same wrapper classes as the real lists, so nothing jumps.
            <div className="space-y-5">
              <CardGridSkeleton wrap={listWrap} list={view === "list"} count={view === "list" ? 3 : 3} />
              <CardGridSkeleton wrap={listWrap} list={view === "list"} count={view === "list" ? 4 : 6} />
            </div>
          ) : modeFilter ? (
            // Lọc theo Dictation/Shadowing → chỉ còn khối Nghe & Nói ở trên; lộ trình không liên quan.
            filteredVideos.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500 dark:border-slate-700">
                No exercises match your filters.
              </div>
            )
          ) : items.length === 0 && filteredVideos.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-14 text-center dark:border-slate-700">
              <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
                <Play className="size-7" />
              </div>
              <p className="font-semibold text-slate-600 dark:text-slate-300">
                No exercises for this level yet
              </p>
              <p className="mt-1 text-sm text-slate-500">Check back later!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Tiêu đề cho phần LỘ TRÌNH — cùng kiểu với Nghe & Nói ở trên để hai khối
                  không dính vào nhau (một cái mở sẵn, một cái mở dần). */}
              <SectionTitle
                icon={<GraduationCap className="size-3.5" />}
                label="Your learning path"
                count={pathActive.length}
                note="Unlocked step by step as you go."
                tone="cyan"
              />
              <div className={listWrap}>
                {pathActive.slice(0, shownOpen).map((it) => renderUnlocked(it))}
              </div>
              <LoadMore
                remaining={pathActive.length - shownOpen}
                onMore={() => setShownOpen((n) => n + LOAD_STEP)}
              />

              {/* Done — compact rows, always open; paging (LoadMore) keeps it short. */}
              {pathMastered.length > 0 && (
                <>
                  <p className="flex w-full items-center gap-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    {t("userPages.library.doneSection", { n: pathMastered.length })}
                    {retryCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 normal-case tracking-normal text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        {t("userPages.library.retryCount", { n: retryCount, pct: MASTERED_PCT })}
                      </span>
                    )}
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  </p>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {pathMastered.slice(0, shownMastered).map((it) => renderUnlocked(it, { compact: true }))}
                  </div>
                  <LoadMore
                    remaining={pathMastered.length - shownMastered}
                    onMore={() => setShownMastered((n) => n + LOAD_STEP)}
                  />
                </>
              )}

              {filteredUnlocked.length === 0 && filteredLocked.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500 dark:border-slate-700">
                  No exercises match your filters.
                </div>
              )}

              {/* Bài chưa mở khóa — mờ + 🔒, thấy được lộ trình phía trước. */}
              {filteredLocked.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Lock className="size-3.5" /> Opens later ·{" "}
                    {filteredLocked.length} exercises
                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className={listWrap}>
                    {filteredLocked.slice(0, shownLocked).map(renderLocked)}
                  </div>
                  <LoadMore
                    remaining={filteredLocked.length - shownLocked}
                    onMore={() => setShownLocked((n) => n + LOAD_STEP)}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal: giải thích vì sao bài bị khóa + khi nào mở tiếp */}
      {lockedItem && (
        <LockedModal
          item={lockedItem}
          meta={data?.meta ?? undefined}
          onClose={() => setLockedItem(null)}
        />
      )}


      {/* Modal: chọn cách luyện cho bài Nghe & Nói */}
      {modeItem && (
        <PracticeModeModal
          title={modeItem.title}
          modes={modeItem.video_modes?.length ? modeItem.video_modes : ["dictation", "shadowing"]}
          onStart={(mode, level) => { goVideo(modeItem, mode, level); setModeItem(null); }}
          onClose={() => setModeItem(null)}
        />
      )}

      {/* Modal: hint rung for a translation exercise */}
      {translateItem && (
        <TranslateLevelModal
          title={translateItem.title}
          count={translateItem.q_count}
          defaultLevel={translateItem.translate_level ?? "easy"}
          onStart={(level) => {
            navigate(`/u/practice/${translateItem.exercise_id}?level=${level}`);
            setTranslateItem(null);
          }}
          onClose={() => setTranslateItem(null)}
        />
      )}
    </>
  );
}

/** Tiêu đề ngăn cách giữa các khối bài (lộ trình · Nghe & Nói) — màu để nhận diện nhanh. */
function SectionTitle({
  icon,
  label,
  count,
  note,
  tone,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  note?: string;
  tone: "fuchsia" | "cyan";
}) {
  const t =
    tone === "fuchsia"
      ? { text: "text-fuchsia-600 dark:text-fuchsia-400", chip: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300", line: "bg-fuchsia-200 dark:bg-fuchsia-900/60" }
      : { text: "text-cyan-600 dark:text-cyan-400", chip: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300", line: "bg-cyan-200 dark:bg-cyan-900/60" };
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide", t.text)}>
          {icon} {label}
        </p>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums", t.chip)}>{count}</span>
        <span className={cn("h-px flex-1", t.line)} />
      </div>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** Nút "xem thêm" cho danh sách render dần; ẩn khi đã hết. */
function LoadMore({ remaining, onMore, step = LOAD_STEP }: { remaining: number; onMore: () => void; step?: number }) {
  if (remaining <= 0) return null;
  return (
    <button
      type="button"
      onClick={onMore}
      className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
    >
      Show {Math.min(step, remaining)} more · {remaining} left
    </button>
  );
}

// ---- Hub kỹ năng (bộ lọc trực quan) ----
// Rectangular card: icon + name + exercise count + the average score of the ones already done.
// A skill with NO exercise at this level is not rendered at all — a dimmed "Soon" card only took
// up a slot and pushed the usable ones down a row. The grid reflows; no card left → hub hidden.
function SkillHub({
  selected,
  stats,
  onSelect,
}: {
  selected: string;
  stats: Record<string, { total: number; done: number; sum: number }>;
  onSelect: (skill: string) => void;
}) {
  const cards = HUB_CARDS.filter((m) => (stats[m.key]?.total ?? 0) > 0);
  if (!cards.length) return null;
  return (
    <section className="mb-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Practice by skill
        </h2>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(selected)}
            className="ml-auto text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((m) => {
          const st = stats[m.key];
          const n = st?.total ?? 0;
          const avg = st?.done ? Math.round(st.sum / st.done) : 0;
          const active = selected === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelect(m.key)}
              className={cn(
                "group relative flex items-center gap-3 rounded-2xl border p-3 text-left transition",
                active
                  ? "border-cyan-400 bg-cyan-50/70 ring-1 ring-cyan-400/40 dark:border-cyan-500/60 dark:bg-cyan-500/10"
                  : "border-slate-200 bg-white hover:border-cyan-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-500/40",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  m.box,
                )}
              >
                <m.Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-bold text-slate-900 dark:text-white">
                    {"labelKey" in m ? t(m.labelKey as TKey) : m.label}
                  </p>
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-100 px-1 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    {n}
                  </span>
                </div>
                {/* Description, not numbers: the count sits in the chip above and the average in
                    the ring on the right. */}
                <p className="mt-0.5 truncate text-xs text-slate-500">{t(m.descKey)}</p>
              </div>
              {/* Skill-wide ring: average of the exercises already done; none done yet → "N/A". */}
              <ScoreRing score={avg} total={100} size={40} showFraction={false} empty={!st?.done} className="ml-1" />
              {active && (
                <CheckCircle2 className="size-4 shrink-0 text-cyan-500" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---- Nút đổi lưới ⇄ danh sách ----
function ViewToggle({
  view,
  onChange,
  className,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800",
        className,
      )}
    >
      {(
        [
          ["list", ListIcon, "List"],
          ["grid", LayoutGrid, "Grid"],
        ] as const
      ).map(([v, Icon, label]) => (
        <button
          key={v}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition",
            view === v
              ? "bg-cyan-500 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

// Style CHUNG cho mọi chip đặt trên thumb (kỹ năng ngoại lệ: nền đặc màu loại bài).
const THUMB_CHIP_STYLE =
  "inline-flex items-center gap-1 truncate rounded-lg bg-white/85 px-2 py-1 text-[10px] font-bold tracking-tight text-slate-700 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-200";

/**
 * Chip chủ đề đặt TRÊN THUMB — dùng chung style với các chip khác (trắng/blur, chữ slate) cho đỡ
 * loè loẹt; màu chủ đề chỉ còn ở icon. Dùng cho cả card đã mở lẫn card khóa.
 */
function topicChipOf(it: LibraryItem) {
  if (!it.topic) return null;
  const { color, icon, name } = it.topic;
  return (
    <span className={cn(THUMB_CHIP_STYLE, "max-w-full")}>
      {icon ? (
        <span className="shrink-0" style={{ color }}>
          <TopicIcon icon={icon} className="size-3" />
        </span>
      ) : (
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

// YouTube serves every video under one id at several sizes. maxresdefault is 1280×720 (16:9,
// sharpest); sddefault/mqdefault are the step-downs for the rare video without it. Straight from
// i.ytimg.com — no upload, no R2, and the cover follows whenever the lesson's video changes.
const ytThumb = (id: string, size: "max" | "sd" | "mq") =>
  `https://i.ytimg.com/vi/${id}/${size === "max" ? "maxresdefault" : size === "sd" ? "sddefault" : "mqdefault"}.jpg`;

/** Cover photo for a card: uploaded image wins, else the YouTube thumbnail. null → pattern. */
function CoverArt({ item }: { item: LibraryItem }) {
  const [size, setSize] = useState<"max" | "sd" | "mq">("max");
  const cls = "size-full object-cover transition duration-300 group-hover:scale-105";
  if (item.image) return <img src={item.image} alt="" className={cls} />;
  if (item.video && item.youtube_id)
    return (
      <img
        src={ytThumb(item.youtube_id, size)}
        alt=""
        loading="lazy"
        onError={() => setSize((s) => (s === "max" ? "sd" : "mq"))}
        className={cls}
      />
    );
  return null;
}

/**
 * Grid-card title. Two lines on a phone (one column — nothing to line up with), a single clipped
 * line from `sm` up so every card in a row ends at the same height. Hovering shows the full text;
 * line-clamp-1 rather than `truncate` because `truncate`'s nowrap fights the -webkit-box display
 * line-clamp needs, and the ellipsis stops rendering.
 */
function CardTitle({ title, muted = false }: { title: string; muted?: boolean }) {
  return (
    <p
      title={title}
      className={cn(
        "line-clamp-2 font-bold leading-snug sm:line-clamp-1",
        muted ? "text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white",
      )}
    >
      {title}
    </p>
  );
}

/**
 * Metadata under a cover-card title: Level | Topic | Segments, on one line. Plain coloured text,
 * no pills — three bordered badges under a title turn the card into a sticker sheet, and the
 * colour alone already carries the level and the topic.
 */
function CoverMeta({ item }: { item: LibraryItem }) {
  const band = cefrFromLabel(item.level);
  const levelColor = band ? BAND_COLOR[band as Cefr] : undefined;
  const sep = <span className="shrink-0 text-slate-300 dark:text-slate-700">|</span>;
  const parts: ReactNode[] = [];
  if (item.level)
    parts.push(
      // Full level name, clipped when the row runs out of room — the band is already obvious from
      // the colour and from the section above, so losing its tail costs nothing.
      <span key="lv" className="inline-flex min-w-0 items-center gap-1 font-bold" style={{ color: levelColor }} title={item.level ?? undefined}>
        <GraduationCap className="size-3.5 shrink-0" />
        <span className="truncate">{item.level}</span>
      </span>,
    );
  if (item.topic)
    parts.push(
      // Topic is the one part worth reading in full — it says what the lesson is about. It keeps
      // its width (shrink-0) until it alone would eat the row, then clips at 60%.
      <span key="tp" className="inline-flex min-w-0 max-w-[60%] shrink-0 items-center gap-1 font-semibold" style={{ color: item.topic.color }} title={item.topic.name}>
        {item.topic.icon ? (
          <TopicIcon icon={item.topic.icon} className="size-3.5 shrink-0" />
        ) : (
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.topic.color }} />
        )}
        <span className="truncate">{item.topic.name}</span>
      </span>,
    );
  if (item.q_count)
    parts.push(
      <span key="n" className="inline-flex min-w-0 items-center gap-1 text-slate-500 dark:text-slate-400">
        <AudioLines className="size-3.5 shrink-0" />
        <span className="truncate">{item.q_count} segments</span>
      </span>,
    );
  if (!parts.length) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-xs">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && sep}
          {p}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * List-row thumbnail — the 16:9 counterpart of the grid cover. Replaces the old square icon tile:
 * a photo says which lesson this is far faster than a repeated skill glyph. No photo → the same
 * generated pattern as the grid, with the skill icon on top.
 */
function ListThumb({ item }: { item: LibraryItem }) {
  const kind = thumbKind(item);
  const ui = item.video
    ? { Icon: AudioLines }
    : item.read_aloud
      ? { Icon: Mic }
      : skillUi(item.skill) ?? { Icon: BookOpen };
  const cover = <CoverArt item={item} />;
  return (
    <div
      className={cn(
        "relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg sm:w-32",
        cover ? "bg-slate-900" : THUMB_TINT[kind],
      )}
    >
      {cover ?? (
        <>
          <PatternThumb kind={kind} seed={item.exercise_id} />
          <span className="absolute inset-0 flex items-center justify-center text-slate-500/60 dark:text-white/50">
            <ui.Icon className="size-6" />
          </span>
        </>
      )}
    </div>
  );
}

// ---- Cover strip at the top of a grid card ----
// Photo (upload / YouTube) fills it; otherwise a skill-tinted pattern with a large faded icon.
function ExerciseThumb({
  item,
  locked = false,
  overlayTitle = false,
  variant = "overlay",
  topic,
  meta,
}: {
  item: LibraryItem;
  locked?: boolean;
  overlayTitle?: boolean; // grid: uppercase title across the middle of the thumb
  variant?: "overlay" | "cover"; // "cover" = photo kept whole, title lives in the card body
  topic?: ReactNode; // topic badge — top-right of the thumb
  meta?: ReactNode; // "15 questions" / "In progress"… — bottom-right of the thumb
}) {
  // Bài ĐỌC TO (record) trùng kỹ năng "reading" với bài đọc-hiểu → phân biệt bằng
  // icon Mic + nhãn "Đọc to" + tông hồng, cho khớp SkillThumb (RECORD_META).
  const skillMeta = skillUi(item.skill);
  const ui = item.video
    ? {
        Icon: AudioLines,
        box: PRACTICE_MODE_BOX,
        short: "Dictation & Shadowing",
      }
    : item.read_aloud
      ? {
          Icon: Mic,
          box: "bg-rose-500/15 text-rose-500 dark:text-rose-400",
          short: "Record",
        }
      : skillMeta;
  // Hàng chip TRÁI-TRÊN: loại bài + cấp độ. Cấp độ rút về MÃ CEFR ("A2") — tên đầy đủ
  // ("A2 Flyers / Key") chiếm gần nửa bề ngang thumb mà không thêm thông tin gì cho em.
  const band = cefrFromLabel(item.level);
  // Cover variant: level lives in the metadata line under the title, so the thumb only carries the
  // kind chip — moved to the BOTTOM-left, where it sits on the scrim instead of over the picture.
  const chip = (
    <span
      className={cn(
        "absolute left-2.5 flex max-w-[calc(100%-1.25rem)] items-center gap-1",
        variant === "cover" ? "bottom-2.5" : "top-2.5",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-white shadow-md ring-1 ring-inset ring-white/25",
          THUMB_CHIP[thumbKind(item)],
        )}
      >
        {ui ? <ui.Icon className="size-3" /> : <BookOpen className="size-3" />}
        {ui?.short ?? "Task"}
      </span>
      {band && variant !== "cover" && (
        <span className={cn(THUMB_CHIP_STYLE, "uppercase")} title={item.level ?? undefined}>
          <GraduationCap className="size-3 shrink-0" /> {band}
        </span>
      )}
    </span>
  );
  // Title across the MIDDLE of the thumb (overlay variant), uppercase — white on a photo (it
  // already has a scrim), otherwise the interface text tone.
  const titleOverlay = (onImage: boolean) =>
    overlayTitle ? (
      <div className="absolute inset-0 flex items-center justify-center px-4 pb-6 pt-7">
        <p
          className={cn(
            "line-clamp-3 text-center text-lg font-extrabold uppercase leading-tight tracking-tight drop-shadow-sm sm:text-xl",
            onImage ? "text-white" : "text-slate-900 dark:text-white",
          )}
        >
          {item.title}
        </p>
      </div>
    ) : null;

  // Topic chip TOP-RIGHT — balances the left chips. Capped at half the thumb so long names clip.
  const topicChip = topic ? (
    <span className="absolute right-2.5 top-2.5 flex max-w-[55%] justify-end">{topic}</span>
  ) : null;
  // Thumb footer: item count / status, on the right.
  const footer = meta ? (
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-end gap-2 px-2.5 pb-2">
      <span className={cn(THUMB_CHIP_STYLE, "[&_*]:font-bold [&_*]:text-inherit [&_svg]:size-3")}>{meta}</span>
    </div>
  ) : null;

  // COVER variant (Dictation & Shadowing): a real photo, kept whole at 16:9 — the native ratio of
  // a YouTube thumbnail, so nothing is cropped and the title never sits on top of the picture.
  const cover = variant === "cover" ? <CoverArt item={item} /> : null;
  if (cover) {
    return (
      <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
        {cover}
        {/* Darkened only at the EDGES: the chips need a backing, the picture itself stays readable. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />
        {chip}
        {topicChip}
        <span className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
          <Play className="size-5 fill-current" />
        </span>
        {footer}
        {locked && <LockOverlay />}
      </div>
    );
  }

  // OVERLAY variant (learning path): uploaded image full-bleed, uppercase title across the middle.
  if (item.image) {
    return (
      <div className="relative h-40 w-full overflow-hidden sm:h-44">
        <img
          src={item.image}
          alt=""
          className="size-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className={cn("absolute inset-0", overlayTitle ? "bg-black/40" : "bg-gradient-to-t from-black/25 to-transparent")} />
        {chip}
        {topicChip}
        {titleOverlay(true)}
        {footer}
        {locked && <LockOverlay />}
      </div>
    );
  }

  // Fallback: a CODE-GENERATED thumbnail — skill tint + a motif layout fixed by slug, with the
  // faded skill icon in the middle as the landmark. See components/PatternThumb.tsx.
  const kind = thumbKind(item);
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden",
        variant === "cover" ? "aspect-video" : "h-40 sm:h-44",
        THUMB_TINT[kind],
        ui?.box?.split(" ").filter((c) => c.includes("text-")).join(" ") ?? "text-slate-400",
      )}
    >
      <PatternThumb kind={kind} seed={item.exercise_id} />
      {item.topic && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(120% 120% at 85% 0%, ${item.topic.color}, transparent 60%)`,
          }}
        />
      )}
      {!overlayTitle && (ui ? <ui.Icon className="relative size-14 opacity-25" /> : <BookOpen className="relative size-14 opacity-25" />)}
      {chip}
      {topicChip}
      {titleOverlay(false)}
      {footer}
      {locked && <LockOverlay />}
    </div>
  );
}

function LockOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30">
      <span className="flex size-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow dark:bg-slate-900/90">
        <Lock className="size-4" />
      </span>
    </div>
  );
}

// ---- Modal "bài chưa mở khóa" ----
// Giải thích cơ chế gạn giọt (mỗi ngày mở N bài) + đếm ngược tới mốc mở tiếp.
function LockedModal({
  item,
  meta,
  onClose,
}: {
  item: LibraryItem;
  meta?: LibraryMeta;
  onClose: () => void;
}) {
  const now = useNow();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remainMs = meta?.next_unlock_at
    ? new Date(meta.next_unlock_at).getTime() - now
    : 0;
  const waiting = meta?.active_undone ?? 0; // bài đã mở nhưng chưa làm xong
  // Hai van chặn khác nhau → phải nói ĐÚNG cái đang chặn, không đổ cả 4 chỉ số ra.
  // Kẹt vì tồn bài chưa làm thì hành động được NGAY, không hiện đồng hồ đếm.
  const stuckOnUndone = !!meta && meta.active_undone >= meta.rollover;
  const rolling = meta?.mode === "rolling";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        style={{ animation: "fade-in 0.15s ease-out" }}
      >
        {/* Header có gradient nhẹ + ổ khóa */}
        <div className="relative flex flex-col items-center gap-3 bg-gradient-to-br from-cyan-50 to-white px-6 pb-5 pt-7 text-center dark:from-slate-800 dark:to-slate-900">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 shadow-inner dark:text-cyan-400">
            <Lock className="size-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              This exercise is locked
            </h3>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">
              {item.title}
            </p>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          {rolling ? (
            <>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t("userPages.library.rollingLocked", { n: meta!.rollover })}</p>
              <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
                <Row label={t("userPages.library.rollingOpen")} value={t("userPages.library.rollingOpenValue", { n: waiting, max: meta!.rollover })} tone="amber" />
                <Row label={t("userPages.library.rollingDone")} value={t("userPages.library.rollingDoneValue", { n: meta!.done_in_level, total: meta!.total_in_level })} tone="emerald" />
              </div>
            </>
          ) : (
          <>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {stuckOnUndone
              ? `You have ${waiting} exercises open and unfinished — that is the limit. Finish some of them and the next ones open right away.`
              : meta
                ? `Your day starts with ${meta.daily_base} new exercises. Every exercise you pass today opens one more, up to ${DAILY_UNLOCK_MAX} — so the wall is your effort, not the clock.`
                : "Exercises open a few at a time so you keep a steady pace."}
          </p>

          {meta && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
              <Row
                label="Opened today"
                value={`${meta.unlocked_today}/${meta.daily} exercises`}
              />
              {/* Suất kiếm thêm nhờ làm đạt bài mới hôm nay — cho thấy nỗ lực có tác dụng ngay. */}
              {meta.earned_today > 0 && (
                <Row
                  label="Earned by passing"
                  value={`+${meta.earned_today} exercises`}
                  tone="emerald"
                />
              )}
              {waiting > 0 && (
                <Row
                  label="Open, not finished"
                  value={`${waiting}/${meta.rollover} exercises`}
                  tone="amber"
                />
              )}
              {/* Đồng hồ chỉ có nghĩa khi van NGÀY là thứ đang chặn. */}
              {meta.next_unlock_at && !stuckOnUndone && (
                <Row
                  label="Next unlock"
                  value={fmtRemain(remainMs)}
                  tone="cyan"
                  icon={<Clock className="size-3.5" />}
                />
              )}
            </div>
          )}

          {waiting > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-slate-500">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              Score {UNLOCK_PASS_PCT}% or more on an exercise you already have open and another one
              appears straight away.
            </p>
          )}
          </>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}

// Một dòng thông số trong modal khóa.
function Row({
  label,
  value,
  tone = "slate",
  icon,
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber" | "cyan" | "emerald";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "cyan"
        ? "text-cyan-600 dark:text-cyan-400"
        : tone === "emerald"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-800 dark:text-slate-100";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-bold tabular-nums",
          toneCls,
        )}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}

// Đồng hồ nội bộ, nhích mỗi 30s để đếm ngược mốc mở khóa.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// Remaining time → "6h 12m" / "45 min" / "soon".
function fmtRemain(ms: number): string {
  if (ms <= 0) return "soon";
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/** The learner's level as a pill; picking another level saves it and reloads the library for it. */
function LevelPicker({ current }: { current: NonNullable<PublicUser["level"]> }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data: levels } = useQuery({ queryKey: ["public-levels"], queryFn: publicLevels, retry: false });
  const pick = async (levelId: string) => {
    setSaving(true);
    try {
      await accountApi.updateProfile({ level_id: levelId });
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      await qc.invalidateQueries({ queryKey: ["library"] });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Popover
      align="right"
      ariaLabel={t("userPages.library.levelPicker.title")}
      title={t("userPages.library.levelPicker.title")}
      triggerClassName="inline-flex flex-1 items-center justify-center gap-1.5 truncate rounded-xl border px-3 py-2 text-sm font-semibold transition hover:brightness-110 sm:flex-none"
      triggerStyle={{ color: current.color, borderColor: `${current.color}80`, backgroundColor: `${current.color}2e` }}
      panelClassName="w-64 p-1.5"
      trigger={
        <>
          {saving ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <GraduationCap className="size-4 shrink-0" />}
          {current.name}
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </>
      }
    >
      {(close) => (
        <div className="space-y-0.5">
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-slate-400">{t("userPages.library.levelPicker.title")}</p>
          {(levels?.items ?? []).map((l) => (
            <PopoverItem
              key={l.id}
              active={l.id === current.id}
              onClick={() => {
                close();
                if (l.id !== current.id) void pick(l.id);
              }}
            >
              <LevelDot icon={l.icon} color={l.color} />
              <span className="flex-1 truncate">{l.name}</span>
              {l.id === current.id && <Check className="size-3.5" />}
            </PopoverItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
