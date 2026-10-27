import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpDown,
  Braces,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  FolderOpen,
  GripVertical,
  Headphones,
  Link2,
  ListChecks,
  Loader2,
  FileText,
  MessageSquare,
  PenLine,
  BookText,
  Plus,
  RefreshCw,
  Languages,
  Rows3,
  Save,
  Pencil,
  Search,
  Settings2,
  ClipboardPaste,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import {
  BLUEPRINTS,
  blueprintsForSkill,
  getBlueprint,
  inferTemplateId,
  QTYPE_LABEL,
  QTYPE_LABEL_EN,
  SKILL_LIST,
  type AudioCues,
  CEFR_BANDS,
  type Cefr,
  type Topic,
  type ExerciseInput,
  type IpaLine,
  type PracticeMode,
  type PracticeSource,
  type Skill,
  type VideoSegment,
  type VocabActivity,
  type VocabDeckConfig,
} from "@msyen/shared";
import PracticeSegmentsEditor from "../../components/teacher/PracticeSegmentsEditor";
import {
  VocabDeckBuilder,
  type VocabDeckHandle,
  type VocabItemForm,
} from "../../components/vocab/DeckBuilder";

// Mô tả "Dạng mục" bằng tiếng Anh cho prompt (nhãn tiếng Việt ở UI).
const ITEM_FORM_EN: Record<VocabItemForm, string> = {
  word: "single words only",
  phrase: "phrases only (collocations, phrasal verbs, short idioms)",
  both: "a mix of single words and phrases",
};
const ITEM_FORM_OPTIONS: { value: string; label: TKey }[] = [
  { value: "both", label: "teacherExerciseEditor.vocab.itemForm.both" },
  { value: "word", label: "teacherExerciseEditor.vocab.itemForm.word" },
  { value: "phrase", label: "teacherExerciseEditor.vocab.itemForm.phrase" },
];
import { skillUi } from "../../lib/skills";
import { TemplatePicker } from "../../components/TemplatePicker";
import { MultiCheckPopover } from "../../components/MultiCheckPopover";
import { NumberInput } from "../../components/NumberInput";
import { GenTemplatesBar } from "../../components/GenTemplatesBar";
import {
  aiApi,
  aiJobsApi,
  audioApi,
  exercisesApi,
  levelsApi,
  publicGrammar,
  teacherUsersApi,
  teacherReadingApi,
  tagsApi,
  topicsApi,
  uploadAudio,
  type AudioCuesResp,
} from "../../lib/api";
import {
  Button,
  IconBox,
  Input,
  Select,
  Textarea,
  Toggle,
} from "../../components/ui";
import { cn } from "../../lib/utils";
import { useOverlayHistory } from "../../lib/useOverlayHistory";
import { useGoBack } from "../../lib/navState";
import { ImagePicker } from "../../components/ImagePicker";
import { HeroDecor } from "../../components/HeroDecor";
import { JsonEditor } from "../../components/JsonEditor";
import { AudioPlayer } from "../../components/AudioPlayer";
import { levelSelectOptions } from "../../lib/levels";
import { TopicPicker } from "../../components/TopicPicker";
import TagManagerPopover from "../../components/TagManagerPopover";
import { confirmAsk } from "../../components/confirm";
import { Tooltip } from "../../components/Tooltip";
import GrammarPicker, { GrammarTagBadge } from "../../components/GrammarPicker";
import Drawer from "../../components/Drawer";
import { getLang, t, type TKey } from "../../i18n";

let KSEQ = 0;
const nextKey = () => `k${++KSEQ}`;

type QType =
  "multiple_choice" | "fill_blank" | "matching" | "ordering" | "categorize" | "translate";

interface PairDraft {
  left: string;
  right: string;
}
interface ItemDraft {
  text: string;
  category: string;
}

interface QDraft {
  _k: string;
  type: QType;
  question: string;
  image: string;
  // multiple_choice
  options: string[];
  answerIdx: number; // -1 nếu chưa chọn
  // fill_blank
  accept: string[];
  // matching
  pairs: PairDraft[];
  // ordering
  tokens: string[];
  orderAnswer: string; // câu đúng
  // categorize
  categories: string[];
  items: ItemDraft[];
  // translate — `question` holds the Vietnamese prompt, `accept` the alternative renderings
  translateAnswer: string; // the canonical English sentence
  articleLenient: boolean; // forgive an a/an/the-only difference
  // chung
  wordBank: string; // nhập dạng "a, b, c"
  explanation: string; // giải thích đáp án ("" = không) — hiện khi chữa bài
  hint: string; // gợi ý (đoạn hội thoại/manh mối) — mở trước khi chấm, câu đó chỉ còn 50% điểm
  grammarId: string; // điểm ngữ pháp câu này nhắm tới ("" = chưa gắn).
}

interface WDraft {
  _k: string;
  word: string;
  ipa: string;
  meaning: string;
  example: string;
  pos: string;
}

interface EditorState {
  exercise_id?: string;
  orig_slug?: string; // slug LÚC NẠP bài — để phát hiện đổi slug (rename) khi lưu bài cũ
  title: string;
  skill: string;
  level: string; // giữ round-trip qua JSON, không hiện ở form
  tags: string[]; // giữ round-trip qua JSON
  topic_id: string; // chủ đề chính (topics.id) — chọn ở form
  tag_id: string; // nhãn của cô (tags.id) — quyết định phạm vi; "" = Tất cả.
  published: boolean;
  image: string; // ảnh bìa (thumbnail thư viện user) — áp mọi loại bài
  template_id: string; // dạng bài (blueprint) — xem blueprints.ts
  gen_config: Record<string, unknown> | null; // config AI đã dùng (để tạo lại)
  read_aloud: boolean;
  // Writing prompt + outline (one item per line).
  speaking_prompt: string;
  speaking_outline: string; // mỗi dòng = 1 ý
  speaking_phrases: string; // mỗi dòng = 1 cụm từ
  speaking_sample: string; // bài mẫu (ẩn với học sinh)
  speaking_image: string; // URL ảnh minh hoạ (bài tả tranh)
  passage: string;
  passage_ipa: IpaLine[];
  audio_url: string;
  audio_script: string;
  audio_voice: string; // nhãn giọng đã tạo audio ("azure / en-US-JennyNeural") — chỉ đọc, để nhận dạng
  dictation_mode: string; // chế độ bài nghe–chép: "" (=mask) | mask | gap | full
  translate_level: string; // mức gợi ý câu dịch: "" (=easy) | easy | medium | hard | hardest
  audio_cues: AudioCuesResp | null; // phụ đề đồng bộ (đi kèm audio TTS)
  // Dictation & Shadowing (theo câu): nguồn + đoạn. Xem PracticeSegmentsEditor.
  media_source: string; // "" | "audio" | "video"
  youtube_id: string;
  video: boolean; // cờ "bài luyện-theo-đoạn"
  video_segments: VideoSegment[];
  video_modes: PracticeMode[];
  wordlist: WDraft[];
  // Bộ thẻ từ vựng (vocab v2) — KHÔNG sửa được trong trình soạn, chỉ mang theo để lưu lại
  // không làm mất bộ thẻ. Tạo/sửa deck ở tab AI.
  vocab_deck: VocabDeckConfig | null;
  questions: QDraft[];
}

const EMPTY: EditorState = {
  title: "",
  skill: "",
  level: "",
  tags: [],
  topic_id: "",
  tag_id: "",
  published: true,
  image: "",
  template_id: "",
  gen_config: null,
  read_aloud: false,
  speaking_prompt: "",
  speaking_outline: "",
  speaking_phrases: "",
  speaking_sample: "",
  speaking_image: "",
  passage: "",
  passage_ipa: [],
  audio_url: "",
  audio_script: "",
  audio_voice: "",
  dictation_mode: "",
  translate_level: "",
  audio_cues: null,
  media_source: "",
  youtube_id: "",
  video: false,
  video_segments: [],
  video_modes: ["dictation", "shadowing"],
  wordlist: [],
  vocab_deck: null,
  questions: [],
};

// Khung mẫu speaking nhập ở textarea (mỗi dòng 1 mục) ⇄ mảng.
const linesToArr = (s: string): string[] =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const arrToLines = (a: unknown): string =>
  Array.isArray(a) ? (a as string[]).join("\n") : "";

const BLANK_DRAFT: Omit<QDraft, "_k" | "type"> = {
  question: "",
  image: "",
  options: [],
  answerIdx: -1,
  accept: [],
  pairs: [],
  tokens: [],
  orderAnswer: "",
  categories: [],
  items: [],
  translateAnswer: "",
  articleLenient: true,
  wordBank: "",
  explanation: "",
  hint: "",
  grammarId: "",
};

function newQuestion(type: QType): QDraft {
  const d: QDraft = { ...BLANK_DRAFT, _k: nextKey(), type };
  if (type === "multiple_choice") d.options = ["", ""];
  else if (type === "fill_blank") d.accept = [""];
  else if (type === "matching")
    d.pairs = [
      { left: "", right: "" },
      { left: "", right: "" },
    ];
  else if (type === "categorize") {
    d.categories = ["", ""];
    d.items = [{ text: "", category: "" }];
  } else if (type === "translate") d.accept = [""];
  return d;
}

const ALL_TYPES: QType[] = [
  "multiple_choice",
  "fill_blank",
  "matching",
  "ordering",
  "categorize",
  "translate",
];

// Nút "thêm câu" theo dạng — lọc theo allowedTypes của template (blueprint) đang chọn.
const ADD_BTNS: { type: QType; label: string; Icon: typeof ListChecks }[] = [
  { type: "multiple_choice", label: "Multiple choice", Icon: ListChecks },
  { type: "fill_blank", label: "Gap fill", Icon: SquarePen },
  { type: "matching", label: "Matching", Icon: Link2 },
  { type: "ordering", label: "Ordering", Icon: ArrowUpDown },
  { type: "categorize", label: "Categorize", Icon: Rows3 },
  { type: "translate", label: "Translate", Icon: Languages },
];

// Scaffolding rungs for the translate questions — each one takes a support away, see grammarDrill.ts.
const TRANSLATE_LEVEL_OPTIONS: { value: string; label: TKey }[] = [
  { value: "easy", label: "teacherExerciseEditor.translateLevel.easy" },
  { value: "medium", label: "teacherExerciseEditor.translateLevel.medium" },
  { value: "hard", label: "teacherExerciseEditor.translateLevel.hard" },
  { value: "hardest", label: "teacherExerciseEditor.translateLevel.hardest" },
];

// ---- Chuyển đổi giữa draft và dữ liệu API ----
type ApiPair = {
  left: string;
  right: string;
  left_image?: string | null;
  right_image?: string | null;
};
type ApiItem = { text: string; category: string; image?: string | null };
type ApiQuestion = {
  type: QType;
  question: string;
  image?: string | null;
  options?: string[] | null;
  answer?: string | null;
  accept?: string[] | null;
  pairs?: ApiPair[] | null;
  tokens?: string[] | null;
  categories?: string[] | null;
  items?: ApiItem[] | null;
  word_bank?: string[] | null;
  article_lenient?: boolean | null;
  explanation?: string | null;
  hint?: string | null;
  grammar_id?: string | null;
};
type ApiWord = {
  word: string;
  ipa?: string | null;
  meaning?: string | null;
  example?: string | null;
  pos?: string | null;
};

function draftsFromQuestions(qs: ApiQuestion[] | undefined | null): QDraft[] {
  return (qs ?? []).map((q) => {
    const options = q.options ?? [];
    const type = (ALL_TYPES as string[]).includes(q.type)
      ? q.type
      : "multiple_choice";
    return {
      _k: nextKey(),
      type,
      question: q.question ?? "",
      image: q.image ?? "",
      options,
      answerIdx:
        q.answer != null ? options.findIndex((o) => o === q.answer) : -1,
      accept: q.accept ?? [],
      pairs: (q.pairs ?? []).map((p) => ({ left: p.left, right: p.right })),
      tokens: q.tokens ?? [],
      orderAnswer: type === "ordering" ? (q.answer ?? "") : "",
      translateAnswer: type === "translate" ? (q.answer ?? "") : "",
      articleLenient: q.article_lenient !== false,
      categories: q.categories ?? [],
      items: (q.items ?? []).map((it) => ({
        text: it.text,
        category: it.category,
      })),
      wordBank: (q.word_bank ?? []).join(", "),
      explanation: q.explanation ?? "",
      hint: q.hint ?? "",
      grammarId: q.grammar_id ?? "",
    };
  });
}

function wordsFromWordlist(wl: ApiWord[] | undefined | null): WDraft[] {
  return (wl ?? []).map((w) => ({
    _k: nextKey(),
    word: w.word ?? "",
    ipa: w.ipa ?? "",
    meaning: w.meaning ?? "",
    example: w.example ?? "",
    pos: w.pos ?? "",
  }));
}

function draftToApiQuestion(d: QDraft): ApiQuestion {
  const base = {
    type: d.type,
    question: d.question.trim(),
    image: d.image.trim() || null,
    word_bank: parseList(d.wordBank),
    explanation: d.explanation.trim() || null,
    hint: d.hint.trim() || null,
    grammar_id: d.grammarId || null,
  };
  switch (d.type) {
    case "multiple_choice":
      return {
        ...base,
        options: d.options.map((o) => o.trim()).filter(Boolean),
        answer:
          d.answerIdx >= 0 ? d.options[d.answerIdx]?.trim() || null : null,
      };
    case "fill_blank":
      return { ...base, accept: d.accept.map((a) => a.trim()).filter(Boolean) };
    case "matching":
      return {
        ...base,
        pairs: d.pairs
          .map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
          .filter((p) => p.left && p.right),
      };
    case "ordering": {
      let tokens = d.tokens.map((t) => t.trim()).filter(Boolean);
      if (!tokens.length)
        tokens = d.orderAnswer.trim().split(/\s+/).filter(Boolean);
      // `accept` carries the alternative word orders. It has no field in this editor, so pass it
      // through untouched — dropping it here would wipe what the AI authored on the first save.
      return { ...base, tokens, answer: d.orderAnswer.trim(), accept: d.accept.map((a) => a.trim()).filter(Boolean) };
    }
    case "translate":
      return {
        ...base,
        answer: d.translateAnswer.trim(),
        accept: d.accept.map((a) => a.trim()).filter(Boolean),
        article_lenient: d.articleLenient,
      };
    case "categorize":
      return {
        ...base,
        categories: d.categories.map((c) => c.trim()).filter(Boolean),
        items: d.items
          .map((it) => ({ text: it.text.trim(), category: it.category }))
          .filter((it) => it.text && it.category),
      };
    default:
      return base;
  }
}

