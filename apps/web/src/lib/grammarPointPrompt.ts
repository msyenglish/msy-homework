// i18n-ignore-file: AI prompt text and its parser.
// Builds the copy-to-chat prompt that drafts one complete grammar point, and parses the JSON pasted back.
import { grammarInputSchema, type Cefr, type Grammar, type GrammarInput } from "@msyen/shared";

export type GrammarPromptOptions = {
  brief: string;
  cefr: Cefr | "";
  category: string;
  enhanced: boolean;
  existing: Pick<Grammar, "id" | "title" | "category" | "cefr">[];
};

const SAMPLE = `{
  "id": "verb-to-be",
  "title": "Verb 'to be' (am/is/are) — Động từ to be",
  "category": "Thì động từ",
  "cefr": "Pre-A1",
  "summary": "Dùng am/is/are để nói ai đó/cái gì đó LÀ gì, THẾ NÀO hoặc Ở ĐÂU.",
  "forms": [
    {"label": "Khẳng định", "formula": "S + am/is/are + ...", "example": "I am happy. She is a teacher."},
    {"label": "Phủ định", "formula": "S + am/is/are + not + ...", "example": "He is not tall."},
    {"label": "Nghi vấn", "formula": "Am/Is/Are + S + ...?", "example": "Are you ok?"}
  ],
  "signals": ["<optional: time words / cue words that signal this point>"],
  "usage": ["Nói tên, tuổi, nghề nghiệp: I am Tom. She is a doctor.", "Nói vị trí: The cat is on the bed."],
  "spelling": ["<optional: spelling / form-change rules>"],
  "examples": [
    {"en": "I am seven years old.", "vi": "Tôi bảy tuổi.", "kind": "aff"},
    {"en": "He is not at home.", "vi": "Anh ấy không có ở nhà.", "kind": "neg"},
    {"en": "Are you happy?", "vi": "Bạn có vui không?", "kind": "ques", "note": "<optional short Vietnamese note>"}
  ],
  "mistakes": ["✗ She are nice. → ✓ She is nice. (she đi với is)"],
  "tips": ["Nhớ cặp: I → am; he/she/it → is; you/we/they → are."],
  "compare": [{"with": "there-is-are", "note": "<Vietnamese: how the two points differ>"}],
  "related": ["articles-a-an"],
  "keywords": ["to be", "am is are", "động từ to be"],
  "bank": [{"term": "turn on", "meaning": "bật (đèn, máy)", "example": "Turn on the light.", "group": "Ở nhà"}]
}`;

export function grammarPointPrompt(o: GrammarPromptOptions): string {
  const cats = [...new Set(o.existing.map((p) => p.category))].sort();
  const ids = o.existing.map((p) => `- ${p.id} (${p.cefr}) ${p.title}`).join("\n");
  const level = o.cefr ? `CEFR band: ${o.cefr} (use exactly this value).` : `CEFR band: choose the best fit from Pre-A1, A1, A2, B1, B2, C1, C2.`;
  const category = o.category
    ? `Category: "${o.category}" (use exactly this value).`
    : `Category: reuse one of the existing categories when it fits${cats.length ? ` (${cats.map((c) => `"${c}"`).join(", ")})` : ""}; otherwise write a short new one in Vietnamese.`;

  const depth = o.enhanced
    ? `DEPTH — ENHANCED (a full handbook page):
- Before writing, think through how Vietnamese learners actually get this point wrong and what they confuse it with; let that drive "mistakes", "tips" and "compare".
- forms: every relevant pattern (affirmative, negative, question, short answers / contractions / variants when they exist), each with an example.
- usage: 3–6 distinct uses, each "Vietnamese explanation: English example".
- examples: 8–12 pairs covering every form; tag each with "kind" (aff / neg / ques).
- Fill signals, spelling, mistakes (4–6), tips (2–4), compare, related and keywords (5–10) whenever they apply. Use "bank" only when this point is really a list to memorise (phrasal verbs, verb + preposition, irregular forms…), with 15–40 entries grouped by "group".`
    : `DEPTH — STANDARD (a concise page):
- forms: the core patterns (2–4), each with an example.
- usage: 2–4 uses. examples: 4–6 pairs tagged with "kind".
- Add mistakes (2–3), tips (1–2) and keywords; add the other optional fields only when clearly useful.`;

  return `You are an experienced English teacher writing ONE grammar point for a grammar handbook used by Vietnamese learners of English.

WHAT THE TEACHER WANTS:
${o.brief.trim()}

${level}
${category}

${depth}

LANGUAGE:
- "title": "<English name> — <Vietnamese name>", e.g. "Present Simple — Hiện tại đơn".
- Explanations (summary, form labels, usage, mistakes, tips, compare notes, example "vi", bank "meaning") are in natural Vietnamese. English sentences are natural, idiomatic and use vocabulary of the chosen band.
- "summary": ONE Vietnamese sentence saying when to use this point.
- "mistakes": each item "✗ wrong → ✓ right (short Vietnamese reason)".

IDS:
- "id": a new lowercase slug (a–z, 0–9, hyphens), e.g. "present-perfect-continuous". It must NOT be one of the existing ids below.
- "related" and "compare[].with" may ONLY use ids from the list below; leave them out when nothing fits.

EXISTING POINTS (id, band, title):
${ids || "- (none yet)"}

OUTPUT:
Return ONLY one JSON object (no prose, no code fence) with this shape. Required keys: id, title, category, cefr, summary, forms, usage, examples. Omit an optional key rather than leaving it empty, and never output placeholder text in <angle brackets>.
${SAMPLE}`;
}

export type ParsedGrammarPoint = { ok: true; point: GrammarInput } | { ok: false; errors: string[] };

/** Parses pasted AI output (tolerates a ```json fence, a wrapper object or surrounding prose) and validates it. */
export function parseGrammarPoint(raw: string): ParsedGrammarPoint {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : "JSON"] };
  }
  if (Array.isArray(v)) v = v[0];
  const wrapped = v as { point?: unknown; grammar?: unknown } | null;
  if (wrapped && typeof wrapped === "object" && !("id" in wrapped)) v = wrapped.point ?? wrapped.grammar ?? v;
  // Empty optional arrays/strings are dropped so they never fail a min(1) check.
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if ((Array.isArray(x) && !x.length) || x === "") delete (v as Record<string, unknown>)[k];
    }
  }
  const r = grammarInputSchema.safeParse(v);
  if (r.success) return { ok: true, point: r.data };
  return { ok: false, errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "root"}: ${i.message}`) };
}
