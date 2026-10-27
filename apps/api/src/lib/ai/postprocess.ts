// Hậu xử lý output AI trước khi trả cho client: auto-fix nhẹ + loại câu hỏi lỗi
// + chuẩn hóa các trường cấp bài (skill/tags/wordlist) để lưu qua schema chặt không lỗi.
import { isNotGivenOption, isTfngOptions, isTrueFalseOptions, normalize, SKILLS, stripPunct, stripWordTag, wordTag, type ExerciseInput, type Skill } from "@msyen/shared";

type Q = ExerciseInput["questions"][number];

// Chuẩn hóa 1 mục wordlist: `word` LUÔN sạch (không chứa nhãn từ loại); từ loại nằm ở `pos`.
// Phòng khi AI/data cũ lỡ nhét "(n)" vào word → tự tách sang pos.
function cleanWordlistItem(w: Record<string, unknown>) {
  const rawWord = String(w.word).trim();
  const pos = (w.pos ? String(w.pos).trim() : "") || wordTag(rawWord);
  return {
    word: stripWordTag(rawWord) || rawWord,
    ipa: w.ipa ? String(w.ipa).trim() : undefined,
    meaning: w.meaning ? String(w.meaning).trim() : undefined,
    example: w.example ? String(w.example).trim() : undefined,
    pos: pos || undefined,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Gộp các ô trống THỪA trong câu điền từ về ĐÚNG 1 ô (bài chỉ có 1 `accept`).
 * AI hay tạo "My ___ (parents) ___ (buy)…" — ô danh từ/chủ ngữ là thừa. Giữ ô CUỐI
 * (khớp accept), các ô trước điền sẵn bằng gợi ý trong ngoặc (không có gợi ý thì bỏ ô).
 */
function collapseExtraBlanks(question: string): string {
  const total = (question.match(/___/g) ?? []).length;
  if (total <= 1) return question;
  let seen = 0;
  const out = question.replace(/___(\s*\(([^)]*)\))?/g, (m, _all, hint?: string) => {
    seen++;
    if (seen === total) return m; // ô cuối = phần thật sự kiểm tra → giữ nguyên
    return hint ? hint.trim() : ""; // ô thừa → điền sẵn gợi ý (hoặc bỏ)
  });
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}

/** Giữ `grammar_id` nếu là id CÓ THẬT; ngược lại bỏ trống. */
function cleanGrammarId(q: Q, known?: Set<string>): Q {
  const gid = q.grammar_id?.trim();
  return { ...q, grammar_id: gid && known?.has(gid) ? gid : null };
}

function validQuestion(q: Q): Q | null {
  if (!q || !q.type || !q.question?.trim()) return null;
  switch (q.type) {
    case "multiple_choice": {
      // Khử khoảng trắng + loại lựa chọn trùng nhau.
      let options = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      options = options.filter((o, i) => options.findIndex((x) => norm(x) === norm(o)) === i);
      if (options.length < 2 || !q.answer) return null;
      const answer = q.answer.trim();
      if (!options.some((o) => norm(o) === norm(answer))) return null;
      // Giới hạn TỐI ĐA 4 lựa chọn: luôn giữ đáp án đúng, cắt bớt nhiễu thừa
      // (giữ nguyên thứ tự gốc để vị trí đáp án không bị lộ).
      if (options.length > 4) {
        const distractors = new Set(options.filter((o) => norm(o) !== norm(answer)).slice(0, 3));
        options = options.filter((o) => norm(o) === norm(answer) || distractors.has(o));
      }
      // Standard: exactly 4 options, or a True/False pair, or a True/False/Not Given triple.
      // Any other 2- or 3-option question (33% guess) is dropped before it reaches the exercise.
      if (options.length !== 4 && !isTrueFalseOptions(options) && !isTfngOptions(options)) return null;
      // Spell the third TFNG option one way in the bank, whichever synonym the model chose.
      if (isTfngOptions(options)) {
        const canon = (o: string) => (isNotGivenOption(o) ? "Not Given" : o);
        return { ...q, options: options.map(canon), answer: canon(answer) };
      }
      return { ...q, options, answer };
    }
    case "fill_blank": {
      const accept = (q.accept ?? []).map((a) => a.trim()).filter(Boolean);
      if (!accept.length) return null;
      // Sửa lỗi hay gặp: AI chèn THÊM ô trống cho danh từ/chủ ngữ (thường lấy từ wordlist)
      // → "My ___ (parents) ___ (buy)…" có 2 ô nhưng chỉ 1 accept ⇒ chấm sai.
      // Chỉ giữ ô CUỐI (phần thật sự kiểm tra, khớp accept); các ô trước điền sẵn bằng gợi ý.
      const question = collapseExtraBlanks(q.question);
      // LOẠI câu VÔ NGHĨA: đáp án bị lộ NGAY trong ngoặc gợi ý — AI blank danh từ/chủ ngữ
      // rồi để chính đáp án vào "(...)" (vd "My ___ (parents) have lived…" accept=["parents"]),
      // còn động từ thì viết sẵn ⇒ chỉ chép từ trong ngoặc là xong, không kiểm tra gì.
      // Gợi ý PHẢI là động từ gốc để chia, KHÁC đáp án. Trùng ⇒ bỏ câu (model yếu hay dính).
      const hints = (question.match(/\(([^)]*)\)/g) ?? []).map((b) => norm(b.slice(1, -1)));
      if (accept.some((a) => hints.includes(norm(a)))) return null;
      return { ...q, question, accept };
    }
    case "matching": {
      // Tối đa 6 cặp cho dễ nhìn/kéo-thả; loại cặp thiếu vế.
      const pairs = (q.pairs ?? []).filter((p) => p.left?.trim() && p.right?.trim()).slice(0, 6);
      return pairs.length >= 2 ? { ...q, pairs } : null;
    }
    case "ordering": {
      let answer = (q.answer ?? "").trim();
      if (!answer) return null;
      let tokens = (q.tokens ?? []).map((t) => t.trim()).filter(Boolean);
      if (!tokens.length) tokens = answer.split(/\s+/); // auto-fix

      // BẤT BIẾN: tokens nối lại PHẢI bằng answer. Học sinh chỉ ghép được từ tokens, nên hễ
      // lệch là câu KHÔNG THỂ đúng — chấm 0 vĩnh viễn (grading dùng normalize, KHÔNG bỏ dấu câu).
      // Model hay lỡ thêm dấu chấm cuối answer mà không đưa vào tokens (đo được ở DeepSeek v4-pro:
      // 7/7 câu ordering dính). Trước đây không gì cưỡng chế → bài hỏng lọt thẳng tới học sinh.
      const joined = tokens.join(" ");
      if (joined !== answer) {
        // Chỉ lệch dấu câu/khoảng trắng → tokens là nguồn sự thật (học sinh chỉ ghép được thế).
        if (stripPunct(normalize(joined)) === stripPunct(normalize(answer))) answer = joined;
        else return null; // lệch thực chất (thiếu/thừa từ) → bỏ câu, đừng ship bài hỏng
      }
      return { ...q, answer, tokens };
    }
    case "categorize": {
      const categories = (q.categories ?? []).map((c) => c.trim()).filter(Boolean);
      const items = (q.items ?? []).filter((it) => it.text?.trim() && categories.includes(it.category));
      return categories.length >= 2 && items.length >= 2 ? { ...q, categories, items } : null;
    }
    case "translate": {
      // `question` is the Vietnamese prompt, `answer` the English. Without the English there is
      // nothing to grade against, and the item can never be answered correctly.
      const answer = (q.answer ?? "").trim();
      if (!answer || !q.question?.trim()) return null;
      // Two Vietnamese slips models keep making despite the prompt: "không đang" is not Vietnamese
      // (the negative drops "đang"), and a trailing "phải không?" reads as an English tag question.
      const question = q.question
        .trim()
        .replace(/không đang /giu, "không ")
        .replace(/,?\s*phải không\s*\?$/iu, " không?");
      // Drop `accept` entries that only repeat `answer` — they add nothing and the audit flags them.
      const accept = (q.accept ?? [])
        .map((a) => a.trim())
        .filter((a) => a && normalize(a) !== normalize(answer));
      const wordBank = (q.word_bank ?? []).map((w) => w.trim()).filter(Boolean);
      return {
        ...q,
        question,
        answer,
        accept,
        word_bank: wordBank.length ? wordBank : null,
        article_lenient: q.article_lenient ?? true,
      };
    }
    default:
      return null;
  }
}

