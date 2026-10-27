// ============================================================
//  Central PROMPT module for AI worksheet generation (prompt-first).
//  The teacher writes a free request (input.prompt); all domain
//  knowledge (Cambridge YLE syllabus, skills, question types,
//  output contract) lives in the STATIC system prompt below —
//  one place, easy to maintain. All prompts are in ENGLISH.
// ============================================================
import type { AiGenerateExerciseInput, GrammarCatalogItem, QuestionType } from "@msyen/shared";
import { DIALOGUE_EMOTIONS, getBlueprint } from "@msyen/shared";

const PERSONA =
  "You are an expert English worksheet author for Vietnamese learners — from young children to adults. " +
  "Fit the topic, tone and examples to the level and age given in the request (no age given → judge from the level). " +
  "Prefer topics and contexts familiar to Vietnamese learners. " +
  "Answers MUST be exactly correct; never invent facts. " +
  "Return ONLY valid JSON matching the required schema — no text, no comments, nothing outside the JSON.";

// Cambridge YLE syllabus — apply ONLY when the request mentions the level.
const SYLLABUS_REF = [
  "SYLLABUS REFERENCE (use only if the request mentions Starters / Movers / Flyers):",
  "- Starters (age 8-9, pre-A1): core vocabulary (colors, numbers 1-20, family, objects, animals, body, basic food). Grammar: to be, have got, can, present simple, prepositions of place, singular/plural. Short familiar sentences. Reading passage 40-70 words.",
  "- Movers (age 10-12, A1): weather, jobs, daily activities, places, hobbies, clothes. Grammar: present continuous, past simple (was/were + regular verbs), comparatives, must/mustn't, adverbs of frequency. Reading passage 60-90 words.",
  "- Flyers (age 12-15, A2): travel, health, environment, feelings, technology. Grammar: past simple (irregular verbs), future (will / going to), superlatives, first conditional, simple passive, basic present perfect. Reading passage 80-120 words.",
].join("\n");

// Quy tắc wordlist (word sạch + IPA General American) nay thuộc về các task từ vựng ở
// lib/ai/tasks.ts (`generate_wordlist`, `fill_vocab`) — không template quiz nào còn sinh wordlist.

/** JSON spec for each question type. */
export const QTYPE_SPEC: Record<QuestionType, string> = {
  multiple_choice:
    '{"type":"multiple_choice","question":string,"options":string[4] (EXACTLY 4 distinct options; ONLY a True/False question may use 2: ["True","False"], and an academic-reading True/False/Not Given question 3: ["True","False","Not Given"]),"answer":<exactly one item from options>; LISTENING-ONLY optional "hint":<the SHORT line(s) from the audio dialogue that give the clue for THIS question — one exchange, not the whole script>}',
  fill_blank:
    '{"type":"fill_blank","question":<use "___" for the blank>,"accept":string[] (all correct spellings); optional "word_bank":string[] for young learners; LISTENING-ONLY optional "hint":<the SHORT line(s) from the audio dialogue that give the clue for THIS question>}',
  matching:
    '{"type":"matching","question":string,"pairs":[{"left":string,"right":string}] (3-6 pairs; left and right are the two sides to match — e.g. word → meaning, or speaker → what they do)}',
  ordering:
    '{"type":"ordering","question":string,"answer":<the full correct sentence>,"tokens":<array of the words/chunks that join into answer>}',
  categorize:
    '{"type":"categorize","question":string,"categories":string[2..4],"items":[{"text":string,"category":<one value from categories>}] (>=4 items, balanced)}',
  translate:
    '{"type":"translate","question":<the VIETNAMESE sentence to render into English>,"answer":<the canonical English sentence>,"accept":string[] (other equally valid English renderings),"word_bank":string[] (the BASE forms of the content words, in any order),"article_lenient":boolean (false ONLY when a/an/the is what the sentence tests)}',
};