function parseList(s: string): string[] | null {
  const arr = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

// Sinh slug bám sát server (saveExercise.slugify) — chỉ để XEM TRƯỚC / gợi ý khi gõ.
function slugifyClient(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

// Slug (exercise_id) hiển thị/sửa INLINE cạnh nhãn Tiêu đề. Bấm để sửa; để trống (bài mới)
// = tự sinh từ tiêu đề khi lưu. Đổi slug bài CŨ đổi luôn URL → parent xử lý cảnh báo link cũ.
function SlugInline({
  slug,
  title,
  isNew,
  origSlug,
  onChange,
}: {
  slug?: string;
  title: string;
  isNew: boolean;
  origSlug?: string;
  onChange: (v: string | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = slug || slugifyClient(title);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  const start = () => {
    setDraft(slug || slugifyClient(title));
    setEditing(true);
  };
  const commit = () => {
    const v = slugifyClient(draft);
    onChange(v || (isNew ? undefined : origSlug)); // rỗng: bài mới → auto-sinh; bài cũ → giữ slug gốc
    setEditing(false);
  };
  if (editing) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs">
        <span className="text-slate-400">/</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={t("teacherExerciseEditor.slug.placeholder")}
          className="w-64 max-w-[60vw] rounded-md border border-cyan-400 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700 focus:outline-none dark:bg-slate-900 dark:text-slate-200"
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      title={t("teacherExerciseEditor.slug.editTitle")}
      className="group inline-flex min-w-0 items-center gap-1 font-mono text-xs text-slate-400 transition hover:text-cyan-600 dark:hover:text-cyan-400"
    >
      <span className="truncate">/{preview || t("teacherExerciseEditor.slug.autoGenerated")}</span>
      <Pencil className="size-3 shrink-0 opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function buildInput(form: EditorState): ExerciseInput {
  const wordlist = form.wordlist
    .map((w) => ({
      word: w.word.trim(),
      ipa: w.ipa.trim() || undefined,
      meaning: w.meaning.trim() || undefined,
      example: w.example.trim() || undefined,
      pos: w.pos.trim() || undefined,
    }))
    .filter((w) => w.word);
  return {
    exercise_id: form.exercise_id,
    // Đổi slug bài CŨ → gửi slug gốc để server đổi tên đúng bản (không tạo bản trùng).
    rename_from:
      form.orig_slug && form.exercise_id && form.orig_slug !== form.exercise_id
        ? form.orig_slug
        : undefined,
    title: form.title.trim(),
    published: form.published,
    skill: (form.skill || null) as ExerciseInput["skill"],
    level: form.level || null,
    tags: form.tags.length ? form.tags : null,
    topic_id: form.topic_id || null,
    tag_id: form.tag_id || null,
    layer: null,
    image: form.image.trim() || null,
    template_id: form.template_id || null,
    gen_config: form.gen_config,
    read_aloud: form.read_aloud,
    speaking_prompt: form.speaking_prompt || null,
    speaking_framework: form.speaking_outline.trim() || form.speaking_phrases.trim()
      ? {
          outline: linesToArr(form.speaking_outline),
          phrases: linesToArr(form.speaking_phrases),
        }
      : null,
    speaking_sample: form.speaking_sample.trim() || null,
    speaking_image: form.speaking_image.trim() || null,
    passage: form.passage || null,
    passage_ipa: form.passage_ipa.length ? form.passage_ipa : null,
    audio_url: form.audio_url || null,
    audio_script: form.audio_script || null,
    audio_voice: form.audio_voice || null,
    dictation_mode: (form.dictation_mode ||
      null) as ExerciseInput["dictation_mode"],
    translate_level: (form.translate_level ||
      null) as ExerciseInput["translate_level"],
    audio_cues: form.audio_cues,
    // Dictation & Shadowing (theo câu)
    media_source: (form.media_source || null) as ExerciseInput["media_source"],
    video: form.video,
    youtube_id: form.youtube_id || null,
    video_segments: form.video_segments.length ? form.video_segments : null,
    video_modes: form.video_modes.length ? form.video_modes : null,
    wordlist: wordlist.length ? (wordlist as ExerciseInput["wordlist"]) : null,
    vocab_deck: form.vocab_deck,
    questions: form.questions.map(
      draftToApiQuestion,
    ) as ExerciseInput["questions"],
  };
}

function normalizeObject(obj: unknown, fallbackId?: string): ExerciseInput {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error(t("teacherExerciseEditor.errors.jsonExerciseObject"));
  }
  const o = obj as Record<string, unknown>;
  const title = String(o.title ?? "").trim();
  if (!title) throw new Error(t("teacherExerciseEditor.errors.missingTitle"));
  if (!Array.isArray(o.questions)) throw new Error(t("teacherExerciseEditor.errors.missingQuestions"));
  return {
    exercise_id: (o.exercise_id as string) || fallbackId,
    title,
    published: o.published === undefined ? true : Boolean(o.published),
    skill: (o.skill ?? null) as ExerciseInput["skill"],
    level: (o.level as string) ?? null,
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : null,
    topic_id: (o.topic_id as string) ?? null,
    tag_id: (o.tag_id as string) ?? null,
    image: (o.image as string) ?? null,
    template_id: (o.template_id as string) ?? null,
    gen_config: (o.gen_config as Record<string, unknown> | null) ?? null,
    read_aloud: Boolean(o.read_aloud),
    speaking_prompt: (o.speaking_prompt as string) ?? null,
    speaking_framework: (o.speaking_framework ??
      null) as ExerciseInput["speaking_framework"],
    speaking_sample: (o.speaking_sample as string) ?? null,
    speaking_image: (o.speaking_image as string) ?? null,
    passage: (o.passage as string) ?? null,
    passage_ipa: (o.passage_ipa ?? null) as ExerciseInput["passage_ipa"],
    audio_url: (o.audio_url as string) ?? null,
    audio_script: (o.audio_script as string) ?? null,
    audio_voice: (o.audio_voice as string) ?? null,
    dictation_mode: (o.dictation_mode ??
      null) as ExerciseInput["dictation_mode"],
    translate_level: (o.translate_level ??
      null) as ExerciseInput["translate_level"],
    audio_cues: (o.audio_cues ?? null) as ExerciseInput["audio_cues"],
    wordlist: (o.wordlist ?? null) as ExerciseInput["wordlist"],
    vocab_deck: (o.vocab_deck ?? null) as VocabDeckConfig | null,
    questions: o.questions as ExerciseInput["questions"],
  };
}

// Parse nới lỏng: KHÔNG bắt buộc title/questions (dùng khi chuyển JSON → Visual).
function rawToForm(
  o: Record<string, unknown>,
  fallbackId?: string,
): EditorState {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    exercise_id: (o.exercise_id as string) || fallbackId,
    title: String(o.title ?? ""),
    skill: (o.skill as string) ?? "",
    level: (o.level as string) ?? "",
    tags: Array.isArray(o.tags) ? (o.tags as string[]) : [],
    topic_id: (o.topic_id as string) ?? "",
    tag_id: (o.tag_id as string) ?? "",
    published: o.published === undefined ? true : Boolean(o.published),
    image: (o.image as string) ?? "",
    template_id: (o.template_id as string) ?? "",
    gen_config: (o.gen_config as Record<string, unknown> | null) ?? null,
    read_aloud: Boolean(o.read_aloud),
    speaking_prompt: (o.speaking_prompt as string) ?? "",
    speaking_outline: arrToLines(
      (o.speaking_framework as { outline?: unknown } | null)?.outline,
    ),
    speaking_phrases: arrToLines(
      (o.speaking_framework as { phrases?: unknown } | null)?.phrases,
    ),
    speaking_sample: (o.speaking_sample as string) ?? "",
    speaking_image: (o.speaking_image as string) ?? "",
    passage: (o.passage as string) ?? "",
    passage_ipa: (Array.isArray(o.passage_ipa)
      ? o.passage_ipa
      : []) as IpaLine[],
    audio_url: (o.audio_url as string) ?? "",
    audio_script: (o.audio_script as string) ?? "",
    audio_voice: (o.audio_voice as string) ?? "",
    dictation_mode: (o.dictation_mode as string) ?? "",
    translate_level: (o.translate_level as string) ?? "",
    audio_cues: (o.audio_cues as AudioCuesResp | null) ?? null,
    media_source: (o.media_source as string) ?? "",
    youtube_id: (o.youtube_id as string) ?? "",
    video: Boolean(o.video),
    video_segments: (Array.isArray(o.video_segments)
      ? o.video_segments
      : []) as VideoSegment[],
    video_modes: (Array.isArray(o.video_modes)
      ? o.video_modes
      : ["dictation", "shadowing"]) as PracticeMode[],
    wordlist: wordsFromWordlist(arr(o.wordlist) as ApiWord[]),
    vocab_deck: (o.vocab_deck ?? null) as VocabDeckConfig | null,
    questions: draftsFromQuestions(arr(o.questions) as ApiQuestion[]),
  };
}

// Nhãn giọng đã tạo audio (e.g. "azure / en-US-JennyNeural") — chỉ hiện khi audio do TTS sinh ra.
function AudioVoiceBadge({ voice }: { voice: string }) {
  if (!voice) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Volume2 className="size-3.5 shrink-0 text-cyan-500" />
      {t("teacherExerciseEditor.audio.voiceLabel")} {" "}
      <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
        {voice}
      </span>
    </p>
  );
}

// Trạng thái phụ đề đồng bộ (quyết định học sinh có bật được "gợi ý nghe" hay không).
//  · dictation: CỐ Ý không có (phụ đề = đáp án).
//  · có audio + cues: bật được gợi ý nghe.
//  · có audio, thiếu cues: cảnh báo — bấm tạo audio + phụ đề để bật.
function HintStatus({
  hasAudio,
  cues,
  templateId,
}: {
  hasAudio: boolean;
  cues: AudioCuesResp | null;
  templateId: string;
}) {
  if (!hasAudio) return null;
  const words = cues?.words?.length ?? 0;
  const Dot = ({ cls }: { cls: string }) => (
    <span className={cn("size-2 shrink-0 rounded-full", cls)} />
  );
  if (templateId === "dictation") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Dot cls="bg-slate-400" /> {t("teacherExerciseEditor.audio.hintStatus.dictation")}
      </p>
    );
  }
  if (words > 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Dot cls="bg-emerald-500" /> {t("teacherExerciseEditor.audio.hintStatus.available", { n: words })}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <Dot cls="bg-amber-500" /> {t("teacherExerciseEditor.audio.hintStatus.unavailable")}
    </p>
  );
}