/** Chuẩn hóa output AI bài ĐỌC TO → ExerciseInput (read_aloud=true, không câu hỏi). */
export function sanitizeReading(raw: Record<string, unknown>): { exercise: ExerciseInput } {
  const skill = (SKILLS as readonly string[]).includes(String(raw.skill ?? "")) ? (raw.skill as Skill) : ("reading" as Skill);

  return {
    exercise: {
      title: String(raw.title ?? "").trim() || "Bài đọc",
      published: raw.published === undefined ? true : Boolean(raw.published),
      skill,

      level: raw.level ? String(raw.level) : null,
      tags: null,
      passage: String(raw.passage ?? "").trim() || null,
      audio_url: null,
      audio_script: null,
      read_aloud: true,
      wordlist: null, // forbidden by the read_aloud blueprint: the passage itself shows IPA per word
      questions: [],
    },
  };
}

// Normalises the AI output of a WRITING exercise → ExerciseInput (prompt + outline, no questions).
export function sanitizeWriting(raw: Record<string, unknown>): { exercise: ExerciseInput } {
  const wl = Array.isArray(raw.wordlist) ? raw.wordlist : [];
  const wordlist = wl
    .filter((w): w is Record<string, unknown> => !!w && typeof (w as Record<string, unknown>).word === "string")
    .map(cleanWordlistItem)
    .filter((w) => w.word);

  const fw = (raw.framework ?? {}) as Record<string, unknown>;
  const toStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  const outline = toStrArr(fw.outline);
  const phrases = toStrArr(fw.phrases);

  return {
    exercise: {
      title: String(raw.title ?? "").trim() || "Bài viết",
      published: raw.published === undefined ? true : Boolean(raw.published),
      skill: "writing" as Skill,

      level: raw.level ? String(raw.level) : null,
      tags: null,
      passage: null,
      audio_url: null,
      audio_script: null,
      read_aloud: false,
      speaking_prompt: String(raw.speaking_prompt ?? raw.prompt ?? "").trim() || null,
      speaking_framework: outline.length || phrases.length ? { outline, phrases } : null,
      speaking_sample: String(raw.sample_answer ?? raw.speaking_sample ?? "").trim() || null,
      speaking_image: null,
      wordlist: wordlist.length ? wordlist : null,
      questions: [],
    },
  };
}