// Luật chất lượng theo TỪNG dạng câu — chỉ nhét luật của dạng ĐƯỢC PHÉP vào prompt
// (tránh dặn model về matching/ordering trong bài chỉ cho phép MC + fill → đỡ lạc dạng).
export const TYPE_RULE: Record<QuestionType, string> = {
  // Cũng KHÔNG nêu ví dụ câu AMBIGUOUS ở dạng chép được: bản cũ có
  // `He ___ in a village when he was young` → DeepSeek sinh gần y hệt
  // (`My grandfather ___ in this village as a child`) và dính đúng lỗi mơ hồ đó.
  // Câu ví dụ DUY NHẤT được nêu phải là câu ĐÚNG.
  multiple_choice:
    "- multiple_choice: EXACTLY 4 options (never 3 or 5+) — the only exceptions are a True/False question (exactly 2: \"True\"/\"False\") and a True/False/Not Given question (exactly 3: \"True\"/\"False\"/\"Not Given\", academic reading only). `answer` equals exactly one option. Distractors are the common wrong forms learners pick (other tenses/persons), each clearly wrong HERE. The full sentence must be natural, idiomatic English — no awkward phrasing (e.g. not `grew alone`; use `grew up as an only child`).\n" +
    "  ONE-CORRECT-ANSWER (critical). Put a signal in the stem that CLOSES the time frame so only one form fits — e.g. `He ___ in a village until 1990.` (only `lived`). A vague past frame with no closing signal leaves a past-simple AND a past-continuous reading both valid; always add the closing signal.\n" +
    "  MANDATORY SELF-TEST for every item: substitute EACH distractor into the WHOLE sentence and read it aloud. If ANY of them is correct, natural English — including a plain present-tense form describing a state that is still true — the item is INVALID: tighten the stem or swap that distractor. Do not emit an item until every distractor fails this test.",
  // KHÔNG đưa ví dụ "WRONG: ..." vào đây. Đo thật 07/2026: bản cũ có dòng
  // `WRONG: My ___ (parents) ___ (buy) a car.` → Gemini chép NGUYÊN mẫu đó ra 10/10 câu.
  // Ví dụ phủ định biến thành khuôn mẫu. Chỉ nêu dạng ĐÚNG + bước tự kiểm đếm được.
  fill_blank:
    "- fill_blank: EXACTLY ONE `___` per question — the single element being tested (usually the verb form). Correct shape: `My parents ___ (buy) a car.` accept:[\"bought\"]. Every other word — subject, noun, family word — is written out IN FULL inside the sentence, even if it is a target-vocabulary word: target vocabulary appears spelled out, never as a blank. `accept` lists every correct spelling of that one answer. A hint in parentheses is the BASE / infinitive form to conjugate (e.g. `(be)`, `(go)`) placed right after the blank — never list answer choices like `(was/were)`, and never hint a noun. `word_bank` is OPTIONAL and may contain ONLY candidate forms of the tested element (e.g. [\"was\",\"were\"]); if the request asks for a word bank of vocabulary/nouns/family words, IGNORE that part of the request — it contradicts the one-blank rule, so put those words into the sentences instead. SELF-CHECK before emitting each item: count the `___` in `question`; if it is not exactly 1, rewrite the item.",
  matching:
    "- matching: 3-6 pairs on the same topic; never repeat a `right`. Put ALL pairs in ONE matching question — NEVER a series of MC/fill, one per pair. NON-OVERLAP: a fact already covered by a matching pair must NOT be re-tested by a separate MC/fill question — every other question must probe DIFFERENT information (a matching that maps person→activity already answers 'who does what', so do not also add MC/fill asking the same).",
  ordering:
    "- ordering: `question` is a SHORT clean instruction only (e.g. \"Put the words in order to make a past simple sentence.\") — do NOT list/scramble the words inside `question`; the app shuffles `tokens` for the student. `tokens` joined with single spaces MUST equal `answer`; tokens not too fine-grained; one ordering question per sentence.",
  categorize:
    "- categorize: every `item.category` is one of `categories`; >=4 items, balanced. Put the whole sort task in ONE categorize question — never many.",
  // Rules distilled from the offline audit of the translation bank,
  // which measured these as the failure modes that actually recur.
  translate:
    "- translate: `question` is the VIETNAMESE sentence; `answer` is the canonical English sentence. Grading is string matching that already ignores case, punctuation, apostrophe style, contractions (`didn't` = `did not`, `I'll` = `I will`) and (by default) a/an/the — so the Vietnamese must pin ONE English sentence, and `accept` must hold every OTHER correct one:\n" +
    "  TENSE MUST BE MARKED. Vietnamese does not inflect for tense, so a past or future target needs an explicit marker (`đã`, `rồi`, `sẽ`, `hôm qua`, `tuần trước`, `ngày mai`). Without one the learner cannot know which form is wanted and a correct answer grades as wrong.\n" +
    "  PIN THE PRONOUN AND NUMBER. Use Vietnamese that maps to one English pronoun: tôi→I, chúng tôi→we, bạn→you, anh ấy/cậu ấy→he, cô ấy→she, họ→they, nó→it (things/animals only). Never `bạn ấy` (he or she?) or `chị/anh/em` alone. Mark plurals (`những`, `các`, `hai`, `nhiều`) whenever the English noun is plural.\n" +
    "  QUESTIONS: write a yes/no question as `... có ... không?` (or `đã ... chưa?` ONLY for present perfect); never `..., phải không?`, which is an English tag question.\n" +
    "  NATURAL ON BOTH SIDES: `answer` is a sentence a native speaker would actually say, with everyday collocations (`have breakfast`, `do homework`, `go to bed`); do not pair a negative with `ago`. The Vietnamese reads naturally too: `không đang` is NOT Vietnamese — ✗ `Tôi không đang xem TV.` ✓ `Bây giờ tôi không xem TV.` (`đang` only in affirmative and question items).\n" +
    "  SAME MEANING: every element of the Vietnamese (who, what, where, when) appears in `answer` and nothing is added — a place phrase in the Vietnamese is not replaced by a time phrase in the English.\n" +
    "  NO GIVEAWAY: the Vietnamese contains no English word from the answer, except names and numbers.\n" +
    "  `accept` lists the OTHER renderings that are equally correct and that the grader would otherwise reject: the time adverbial moved to the front; common synonyms the Vietnamese does not decide between (`bike`/`bicycle`, `film`/`movie`, `mum`/`mom`/`mother`, `grandma`/`grandmother`, `have`/`eat` + a meal), including time phrases (`bây giờ` → `now` / `right now` / `at the moment`); British/American spelling. Do NOT list case, punctuation, contraction or article-only variants. Never repeat `answer`. Everything in `accept` is English.\n" +
    "  `word_bank` holds the BASE forms of the content words (`go`, `not`, `school`) — never the inflected ones (`went`, `didn't`), because supplying the inflection removes exactly what the item practises. Keep a time phrase as one entry (`last week`). Every bank word must appear, in some form, in `answer`.\n" +
    "  `article_lenient` is true by default; set it false ONLY when the point being taught IS a/an/the.\n" +
    "  `explanation`: ONE short sentence naming the rule the learner had to apply (e.g. why `went`, why `did` + base verb), in the language the request asks for.\n" +
    "  SELF-TEST per item: read the Vietnamese alone and write the English. If a second English sentence is just as faithful, either tighten the Vietnamese or add that sentence to `accept`.",
};

/**
 * DANH MỤC ngữ pháp (bản gọn) → yêu cầu model gắn `grammar_id` cho từng câu ngay lúc sinh bài.
 * Nhờ vậy bài AI sinh ra đã có nhãn, khỏi tốn thêm 1 lượt tag_grammar.
 */