export default function ExerciseEditorPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  // "Back"/"Cancel" undo one step (they abandon the edit, not a post-save "Done").
  const goBack = useGoBack("/teacher/exercises");
  // Header slot the AI composer portals its template buttons into.
  const [composerToolbar, setComposerToolbar] = useState<HTMLDivElement | null>(null);
  const qc = useQueryClient();
  const isNew = !slug;

  const [form, setForm] = useState<EditorState | null>(
    isNew ? { ...EMPTY } : null,
  );
  const [tab, setTab] = useState<"visual" | "json">("visual");
  const [fullJson, setFullJson] = useState("");
  const [uploading, setUploading] = useState(false);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ipaBusy, setIpaBusy] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null); // accordion câu hỏi (1 câu mở)
  const [showAudioOpt, setShowAudioOpt] = useState(false); // bài đọc: đã mở thẻ NGHE (audio tùy chọn) chưa
  const [showWordlistOpt, setShowWordlistOpt] = useState(false); // đã mở thẻ TỪ VỰNG (tùy chọn) chưa
  // Ảnh bìa: gập mặc định (ít dùng); tự bung khi bài ĐÃ có ảnh (mở 1 lần, sau đó GV tự điều khiển).
  const [coverOpen, setCoverOpen] = useState(false);
  const coverAutoOpened = useRef(false);
  useEffect(() => {
    if (!coverAutoOpened.current && form?.image) {
      setCoverOpen(true);
      coverAutoOpened.current = true;
    }
  }, [form?.image]);

  const [showLib, setShowLib] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // MODE lấy TỪ URL (?mode=ai|custom) để phân biệt/bookmark được. Legacy ?ai=1 vẫn nhận.
  const mode: "ai" | "custom" =
    searchParams.get("mode") === "ai" || searchParams.get("ai") === "1"
      ? "ai"
      : "custom";
  const setMode = (m: "ai" | "custom") =>
    setSearchParams(
      (p) => {
        p.set("mode", m);
        p.delete("ai");
        return p;
      },
      { replace: true },
    );
  // "Tạo lại bằng AI": nạp config đã lưu vào Composer (remount panel theo key).
  const [regenConfig, setRegenConfig] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [regenKey, setRegenKey] = useState(0);

  const { data: levelsData } = useQuery({
    queryKey: ["levels"],
    queryFn: levelsApi.list,
  });
  // Value = tên cấp độ (form lưu level theo name).
  const levelOptions = levelSelectOptions(levelsData?.items, {
    by: "name",
    all: { value: "", label: t("teacherExerciseEditor.form.levelPlaceholder") },
  });
  // Nhãn (tags) — dropdown gắn nhãn + phạm vi. "" = Tất cả (mặc định).
  const [manageTags, setManageTags] = useState(false);
  const manageTagsAnchor = useRef<HTMLDivElement>(null); // neo popover Quản lý nhãn vào ô Select Nhãn
  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: tagsApi.list,
  });
  const tagOptions = useMemo(
    () => [
      { value: "", label: t("common.all") },
      ...(tagsData?.items ?? []).map((tag) => ({
        // Nói thẳng phạm vi trong nhãn chọn — đây là thứ dễ chọn nhầm nhất.
        value: tag.id,
        label: tag.scope === "student" ? t("teacherExerciseEditor.form.tagScopeStudent", { name: tag.name }) : tag.name,
      })),
    ],
    [tagsData],
  );

  // Chủ đề (topics) — cây 2 cấp gộp trong 1 ô <TopicPicker> (có tìm kiếm).
  // Bài LƯU 1 topic_id; chọn chủ đề con là đã ngụ ý chủ đề cha (suy qua parent_id).
  const { data: topicsData } = useQuery({
    queryKey: ["topics"],
    queryFn: topicsApi.list,
  });
  const topicsList = topicsData?.items ?? [];
  const STATUS_OPTIONS = [
    { value: "published", label: "Published" },
    { value: "draft", label: "Draft" },
  ];

  // Dạng bài (blueprint) đang chọn → tập dạng câu được phép (giới hạn nút "thêm câu").
  // Template rỗng (bài cũ chưa gắn) → cho phép mọi dạng.
  const blueprint = getBlueprint(form?.template_id);
  const allowedTypes = blueprint?.allowedTypes;
  // Section nào HIỆN được suy TRỰC TIẾP từ cấu trúc blueprint (nguồn sự thật) — không còn toggle tay.
  // Old exercise without a template (st empty) → fall back to the read_aloud flag.
  const st = blueprint?.structure;
  const f = form; // rút gọn cho các biểu thức fallback bên dưới
  const canPassage = st ? st.passage !== "forbidden" : !!f;
  const canAudio = st
    ? st.audioScript !== "forbidden"
    : !!f && !f.read_aloud;
  // Tách thẻ ĐỌC / NGHE: bên nào TÙY CHỌN mà chưa có dữ liệu thì gập lại cho gọn.
  const isMixedSkill = f?.skill === "mixed";
  const audioRequired = st ? st.audioScript === "required" : false;
  const audioOptional = st
    ? st.audioScript === "optional"
    : canAudio && !isMixedSkill; // bài cũ chưa gắn template → coi như tùy chọn
  const audioHasData = !!(f?.audio_url || f?.audio_script);
  // Thẻ NGHE hiện khi: bắt buộc, đã có audio, hoặc GV chủ động bấm "Thêm phần nghe".
  const showAudioCard =
    canAudio &&
    !isMixedSkill &&
    (audioRequired || audioHasData || showAudioOpt);
  const canWordlist = st ? st.wordlist !== "forbidden" : true;
  // Từ vựng: chỉ vocab_builder BẮT BUỘC; các skill khác tùy chọn → chưa có từ thì gập lại.
  const wordlistRequired = st ? st.wordlist === "required" : false;
  const wordlistOptional = canWordlist && !wordlistRequired;
  const wordlistHasData = (f?.wordlist.length ?? 0) > 0;
  const showWordlistCard =
    canWordlist && (wordlistRequired || wordlistHasData || showWordlistOpt);
  const canQuestions = st
    ? st.questions !== "forbidden"
    : !!f && !f.read_aloud;
  const canSpeaking = st ? st.speakingPrompt !== "forbidden" : false;
  // Bài BỘ THẺ từ vựng: nội dung là các TỪ tham chiếu ngân hàng (vocab_deck) chứ không phải
  // câu hỏi. `deckRef.prepare()` được gọi trong save() để nạp thẻ mới vào kho trước khi lưu.
  const isDeckTemplate = blueprint?.gradingPipeline === "deck";
  const deckRef = useRef<VocabDeckHandle>(null);
  // Ngữ cảnh cho AI gợi ý từ — lấy từ chủ đề (kèm chủ đề cha) + tiêu đề bài đã nhập ở trên.
  const deckAiContext = () => {
    const topic = topicsList.find((t) => t.id === form?.topic_id);
    const parent = topic?.parent_id
      ? topicsList.find((t) => t.id === topic.parent_id)
      : undefined;
    return [
      parent?.name,
      topic?.name,
      form?.title.trim(),
      // i18n-ignore: AI context
      form?.level && `trình độ ${form.level}`,
    ]
      .filter(Boolean)
      .join(" — ");
  };
  // Every type, grouped by skill order, each tagged with its skill; "mixed" only while it is the current one.
  const templateOptions = SKILL_LIST.flatMap((m) =>
    BLUEPRINTS.filter((b) => b.skill === m.key && (b.skill !== "mixed" || form?.template_id === b.id)).map((b) => {
      const ui = skillUi(b.skill);
      return {
        value: b.id,
        label: b.label,
        icon: ui ? <ui.Icon className={cn("size-4", ui.text)} /> : undefined,
        hint: ui?.short,
      };
    }),
  );
  // Picking a type sets its skill too, plus the read_aloud flag (drives the sections).
  const pickTemplate = (id: string) => {
    const b = getBlueprint(id);
    patch({
      template_id: id,
      skill: b?.skill ?? form?.skill ?? "",
      read_aloud: b?.readAloud ?? false,
    });
  };

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    exercisesApi
      .get(slug!)
      .then((ex) => {
        if (cancelled) return;
        setForm({
          exercise_id: ex.exercise_id,
          orig_slug: ex.exercise_id, // ghi nhớ slug gốc để phát hiện đổi slug khi lưu
          title: ex.title,
          skill: ex.skill ?? "",
          level: ex.level ?? "",
          tags: ex.tags ?? [],
          topic_id: ex.topic_id ?? "",
          tag_id: ex.tag_id ?? "",
          published: ex.published,
          image: ex.image ?? "",
          // Old exercise without a template → infer it from skill + the read_aloud flag.
          template_id:
            ex.template_id ??
            inferTemplateId({
              skill: ex.skill,
              read_aloud: ex.read_aloud,
            }) ??
            "",
          gen_config: ex.gen_config ?? null,
          read_aloud: ex.read_aloud ?? false,
          speaking_prompt: ex.speaking_prompt ?? "",
          speaking_outline: (ex.speaking_framework?.outline ?? []).join("\n"),
          speaking_phrases: (ex.speaking_framework?.phrases ?? []).join("\n"),
          speaking_sample: ex.speaking_sample ?? "",
          speaking_image: ex.speaking_image ?? "",
          passage: ex.passage ?? "",
          passage_ipa: ex.passage_ipa ?? [],
          audio_url: ex.audio_url ?? "",
          audio_script: ex.audio_script ?? "",
          audio_voice: ex.audio_voice ?? "",
          dictation_mode: ex.dictation_mode ?? "",
          translate_level: ex.translate_level ?? "",
          audio_cues: (ex.audio_cues as AudioCuesResp | null) ?? null,
          media_source: ex.media_source ?? "",
          youtube_id: ex.youtube_id ?? "",
          video: ex.video ?? false,
          video_segments: ex.video_segments ?? [],
          video_modes: ex.video_modes ?? ["dictation", "shadowing"],
          wordlist: wordsFromWordlist(ex.wordlist as ApiWord[] | null),
          vocab_deck: (ex.vocab_deck as VocabDeckConfig | null) ?? null,
          questions: draftsFromQuestions(ex.questions as ApiQuestion[] | null),
        });
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.errors.loadExercise"));
        navigate("/teacher/exercises", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, isNew, navigate]);

  const patch = (p: Partial<EditorState>) =>
    setForm((f) => (f ? { ...f, ...p } : f));
  const set = (k: keyof EditorState) => (e: { target: { value: string } }) =>
    patch({ [k]: e.target.value } as Partial<EditorState>);

  // ---- Thao tác câu hỏi ----
  const updateQ = (i: number, p: Partial<QDraft>) =>
    setForm((f) =>
      f
        ? {
            ...f,
            questions: f.questions.map((q, idx) =>
              idx === i ? { ...q, ...p } : q,
            ),
          }
        : f,
    );
  const addQ = (type: QType) => {
    const nq = newQuestion(type);
    setForm((f) => (f ? { ...f, questions: [...f.questions, nq] } : f));
    setExpandedKey(nq._k); // mở luôn câu mới
  };

  // ---- Sinh câu hỏi bằng AI NGOÀI: copy prompt → dán JSON trả về ----
  // Khác tab JSON (dán TRỌN bài, ghi đè tất cả): ở đây chỉ NỐI THÊM câu vào bài đang soạn,
  // nên mọi thứ cô đã nhập (tiêu đề, level, nhãn, các câu cũ) giữ nguyên.
  const [qPrompt, setQPrompt] = useState<{ system: string; user: string } | null>(null);
  const [qPromptSetup, setQPromptSetup] = useState(false);
  const [qImportOpen, setQImportOpen] = useState(false);

  /** Accepts `{"questions":[…]}` or a bare `[…]`, and appends. Existing questions are untouched. */
  function importQuestionsJson(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(t("teacherExerciseEditor.errors.invalidJsonCheckPasted"));
    }
    const raw = Array.isArray(parsed)
      ? parsed
      : (parsed as { questions?: unknown })?.questions;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error(t("teacherExerciseEditor.errors.noQuestionsArray"));
    const drafts = draftsFromQuestions(raw as ApiQuestion[]);
    const bad = drafts.find((d) => !ALL_TYPES.includes(d.type));
    if (bad) throw new Error(t("teacherExerciseEditor.errors.invalidQuestionType", { type: bad.type }));
    setForm((f) => (f ? { ...f, questions: [...f.questions, ...drafts] } : f));
    toast.success(t("teacherExerciseEditor.toast.questionsAdded", { n: drafts.length }));
  }
  const removeQ = (i: number) =>
    setForm((f) =>
      f ? { ...f, questions: f.questions.filter((_, idx) => idx !== i) } : f,
    );
  const dupQ = (i: number) =>
    setForm((f) => {
      if (!f) return f;
      const copy = { ...f.questions[i], _k: nextKey() };
      const arr = [...f.questions];
      arr.splice(i + 1, 0, copy);
      setExpandedKey(copy._k);
      return { ...f, questions: arr };
    });
  const qSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onQDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setForm((f) => {
      if (!f) return f;
      const from = f.questions.findIndex((q) => q._k === active.id);
      const to = f.questions.findIndex((q) => q._k === over.id);
      return from < 0 || to < 0 ? f : { ...f, questions: arrayMove(f.questions, from, to) };
    });
  };

  // Lưu tại chỗ — KHÔNG thoát trang, KHÔNG toast; trạng thái báo ngay trong nút Lưu.
  const [savedTick, setSavedTick] = useState(0); // >0 = vừa lưu xong (nút hiện "Đã lưu")
  const saveMut = useMutation({
    mutationFn: (input: ExerciseInput) => exercisesApi.save(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      const savedSlug = res?.exercise_id;
      if (savedSlug) {
        // Đồng bộ slug gốc = slug vừa lưu (bài mới HOẶC vừa đổi slug) để lần lưu sau upsert đúng bản,
        // không rename lại từ slug cũ đã mất → tránh tạo bản trùng / vỡ ràng buộc unique.
        setForm((f) =>
          f ? { ...f, exercise_id: savedSlug, orig_slug: savedSlug } : f,
        );
        // URL đổi (bài mới, hoặc vừa đổi slug bài cũ) → gắn slug mới để lần lưu sau là cập nhật.
        if (slug !== savedSlug)
          navigate(`/teacher/exercises/${savedSlug}/edit`, { replace: true });
      }
      setSavedTick((n) => n + 1);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.errors.generic")),
  });
  // "Đã lưu" tự tắt sau 2.5s để nút quay lại "Lưu bài".
  useEffect(() => {
    if (!savedTick) return;
    const t = setTimeout(() => setSavedTick(0), 2500);
    return () => clearTimeout(t);
  }, [savedTick]);

  function switchTab(next: "visual" | "json") {
    if (!form || next === tab) return;
    if (next === "json") {
      setFullJson(JSON.stringify(buildInput(form), null, 2));
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(fullJson);
      } catch {
        return toast.error(t("common.invalidJson"));
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return toast.error(t("teacherExerciseEditor.errors.jsonExerciseObjectShort"));
      }
      setForm(rawToForm(parsed as Record<string, unknown>, form.exercise_id));
    }
    setTab(next);
  }

  function formatJson() {
    try {
      setFullJson(JSON.stringify(JSON.parse(fullJson), null, 2));
      toast.success(t("teacherExerciseEditor.toast.jsonFormatted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.invalidJson"));
    }
  }

  async function save() {
    if (!form) return;
    let input: ExerciseInput;
    try {
      input =
        tab === "json"
          ? normalizeObject(JSON.parse(fullJson), form.exercise_id)
          : buildInput(form);
    } catch (e) {
      return toast.error(
        e instanceof Error ? e.message : t("teacherExerciseEditor.errors.invalidData"),
      );
    }
    if (!input.title.trim()) return toast.error(t("teacherExerciseEditor.errors.titleRequired"));
    // Bài BỘ THẺ: các từ MỚI mới chỉ nằm trong trình dựng, chưa có id trong ngân hàng.
    // Nạp kho ngay tại đây rồi lưu deck vừa trả về — bỏ bước này là mất sạch thẻ mới.
    if (tab !== "json" && isDeckTemplate && deckRef.current) {
      try {
        input = { ...input, vocab_deck: await deckRef.current.prepare() };
      } catch (e) {
        return toast.error(
          e instanceof Error ? e.message : t("teacherExerciseEditor.errors.loadWordsToBank"),
        );
      }
    }
    saveMut.mutate(input);
  }

  async function onPickAudio(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadAudio(file);
      patch({ audio_url: url, audio_cues: null, audio_voice: "" }); // audio upload không có phụ đề/giọng TTS
      toast.success(t("teacherExerciseEditor.toast.audioUploaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teacherExerciseEditor.errors.uploadAudio"));
    } finally {
      setUploading(false);
    }
  }

  // Tạo audio bằng TTS + phụ đề đồng bộ (audio_cues) → lưu R2.
  //  • Bài Tổng hợp (mixed): sinh TỪ đoạn văn (passage) và ép cues.text === passage
  //    để karaoke chạy ngay trên đoạn văn (bất biến của LessonPanel).
  //  • Bài khác: sinh từ 'Lời thoại audio' (audio_script).
  async function onGenerateTts() {
    const isMixed = form?.skill === "mixed";
    const text = (isMixed ? form?.passage : form?.audio_script)?.trim();
    if (!text) {
      toast.error(
        isMixed
          ? t("teacherExerciseEditor.errors.enterContentBeforeAudio")
          : t("teacherExerciseEditor.errors.enterAudioScriptBeforeAudio"),
      );
      return;
    }
    // Đã có audio (kèm phụ đề) → tạo lại sẽ GHI ĐÈ, xoá bản cũ không khôi phục được.
    if (form?.audio_url) {
      const ok = await confirmAsk({
        title: t("teacherExerciseEditor.confirm.regenerateAudio.title"),
        message:
          t("teacherExerciseEditor.confirm.regenerateAudio.message"),
        confirmText: t("teacherExerciseEditor.confirm.regenerateAudio.confirm"),
        cancelText: t("teacherExerciseEditor.confirm.regenerateAudio.cancel"),
        danger: true,
      });
      if (!ok) return;
    }
    setTtsBusy(true);
    try {
      // Gắn tiêu đề bài vào metadata file audio (tên tải về + customMetadata) cho dễ tra.
      // Bài NGHE (không mixed): cho phép nhận diện hội thoại → đọc nhiều vai. Mixed giữ 1 giọng
      // (bất biến karaoke cues.text === passage; nhiều vai sẽ bỏ nhãn làm lệch passage).
      const { url, cues, ttsLabel, voiceInfo } =
        await teacherReadingApi.modelAudio(
          text,
          undefined,
          form?.title,
          !isMixed,
        );
      // Dictation: phụ đề = đáp án (chép đúng chữ nghe được) → KHÔNG lưu cues (không có gợi ý).
      const keepCues = form?.template_id !== "dictation";
      // mixed + có cues → đồng bộ passage = cues.text (giữ bất biến karaoke). audio_voice: nhãn nhận dạng giọng.
      patch(
        isMixed && cues
          ? {
              audio_url: url,
              audio_cues: cues,
              passage: cues.text,
              audio_voice: voiceInfo ?? "",
            }
          : {
              audio_url: url,
              audio_cues: keepCues ? cues : null,
              audio_voice: voiceInfo ?? "",
            },
      );
      // Nhãn giọng (e.g. "Azure · Jenny") để giáo viên biết giọng nào đã tạo.
      const suffix = ttsLabel ? ` · ${ttsLabel}` : "";
      toast.success(
        (cues && keepCues
          ? t("teacherExerciseEditor.toast.audioWithCaptionsCreated", { n: cues.words.length })
          : t("teacherExerciseEditor.toast.audioCreated")) + suffix,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teacherExerciseEditor.errors.createAudio"));
    } finally {
      setTtsBusy(false);
    }
  }

  // Tạo phiên âm IPA cho đoạn văn (theo câu) — hiển thị song song ở màn học sinh.
  async function genIpa() {
    const text = form?.passage.trim();
    if (!text) return toast.error(t("teacherExerciseEditor.errors.enterPassageBeforeIpa"));
    setIpaBusy(true);
    try {
      const { lines } = await aiApi.generateIpa(text);
      patch({ passage_ipa: lines });
      toast.success(t("teacherExerciseEditor.toast.ipaCreated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("teacherExerciseEditor.errors.createIpa"));
    } finally {
      setIpaBusy(false);
    }
  }

  if (!form)
    return <p className="py-24 text-center text-slate-500">{t("common.loading")}</p>;

  const canSave =
    !saveMut.isPending &&
    (tab === "json"
      ? fullJson.trim().length > 0
      : !!form.title.trim() && !!form.level);

  // Tab chế độ soạn — nhúng inline vào header từng section.
  const tabsEl = (
    <div className="inline-flex shrink-0 gap-1">
      <TabButton active={tab === "visual"} onClick={() => switchTab("visual")}>
        <PenLine className="size-4" /> {t("teacherExerciseEditor.tabs.editor")}
      </TabButton>
      <TabButton active={tab === "json"} onClick={() => switchTab("json")}>
        <Braces className="size-4" /> JSON
      </TabButton>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-7 pb-28">
      {/* Hero card (gồm back + icon + tiêu đề + tabs) */}
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor
          seed="teacher-exercise-editor"
          className="text-emerald-500/20 dark:text-emerald-400/15"
        />

        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-emerald-500/30 sm:size-16">
            <ClipboardList className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-600/80">
              {t("teacherExerciseEditor.page.exerciseLibrary")}
            </p>
            <h1 className="truncate text-2xl font-extrabold text-slate-900 dark:text-white">
              {isNew ? t("teacherExerciseEditor.page.newExercise") : t("teacherExerciseEditor.page.editExercise")}
            </h1>
            {mode === "ai" && <p className="mt-0.5 text-xs text-slate-500">{t("teacherExerciseEditor.composer.intro")}</p>}
          </div>

          {/* Back + chọn MODE (AI / Custom) — inline bên phải */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode === "ai" && <div ref={setComposerToolbar} className="contents" />}
            {/* Tạo lại bằng AI — chỉ hiện khi bài do AI sinh (đã lưu config) & đang ở Custom */}
            {mode === "custom" && form.gen_config && (
              <button
                type="button"
                onClick={() => {
                  setRegenConfig(form.gen_config);
                  setRegenKey((k) => k + 1);
                  setMode("ai");
                }}
                title={t("teacherExerciseEditor.actions.regenerateAiTitle")}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:bg-violet-500/20"
              >
                <Sparkles className="size-4" /> {t("teacherExerciseEditor.actions.regenerateAi")}
              </button>
            )}
            {/* Nút đơn (cùng style với Back): chuyển sang mode còn lại (AI ⇄ Custom) */}
            <Button variant="neutral" onClick={() => setMode(mode === "ai" ? "custom" : "ai")}>
              {mode === "ai" ? (
                <>
                  <PenLine className="size-4 text-violet-500" /> {t("teacherExerciseEditor.header.manual")}
                </>
              ) : (
                <>
                  <Sparkles className="size-4 text-violet-500" /> {t("teacherExerciseEditor.header.ai")}
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* MODE AI — AI Composer dạng TRANG (không còn drawer) */}
      {mode === "ai" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <AiComposerPanel
            key={regenKey}
            initialConfig={regenConfig}
            targetExerciseId={isNew ? null : form.exercise_id}
            targetTitle={isNew ? null : form.title}
            toolbarSlot={composerToolbar}
            onSaved={() => navigate("/teacher/exercises")}
            onBack={goBack}
            onManualTemplate={(id) => {
              const b = getBlueprint(id);
              patch({ template_id: id, skill: b?.skill ?? "listening", read_aloud: false, video: true, media_source: "video" });
              setMode("custom");
            }}
          />
        </div>
      )}

      {/* MODE CUSTOM — soạn tay (Trình soạn / JSON) + thanh lưu */}
      {mode === "custom" && (
        <>
          {tab === "visual" ? (
            <div className="space-y-6">
              {/* Thông tin chung */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                  {t("teacherExerciseEditor.sections.general")}
                </h2>
                <div className="space-y-4">
                  {/* Tiêu đề chiếm trọn hàng — tên bài dài (đề viết, bài video) hay bị cắt. */}
                  <div>
                    {/* Label + slug (/exercise_id) inline bên phải — bấm slug để sửa đường dẫn bài. */}
                    <div className="mb-2 flex items-end justify-between gap-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("teacherExerciseEditor.form.title")} <span className="text-rose-500">*</span>
                      </label>
                      <SlugInline
                        slug={form.exercise_id}
                        title={form.title}
                        isNew={isNew}
                        origSlug={form.orig_slug}
                        onChange={(v) => patch({ exercise_id: v })}
                      />
                    </div>
                    <Input
                      required
                      value={form.title}
                      onChange={set("title")}
                      placeholder={t("teacherExerciseEditor.titlePlaceholder")}
                      autoFocus={isNew}
                    />
                    {form.orig_slug &&
                      form.exercise_id &&
                      form.orig_slug !== form.exercise_id && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          {t("teacherExerciseEditor.slug.changeWarning")}
                        </p>
                      )}
                  </div>
                  {/* 6 ô định danh xếp 3 cột → 2 hàng đều nhau (Nhãn nằm cùng nhóm này). */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {/* The type is the choice; the skill follows it (same as the AI composer). */}
                    <Select
                      label="Type"
                      options={templateOptions}
                      value={form.template_id}
                      onChange={pickTemplate}
                      placeholder="— Type —"
                      menuClassName="w-80"
                      menuMaxHeight={480}
                    />
                    <SkillReadout compact skill={form.skill} label="Skill" hint={t("teacherExerciseEditor.composer.skillAuto")} />
                    <Select
                      label="Level"
                      required
                      options={levelOptions}
                      value={form.level}
                      onChange={(v) => patch({ level: v })}
                      placeholder="— Level —"
                    />
                    <TopicPicker
                      topics={topicsList}
                      value={form.topic_id ?? ""}
                      onChange={(v) => patch({ topic_id: v })}
                    />
                    <Select
                      label="Status"
                      options={STATUS_OPTIONS}
                      value={form.published ? "published" : "draft"}
                      onChange={(v) => patch({ published: v === "published" })}
                    />
                    {/* Nhãn quyết định bài dành cho ai. "Quản lý nhãn" nằm trong
                    menu như một mục, mở popover CRUD nhãn (neo vào chính ô này). */}
                    <Select
                      ref={manageTagsAnchor}
                      label={t("teacherExerciseEditor.form.tag")}
                      options={tagOptions}
                      value={form.tag_id}
                      onChange={(v) => patch({ tag_id: v })}
                      placeholder={t("common.all")}
                      menuFooter={(close) => (
                        <button
                          type="button"
                          onClick={() => {
                            close();
                            setManageTags(true);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-cyan-600 transition-colors hover:bg-slate-50 dark:text-cyan-400 dark:hover:bg-slate-800"
                        >
                          <Settings2 className="size-4 shrink-0" /> {t("teacherExerciseEditor.actions.manageTags")}
                        </button>
                      )}
                    />
                  </div>
                  {/* Ảnh bìa — thumbnail cho card lưới ở thư viện user (áp mọi loại bài, KHÔNG lộ đáp án).
                  Trống → thư viện tự minh hoạ theo kỹ năng/chủ đề. Gập mặc định, bung khi cần / khi có ảnh. */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setCoverOpen((v) => !v)}
                      className="flex w-full items-center gap-1.5 text-sm font-medium text-slate-700 transition hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400"
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition-transform",
                          coverOpen ? "" : "-rotate-90",
                        )}
                      />
                      {t("teacherExerciseEditor.form.coverImage")} {" "}
                      <span className="font-normal text-slate-400">
                        · {t("teacherExerciseEditor.form.libraryThumbnailOptional")}
                      </span>
                      {!coverOpen && form.image && (
                        <span className="ml-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                          {t("teacherExerciseEditor.form.hasImage")}
                        </span>
                      )}
                    </button>
                    {coverOpen && (
                      <div className="mt-2">
                        <ImagePicker
                          value={form.image}
                          onChange={(url) => patch({ image: url })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Dictation & Shadowing (theo câu) — nguồn Audio/Video + đoạn luyện. blueprint.video = type này. */}
              {blueprint?.video && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center gap-3">
                    <IconBox variant="cyan">
                      <Headphones className="size-5" />
                    </IconBox>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {t("teacherExerciseEditor.sections.listeningSpeaking")}
                    </h2>
                  </div>
                  <PracticeSegmentsEditor
                    value={{
                      media_source: (form.media_source ||
                        "video") as PracticeSource,
                      youtube_id: form.youtube_id,
                      audio_url: form.audio_url,
                      audio_cues: form.audio_cues as AudioCues | null,
                      audio_voice: form.audio_voice || null,
                      segments: form.video_segments,
                      modes: form.video_modes,
                    }}
                    onChange={(v) =>
                      patch({
                        media_source: v.media_source,
                        youtube_id: v.youtube_id,
                        audio_url: v.audio_url,
                        audio_cues: v.audio_cues as AudioCuesResp | null,
                        audio_voice: v.audio_voice ?? "",
                        video_segments: v.segments,
                        video_modes: v.modes,
                        video: true,
                      })
                    }
                    title={form.title}
                    level={form.level}
                    editing={!isNew}
                    // Dán link YouTube mà tiêu đề còn trống → điền tiêu đề video (cô sửa lại tuỳ ý).
                    onTitleSuggest={(t) => {
                      if (!form.title.trim()) patch({ title: t });
                    }}
                    // After a one-click build: fill level / topic, and swap the raw YouTube title for
                    // the AI's clean one unless the teacher already typed their own.
                    onMeta={(m) =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              level: f.level || m.level || "",
                              topic_id: f.topic_id || m.topic_id || "",
                              title: !f.title.trim() || f.title === m.rawTitle ? m.title || f.title : f.title,
                            }
                          : f,
                      )
                    }
                  />
                </section>
              )}

              {/* Writing prompt & outline — shown when the template takes a prompt (derived from the blueprint). */}
              {canSpeaking && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center gap-3">
                    <IconBox variant="cyan">
                      <MessageSquare className="size-5" />
                    </IconBox>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {t("teacherExerciseEditor.sections.writingOutline")}
                    </h2>
                  </div>

                  <div className="space-y-4">
                    <Textarea
                      label={
                        form.skill === "writing"
                          ? t("teacherExerciseEditor.form.writingPrompt")
                          : t("teacherExerciseEditor.form.speakingPrompt")
                      }
                      rows={2}
                      value={form.speaking_prompt}
                      onChange={set("speaking_prompt")}
                      placeholder="VD: Talk about your daily routine — what you usually do from morning to night."
                    />
                    {form.template_id === "listen_speak" && (
                      <p className="-mt-2 flex items-start gap-1.5 text-xs text-violet-600 dark:text-violet-400">
                        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                        {t("teacherExerciseEditor.hints.listenSpeakPrompt")}
                      </p>
                    )}
                    <Textarea
                      label={t("teacherExerciseEditor.form.suggestedOutline")}
                      rows={4}
                      value={form.speaking_outline}
                      onChange={set("speaking_outline")}
                      placeholder={
                        t("teacherExerciseEditor.form.suggestedOutlinePlaceholder")
                      }
                    />
                    <Textarea
                      label={t("teacherExerciseEditor.form.usefulPhrases")}
                      rows={4}
                      value={form.speaking_phrases}
                      onChange={set("speaking_phrases")}
                      placeholder={
                        "I usually wake up at...\nAfter that, I...\nMy favorite part of the day is..."
                      }
                    />

                    {/* Bài mẫu — ẩn với học sinh; nạp vào prompt AI để chấm/chữa sát hơn. */}
                    <Textarea
                      label={t("teacherExerciseEditor.form.sampleAnswer")}
                      rows={5}
                      value={form.speaking_sample}
                      onChange={set("speaking_sample")}
                      placeholder={t("teacherExerciseEditor.form.sampleAnswerPlaceholder")}
                    />

                    {/* Ảnh minh hoạ (bài tả tranh) — hiện cho học sinh. Dropzone + thư viện ảnh. */}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t("teacherExerciseEditor.form.illustration")}
                      </label>
                      <ImagePicker
                        value={form.speaking_image}
                        onChange={(url) => patch({ speaking_image: url })}
                      />
                    </div>

                    <p className="text-xs text-slate-400">
                      {t("teacherExerciseEditor.hints.sharedVocabulary")}
                    </p>
                  </div>
                </section>
              )}

              {/* ── Thẻ ĐỌC (đoạn văn) — tách riêng khỏi thẻ NGHE cho dễ nhìn. Bài Tổng hợp
              dùng audio gắn liền đoạn văn nên phần audio của nó nằm luôn trong thẻ này. ── */}
              {canPassage && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">
                    {form.read_aloud
                      ? t("teacherExerciseEditor.sections.readAloudContent")
                      : form.skill === "mixed"
                        ? t("teacherExerciseEditor.sections.mixedContent")
                        : t("teacherExerciseEditor.sections.passage")}
                  </h2>
                  <div className="space-y-4">
                    {canPassage && (
                      <Textarea
                        // Bài đọc thường: KHÔNG lặp label (h2 "Đoạn văn (Reading)" đã là tiêu đề).
                        // Đọc to / Tổng hợp: giữ label riêng vì h2 nói việc khác + có dấu bắt buộc *.
                        label={
                          form.read_aloud
                            ? t("teacherExerciseEditor.form.readAloudPassage")
                            : form.skill === "mixed"
                              ? t("teacherExerciseEditor.form.mixedContent")
                              : undefined
                        }
                        rows={form.read_aloud || form.skill === "mixed" ? 6 : 4}
                        value={form.passage}
                        onChange={set("passage")}
                        placeholder={
                          form.read_aloud
                            ? t("teacherExerciseEditor.form.readAloudPlaceholder")
                            : undefined
                        }
                      />
                    )}
                    {/* Bài đọc to: PHIÊN ÂM IPA theo câu — hiển thị song song (text trên, IPA dưới) ở màn học sinh */}
                    {form.skill === "reading" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {t("teacherExerciseEditor.form.ipaTranslation")}
                          </label>
                          <button
                            type="button"
                            onClick={genIpa}
                            disabled={ipaBusy || !form.passage.trim()}
                            title={t("teacherExerciseEditor.actions.generateIpaTitle")}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-40"
                          >
                            <Sparkles className="size-3.5" />{" "}
                            {ipaBusy
                              ? t("teacherExerciseEditor.actions.creating")
                              : form.passage_ipa.length
                                ? t("teacherExerciseEditor.actions.regenerateIpa")
                                : t("teacherExerciseEditor.actions.generateIpa")}
                          </button>
                        </div>
                        {form.passage_ipa.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            {t("teacherExerciseEditor.empty.noIpa")}
                          </p>
                        ) : (
                          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                            {form.passage_ipa.map((ln, i) => (
                              <div key={i}>
                                <p className="text-sm text-slate-700 dark:text-slate-200">
                                  {ln.text}
                                </p>
                                <input
                                  value={ln.ipa}
                                  onChange={(e) =>
                                    patch({
                                      passage_ipa: form.passage_ipa.map(
                                        (x, idx) =>
                                          idx === i
                                            ? { ...x, ipa: e.target.value }
                                            : x,
                                      ),
                                    })
                                  }
                                  placeholder="/aɪ ˈpiː ˈeɪ/"
                                  className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-sm text-cyan-700 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-300"
                                />
                                <input
                                  value={ln.vi ?? ""}
                                  onChange={(e) =>
                                    patch({
                                      passage_ipa: form.passage_ipa.map(
                                        (x, idx) =>
                                          idx === i
                                            ? { ...x, vi: e.target.value }
                                            : x,
                                      ),
                                    })
                                  }
                                  placeholder={t("teacherExerciseEditor.form.vietnameseTranslation")}
                                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Bài Tổng hợp: audio BẮT BUỘC sinh từ đoạn văn (cues.text===passage) →
                  chỉ 1 nút, ẩn URL/upload/audio_script để không phá bất biến karaoke. */}
                    {canAudio && form.skill === "mixed" && (
                      <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {t("teacherExerciseEditor.audio.mixedInfo1")}{" "}
                          <b>{t("teacherExerciseEditor.audio.mixedInfoShared")}</b>{" "}
                          {t("teacherExerciseEditor.audio.mixedInfo2")}{" "}
                          <b>{t("teacherExerciseEditor.audio.mixedInfoFromPassage")}</b>{" "}
                          {t("teacherExerciseEditor.audio.mixedInfo3")}
                        </p>
                        {form.audio_url && (
                          <>
                            <AudioPlayer
                              src={form.audio_url}
                              cues={form.audio_cues}
                            />
                            <AudioVoiceBadge voice={form.audio_voice} />
                            <HintStatus
                              hasAudio={!!form.audio_url}
                              cues={form.audio_cues}
                              templateId={form.template_id}
                            />
                            {/* Lời thoại audio (audio_script) hiển thị đầy đủ như bài Nghe — nhưng CHỈ ĐỌC:
                          bài Tổng hợp dùng chung đoạn văn nên script = đoạn văn (giữ bất biến karaoke). */}
                            <Textarea
                              label={t("teacherExerciseEditor.audio.scriptLabel")}
                              rows={4}
                              readOnly
                              value={form.audio_cues?.text ?? form.passage}
                              hint={t("teacherExerciseEditor.audio.mixedScriptHint")}
                            />
                          </>
                        )}
                        {/* justify-end: nút TTS dạt sang PHẢI (container ngoài là block space-y, self-end vô tác dụng). */}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={onGenerateTts}
                            disabled={ttsBusy || !form.passage.trim()}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-50"
                          >
                            {ttsBusy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Headphones className="size-4" />
                            )}
                            {ttsBusy
                              ? t("teacherExerciseEditor.actions.creating")
                              : form.audio_url
                                ? t("teacherExerciseEditor.audio.regenerateWithCaptions")
                                : t("teacherExerciseEditor.audio.generateFromPassage")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── DICTATION (nghe–chép): nhắc cách hoạt động + audio tự tạo từ các câu. ── */}
              {form.template_id === "dictation" && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    {t("teacherExerciseEditor.dictation.title")}
                  </h2>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    {t("teacherExerciseEditor.dictation.info1")}{" "}
                    <b>{t("teacherExerciseEditor.dictation.infoFillBlank")}</b>{" "}
                    {t("teacherExerciseEditor.dictation.info2")}{" "}
                    <b>{t("teacherExerciseEditor.dictation.infoAutoCreated")}</b>{" "}
                    {t("teacherExerciseEditor.dictation.info3")}
                  </p>
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    <b>{t("teacherExerciseEditor.dictation.difficultyLabel")}</b>{" "}
                    {t("teacherExerciseEditor.dictation.difficultyDesc")}
                  </p>
                </section>
              )}

              {/* ── Thẻ NGHE (audio / Listening) — tách riêng thẻ Đọc cho gọn. Ở bài ĐỌC phần
              audio là TÙY CHỌN: chưa có → gập sau nút "Thêm phần nghe"; đã có hoặc bắt
              buộc (bài nghe) → hiện thẳng. Bài Tổng hợp dùng nhánh audio trong thẻ Đọc. ── */}
              {canAudio &&
                !isMixedSkill &&
                (showAudioCard ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {t("teacherExerciseEditor.audio.cardTitle")}{audioOptional ? t("teacherExerciseEditor.audio.optionalSuffix") : ""}
                      </h2>
                      {audioOptional && (
                        <button
                          type="button"
                          onClick={() => {
                            patch({
                              audio_url: "",
                              audio_script: "",
                              audio_cues: null,
                              audio_voice: "",
                            });
                            setShowAudioOpt(false);
                          }}
                          className="text-xs font-medium text-slate-400 transition hover:text-rose-500"
                        >
                          {t("teacherExerciseEditor.audio.removeAudioSection")}
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-end gap-2">
                        <Input
                          label="Audio URL (Listening)"
                          value={form.audio_url}
                          // Đổi URL thủ công → phụ đề cũ không còn khớp, xoá cues.
                          onChange={(e) =>
                            patch({
                              audio_url: e.target.value,
                              audio_cues: null,
                              audio_voice: "",
                            })
                          }
                          placeholder="/api/v1/audio/…"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLib(true)}
                          className="mb-0.5 inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-100 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          <FolderOpen className="size-4 shrink-0" /> {t("teacherExerciseEditor.audio.library")}
                        </button>
                        <label className="mb-0.5 shrink-0">
                          <input
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={onPickAudio}
                          />
                          <span className="inline-flex h-11 min-w-[132px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-slate-100 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                            <Upload className="size-4 shrink-0" />{" "}
                            {uploading ? t("teacherExerciseEditor.audio.uploading") : t("teacherExerciseEditor.audio.upload")}
                          </span>
                        </label>
                      </div>
                      {form.audio_url && (
                        <AudioPlayer
                          src={form.audio_url}
                          cues={form.audio_cues}
                        />
                      )}
                      <AudioVoiceBadge voice={form.audio_voice} />
                      <HintStatus
                        hasAudio={!!form.audio_url}
                        cues={form.audio_cues}
                        templateId={form.template_id}
                      />
                      <Textarea
                        label={t("teacherExerciseEditor.audio.scriptLabel")}
                        rows={3}
                        value={form.audio_script}
                        onChange={set("audio_script")}
                      />
                      {/* Tạo audio bằng TTS từ Lời thoại → kèm phụ đề đồng bộ (karaoke). Dạt PHẢI. */}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={onGenerateTts}
                          disabled={ttsBusy || !form.audio_script.trim()}
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-50"
                        >
                          {ttsBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Headphones className="size-4" />
                          )}
                          {ttsBusy ? t("teacherExerciseEditor.actions.creating") : t("teacherExerciseEditor.audio.generateTts")}
                        </button>
                      </div>
                    </div>
                  </section>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAudioOpt(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm font-medium text-slate-500 transition hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-cyan-500"
                  >
                    <Plus className="size-4" /> {t("teacherExerciseEditor.audio.addAudioSection")}
                  </button>
                ))}

              {/* Bộ thẻ từ vựng — soạn ngay tại đây (từ lấy/nạp vào ngân hàng dùng chung). */}
              {isDeckTemplate && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    {t("teacherExerciseEditor.deck.title")}
                  </h2>
                  <p className="mb-3 text-xs text-slate-500">
                    {t("teacherExerciseEditor.deck.embeddedDescription")}
                  </p>
                  <VocabDeckBuilder
                    ref={deckRef}
                    value={form.vocab_deck}
                    onChange={(v: VocabDeckConfig) => patch({ vocab_deck: v })}
                    aiContext={deckAiContext}
                  />
                  {/* Chỉ soi được bài ĐÃ LƯU (cần slug để tra deck trong DB). */}
                </section>
              )}

              {/* Từ vựng — vocab_builder bắt buộc (hiện thẳng); các skill khác tùy chọn:
              chưa có từ nào thì gập sau nút "Thêm từ vựng" cho gọn. */}
              {!isDeckTemplate &&
                canWordlist &&
                (showWordlistCard ? (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {wordlistOptional ? t("teacherExerciseEditor.wordlist.titleOptional") : t("teacherExerciseEditor.wordlist.title")}
                      </h2>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          patch({
                            wordlist: [
                              ...form.wordlist,
                              {
                                _k: nextKey(),
                                word: "",
                                ipa: "",
                                meaning: "",
                                example: "",
                                pos: "",
                              },
                            ],
                          })
                        }
                      >
                        <Plus className="size-3.5" /> {t("teacherExerciseEditor.wordlist.addWord")}
                      </Button>
                    </div>
                    {form.wordlist.length === 0 ? (
                      <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
                        {t("teacherExerciseEditor.wordlist.empty")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {form.wordlist.map((w, i) => (
                          <div
                            key={w._k}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input
                              className="h-10 min-w-32 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder="word"
                              value={w.word}
                              onChange={(e) =>
                                patch({
                                  wordlist: form.wordlist.map((x, idx) =>
                                    idx === i
                                      ? { ...x, word: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                            <input
                              className="h-10 min-w-28 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder="ipa"
                              value={w.ipa}
                              onChange={(e) =>
                                patch({
                                  wordlist: form.wordlist.map((x, idx) =>
                                    idx === i
                                      ? { ...x, ipa: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                            <input
                              className="h-10 w-20 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder={t("teacherExerciseEditor.wordlist.posPlaceholder")}
                              title={t("teacherExerciseEditor.wordlist.posTitle")}
                              value={w.pos}
                              onChange={(e) =>
                                patch({
                                  wordlist: form.wordlist.map((x, idx) =>
                                    idx === i
                                      ? { ...x, pos: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                            <input
                              className="h-10 min-w-32 flex-[2] rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder={t("teacherExerciseEditor.wordlist.meaningPlaceholder")}
                              value={w.meaning}
                              onChange={(e) =>
                                patch({
                                  wordlist: form.wordlist.map((x, idx) =>
                                    idx === i
                                      ? { ...x, meaning: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                            <button
                              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                              title={t("teacherExerciseEditor.wordlist.deleteWord")}
                              onClick={() =>
                                patch({
                                  wordlist: form.wordlist.filter(
                                    (_, idx) => idx !== i,
                                  ),
                                })
                              }
                            >
                              <X className="size-4" />
                            </button>
                            <input
                              className="h-10 basis-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              placeholder={t("teacherExerciseEditor.wordlist.examplePlaceholder")}
                              value={w.example}
                              onChange={(e) =>
                                patch({
                                  wordlist: form.wordlist.map((x, idx) =>
                                    idx === i
                                      ? { ...x, example: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowWordlistOpt(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-4 text-sm font-medium text-slate-500 transition hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-cyan-500"
                  >
                    <Plus className="size-4" /> {t("teacherExerciseEditor.wordlist.addWordlistSection")}
                  </button>
                ))}

              {/* Câu hỏi — hiện khi Type có câu hỏi (grammar/reading/listening/vocabulary/mixed). */}
              {canQuestions && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      {t("teacherExerciseEditor.questions.title")}{" "}
                      <span className="text-slate-400">
                        ({form.questions.length})
                      </span>
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {ADD_BTNS.filter(
                        (b) => !allowedTypes || allowedTypes.includes(b.type),
                      ).map((b) => (
                        <Button
                          key={b.type}
                          size="sm"
                          variant="secondary"
                          onClick={() => addQ(b.type)}
                        >
                          <b.Icon className="size-3.5" /> {b.label}
                        </Button>
                      ))}
                      {/* Soạn câu bằng AI NGOÀI: lấy prompt (0 token) → dán JSON trả về, NỐI THÊM
                          vào bài. Khác tab JSON ở trên, vốn ghi đè trọn bài. */}
                      <Button size="sm" variant="secondary" onClick={() => setQPromptSetup(true)}>
                        <Sparkles className="size-3.5" /> Copy prompt
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setQImportOpen(true)}>
                        <ClipboardPaste className="size-3.5" /> {t("teacherExerciseEditor.questions.pasteJson")}
                      </Button>
                    </div>
                  </div>

                  {/* Exercise-level scaffolding for the translate questions — one rung for the
                      whole exercise, so it only appears once the exercise has one. */}
                  {form.questions.some((q) => q.type === "translate") && (
                    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                      <Select
                        label={t("teacherExerciseEditor.questions.translateLevelLabel")}
                        options={TRANSLATE_LEVEL_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                        value={form.translate_level || "easy"}
                        onChange={(v) => patch({ translate_level: v })}
                      />
                    </div>
                  )}

                  {form.questions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
                      {t("teacherExerciseEditor.questions.empty")}
                    </div>
                  ) : (
                    <DndContext sensors={qSensors} collisionDetection={closestCenter} onDragEnd={onQDragEnd}>
                    <SortableContext items={form.questions.map((q) => q._k)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2.5">
                      {form.questions.map((q, i) => (
                        <QuestionCard
                          key={q._k}
                          q={q}
                          index={i}
                          expanded={expandedKey === q._k}
                          onToggle={() =>
                            setExpandedKey((k) => (k === q._k ? null : q._k))
                          }
                          onChange={(p) => updateQ(i, p)}
                          onRemove={() => removeQ(i)}
                          onDuplicate={() => dupQ(i)}
                        />
                      ))}
                    </div>
                    </SortableContext>
                    </DndContext>
                  )}
                </div>
              )}
            </div>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* Mobile: tách 2 hàng (title / nút+tabs); desktop: inline 2 bên */}
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {t("teacherExerciseEditor.fullJson.title")}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t("teacherExerciseEditor.fullJson.description")}
                  </p>
                </div>
              </div>
              <JsonEditor
                value={fullJson}
                onChange={setFullJson}
                className="h-[62vh] min-h-[420px]"
                ariaLabel={t("teacherExerciseEditor.fullJson.ariaLabel")}
                placeholder='{ "title": "…", "skill": "grammar", "level": "Movers", "published": true, "questions": [ … ] }'
                actions={
                  <Tooltip label={t("teacherExerciseEditor.fullJson.formatJson")}>
                    <button
                      type="button"
                      onClick={formatJson}
                      aria-label={t("teacherExerciseEditor.fullJson.formatJson")}
                      className="flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-white/90 text-slate-500 backdrop-blur transition hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      <Sparkles className="size-4" />
                    </button>
                  </Tooltip>
                }
              />
            </section>
          )}

          {/* Sticky action bar */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
            <div className="mx-auto flex max-w-[1000px] items-center gap-3 px-4 py-3">
              <div className="flex-1">{tabsEl}</div>
              <Button
                variant="secondary"
                onClick={goBack}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!canSave}
                onClick={save}
                // Vừa lưu xong → nút xanh "Đã lưu ✓" (2.5s) rồi về "Lưu bài". Không toast, không thoát.
                className={
                  savedTick
                    ? "!bg-emerald-500 hover:!bg-emerald-600"
                    : undefined
                }
              >
                {saveMut.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {t("common.saving")}
                  </>
                ) : savedTick ? (
                  <>
                    <Check className="size-4" /> {t("common.saved")}
                  </>
                ) : (
                  <>
                    <Save className="size-4" /> {t("teacherExerciseEditor.actions.saveExercise")}
                  </>
                )}
              </Button>
            </div>
          </div>

          <TagManagerPopover
            anchorRef={manageTagsAnchor}
            open={manageTags}
            onClose={() => setManageTags(false)}
          />

          <AudioLibraryDrawer
            open={showLib}
            current={form.audio_url}
            onClose={() => setShowLib(false)}
            onPick={(url) => {
              patch({ audio_url: url, audio_cues: null, audio_voice: "" }); // audio thư viện không kèm phụ đề/giọng TTS
              setShowLib(false);
            }}
          />

          {qPromptSetup && (
            <QuestionsPromptModal
              form={form}
              types={(allowedTypes ?? ALL_TYPES) as QType[]}
              topics={topicsList}
              onClose={() => setQPromptSetup(false)}
              onReady={setQPrompt}
            />
          )}
          {qPrompt && <PromptModal data={qPrompt} onClose={() => setQPrompt(null)} />}
          {qImportOpen && (
            <QuestionsImportModal onClose={() => setQImportOpen(false)} onImport={importQuestionsJson} />
          )}
        </>
      )}
    </div>
  );
}

// Nút gạt (toggle switch).
// Chọn nhiều học sinh — dropdown có ô tìm kiếm trong popover (danh sách lớn).
function StudentPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  // Every active learner account (assignment no longer needs a class).
  const { data } = useQuery({
    queryKey: ["teacher-users", "picker"],
    queryFn: () => teacherUsersApi.list({ status: "active" }),
  });
  const items = (data?.items ?? []).map((s) => ({
    id: s.id,
    name: s.name ?? s.email,
  }));
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const filtered = items.filter((s) =>
    s.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  const nameOf = (id: string) => items.find((s) => s.id === id)?.name ?? id;

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {t("teacherExerciseEditor.assign.label")}
      </label>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 text-left dark:border-slate-700 dark:bg-slate-800"
        >
          <span
            className={
              selected.length
                ? "text-sm text-slate-800 dark:text-white"
                : "text-sm text-slate-400"
            }
          >
            {selected.length
              ? t("teacherExerciseEditor.assign.selectedCount", { n: selected.length })
              : t("teacherExerciseEditor.assign.placeholder")}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-2 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("teacherExerciseEditor.assign.searchPlaceholder")}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">
                  {t("teacherExerciseEditor.assign.notFound")}
                </p>
              ) : (
                filtered.map((s) => {
                  const on = selected.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-sm transition ${on ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300" : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                    >
                      <span className="truncate">{s.name}</span>
                      {on && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-300"
            >
              {nameOf(id)}
              <button
                onClick={() => toggle(id)}
                className="text-cyan-500 hover:text-cyan-700"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Tô màu prompt (markdown-ish + JSON) cho modal xem prompt.
function highlightPrompt(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tok = (s: string) =>
    esc(s).replace(
      /("(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?)/g,
      (m) => {
        let c = "text-amber-600 dark:text-amber-400";
        if (m[0] === '"')
          c = /:\s*$/.test(m)
            ? "text-sky-600 dark:text-sky-300"
            : "text-emerald-600 dark:text-emerald-400";
        else if (m === "true" || m === "false")
          c = "text-violet-600 dark:text-violet-400";
        else if (m === "null") c = "text-rose-500 dark:text-rose-400";
        return `<span class="${c}">${m}</span>`;
      },
    );
  return text
    .split("\n")
    .map((line) => {
      if (/^[A-Z][A-Z0-9 ]{3,}/.test(line))
        return `<span class="font-bold text-slate-900 dark:text-white">${esc(line)}</span>`;
      if (/^\s*-\s/.test(line))
        return `<span class="text-slate-500 dark:text-slate-400">-</span>${tok(line.replace(/^(\s*)-/, "$1"))}`;
      return tok(line);
    })
    .join("\n");
}

function CopyMini({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error(t("teacherExerciseEditor.copy.failed")),
        )
      }
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {copied ? (
        <Check className="size-3 text-emerald-500" />
      ) : (
        <Copy className="size-3" />
      )}{" "}
      {copied ? t("teacherExerciseEditor.copy.copied") : label}
    </button>
  );
}

/**
 * Setup for the "Copy prompt" flow in the Questions section.
 *
 * The point of the controls is to keep the prompt SMALL and on-target. Naming the grammar points
 * (or just the CEFR bands) means the server sends those rows instead of the whole 129-line
 * catalogue — measured at 12.5k characters down to 2.8k — and adds the detailed description
 * (form, signals, common mistakes) of the points that were actually named.
 */
function QuestionsPromptModal({
  form,
  types,
  topics,
  onClose,
  onReady,
}: {
  form: EditorState;
  types: QType[];
  topics: Topic[];
  onClose: () => void;
  onReady: (data: { system: string; user: string }) => void;
}) {
  // Chủ đề lấy từ CÂY CHỦ ĐỀ dùng chung, mặc định theo chủ đề đã gắn cho bài.
  const [topicId, setTopicId] = useState(form.topic_id ?? "");
  // Nội dung bài (đoạn văn / kịch bản nghe) — câu hỏi phải bám vào đây khi bài có nội dung.
  const [source, setSource] = useState(form.passage?.trim() || form.audio_script?.trim() || "");
  const [grammarIds, setGrammarIds] = useState<string[]>([]);
  const [addingGrammar, setAddingGrammar] = useState(false);
  const [bands, setBands] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [keywords, setKeywords] = useState("");
  const [count, setCount] = useState("10"); // NumberInput works in strings
  const [difficulty, setDifficulty] = useState("");
  const [loading, setLoading] = useState(false);
  useOverlayHistory(true, onClose);

  const { data: grammarData } = useQuery({
    queryKey: ["grammar"],
    queryFn: publicGrammar,
    staleTime: Infinity,
    retry: false,
  });
  // Grammar targeting only makes sense where the questions test grammar at all.
  const showGrammar = form.skill === "grammar" || form.skill === "mixed" || !form.skill;

  /** Chủ đề (kèm chủ đề cha) + nội dung bài + tiêu đề — cùng khuôn với `deckAiContext`. */
  function sourceText(): string {
    const topic = topics.find((t) => t.id === topicId);
    const parent = topic?.parent_id ? topics.find((t) => t.id === topic.parent_id) : undefined;
    return [
      [parent?.name, topic?.name].filter(Boolean).join(" — "),
      form.title.trim(),
      source.trim(),
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function run() {
    const src = sourceText();
    if (!src) return toast.error(t("teacherExerciseEditor.promptModal.errorMissingContext"));
    setLoading(true);
    try {
      onReady(
        await aiApi.questionsPrompt({
          source: src,
          skill: form.skill || null,
          level: form.level || null,
          count: Math.max(1, Math.min(20, Number(count) || 10)),
          types,
          grammar_ids: grammarIds.length ? grammarIds : null,
          // Bands only matter when no point was named — otherwise the named points win.
          bands: !grammarIds.length && bands.length ? (bands as Cefr[]) : null,
          context: context.trim() || null,
          keywords: keywords.trim() || null,
          difficulty: (difficulty || null) as "easy" | "medium" | "hard" | null,
        }),
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.promptModal.errorGetPrompt"));
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ animation: "fade-in 0.18s ease-out" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">{t("teacherExerciseEditor.promptModal.title")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <TopicPicker topics={topics} value={topicId} onChange={setTopicId} />
          <Textarea
            label={t("teacherExerciseEditor.promptModal.sourceLabel")}
            rows={3}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t("teacherExerciseEditor.promptModal.sourcePlaceholder")}
          />

          {showGrammar && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Grammar focus
              </label>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                {t("teacherExerciseEditor.promptModal.grammarHint")}
              </p>
              <div className="space-y-2">
                {grammarIds.map((id) => {
                  const g = grammarData?.items.find((x) => x.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
                    >
                      <BookText className="size-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {g?.title ?? id}
                      </span>
                      <button
                        type="button"
                        onClick={() => setGrammarIds((v) => v.filter((x) => x !== id))}
                        className="shrink-0 text-slate-400 transition hover:text-rose-600"
                        aria-label={t("teacherExerciseEditor.actions.remove")}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
                {addingGrammar ? (
                  <GrammarPicker
                    label={null}
                    value=""
                    onChange={(gid) => {
                      if (gid) setGrammarIds((v) => (v.includes(gid) ? v : [...v, gid]));
                      setAddingGrammar(false);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingGrammar(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-sm text-cyan-600 dark:border-slate-600"
                  >
                    <Plus className="size-4" />
                    {grammarIds.length ? t("teacherExerciseEditor.promptModal.addGrammarOther") : t("teacherExerciseEditor.promptModal.addGrammar")}
                  </button>
                )}
              </div>

              {!grammarIds.length && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">{t("teacherExerciseEditor.promptModal.orRandomBand")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {CEFR_BANDS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBands((v) => (v.includes(b) ? v.filter((x) => x !== b) : [...v, b]))}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                          bands.includes(b)
                            ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-500/50 dark:bg-cyan-500/10 dark:text-cyan-300"
                            : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700",
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <Input
            label={t("teacherExerciseEditor.promptModal.contextLabel")}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={t("teacherExerciseEditor.promptModal.contextPlaceholder")}
          />
          <Input
            label={t("teacherExerciseEditor.promptModal.keywordsLabel")}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="vd: homework, teacher, library"
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label={t("teacherExerciseEditor.promptModal.countLabel")} min={1} max={20} value={count} onChange={setCount} />
            <Select
              label={t("teacherExerciseEditor.promptModal.difficultyLabel")}
              options={[
                { value: "", label: t("teacherExerciseEditor.promptModal.difficultyDefault") },
                { value: "easy", label: t("teacherExerciseEditor.promptModal.difficultyEasy") },
                { value: "medium", label: t("teacherExerciseEditor.promptModal.difficultyMedium") },
                { value: "hard", label: t("teacherExerciseEditor.promptModal.difficultyHard") },
              ]}
              value={difficulty}
              onChange={setDifficulty}
            />
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 p-5 dark:border-slate-800">
          <Button disabled={loading} onClick={run} className="w-full">
            <Sparkles className="size-4" /> {loading ? t("teacherExerciseEditor.promptModal.building") : t("teacherExerciseEditor.promptModal.getPrompt")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Paste the JSON an outside AI produced. Appends questions; never touches the rest of the exercise. */
function QuestionsImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  useOverlayHistory(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ animation: "fade-in 0.18s ease-out" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">{t("teacherExerciseEditor.importModal.title")}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("teacherExerciseEditor.importModal.description1")} <code>{"{ \"questions\": [...] }"}</code> {t("teacherExerciseEditor.importModal.descriptionOr")}{" "}
            <code>[...]</code>. {t("teacherExerciseEditor.importModal.description2")} <strong>{t("teacherExerciseEditor.importModal.appendEnd")}</strong>{t("teacherExerciseEditor.importModal.description3")}
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => { setText(e.target.value); setErr(""); }}
            placeholder={'{ "questions": [ { "type": "translate", "question": "…", "answer": "…" } ] }'}
            className="min-h-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          {err && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{err}</p>}
          <Button
            disabled={!text.trim()}
            onClick={() => {
              try {
                onImport(text);
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : t("teacherExerciseEditor.importModal.errorImport"));
              }
            }}
          >
            <ClipboardPaste className="size-4" /> {t("teacherExerciseEditor.importModal.addQuestions")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PromptModal({
  data,
  onClose,
}: {
  data: { system: string; user: string };
  onClose: () => void;
}) {
  // Panel anchored on the RIGHT, on top of the drawer (that's where the eye is focused). Higher z than the drawer.
  // Hand-rolled overlay (not the shared <Drawer>) → wire it into history manually so Back
  // closes this panel instead of leaving the editor page.
  useOverlayHistory(true, onClose);
  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ animation: "fade-in 0.18s ease-out" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white">
            {t("teacherExerciseEditor.promptView.title")}
          </h3>
          <div className="flex items-center gap-2">
            <CopyMini
              text={`SYSTEM:\n${data.system}\n\nUSER:\n${data.user}`}
              label={t("teacherExerciseEditor.promptView.copyAll")}
            />
            <button
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
              User
            </p>
            <CopyMini text={data.user} />
          </div>
          <pre
            className="mb-5 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-mono leading-relaxed dark:bg-slate-800/60"
            dangerouslySetInnerHTML={{ __html: highlightPrompt(data.user) }}
          />
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-600">
              System
            </p>
            <CopyMini text={data.system} />
          </div>
          <pre
            className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 font-mono leading-relaxed dark:bg-slate-800/60"
            dangerouslySetInnerHTML={{ __html: highlightPrompt(data.system) }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AiComposerPanel({
  onSaved,
  initialConfig,
  targetExerciseId,
  targetTitle,
  toolbarSlot,
  onBack,
  onManualTemplate,
}: {
  onSaved: () => void;
  onBack: () => void;
  /** Picked a template the composer cannot build → hand the editor over to the manual mode. */
  onManualTemplate?: (templateId: string) => void;
  initialConfig?: Record<string, unknown> | null; // nạp sẵn config (Tạo lại bằng AI)
  targetExerciseId?: string | null; // đang sửa bài có sẵn → cho chọn ghi đè / tạo mới
  targetTitle?: string | null; // tiêu đề bài đang sửa — khoá lại khi ghi đè (slug không đổi)
  /** Header element the save/load template buttons are portaled into. */
  toolbarSlot?: HTMLElement | null;
}) {
  // Bài có sẵn: mặc định GHI ĐÈ (đúng nghĩa "tạo lại"); tắt = tạo bản mới.
  const [overwrite, setOverwrite] = useState(true);
  // exercise_id khi lưu TRỰC TIẾP/HÀNG CHỜ: có target + ghi đè → đè; còn lại → undefined (mới).
  const overwriteId =
    targetExerciseId && overwrite ? targetExerciseId : undefined;
  const [prompt, setPrompt] = useState("");
  // Chọn 1 kỹ năng → 1 template (blueprint). Template quyết pipeline + tập dạng câu + prompt.
  const [skill, setSkill] = useState<string>("grammar");
  const [templateId, setTemplateId] = useState<string>("grammar_drill");
  const [level, setLevel] = useState("");
  const [tagId, setTagId] = useState(""); // nhãn phân loại (quyết định phạm vi).
  // Trường chọn nhanh → gộp vào prompt (đỡ phải gõ tay). Topic còn được gắn vào bài (topic_id).
  const [topicId, setTopicId] = useState(""); // 1 chủ đề (cha HOẶC con — con đã ngụ ý cha)
  const [age, setAge] = useState(""); // khoảng tuổi chọn sẵn (dưới 20 mới phân biệt nhiều)
  const [count, setCount] = useState(""); // số câu (rỗng = để AI tự quyết)
  const [grammarIds, setGrammarIds] = useState<string[]>([]); // điểm ngữ pháp muốn tập trung (nhiều)
  const [addingGrammar, setAddingGrammar] = useState(false);
  const [tone, setTone] = useState(""); // giọng/kiểu bài
  const [vocabTheme, setVocabTheme] = useState(""); // từ khoá/chủ điểm từ vựng muốn nhắm
  const [explainLang, setExplainLang] = useState(""); // "" = tiếng Việt (mặc định), "en" = English
  const [context, setContext] = useState(""); // bối cảnh tình huống (school/family/travel…)
  const [qtypes, setQtypes] = useState<string[]>([]); // override tập dạng câu (rỗng = theo template)
  const [difficulty, setDifficulty] = useState(""); // độ khó TRONG level
  const [length, setLength] = useState(""); // độ dài đoạn văn/kịch bản nghe
  // ── Bài BỘ THẺ từ vựng (vocab v2) ──
  // Cấu hình deck do <VocabDeckBuilder> quản (dùng chung với trình soạn bài); panel chỉ
  // giữ tiêu đề vì các ô Level/Topic/Status/Assign đã có sẵn ở đây.
  const [deckTitle, setDeckTitle] = useState("");
  const deckRef = useRef<VocabDeckHandle>(null); // prepare(): nạp thẻ mới vào kho trước khi tạo bài
  // Số từ + dạng mục giữ Ở ĐÂY (không trong VocabDeckBuilder) vì Auto-fill/Enhance phải mô tả
  // được chúng cho AI, và ô "Dạng mục" xếp cạnh Tên bài.
  const [deckCount, setDeckCount] = useState(15);
  const [deckForm, setDeckForm] = useState<VocabItemForm>("both");
  const [deck, setDeck] = useState<VocabDeckConfig | null>(null);
  // Selected blueprint + derived pipeline (mode): pronunciation→reading, writing→writing,
  // deck→deck, everything else→quiz.
  const bp = getBlueprint(templateId);
  const mode: "quiz" | "reading" | "writing" | "deck" =
    bp?.gradingPipeline === "pronunciation"
      ? "reading"
      : bp?.gradingPipeline === "writing"
        ? "writing"
        : bp?.gradingPipeline === "deck"
          ? "deck"
          : "quiz";
  // Bài từ vựng (vocab v2) đi đường HOÀN TOÀN RIÊNG: không gọi AI sinh câu hỏi, mà
  // sinh/dán danh sách TỪ → nạp ngân hàng (khử trùng) → bài chỉ tham chiếu qua vocab_deck.
  const isDeck = mode === "deck";
  // Translation items carry a Vietnamese prompt and accepted English variants worth a look first.
  const reviewFirst = templateId === "grammar_translate";
  // Trường nào HỢP LỆ theo dạng bài: câu hỏi (Questions/Explanation) chỉ khi bài có câu;
  // Length (đoạn văn/kịch bản nghe) chỉ khi bài có passage/audio; Grammar chỉ grammar/mixed.
  const hasQuestions = bp ? bp.structure.questions !== "forbidden" : true;
  const hasPassageOrAudio = bp
    ? bp.structure.passage !== "forbidden" ||
      bp.structure.audioScript !== "forbidden"
    : true;
  // Grammar focus chỉ hợp lệ khi blueprint cho phép (grammar_drill required, mixed_all optional) → ẨN nếu không.
  const hasGrammarFocus = bp
    ? bp.structure.grammarFocus !== "forbidden"
    : false;
  // Đổi kỹ năng → chọn template đầu tiên của kỹ năng đó + reset override dạng câu.
  const pickSkill = (s: string) => {
    setSkill(s);
    setQtypes([]);
    if (s !== "grammar" && s !== "mixed") {
      setGrammarIds([]); // grammar focus chỉ hợp lý cho grammar/mixed
      setAddingGrammar(false);
    }
    const first = blueprintsForSkill(s as Skill)[0];
    if (first) setTemplateId(first.id);
  };
  // Picking a type sets its skill too (same clean-up as a skill change), then keeps that type.
  const pickTemplate = (id: string) => {
    const b = getBlueprint(id);
    // Dictation & Shadowing is built from a video or audio, not generated: it has its own editor.
    if (b?.video && onManualTemplate) return onManualTemplate(id);
    if (b && b.skill !== skill) pickSkill(b.skill);
    setTemplateId(id);
    setQtypes([]);
  };
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [suggesting, setSuggesting] = useState(false); // đang gợi ý AI (Context + Vocabulary)
  const [publishMode, setPublishMode] = useState("publish");
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{
    system: string;
    user: string;
  } | null>(null);

  // Level lấy từ cấp độ giáo viên đang có (kèm icon + màu).
  const { data: levelsData } = useQuery({
    queryKey: ["levels"],
    queryFn: levelsApi.list,
  });
  const levelOptions = levelSelectOptions(levelsData?.items, {
    by: "name",
    all: { value: "", label: t("teacherExerciseEditor.composer.levelPlaceholder") },
  });
  // Ô Level của panel giữ TÊN cấp độ (options by:"name"); ngân hàng từ vựng cần ID → tra ngược.
  const levelId = levelsData?.items.find((l) => l.name === level)?.id ?? null;
  const { data: topicsData } = useQuery({
    queryKey: ["topics"],
    queryFn: topicsApi.list,
  });
  const topicsList = topicsData?.items ?? [];
  // Chủ đề GỐC của lựa chọn (chọn con → lấy cha) — nhóm gắn cho từ vựng mới chỉ dùng cấp 1.
  const rootTopicId = (() => {
    const t = topicsList.find((x) => x.id === topicId);
    return t ? (t.parent_id ?? t.id) : "";
  })();
  // Sổ tay ngữ pháp (react-query cache dùng chung với GrammarPicker) — để lấy TÊN điểm ngữ pháp.
  const { data: grammarData } = useQuery({
    queryKey: ["grammar"],
    queryFn: publicGrammar,
    staleTime: Infinity,
    retry: false,
  });
  // Tuổi: chỉ phân biệt rõ ở <20 (trưởng thành ai cũng như nhau) → list khoảng tuổi chọn sẵn.
  const AGE_OPTIONS = [
    { value: "", label: t("teacherExerciseEditor.composer.ageAny") },
    { value: "5-6", label: t("teacherExerciseEditor.composer.age56") },
    { value: "7-9", label: t("teacherExerciseEditor.composer.age79") },
    { value: "10-12", label: t("teacherExerciseEditor.composer.age1012") },
    { value: "13-15", label: t("teacherExerciseEditor.composer.age1315") },
    { value: "16-18", label: t("teacherExerciseEditor.composer.age1618") },
    { value: "adults", label: t("teacherExerciseEditor.composer.ageAdults") },
  ];
  const TONE_OPTIONS = [
    { value: "", label: t("teacherExerciseEditor.composer.default") },
    { value: "friendly", label: t("teacherExerciseEditor.composer.toneFriendly") },
    { value: "exam-style", label: t("teacherExerciseEditor.composer.toneExam") },
    { value: "story-based", label: t("teacherExerciseEditor.composer.toneStory") },
    { value: "real-life", label: t("teacherExerciseEditor.composer.toneReal") },
  ];
  const EXPLAIN_OPTIONS = [
    { value: "", label: t("teacherExerciseEditor.composer.explainEn") },
    { value: "vi", label: t("teacherExerciseEditor.composer.explainVi") },
  ];
  const DIFFICULTY_OPTIONS = [
    { value: "", label: t("teacherExerciseEditor.composer.difficultyAny") },
    { value: "easy", label: t("teacherExerciseEditor.composer.easy") },
    { value: "medium", label: t("teacherExerciseEditor.composer.medium") },
    { value: "hard", label: t("teacherExerciseEditor.composer.hard") },
  ];
  // Passage (reading) or audio script (listening) length; super long is close to a real exam.
  const LENGTH_OPTIONS = [
    { value: "", label: t("teacherExerciseEditor.composer.default") },
    { value: "short", label: t("teacherExerciseEditor.composer.lengthShort") },
    { value: "medium", label: t("teacherExerciseEditor.composer.lengthMedium") },
    { value: "long", label: t("teacherExerciseEditor.composer.lengthLong") },
    { value: "super_long", label: t("teacherExerciseEditor.composer.lengthSuper") },
  ];
  // Advanced block: how many of its fields apply to this template, and how many differ from default.
  const advancedFields = [hasQuestions, !!bp && bp.allowedTypes.length > 1, hasPassageOrAudio, !isDeck, hasQuestions].filter(Boolean).length;
  const advancedSet = [
    hasQuestions && count,
    !!bp && bp.allowedTypes.length > 1 && qtypes.length > 0,
    hasPassageOrAudio && length,
    !isDeck && tone,
    hasQuestions && explainLang,
  ].filter(Boolean).length;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Các dòng cấu trúc (từ các field đã chọn) — dùng chung cho generate + Enhance context.
  function structuredLines(): string[] {
    const lines: string[] = [];
    if (level) lines.push(`- Level (set output "level" = this): ${level}`);
    const topic = topicId
      ? topicsData?.items.find((t) => t.id === topicId)
      : null;
    if (topic) {
      const parent = topic.parent_id
        ? topicsData?.items.find((t) => t.id === topic.parent_id)
        : null;
      lines.push(
        `- Topic: ${parent ? `${parent.name} — ${topic.name}` : topic.name}`,
      );
    }
    if (age)
      lines.push(
        age === "adults"
          ? "- Target age: adults (18+)"
          : `- Target age: ${age} years old`,
      );
    if (hasQuestions && count) lines.push(`- Number of questions: ${count}`);
    if (isDeck) {
      lines.push(`- Number of words to pick: ${deckCount}`);
      lines.push(`- Item form: ${ITEM_FORM_EN[deckForm]}`);
    }
    // Tone → chỉ dẫn CỤ THỂ để model đổi cách hành văn/ngữ cảnh câu hỏi & đoạn văn.
    const TONE_PROMPT: Record<string, string> = {
      friendly: "friendly, warm and encouraging language",
      "exam-style": "formal, test-like phrasing similar to official exams",
      "story-based": "wrap the content in a short story / narrative context",
      "real-life": "practical, real-life everyday situations",
    };
    if (tone) lines.push(`- Tone/style: ${TONE_PROMPT[tone] ?? tone}`);
    if (difficulty) lines.push(`- Difficulty within the level: ${difficulty}`);
    const LENGTH_PROMPT: Record<string, string> = {
      short: "short (~40-60 words)",
      medium: "medium (~70-110 words)",
      long: "long (~120-180 words)",
      super_long: "very long (~200-320 words), exam-style reading",
    };
    if (hasPassageOrAudio && length)
      lines.push(`- Passage/audio length: ${LENGTH_PROMPT[length] ?? length}`);
    if (context.trim()) lines.push(`- Context/setting: ${context.trim()}`);
    if (vocabTheme.trim())
      lines.push(
        isDeck
          ? // Bộ thẻ: ô này là NHÓM TỪ VÍ DỤ để mở rộng, không phải danh sách phải dùng nguyên xi.
            `- Seed examples (a sample of the group wanted — EXPAND to more of the same kind, do not just copy): ${vocabTheme.trim()}`
          : `- Target vocabulary: ${vocabTheme.trim()} (use these words in the wordlist / questions)`,
      );
    if (hasQuestions)
      lines.push(
        explainLang === "vi"
          ? "- Explanation language: Vietnamese (write the `explanation` field in Vietnamese)"
          : "- Explanation language: English (write the `explanation` field in English)",
      );
    if (hasGrammarFocus && grammarIds.length) {
      const titles = grammarIds
        .map((id) => grammarData?.items.find((x) => x.id === id)?.title)
        .filter(Boolean);
      if (titles.length)
        lines.push(
          `- Grammar focus (target these points): ${titles.join("; ")}`,
        );
    }
    // Override dạng câu — chỉ giữ dạng nằm trong allowedTypes của template hiện tại.
    const okTypes = qtypes.filter((t) => bp?.allowedTypes.includes(t as never));
    if (okTypes.length)
      lines.push(`- Use ONLY these question types: ${okTypes.join(", ")}`);
    return lines;
  }
  // Kỹ năng/cấu trúc do TEMPLATE quyết ở server → generate không cần liệt kê tay.
  function composed(): string {
    return [structuredLines().join("\n"), prompt.trim()]
      .filter(Boolean)
      .join("\n");
  }
  // Prompt GỬI đi model. Khi GHI ĐÈ bài cũ: giữ nguyên slug → phải khoá đúng tiêu đề cũ
  // để không lệch "slug 1 kiểu, title 1 kiểu". Bài mới thì để AI tự đặt tiêu đề.
  function genPrompt(): string {
    const base = composed();
    if (targetExerciseId && overwrite && targetTitle?.trim()) {
      return `${base}\n\nIMPORTANT — this REGENERATES an existing exercise. Keep this EXACT title, do not invent a new one:\nTITLE: "${targetTitle.trim()}"`;
    }
    return base;
  }
  // Ngữ cảnh cho Enhance: kèm skill + dạng bài + dạng câu để AI làm rõ vai trò/skill/type.
  function enhanceContext(): string {
    const head: string[] = [`- Skill: ${skill}`];
    if (bp) head.push(`- Exercise type: ${bp.label} — ${bp.desc}`);
    const types = qtypes.length ? qtypes : (bp?.allowedTypes ?? []);
    if (types.length) head.push(`- Question types: ${types.join(", ")}`);
    return [...head, ...structuredLines()].join("\n");
  }
  // Enhance chỉ bấm được khi field CẦN THIẾT đã đủ: Level (bắt buộc) + có yêu cầu để làm giàu.
  const enhanceMissing = [
    !level && t("teacherExerciseEditor.composer.level"),
    !prompt.trim() && t("teacherExerciseEditor.aiComposer.missingExtraInstructions"),
  ].filter(Boolean) as string[];
  const canEnhance = enhanceMissing.length === 0;

  // Save/Load template — gom TẤT TẬT lựa chọn thành 1 config (localStorage).
  const genConfig = () => ({
    skill,
    templateId,
    topicId,
    age,
    count,
    tone,
    vocabTheme,
    explainLang,
    context,
    qtypes,
    difficulty,
    length,
    grammarIds,
    level,
    tagId,
    publishMode,
    prompt,
    // Bộ thẻ: chỉ lưu CÁCH LUYỆN để "Tạo lại bằng AI" ra đúng cấu hình cũ — danh sách từ
    // KHÔNG lưu vào đây (từ đã nằm trong ngân hàng, chép lại chỉ gây lệch).
    deckActs: deck?.activities,
    deckOrder: deck?.order,
    deckRetry: deck?.retryWrong,
    deckCount,
    deckForm,
  });
  const applyConfig = (c: Record<string, unknown>) => {
    const s = (v: unknown, d = "") => (typeof v === "string" ? v : d);
    setSkill(s(c.skill, "grammar"));
    setTemplateId(s(c.templateId, "grammar_drill"));
    // Config cũ lưu tách mẹ/con → gộp lại 1 topic (con ưu tiên).
    setTopicId(s(c.topicId) || s(c.subTopicId) || s(c.parentTopicId));
    setAge(s(c.age));
    setCount(s(c.count));
    setTone(s(c.tone));
    setVocabTheme(s(c.vocabTheme));
    setExplainLang(s(c.explainLang));
    setContext(s(c.context));
    setQtypes(Array.isArray(c.qtypes) ? (c.qtypes as string[]) : []);
    setDifficulty(s(c.difficulty));
    setLength(s(c.length));
    setGrammarIds(
      Array.isArray(c.grammarIds) ? (c.grammarIds as string[]) : [],
    );
    setLevel(s(c.level));
    setTagId(s(c.tagId));
    setPublishMode(s(c.publishMode, "publish"));
    setPrompt(s(c.prompt));
    // Bộ thẻ: khôi phục cách luyện, để trống phần nguồn từ (GV chọn lại từ cho bài mới).
    if (typeof c.deckCount === "number") setDeckCount(c.deckCount);
    if (
      c.deckForm === "word" ||
      c.deckForm === "phrase" ||
      c.deckForm === "both"
    )
      setDeckForm(c.deckForm);
    if (Array.isArray(c.deckActs))
      setDeck((d) => ({
        source: "fixed",
        wordIds: [],
        pronounce: "off",
        ...d,
        activities: c.deckActs as VocabActivity[],
        order: c.deckOrder === "grouped" ? "grouped" : "interleave",
        retryWrong: typeof c.deckRetry === "boolean" ? c.deckRetry : true,
      }));
  };
  // Nạp sẵn config khi "Tạo lại bằng AI" (panel remount theo key nên chạy 1 lần/mount).
  useEffect(() => {
    if (initialConfig) applyConfig(initialConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewPrompt() {
    if (!level) return toast.error(t("teacherExerciseEditor.aiComposer.errorChooseLevel"));
    if (!composed().trim())
      return toast.error(t("teacherExerciseEditor.aiComposer.errorChooseOptionOrPrompt"));
    try {
      setPreview(
        await (mode === "reading"
          ? aiApi.readingPrompt(genPrompt())
          : mode === "writing"
            ? aiApi.writingPrompt(genPrompt())
            : aiApi.exercisePrompt(genPrompt(), templateId, grammarIds)),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.promptModal.errorGetPrompt"));
    }
  }

  async function enhance() {
    if (!level) return toast.error(t("teacherExerciseEditor.aiComposer.errorLevelBeforeEnhance"));
    if (!prompt.trim()) return toast.error(t("teacherExerciseEditor.aiComposer.errorPromptBeforeEnhance"));
    setRefining(true);
    try {
      // Gửi kèm NGỮ CẢNH các field đã chọn → AI làm giàu, làm rõ vai trò/skill/type + sinh rule,
      // KHÔNG lặp lại metadata.
      const ctx = enhanceContext();
      const r = await (isDeck
        ? aiApi.refineVocabPrompt(prompt.trim(), ctx)
        : mode === "reading" || mode === "writing" // no questions: the quiz refiner talks of distractors and answer keys
          ? aiApi.refineReadingPrompt(prompt.trim(), ctx)
          : aiApi.refinePrompt(prompt.trim(), ctx));
      if (r.prompt?.trim()) {
        setPrompt(r.prompt.trim());
        toast.success(t("teacherExerciseEditor.aiComposer.toastEnhanced"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.aiComposer.errorEnhance"));
    } finally {
      setRefining(false);
    }
  }

  // METADATA gửi cho AI gợi ý — LIỆT KÊ ĐẦY ĐỦ các field chính (skill/type/level/topic/
  // sub-topic/age/tone/difficulty/length) để gợi ý sát hơn.
  function metaContext(): string {
    const lines: string[] = [`- Skill: ${skill}`];
    if (bp) lines.push(`- Exercise type: ${bp.label}`);
    if (level) lines.push(`- Level: ${level}`);
    const topic = topicId
      ? topicsData?.items.find((t) => t.id === topicId)
      : null;
    if (topic) {
      const parent = topic.parent_id
        ? topicsData?.items.find((t) => t.id === topic.parent_id)
        : null;
      lines.push(
        `- Topic: ${parent ? `${parent.name} — ${topic.name}` : topic.name}`,
      );
    }
    if (age)
      lines.push(
        age === "adults" ? "- Age: adults (18+)" : `- Age: ${age} years old`,
      );
    if (tone && !isDeck) lines.push(`- Tone/style: ${tone}`);
    if (difficulty) lines.push(`- Difficulty: ${difficulty}`);
    if (isDeck) {
      lines.push(`- Number of words to pick: ${deckCount}`);
      lines.push(`- Item form: ${ITEM_FORM_EN[deckForm]}`);
    }
    if (hasPassageOrAudio && length) lines.push(`- Length: ${length}`);
    // P2: input người dùng đã nhập → làm NỀN (giữ/tinh chỉnh, không thay bừa).
    if (context.trim())
      lines.push(`- Existing context (keep/refine): ${context.trim()}`);
    if (vocabTheme.trim())
      lines.push(
        isDeck
          ? `- Seed examples (expand into a wider group of the same kind): ${vocabTheme.trim()}`
          : `- Existing vocabulary (keep/refine): ${vocabTheme.trim()}`,
      );
    if (prompt.trim()) lines.push(`- Teacher notes: ${prompt.trim()}`);
    return lines.join("\n");
  }
  // Chỉ gợi ý được khi đã chọn ĐỦ field cần thiết: Level + Topic (skill/type luôn có).
  const suggestMissing = [
    !level && t("teacherExerciseEditor.composer.level"),
    !topicId && t("teacherExerciseEditor.composer.topic"),
  ].filter(
    Boolean,
  ) as string[];
  const canSuggest = suggestMissing.length === 0;

  // AI gợi ý GỘP Context/setting + Target vocabulary trong 1 lần gọi (tiết kiệm).
  // full=true → điền cả Extra instructions (nút Auto-fill).
  async function suggestPair(full = false) {
    if (!canSuggest) return toast.error(t("teacherExerciseEditor.aiComposer.errorLevelTopicBeforeSuggest"));
    setSuggesting(true);
    try {
      const r = await aiApi.suggestPair(
        metaContext(),
        full,
        isDeck ? "vocab" : "quiz",
      );
      if (r.context?.trim()) setContext(r.context.trim());
      if (r.vocabulary?.trim()) setVocabTheme(r.vocabulary.trim());
      if (full && r.instructions?.trim()) setPrompt(r.instructions.trim());
      // Tên bài: chỉ đè khi Auto-fill ĐẦY ĐỦ, hoặc khi GV chưa gõ gì — bấm ✨ ở ô Context
      // không được xoá tên bài đang gõ dở.
      if (isDeck && r.title?.trim() && (full || !deckTitle.trim()))
        setDeckTitle(r.title.trim());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.aiComposer.errorSuggest"));
    } finally {
      setSuggesting(false);
    }
  }
  // Nút AI nhỏ bên phải input (bấm ở Context HOẶC Vocabulary đều điền cả hai).
  const aiFieldBtn = () => (
    <button
      type="button"
      onClick={() => suggestPair()}
      disabled={suggesting || !canSuggest}
      title={
        canSuggest
          ? t("teacherExerciseEditor.aiComposer.suggestTooltipDeck")
          : t("teacherExerciseEditor.aiComposer.suggestTooltipMissing", { fields: suggestMissing.join(", ") })
      }
      className="flex size-6 items-center justify-center rounded-md text-violet-500 transition hover:bg-violet-50 disabled:opacity-40 dark:hover:bg-violet-500/10"
    >
      {suggesting ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
    </button>
  );

  // ── BỘ THẺ TỪ VỰNG ──────────────────────────────────────────────────────
  // Mô tả nguồn cho AI sinh danh sách từ: gộp các ô đã chọn (level/chủ đề/bối cảnh/từ nhắm).
  function deckWordSource(): string {
    const lines: string[] = [];
    // i18n-ignore-start: AI context lines
    if (level) lines.push(`Cấp độ: ${level}`);
    const topic = topicId
      ? topicsData?.items.find((t) => t.id === topicId)
      : null;
    if (topic) lines.push(`Chủ đề: ${topic.name}`);
    if (age)
      lines.push(age === "adults" ? "Người học: người lớn" : `Độ tuổi: ${age}`);
    if (context.trim()) lines.push(`Bối cảnh: ${context.trim()}`);
    // i18n-ignore-end
    // Ô "Target vocabulary" ở bộ thẻ là NHÓM VÍ DỤ để mở rộng, không phải danh sách bắt buộc.
    if (vocabTheme.trim())
      lines.push(
        // i18n-ignore: AI context
        `Nhóm từ ví dụ (mở rộng thêm cùng loại, đừng chép lại): ${vocabTheme.trim()}`,
      );
    if (prompt.trim()) lines.push(prompt.trim());
    return lines.join("\n");
  }

  // Tên bài gợi ý khi GV để trống lúc AI vừa gợi ý từ — ghép từ chính các ô đã chọn,
  // KHÔNG gọi thêm AI (một lần gọi cho danh sách từ là đủ tốn).
  function suggestedDeckTitle(): string {
    const topicName = topicId
      ? topicsData?.items.find((x) => x.id === topicId)?.name
      : "";
    const base = [topicName, context.trim()].filter(Boolean).join(" — ") || t("nav.vocabulary");
    return level ? `${base} · ${level}` : base;
  }

  // Tạo bài bộ thẻ — ĐẨY VÀO HÀNG CHỜ như mọi bài AI khác. Tìm từ + nạp ngân hàng + tra từ
  // điển + AI làm giàu đều chạy ở consumer (lib/ai/jobs.ts), trang không phải đứng đợi cả phút.
  async function generateDeck(pub: "publish" | "draft") {
    if (!deckTitle.trim()) return toast.error(t("teacherExerciseEditor.aiComposer.deckTitleRequired"));
    if (!deck?.activities.length)
      return toast.error(t("teacherExerciseEditor.aiComposer.deckActivitiesRequired"));
    const p = deckRef.current?.payload();
    if (!p) return toast.error(t("teacherExerciseEditor.aiComposer.deckBuildFailed"));

    setLoading(true);
    try {
      // "Dạng mục" đi theo `deckJob.form` (trường riêng của task) — nhét vào chuỗi prompt thì
      // model coi như văn bản nền và hay bỏ qua.
      const source = deckWordSource().trim();
      if (!source && !p.words.length && !p.wordIds.length)
        throw new Error(
          t("teacherExerciseEditor.aiComposer.deckMissingWords"),
        );

      await aiJobsApi.create({
        prompt: source || deckTitle.trim(),
        published: pub === "publish",
        assign_ids: assignIds,
        kind: "deck",
        template: templateId,
        tag_id: tagId || null,
        layer: null,
        topic_id: topicId || null,
        exercise_id: overwriteId,
        gen_config: {
          ...genConfig(),
          // teacherId do SERVER gắn (xem routes/ai.ts) — client không tự khai.
          deckJob: {
            title: deckTitle.trim(),
            level,
            // i18n-ignore-start: AI context
            learner: age
              ? age === "adults"
                ? "người lớn"
                : `học sinh ${age} tuổi`
              : "",
            // i18n-ignore-end
            count: p.count,
            levelId: p.levelId,
            topicIds: p.topicIds,
            enrich: p.enrich,
            form: deckForm,
            words: p.words,
            wordIds: p.wordIds,
            activities: p.activities,
            order: p.order,
            retryWrong: p.retryWrong,
            pronounce: p.pronounce,
          },
        },
      });
      toast.success(t("teacherExerciseEditor.aiComposer.toastDeckQueued"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.aiComposer.errorCreateDeck"));
    } finally {
      setLoading(false);
    }
  }

  // LUÔN đẩy vào HÀNG CHỜ (bất đồng bộ) → về danh sách. Hai lối tạo đồng bộ cũ
  // (chèn thẳng vào trình soạn · tạo trực tiếp không qua hàng chờ) đã bỏ.
  async function generate(pub: "publish" | "draft") {
    setPublishMode(pub);
    if (!level) return toast.error(t("teacherExerciseEditor.aiComposer.errorLevelRequired"));
    if (isDeck) return generateDeck(pub); // bài từ vựng: không sinh câu hỏi, dựng bộ thẻ
    if (!composed().trim())
      return toast.error(t("teacherExerciseEditor.aiComposer.errorOptionsRequired"));
    setLoading(true);
    try {
      await aiJobsApi.create({
        prompt: genPrompt(),
        published: pub === "publish",
        assign_ids: assignIds,
        kind: mode,
        template: templateId,
        grammar_ids: grammarIds,
        tag_id: tagId || null,
        layer: null,
        topic_id: topicId || null,
        gen_config: genConfig(),
        exercise_id: overwriteId,
      });
      toast.success(t("teacherExerciseEditor.aiComposer.toastExerciseQueued"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherExerciseEditor.aiComposer.errorCreateExercise"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Templates restore every field below; they render in the page header. */}
      {toolbarSlot && createPortal(<GenTemplatesBar getConfig={genConfig} applyConfig={applyConfig} side="down" />, toolbarSlot)}

      <section className="space-y-3">
        {/* The type is the choice; the skill follows it. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TemplatePicker all skill={skill} value={templateId} onChange={pickTemplate} label={t("teacherExerciseEditor.composer.type")} />
          <SkillReadout skill={skill} label={t("teacherExerciseEditor.composer.skill")} hint={t("teacherExerciseEditor.composer.skillAuto")} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label={t("teacherExerciseEditor.composer.level")}
            required
            options={levelOptions}
            value={level}
            onChange={setLevel}
            placeholder={t("teacherExerciseEditor.composer.levelPlaceholder")}
          />
          <Select label={t("teacherExerciseEditor.composer.age")} options={AGE_OPTIONS} value={age} onChange={setAge} />
          <Select
            label={t("teacherExerciseEditor.composer.difficulty")}
            options={DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={setDifficulty}
          />
          <StudentPicker selected={assignIds} onChange={setAssignIds} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TopicPicker
            label={t("teacherExerciseEditor.composer.topic")}
            topics={topicsList}
            value={topicId}
            onChange={setTopicId}
            placeholder={t("teacherExerciseEditor.composer.topicPlaceholder")}
            clearLabel={t("teacherExerciseEditor.composer.topicPlaceholder")}
          />
          <Input
            label={t("teacherExerciseEditor.composer.context")}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={t("teacherExerciseEditor.composer.contextPlaceholder")}
            rightIcon={aiFieldBtn()}
          />
          <div className="sm:col-span-2">
            <Input
              label={t("teacherExerciseEditor.composer.vocab")}
              value={vocabTheme}
              onChange={(e) => setVocabTheme(e.target.value)}
              placeholder={t("teacherExerciseEditor.composer.vocabPlaceholder")}
              rightIcon={aiFieldBtn()}
            />
          </div>
          {hasGrammarFocus && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("teacherExerciseEditor.composer.grammarFocus")}
              </label>
              <div className="space-y-2">
                {grammarIds.map((id) => {
                  const g = grammarData?.items.find((x) => x.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <BookText className="size-4 shrink-0 text-slate-400" />
                      {g && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                          {g.cefr}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {g?.title ?? id}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setGrammarIds((s) => s.filter((x) => x !== id))
                        }
                        className="shrink-0 text-slate-400 transition hover:text-rose-600"
                        aria-label={t("teacherExerciseEditor.actions.remove")}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}

                {addingGrammar ? (
                  <GrammarPicker
                    label={null}
                    value=""
                    onChange={(gid) => {
                      if (gid)
                        setGrammarIds((s) => (s.includes(gid) ? s : [...s, gid]));
                      setAddingGrammar(false);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingGrammar(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Plus className="size-4" />{" "}
                    {grammarIds.length
                      ? t("teacherExerciseEditor.promptModal.addGrammarOther")
                      : t("teacherExerciseEditor.promptModal.addGrammar")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("teacherExerciseEditor.composer.extra")}{" "}
              <span className="font-normal text-slate-400">({t("common.optional")})</span>
            </label>
            <div className="flex items-center gap-2">
              {/* Auto-fill PHỤ: điền cả Context + Vocabulary + Extra từ metadata (chủ động bấm). */}
              <button
                type="button"
                onClick={() => suggestPair(true)}
                disabled={suggesting || !canSuggest}
                title={
                  !canSuggest
                    ? t("teacherExerciseEditor.aiComposer.suggestTooltipMissing", { fields: suggestMissing.join(", ") })
                    : isDeck
                      ? t("teacherExerciseEditor.aiComposer.suggestTooltipDeck")
                      : t("teacherExerciseEditor.aiComposer.suggestTooltipDefault")
                }
                className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              >
                {suggesting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}{" "}
                {t("teacherExerciseEditor.composer.autoFill")}
              </button>
              <button
                type="button"
                onClick={enhance}
                disabled={refining || !canEnhance}
                title={
                  !canEnhance
                    ? t("teacherExerciseEditor.aiComposer.enhanceTooltipMissing", { fields: enhanceMissing.join(", ") })
                    : isDeck
                      ? t("teacherExerciseEditor.aiComposer.enhanceTooltipDeck")
                      : t("teacherExerciseEditor.aiComposer.enhanceTooltipDefault")
                }
                className="inline-flex items-center gap-1 rounded-lg bg-violet-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-40"
              >
                <Sparkles className="size-3.5" />{" "}
                {refining ? t("teacherExerciseEditor.aiComposer.enhancing") : "Enhance"}
              </button>
            </div>
          </div>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isDeck
                ? t("teacherExerciseEditor.aiComposer.promptPlaceholderDeck")
                : t("teacherExerciseEditor.aiComposer.promptPlaceholderDefault")
            }
            className="field-sizing-content min-h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {isDeck ? (
              <>
                {t("teacherExerciseEditor.aiComposer.deckHint1")} <b>Enhance</b> {t("teacherExerciseEditor.aiComposer.deckHint2")}{" "}
                <b>{t("teacherExerciseEditor.aiComposer.deckHint3")}</b> {t("teacherExerciseEditor.aiComposer.deckHint4")}{" "}
                <b>{t("teacherExerciseEditor.aiComposer.deckHint5")}</b> {t("teacherExerciseEditor.aiComposer.deckHint6")}
              </>
            ) : (
              <>
                {t("teacherExerciseEditor.aiComposer.defaultHint1")} <b>Enhance</b> {t("teacherExerciseEditor.aiComposer.defaultHint2")}{" "}
                <b>{t("teacherExerciseEditor.aiComposer.defaultHint3")}</b> {t("teacherExerciseEditor.aiComposer.defaultHint4")}
              </>
            )}
          </p>
        </div>
        {/* ── BỘ THẺ TỪ VỰNG — thay hẳn phần sinh câu hỏi (vocab v2,).
              Đặt SAU Level/Label/Status/Extra instructions và KHÔNG bọc thêm hộp: nó là phần
              nội dung của bài từ vựng, ngang hàng với các ô trên, không phải một khối lồng. ── */}
        {isDeck && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {t("teacherExerciseEditor.deck.title")}
              </p>
              <p className="text-xs text-slate-500">
                {t("teacherExerciseEditor.deck.description")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={t("teacherExerciseEditor.deck.nameLabel")}
                value={deckTitle}
                onChange={(e) => setDeckTitle(e.target.value)}
                placeholder="Unit 3 — Animals"
              />
              <Select
                label={t("teacherExerciseEditor.deck.itemFormLabel")}
                options={ITEM_FORM_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={deckForm}
                onChange={(v) => setDeckForm(v as VocabItemForm)}
              />
            </div>
            <VocabDeckBuilder
              ref={deckRef}
              value={deck}
              onChange={setDeck}
              groups={{ levelId, topicIds: rootTopicId ? [rootTopicId] : [] }}
              aiContext={deckWordSource}
              onAiSuggested={() => {
                if (!deckTitle.trim()) setDeckTitle(suggestedDeckTitle());
              }}
              count={deckCount}
              onCount={setDeckCount}
              itemForm={deckForm}
              onItemForm={setDeckForm}
            />
          </div>
        )}
      </section>

      {advancedFields > 0 && (
        <details
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
          className="group rounded-2xl border border-slate-200 dark:border-slate-800"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 select-none dark:text-slate-200">
            <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
            {t("teacherExerciseEditor.composer.sectionAdvanced")}
            {advancedSet > 0 ? (
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-bold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                {t("teacherExerciseEditor.composer.advancedChanged", { n: advancedSet })}
              </span>
            ) : (
              <span className="text-xs font-normal text-slate-400">{t("teacherExerciseEditor.composer.advancedHint")}</span>
            )}
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
            {hasQuestions && (
              <NumberInput
                label={t("teacherExerciseEditor.composer.count")}
                value={count}
                onChange={setCount}
                min={1}
                max={50}
                step={5}
                placeholder={t("teacherExerciseEditor.composer.auto")}
              />
            )}
            {bp && bp.allowedTypes.length > 1 && (
              <MultiCheckPopover
                label={t("teacherExerciseEditor.composer.qtypes")}
                placeholder={t("teacherExerciseEditor.composer.qtypesAll")}
                options={bp.allowedTypes.map((q) => ({
                  value: q,
                  label: getLang() === "en" ? QTYPE_LABEL_EN[q] : QTYPE_LABEL[q],
                }))}
                selected={qtypes}
                onChange={setQtypes}
              />
            )}
            {hasPassageOrAudio && (
              <Select label={t("teacherExerciseEditor.composer.length")} options={LENGTH_OPTIONS} value={length} onChange={setLength} />
            )}
            {!isDeck && (
              <Select label={t("teacherExerciseEditor.composer.tone")} options={TONE_OPTIONS} value={tone} onChange={setTone} />
            )}
            {hasQuestions && (
              <Select
                label={t("teacherExerciseEditor.composer.explainLang")}
                options={EXPLAIN_OPTIONS}
                value={explainLang}
                onChange={setExplainLang}
              />
            )}
          </div>
        </details>
      )}

      {/* Tạo lại: chỉ hiện khi đang sửa bài có sẵn — cho chọn GHI ĐÈ hay TẠO BẢN MỚI. */}
      {targetExerciseId && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <RefreshCw className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {overwrite ? t("teacherExerciseEditor.aiComposer.overwriteCurrent") : t("teacherExerciseEditor.aiComposer.createNew")}
            </p>
            <p className="text-xs text-slate-500">
              {overwrite
                ? t("teacherExerciseEditor.aiComposer.overwriteDesc")
                : t("teacherExerciseEditor.aiComposer.createNewDesc")}
            </p>
          </div>
          <Toggle checked={overwrite} onChange={setOverwrite} />
        </div>
      )}

      {preview && <PromptModal data={preview} onClose={() => setPreview(null)} />}

      {/* Back, prompt preview, then the generate action with its publish choice. */}
      <div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
          <Button variant="neutral" onClick={onBack}>
            <ArrowLeft className="size-4" /> {t("teacherExerciseEditor.header.back")}
          </Button>
          {/* A deck skips the question prompt, so there is nothing to preview. */}
          {!isDeck && (
            <Button variant="outline" onClick={viewPrompt}>
              <Braces className="size-4" /> {t("teacherExerciseEditor.composer.previewPrompt")}
            </Button>
          )}
          <div className="flex-1" />
          {reviewFirst && <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("teacherExerciseEditor.aiComposer.translateDraftHint")}</p>}
          {/* Two explicit actions instead of a split button: save as a draft, or publish right away. */}
          {(["draft", "publish"] as const).map((m) => {
            const busy = loading && publishMode === m;
            const label = busy
              ? t(isDeck ? "teacherExerciseEditor.deck.creating" : "teacherExerciseEditor.composer.generating")
              : isDeck
                ? t(m === "publish" ? "teacherExerciseEditor.deck.loadAndCreate" : "teacherExerciseEditor.deck.loadAndDraft")
                : t(m === "publish" ? "teacherExerciseEditor.composer.generatePublish" : "teacherExerciseEditor.composer.generateDraft");
            return (
              <Tooltip key={m} label={t(m === "publish" ? "teacherExerciseEditor.composer.modePublishHint" : "teacherExerciseEditor.composer.modeDraftHint")}>
                <Button
                  variant={m === "publish" ? "primary" : "neutral"}
                  disabled={loading || !level}
                  onClick={() => generate(m)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : m === "publish" ? <Sparkles className="size-4" /> : <FileText className="size-4" />} {label}
                </Button>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AudioLibraryDrawer({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["audio-library"],
    queryFn: audioApi.list,
    enabled: open,
  });
  const items = data?.items ?? [];

  // Xóa cần bấm 2 lần: lần 1 nút chuyển trạng thái "xác nhận", lần 2 mới xóa thật.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Đang sửa tiêu đề file nào (key) + nội dung đang gõ.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const delMut = useMutation({
    mutationFn: (key: string) => audioApi.remove(key),
    onSuccess: () => {
      toast.success(t("teacherExerciseEditor.audioLib.toastDeleted"));
      qc.invalidateQueries({ queryKey: ["audio-library"] });
      setConfirmKey(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("teacherExerciseEditor.audioLib.errorDelete")),
  });

  // Đặt/sửa tiêu đề — thứ khiến thư viện tìm lại được (tên file uuid thì vô nghĩa).
  const renameMut = useMutation({
    mutationFn: ({ key, title }: { key: string; title: string }) =>
      audioApi.rename(key, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audio-library"] });
      setEditKey(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("teacherExerciseEditor.audioLib.errorRename")),
  });

  // Đóng drawer thì bỏ mọi trạng thái đang treo.
  useEffect(() => {
    if (!open) {
      setConfirmKey(null);
      setEditKey(null);
      setSearch("");
    }
  }, [open]);

  // Tìm theo tiêu đề HOẶC tên file.
  const shown = items.filter((a) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      (a.title ?? "").toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    );
  });

  function fmtSize(bytes: number) {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-lg"
      icon={<Headphones className="size-5" />}
      iconTone="bg-violet-500/15 text-violet-600 dark:text-violet-400"
      title={t("teacherExerciseEditor.audioLib.title")}
      description={t("teacherExerciseEditor.audioLib.description")}
    >
      {/* Ô tìm — theo tiêu đề hoặc tên file. Chỉ hiện khi có gì để tìm. */}
      {items.length > 0 && (
        <div className="mb-3">
          <Input
            className="h-11 py-0"
            leftIcon={<Search className="size-4" />}
            placeholder={t("teacherExerciseEditor.audioLib.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
          />
        </div>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t("common.loading")}</p>
      ) : error ? (
        <p className="py-8 text-center text-rose-600">
          {error instanceof Error ? error.message : t("teacherExerciseEditor.audioLib.errorLoad")}
        </p>
      ) : items.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Headphones className="size-6" />
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {t("teacherExerciseEditor.audioLib.empty")}
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          {t("teacherExerciseEditor.audioLib.noMatch", { query: search.trim() })}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => {
            const active = a.url === current;
            const confirming = confirmKey === a.key;
            const editing = editKey === a.key;
            const deleting = delMut.isPending && delMut.variables === a.key;
            return (
              <div
                key={a.key}
                className={`rounded-2xl border p-3 transition ${active ? "border-cyan-400 bg-cyan-50/60 dark:border-cyan-600 dark:bg-cyan-500/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/40"}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}
                  >
                    <Headphones className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() =>
                          renameMut.mutate({ key: a.key, title: editTitle })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            renameMut.mutate({ key: a.key, title: editTitle });
                          if (e.key === "Escape") setEditKey(null);
                        }}
                        placeholder={t("teacherExerciseEditor.audioLib.titlePlaceholder")}
                        className="h-8 w-full rounded-lg border border-cyan-400 bg-white px-2 text-sm font-medium outline-none dark:bg-slate-900 dark:text-white"
                      />
                    ) : (
                      // Bấm vào tiêu đề là sửa tại chỗ — chưa đặt thì hiện gợi ý mờ.
                      <button
                        type="button"
                        onClick={() => {
                          setEditKey(a.key);
                          setEditTitle(a.title ?? "");
                        }}
                        title={t("teacherExerciseEditor.audioLib.editTitleHint")}
                        className="flex w-full items-center gap-1.5 text-left"
                      >
                        <span
                          className={cn(
                            "truncate text-sm font-semibold",
                            a.title
                              ? "text-slate-800 dark:text-slate-100"
                              : "text-slate-400 italic",
                          )}
                        >
                          {a.title || t("teacherExerciseEditor.audioLib.untitled")}
                        </span>
                        <Pencil className="size-3 shrink-0 text-slate-400" />
                      </button>
                    )}
                    {/* Tên file + dung lượng + ngày cùng một dòng phụ. */}
                    <p
                      className="mt-0.5 truncate text-xs text-slate-400"
                      title={a.name}
                    >
                      {a.name} · {fmtSize(a.size)} ·{" "}
                      {new Date(a.uploaded).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* Chọn audio này */}
                    <button
                      type="button"
                      onClick={() => onPick(a.url)}
                      title={active ? t("teacherExerciseEditor.audioLib.inUse") : t("teacherExerciseEditor.audioLib.selectAudio")}
                      aria-label={active ? t("teacherExerciseEditor.audioLib.inUse") : t("teacherExerciseEditor.audioLib.selectAudio")}
                      className={`flex size-8 items-center justify-center rounded-lg transition ${
                        active
                          ? "bg-cyan-500 text-white"
                          : "text-cyan-600 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
                      }`}
                    >
                      <Check className="size-4" />
                    </button>
                    {/* Xóa: bấm lần 1 → nút chuyển icon check nền đỏ, bấm lần 2 mới xóa */}
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() =>
                        confirming ? delMut.mutate(a.key) : setConfirmKey(a.key)
                      }
                      onBlur={() => confirming && setConfirmKey(null)}
                      title={confirming ? t("teacherExerciseEditor.audioLib.confirmDeleteHint") : t("teacherExerciseEditor.audioLib.deleteAudio")}
                      aria-label={confirming ? t("teacherExerciseEditor.audioLib.confirmDelete") : t("teacherExerciseEditor.audioLib.deleteAudio")}
                      className={`flex size-8 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                        confirming
                          ? "bg-rose-500 text-white hover:bg-rose-600"
                          : "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                      }`}
                    >
                      {deleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : confirming ? (
                        <Check className="size-4" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <AudioPlayer src={a.url} className="mt-2.5" />
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // Dạng text+icon phẳng: tab đang chọn TÔ MÀU (chữ+icon+nền nhạt), tab kia chỉ là chữ xám.
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
        active
          ? "bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}

function MiniBtn({
  onClick,
  title,
  danger,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={`flex size-8 items-center justify-center rounded-lg transition disabled:opacity-30 ${
        danger
          ? "text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function QuestionCard({
  q,
  index,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onDuplicate,
}: {
  q: QDraft;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (p: Partial<QDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q._k });
  const inputCls =
    "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white";
  const addLink =
    "mt-2 inline-flex items-center gap-1 text-sm font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400";
  const setOption = (i: number, v: string) =>
    onChange({ options: q.options.map((o, idx) => (idx === i ? v : o)) });
  const removeOption = (i: number) =>
    onChange({
      options: q.options.filter((_, idx) => idx !== i),
      answerIdx:
        q.answerIdx === i
          ? -1
          : q.answerIdx > i
            ? q.answerIdx - 1
            : q.answerIdx,
    });
  const setAccept = (i: number, v: string) =>
    onChange({ accept: q.accept.map((a, idx) => (idx === i ? v : a)) });
  const setPair = (i: number, f: keyof PairDraft, v: string) =>
    onChange({
      pairs: q.pairs.map((p, idx) => (idx === i ? { ...p, [f]: v } : p)),
    });
  const setItem = (i: number, f: keyof ItemDraft, v: string) =>
    onChange({
      items: q.items.map((it, idx) => (idx === i ? { ...it, [f]: v } : it)),
    });
  const setCat = (i: number, v: string) => {
    const old = q.categories[i];
    onChange({
      categories: q.categories.map((c, idx) => (idx === i ? v : c)),
      items: q.items.map((it) =>
        it.category === old ? { ...it, category: v } : it,
      ),
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        isDragging && "relative z-10 shadow-lg ring-2 ring-cyan-400/50",
      )}
    >
      {/* Header — bấm để mở/đóng */}
      <div
        className={`flex items-center gap-1 p-3 ${expanded ? "" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("teacherExerciseEditor.question.dragToReorder")}
          title={t("teacherExerciseEditor.question.dragToReorder")}
          className="-ml-1 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-slate-800"
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={`size-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {index + 1}
          </span>
          <span className="shrink-0 rounded-md bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            {QTYPE_LABEL_EN[q.type]}
          </span>
          {!expanded && (
            <>
              <span className="truncate text-sm text-slate-500 dark:text-slate-400">
                {q.question.trim() || t("teacherExerciseEditor.question.untitled")}
              </span>
              <GrammarTagBadge id={q.grammarId} />
            </>
          )}
        </button>
        <MiniBtn title={t("teacherExerciseEditor.question.duplicate")} onClick={onDuplicate}>
          <Copy className="size-4" />
        </MiniBtn>
        <MiniBtn title={t("teacherExerciseEditor.question.delete")} danger onClick={onRemove}>
          <Trash2 className="size-4" />
        </MiniBtn>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 p-4 dark:border-slate-700">
          <Textarea
            rows={2}
            value={q.question}
            onChange={(e) => onChange({ question: e.target.value })}
            placeholder={t("teacherExerciseEditor.question.promptPlaceholder")}
          />

          {q.type === "multiple_choice" && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                {t("teacherExerciseEditor.question.mcOptionsHint")}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`ans-${q._k}`}
                      checked={q.answerIdx === oi}
                      onChange={() => onChange({ answerIdx: oi })}
                      className="size-4 accent-emerald-500"
                      title={t("teacherExerciseEditor.question.correctAnswer")}
                    />
                    <input
                      className={`${inputCls} flex-1 ${q.answerIdx === oi ? "!border-emerald-400 dark:!border-emerald-600" : ""}`}
                      placeholder={t("teacherExerciseEditor.question.optionPlaceholder", { n: oi + 1 })}
                      value={opt}
                      onChange={(e) => setOption(oi, e.target.value)}
                    />
                    <MiniBtn
                      title={t("teacherExerciseEditor.question.deleteOption")}
                      danger
                      disabled={q.options.length <= 1}
                      onClick={() => removeOption(oi)}
                    >
                      <X className="size-4" />
                    </MiniBtn>
                  </div>
                ))}
              </div>
              <button
                className={addLink}
                onClick={() => onChange({ options: [...q.options, ""] })}
              >
                <Plus className="size-3.5" /> {t("teacherExerciseEditor.question.addOption")}
              </button>
            </div>
          )}

          {q.type === "fill_blank" && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                {t("teacherExerciseEditor.question.gapFillHint")}
              </p>
              <div className="space-y-2">
                {q.accept.map((a, ai) => (
                  <div key={ai} className="flex items-center gap-2">
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder={t("teacherExerciseEditor.question.answerPlaceholder", { n: ai + 1 })}
                      value={a}
                      onChange={(e) => setAccept(ai, e.target.value)}
                    />
                    <MiniBtn
                      title={t("teacherExerciseEditor.question.deleteAnswer")}
                      danger
                      disabled={q.accept.length <= 1}
                      onClick={() =>
                        onChange({
                          accept: q.accept.filter((_, idx) => idx !== ai),
                        })
                      }
                    >
                      <X className="size-4" />
                    </MiniBtn>
                  </div>
                ))}
              </div>
              <button
                className={addLink}
                onClick={() => onChange({ accept: [...q.accept, ""] })}
              >
                <Plus className="size-3.5" /> {t("teacherExerciseEditor.question.addAnswer")}
              </button>
            </div>
          )}

          {q.type === "translate" && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  {t("teacherExerciseEditor.question.translatePromptHint")}
                </label>
                <input
                  className={`${inputCls} w-full`}
                  placeholder="vd: My sister likes green apples."
                  value={q.translateAnswer}
                  onChange={(e) => onChange({ translateAnswer: e.target.value })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  {t("teacherExerciseEditor.question.translateAltHint")}
                </p>
                <div className="space-y-2">
                  {q.accept.map((a, ai) => (
                    <div key={ai} className="flex items-center gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder={t("teacherExerciseEditor.question.altPlaceholder", { n: ai + 1 })}
                        value={a}
                        onChange={(e) => setAccept(ai, e.target.value)}
                      />
                      <MiniBtn
                        title={t("teacherExerciseEditor.question.deleteAlt")}
                        danger
                        disabled={q.accept.length <= 1}
                        onClick={() =>
                          onChange({ accept: q.accept.filter((_, idx) => idx !== ai) })
                        }
                      >
                        <X className="size-4" />
                      </MiniBtn>
                    </div>
                  ))}
                </div>
                <button
                  className={addLink}
                  onClick={() => onChange({ accept: [...q.accept, ""] })}
                >
                  <Plus className="size-3.5" /> {t("teacherExerciseEditor.question.addAlt")}
                </button>
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  className="mt-0.5 size-3.5 accent-cyan-500"
                  checked={q.articleLenient}
                  onChange={(e) => onChange({ articleLenient: e.target.checked })}
                />
                <span>
                  {t("teacherExerciseEditor.question.articleLenientHint")}
                </span>
              </label>
            </div>
          )}

          {q.type === "matching" && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                {t("teacherExerciseEditor.question.matchingHint")}
              </p>
              <div className="space-y-2">
                {q.pairs.map((p, pi) => (
                  <div key={pi} className="flex items-center gap-2">
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder={t("teacherExerciseEditor.question.colA")}
                      value={p.left}
                      onChange={(e) => setPair(pi, "left", e.target.value)}
                    />
                    <span className="text-slate-400">↔</span>
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder={t("teacherExerciseEditor.question.colB")}
                      value={p.right}
                      onChange={(e) => setPair(pi, "right", e.target.value)}
                    />
                    <MiniBtn
                      title={t("teacherExerciseEditor.question.deletePair")}
                      danger
                      disabled={q.pairs.length <= 1}
                      onClick={() =>
                        onChange({
                          pairs: q.pairs.filter((_, idx) => idx !== pi),
                        })
                      }
                    >
                      <X className="size-4" />
                    </MiniBtn>
                  </div>
                ))}
              </div>
              <button
                className={addLink}
                onClick={() =>
                  onChange({ pairs: [...q.pairs, { left: "", right: "" }] })
                }
              >
                <Plus className="size-3.5" /> {t("teacherExerciseEditor.question.addPair")}
              </button>
            </div>
          )}

          {q.type === "ordering" && (
            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                {t("teacherExerciseEditor.question.orderingHint")}
              </label>
              <input
                className={`${inputCls} w-full`}
                placeholder="vd: I go to school by bus"
                value={q.orderAnswer}
                onChange={(e) => onChange({ orderAnswer: e.target.value })}
              />
              {q.orderAnswer.trim() && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.orderAnswer
                    .trim()
                    .split(/\s+/)
                    .map((t, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                      >
                        {t}
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {q.type === "categorize" && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  {t("teacherExerciseEditor.question.groups")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {q.categories.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-1">
                      <input
                        className={`${inputCls} w-32`}
                        placeholder={t("teacherExerciseEditor.question.groupPlaceholder", { n: ci + 1 })}
                        value={c}
                        onChange={(e) => setCat(ci, e.target.value)}
                      />
                      <MiniBtn
                        title={t("teacherExerciseEditor.question.deleteGroup")}
                        danger
                        disabled={q.categories.length <= 1}
                        onClick={() =>
                          onChange({
                            categories: q.categories.filter(
                              (_, idx) => idx !== ci,
                            ),
                          })
                        }
                      >
                        <X className="size-4" />
                      </MiniBtn>
                    </div>
                  ))}
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 text-sm text-cyan-600 dark:border-slate-600"
                    onClick={() =>
                      onChange({ categories: [...q.categories, ""] })
                    }
                  >
                    <Plus className="size-3.5" /> {t("teacherExerciseEditor.question.addGroup")}
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">
                  {t("teacherExerciseEditor.question.categorizeItemsHint")}
                </p>
                <div className="space-y-2">
                  {q.items.map((it, ii) => (
                    <div key={ii} className="flex items-center gap-2">
                      <input
                        className={`${inputCls} flex-1`}
                        placeholder="Item"
                        value={it.text}
                        onChange={(e) => setItem(ii, "text", e.target.value)}
                      />
                      <span className="text-slate-400">→</span>
                      <select
                        className={`${inputCls} w-36`}
                        value={it.category}
                        onChange={(e) =>
                          setItem(ii, "category", e.target.value)
                        }
                      >
                        <option value="">{t("teacherExerciseEditor.question.selectGroup")}</option>
                        {q.categories.filter(Boolean).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <MiniBtn
                        title={t("teacherExerciseEditor.question.deleteItem")}
                        danger
                        disabled={q.items.length <= 1}
                        onClick={() =>
                          onChange({
                            items: q.items.filter((_, idx) => idx !== ii),
                          })
                        }
                      >
                        <X className="size-4" />
                      </MiniBtn>
                    </div>
                  ))}
                </div>
                <button
                  className={addLink}
                  onClick={() =>
                    onChange({
                      items: [...q.items, { text: "", category: "" }],
                    })
                  }
                >
                  <Plus className="size-3.5" /> {t("teacherExerciseEditor.question.addItem")}
                </button>
              </div>
            </div>
          )}

          {/* Giải thích đáp án — hiện cho học sinh khi chữa bài (tùy chọn). AI thường điền sẵn. */}
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              {t("teacherExerciseEditor.question.explanationLabel")}
            </label>
            <Textarea
              rows={2}
              value={q.explanation}
              onChange={(e) => onChange({ explanation: e.target.value })}
              placeholder={t("teacherExerciseEditor.question.explanationPlaceholder")}
            />
          </div>

          {/* Gợi ý — học sinh mở TRƯỚC khi nộp (câu đó chỉ còn 50% điểm). Bài nghe: đoạn hội thoại
              ngắn chứa manh mối cho chính câu này. */}
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              {t("teacherExerciseEditor.question.hintLabel")}
            </label>
            <Textarea
              rows={2}
              value={q.hint}
              onChange={(e) => onChange({ hint: e.target.value })}
              placeholder={t("teacherExerciseEditor.question.hintPlaceholder")}
            />
          </div>

          {/* Ngữ pháp — AI tự gắn khi lưu, giáo viên xem lại/sửa ở đây. */}
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <GrammarPicker
              value={q.grammarId}
              onChange={(id) => onChange({ grammarId: id })}
            />
          </div>

          {/* Ảnh minh hoạ — dùng CHÍNH ImagePicker của bài nói: kéo-thả/upload, thư viện
              ảnh dự án, tìm ảnh online (Pexels/Pixabay). Thay ô dán URL thô trước đây. */}
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              {t("teacherExerciseEditor.question.imageLabel")}
            </label>
            <ImagePicker
              value={q.image}
              onChange={(url) => onChange({ image: url })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Read-only skill box beside the type picker: the skill follows the chosen type. */
function SkillReadout({ skill, label, hint, compact }: { skill: string; label: string; hint: string; compact?: boolean }) {
  const ui = skillUi(skill);
  // compact = same height and label style as a <Select> in the manual editor's field grid.
  if (compact) {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <div className="flex h-11 items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 dark:border-slate-700 dark:bg-slate-800/40" title={hint}>
          {ui && <ui.Icon className={cn("size-4 shrink-0", ui.text)} />}
          <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{ui?.label ?? "—"}</span>
          <span className="ml-auto truncate text-xs text-slate-400">{hint}</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="flex h-14 items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800/40">
        {ui && (
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", ui.box)}>
            <ui.Icon className="size-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{ui?.label ?? "—"}</span>
          <span className="block truncate text-xs text-slate-500">{hint}</span>
        </span>
      </div>
    </div>
  );
}
