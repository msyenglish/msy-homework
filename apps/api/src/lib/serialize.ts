// Chuyển hàng dữ liệu Drizzle (camelCase) → hình dạng API dùng chung (@msyen/shared).
import type {
  Cefr,
  Exercise,
  Grammar,
  GrammarListItem,
  Level,
  PublicQuestion,
  PublicUser,
  Question,
  QuestionType,
  Student,
  Tag,
  Topic,
  VocabItem,
} from "@msyen/shared";
import { translateMask } from "./grammarTranslate";
import type { ExerciseRow, GrammarRow, LevelRow, QuestionRow, StudentRow, TagRow, TopicRow, UserRow, VocabItemRow } from "../db/schema";

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Public payload — answers hidden/shuffled per question type.
 * Async because `translate` ships SHA-256 hashes of its answer (WebCrypto is promise-based); every
 * other type resolves without awaiting anything.
 */
export async function publicQuestion(q: QuestionRow): Promise<PublicQuestion> {
  const base: PublicQuestion = {
    position: q.position,
    type: q.type,
    question: q.question,
    image: q.image ?? null,
    word_bank: q.wordBank ?? null,
    hint: q.hint ?? null,
  };
  switch (q.type) {
    case "multiple_choice":
      // Xáo lựa chọn: AI hay để đáp án đúng ở đầu (A/B) → không xáo là học sinh
      // đoán "A" trúng ~48%. Xáo như ordering/matching/categorize (chấm theo GIÁ TRỊ, không theo vị trí).
      base.options = q.options ? shuffled(q.options) : null;
      break;
    case "ordering":
      base.tokens = shuffled(q.tokens ?? []);
      break;
    case "matching": {
      const pairs = q.pairs ?? [];
      base.lefts = pairs.map((p) => ({ text: p.left, image: p.left_image ?? null }));
      base.rights = shuffled(pairs.map((p) => ({ text: p.right, image: p.right_image ?? null })));
      break;
    }
    case "categorize":
      base.categories = q.categories ?? null;
      base.items = shuffled((q.items ?? []).map((it) => ({ text: it.text, image: it.image ?? null })));
      break;
    case "translate": {
      // `question` is the Vietnamese prompt and travels as-is; the English (`answer`/`accept`) never
      // leaves the server — only its shape and hashes, exactly as the standalone drill ships them.
      const lenient = q.articleLenient !== false;
      const mask = await translateMask(q.answer ?? "", q.accept ?? null, lenient);
      // Shuffled: the bank is stored in answer order, so printing it as stored spells out the answer.
      base.word_bank = q.wordBank?.length ? shuffled(q.wordBank) : null;
      base.skeleton = mask.skeleton;
      base.hashes = mask.hashes;
      base.word_hashes = mask.word_hashes;
      base.word_hashes_loose = mask.word_hashes_loose;
      base.article_lenient = lenient;
      break;
    }
  }
  return base;
}

/**
 * Same masking as `publicQuestion`, but for a grammar bank item whose payload is already a
 * `Question` (snake_case shared shape) rather than a Drizzle row. Answers never leave the server
 * before grading
 */
/** vocab_items row → VocabItem. */
export function vocabItemOut(v: VocabItemRow): VocabItem {
  return {
    id: v.id,
    word: v.word,
    pos: v.pos ?? null,
    ipa: v.ipa ?? null,
    meaning: v.meaning ?? null,
    example: v.example ?? null,
    image: v.image ?? null,
    ...(v.synonyms?.length ? { synonyms: v.synonyms } : {}),
    definition: v.definition ?? null,
    example_vi: v.exampleVi ?? null,
    cefr: v.cefr ?? null,
    ...(v.collocations?.length ? { collocations: v.collocations } : {}),
    ...(v.family?.length ? { family: v.family } : {}),
    ...(v.antonyms?.length ? { antonyms: v.antonyms } : {}),
    note: v.note ?? null,
  };
}

export function publicGrammarQuestion(q: Question): PublicQuestion {
  const base: PublicQuestion = {
    position: q.position ?? 0,
    type: q.type,
    question: q.question,
    image: q.image ?? null,
    word_bank: q.word_bank ?? null,
    hint: null, // listening hints are a quiz-only feature
  };
  switch (q.type) {
    case "multiple_choice":
      base.options = q.options ? shuffled(q.options) : null;
      break;
    case "ordering":
      base.tokens = shuffled(q.tokens ?? []);
      break;
    case "matching": {
      const pairs = q.pairs ?? [];
      base.lefts = pairs.map((p) => ({ text: p.left, image: p.left_image ?? null }));
      base.rights = shuffled(pairs.map((p) => ({ text: p.right, image: p.right_image ?? null })));
      break;
    }
    case "categorize":
      base.categories = q.categories ?? null;
      base.items = shuffled((q.items ?? []).map((it) => ({ text: it.text, image: it.image ?? null })));
      break;
  }
  return base;
}

export function fullQuestion(q: QuestionRow): Question {
  return {
    position: q.position,
    type: q.type,
    question: q.question,
    image: q.image ?? null,
    word_bank: q.wordBank ?? null,
    hint: q.hint ?? null,
    explanation: q.explanation ?? null,
    options: q.options ?? null,
    answer: q.answer ?? null,
    accept: q.accept ?? null,
    pairs: q.pairs ?? null,
    tokens: q.tokens ?? null,
    categories: q.categories ?? null,
    items: q.items ?? null,
    grammar_id: q.grammarId ?? null,
  };
}