function grammarBlock(catalog: GrammarCatalogItem[]): string {
  const list = catalog
    .map((g) => `${g.id} | ${g.cefr} | ${g.title}${g.keywords?.length ? ` | signals: ${g.keywords.join(", ")}` : ""}`)
    .join("\n");
  return [
    "GRAMMAR TAGGING — for EVERY question, add a `grammar_id` field naming the grammar point it tests:",
    "- `grammar_id` MUST be an id from the ALLOWED LIST below — NEVER invent an id, never use a name.",
    "- Choose the ONE point the question actually tests (look at the blank/correct answer, not the topic).",
    '- Question that tests no grammar (reading comprehension, word meaning, spelling) → `"grammar_id": null`.',
    "- Not sure → null. A wrong tag is worse than none (students read these in their report).",
    "",
    "ALLOWED LIST (id | CEFR | name | signals):",
    list,
  ].join("\n");
}

/** Chỉ liệt kê format + luật cho các dạng ĐƯỢC PHÉP của template. */
function qtypeBlock(types: QuestionType[]): string {
  const specs = types.map((t) => `- ${t}: ${QTYPE_SPEC[t]}`).join("\n");
  const rules = types.map((t) => TYPE_RULE[t]).join("\n");
  return ["QUESTION TYPE FORMATS — use ONLY these types:", specs, "", "QUALITY RULES:", rules].join("\n");
}

// ============================================================
//  TEMPLATE quiz (pipeline chấm "quiz") — mỗi dạng bài 1 prompt CHUYÊN biệt.
//  Looked up by blueprint id (see packages/shared/blueprints.ts). read_aloud and writing
//  have their own pipelines, so they are not here (see compose*ReadingSystemPrompt / Writing).
// ============================================================
interface QuizTemplate {
  skill: string; // ép `skill` metadata
  allowedTypes: QuestionType[];
  task: string; // TASK: mục tiêu + cấu trúc bắt buộc + luật chống lạc đề
  countHint: string; // gợi ý số câu mặc định
  example: unknown; // ví dụ ExerciseInput hợp lệ (CHỈ dùng dạng được phép)
}

