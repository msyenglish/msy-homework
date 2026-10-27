// Practice NGHE & NÓI (Dictation + Shadowing) theo từng câu — LUYỆN-CHO-ĐÚNG, không nộp tổng hợp.
// Vào bài → modal chọn Dictation (Easy/Medium/Hard) hoặc Shadowing. Nguồn Audio (<audio>) / Video (YouTube).
// Dictation chấm TỨC THÌ ở client (đáp án gửi kèm cho bài luyện thân thiện): gõ đúng ô XANH ngay, ô tự nhảy,
// đúng → tự sang câu sau ~1.5s. Thang điểm mỗi câu: Exactly · Good · Fair · Revealed · Skipped (bỏ qua = kém).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AudioLines,
  Play,
  Pause,
  Plus,
  Minus,
  Mic,
  Languages,
  Lightbulb,
  Check,
  ChevronDown,
  ChevronRight,
  ScrollText,
  PanelRightClose,
  Clock,
  Ear,
  ListChecks,
  Gauge,
  Headphones,
  SkipBack,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Loader2,
  Eye,
  PenLine,
  Sun,
  Moon,
  Settings2,
  Captions,
  Type,
  Repeat,
  Video,
  VideoOff,
  CornerDownLeft,
  Square,
  X,
  ClipboardList,
  type LucideIcon,
  CloudOff,
} from "lucide-react";
import {
  alignWordTimes,
  paceVerdict,
  dictationLessonMax,
  videoDictBlanks,
  splitWords,
  altMatches,
  compactWord,
  matchWithAlts,
  nextWordHint,
  dictationHintGrade,
  DICTATION_HINT_MAX,
  type PublicVideoLesson,
  type VideoMode,
  type WordHint,
} from "@msyen/shared";
import { Button, Popover, PopoverItem, Toggle } from "../../components/ui";
import { Tooltip } from "../../components/Tooltip";
import { boxNavKeyDown, focusBox } from "../../lib/boxNav";
import { useTheme } from "../../lib/theme";
import { PracticeUnavailable } from "../../components/practice/PracticeUnavailable";
import { AudioRecorder, recordFixedClip } from "../../components/AudioRecorder";
import YouTubePlayer, {
  type YouTubePlayerHandle,
} from "../../components/video/YouTubePlayer";
import { accountApi, videoLibraryApi, type VideoApi, type VideoShadowResult } from "../../lib/api";
import { ScoredPassage } from "../../components/practice/ScoredPassage";
import { PracticeFooter } from "../../components/practice/PracticeFooter";
import { Drawer } from "../../components/ui/drawer";
import { measureAudioLevel, isSilentLevel } from "../../lib/audioLevel";
import { WeakPhonemeLine } from "../../components/practice/PhonemeBreakdown";
import { BrandWordmark } from "../../components/Logo";
import { useLearningRefresh } from "../../lib/learningRefresh";
import { t } from "../../i18n";

// ── Bản nháp buổi luyện (localStorage) — bài vài trăm câu, F5 mà mất chỗ thì không ai học nổi.
// Chỉ giữ thứ CLIENT tự biết: chỗ đang đứng + chữ đã gõ. Điểm shadowing/kiểm tra nằm ở server.
// Tuỳ chọn CHẾ ĐỘ XEM — nhớ theo máy, dùng chung cho mọi bài.
interface WatchOpts {
  watch: boolean;
  subEn: boolean;
  subVi: boolean;
  subSize: number;
  loop: boolean;
  karaoke: boolean; // shadowing: keep the highlight running WHILE RECORDING (playback always has it)
  lineVi: boolean; // show the Vietnamese translation under the practised line
  textSize: number; // index into LINE_SIZES
  dictVi: boolean; // dictation: reveal the meaning once the line is complete
  autoBlock: number; // lines per auto-run block
  autoScore: boolean; // auto run also records + grades each line (costs a credit per line)
}
/** Lines per auto-run block — one breath of practice, adjustable in settings. */
const AUTO_MIN = 3;
const AUTO_MAX = 30;
// Cỡ chữ câu đang luyện (0 = như cũ). Bỏ S (nhỏ hơn mặc định thì chẳng ai chọn) và 3XL (một câu
// đã tràn màn hình). Đọc bằng KHOÁ MỚI `textSize`: chỉ số của thang cũ nay trỏ sang cỡ khác.
const LINE_SIZES = [
  { label: "M", cls: "text-lg leading-relaxed" },
  { label: "L", cls: "text-2xl leading-relaxed" },
  { label: "XL", cls: "text-3xl leading-relaxed" },
  { label: "2XL", cls: "text-4xl leading-relaxed" },
];
// 4 nấc cỡ chữ phụ đề (1 = như cũ). Xem trên TV/xa màn hình thì nấc 2-3 mới đọc nổi.
const SUB_SIZES = [
  { label: "S", en: "text-lg sm:text-xl", vi: "text-sm sm:text-base" },
  {
    label: "M",
    en: "text-xl sm:text-2xl lg:text-3xl",
    vi: "text-base sm:text-lg",
  },
  {
    label: "L",
    en: "text-2xl sm:text-3xl lg:text-4xl",
    vi: "text-lg sm:text-xl",
  },
  {
    label: "XL",
    en: "text-3xl sm:text-4xl lg:text-5xl",
    vi: "text-xl sm:text-2xl",
  },
];
const OPTS_KEY = "v-prac:opts";
function readOpts(): WatchOpts {
  try {
    const o = JSON.parse(
      localStorage.getItem(OPTS_KEY) || "{}",
    ) as Partial<WatchOpts>;
    const n = Number(o.subSize);
    const ln = Number(o.textSize);
    return {
      watch: !!o.watch,
      subEn: o.subEn !== false,
      subVi: o.subVi !== false,
      subSize: n >= 0 && n < SUB_SIZES.length ? n : 1,
      loop: !!o.loop,
      // While the MODEL plays, the highlight is always on — that is just the line being read to you.
      // This switch only covers the pass where the student records: some want the pacer, some want
      // to look up from the text and say it. Default on, so it is an opt-OUT.
      karaoke: o.karaoke !== false,
      lineVi: !!o.lineVi,
      textSize: ln >= 0 && ln < LINE_SIZES.length ? ln : 0,
      dictVi: !!o.dictVi,
      autoBlock: Math.min(AUTO_MAX, Math.max(AUTO_MIN, Number(o.autoBlock) || AUTO_BLOCK)),
      autoScore: !!o.autoScore,
    };
  } catch {
    return {
      watch: false, subEn: true, subVi: true, subSize: 1, loop: false,
      karaoke: true, lineVi: false, textSize: 0, dictVi: false, autoBlock: AUTO_BLOCK, autoScore: false,
    };
  }
}
function writeOpts(o: WatchOpts): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(o));
  } catch {
    /* riêng tư/hết chỗ */
  }
}

interface VideoDraft {
  cur: number;
  maxReached: number;
  inputs: Record<number, Record<number, string>>;
  /** Per line, then per blank (word index): levels paid for and letters shown. */
  hintLevel: Record<number, Record<number, WordHint>>;
  revealed: Record<number, boolean>;
  sentInput: Record<number, string>;
  sentChecked: Record<number, boolean>;
  at?: string; // last write, ISO — decides local vs server copy when both exist
}
/** Server copy of this video's drafts, one entry per `mode:level`. */
type VideoDraftBundle = Record<string, VideoDraft>;
const bundleKey = (mode: string, level: string) => `${mode}:${level}`;
const draftKey = (slug: string, mode: string, level: string) =>
  `v-prac:${slug}:${mode}:${level}`;
function readDraft(
  slug: string,
  mode: string,
  level: string,
): VideoDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(slug, mode, level));
    return raw ? (JSON.parse(raw) as VideoDraft) : null;
  } catch {
    return null;
  }
}
// Chỗ đang XEM lưu RIÊNG, không kèm mode/level: xem là xem cả bài, đổi mức luyện không có lý
// do gì làm mất chỗ đang xem dở.
const watchKey = (slug: string) => `v-prac:${slug}:watch`;
function readWatchAt(slug: string): number {
  const n = Number(localStorage.getItem(watchKey(slug)));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function writeDraft(
  slug: string,
  mode: string,
  level: string,
  d: VideoDraft,
): void {
  try {
    localStorage.setItem(draftKey(slug, mode, level), JSON.stringify(d));
  } catch {
    /* storage full or blocked → keep practising, only the saved position is lost */
  }
}

/** How much of a draft is filled in — only used for the "in progress" counter on the server row. */
function draftProgress(d: VideoDraft): number {
  return new Set([
    ...Object.keys(d.revealed ?? {}).filter((k) => d.revealed[Number(k)]),
    ...Object.keys(d.sentChecked ?? {}).filter((k) => d.sentChecked[Number(k)]),
    ...Object.keys(d.inputs ?? {}),
  ]).size;
}

const WAVE = Array.from({ length: 60 }, (_, i) => {
  const env = Math.sin((Math.PI * i) / 59);
  const detail = 0.3 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.55));
  return Math.max(5, Math.round(6 + env * 128 * detail));
});
const BARS = Array.from({ length: 58 }, (_, i) => {
  const detail = Math.abs(
    Math.sin(i * 1.3) * Math.cos(i * 0.55) + 0.3 * Math.sin(i * 0.4),
  );
  return Math.max(16, Math.round(18 + 70 * detail));
});
function barColor(t: number): string {
  const a = [6, 182, 212],
    b = [99, 102, 241];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// Dấu nháy cong (' ' ´ `) → thẳng: bàn phím/bộ gõ macOS hay chèn ' thay cho ' — không quy về một
// dạng thì "Anna's" gõ đúng vẫn báo sai.
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'")
    .replace(/[^a-z0-9']/g, "");
const nak = (s: string) => norm(s).replace(/'/g, ""); // so khớp KHÔNG bắt buộc dấu ' (I'm ≈ im)
// Xếp chữ đã gõ vào KHUNG của đáp án: dấu ' tự chèn (gõ "im" ra "i'm"), chữ THỪA tách riêng.
// Ô nhập KHÔNG chặn phím / không đếm ký tự — mọi gọt giũa làm ở đây, để bộ gõ tiếng Việt tự do
// soạn & xoá trong ô (chặn phím chính là lý do "xoá mãi không được").
function fitWord(word: string, raw: string): { text: string; over: string } {
  const core = norm(word);
  const ls = nak(raw).split("").filter(Boolean);
  let out = "",
    li = 0;
  for (const ch of core) {
    if (ch === "'") {
      if (li < ls.length) out += ch;
      else break;
    } else if (li < ls.length) out += ls[li++];
    else break;
  }
  return { text: out, over: ls.slice(li).join("") };
}
const wordOk = (word: string, raw: string) => {
  const f = fitWord(word, raw);
  return !f.over && f.text.length > 0 && nak(f.text) === nak(word);
};
const maskText = (s: string) =>
  splitWords(s)
    .map((w) => "•".repeat(Math.max(1, norm(w).length)))
    .join(" ");

// Độ khó = số TỪ khoét (client tự chọn — đáp án đã có sẵn). Easy 2 · Medium 4 · Hard khoét cả câu.
// Hardest = KHÔNG khoét sẵn: gõ CẢ CÂU vào 1 ô, không gợi ý/không số từ, bấm Check (Enter) để chấm.
type Level = "easy" | "medium" | "hard" | "hardest";
const LEVELS: { id: Level; label: string; hint: string; n: number }[] = [
  { id: "easy", label: "Easy", hint: "2 blanks", n: 2 },
  { id: "medium", label: "Medium", hint: "4 blanks", n: 4 },
  { id: "hard", label: "Hard", hint: "whole line", n: 99 },
  { id: "hardest", label: "Hardest", hint: "type it all", n: 99 },
];
// Ô khoét lấy từ `shared` — server tính điểm bằng ĐÚNG hàm này, lệch một chút là điểm sai.
const blanksFor = (text: string, level: Level): number[] => videoDictBlanks(text, level);

// Rungs in order of difficulty. `video_dictation_scores.level` holds the HARDEST rung a line was
// ever cleared at, so server progress may be restored whenever that rung is at least the one now in
// play: Easy blanks the 2 longest words, Medium 4, Hard/Hardest the whole sentence, and each rung's
// blanks contain the easier one's. A line typed out on Hard therefore covers Easy; never the reverse.
const LEVEL_RANK: Record<string, number> = { easy: 1, medium: 2, hard: 3, hardest: 4 };
// Shadowing tự động: mỗi chặng 10 câu rồi dừng lại nghỉ (bài 50+ câu chạy một mạch thì đuối).
const AUTO_BLOCK = 10; // số câu mỗi chặng, mặc định (đổi được trong cài đặt)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LEVEL_TONE: Record<Level, string> = {
  easy: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  hard: "text-rose-600 dark:text-rose-400",
  hardest: "text-fuchsia-600 dark:text-fuchsia-400",
};
// Gam nút thanh trên (Back/theme/video/switcher) — SOLID, đồng nhất mobile ↔ desktop.
const TOP_BTN =
  "inline-flex items-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
// Phím tắt: macOS hiện ⌘, còn lại Ctrl.
const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
const MOD = IS_MAC ? "⌘" : "Ctrl";

// Thang điểm 1 câu.
type Grade = "exactly" | "good" | "fair" | "revealed" | "weak" | "skipped";
const GRADE_UI: Record<
  Grade,
  { label: string; badge: string; bar: string; emoji: string; cheer: boolean }
> = {
  exactly: {
    label: "Exactly",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    bar: "bg-emerald-500",
    emoji: "🎉",
    cheer: true,
  },
  good: {
    label: "Good",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    bar: "bg-cyan-400",
    emoji: "👍",
    cheer: true,
  },
  fair: {
    label: "Fair",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    bar: "bg-amber-400",
    emoji: "🙂",
    cheer: true,
  },
  revealed: {
    label: "Revealed",
    badge: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    bar: "bg-rose-400",
    emoji: "",
    cheer: false,
  },
  weak: {
    label: "Weak",
    badge: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    bar: "bg-rose-400",
    emoji: "",
    cheer: false,
  },
  skipped: {
    label: "Skipped",
    badge: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
    bar: "bg-rose-300 dark:bg-rose-500/50",
    emoji: "",
    cheer: false,
  },
};

let _actx: AudioContext | null = null;
function playCheer(kind: "good" | "exactly") {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    _actx = _actx || new AC();
    const ctx = _actx;
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    const notes =
      kind === "exactly" ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 880];
    const gap = kind === "exactly" ? 0.075 : 0.11;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      const t = now + i * gap;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.38);
    });
  } catch {
    /* im lặng */
  }
}

const scoreColor = (s: number) =>
  s >= 80
    ? "text-emerald-600 dark:text-emerald-400"
    : s >= 60
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";
// Score badge: SOLID fill on the same thresholds as scoreColor. A badge showing a number has to
// follow the score scale — tinted by grade band, 79 came out cyan while every other 79 on screen
// reads amber.
const scoreBadge = (s: number) =>
  s >= 80
    ? "bg-emerald-600 text-white"
    : s >= 60
      ? "bg-amber-500 text-white"
      : "bg-rose-600 text-white";
const MODE_LABEL: Record<VideoMode, string> = {
  dictation: "Dictation",
  shadowing: "Shadowing",
};

type Seg = PublicVideoLesson["segments"][number];