/** Làm sạch bài tập AI trả về; đếm số câu bị loại. Bỏ exercise_id; chuẩn hóa để lưu được. */
/**
 * `known`: tập id ngữ pháp CÓ THẬT. Truyền vào khi prompt có kèm catalog → id model bịa
 * ra bị vứt ngay tại đây (thà để trống rồi tag_grammar gắn lại còn hơn nhãn sai).
 */
export function sanitizeExercise(
  ex: ExerciseInput,
  known?: Set<string>,
): { exercise: ExerciseInput; dropped: number } {
  const kept: Q[] = [];
  let dropped = 0;
  for (const q of ex.questions ?? []) {
    const v = validQuestion(q);
    if (v) kept.push(cleanGrammarId(v, known));
    else dropped++;
  }

  const skill = (SKILLS as readonly string[]).includes(ex.skill ?? "") ? (ex.skill as Skill) : null;
  // KHÔNG lấy `tags` do AI sinh: skill/chủ đề/cấp độ đã do giáo viên chọn ở form → hashtag AI chỉ gây nhiễu.
  const wordlist = Array.isArray(ex.wordlist)
    ? ex.wordlist
        .filter((w) => w && typeof w.word === "string" && w.word.trim())
        .map((w) => cleanWordlistItem(w as unknown as Record<string, unknown>))
    : null;

  return {
    exercise: {
      title: String(ex.title ?? "").trim() || "Untitled",
      published: ex.published ?? true,
      skill,

      level: ex.level ?? null,
      tags: null,
      passage: ex.passage ?? null,
      audio_url: ex.audio_url ?? null,
      audio_script: ex.audio_script ?? null,
      read_aloud: false,
      wordlist: wordlist?.length ? wordlist : null,
      questions: kept,
    },
    dropped,
  };
}