const QUIZ_TEMPLATES: Record<string, QuizTemplate> = {
  grammar_drill: {
    skill: "grammar",
    allowedTypes: ["multiple_choice", "fill_blank", "ordering"],
    countHint: "~10-16 questions",
    task: [
      // Trước ghi cứng "ONE point" trong khi GRAMMAR FOCUS có thể liệt kê nhiều điểm
      // (giáo viên chọn 3 thì là chuyện thường) → prompt tự mâu thuẫn. Nay nói rõ cả 2 trường hợp.
      "TASK: Create a GRAMMAR practice worksheet targeting the grammar point(s) given in GRAMMAR FOCUS below.",
      "- If GRAMMAR FOCUS lists SEVERAL points, spread the questions roughly evenly across them; every question must test ONE of them. If it lists a single point, or the request names none, pick ONE point and test only that.",
      "- The tested element MUST be the grammar item itself: for fill_blank/multiple_choice the blank/answer IS the word being conjugated or chosen (e.g. for past continuous → blank the `was/were` or the verb form), NEVER an unrelated noun/subject.",
      "- Distractors must be the COMMON MISTAKES learners make with this point (other tenses/forms), wrong in THIS context.",
      "- EXACTLY ONE option/answer may be correct. Give each sentence a signal (time marker/context) that rules out the other tenses, so a distractor tense is NOT also acceptable. If two tenses could both fit, tighten the sentence.",
      // Đo thật 07/2026: CẢ Gemini LẪN DeepSeek đều vi phạm đúng luật này (3 câu mỗi bên) khi nó
      // còn nằm chung một dòng dài dạng "AVOID". Nay tách thành lệnh CẤM + hành động thay thế.
      "- Past Simple vs Present Perfect — the stem's deciding clue must fit ONLY ONE tense.",
      "  Present-Perfect-only clues (safe): `since <point>`, `so far`, `up to now`, `ever`/`never … before`, `It's the first time …`.",
      "  Past-Simple-only clues (safe): `yesterday`, `last <period>`, `<time> ago`, `in <year>`, `when I was young`.",
      "  BANNED as the deciding clue — Past Simple ALSO fits these, so the item would have TWO correct answers: `for <duration>`, `recently`, `lately`, `already`, `just`, `yet`. If one of these is the only clue in a stem, REPLACE it with a safe clue from the lists above before emitting the item. (They may still appear when the tense is already fixed elsewhere in the stem, e.g. `has already ___ (finish)`.)",
      "- Do NOT add a reading passage or listening audio. Do NOT ask vocabulary/comprehension questions unrelated to the grammar point.",
    ].join("\n"),
    example: {
      title: "Present Simple — He/She/It", skill: "grammar", level: "Movers", tags: ["present simple"],
      passage: null, audio_script: null, wordlist: null,
      questions: [
        { type: "multiple_choice", question: "She ___ up at six.", options: ["get", "gets", "getting", "got"], answer: "gets", explanation: "Third person singular (she) → the verb takes -s." },
        { type: "fill_blank", question: "He ___ (go) to school by bus.", accept: ["goes"] },
        { type: "ordering", question: "Make a correct sentence.", answer: "My sister likes green apples", tokens: ["My", "sister", "likes", "green", "apples"] },
      ],
    },
  },
  grammar_translate: {
    skill: "grammar",
    allowedTypes: ["translate"],
    // Lower than grammar_drill: every item here is a whole sentence typed out, not a click.
    countHint: "~8-12 sentences",
    task: [
      "TASK: Create a TRANSLATION worksheet (Vietnamese → English) targeting the grammar point(s) given in GRAMMAR FOCUS below.",
      "- EVERY question is a `translate` item. Do NOT emit any other question type.",
      "- If GRAMMAR FOCUS lists SEVERAL points, spread the sentences roughly evenly across them; each sentence must exercise ONE of them. If it lists a single point, or the request names none, pick ONE point and stay on it.",
      "- The grammar point must be what the sentence FORCES: the learner cannot produce a correct English sentence without applying it. A sentence that could be written correctly while ignoring the point does not belong here.",
      "- Write at least 8 sentences unless the request gives a number.",
      "- Order the sentences easiest first: short and literal at the start, longer or with a fronted time adverbial later.",
      "- Cover the point's forms: when it has affirmative, negative and question forms, mix all three (roughly half affirmative).",
      "- Vocabulary stays well below the grammar level — the difficulty is the structure, not looking up words. Use everyday situations a Vietnamese child knows (school, family, food, weekend, Tết).",
      "- Every sentence is self-contained and plausible; vary subjects and verbs — no two items differ only by a word.",
      "- Do NOT add a reading passage, listening audio or a wordlist.",
    ].join("\n"),
    example: {
      title: "Quá khứ đơn — kể chuyện hôm qua", skill: "grammar", level: "Movers", tags: ["past simple"],
      passage: null, audio_script: null, wordlist: null,
      questions: [
        { type: "translate", question: "Hôm qua tôi đã đi học bằng xe đạp.", answer: "I went to school by bike yesterday.", accept: ["Yesterday I went to school by bike.", "I went to school by bicycle yesterday.", "Yesterday I went to school by bicycle."], word_bank: ["I", "go", "school", "bike", "yesterday"], article_lenient: true, explanation: "Past simple of an irregular verb: go → went, because of 'yesterday'." },
        { type: "translate", question: "Cô ấy đã không đến trường hôm qua.", answer: "She didn't go to school yesterday.", accept: ["Yesterday she didn't go to school."], word_bank: ["she", "go", "school", "yesterday", "not"], article_lenient: true, explanation: "Negative: didn't + base verb (go, not went)." },
        { type: "translate", question: "Tuần trước bạn có xem phim đó không?", answer: "Did you watch that film last week?", accept: ["Did you watch that movie last week?"], word_bank: ["you", "watch", "that", "film", "last week"], article_lenient: true, explanation: "Question: Did + subject + base verb." },
      ],
    },
  },
  reading_comprehension: {
    skill: "reading",
    allowedTypes: ["multiple_choice", "fill_blank", "matching", "ordering"],
    // Density, not a flat range: a 600-word C1 passage used to get the same "~6-10" as a 150-word
    // A1 one, so the learner read five times as much per question.
    countHint:
      "ONE question per ~35 words of the passage you write (150 words → 8; 400 → 11; 600 → 17), " +
      "never fewer than 8 and never more than 20. ALL answerable from the passage",
    task: [
      "TASK: Create a READING COMPREHENSION worksheet.",
      "- Write ONE coherent, natural `passage` at the given level (respect the syllabus passage length).",
      "- FORMAT the `passage` with REAL line breaks (`\\n`): separate paragraphs with a blank line. Never return the whole text as one unbroken block.",
      "- If it is a DIALOGUE, put EACH speaker's turn on its OWN line and PREFIX it with a short speaker label + colon, e.g. `Tom: Good evening!` / `Waiter: ...` / `Anna: ...`. Use consistent labels (character names, or roles like Waiter/Customer). Do NOT wrap turns in quotes when labels are used.",
      "- CRITICAL: EVERY question MUST be answerable using ONLY information stated in the passage. Do NOT ask grammar drills, general knowledge, or vocabulary NOT present in the passage.",
      "- Good angles: main idea, specific details, sequence of events, who/what/where, reference words, and word meaning AS USED in the passage.",
      "- EXPLOIT THE PASSAGE. A long passage must carry proportionally more questions — every paragraph should be probed by at least one item. Do not write 600 words and then ask about only two of them.",
      // Measured 07/2026: TFNG was 71-75% of every multiple_choice item from B1 up. It is the cheapest
      // item to write (one claim) and the easiest to guess (33%), and it only ever tests claim-matching.
      "- TRUE/FALSE/NOT GIVEN QUOTA: at most 40% of your multiple_choice items may be True/False/Not Given. The majority must be 4-option items, and those must spread across DIFFERENT angles — word meaning in context, the writer's attitude/tone, inference, the main idea of a paragraph, what a reference word points back to. Never fill a worksheet with TFNG because it is quicker to write.",
    ].join("\n"),
    example: {
      title: "Nam's Weekend", skill: "reading", level: "Movers", tags: ["daily life"],
      passage: "Last Saturday, Nam went to the park with his family. They had a picnic under a big tree. Nam played football while his sister rode her bike. In the afternoon, it started to rain, so they went home early.",
      audio_script: null, wordlist: null,
      questions: [
        { type: "multiple_choice", question: "Where did Nam go last Saturday?", options: ["To the park", "To school", "To the zoo", "To the beach"], answer: "To the park" },
        { type: "fill_blank", question: "Nam's sister rode her ___.", accept: ["bike", "bicycle"] },
        { type: "multiple_choice", question: "Why did they go home early?", options: ["It was dark", "It started to rain", "They were hungry", "It got late"], answer: "It started to rain" },
      ],
    },
  },
  // vocab_builder KHÔNG còn ở đây: bài từ vựng (vocab v2) là BỘ THẺ, không có mảng questions.
  // Luồng tạo bài đi đường riêng — AI chỉ sinh DANH SÁCH TỪ (task `generate_wordlist`), rồi
  // POST /teacher/vocab/ingest nạp vào ngân hàng (khử trùng + từ điển + AI làm giàu) và bài chỉ
  // tham chiếu word_ids qua `vocab_deck`.
  listen_choose: {
    skill: "listening",
    allowedTypes: ["multiple_choice", "fill_blank", "matching"],
    countHint: "~6-10 questions",
    task: [
      "TASK: Create a LISTENING worksheet.",
      "- Write a natural `audio_script` (a short monologue or dialogue) at the given level. Do NOT copy the script text into the question fields.",
      "- MULTI-VOICE DIALOGUE (preferred for conversations): put EACH speaker's turn on its OWN line, PREFIXED with a SHORT, CONSISTENT speaker label + colon — always the SAME label for the same person. TAG EACH speaker's GENDER right after the label: `(M)` for male, `(F)` for female, e.g. `Ben (M): Hi!` / `Lin (F): Hello!` / `Clerk (M): ...`. The gender tag picks a male/female voice per character (without it, voices may be mismatched). Keep the tag CONSISTENT for the same character every turn. Keep to 2-3 speakers; do NOT wrap turns in quotes; do NOT switch a character's label or gender mid-script.",
      "- EMOTION TAG (optional, right AFTER the gender tag, before the colon): `Ben (M) [worried]: I can't find my phone.` "
        + `Pick from: ${DIALOGUE_EMOTIONS.join(", ")}. `
        + "Tag a line ONLY when its words really carry that feeling — surprise, relief, embarrassment, worry and the rest all belong in a lively scene, but a plain greeting or an information question carries none, so leave those untagged. Tagging every line makes the audio melodramatic. Keep the emotional thread consistent: nobody flips from angry to cheerful without a reason in the words.",
      "- EVERY question must be answerable by LISTENING to the script (gist, specific details, names, numbers, who says what).",
      "- VARIETY: each question tests a DIFFERENT fact from the script — a rich script gives plenty (appearance, clothing colours, who brought whom, numbers, who says what). Do not spend several questions on the same detail.",
      "- A `matching` question is fine when the script supports it (e.g. match each speaker/person to what they want/do) — it still relies ONLY on listening, no per-item audio. If you use one, the MC/fill questions MUST ask about details the matching does NOT cover — never restate a matching pair as its own MC/fill.",
      "- `audio_script` is REQUIRED.",
    ].join("\n"),
    example: {
      title: "At the Shop", skill: "listening", level: "Movers", tags: ["shopping"],
      passage: null,
      audio_script: "Woman: Good morning! Can I help you?\nBoy: Yes, I'd like two apples and a bottle of milk, please.\nWoman: That's three dollars.",
      wordlist: null,
      questions: [
        { type: "multiple_choice", question: "What does the boy want to buy?", options: ["Two apples and milk", "Two oranges and juice", "Bread and eggs", "Water and bread"], answer: "Two apples and milk" },
        { type: "fill_blank", question: "The total price is ___ dollars.", accept: ["three", "3"] },
      ],
    },
  },
  mixed_all: {
    skill: "mixed",
    allowedTypes: ["multiple_choice", "fill_blank", "matching", "ordering", "categorize"],
    countHint: "~15-25 questions with a VARIETY of types",
    task: [
      "TASK: Create a MIXED-SKILL worksheet that combines several skills in one exercise.",
      "- You MAY include a `passage` and/or an `audio_script` if useful for the request. No `wordlist` (vocabulary has its own bank).",
      "- Use a good variety of question types suitable for the age; keep every question correct and on-topic.",
      "- This is the ONLY exercise kind allowed to blend skills.",
    ].join("\n"),
    example: {
      title: "Daily Routines", skill: "mixed", level: "Movers", tags: ["daily routines"],
      passage: null, audio_script: null, wordlist: null,
      questions: [
        { type: "multiple_choice", question: "She ___ up at six.", options: ["get", "gets", "getting", "got"], answer: "gets", explanation: "Third person singular (she) → the verb takes -s." },
        { type: "fill_blank", question: "I ___ my teeth every morning.", accept: ["brush"], word_bank: ["brush", "wash", "comb"] },
        { type: "matching", question: "Match the verb with the noun.", pairs: [{ left: "do", right: "homework" }, { left: "have", right: "lunch" }] },
        { type: "ordering", question: "Make a correct sentence.", answer: "I go to school by bus", tokens: ["I", "go", "to", "school", "by", "bus"] },
        { type: "categorize", question: "Sort into Morning or Evening.", categories: ["Morning", "Evening"], items: [{ text: "wake up", category: "Morning" }, { text: "go to bed", category: "Evening" }] },
      ],
    },
  },
};