export default function VideoPracticePage({
  api = videoLibraryApi,
  backTo = "/u/library",
  basePath = "/u/video",
  preview = false,
}: {
  /** Where the lesson and the progress writes go — defaults to the real learner endpoints. */
  api?: VideoApi;
  backTo?: string;
  /** Route prefix this lesson lives under — self-imported lessons sit at /u/video/mine. */
  basePath?: string;
  /** Teacher preview: no session summary, since those numbers belong to a learner. */
  preview?: boolean;
} = {}) {
  const { slug = "" } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { theme, toggle } = useTheme();
  const qMode = (
    sp.get("mode") === "shadowing" || sp.get("mode") === "dictation"
      ? sp.get("mode")
      : null
  ) as VideoMode | null;
  const qLevel = (
    ["easy", "medium", "hard", "hardest"].includes(sp.get("level") || "")
      ? sp.get("level")
      : null
  ) as Level | null;
  const ytRef = useRef<YouTubePlayerHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const playTimer = useRef<number | null>(null);
  const celebrated = useRef<Set<string>>(new Set());
  const cheerTimer = useRef<number | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const autoPlayRef = useRef(false); // đổi câu qua nút Prev/Next → tự phát ngay
  const recordedRef = useRef<Set<number>>(new Set());
  // Any graded line this visit? A video lesson has no single "submit", so the library is
  // refreshed once on the way out instead of after every one of its 100-300 sentences.
  const progressedRef = useRef(false);
  const refreshLearning = useLearningRefresh();


  // Leaving the lesson: refresh the library once if anything was graded. Doing it per line would
  // fire hundreds of refetches; doing it never left the card stuck on its old segment count.
  useEffect(
    () => () => {
      if (progressedRef.current) refreshLearning();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [lesson, setLesson] = useState<PublicVideoLesson | null>(null);
  const [mode, setMode] = useState<VideoMode>(qMode ?? "dictation");
  const [level, setLevel] = useState<Level>(qLevel ?? "medium"); // chọn ở thư viện (query), đổi được ngay tại đây
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playedSet, setPlayedSet] = useState<Record<number, boolean>>({});
  const [maxReached, setMaxReached] = useState(0);
  const [celebrate, setCelebrate] = useState<Grade | null>(null);
  const [vol, setVol] = useState(90);
  const [rate, setRate] = useState(1);
  const [videoOff, setVideoOff] = useState(false); // bài video: tắt hình → chỉ nghe audio (giao diện sóng)
  // CHẾ ĐỘ XEM: không gõ gì, chạy liền một mạch, đọc phụ đề + bản dịch. Dùng để xem trước bài
  // hoặc nghe lại cho vào tai sau khi luyện. Nhớ theo máy (localStorage) vì đây là thói quen học.
  const [opts, setOpts] = useState<WatchOpts>(() => readOpts());
  const { watch, subEn, subVi, subSize, loop, karaoke, lineVi, textSize, dictVi, autoBlock, autoScore } = opts;
  const setOpt = (k: keyof WatchOpts, v: boolean | number) =>
    setOpts((o) => {
      const n = { ...o, [k]: v };
      writeOpts(n);
      return n;
    });
  const watchRef = useRef(watch);
  watchRef.current = watch;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [watchT, setWatchT] = useState(0); // mốc thời gian đang phát (chế độ xem) — cho thanh tua
  const [barOn, setBarOn] = useState(true); // thanh tua đè video: tự ẩn khi đang xem, chạm/rê chuột thì hiện
  const barTimer = useRef<number | null>(null);
  const loopRef = useRef(false); // công tắc "lặp lại câu"
  const doneCurRef = useRef(false); // câu hiện tại đã xong chưa (đọc trong timer)
  const repeatRef = useRef(0); // số lần đã lặp câu này — chặn phát vô tận nếu học sinh rời máy
  const listBoxRef = useRef<HTMLDivElement>(null); // khung cuộn của panel transcript
  const activeRef = useRef<HTMLButtonElement>(null); // thẻ câu đang phát/đang làm
  const draggingRef = useRef(false); // đang kéo thanh tua → đồng hồ phát không được ghi đè

  const [inputs, setInputs] = useState<Record<number, Record<number, string>>>(
    {},
  );
  const [hintLevel, setHintLevel] = useState<Record<number, Record<number, WordHint>>>({});
  // Hint levels the server already holds for lines restored from `dict_done` (summed per line).
  const [restoredHints, setRestoredHints] = useState<Record<number, number>>({});
  // The blank the caret is in — the word a hint or a word reveal applies to.
  const [focusWi, setFocusWi] = useState<number | null>(null);
  const [showVi, setShowVi] = useState(false); // bản dịch ở transcript — mặc định TẮT (đang luyện nghe)
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [shadow, setShadow] = useState<
    Record<number, VideoShadowResult | "loading">
  >({});
  // Blob URL of the take just recorded for each segment, so the student can play their own voice
  // back next to the score. Client-side only — shadowing takes are never uploaded to R2.
  const [takeUrl, setTakeUrl] = useState<Record<number, string>>({});
  // Mic opens by itself only on an explicit action (the R hotkey, or Retry) — never on its own.
  const [armed, setArmed] = useState(false);
  // Bumped on every re-arm → remounts AudioRecorder (see recordShadow).
  const [takeNo, setTakeNo] = useState(0);
  // Segment whose take came out silent → warn instead of spending a grading credit on it.
  const [silentSeg, setSilentSeg] = useState<number | null>(null);
  const silentBlob = useRef<Blob | null>(null);
  // Karaoke: seconds into the current line, or null when nothing is running. Fed by the media clock
  // while the model plays, and by a local clock while the student records (same word timings, so the
  // highlight paces them at the model's speed).
  const [karaokeAt, setKaraokeAt] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const recStart = useRef<number | null>(null);
  const recOn = useRef(false);
  // Stamped only when recording actually starts or stops. AudioRecorder reports its state from an
  // effect keyed on the callback identity, so an inline handler re-fires on EVERY parent render —
  // and the karaoke ticker re-renders the parent 16 times a second, which reset the clock each time
  // and pinned the highlight to the first word.
  const onRecordingChange = useCallback((on: boolean) => {
    if (recOn.current === on) return;
    recOn.current = on;
    recStart.current = on ? performance.now() : null;
    setRecording(on);
  }, []);
  const [sentInput, setSentInput] = useState<Record<number, string>>({}); // Hardest: whole sentence typed
  const [sentChecked, setSentChecked] = useState<Record<number, boolean>>({}); // Hardest: Check already pressed

  // ── Outbox for the per-line dictation writes ────────────────────────────────
  // These writes fire the instant a line is right — the earliest possible moment, and deliberately
  // NOT batched at "next line" or at the end: a lesson has no submit step, so anything held back is
  // simply lost when the tab closes. What was missing is what happens when ONE of them fails: the
  // call was fire-and-forget, so a dropped connection lost that line with no sign of it.
  // Keyed per line, so retrying can never double-count and a line queued twice only sends once.
  const outboxRef = useRef(new Map<string, () => Promise<unknown>>());
  const [unsaved, setUnsaved] = useState(0);
  const retryTimer = useRef<number | null>(null);
  const retryStep = useRef(0);
  /** Backoff between flushes: quick at first (a blip), then patient (a real outage). */
  const RETRY_DELAYS = [3000, 8000, 20000, 45000, 60000];

  const flushOutbox = useCallback(async () => {
    retryTimer.current = null;
    for (const [key, run] of [...outboxRef.current]) {
      try {
        await run();
        outboxRef.current.delete(key);
      } catch {
        break; // still down — stop hammering, the next flush picks up where this left off
      }
    }
    setUnsaved(outboxRef.current.size);
    if (outboxRef.current.size) {
      retryStep.current = Math.min(retryStep.current + 1, RETRY_DELAYS.length - 1);
      retryTimer.current = window.setTimeout(() => void flushOutbox(), RETRY_DELAYS[retryStep.current]);
    } else {
      retryStep.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Send a progress write; on failure park it in the outbox and keep retrying. */
  const queueSave = useCallback(
    (key: string, run: () => Promise<unknown>) => {
      // Teacher preview has no progress to write — its adapter rejects on purpose, so queueing
      // would retry forever and show the learner-facing "not saved" banner to a teacher.
      if (preview) return;
      run().catch(() => {
        outboxRef.current.set(key, run);
        setUnsaved(outboxRef.current.size);
        if (retryTimer.current == null) {
          retryTimer.current = window.setTimeout(() => void flushOutbox(), RETRY_DELAYS[retryStep.current]);
        }
      });
    },
    [flushOutbox, preview],
  );

  // Coming back online is the one signal worth more than any timer.
  useEffect(() => {
    const onOnline = () => {
      retryStep.current = 0;
      void flushOutbox();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [flushOutbox]);

  // Shadowing TỰ ĐỘNG: chạy liên tiếp phát-câu → khoảng lặng để nói theo → câu kế, theo CHẶNG 10 câu.
  const [autoOn, setAutoOn] = useState(false);
  const [autoPhase, setAutoPhase] = useState<"listen" | "repeat" | null>(null);
  const [autoEnd, setAutoEnd] = useState<number | null>(null); // câu cuối của chặng đang chạy
  // Chặng vừa chạy xong — để hiện tổng kết. Giữ lại sau khi dừng, xoá khi bắt đầu chặng mới.
  const [autoDone, setAutoDone] = useState<{ from: number; to: number } | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const autoStopRef = useRef(false);

  const isAudio = lesson?.media_source === "audio";
  const stageUI = isAudio || videoOff; // waveform stage (no video frame)

  // Many YouTube videos carry burned-in subtitles, which hand the dictation answer over for free.
  // Point at the video toggle for a few seconds when a dictation session opens on a video lesson.
  const [subHint, setSubHint] = useState(false);
  const subHintShown = useRef(false);
  useEffect(() => {
    if (subHintShown.current || !lesson || isAudio || mode !== "dictation" || videoOff) return;
    subHintShown.current = true;
    setSubHint(true);
    const t = setTimeout(() => setSubHint(false), 6500);
    return () => clearTimeout(t);
  }, [lesson, isAudio, mode, videoOff]);

  // ── Synced copy of the drafts of this video (one entry per mode:level) ──
  // The browser copy above stays the instant one; this row is what makes phone → laptop continue
  // the same lesson. Pushed debounced so typing does not turn into one request per keystroke.
  const bundle = useRef<VideoDraftBundle>({});
  const bundleLoaded = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullBundle = async () => {
    if (bundleLoaded.current) return;
    bundleLoaded.current = true;
    const d = await accountApi.draftGet<VideoDraftBundle>("video", slug).then((r) => r.draft).catch(() => null);
    if (d?.state) bundle.current = d.state;
  };
  const pushBundle = (m: string, lv: string, d: VideoDraft) => {
    bundle.current = { ...bundle.current, [bundleKey(m, lv)]: d };
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      accountApi
        .draftPut("video", slug, { state: bundle.current, answered: draftProgress(d), total: 0 })
        .catch(() => {});
    }, 2000);
  };
  useEffect(() => () => { if (pushTimer.current) clearTimeout(pushTimer.current); }, []);

  const loadLesson = (m: VideoMode, lv: Level = level) =>
    Promise.all([api.lesson(slug, m), pullBundle()]).then(([l]) => {
      setLesson(l);
      setMode(l.mode);
      setInputs({});
      setHintLevel({});
      setRestoredHints({});
      setRevealed({});
      // Takes already graded on the server (best per segment) → a reload lands back on the marked-up
      // line instead of an empty recorder. `overall`/`quota` are per-request, so they stay absent.
      setShadow(
        Object.fromEntries(
          (l.shadow_done ?? []).map((r) => [r.segment, { segment: r.segment, ...r.detail }]),
        ),
      );
      setSentInput({});
      setSentChecked({});
      setCur(0);
      setPlaying(false);
      setPlayedSet({});
      setMaxReached(0);
      celebrated.current = new Set();
      recordedRef.current = new Set();
      // A lesson runs to hundreds of lines, so it must reopen exactly where the learner stopped —
      // taking whichever copy is newer, this browser's or the synced one from another device.
      const local = readDraft(slug, l.mode, lv);
      const remote = bundle.current[bundleKey(l.mode, lv)] ?? null;
      const d = !remote ? local : !local ? remote : (local.at ?? "") >= (remote.at ?? "") ? local : remote;
      // Lines this browser believes are finished — needed after the merge below to spot the ones
      // the server never received (the tab was closed before a failed write could be retried).
      let draftFinished = new Set<number>();
      if (d) {
        setInputs(d.inputs ?? {});
        setRevealed(d.revealed ?? {});
        setSentInput(d.sentInput ?? {});
        setSentChecked(d.sentChecked ?? {});
        // A draft saved before hints were per word holds one number per line: drop it.
        setHintLevel(
          Object.fromEntries(
            Object.entries(d.hintLevel ?? {}).map(([k, v]) => [k, typeof v === "number" ? {} : v]),
          ) as Record<number, Record<number, WordHint>>,
        );
        setCur(
          Math.min(d.cur ?? 0, Math.max(0, (l.segments?.length ?? 1) - 1)),
        );
        setMaxReached(d.maxReached ?? 0);
        // Câu ĐÃ XONG ở lượt trước coi như đã ghi nhận với server — nếu không, hydrate xong
        // hiệu ứng "gõ đúng" bắn lại và cộng thêm một lượt thử ma.
        const finished = new Set<number>();
        for (const sg of l.segments ?? []) {
          if (d.revealed?.[sg.i]) {
            finished.add(sg.i);
            continue;
          }
          if (lv === "hardest") {
            if (d.sentChecked?.[sg.i]) finished.add(sg.i);
            continue;
          }
          const words = splitWords(sg.text || "");
          const bl = sg.text ? blanksFor(sg.text, lv) : [];
          if (
            bl.length &&
            bl.every(
              (wi) =>
                norm(d.inputs?.[sg.i]?.[wi] ?? "") === norm(words[wi] ?? ""),
            )
          )
            finished.add(sg.i);
        }
        recordedRef.current = finished;
        draftFinished = finished;
      }
      // Lines cleared on ANOTHER device (or before the cache was wiped). The draft above only ever
      // covered this browser, which left dictation looking untouched everywhere else — while the
      // server had every line. Same shape as `shadow_done` below, so the two modes now resume alike.
      if (l.mode === "dictation") {
        const rung = LEVEL_RANK[lv] ?? 0;
        const segById = new Map((l.segments ?? []).map((s) => [s.i, s]));
        const words: Record<number, Record<number, string>> = {};
        const sentences: Record<number, string> = {};
        const checked: Record<number, boolean> = {};
        const shown: Record<number, boolean> = {};
        const hints: Record<number, number> = {};
        for (const row of l.dict_done ?? []) {
          if ((LEVEL_RANK[row.level ?? ""] ?? 0) < rung) continue; // cleared on an easier rung only
          if (recordedRef.current.has(row.segment)) continue; // the local draft already has it
          const sg = segById.get(row.segment);
          if (!sg?.text) continue;
          recordedRef.current.add(row.segment);
          if (row.revealed) shown[row.segment] = true;
          if (row.hints > 0) hints[row.segment] = row.hints;
          if (lv === "hardest") {
            sentences[row.segment] = sg.text;
            checked[row.segment] = true;
          } else {
            const all = splitWords(sg.text);
            words[row.segment] = Object.fromEntries(blanksFor(sg.text, lv).map((wi) => [wi, all[wi] ?? ""]));
          }
        }
        // Server underneath, local draft on top: whatever is half-typed right now must not jump.
        setInputs((v) => ({ ...words, ...v }));
        setSentInput((v) => ({ ...sentences, ...v }));
        setSentChecked((v) => ({ ...checked, ...v }));
        setRevealed((v) => ({ ...shown, ...v }));
        setRestoredHints((v) => ({ ...hints, ...v }));
        // Lines this browser finished that the server never got: a write that failed while the tab
        // was open would have been retried, but one that failed just before the tab closed is only
        // recoverable here. Re-sending is safe — the row is keyed (user, exercise, segment) and
        // `level` only ever moves up, so a duplicate cannot take points back.
        const onServer = new Set(
          (l.dict_done ?? []).filter((r) => (LEVEL_RANK[r.level ?? ""] ?? 0) >= rung).map((r) => r.segment),
        );
        for (const i of draftFinished) {
          if (onServer.has(i)) continue;
          const sg = segById.get(i);
          if (!sg?.text) continue;
          const all = splitWords(sg.text);
          const ans = {
            sentence: all.join(" "),
            blanks: (sg.blanks?.length ? sg.blanks : []).map((wi) => all[wi]),
          };
          queueSave(`check:${i}`, () => api.check(slug, i, ans, lv));
        }
        // No local draft (a fresh device) → resume past the furthest line done, like shadowing.
        if (!d) {
          const list = l.segments ?? [];
          let last = -1;
          for (let i = 0; i < list.length; i++) if (recordedRef.current.has(list[i].i)) last = i;
          if (last >= 0) {
            setCur(Math.min(last + 1, list.length - 1));
            setMaxReached(Math.min(last + 1, list.length - 1));
          }
        }
      }
      // Shadowing keeps no local draft (the takes live on the server), so resume at the first line
      // without a score — otherwise a reload throws the learner back to line 1 of a 200-line lesson.
      // Resume AFTER the furthest line already graded, not at the first ungraded one: people skip
      // lines, so "first ungraded" is usually line 1 and the resume silently does nothing.
      if (l.mode === "shadowing") {
        const done = new Set((l.shadow_done ?? []).map((r) => r.segment));
        const list = l.segments ?? [];
        let last = -1;
        for (let i = 0; i < list.length; i++) if (done.has(list[i].i)) last = i;
        if (last >= 0) setCur(Math.min(last + 1, list.length - 1));
      }
      if (optsRef.current.watch) {
        const at = readWatchAt(slug);
        if (at)
          setCur(Math.min(at, Math.max(0, (l.segments?.length ?? 1) - 1)));
      }
      return l;
    });

  // Save on every real change (skipped until the lesson finished loading).
  useEffect(() => {
    if (!lesson) return;
    const d: VideoDraft = {
      cur,
      maxReached,
      inputs,
      hintLevel,
      revealed,
      sentInput,
      sentChecked,
      at: new Date().toISOString(),
    };
    writeDraft(slug, mode, level, d);
    pushBundle(mode, level, d);
    if (watch) {
      try {
        localStorage.setItem(watchKey(slug), String(cur));
      } catch {
        /* riêng tư/hết chỗ */
      }
    }
  }, [
    slug,
    mode,
    level,
    lesson,
    cur,
    maxReached,
    inputs,
    hintLevel,
    revealed,
    sentInput,
    sentChecked,
    watch,
  ]);
  useEffect(() => {
    setLoading(true);
    setErr(null);
    loadLesson(qMode ?? "dictation")
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const segs = lesson?.segments ?? [];
  const seg = segs[cur];

  // Karaoke ticker: 60ms is smooth enough for a word-level highlight and costs nothing.
  useEffect(() => {
    // Playback always sweeps; recording sweeps only if the student kept the pacer on.
    if (mode !== "shadowing" || !seg?.words?.length || (!playing && !recording) || (recording && !karaoke)) {
      setKaraokeAt(null);
      return;
    }
    const tick = () => {
      if (recording && recStart.current != null) {
        setKaraokeAt((performance.now() - recStart.current) / 1000);
      } else if (playing) {
        const t = isAudio ? audioRef.current?.currentTime ?? 0 : ytRef.current?.getTime() ?? 0;
        setKaraokeAt(t - seg.start);
      }
    };
    tick();
    const id = window.setInterval(tick, 60);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karaoke, mode, cur, playing, recording, isAudio, seg?.start]);

  const wordsOf = (sg: Seg) => splitWords(sg.text || "");
  // Hardest: KHÔNG khoét sẵn (1 ô cả câu) → blanksOf rỗng.
  const blanksOf = (sg: Seg) =>
    mode === "dictation" && sg.text && level !== "hardest"
      ? blanksFor(sg.text, level)
      : [];
  // So khớp BỎ QUA dấu nháy: ô tự chèn ' giúp em, nhưng bộ gõ nào chèn thiếu/thừa thì cũng
  // không được kẹt ở "Anna's" — chữ gõ đúng là tính đúng.
  // A number may also be typed spelled out ("twenty twenty-four" for "2024").
  const altOk = (sg: Seg, wi: number, raw: string) => altMatches(sg.alts?.[wi], raw);
  const okWord = (sg: Seg, wi: number) =>
    wordOk(wordsOf(sg)[wi] ?? "", inputs[sg.i]?.[wi] ?? "") || altOk(sg, wi, inputs[sg.i]?.[wi] ?? "");
  const perWordOk = (sg: Seg) =>
    !!sg.text &&
    blanksOf(sg).length > 0 &&
    blanksOf(sg).every((wi) => okWord(sg, wi));
  // Hardest: gõ đúng CẢ CÂU (theo từng từ, bỏ dấu câu + KHÔNG bắt buộc dấu ' → gõ "im" nhận cho "I'm").
  const hardestOk = (sg: Seg) => {
    const a = wordsOf(sg);
    if (!a.some((w) => nak(w))) return false;
    return matchWithAlts(a, splitWords(sentInput[sg.i] || ""), sg.alts, (w, t) => nak(w) === nak(t));
  };
  const dictDone = (sg: Seg) =>
    !!revealed[sg.i] ||
    (level === "hardest"
      ? !!sentChecked[sg.i] && hardestOk(sg)
      : perWordOk(sg));
  const isDone = (sg: Seg) =>
    mode === "shadowing"
      ? !!shadow[sg.i] && shadow[sg.i] !== "loading"
      : dictDone(sg);
  const doneCur = seg ? isDone(seg) : false;
  loopRef.current = loop && mode === "dictation" && !watch;
  doneCurRef.current = doneCur;
  // Gõ xong câu thì cắt luôn lần phát lại đang chờ (không thì câu sau vừa hiện đã bị đè tiếng).
  useEffect(() => {
    if (doneCur && playTimer.current) {
      clearTimeout(playTimer.current);
      playTimer.current = null;
    }
  }, [doneCur]);

  // Hint levels opened across a line, summed over its words (falls back to the server's count).
  const lineHints = (sg: Seg) =>
    Object.values(hintLevel[sg.i] ?? {}).reduce((a, b) => a + b.n, 0) || (restoredHints[sg.i] ?? 0);
  // Điểm 1 câu (client) — dùng cho badge · thanh tiến độ · khen.
  const gradeOf = (sg: Seg, atIndex: number): Grade | null => {
    if (mode === "shadowing") {
      const r = shadow[sg.i];
      if (r && r !== "loading")
        return r.score >= 90
          ? "exactly"
          : r.score >= 75
            ? "good"
            : r.score >= 60
              ? "fair"
              : "weak";
      return atIndex < maxReached ? "skipped" : null;
    }
    if (revealed[sg.i]) return "revealed";
    if (level === "hardest")
      return sentChecked[sg.i] && hardestOk(sg)
        ? "exactly"
        : atIndex < maxReached
          ? "skipped"
          : null;
    if (perWordOk(sg)) return dictationHintGrade(lineHints(sg));
    return atIndex < maxReached ? "skipped" : null;
  };

  useEffect(() => {
    if (isAudio) {
      if (audioRef.current) audioRef.current.volume = vol / 100;
    } else {
      ytRef.current?.setVolume(vol);
      ytRef.current?.setPlaybackRate(rate);
    }
  }, [vol, rate, isAudio, lesson]);

  useEffect(() => {
    setMaxReached((m) => Math.max(m, cur));
    repeatRef.current = 0;
    if (autoPlayRef.current) {
      autoPlayRef.current = false;
      playAt(cur);
    } // Prev/Next → phát luôn
    // Lúc luyện, đổi câu = dừng phát. Ở chế độ XEM thì câu tự đổi theo đồng hồ trong khi media
    // vẫn chạy — tắt cờ ở đây là nút Play/Pause chết ngay sau câu đầu tiên.
    else if (!watchRef.current) setPlaying(false);
    return () => {
      if (playTimer.current) clearTimeout(playTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  useEffect(
    () => () => {
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  // Sang câu Dictation → focus ô nhập (ô trống đầu · hoặc ô cả-câu ở Hardest).
  useEffect(() => {
    if (mode !== "dictation" || !seg) return;
    // The hint target belongs to the line it was picked on.
    setFocusWi(null);
    const t = setTimeout(() => {
      const first =
        level === "hardest" ? 0 : blanksOf(seg).find((wi) => !okWord(seg, wi));
      if (first != null) inputRefs.current[first]?.focus();
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, mode, level, lesson]);

  // Dictation (KHÔNG phải Hardest) XONG do gõ đúng → ghi server + khen + TỰ sang câu sau ~1.5s.
  // Hardest chờ bấm Check (checkHardest) nên bỏ qua ở đây.
  useEffect(() => {
    if (mode !== "dictation" || level === "hardest" || !seg) return;
    if (!perWordOk(seg) || revealed[seg.i] || recordedRef.current.has(seg.i))
      return;
    recordedRef.current.add(seg.i);
    progressedRef.current = true;
    const wds = wordsOf(seg);
    const ans = {
      sentence: wds.join(" "),
      blanks: (seg.blanks?.length ? seg.blanks : []).map((wi) => wds[wi]),
    };
    queueSave(`check:${seg.i}`, () => api.check(slug, seg.i, ans, level));
    const g = gradeOf(seg, cur) ?? "exactly";
    celebrateGrade(g);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => nextUndone(), advanceDelay());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, cur, mode, lesson]);

  // Transcript BÁM ĐỘ KHÓ: chỉ che đúng những từ đang bị khoét ở mức đang chơi (Easy 2 · Medium 4 ·
  // Hard/Hardest cả câu), từ đã gõ đúng thì hiện lại. Trước đây che sạch mọi mức nên panel vô dụng.
  const maskLine = (sg: Seg, _i: number) => {
    if (level === "hardest") return maskText(sg.text || "");
    const hide = new Set(blanksOf(sg));
    return splitWords(sg.text || "")
      .map((w, wi) =>
        hide.has(wi) && !okWord(sg, wi)
          ? "•".repeat(Math.max(1, norm(w).length))
          : w,
      )
      .join(" ");
  };

  const hasVi = segs.some((s) => !!s.vi);
  const stats = useMemo(
    () => ({
      total: segs.length,
      done: segs.filter((s) => isDone(s)).length,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
    [segs, inputs, revealed, shadow, sentInput, sentChecked, mode, level],
  );

  const celebrateGrade = (g: Grade) => {
    if (!GRADE_UI[g].cheer) return;
    const key = `${mode}:${seg?.i}`;
    if (celebrated.current.has(key)) return;
    celebrated.current.add(key);
    playCheer(g === "exactly" ? "exactly" : "good");
    setCelebrate(g);
    if (cheerTimer.current) clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCelebrate(null), 1600);
  };

  // Phát đoạn theo CHỈ SỐ (dùng cho play hiện tại + prev/next tự phát).
  const playAt = (i: number) => {
    const s = segs[i];
    if (!s) return;
    // CHẾ ĐỘ XEM: seek MỘT lần rồi để media chạy thẳng. Trước đây mỗi câu lại seek + hẹn giờ
    // dừng, nên cứ hết câu là khựng một nhịp — đúng cảm giác giật cục. Câu hiện tại giờ bám
    // theo đồng hồ phát (effect bên dưới), không ai điều khiển media nữa.
    if (watchRef.current) {
      if (playTimer.current) clearTimeout(playTimer.current);
      // Đang dừng giữa câu thì phát TIẾP từ đó, không quay về đầu câu (đang xem chứ không luyện).
      const from = watchT > s.start && watchT < s.end ? watchT : s.start;
      if (isAudio) {
        const a = audioRef.current;
        if (a) {
          a.playbackRate = rate;
          try {
            a.currentTime = from;
          } catch {
            /* chưa nạp */
          }
          void a.play();
        }
      } else {
        ytRef.current?.playFrom(from);
      }
      setPlaying(true);
      return;
    }
    const durMs = (Math.max(0.4, s.end - s.start) / rate) * 1000;
    if (isAudio) {
      const a = audioRef.current;
      if (a) {
        a.playbackRate = rate;
        try {
          // Already parked on this line (auto shadowing just paused for the student) → resume in
          // place; re-seeking re-buffers and clips the first syllable.
          if (Math.abs(a.currentTime - s.start) > 0.35) a.currentTime = s.start;
        } catch {
          /* chưa nạp */
        }
        void a.play();
      }
    } else {
      ytRef.current?.playSegment(s.start, s.end);
    }
    setPlaying(true);
    if (playTimer.current) clearTimeout(playTimer.current);
    playTimer.current = window.setTimeout(() => {
      setPlayedSet((p) => ({ ...p, [i]: true }));
      setPlaying(false);
      // Lặp câu: nghỉ một nhịp rồi phát lại, tới khi gõ xong. Có TRẦN 10 lần phòng khi học sinh
      // rời máy giữa chừng — phát vô tận thì vừa ồn vừa tốn.
      if (loopRef.current && !doneCurRef.current && repeatRef.current < 10) {
        repeatRef.current++;
        playTimer.current = window.setTimeout(() => playAt(i), 1400);
      }
    }, durMs);
  };
  const play = () => playAt(cur);
  const pause = () => {
    if (isAudio) audioRef.current?.pause();
    else ytRef.current?.pause();
    setPlaying(false);
    if (playTimer.current) clearTimeout(playTimer.current);
  };
  const onAudioTime = () => {
    const a = audioRef.current;
    if (watch) return; // xem liền mạch → không chặn ở cuối câu
    if (a && seg && a.currentTime >= seg.end) a.pause();
  };

  // Thanh tua che mất chân khung hình → đang phát thì ẩn sau ~2,5s, hễ rê chuột/chạm là hiện lại.
  // Dừng phát thì hiện luôn (đang tìm chỗ tua chứ không phải đang xem).
  const pokeBar = () => {
    setBarOn(true);
    if (barTimer.current) clearTimeout(barTimer.current);
    barTimer.current = window.setTimeout(() => setBarOn(false), 2500);
  };
  useEffect(() => {
    if (barTimer.current) clearTimeout(barTimer.current);
    if (!watch || !playing) {
      setBarOn(true);
      return;
    }
    barTimer.current = window.setTimeout(() => setBarOn(false), 2500);
    return () => {
      if (barTimer.current) clearTimeout(barTimer.current);
    };
  }, [watch, playing, cur]);

  // Panel mở thì thẻ câu đang chạy phải tự vào tầm mắt. Chế độ XEM cuộn kiểu khung chat: câu
  // đang phát nằm dưới đáy, câu cũ trôi lên. Lúc luyện chỉ cuộn khi câu bị khuất (đang gõ mà
  // khung nhảy thì rối).
  const listWasOpen = useRef(false);
  useEffect(() => {
    const box = listBoxRef.current,
      el = activeRef.current;
    if (!listOpen || !box || !el) {
      listWasOpen.current = listOpen;
      return;
    }
    const justOpened = !listWasOpen.current;
    listWasOpen.current = true;
    // Wait a frame: the panel slides in, and a scroll issued while it is still laying out is lost.
    // Just opened → jump straight there (a 170-line list animating past is motion sickness, not
    // feedback) and centre unconditionally, so the panel always opens on the line being practised.
    const id = requestAnimationFrame(() => {
      const top = el.offsetTop,
        bottom = top + el.offsetHeight;
      const behavior: ScrollBehavior = justOpened ? "auto" : "smooth";
      if (watch) box.scrollTo({ top: bottom - box.clientHeight + 12, behavior });
      else if (justOpened || top < box.scrollTop || bottom > box.scrollTop + box.clientHeight)
        box.scrollTo({
          top: top - box.clientHeight / 2 + el.offsetHeight / 2,
          behavior,
        });
    });
    return () => cancelAnimationFrame(id);
  }, [cur, listOpen, watch]);

  // Kéo thanh tua → nhảy tới mốc đó và phát tiếp (chỉ có ở chế độ xem).
  const seekWatch = (t: number) => {
    setWatchT(t);
    let n = 0;
    while (n + 1 < segs.length && t >= segs[n + 1].start) n++;
    setCur(n);
    if (isAudio) {
      const a = audioRef.current;
      if (a) {
        try {
          a.currentTime = t;
        } catch {
          /* chưa nạp */
        }
        void a.play();
      }
    } else {
      ytRef.current?.playFrom(t);
    }
    setPlaying(true);
  };

  // Chế độ xem: câu hiện tại BÁM theo đồng hồ phát, không ai seek giữa chừng.
  useEffect(() => {
    if (!watch || !playing || !segs.length) return;
    const id = window.setInterval(() => {
      if (draggingRef.current) return;
      const t = isAudio
        ? (audioRef.current?.currentTime ?? 0)
        : (ytRef.current?.getTime() ?? 0);
      setWatchT(t);
      const last = segs[segs.length - 1];
      if (last && t >= last.end + 0.5) {
        pause();
        return;
      } // hết câu cuối thì dừng, đừng chạy sang outro
      setCur((c) => {
        // Vài frame đầu sau seek, đồng hồ còn kẹt ở chỗ cũ → bỏ qua, không thì nhảy câu bậy.
        if (t < (segs[c]?.start ?? 0) - 0.5) return c;
        let n = c;
        while (n + 1 < segs.length && t >= segs[n + 1].start) n++;
        return n;
      });
    }, 250);
    return () => clearInterval(id);
  }, [watch, playing, isAudio, segs]);

  const goTo = (i: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setArmed(false); // a new line arms itself only after its model has played
    setCur(i);
  };
  /**
   * Shadowing, the R key and the Retry button: start recording this line. Drops the take already on
   * screen first, if any. Never fires by itself — hearing the model does not open the mic.
   */
  /**
   * Throw away a take that was rejected as silent and hand back a fresh, IDLE recorder — the mic
   * stays shut. Opening it straight away would catch the learner mid-thought: they came here to
   * check the microphone, not to speak.
   */
  const discardTake = (segIdx: number) => {
    setSilentSeg(null);
    setArmed(false);
    silentBlob.current = null;
    setTake(segIdx, null);
    setTakeNo((n) => n + 1);
  };

  const recordShadow = () => {
    if (!seg || mode !== "shadowing" || shadow[seg.i] === "loading") return;
    if (shadow[seg.i]) void submitShadow(seg.i, null);
    setSilentSeg(null);
    setArmed(true);
    // Force a fresh recorder. After a take it parks in status "done" and renders NOTHING — normally
    // harmless because the result view replaces it, but a take rejected as silent leaves the
    // recorder mounted, so the mic button simply vanished and re-arming could not bring it back.
    setTakeNo((n) => n + 1);
  };
  // Prev/Next từ NÚT → tự phát ngay (click là thao tác người dùng nên trình duyệt cho phép autoplay).
  const goPlay = (i: number) => {
    autoPlayRef.current = true;
    goTo(i);
  };
  const prevPlay = () => cur > 0 && goPlay(cur - 1);
  // Strictly the NEXT line, done or not. "Next" has to mean 34 after 33 — skipping over lines
  // already graded makes reviewing your own scores impossible.
  const nextPlay = () => cur < segs.length - 1 && goPlay(cur + 1);
  // Jump to the next line NOT yet done, autoplaying it. Used where the machine advances on its own
  // (a dictation line typed correctly) — landing on a line already filled in would just stall.
  // The Next BUTTON does not go through here: see nextPlay.
  const nextUndone = () => {
    const from = cur + 1;
    const idx = segs.findIndex((s, i) => i >= from && !isDone(s));
    const to = idx === -1 ? Math.min(cur + 1, segs.length - 1) : idx;
    if (to !== cur) autoPlayRef.current = true;
    goTo(to);
  };

  // Phím tắt: Mod+← Prev · Mod+→ Next · Space Play/Pause (khi KHÔNG đang gõ). Bind 1 lần, đọc handler mới nhất qua ref.
  const kbRef = useRef({ prevPlay, nextPlay, play, pause, playing, nextUndone, recordShadow, scored: false });
  kbRef.current = {
    prevPlay,
    nextPlay,
    play,
    pause,
    playing,
    nextUndone,
    recordShadow,
    // A graded shadowing line is on screen → Enter (next) belongs to it.
    scored: mode === "shadowing" && !!seg && !!shadow[seg.i] && shadow[seg.i] !== "loading",
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = kbRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      // R = record this line (bare key: Ctrl+R is reload and stays reload). Enter = next line.
      if (!typing && !mod && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        h.recordShadow();
        return;
      }
      if (h.scored && !typing && e.key === "Enter" && !mod) {
        e.preventDefault();
        h.nextPlay();
        return;
      }
      if (!mod) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        h.prevPlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        h.nextPlay();
      } else if (e.key === " ") {
        e.preventDefault();
        h.playing ? h.pause() : h.play();
      } // Ctrl/⌘+Space (không nuốt phím cách khi gõ)
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onType = (wi: number, val: string) => {
    if (!seg) return;
    // A spelled-out number turns into the line's own spelling, so the cell shows what was accepted.
    const alt = altOk(seg, wi, val);
    const next = alt ? wordsOf(seg)[wi] ?? val : val;
    setInputs((p) => ({ ...p, [seg.i]: { ...(p[seg.i] ?? {}), [wi]: next } }));
    if (alt || wordOk(wordsOf(seg)[wi] ?? "", val)) {
      const nb = blanksOf(seg).find((b) => b > wi && !okWord(seg, b));
      if (nb != null) setTimeout(() => inputRefs.current[nb]?.focus(), 0);
    }
  };
  const onEnter = (wi: number) => {
    if (!seg) return;
    if (isDone(seg)) return nextUndone();
    const nb = blanksOf(seg).find((b) => b !== wi && !okWord(seg, b));
    if (nb != null) inputRefs.current[nb]?.focus();
  };
  /** Step to the blank before/after `wi`; a no-op at either end of the sentence. */
  const stepBlank = (wi: number, dir: -1 | 1) => {
    if (!seg) return;
    const bs = blanksOf(seg);
    const to = bs[bs.indexOf(wi) + dir];
    if (to == null) return;
    focusBox(inputRefs.current[to], dir === -1 ? "end" : "start");
  };
  /** The blank a hint applies to: the one the caret is in, else the first one still unanswered. */
  const hintWord = (): number | null => {
    if (!seg) return null;
    const bs = blanksOf(seg);
    if (focusWi != null && bs.includes(focusWi) && !okWord(seg, focusWi)) return focusWi;
    return bs.find((wi) => !okWord(seg, wi)) ?? null;
  };
  /** One press opens one letter of that word: the first one not typed right yet (max DICTATION_HINT_MAX). */
  const cycleHint = () => {
    if (!seg) return;
    const wi = hintWord();
    if (wi == null) return;
    const cur = hintLevel[seg.i] ?? {};
    const word = wordsOf(seg)[wi] ?? "";
    const { text: typed } = fitWord(word, inputs[seg.i]?.[wi] ?? "");
    const opened = nextWordHint(norm(word), typed, cur[wi], DICTATION_HINT_MAX);
    if (!opened) return;
    const next = { ...cur, [wi]: opened };
    setHintLevel((h) => ({ ...h, [seg.i]: next }));
    const total = Object.values(next).reduce((a, b) => a + b.n, 0);
    queueSave(`hint:${seg.i}:${wi}`, () => api.hint(slug, seg.i, wi, opened.n, total, level));
    setTimeout(() => inputRefs.current[wi]?.focus(), 0);
  };
  /** Show the one word the caret is in; priced as that word opened all the way. */
  const revealWord = () => {
    if (!seg) return;
    const wi = hintWord();
    if (wi == null) return;
    const word = wordsOf(seg)[wi] ?? "";
    const cur = hintLevel[seg.i] ?? {};
    const opened = { n: DICTATION_HINT_MAX, upTo: norm(word).length };
    const next = { ...cur, [wi]: opened };
    setHintLevel((h) => ({ ...h, [seg.i]: next }));
    setInputs((p) => ({ ...p, [seg.i]: { ...(p[seg.i] ?? {}), [wi]: word } }));
    const nb = blanksOf(seg).find((b) => b !== wi && !okWord(seg, b));
    if (nb != null) setTimeout(() => inputRefs.current[nb]?.focus(), 0);
    const total = Object.values(next).reduce((a, b) => a + b.n, 0);
    queueSave(`hint:${seg.i}:${wi}`, () => api.hint(slug, seg.i, wi, opened.n, total, level));
  };
  const doReveal = () => {
    if (!seg) return;
    const wds = wordsOf(seg);
    recordedRef.current.add(seg.i);
    progressedRef.current = true;
    setInputs((p) => ({
      ...p,
      [seg.i]: Object.fromEntries(blanksOf(seg).map((wi) => [wi, wds[wi]])),
    }));
    setRevealed((r) => ({ ...r, [seg.i]: true }));
    queueSave(`reveal:${seg.i}`, () => api.reveal(slug, seg.i, level));
  };
  // Hardest: bấm Check (Enter) → chấm cả câu; đúng → ghi + khen + tự sang câu.
  const checkHardest = () => {
    if (!seg) return;
    setSentChecked((c) => ({ ...c, [seg.i]: true }));
    if (hardestOk(seg) && !recordedRef.current.has(seg.i)) {
      recordedRef.current.add(seg.i);
      progressedRef.current = true;
      const wds = wordsOf(seg);
      const ans = {
        sentence: wds.join(" "),
        blanks: (seg.blanks?.length ? seg.blanks : []).map((wi) => wds[wi]),
      };
      queueSave(`check:${seg.i}`, () => api.check(slug, seg.i, ans, level));
      celebrateGrade("exactly");
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = window.setTimeout(() => nextUndone(), advanceDelay());
    }
  };

  // ── Shadowing tự động ──────────────────────────────────────────────────────
  // Một CHẶNG = `autoBlock` câu (mặc định 10, chỉnh trong cài đặt). Mỗi câu: phát → dừng hẳn video
  // (im tiếng để em nói) → khoảng lặng dài bằng câu (+ dư) → câu kế. Video KHÔNG tua lại giữa các
  // câu: câu sau bắt đầu đúng chỗ câu trước dừng nên chỉ cần phát tiếp (xem RESUME_TOLERANCE bên
  // YouTubePlayer). Bật "chấm từng câu" thì khoảng lặng đó máy tự ghi âm và gửi chấm — mỗi câu tốn
  // 1 lượt quota, nên mặc định TẮT.
  /**
   * How long a finished line stays on screen before the next one. The meaning only appears at that
   * moment, so with it on the line has to hold long enough to actually read it — 1.5s is barely a
   * glance. Read through the ref: the timer is armed inside callbacks bound to older state.
   */
  const advanceDelay = () => (optsRef.current.dictVi ? 3500 : 1500);

  const stopAuto = () => {
    autoStopRef.current = true;
    setAutoOn(false);
    setAutoPhase(null);
  };
  const runAuto = async (from: number) => {
    autoStopRef.current = false;
    setAutoOn(true);
    setAutoDone(null);
    // Block size is read fresh each line, so nudging the stepper mid-run extends (or ends) the run
    // in progress instead of only taking effect next time.
    const lastOf = () => Math.min(segs.length - 1, from + optsRef.current.autoBlock - 1);
    setAutoEnd(lastOf());
    for (let i = from; i <= lastOf(); i++) {
      setAutoEnd(lastOf());
      if (autoStopRef.current) break;
      const s = segs[i];
      if (!s) break;
      goTo(i);
      const durMs = (Math.max(0.4, s.end - s.start) / rate) * 1000;
      setAutoPhase("listen");
      // Chờ effect đổi câu chạy xong rồi mới phát — nó gọi setPlaying(false), phát trước sẽ bị nó dập.
      await sleep(90);
      if (autoStopRef.current) break;
      playAt(i);
      await sleep(durMs + 200);
      if (autoStopRef.current) break;
      pause(); // im tiếng video trong lượt em nói
      setAutoPhase("repeat");
      const gapMs = Math.round(durMs + 700);
      if (optsRef.current.autoScore) {
        const blob = await recordFixedClip(gapMs).catch(() => null);
        if (autoStopRef.current) break;
        if (blob) await submitShadow(i, blob);
      } else {
        await sleep(gapMs);
      }
    }
    setAutoPhase(null);
    setAutoOn(false);
    autoStopRef.current = true;
    setAutoDone({ from, to: lastOf() });
  };
  // Rời trang / đổi chế độ khi đang chạy → cắt vòng lặp.
  useEffect(
    () => () => {
      autoStopRef.current = true;
    },
    [],
  );
  useEffect(() => {
    if (mode !== "shadowing") stopAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /** Swap the replay URL for a segment, releasing the previous blob. */
  const setTake = (segIdx: number, blob: Blob | null) => {
    setTakeUrl((p) => {
      if (p[segIdx]) URL.revokeObjectURL(p[segIdx]);
      const n = { ...p };
      if (blob) n[segIdx] = URL.createObjectURL(blob);
      else delete n[segIdx];
      return n;
    });
  };

  const submitShadow = async (segIdx: number, blob: Blob | null, force = false) => {
    setTake(segIdx, blob);
    setSilentSeg(null);
    if (!blob) {
      setShadow((p) => {
        const n = { ...p };
        delete n[segIdx];
        return n;
      });
      return;
    }
    // A take with no voice in it (mic muted/blocked, or the auto loop recording an empty gap) would
    // come back 0 having burned a grading credit. Measure the level here and stop it — same check
    // as read-aloud, and the student can still push it through.
    if (!force) {
      const lvl = await measureAudioLevel(blob);
      if (lvl && isSilentLevel(lvl)) {
        silentBlob.current = blob;
        setSilentSeg(segIdx);
        return;
      }
    }
    setShadow((p) => ({ ...p, [segIdx]: "loading" }));
    try {
      const r = await api.shadow(slug, segIdx, blob);
      setShadow((p) => ({ ...p, [segIdx]: r }));
      progressedRef.current = true;
      celebrateGrade(
        r.score >= 90
          ? "exactly"
          : r.score >= 75
            ? "good"
            : r.score >= 60
              ? "fair"
              : "weak",
      );
    } catch (e) {
      setErr((e as Error).message);
      setShadow((p) => {
        const n = { ...p };
        delete n[segIdx];
        return n;
      });
    }
  };

  // Đổi Dictation ⇄ Shadowing tại chỗ (giữ độ khó).
  // Đổi độ khó NGAY tại trang: nạp lại bài để lấy đúng bản nháp của mức đó (ô khoét do client
  // tự chọn theo mức, nên chỉ cần dựng lại state — không đụng server).
  const switchLevel = async (l: Level) => {
    if (l === level) return;
    setLevel(l);
    const next = new URLSearchParams(sp);
    next.set("level", l);
    setSp(next, { replace: true });
    setLoading(true);
    await loadLesson(mode, l)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  const switchMode = async (m: VideoMode) => {
    if (!lesson || lesson.mode === m) return;
    // Write the mode into the URL like the difficulty: a reload has to come back to what is on
    // screen, not to whichever mode the library link happened to carry.
    const next = new URLSearchParams(sp);
    next.set("mode", m);
    setSp(next, { replace: true });
    setLoading(true);
    await loadLesson(m)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  // Same "cannot open this lesson" screen the quiz page uses — it names the reason and offers a
  // way out. This page used to print the raw error over a bare Back button.
  if (err && !lesson)
    return (
      <div className="p-3 sm:p-5">
        <PracticeUnavailable message={err} onRetry={() => void loadLesson(qMode ?? "dictation")} />
      </div>
    );
  if (!lesson || !seg) return null;

  const estMin = Math.max(2, Math.round(segs.length * 1.1));
  const avgShadow = (() => {
    const vals = Object.values(shadow)
      .filter((r): r is VideoShadowResult => !!r && r !== "loading")
      .map((r) => r.score);
    return vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : null;
  })();

  // Lines of the block just finished, with whatever score each one got. Auto run grades line by
  // line — there is no "block score" — so the summary is an aggregate over exactly these rows.
  // Plain loop, NOT useMemo: this sits below the loading/empty early returns, and a hook down here
  // changes the hook count between renders (React #310 — the page went white).
  const blockRows: { i: number; text: string; result: VideoShadowResult | null }[] = [];
  if (autoDone) {
    for (let i = autoDone.from; i <= autoDone.to && i < segs.length; i++) {
      const r = shadow[i];
      blockRows.push({ i, text: segs[i]?.text || "", result: r && r !== "loading" ? r : null });
    }
  }

  // Settings panel body — rendered by BOTH gear buttons (header + practice card), so the same
  // switches are reachable from wherever the student's eyes already are.
  const settingsPanel = () => (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  <OptRow
                    icon={<Captions className="h-4 w-4" />}
                    title={t("userVideoProfile.practice.settings.watchMode")}
                    desc={t("userVideoProfile.practice.settings.watchModeDesc")}
                    checked={watch}
                    onChange={(v) => setOpt("watch", v)}
                  />
                  {/* Chỉ bày mục ĐANG dùng được: bật chế độ xem thì hiện nhóm phụ đề, tắt
                      thì hiện công tắc lặp câu. Bày cả hai rồi làm mờ một nửa chỉ tổ rối. */}
                  {watch ? (
                    <>
                      <OptRow
                        icon={<ScrollText className="h-4 w-4" />}
                        title={t("userVideoProfile.practice.settings.subEn")}
                        checked={subEn}
                        onChange={(v) => setOpt("subEn", v)}
                      />
                      <OptRow
                        icon={<Languages className="h-4 w-4" />}
                        title={t("userVideoProfile.practice.settings.subVi")}
                        checked={subVi}
                        onChange={(v) => setOpt("subVi", v)}
                      />
                      <div className="flex items-center gap-2.5 py-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                          <Type className="h-4 w-4" />
                        </span>
                        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {t("userVideoProfile.practice.settings.subFontSize")}
                        </p>
                        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                          {SUB_SIZES.map((z, i) => (
                            <button
                              key={z.label}
                              onClick={() => setOpt("subSize", i)}
                              className={`rounded-md px-2 py-1 text-xs font-bold transition ${i === subSize ? "bg-white text-cyan-600 shadow-sm dark:bg-slate-700 dark:text-cyan-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}
                            >
                              {z.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {mode === "dictation" && (
                        <>
                          <OptRow
                            icon={<Repeat className="h-4 w-4" />}
                            title={t("userVideoProfile.practice.settings.loop")}
                            desc={t("userVideoProfile.practice.settings.loopDesc")}
                            checked={loop}
                            onChange={(v) => setOpt("loop", v)}
                          />
                          <OptRow
                            icon={<Languages className="h-4 w-4" />}
                            title={t("userVideoProfile.practice.settings.translateOnComplete")}
                            desc={t("userVideoProfile.practice.settings.translateOnCompleteDesc")}
                            checked={dictVi}
                            onChange={(v) => setOpt("dictVi", v)}
                          />
                        </>
                      )}
                      {mode === "shadowing" && (
                        <>
                          <OptRow
                            icon={<AudioLines className="h-4 w-4" />}
                            title={t("userVideoProfile.practice.settings.karaoke")}
                            desc={t("userVideoProfile.practice.settings.karaokeDesc")}
                            checked={karaoke}
                            onChange={(v) => setOpt("karaoke", v)}
                          />
                          <OptRow
                            icon={<Languages className="h-4 w-4" />}
                            title={t("userVideoProfile.practice.settings.sentenceTranslation")}
                            desc={t("userVideoProfile.practice.settings.sentenceTranslationDesc")}
                            checked={lineVi}
                            onChange={(v) => setOpt("lineVi", v)}
                          />
                        </>
                      )}
                      {mode === "shadowing" && (
                        <>
                          <OptRow
                            icon={<Play className="h-4 w-4" />}
                            title={t("userVideoProfile.practice.settings.autoPlay")}
                            desc={t("userVideoProfile.practice.settings.autoPlayDesc")}
                            checked={autoOn}
                            onChange={(v) => (v ? void runAuto(cur) : stopAuto())}
                          />
                          {autoOn && (
                            <div className="flex items-center gap-2.5 py-2.5">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                                <ListChecks className="h-4 w-4" />
                              </span>
                              <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {t("userVideoProfile.practice.settings.sentencesPerSection")}
                              </p>
                              <Stepper
                                value={autoBlock}
                                min={AUTO_MIN}
                                max={AUTO_MAX}
                                onChange={(v) => setOpt("autoBlock", v)}
                              />
                            </div>
                          )}
                          <OptRow
                            icon={<Mic className="h-4 w-4" />}
                            title={t("userVideoProfile.practice.settings.autoScore")}
                            desc={t("userVideoProfile.practice.settings.autoScoreDesc")}
                            checked={autoScore}
                            onChange={(v) => setOpt("autoScore", v)}
                          />
                        </>
                      )}
                      {/* Both modes: shadowing sizes the line being read, dictation the line being
                          filled in — same scale, same control. */}
                      {(
                        <div className="flex items-center gap-2.5 py-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                            <Type className="h-4 w-4" />
                          </span>
                          <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {t("userVideoProfile.practice.settings.fontSize")}
                          </p>
                          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                            {LINE_SIZES.map((z, i) => (
                              <button
                                key={z.label}
                                onClick={() => setOpt("textSize", i)}
                                className={`rounded-md px-2 py-1 text-xs font-bold transition ${i === textSize ? "bg-white text-cyan-600 shadow-sm dark:bg-slate-700 dark:text-cyan-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}
                              >
                                {z.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              
  );

  return (
    // Full-width: panel transcript neo sát MÉP PHẢI màn hình. Nội dung vẫn tự căn giữa
    // (max-w-4xl bên trong), nên bỏ max-w ở đây không làm chữ chạy dài ra.
    <div className="flex w-full">
      <div
        className={`min-w-0 flex-1 p-3 transition-[padding] duration-300 sm:p-5 ${listOpen ? "lg:pr-[27rem]" : ""}`}
      >
        <div className="mx-auto max-w-4xl space-y-5">
          {err && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10">
              {err}
            </div>
          )}
          {/* Progress that has not reached the server yet. Says so plainly instead of failing
              silently, and promises the retry that is actually running. */}
          {unsaved > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <CloudOff className="size-4 shrink-0" />
              <span>
                {t("userVideoProfile.practice.unsavedHint", { n: unsaved })}
              </span>
            </div>
          )}

          {/* HERO */}
          <div className="relative">
            <header className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-800/80 dark:bg-slate-950">
              <div
                className={`absolute inset-0 bg-gradient-to-br ${mode === "dictation" ? "from-white via-cyan-50/50 to-cyan-100/60 dark:from-slate-950 dark:via-slate-900 dark:to-cyan-950/60" : "from-white via-violet-50/50 to-violet-100/60 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/60"}`}
              />
              <HeroWave mode={mode} />
              <div className="relative flex items-center gap-3">
                {/* Lesson thumbnail: the video frame, or the mode icon for an audio lesson. */}
                {!isAudio && lesson.youtube_id ? (
                  <span className="relative hidden h-14 w-24 shrink-0 overflow-hidden rounded-md bg-slate-200 shadow-sm ring-1 ring-black/5 sm:block dark:bg-slate-800 dark:ring-white/10">
                    <img src={`https://i.ytimg.com/vi/${lesson.youtube_id}/mqdefault.jpg`} alt="" className="size-full object-cover" loading="lazy" />
                    <span className={`absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full text-white shadow ${mode === "dictation" ? "bg-cyan-500" : "bg-violet-500"}`}>
                      {mode === "dictation" ? <PenLine className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    </span>
                  </span>
                ) : (
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${mode === "dictation" ? "from-cyan-400 to-cyan-600" : "from-violet-400 to-violet-600"}`}>
                    {mode === "dictation" ? <PenLine className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-extrabold leading-tight tracking-tight text-slate-800 dark:text-white sm:text-2xl">
                  {lesson.title}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {mode === "dictation" && (
                    /* Đổi độ khó NGAY ở đây — trước phải quay lại thư viện chỉ để đổi một mức. */
                    <Popover
                      side="down"
                      align="left"
                      ariaLabel="Difficulty"
                      triggerClassName="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition hover:bg-slate-900/5 dark:hover:bg-white/10"
                      panelClassName="w-56 p-1"
                      trigger={
                        <>
                          <Gauge className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                          <span className="text-slate-500 dark:text-slate-400">
                            Difficulty:{" "}
                            <span className={`font-bold ${LEVEL_TONE[level]}`}>
                              {LEVELS.find((l) => l.id === level)!.label}
                            </span>
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        </>
                      }
                    >
                      {(close) => (
                        <div className="space-y-0.5">
                          {LEVELS.map((l) => (
                            <PopoverItem
                              key={l.id}
                              active={l.id === level}
                              onClick={() => {
                                close();
                                void switchLevel(l.id);
                              }}
                            >
                              <span className="flex-1">
                                <span className={`font-semibold ${LEVEL_TONE[l.id]}`}>{l.label}</span>
                                <span className="ml-1.5 text-xs text-slate-400">{l.hint}</span>
                              </span>
                              {/* Điểm tối đa của CHÍNH bài này ở mức đó — cụ thể hơn hẳn một hệ số khô khan. */}
                              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-cyan-600 dark:text-cyan-300">
                                {t("userVideoProfile.practice.maxPoints", { n: dictationLessonMax(segs.map((x) => x.text || ""), l.id) })}
                              </span>
                              {l.id === level && <Check className="h-3.5 w-3.5" />}
                            </PopoverItem>
                          ))}
                        </div>
                      )}
                    </Popover>
                  )}
                  <MetaChip icon={ListChecks} label={`${segs.length} lines`} />
                  <MetaChip icon={Clock} label={`~${estMin} min`} />
                </div>
                </div>
              </div>
            </header>
            {/* Toolbar row under the hero: back on the left; summary, theme, settings, video and mode on the right. */}
            <div className="mt-2 flex items-center gap-2">
              <Tooltip label={t("userVideoProfile.practice.bar.backHint")} side="bottom">
                <button onClick={() => nav(backTo)} className={`${TOP_BTN} h-10 shrink-0 gap-1.5 px-3 text-sm font-semibold`}>
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("userVideoProfile.practice.bar.back")}</span>
                </button>
              </Tooltip>
              <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
                {/* The session summary reads the learner's own progress, so a preview has none. */}
                {!preview && (
                  <Tooltip label={t("userVideoProfile.practice.viewReport")} side="bottom">
                    <button
                      onClick={() => nav(`${basePath}/${slug}/report?level=${level}`)}
                      aria-label={t("userVideoProfile.practice.viewReport")}
                      className={`${TOP_BTN} h-10 shrink-0 gap-1.5 px-3 text-sm font-medium`}
                    >
                      <ClipboardList className="h-4 w-4" />
                      <span className="hidden md:inline">{t("userVideoProfile.practice.bar.report")}</span>
                    </button>
                  </Tooltip>
                )}
                <button
                  onClick={toggle}
                  aria-label={theme === "dark" ? t("userVideoProfile.practice.bar.light") : t("userVideoProfile.practice.bar.dark")}
                  className={`${TOP_BTN} h-10 shrink-0 gap-1.5 px-3 text-sm font-medium`}
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span className="hidden md:inline">
                    {theme === "dark" ? t("userVideoProfile.practice.bar.light") : t("userVideoProfile.practice.bar.dark")}
                  </span>
                </button>
                <Popover
                  side="down"
                  align="right"
                  ariaLabel={t("userVideoProfile.practice.bar.settings")}
                  triggerClassName={`${TOP_BTN} h-10 shrink-0 gap-1.5 px-3 text-sm font-medium ${watch ? "text-cyan-600 dark:text-cyan-300" : ""}`}
                  panelClassName="w-[22rem] p-2"
                  trigger={
                    <>
                      <Settings2 className="h-4 w-4" />
                      <span className="hidden md:inline">{t("userVideoProfile.practice.bar.settings")}</span>
                    </>
                  }
                >
                  {settingsPanel}
                </Popover>
                {!isAudio && (
                  <span className="relative shrink-0">
                    <Tooltip label={videoOff ? t("userVideoProfile.practice.showVideo") : t("userVideoProfile.practice.hideVideo")} side="bottom">
                      <button
                        onClick={() => { setVideoOff((v) => !v); setSubHint(false); }}
                        aria-label={videoOff ? t("userVideoProfile.practice.showVideo") : t("userVideoProfile.practice.hideVideo")}
                        className={`${TOP_BTN} h-10 shrink-0 gap-1.5 px-3 text-sm font-medium ${videoOff ? "text-cyan-600 dark:text-cyan-300" : ""} ${subHint ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900" : ""}`}
                      >
                        {videoOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                        <span className="hidden md:inline">
                          {videoOff ? t("userVideoProfile.practice.bar.audioOnly") : t("userVideoProfile.practice.bar.video")}
                        </span>
                      </button>
                    </Tooltip>
                    {subHint && (
                      <span
                        role="status"
                        className="absolute right-0 top-full z-30 mt-2.5 w-60 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs font-medium leading-snug text-amber-900 shadow-lg dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-100"
                        style={{ animation: "fade-in 0.2s ease-out" }}
                      >
                        <span className="absolute -top-1.5 right-4 size-3 rotate-45 border-l border-t border-amber-300 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/15" />
                        <span className="relative flex gap-1.5">
                          <Captions className="mt-0.5 size-3.5 shrink-0" />
                          {t("userVideoProfile.practice.burnedSubtitlesHint")}
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {lesson.modes.length > 1 && (
                  <>
                    <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-700" />
                    <ModeSwitcher mode={mode} onPick={switchMode} />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* MEDIA + khen — stageUI (audio hoặc video-tắt-hình) → khung SÓNG; ngược lại → khung video */}
          <div
            className="relative"
            onMouseMove={watch ? pokeBar : undefined}
            onPointerDown={watch ? pokeBar : undefined}
          >
            {isAudio && (
              <audio
                ref={audioRef}
                src={lesson.audio_url ?? ""}
                onTimeUpdate={onAudioTime}
                onEnded={() => setPlaying(false)}
                preload="auto"
              />
            )}
            {/* Bài video TẮT hình: vẫn giữ player (để chạy audio) nhưng đưa ra ngoài màn hình */}
            {!isAudio && videoOff && (
              <div
                aria-hidden
                className="pointer-events-none absolute -left-[300vw] top-0 h-44 w-80 opacity-0"
              >
                <YouTubePlayer
                  ref={ytRef}
                  videoId={lesson.youtube_id ?? ""}
                  minimal
                />
              </div>
            )}
            {stageUI ? (
              <ControlBar
                stage
                label={`${cur + 1}/${segs.length}`}
                onPrev={prevPlay}
                onPlay={play}
                onPause={pause}
                onNext={nextPlay}
                canPrev={cur > 0}
                canNext={cur < segs.length - 1}
                playing={playing}
                played={!!playedSet[cur]}
              />
            ) : (
              <YouTubePlayer
                ref={ytRef}
                videoId={lesson.youtube_id ?? ""}
                minimal
                cropSubs
                onSurfaceClick={watch ? (playing ? pause : play) : play}
                className="border border-slate-200 shadow-lg dark:border-slate-900"
                cover={
                  <BrandWordmark height={40} onDark className="opacity-90 drop-shadow-lg" />
                }
              />
            )}
            {celebrate && <CelebrateOverlay grade={celebrate} />}
            {/* Thanh tua nằm ĐÈ đáy video như player thường; bài audio (khung sóng) thì để dưới
                phụ đề vì đáy khung sóng đã có nhãn "Audio · n/m". */}
            {watch && !stageUI && (
              <div
                className={`absolute inset-x-0 bottom-0 z-20 rounded-b-xl bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent px-1 pb-1 pt-10 transition-opacity duration-300 ${barOn ? "opacity-100" : "pointer-events-none opacity-0"}`}
              >
                <WatchSeek
                  overlay
                  t={watchT}
                  start={segs[0]?.start ?? 0}
                  end={segs[segs.length - 1]?.end ?? 0}
                  onScrub={(v) => {
                    draggingRef.current = true;
                    setWatchT(v);
                  }}
                  onCommit={(v) => {
                    draggingRef.current = false;
                    seekWatch(v);
                  }}
                  controls={
                    <PlaybackControls
                      onVideo
                      vol={vol}
                      setVol={setVol}
                      rate={rate}
                      setRate={setRate}
                    />
                  }
                />
              </div>
            )}
          </div>

          {/* VÙNG LÀM */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            {/* Chế độ xem: phụ đề TRƯỚC, rồi mới tới thanh tua + nút phát — mắt đọc chữ là chính,
                nút bấm là phụ. Lúc luyện thì ngược lại (nghe trước, gõ sau) nên giữ nguyên. */}
            {!stageUI && !watch && (
              <ControlBar
                onPrev={prevPlay}
                onPlay={play}
                onPause={pause}
                onNext={nextPlay}
                canPrev={cur > 0}
                canNext={cur < segs.length - 1}
                playing={playing}
                played={!!playedSet[cur]}
              />
            )}
            {watch ? (
              <>
                <WatchPanel
                  seg={seg}
                  next={segs[cur + 1]}
                  subEn={subEn}
                  subVi={subVi}
                  size={subSize}
                />
                {stageUI && (
                  <WatchSeek
                    t={watchT}
                    start={segs[0]?.start ?? 0}
                    end={segs[segs.length - 1]?.end ?? 0}
                    onScrub={(v) => {
                      draggingRef.current = true;
                      setWatchT(v);
                    }}
                    onCommit={(v) => {
                      draggingRef.current = false;
                      seekWatch(v);
                    }}
                  />
                )}
                {!stageUI && (
                  <ControlBar
                    onPrev={prevPlay}
                    onPlay={play}
                    onPause={pause}
                    onNext={nextPlay}
                    canPrev={cur > 0}
                    canNext={cur < segs.length - 1}
                    playing={playing}
                    played={false}
                  />
                )}
              </>
            ) : mode === "dictation" && level === "hardest" ? (
              <div className="bg-white px-4 py-6 dark:bg-slate-900 sm:px-6 sm:py-7">
                <HardestWork
                  seg={seg}
                  value={sentInput[seg.i] ?? ""}
                  checked={!!sentChecked[seg.i]}
                  done={doneCur}
                  onChange={(v) => {
                    setSentInput((p) => ({ ...p, [seg.i]: v }));
                    if (sentChecked[seg.i])
                      setSentChecked((c) => ({ ...c, [seg.i]: false }));
                  }}
                  onCheck={checkHardest}
                  onNext={nextUndone}
                />
              </div>
            ) : mode === "dictation" ? (
              <div className="bg-white px-4 py-7 dark:bg-slate-900 sm:px-6 sm:py-8">
                <div
                  className={`flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-3 text-slate-700 dark:text-slate-100 ${LINE_SIZES[textSize].cls}`}
                >
                  {wordsOf(seg).map((word, wi) =>
                    !blanksOf(seg).includes(wi) ? (
                      <span key={wi} className="font-medium">
                        {word}
                      </span>
                    ) : (
                      <Blank
                        key={wi}
                        word={word}
                        alts={seg.alts?.[wi]}
                        val={inputs[seg.i]?.[wi] ?? ""}
                        ok={okWord(seg, wi)}
                        hintChars={hintLevel[seg.i]?.[wi]?.upTo ?? 0}
                        onFocus={() => setFocusWi(wi)}
                        refCb={(el) => {
                          inputRefs.current[wi] = el;
                        }}
                        onChange={(v) => onType(wi, v)}
                        onEnter={() => onEnter(wi)}
                        onStep={(dir) => stepBlank(wi, dir)}
                      />
                    ),
                  )}
                </div>
                {/* Meaning appears only ONCE THE LINE IS FILLED IN — showing it early gives the answer away. */}
                {dictVi && doneCur && seg.vi && (
                  <p className="mt-3 text-center text-sm italic leading-snug text-slate-500 dark:text-slate-400">
                    {seg.vi}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4 bg-white p-4 dark:bg-slate-900 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  {autoOn ? (
                    <AutoStatus
                      on={autoOn}
                      phase={autoPhase}
                      score={autoScore}
                      cur={cur}
                      end={autoEnd}
                      onStop={stopAuto}
                    />
                  ) : autoDone ? (
                    <AutoSummary
                      range={autoDone}
                      rows={blockRows}
                      onDetail={() => setBlockOpen(true)}
                      onClose={() => setAutoDone(null)}
                    />
                  ) : (
                    <span />
                  )}
                </div>
                <ShadowWork
                  seg={seg}
                  result={shadow[seg.i]}
                  takeUrl={takeUrl[seg.i]}
                  armed={armed}
                  takeKey={takeNo}
                  sizeCls={LINE_SIZES[textSize].cls}
                  showVi={lineVi}
                  silent={silentSeg === seg.i}
                  karaokeAt={karaokeAt}
                  recording={recording}
                  onRecordingChange={onRecordingChange}
                  onRecorded={(b) => submitShadow(seg.i, b)}
                  onForceSend={() => void submitShadow(seg.i, silentBlob.current, true)}
                  onDiscard={() => discardTake(seg.i)}
                  onRetry={recordShadow}
                  onNext={nextPlay}
                  hideRecorder={autoOn}
                />
              </div>
            )}

            {/* THANH DƯỚI — hàng 1: điều khiển (trái) ↔ Hint/Transcript (phải) · hàng 2: tiến độ.
                Tách 2 hàng để mobile/iPad không phải chen 4 cụm vào một dòng rồi vỡ lung tung. */}
            <div className="border-t border-slate-100 px-2 py-2.5 dark:border-slate-800 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
                <div className="order-1 flex items-center gap-0.5">
                  <PlaybackControls
                    vol={vol}
                    setVol={setVol}
                    rate={rate}
                    setRate={setRate}
                  />
                  {!watch &&
                    mode === "dictation" &&
                    !doneCur &&
                    level !== "hardest" && (
                      <Popover
                        side="up"
                        align="left"
                        ariaLabel={t("userVideoProfile.practice.revealAria")}
                        triggerClassName="flex items-center rounded-md px-2 py-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        panelClassName="w-72 p-3"
                        trigger={<Eye className="h-4 w-4" />}
                      >
                        {(close) => (
                          <div>
                            <p className="text-sm leading-snug text-slate-600 dark:text-slate-300">
                              {t("userVideoProfile.practice.revealTitle")}
                            </p>
                            <ul className="mt-1.5 space-y-0.5 text-xs leading-snug">
                              <li className="text-amber-600 dark:text-amber-400">
                                {t("userVideoProfile.practice.revealWordCost", { n: DICTATION_HINT_MAX })}
                              </li>
                              <li className="font-semibold text-rose-600 dark:text-rose-400">
                                {t("userVideoProfile.practice.revealLineCost")}
                              </li>
                            </ul>
                            {/* The word is the primary answer to "I'm stuck"; the whole line is the quiet option. */}
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  doReveal();
                                  close();
                                }}
                                className="rounded-md px-2.5 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                              >
                                {t("userVideoProfile.practice.revealLine")}
                              </button>
                              <button
                                onClick={() => {
                                  revealWord();
                                  close();
                                }}
                                disabled={hintWord() == null}
                                className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-40"
                              >
                                <Eye className="h-3.5 w-3.5" /> {t("userVideoProfile.practice.revealWord")}
                              </button>
                            </div>
                          </div>
                        )}
                      </Popover>
                    )}
                  {mode === "shadowing" && (
                    <Chip
                      label="Avg"
                      value={avgShadow != null ? `${avgShadow}` : "—"}
                      score={avgShadow}
                    />
                  )}
                </div>
                <div className="order-2 ml-auto flex shrink-0 items-center gap-1 lg:order-3 lg:ml-0">
                  {!watch &&
                    mode === "dictation" &&
                    !doneCur &&
                    level !== "hardest" && (
                      <Tooltip label={t("userVideoProfile.practice.hintTooltip")}>
                      <button
                        onClick={cycleHint}
                        disabled={hintWord() == null || (hintLevel[seg.i]?.[hintWord() ?? -1]?.n ?? 0) >= DICTATION_HINT_MAX}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold text-amber-600 transition hover:bg-amber-50 disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-500/10"
                      >
                        <Lightbulb className="h-4 w-4" /> {t("userVideoProfile.practice.hint")}
                        {/* Dots count the hints on the word the button targets, not the line. */}
                        {(hintLevel[seg.i]?.[hintWord() ?? -1]?.n ?? 0) > 0 && (
                          <span className="text-[11px] leading-none tracking-tighter">
                            {"•".repeat(hintLevel[seg.i]?.[hintWord() ?? -1]?.n ?? 0)}
                          </span>
                        )}
                      </button>
                      </Tooltip>
                    )}
                  {!listOpen && (
                    <Tooltip label={t("userVideoProfile.practice.openTranscript")}>
                      <button
                        onClick={() => setListOpen(true)}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ScrollText className="h-4 w-4" /> Transcript
                      </button>
                    </Tooltip>
                  )}
                  {/* Cùng bảng cài đặt với nút ở đầu trang — nhân đôi chứ không dời, để tay đang ở
                      thanh dưới thì bấm luôn. Sát đáy màn nên mở NGƯỢC LÊN. */}
                  {/* Popover owns the tooltip (it blanks it while the panel is open). Wrapping one
                      more Tooltip around it made the hint blink as the pointer crossed the menu. */}
                  <Popover
                      side="up"
                      align="right"
                      ariaLabel="Practice settings"
                      title={t("userVideoProfile.practice.settingsTitle")}
                      triggerClassName="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      panelClassName="w-[22rem] p-2"
                      trigger={
                        <>
                          <Settings2 className="h-4 w-4" /> {t("common.settings")}
                        </>
                      }
                    >
                    {settingsPanel}
                  </Popover>
                </div>
                {/* Màn hẹp: thanh tiến độ xuống hàng riêng (w-full) cho đủ chỗ. Từ lg: chen vào
                    GIỮA hai cụm nút, ăn hết khoảng trống — không thừa một hàng chỉ để đựng nó.
                    Các vạch DÍNH LIỀN nhau: 175 câu mà chừa khe thì thành hàng gạch rời, đọc ra
                    tiến độ khó hơn là một dải liền đổi màu. */}
                <div className="order-3 flex w-full items-center gap-2.5 lg:order-2 lg:w-auto lg:min-w-40 lg:flex-1">
                  <LineScrubber
                    segs={segs}
                    cur={cur}
                    gradeOf={gradeOf}
                    onSeek={(i) => (watch ? seekWatch(segs[i].start) : goTo(i))}
                  />
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                    {cur + 1}/{stats.total}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <PracticeFooter />
        </div>
      </div>

      {/* Chi tiết chặng vừa chạy — bảng tổng kết ở trên chỉ có chỗ cho vài con số. */}
      <Drawer
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={autoDone ? t("userVideoProfile.practice.sectionTitle", { from: autoDone.from + 1, to: autoDone.to + 1 }) : t("userVideoProfile.practice.recentSection")}
        description={t("userVideoProfile.practice.sectionDesc")}
        icon={<ListChecks className="size-5" />}
        widthClassName="max-w-lg"
      >
        <div className="space-y-2">
          {blockRows.map((r) => (
            <button
              key={r.i}
              type="button"
              onClick={() => {
                setBlockOpen(false);
                goPlay(r.i);
              }}
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-700 dark:hover:border-cyan-700 dark:hover:bg-cyan-500/5"
            >
              <span className="w-6 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-slate-400">
                {r.i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug text-slate-700 dark:text-slate-200">{r.text}</span>
                {r.result && (
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500">
                    <span>{t("userVideoProfile.practice.scoreFidelity")} <b className={scoreColor(r.result.fidelity)}>{r.result.fidelity}</b></span>
                    <span>{t("userVideoProfile.practice.scoreFluency")} <b className={scoreColor(r.result.fluency)}>{r.result.fluency}</b></span>
                    <span>{t("userVideoProfile.practice.scoreClarity")} <b className={scoreColor(r.result.clarity)}>{r.result.clarity}%</b></span>
                    {r.result.wpm != null && <span>{t("userVideoProfile.practice.wpm", { wpm: r.result.wpm })}</span>}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                {r.result ? (
                  <b className={`text-lg font-bold ${scoreColor(r.result.score)}`}>{r.result.score}</b>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-400">{t("userVideoProfile.practice.notScored")}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </Drawer>

      {/* Nền mờ khi mở panel trên mobile — panel phủ TOÀN màn, bấm ra ngoài để đóng. */}
      {listOpen && (
        <div
          onClick={() => setListOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* PANEL TRANSCRIPT — FIXED theo khung nhìn: dính mép phải, chân panel đứng yên khi
          cuộn trang. Dưới lg là ngăn kéo phủ toàn màn (chỗ hẹp, chia đôi thì không đọc được). */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-full border-l border-slate-200 bg-slate-50 shadow-2xl transition-transform duration-300 lg:w-[27rem] lg:shadow-none dark:border-slate-800 dark:bg-slate-900 ${listOpen ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!listOpen}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <ScrollText className="h-4 w-4" /> Transcript{" "}
              <span className="text-slate-400">
                · {stats.done}/{segs.length}
              </span>
            </span>
            {/* Chỗ cũ của nút Đóng (nay ở chân panel) — dành cho công tắc bản dịch. */}
            {hasVi && (
              <Tooltip label={showVi ? t("userVideoProfile.practice.hideViTranslation") : t("userVideoProfile.practice.showViTranslation")} side="bottom">
                <button
                  onClick={() => setShowVi((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${showVi ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"}`}
                >
                  <Languages className="h-4 w-4" /> {t("userVideoProfile.practice.vietnamese")}
                </button>
              </Tooltip>
            )}
          </div>
          <div
            ref={listBoxRef}
            className="relative flex-1 space-y-2 overflow-y-auto p-2.5"
          >
            {segs.map((s, i) => {
              const done = isDone(s);
              const g = gradeOf(s, i);
              // Numeric score (shadowing) → the badge follows the SCORE scale, not the grade band.
              const sc =
                mode === "shadowing" && shadow[s.i] && shadow[s.i] !== "loading"
                  ? (shadow[s.i] as VideoShadowResult).score
                  : null;
              // Chế độ xem không giấu gì: đang xem thì che chữ chẳng để làm gì.
              const shown =
                watch || mode === "shadowing"
                  ? s.text
                  : done
                    ? s.text
                    : s.text
                      ? maskLine(s, i)
                      : `Line ${i + 1}`;
              return (
                // Mỗi câu là một THẺ có viền: đang làm → viền cyan, còn lại viền xám.
                // Badge điểm treo trên MÉP thẻ (phải-trên) để không chiếm dòng của câu.
                <button
                  key={s.i}
                  ref={i === cur ? activeRef : undefined}
                  onClick={() => (watch ? seekWatch(s.start) : goTo(i))}
                  className={`relative block w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    i === cur
                      ? "border-cyan-400 bg-cyan-500/10 dark:border-cyan-600"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                  }`}
                >
                  {g && (
                    <span
                      className={`absolute -top-2 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ring-1 ring-white dark:ring-slate-900 ${sc != null ? scoreBadge(sc) : GRADE_UI[g].badge}`}
                    >
                      {sc ?? GRADE_UI[g].label}
                    </span>
                  )}
                  {/* Số câu INLINE với chính câu đó — bỏ 2 icon tick/tròn vì badge đã nói trạng thái. */}
                  <div className="flex gap-2">
                    <span className="w-5 shrink-0 pt-0.5 text-xs font-bold tabular-nums text-slate-400">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm leading-snug ${watch || done || mode === "shadowing" ? "font-medium text-slate-700 dark:text-slate-100" : "font-mono tracking-wide text-slate-400 dark:text-slate-500"}`}
                      >
                        {shown}
                      </div>
                      {showVi && s.vi && (
                        <div className="mt-1 text-xs italic leading-snug text-slate-400 dark:text-slate-500">
                          {s.vi}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Chân panel — nút đóng chuyển xuống đây cho tầm tay (và nhường chỗ cho công tắc dịch). */}
          <div className="border-t border-slate-200 p-2 dark:border-slate-800">
            <button
              onClick={() => setListOpen(false)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <PanelRightClose className="h-4 w-4" /> Close transcript
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** − N + stepper for a small integer setting. */
function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    "flex size-7 items-center justify-center rounded-md text-slate-600 transition hover:bg-white disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700";
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={t("userVideoProfile.practice.stepperDecrease")}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-7 text-center text-sm font-bold tabular-nums text-slate-700 dark:text-slate-100">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={t("userVideoProfile.practice.stepperIncrease")}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Một hàng tuỳ chọn trong popover cài đặt: icon · tiêu đề (+ mô tả) · công tắc.
function OptRow({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </p>
        {/* One line, never wrapping: a two-line row shoves the switch off the eye line. */}
        {desc && (
          <p className="mt-0.5 truncate text-xs leading-snug text-slate-500 dark:text-slate-400">
            {desc}
          </p>
        )}
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        aria-label={title}
      />
    </div>
  );
}

// Thanh tiến độ KÉO ĐƯỢC theo câu. Trước đây chỉ để nhìn: rời chế độ xem hoặc dừng giữa chừng
// là không còn cách nào quay về một câu cụ thể ngoài mở panel transcript. Nay có núm kéo + nhãn
// "Line N" ngay trên đầu ngón tay, thả ra là nhảy tới đó.
function LineScrubber({
  segs,
  cur,
  gradeOf,
  onSeek,
}: {
  segs: Seg[];
  cur: number;
  gradeOf: (s: Seg, i: number) => Grade | null;
  onSeek: (i: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const n = segs.length;
  const at = drag ?? cur;
  const pct = n > 1 ? at / (n - 1) : 0;
  // Núm 14px: kẹp vào trong để ở hai đầu không thò ra ngoài thanh.
  const knobLeft = `calc(10px + (100% - 20px) * ${pct})`; // kẹp nửa núm vào trong để hai đầu không thò ra
  const commit = (v: number) => {
    setDrag(null);
    onSeek(Math.max(0, Math.min(n - 1, v)));
  };
  return (
    // Khung cao 20px, thanh 8px căn GIỮA theo trục dọc — núm cũng lấy tâm khung nên hai cái
    // trùng tim nhau (trước đây khung chỉ cao bằng thanh nên núm trông như đội lên trên).
    <div className="relative flex h-5 min-w-10 flex-1 items-center">
      {drag != null && (
        <div
          className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-[11px] font-bold text-white shadow-lg dark:bg-slate-700"
          style={{ left: knobLeft }}
        >
          Line {at + 1}
        </div>
      )}
      <div className="flex h-2 w-full items-stretch overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        {segs.map((s, i) => {
          const g = gradeOf(s, i);
          const cls =
            i === at ? "bg-cyan-500" : g ? GRADE_UI[g].bar : "bg-transparent";
          return (
            <div key={s.i} className={`flex-1 transition-colors ${cls}`} />
          );
        })}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-5 rounded-full border-2 border-white bg-cyan-500 shadow-md dark:border-slate-900"
        style={{
          left: knobLeft,
          transform: `translate(-50%, -50%) scale(${drag != null ? 1.2 : 1})`,
        }}
      />
      <input
        type="range"
        min={0}
        max={Math.max(0, n - 1)}
        value={at}
        aria-label="Jump to line"
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={(e) =>
          commit(Number((e.target as HTMLInputElement).value))
        }
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        className="absolute inset-x-0 top-1/2 h-8 w-full -translate-y-1/2 cursor-pointer opacity-0"
      />
    </div>
  );
}

const mmss = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

// Thanh tua của RIÊNG bài: chrome YouTube đã ẩn nên phải có thanh thay thế, và nó chạy theo
// khoảng [câu đầu → câu cuối] chứ không phải toàn bộ video (phần thừa hai đầu không thuộc bài).
function WatchSeek({
  t,
  start,
  end,
  onScrub,
  onCommit,
  overlay = false,
  controls,
}: {
  t: number;
  start: number;
  end: number;
  onScrub: (v: number) => void;
  onCommit: (v: number) => void;
  overlay?: boolean;
  controls?: React.ReactNode;
}) {
  const span = Math.max(0.1, end - start);
  const at = Math.min(span, Math.max(0, t - start));
  return (
    <div
      className={
        overlay
          ? "flex items-center gap-2.5 px-2 py-1.5 sm:px-3"
          : "flex items-center gap-2.5 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800 sm:px-4"
      }
    >
      <span
        className={`w-9 shrink-0 text-right text-xs font-semibold tabular-nums ${overlay ? "text-white/90" : "text-slate-500 dark:text-slate-400"}`}
      >
        {mmss(at)}
      </span>
      <input
        type="range"
        min={0}
        max={span}
        step={0.1}
        value={at}
        aria-label="Seek"
        onChange={(e) => onScrub(start + Number(e.target.value))}
        onPointerUp={(e) =>
          onCommit(start + Number((e.target as HTMLInputElement).value))
        }
        onKeyUp={(e) =>
          onCommit(start + Number((e.target as HTMLInputElement).value))
        }
        className={`h-1.5 flex-1 cursor-pointer appearance-none rounded-full accent-cyan-500 ${overlay ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700"}`}
        style={{
          backgroundImage: `linear-gradient(to right, rgb(6 182 212) ${(at / span) * 100}%, transparent ${(at / span) * 100}%)`,
        }}
      />
      <span
        className={`w-9 shrink-0 text-xs font-semibold tabular-nums ${overlay ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}
      >
        {mmss(span)}
      </span>
      {controls}
    </div>
  );
}

// CHẾ ĐỘ XEM — câu đang phát to ở giữa, câu kế mờ phía dưới để biết sắp tới đâu.
function WatchPanel({
  seg,
  next,
  subEn,
  subVi,
  size,
}: {
  seg: Seg;
  next?: Seg;
  subEn: boolean;
  subVi: boolean;
  size: number;
}) {
  const bare = !subEn && !subVi;
  const z = SUB_SIZES[size] ?? SUB_SIZES[1];
  return (
    <div className="flex min-h-[8.5rem] flex-col justify-center gap-2 bg-white px-4 py-7 text-center dark:bg-slate-900 sm:px-6 sm:py-8">
      {bare ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {t("userVideoProfile.practice.subtitlesOff")}
        </p>
      ) : (
        <>
          {subEn && (
            <p
              className={`font-semibold leading-relaxed text-slate-800 dark:text-slate-100 ${z.en}`}
            >
              {seg.text}
            </p>
          )}
          {subVi &&
            (seg.vi ? (
              <p
                className={`leading-relaxed text-cyan-700 dark:text-cyan-300 ${z.vi}`}
              >
                {seg.vi}
              </p>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {t("userVideoProfile.practice.noTranslation")}
              </p>
            ))}
          {subEn && next?.text && (
            <p className="mt-1 truncate text-sm text-slate-300 dark:text-slate-600">
              {next.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Ô điền dictation — phản hồi TỪNG KÝ TỰ. Dấu câu ĐẦU/CUỐI của từ (, . ! ? " …) LUÔN hiển thị
// (chỉ khoét phần chữ cần gõ) để câu không dính liền, mất nghĩa.
function Blank({
  word,
  alts,
  val,
  ok,
  hintChars,
  onFocus,
  refCb,
  onChange,
  onEnter,
  onStep,
}: {
  word: string;
  alts?: string[];
  val: string;
  ok: boolean;
  /** Leading letters opened by hints; a hinted letter the learner has typed becomes their own. */
  hintChars: number;
  onFocus: () => void;
  refCb: (el: HTMLInputElement | null) => void;
  onChange: (v: string) => void;
  onEnter: () => void;
  onStep: (dir: -1 | 1) => void;
}) {
  const lead = (word.match(/^[^A-Za-z0-9']+/) || [""])[0]; // dấu mở (" ¿ …)
  const trail = (word.match(/[^A-Za-z0-9']+$/) || [""])[0]; // dấu đóng (, . ! ? " …)
  const core = norm(word); // gồm chữ + dấu ' (vd "i'm")
  const { text: typed, over } = fitWord(word, val);
  // Typing a number out in words ("twenty twenty-four" for "2024"): the box grows and shows the
  // letters as typed instead of marking them wrong against the digits.
  const spelling =
    !!alts?.length && !!compactWord(val) && !compactWord(word).startsWith(compactWord(val)) &&
    alts.some((a) => compactWord(a).startsWith(compactWord(val)));
  const maxLen = Math.max(core.length, ...(alts ?? []).map((a) => a.length));
  const cells = spelling
    ? [<span key="alt" className="text-cyan-600 dark:text-cyan-400">{val}</span>]
    : Array.from({ length: core.length }, (_, i) => {
    const c = core[i];
    if (c === "'")
      return (
        <span key={i} className="text-slate-400 dark:text-slate-500">
          '
        </span>
      ); // dấu ' TỰ hiện — không cần gõ
    if (i < typed.length) {
      const good = typed[i] === c;
      return (
        <span key={i} className={good ? "text-emerald-500" : "text-rose-500"}>
          {typed[i]}
        </span>
      );
    }
    const showHint = i < hintChars;
    return (
      <span
        key={i}
        className={
          showHint ? "text-amber-400/80" : "text-slate-300 dark:text-slate-600"
        }
      >
        {showHint ? c : "*"}
      </span>
    );
  });
  // Ô nhập giữ NGUYÊN chữ user gõ (kể cả dấu tiếng Việt): không chặn phím, không ghi đè giữa chừng
  // → Backspace/IME chạy đúng như ô text thường. Trần độ dài để `maxLength` của TRÌNH DUYỆT lo —
  // nó chặn ở tầng native, không đụng buffer bộ gõ như preventDefault. Cells bên trên là bản đã gọt.
  return (
    <span className="mx-0.5 inline-block whitespace-nowrap">
      {lead && <span className="font-medium">{lead}</span>}
      <span className="relative inline-block">
        <input
          ref={refCb}
          value={val}
          maxLength={maxLen}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
          // Walking between boxes with the keyboard. Without this, a wrong letter in the box you
          // just left could only be reached with the mouse. Enter keeps its own meaning here:
          // jump to the next box still to be filled, or on to the next sentence.
          onKeyDown={(e) => {
            const ime = e.nativeEvent.isComposing || e.keyCode === 229;
            if (ime) return;
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
              return;
            }
            boxNavKeyDown(e, {
              prev: () => onStep(-1),
              next: () => onStep(1),
              keys: { enter: false },
            });
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          lang="en"
          style={{ width: `${(spelling ? Math.max(core.length, val.length) : core.length) + 0.4}ch` }}
          className="block bg-transparent text-left font-mono text-transparent caret-cyan-500 outline-none"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center font-mono tracking-normal"
        >
          {cells}
          {over && !spelling && (
            <span className="text-rose-500 line-through decoration-rose-400">
              {over}
            </span>
          )}
        </span>
        <span
          className={`pointer-events-none absolute inset-x-0 -bottom-0.5 h-[1.5px] rounded-full transition ${ok ? "bg-emerald-500" : "bg-gradient-to-r from-cyan-500 to-cyan-300"}`}
        />
      </span>
      {trail && <span className="font-medium">{trail}</span>}
    </span>
  );
}

// Căn TỪNG TỪ giữa câu gõ và đáp án (LCS): match (đúng) · miss (thiếu 1 từ đáp án) · extra (thừa từ gõ).
function alignWords(
  ans: string[],
  typed: string[],
): { t: "match" | "miss" | "extra"; w: string }[] {
  const a = ans.map(nak),
    b = typed.map(nak),
    m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: "match" | "miss" | "extra"; w: string }[] = [];
  let i = 0,
    j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ t: "match", w: ans[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: "miss", w: ans[i] });
      i++;
    } else {
      out.push({ t: "extra", w: typed[j] });
      j++;
    }
  }
  while (i < m) {
    out.push({ t: "miss", w: ans[i] });
    i++;
  }
  while (j < n) {
    out.push({ t: "extra", w: typed[j] });
    j++;
  }
  return out;
}

// ── HARDEST — gõ CẢ CÂU: textarea tự giãn 1↔2 dòng + icon Check inline (phím Enter).
// Check/Re-check → căn từng từ: ĐÚNG xanh · THIẾU `___` (đỏ, không lộ từ) · THỪA gạch ngang đỏ.
function HardestWork({
  seg,
  value,
  checked,
  done,
  onChange,
  onCheck,
  onNext,
}: {
  seg: Seg;
  value: string;
  checked: boolean;
  done: boolean;
  onChange: (v: string) => void;
  onCheck: () => void;
  onNext: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [value]);
  // Giữ NGUYÊN chữ user gõ — dấu tiếng Việt được bỏ lúc SO KHỚP (norm/nak), không phải lúc gõ.
  // Ghi đè giữa chừng làm bộ gõ lệch buffer (xoá không hết, gõ tiếp ra chữ lạ).
  const ans = splitWords(seg.text || "");
  const typed = splitWords(value).filter(Boolean);
  const ok =
    ans.length > 0 &&
    typed.length === ans.length &&
    ans.every((w, i) => nak(w) === nak(typed[i]));
  const parts = checked ? alignWords(ans, typed) : [];
  return (
    <div className="space-y-3">
      <div className="relative mx-auto max-w-2xl">
        <textarea
          ref={taRef}
          rows={1}
          value={value}
          readOnly={done}
          maxLength={(seg.text || "").length + 12}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            const ime = e.nativeEvent.isComposing || e.keyCode === 229;
            if (e.key === "Enter" && !e.shiftKey && !ime) {
              e.preventDefault();
              done ? onNext() : onCheck();
            }
          }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          lang="en"
          placeholder="Listen and type the whole sentence…"
          className={`w-full resize-none overflow-hidden rounded-xl border px-3.5 py-3 pr-11 text-base leading-relaxed outline-none transition read-only:opacity-80 dark:bg-slate-800 ${checked ? (ok ? "border-emerald-400 focus:border-emerald-500" : "border-rose-400 focus:border-rose-500") : "border-slate-300 focus:border-cyan-500 dark:border-slate-600"}`}
        />
        {/* Nút Check/Re-check/Next — ICON màu, nét đậm, KHÔNG viền/nền; căn giữa dọc */}
        <Tooltip label={done ? t("userVideoProfile.practice.nextSentence") : checked ? t("userVideoProfile.practice.recheck") : t("userVideoProfile.practice.checkSentenceEnter")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={done ? onNext : onCheck}
          aria-label={done ? "Next" : "Check"}
          className="flex size-7 items-center justify-center rounded-md text-cyan-600 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
        >
          {done ? (
            <ChevronRight className="h-5 w-5" strokeWidth={2.75} />
          ) : checked ? (
            <RotateCcw className="h-[18px] w-[18px]" strokeWidth={2.75} />
          ) : (
            <CornerDownLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
          )}
        </button>
        </Tooltip>
      </div>
      {checked && !ok && (
        <p className="mx-auto max-w-2xl text-center text-base leading-8">
          {parts.map((x, i) =>
            x.t === "match" ? (
              <span
                key={i}
                className="font-medium text-emerald-600 dark:text-emerald-400"
              >
                {x.w}{" "}
              </span>
            ) : x.t === "miss" ? (
              <span
                key={i}
                title="Missing word"
                className="font-mono text-rose-400 dark:text-rose-500"
              >
                ___{" "}
              </span>
            ) : (
              <span
                key={i}
                title="Extra word"
                className="text-rose-500 line-through decoration-rose-400/70"
              >
                {x.w}{" "}
              </span>
            ),
          )}
        </p>
      )}
    </div>
  );
}

/** Measured pace + a one-word verdict, with an arrow for which way to move. */
function PaceLine({ wpm, pausePct }: { wpm: number; pausePct?: number | null }) {
  const v = paceVerdict(wpm, pausePct);
  const tone = v.good
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-amber-600 dark:text-amber-400";
  // Arrow for "move this way", tick for nothing to fix, pause bars for a stop-start delivery.
  const Icon = v.move === "up" ? ArrowUp : v.move === "down" ? ArrowDown : v.good ? Check : Pause;
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[11px] text-slate-400">
      <span>
        {t("userVideoProfile.practice.speechPace", { wpm })}
        {pausePct != null && <>{t("userVideoProfile.practice.pausePercentage", { pct: pausePct })}</>}
      </span>
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon className="h-3 w-3" />
        {v.label}
      </span>
    </p>
  );
}

/**
 * The line to shadow, with a karaoke highlight when the lesson has word timings: the word being
 * spoken lights up, words already gone stay solid, words ahead sit muted. Used for BOTH phases —
 * driven by the media clock while the model plays, and by a local clock while the student records,
 * which is what makes it a pacer rather than decoration.
 *
 * Lessons built from subtitles carry no timings; then this is just the plain sentence it always was.
 */
function KaraokeLine({
  seg,
  at,
  recording,
  sizeCls,
}: {
  seg: Seg;
  at?: number | null;
  recording?: boolean;
  sizeCls?: string;
}) {
  const text = seg.text || "";
  const times = useMemo(
    () => alignWordTimes(text, seg.words, seg.start, seg.end),
    [text, seg.words, seg.start, seg.end],
  );
  const base = `text-center font-medium text-slate-700 dark:text-slate-200 ${sizeCls ?? "text-lg"}`;
  if (!times || at == null) return <p className={base}>{text}</p>;

  const live = recording ? "text-violet-600 dark:text-violet-400" : "text-cyan-600 dark:text-cyan-400";
  return (
    <p className={base}>
      {splitWords(text).map((w, i) => {
        const t = times[i];
        const done = t && at >= t.e;
        const now = t && at >= t.s && at < t.e;
        return (
          <span
            key={i}
            className={
              now
                ? `${live} font-bold transition-colors`
                : done
                  ? "transition-colors"
                  : "text-slate-400 transition-colors dark:text-slate-500"
            }
          >
            {w}{" "}
          </span>
        );
      })}
    </p>
  );
}

/** Plays the student's own take back — their recording never leaves the browser. */
function ReplayTake({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const el = ref.current;
        if (!el) return;
        if (playing) {
          el.pause();
          el.currentTime = 0;
          setPlaying(false);
        } else {
          void el.play();
        }
      }}
      className="inline-flex items-center gap-1 font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
    >
      <Ear className="h-3.5 w-3.5" />
      {playing ? t("userVideoProfile.practice.playing") : t("userVideoProfile.practice.listenAgain")}
      <audio
        ref={ref}
        src={url}
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        className="hidden"
      />
    </button>
  );
}

function ShadowWork({
  seg,
  result,
  takeUrl,
  armed,
  takeKey,
  sizeCls,
  showVi,
  silent,
  karaokeAt,
  recording,
  onRecordingChange,
  onRecorded,
  onForceSend,
  onDiscard,
  onRetry,
  onNext,
  hideRecorder,
}: {
  seg: Seg;
  result?: VideoShadowResult | "loading";
  takeUrl?: string;
  armed?: boolean;
  takeKey?: number; // bumping it remounts the recorder — see recordShadow
  sizeCls?: string; // font size of the practice line, from settings
  showVi?: boolean; // show the Vietnamese meaning under the line
  silent?: boolean; // last take had no voice in it → warn, do not grade
  karaokeAt?: number | null; // seconds into this line, or null when nothing is running
  recording?: boolean;
  onRecordingChange?: (on: boolean) => void;
  onRecorded: (b: Blob | null) => void;
  onForceSend: () => void;
  onDiscard: () => void; // drop a rejected take and go back to the idle mic — do NOT start recording
  onRetry: () => void;
  onNext: () => void;
  hideRecorder?: boolean;
}) {
  const words = result && result !== "loading" ? result.words : null;
  const scored = result && result !== "loading" ? result : null;
  return (
    <div className="space-y-3">
      <KaraokeLine seg={seg} at={result ? null : karaokeAt} recording={recording} sizeCls={sizeCls} />
      {showVi && seg.vi && (
        <p className="text-center text-sm italic leading-snug text-slate-500 dark:text-slate-400">
          {seg.vi}
        </p>
      )}
      {result === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Scoring…
        </div>
      ) : result ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-center gap-2">
            <Mic className="h-4 w-4 text-cyan-500" />
            <span className={`text-2xl font-bold ${scoreColor(result.score)}`}>
              {result.score}
            </span>
            <span className="text-xs text-slate-400">/100</span>
          </div>
          {/* Ba thành phần điểm — cùng cách chấm với bài đọc to (shared/reading.ts). */}
          {scored && (
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{t("userVideoProfile.practice.scoreFidelity")} <b className={scoreColor(scored.fidelity)}>{scored.fidelity}</b></span>
              <span>{t("userVideoProfile.practice.scoreFluency")} <b className={scoreColor(scored.fluency)}>{scored.fluency}</b></span>
              {scored.prosody != null && (
                <span>{t("userVideoProfile.practice.scoreProsody")} <b className={scoreColor(scored.prosody)}>{scored.prosody}</b></span>
              )}
              {scored.omissions > 0 && (
                <span className="text-rose-500">{t("userVideoProfile.practice.missingWords", { n: scored.omissions })}</span>
              )}
              {scored.insertions > 0 && (
                <span className="text-violet-500">{t("userVideoProfile.practice.extraWords", { n: scored.insertions })}</span>
              )}
            </p>
          )}
          {/* Delivery credit: fluency + prosody only count on words that came out clearly. */}
          {scored && scored.clarity < 90 && (
            <p className="text-center text-[11px] text-amber-600 dark:text-amber-400">
              {t("userVideoProfile.practice.clarityWarning", { pct: scored.clarity })}
            </p>
          )}
          {/* Measured pace — what the fluency score is actually based on — plus which way to move. */}
          {scored?.wpm != null && <PaceLine wpm={scored.wpm} pausePct={scored.pause_pct} />}
          {/* Tap a word for its score + transcription + per-phoneme grid, as in read-aloud. */}
          {words && (
            <div className={`mx-auto max-w-2xl leading-8 [&>p]:justify-center ${sizeCls ?? "text-base"}`}>
              <ScoredPassage words={words} />
              <WeakPhonemeLine words={words} minOccur={1} className="mt-2" />
              <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-slate-400">
                <span>{t("userVideoProfile.practice.tapWordForPhonemes")}</span>
                {takeUrl && <ReplayTake url={takeUrl} />}
              </p>
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Tooltip label={t("userVideoProfile.practice.reRecordTooltip")} side="top">
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />{" "}
                <span className="text-xs">Retry</span>
              </Button>
            </Tooltip>
            <Tooltip label={t("userVideoProfile.practice.nextSentenceTooltip")} side="top">
              <Button size="sm" onClick={onNext}>
                <span className="text-xs">Next</span>{" "}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : hideRecorder ? null : (
        <div className="space-y-2 py-2">
          {silent && (
            <div className="mx-auto max-w-md rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <p className="font-semibold">{t("userVideoProfile.practice.silentWarningTitle")}</p>
              <p className="mt-0.5">{t("userVideoProfile.practice.silentWarningDesc")}</p>
              {/* Re-record is the MAIN way out; sending anyway is the escape hatch for a false alarm. */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={onDiscard}
                  className="inline-flex items-center gap-1 text-xs font-bold text-cyan-600 transition hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t("userVideoProfile.practice.reRecord")}
                </button>
                <button
                  onClick={onForceSend}
                  className="text-xs font-semibold underline decoration-dotted hover:no-underline"
                >
                  {t("userVideoProfile.practice.forceSend")}
                </button>
              </div>
            </div>
          )}
          <div className="flex justify-center">
            <AudioRecorder
              key={takeKey}
              maxSeconds={20}
              autoStart={armed}
              recordLabel={t("userVideoProfile.practice.recordPrompt")}
              hint=""
              onRecordingChange={onRecordingChange}
              onRecorded={onRecorded}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Thanh CHẠY TỰ ĐỘNG (shadowing): bật là máy phát câu → chừa khoảng lặng để nói theo → sang câu kế,
 * hết chặng 10 câu thì dừng. Ô "Score each line" bật ghi âm + chấm từng câu (tốn quota nên mặc định tắt).
 */
// Tổng kết một chặng vừa chạy xong. CHỈ vài con số của cả chặng — chi tiết từng câu ở drawer
// riêng, nơi có chỗ mà bày. Chặng KHÔNG phải một đơn vị chấm điểm: điểm luôn gắn với từng CÂU
// (giữ lượt tốt nhất), nên đây là thống kê trên đúng các câu đó chứ không phải một "điểm chặng".
function AutoSummary({
  range,
  rows,
  onDetail,
  onClose,
}: {
  range: { from: number; to: number };
  rows: { i: number; result: VideoShadowResult | null }[];
  onDetail: () => void;
  onClose: () => void;
}) {
  const scored = rows.filter((r) => r.result);
  const avg = scored.length
    ? Math.round(scored.reduce((n, r) => n + (r.result?.score ?? 0), 0) / scored.length)
    : 0;
  const worst = scored.reduce<typeof scored[number] | null>(
    (m, r) => (!m || (r.result?.score ?? 0) < (m.result?.score ?? 0) ? r : m),
    null,
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
        {t("userVideoProfile.practice.sectionCompleted", { from: range.from + 1, to: range.to + 1 })}
      </span>
      {scored.length ? (
        <>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("userVideoProfile.practice.averageScore")} <b className={scoreColor(avg)}>{avg}</b>
            <span className="text-slate-400">{t("userVideoProfile.practice.sentencesScored", { scored: scored.length, total: rows.length })}</span>
          </span>
          {worst && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t("userVideoProfile.practice.worstSentence", { n: worst.i + 1 })}
              <b className={scoreColor(worst.result?.score ?? 0)}>{worst.result?.score}</b>
            </span>
          )}
          <button
            type="button"
            onClick={onDetail}
            className="rounded-lg px-2 py-1 text-xs font-bold text-cyan-600 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
          >
            {t("userVideoProfile.practice.details")}
          </button>
        </>
      ) : (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t("userVideoProfile.practice.unscoredSectionNotice")}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("userVideoProfile.practice.closeSummary")}
        className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Trạng thái CHẶNG TỰ ĐỘNG khi đang chạy: đang ở câu nào, đang nghe hay tới lượt nói, và nút
// dừng. Bật/tắt · số câu mỗi chặng · chấm từng câu đều nằm trong popover cài đặt — thanh này chỉ
// nói "đang xảy ra gì", không phải một bảng điều khiển thứ hai.
function AutoStatus({
  on,
  phase,
  score,
  cur,
  end,
  onStop,
}: {
  on: boolean;
  phase: "listen" | "repeat" | null;
  score: boolean;
  cur: number;
  end: number | null;
  onStop: () => void;
}) {
  if (!on) return <span />;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-500/40 dark:bg-violet-500/10">
      <button
        type="button"
        onClick={onStop}
        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-rose-600"
      >
        <Square className="h-3.5 w-3.5 fill-current" /> {t("userVideoProfile.practice.stop")}
      </button>
      <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
        {t("userVideoProfile.practice.sentenceNum", { n: cur + 1 })}
        {end != null && <>/{end + 1}</>} ·{" "}
        {phase === "repeat" ? (score ? t("userVideoProfile.practice.phaseRepeatRecording") : t("userVideoProfile.practice.phaseRepeat")) : t("userVideoProfile.practice.phaseListen")}
      </span>
    </div>
  );
}

function ControlBar({
  onPrev,
  onPlay,
  onPause,
  onNext,
  canPrev,
  canNext,
  playing,
  played,
  stage = false,
  label,
}: {
  onPrev: () => void;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  playing: boolean;
  played: boolean;
  stage?: boolean;
  label?: string;
}) {
  const showReplay = played && !playing;
  return (
    <div
      className={
        stage
          ? "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800/80 dark:bg-slate-950"
          : "relative flex items-center justify-center gap-2 overflow-hidden border-b border-slate-200 bg-white px-4 py-6 dark:border-slate-800/80 dark:bg-slate-950 sm:gap-4 sm:px-8"
      }
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-white to-indigo-50/60 dark:from-cyan-950/50 dark:via-slate-950 dark:to-indigo-950/45" />
      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-50 [background-image:radial-gradient(rgba(148,163,184,0.13)_1px,transparent_1.5px)] [background-size:15px_15px]" />
      <CenterWave playing={playing} prominent={stage} />
      <div className="relative z-10 flex shrink-0 items-center gap-2.5 sm:gap-4">
        <Tooltip label={`Previous line · ${MOD}+←`}>
          <button
            onClick={onPrev}
            disabled={!canPrev}
            aria-label="Previous"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-md shadow-slate-900/10 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:border-slate-600/60 dark:bg-slate-800 dark:text-slate-200 dark:shadow-black/40 dark:hover:bg-slate-700 dark:hover:text-white sm:size-12"
          >
            <SkipBack className="h-4 w-4 fill-current sm:h-5 sm:w-5" />
          </button>
        </Tooltip>
        <Tooltip
          label={`${playing ? "Pause" : showReplay ? "Replay" : "Play"} · ${MOD}+Space`}
        >
          <button
            onClick={playing ? onPause : onPlay}
            aria-label={playing ? "Pause" : showReplay ? "Replay" : "Play"}
            className="group relative shrink-0"
          >
            <span
              aria-hidden
              className={`absolute -inset-1.5 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 blur-lg transition ${playing ? "animate-pulse opacity-75" : "opacity-45 group-hover:opacity-70"}`}
            />
            {playing && (
              <span
                aria-hidden
                className="absolute inset-[-3px] rounded-full border-2 border-transparent border-t-cyan-300 border-r-indigo-400 animate-spin"
              />
            )}
            <span className="relative block rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 p-[2px] shadow-xl shadow-indigo-900/30 dark:shadow-indigo-900/40">
              <span className="flex size-[52px] items-center justify-center rounded-full bg-white transition group-hover:bg-slate-50 dark:bg-slate-950 dark:group-hover:bg-slate-900 sm:size-16">
                {playing ? (
                  <Pause className="size-5 fill-slate-800 text-slate-800 dark:fill-white dark:text-white sm:size-6" />
                ) : showReplay ? (
                  <RotateCcw className="size-5 text-slate-800 dark:text-white sm:size-6" />
                ) : (
                  <Play className="ml-0.5 size-6 fill-slate-800 text-slate-800 dark:fill-white dark:text-white sm:size-7" />
                )}
              </span>
            </span>
          </button>
        </Tooltip>
        <Tooltip label={`Next line · ${MOD}+→`}>
          <button
            onClick={onNext}
            disabled={!canNext}
            aria-label="Next"
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-md shadow-slate-900/10 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:border-slate-600/60 dark:bg-slate-800 dark:text-slate-200 dark:shadow-black/40 dark:hover:bg-slate-700 dark:hover:text-white sm:size-12"
          >
            <SkipForward className="h-4 w-4 fill-current sm:h-5 sm:w-5" />
          </button>
        </Tooltip>
      </div>
      {stage && label && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Headphones className="h-3.5 w-3.5" /> Audio · {label}
          </span>
        </div>
      )}
    </div>
  );
}

function CenterWave({
  playing,
  prominent = false,
}: {
  playing: boolean;
  prominent?: boolean;
}) {
  const base = prominent ? 0.1 : 0.06;
  const range = prominent ? 0.22 : 0.12;
  const hScale = prominent ? 0.5 : 1;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 flex items-center justify-center blur-[0.3px] [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)] ${prominent ? "gap-[7px] px-6 sm:gap-[10px]" : "gap-[5px] px-5 sm:gap-[6px]"}`}
    >
      <style>{`@keyframes cbwave{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1)}}`}</style>
      {BARS.map((h, i) => {
        const t = i / (BARS.length - 1);
        return (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${h * hScale}%`,
              backgroundColor: barColor(t),
              opacity: base + range * (h / 100),
              ...(playing
                ? {
                    animation: `cbwave ${900 + (i % 7) * 120}ms ${(i % 11) * 60}ms ease-in-out infinite`,
                  }
                : null),
            }}
          />
        );
      })}
    </div>
  );
}

function CelebrateOverlay({ grade }: { grade: Grade }) {
  const ui = GRADE_UI[grade];
  const tone =
    grade === "exactly"
      ? "bg-emerald-500"
      : grade === "good"
        ? "bg-cyan-500"
        : "bg-amber-500";
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-end gap-1.5 pb-5 sm:pb-7">
      <style>{`@keyframes cheerpop{0%{transform:scale(.4);opacity:0}40%{transform:scale(1.18);opacity:1}70%{transform:scale(.96)}100%{transform:scale(1);opacity:1}}@keyframes cheerfloat{0%{transform:translateY(4px)}100%{transform:translateY(-5px)}}`}</style>
      <span
        className="text-5xl drop-shadow-xl sm:text-6xl"
        style={{
          animation:
            "cheerpop .55s ease-out both, cheerfloat 1.3s ease-in-out .55s infinite alternate",
        }}
      >
        {ui.emoji}
      </span>
      <span
        className={`rounded-full px-4 py-1.5 text-lg font-extrabold text-white shadow-lg sm:text-xl ${tone}`}
        style={{ animation: "cheerpop .55s ease-out both" }}
      >
        {ui.label}!
      </span>
    </div>
  );
}

function PlaybackControls({
  vol,
  setVol,
  rate,
  setRate,
  onVideo = false,
}: {
  vol: number;
  setVol: (n: number) => void;
  rate: number;
  setRate: (n: number) => void;
  /** Đặt ĐÈ trên khung hình (thanh tua chế độ xem) → tông trắng trên nền tối. */
  onVideo?: boolean;
}) {
  const RATES = [0.5, 0.75, 1, 1.25, 1.5];
  const trig = onVideo
    ? "flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-white/90 transition hover:bg-white/15"
    : "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";
  return (
    <div className="flex items-center gap-0.5">
      <Popover
        side="up"
        align="left"
        ariaLabel="Volume"
        triggerClassName={trig}
        panelClassName="w-56 p-3"
        trigger={
          vol === 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )
        }
      >
        {() => (
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                Volume
              </span>
              <span className="text-xs font-bold tabular-nums text-cyan-600 dark:text-cyan-300">
                {vol}%
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <style>{`.msyen-vol{-webkit-appearance:none;appearance:none;height:6px;border-radius:9999px;outline:none}.msyen-vol::-webkit-slider-runnable-track{height:6px;border-radius:9999px;background:transparent}.msyen-vol::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin-top:-5px;border-radius:9999px;background:#22d3ee;box-shadow:0 0 0 4px rgba(34,211,238,.2),0 1px 4px rgba(0,0,0,.45);cursor:pointer}.msyen-vol::-moz-range-track{height:6px;border-radius:9999px;background:#334155}.msyen-vol::-moz-range-progress{height:6px;border-radius:9999px;background:#22d3ee}.msyen-vol::-moz-range-thumb{width:16px;height:16px;border:none;border-radius:9999px;background:#22d3ee;box-shadow:0 0 0 4px rgba(34,211,238,.2);cursor:pointer}`}</style>
              <VolumeX className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="range"
                min={0}
                max={100}
                value={vol}
                onChange={(e) => setVol(+e.target.value)}
                className="msyen-vol flex-1 cursor-pointer"
                style={{
                  background: `linear-gradient(to right,#22d3ee 0%,#06b6d4 ${vol}%,#334155 ${vol}%,#334155 100%)`,
                }}
              />
              <Volume2 className="h-4 w-4 shrink-0 text-slate-400" />
            </div>
          </div>
        )}
      </Popover>
      <Popover
        side="up"
        align="left"
        ariaLabel="Speed"
        triggerClassName={trig}
        panelClassName="!min-w-0 w-24 p-1"
        trigger={
          <>
            <Gauge className="h-4 w-4" />{" "}
            <span className="text-xs font-semibold tabular-nums">{rate}×</span>
          </>
        }
      >
        {(close) => (
          <div className="space-y-0.5">
            {RATES.map((r) => (
              <PopoverItem
                key={r}
                active={r === rate}
                onClick={() => {
                  setRate(r);
                  close();
                }}
              >
                <span className="flex-1 tabular-nums">{r}×</span>
                {r === rate && <Check className="h-3.5 w-3.5" />}
              </PopoverItem>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

function HeroWave({ mode }: { mode: VideoMode }) {
  const dict = mode === "dictation";
  const step = 9,
    bw = 4,
    H = 160;
  const width = WAVE.length * step;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 flex w-[72%] items-center justify-end sm:w-[58%]"
    >
      <svg
        viewBox={`0 0 ${width} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full opacity-25 blur-[0.5px] sm:opacity-40 dark:opacity-40 dark:sm:opacity-60 [mask-image:linear-gradient(to_right,transparent,black_48%,black_78%,transparent)]"
      >
        <defs>
          <linearGradient id="hw-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={dict ? "#0e7490" : "#4338ca"} />
            <stop offset="0.6" stopColor={dict ? "#0891b2" : "#6d28d9"} />
            <stop offset="1" stopColor={dict ? "#4f46e5" : "#9333ea"} />
          </linearGradient>
        </defs>
        {WAVE.map((h, i) => (
          <rect
            key={i}
            x={i * step}
            y={(H - h) / 2}
            width={bw}
            height={h}
            rx={bw / 2}
            fill="url(#hw-grad)"
            opacity={0.1 + 0.28 * (h / 140)}
          />
        ))}
      </svg>
    </div>
  );
}

function ModeSwitcher({
  mode,
  onPick,
  full = false,
}: {
  mode: VideoMode;
  onPick: (m: VideoMode) => void;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const opts: { id: VideoMode; icon: LucideIcon; active: string }[] = [
    {
      id: "dictation",
      icon: PenLine,
      active: "text-cyan-600 dark:text-cyan-300",
    },
    {
      id: "shadowing",
      icon: Mic,
      active: "text-violet-600 dark:text-violet-300",
    },
  ];
  const CurIcon = mode === "dictation" ? PenLine : Mic;
  return (
    <div className={`relative ${full ? "flex-1 sm:flex-none" : ""}`}>
      <Tooltip label={t("userVideoProfile.practice.switchMode")} side="bottom" className={full ? "w-full sm:w-auto" : ""}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${TOP_BTN} h-10 gap-1.5 px-3 text-sm font-semibold ${full ? "w-full justify-center sm:w-auto" : ""}`}
      >
        <CurIcon
          className={`h-4 w-4 ${mode === "dictation" ? "text-cyan-600 dark:text-cyan-300" : "text-violet-600 dark:text-violet-300"}`}
        />{" "}
        {MODE_LABEL[mode]}
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-70 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      </Tooltip>
      {open && (
        <>
          <button
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-black/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40">
            {opts.map((o) => {
              const Icon = o.icon;
              const isCur = o.id === mode;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    onPick(o.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-semibold transition hover:bg-slate-100 dark:hover:bg-slate-800 ${isCur ? o.active : "text-slate-600 dark:text-slate-300"}`}
                >
                  <Icon className="h-4 w-4" /> {MODE_LABEL[o.id]}
                  {isCur && <Check className="ml-auto h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MetaChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
    </span>
  );
}
// `score` → con số ăn màu theo thang điểm (như mọi chỗ khác hiện điểm). Không truyền thì giữ màu chữ thường.
function Chip({ label, value, score }: { label: string; value: string; score?: number | null }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span
        className={`text-base font-bold ${score != null ? scoreColor(score) : "text-slate-700 dark:text-slate-200"}`}
      >
        {value}
      </span>
    </span>
  );
}