export function exerciseOut(e: ExerciseRow, topic?: Topic | null): Exercise {
  return {
    id: e.id,
    exercise_id: e.exerciseId,
    title: e.title,
    published: e.published,
    skill: e.skill ?? null,
    level: e.level ?? null,
    tags: e.tags ?? null,
    topic_id: e.topicId ?? null,
    tag_id: e.tagId ?? null,
    layer: e.layer ?? null,
    topic: topic ?? null,
    passage: e.passage ?? null,
    passage_ipa: e.passageIpa ?? null,
    audio_url: e.audioUrl ?? null,
    audio_script: e.audioScript ?? null,
    audio_voice: e.audioVoice ?? null,
    audio_cues: e.audioCues ?? null,
    dictation_mode: e.dictationMode ?? null,
    read_aloud: e.readAloud ?? false,
    speaking_prompt: e.speakingPrompt ?? null,
    speaking_framework: e.speakingFramework ?? null,
    speaking_sample: e.speakingSample ?? null,
    speaking_image: e.speakingImage ?? null,
    image: e.image ?? null,
    template_id: e.templateId ?? null,
    gen_config: e.genConfig ?? null,
    wordlist: e.wordlist ?? null,
    // Bộ thẻ từ vựng (vocab v2). PHẢI trả ra: trình soạn nạp bài rồi lưu lại — thiếu field này
    // thì deck bị ghi đè thành null, mất sạch danh sách từ của bài.
    vocab_deck: e.vocabDeck ?? null,
    // Bài học qua video (YouTube) — trả ra để trình soạn nạp lại đúng nội dung.
    video: e.video ?? false,
    youtube_id: e.youtubeId ?? null,
    video_lang: e.videoLang ?? null,
    video_segments: e.videoSegments ?? null,
    video_modes: e.videoModes ?? null,
    created_at: e.createdAt,
  };
}

export function levelOut(l: LevelRow): Level {
  return { id: l.id, name: l.name, color: l.color, icon: l.icon ?? null, position: l.position };
}

export function topicOut(t: TopicRow): Topic {
  return { id: t.id, name: t.name, color: t.color, icon: t.icon ?? null, parent_id: t.parentId ?? null, position: t.position };
}

/** Nhãn → payload API. `scope` quyết định phạm vi hiển thị */
export function tagOut(t: TagRow): Tag {
  return { id: t.id, name: t.name, color: t.color, icon: t.icon ?? null, scope: t.scope, position: t.position };
}

/** Điểm ngữ pháp → payload API (JSON columns đã typed nên gần như pass-through). */
export function grammarOut(g: GrammarRow): Grammar {
  return {
    id: g.id,
    title: g.title,
    category: g.category,
    cefr: g.cefr,
    summary: g.summary,
    forms: g.forms,
    signals: g.signals ?? null,
    usage: g.usage,
    spelling: g.spelling ?? null,
    examples: g.examples,
    mistakes: g.mistakes ?? null,
    tips: g.tips ?? null,
    compare: g.compare ?? null,
    related: g.related ?? null,
    keywords: g.keywords ?? null,
    bank: g.bank ?? null,
    drill_types: g.drillTypes ?? null,
    position: g.position,
    created_at: g.createdAt,
  };
}

/** Điểm ngữ pháp bản GỌN → payload danh sách (`GET /grammar`). Chỉ nhận đúng các cột đã select. */
export function grammarListOut(g: {
  id: string;
  title: string;
  category: string;
  cefr: Cefr;
  summary: string;
  signals: string[] | null;
  keywords: string[] | null;
  drillTypes: QuestionType[] | null;
  position: number;
}): GrammarListItem {
  return {
    id: g.id,
    title: g.title,
    category: g.category,
    cefr: g.cefr,
    summary: g.summary,
    signals: g.signals ?? null,
    keywords: g.keywords ?? null,
    drill_types: g.drillTypes ?? null,
    position: g.position,
  };
}

/** User công khai → payload API (LƯỢC password_hash & google_sub). */
export function userOut(u: UserRow, level?: Level | null, inClass?: boolean): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    avatar_url: u.avatarUrl ?? null,
    provider: u.provider as PublicUser["provider"],
    has_password: !!u.passwordHash,
    level_id: u.levelId ?? null,
    level: level ?? null,
    topics: u.topics ?? null,
    academic_enabled: u.academicEnabled ?? false,
    birth_year: u.birthYear ?? null,
    gender: (u.gender as PublicUser["gender"]) ?? null,
    voice_gender: (u.voiceGender as PublicUser["voice_gender"]) ?? null,
    voice_gender_sentence: (u.voiceGenderSentence as PublicUser["voice_gender_sentence"]) ?? null,
    library_view: (u.libraryView as PublicUser["library_view"]) ?? null,
    theme: (u.theme as PublicUser["theme"]) ?? null,
    in_class: inClass ?? false,
    created_at: u.createdAt,
  };
}

export function studentOut(s: StudentRow, level?: Level | null): Student {
  return {
    id: s.id,
    name: s.name,
    passcode: s.passcode ?? null,
    contact: s.contact ?? null,
    note: s.note ?? null,
    birth_year: s.birthYear ?? null,
    gender: (s.gender as Student["gender"]) ?? null,
    level_id: s.levelId ?? null,
    level: level ?? null,
    active: s.active,
    created_at: s.createdAt,
  };
}