function metadataBlock(t: QuizTemplate): string {
  return [
    "METADATA — ALWAYS fill the output fields:",
    `- \`skill\`: MUST be "${t.skill}".`,
    "- `level`: if the request states a level (e.g. Starters/Movers/Flyers or a class level), copy it verbatim into `level`.",
    "- `title`: short and catchy. Do NOT output any `tags` — skill/topic/level are chosen by the teacher, not by you.",
    `- Number of questions: ${t.countHint} unless the request specifies a number.`,
  ].join("\n");
}

function withoutTags(example: unknown): unknown {
  if (!example || typeof example !== "object") return example;
  const { tags: _tags, ...rest } = example as Record<string, unknown>;
  return rest;
}

function outputContract(example: unknown, allowed: QuestionType[]): string {
  // Chỉ nêu bất biến của dạng câu ĐƯỢC PHÉP — trước đây luôn nhắc "item category must be in
  // categories" kể cả bài grammar (không có dạng categorize) → thừa, gây nhiễu.
  const inv: string[] = [];
  if (allowed.includes("multiple_choice")) inv.push("answer must be in options; EXACTLY ONE option is correct (no distractor also valid)");
  if (allowed.includes("ordering")) {
    // Đo thật 07/2026: DeepSeek v4-pro thêm dấu chấm cuối `answer` mà không đưa vào `tokens` ở
    // 7/7 câu → học sinh ghép hoàn hảo vẫn bị chấm 0. Nói thẳng cái bẫy đó ra.
    inv.push(
      "ordering: `tokens` joined with single spaces must equal `answer` CHARACTER FOR CHARACTER — if `answer` ends with a full stop, no token contains it, so drop the full stop from `answer`",
    );
  }
  if (allowed.includes("categorize")) inv.push("item category must be in categories");
  if (allowed.includes("translate")) {
    inv.push("translate: `question` is Vietnamese, `answer`/`accept` are English, and the two share no word except names and numbers");
  }
  return [
    "OUTPUT CONTRACT — Return EXACTLY ONE JSON object of type ExerciseInput. Do NOT wrap it in ```; output nothing but the JSON.",
    "Each question `type` MUST be one of the ALLOWED types listed above — no other type.",
    // The blanket "everything in English" rule is false for translate, whose prompt IS the Vietnamese.
    allowed.includes("translate")
      ? "Question and answer content must be in English, EXCEPT the `question` of a `translate` item, which is the Vietnamese prompt. The optional `explanation` field must be written in ENGLISH unless the request says otherwise."
      : "Question and answer content must be in English. The optional `explanation` field must be written in ENGLISH unless the request says otherwise.",
    ...(inv.length ? [`Invariants: ${inv.join("; ")}.`] : []),
    "",
    "VALID STRUCTURE EXAMPLE (placeholder content — follow the real request to generate):",
    // `tags` is omitted: the metadata rules forbid it, and an example that shows it wins.
    JSON.stringify(withoutTags(example), null, 2),
  ].join("\n");
}

/**
 * System prompt sinh bài QUIZ theo TEMPLATE (blueprint id). Không rõ template → dùng "mixed_all".
 * `catalog` có → kèm phần gắn `grammar_id`.
 */
export function composeQuizSystemPrompt(
  templateId?: string | null,
  catalog?: GrammarCatalogItem[] | null,
  focus?: string | null,
): string {
  const t = QUIZ_TEMPLATES[templateId ?? ""] ?? QUIZ_TEMPLATES.mixed_all;
  // The blueprint is the source of truth for which types a template allows; the template's own list
  // is only a fallback for an id the blueprints no longer know.
  const types = (getBlueprint(templateId ?? "")?.allowedTypes as QuestionType[] | undefined)?.length
    ? (getBlueprint(templateId ?? "")!.allowedTypes as QuestionType[])
    : t.allowedTypes;
  // P4 lean: sổ tay ngữ pháp (để TAG) chỉ nạp cho bài grammar/mixed — bài khác thường tag null,
  // để job tag_grammar sau khi lưu lo (khỏi phình prompt ~86 dòng).
  const wantCatalog = t.skill === "grammar" || t.skill === "mixed";
  return [
    PERSONA,
    SYLLABUS_REF,
    t.task,
    qtypeBlock(types),
    focus?.trim() ? focus : "", // GRAMMAR FOCUS chi tiết (P1) — đứng trước để model bám sát
    catalog?.length && wantCatalog ? grammarBlock(catalog) : "",
    metadataBlock(t),
    outputContract(t.example, types),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildUserPrompt(r: AiGenerateExerciseInput): string {
  return [
    "Create a worksheet for the request below. Return ONLY the ExerciseInput JSON (same shape as the EXAMPLE):",
    '"""',
    r.prompt.trim(),
    '"""',
  ].join("\n");
}

/** Enhance a rough teacher request into a stronger, well-structured prompt (refine_prompt task). */
export const REFINE_SYSTEM =
  "You help a teacher write the FREE-TEXT part of an English exercise request. " +
  "The exercise METADATA (skill, exercise type, level, topic, age, difficulty, tone, length, question types, grammar focus, explanation language) is ALREADY chosen and given to you as CONTEXT — do NOT restate, list, or change any of it. " +
  "Turn the teacher's rough notes into vivid, specific INSTRUCTIONS plus a short quality RULES list that make generation richer and fully CONSISTENT with the context: " +
  "(1) State in natural language what THIS exercise should do given its skill and question types. " +
  "(2) Add concrete detail: example scenarios/situations, sample sub-themes, the kind of vocabulary/structures to use, and what to avoid. " +
  "(3) End with a short 'Rules:' list the generator MUST follow (answers exactly correct AND UNAMBIGUOUS — include the signals/context so ONLY the intended answer is correct, e.g. time markers for tenses; level-appropriate; strictly on-topic; natural language; no duplicate items; distractors plausible but clearly wrong in context). " +
  "KEEP the teacher's intent; never invent a different topic. Be concise and actionable. " +
  "Do NOT output the metadata fields (Level/Topic/Grammar/Types/Explanation…). " +
  'Write in ENGLISH. Return ONLY JSON: {"prompt": string}.';

// Gợi ý GỘP Context/setting + Target vocabulary trong 1 lần gọi — theo metadata đã chọn.
export const SUGGEST_PAIR_SYSTEM =
  "You fill fields of an English exercise using the ALREADY-CHOSEN metadata (skill, exercise type, level, topic, sub-topic, age, tone, difficulty, length…). " +
  "If the metadata already contains an existing context / vocabulary, KEEP and refine it (do not replace with something unrelated). " +
  "Produce values consistent with each other AND the metadata, matching the level & age: " +
  '(1) `context` = ONE short, concrete real-life setting, 3-8 words (e.g. "at the supermarket buying fruit"); ' +
  "(2) `vocabulary` = 6-12 target words/phrases (comma-separated) fitting the topic, level and that setting — for a VOCABULARY DECK, the count given in the request instead. " +
  "When asked for FULL, also (3) `instructions` = a few vivid English instruction lines + a short 'Rules:' list (answers exactly correct & unambiguous, level-appropriate, strictly on-topic). " +
  "For a VOCABULARY DECK also return (4) `title` = a short lesson title the teacher can use as-is (max 6 words, e.g. \"At the Zoo — Animal Words\"); otherwise return \"\". " +
  'English only, no numbering. Return ONLY JSON {"context": string, "vocabulary": string, "instructions": string, "title": string}.';

export function buildSuggestPair(context?: string | null, full?: boolean, kind: "quiz" | "vocab" = "quiz"): string {
  return [
    "METADATA (already chosen):",
    context?.trim() || "(none)",
    "",
    kind === "vocab"
      ? [
          "This is a VOCABULARY DECK (no questions). `vocabulary` is the actual word list that will be studied — make it the star: as many items as the word count in METADATA (10-20 when none is given).",
          "If METADATA already lists seed examples, treat them as a SAMPLE of the group wanted and EXPAND to more items of the same kind — do not merely repeat them.",
          "Respect the requested item form (single words / phrases / both) and word count in METADATA.",
          "`title` is REQUIRED here: a short lesson title (max 6 words) matching the topic and level.",
        ].join("\n")
      : "",
    full
      ? kind === "vocab"
        ? 'Return {"context": "…", "vocabulary": "word1, word2, …", "instructions": "…", "title": "…"} — `instructions` must describe HOW TO PICK WORDS (register, word families, what to avoid), NEVER questions or answer keys.'
        : 'Return {"context": "…", "vocabulary": "word1, word2, …", "instructions": "…", "title": ""} (fill instructions too).'
      : kind === "vocab"
        ? 'Return {"context": "…", "vocabulary": "word1, word2, …", "instructions": "", "title": "…"}.'
        : 'Return {"context": "…", "vocabulary": "word1, word2, …", "instructions": "", "title": ""}.',
  ]
    .filter(Boolean)
    .join("\n");
}

/** Enhance yêu cầu cho bài BỘ THẺ TỪ VỰNG — không có câu hỏi, chỉ tiêu chí CHỌN TỪ. */
export const REFINE_VOCAB_SYSTEM =
  "You help a teacher write the FREE-TEXT part of a VOCABULARY DECK request. " +
  "The METADATA (level, topic, sub-topic, context/setting, age, difficulty…) is ALREADY chosen and given as CONTEXT — do NOT restate or change it. " +
  "Turn the teacher's rough notes into specific INSTRUCTIONS for CHOOSING WORDS, plus a short 'Rules:' list. Cover: " +
  "which senses/registers to prefer, whether to include phrases/collocations/phrasal verbs, word families to group, and what to avoid (rare/archaic/offensive, near-duplicates, words far above the level). " +
  "This exercise has NO questions and NO passage — NEVER mention questions, quizzes, distractors, answer keys, reading passages or grammar drills. " +
  "KEEP the teacher's intent; never invent a different topic. Do NOT output metadata fields. " +
  'Write in ENGLISH. Return ONLY JSON: {"prompt": string}.';

export function buildRefineVocabPrompt(text: string, context?: string | null): string {
  return [
    "CONTEXT — already chosen, do NOT restate:",
    context?.trim() || "(none)",
    "",
    "Teacher's rough notes:",
    '"""',
    text.trim(),
    '"""',
    "",
    "Rewrite into enriched English word-selection instructions + a short Rules list (no metadata fields, no questions).",
  ].join("\n");
}

export function buildRefinePrompt(text: string, context?: string | null): string {
  return [
    "CONTEXT — already chosen, do NOT restate:",
    context?.trim() || "(none)",
    "",
    "Teacher's rough notes:",
    '"""',
    text.trim(),
    '"""',
    "",
    "Rewrite into enriched English instructions + a short Rules list (no metadata fields).",
  ].join("\n");
}

// ============================================================
//  READ-ALOUD generation: no questions and no wordlist (the blueprint forbids it — the passage
//  itself shows IPA per word), only the passage to read aloud.
// ============================================================
const READING_OUTPUT_CONTRACT = [
  "OUTPUT CONTRACT — return ONLY this JSON object (no questions array):",
  JSON.stringify(
    {
      title: "string (short, Vietnamese or English)",
      skill: "reading",
      level: "string | null (echo the level if given, e.g. Movers)",
      passage: "string — the text the student will READ ALOUD",
    },
    null,
    2,
  ),
].join("\n");

/** System prompt cho sinh bài ĐỌC TO (read-aloud). */
// ============================================================
//  WRITING: prompt + outline + sample answer (graded on content, organisation, vocabulary, grammar).
//  The prompt is stored in the `speaking_prompt` column (name kept from the retired speaking type).
// ============================================================
/** Target length by level: one table, used for the task line AND the sample answer. */
const WRITING_WORDS =
  "Pre A1 ~30 · A1 ~50 · A2 ~80-100 · B1 ~150 · B2 ~200 · C1 ~250 (match the request's level; no level → ~80)";

const WRITING_OUTPUT_CONTRACT = [
  "OUTPUT CONTRACT — return ONLY this JSON object (no passage, no questions):",
  JSON.stringify(
    {
      title: "string (short, Vietnamese or English)",
      skill: "writing",
      level: "string | null (echo the level if given)",
      speaking_prompt: 'string — the WRITING task in English, ending with "Write at least N words."',
      framework: {
        outline: ["string — 3-4 guiding points the essay should cover, in order (ENGLISH, short)"],
        phrases: ["string — 4-8 useful linking words / sentence starters in English"],
      },
      sample_answer: "string — a MODEL essay in English of about N words, at the same level, following the outline; hidden from the student",
      wordlist: [{ word: "string (CLEAN term, no POS)", ipa: "string (optional, GA, no slashes)", meaning: "string (Vietnamese)", example: "string (optional)", pos: "string (n/v/adj/adv/np/phr, optional)" }],
    },
    null,
    2,
  ),
].join("\n");

export function composeWritingSystemPrompt(): string {
  return [
    PERSONA,
    SYLLABUS_REF,
    [
      "TASK: Create a WRITING exercise (the student writes a short essay; the teacher-style grader scores content, organisation, vocabulary and grammar).",
      "- Write ONE clear `speaking_prompt` (the writing task/question) for the given level and the learner's age — concrete and relatable.",
      `- N = the target length by level: ${WRITING_WORDS}. The \`speaking_prompt\` MUST end with the sentence "Write at least N words."`,
      "- Provide a `framework.outline` of 3-4 short guiding points in ENGLISH covering the essay STRUCTURE (introduction → body point(s) → conclusion).",
      "- Provide `framework.phrases`: 4-8 useful English linking words / sentence starters the student can use while writing.",
      "- Provide a `wordlist` of 4-10 topic words (word, IPA if useful, Vietnamese meaning, `pos`). `word` = clean term only; put part of speech in `pos`.",
      "- Provide a `sample_answer`: a model essay of about N words AT THE SAME LEVEL (do not exceed it) that follows the outline — a reference for grading, HIDDEN from the student.",
      "- NO `questions`, NO `passage`.",
    ].join("\n"),
    WRITING_OUTPUT_CONTRACT,
  ].join("\n\n");
}

export function buildWritingUserPrompt(r: AiGenerateExerciseInput): string {
  return [
    "Create a WRITING exercise for the request below. Return ONLY the JSON object (title, speaking_prompt, framework{outline,phrases}, sample_answer, wordlist — NO passage, NO questions):",
    '"""',
    r.prompt.trim(),
    '"""',
  ].join("\n");
}

export function composeReadingSystemPrompt(): string {
  return [
    PERSONA,
    SYLLABUS_REF,
    [
      "TASK: Create a READ-ALOUD reading exercise (the student records themselves reading the passage; software scores pronunciation).",
      "- Write ONE coherent, natural `passage` suitable for reading aloud at the given level (respect the syllabus passage length; if no level given, ~50-80 words).",
      "- COHERENCE: the passage describes ONE consistent situation — do NOT mix incompatible settings (e.g. describing a photo you are looking at AND inviting people to a party). Every sentence must fit the same scene.",
      "- Use clear, common words and simple sentence rhythm; avoid rare names, numbers-heavy text, tables, or symbols hard to pronounce.",
      "- FORMAT the `passage` with REAL line breaks (`\\n`): separate paragraphs with a blank line. A DIALOGUE puts each speaker's turn on its OWN line, prefixed with a short label + colon (e.g. `Tom: ...`). Never one unbroken block.",
      "- DO NOT create any questions or a wordlist. Return only the title and the passage.",
    ].join("\n"),
    READING_OUTPUT_CONTRACT,
  ].join("\n\n");
}

export function buildReadingUserPrompt(r: AiGenerateExerciseInput): string {
  return [
    "Create a READ-ALOUD reading exercise for the request below. Return ONLY the JSON object (title, passage — NO questions, NO wordlist):",
    '"""',
    r.prompt.trim(),
    '"""',
  ].join("\n");
}

// ============================================================
//  IPA — phiên âm đoạn văn theo CÂU (hiển thị song song text/IPA).
// ============================================================
export const IPA_SYSTEM = [
  "You are an expert phonetician and translator. Transcribe English text into IPA AND translate it to",
  "Vietnamese, for young Vietnamese learners.",
  "- Use General American (GA) BROAD phonemic transcription, wrapped in /slashes/.",
  "- ALWAYS mark stress: primary ˈ and (when present) secondary ˌ IMMEDIATELY BEFORE the",
  "  stressed syllable of EVERY multi-syllable word (e.g. /ˌɛdʒʊˈkeɪʃən/, /toˈmɑroʊ/).",
  "  Single-syllable words take no stress mark. Never omit stress on polysyllabic words.",
  "- Split the passage into sentences IN ORDER. For EACH sentence output { text, ipa, vi }:",
  "  · text = the ORIGINAL sentence exactly (keep punctuation).",
  "  · ipa = the IPA transcription of that whole sentence (space between words, keep it readable).",
  "  · vi = a NATURAL Vietnamese translation of that sentence (not word-by-word; keep it faithful and simple).",
  "- Do NOT merge or drop sentences; preserve their order and count.",
  'Return ONLY JSON: {"lines":[{"text":string,"ipa":string,"vi":string}, ...]} — nothing else.',
].join("\n");

export function buildIpaPrompt(passage: string): string {
  return ["Transcribe this passage into IPA, sentence by sentence:", '"""', passage.trim(), '"""'].join("\n");
}

/** Enhance yêu cầu cho bài ĐỌC TO / NÓI (không có câu hỏi) — metadata đã chọn ở CONTEXT. */
export const REFINE_READING_SYSTEM =
  "You help a teacher write the FREE-TEXT part of a READ-ALOUD or WRITING exercise request (the CONTEXT says which). " +
  "The METADATA (skill, type, level, age, topic, tone, length…) is ALREADY chosen and given as CONTEXT — do NOT restate or change it. " +
  "Turn the teacher's rough notes into vivid, specific INSTRUCTIONS for ONE passage to read aloud or ONE writing task, plus a short 'Rules:' list " +
  "(level-appropriate, on-topic; a read-aloud passage has natural rhythm and common words; a writing task is clear and answerable at the level). " +
  "This exercise has NO questions — NEVER mention questions, quizzes, grammar drills or answer keys. " +
  "KEEP the teacher's intent; never invent a different topic. Do NOT output metadata fields. " +
  'Write in ENGLISH. Return ONLY JSON: {"prompt": string}.';

export function buildRefineReadingPrompt(text: string, context?: string | null): string {
  return [
    "CONTEXT — already chosen, do NOT restate:",
    context?.trim() || "(none)",
    "",
    "Teacher's rough notes:",
    '"""',
    text.trim(),
    '"""',
    "",
    "Rewrite into enriched English instructions + a short Rules list (no metadata fields, no questions).",
  ].join("\n");
}
