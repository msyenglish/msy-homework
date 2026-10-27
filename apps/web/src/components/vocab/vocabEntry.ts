// Helpers for editing vocabulary entries: JSON import (lenient key names), completeness checks,
// and the sample JSON / external-AI prompt the teacher can copy.
import type { VocabItemInput } from "@msyen/shared";
import { t, type TKey } from "../../i18n";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
type Cefr = (typeof CEFR)[number];

/** Accepted spellings per field, so JSON from other tools imports without hand-editing. */
const ALIASES: Record<string, string[]> = {
  word: ["word", "term", "headword", "vocab", "entry", "english"],
  pos: ["pos", "type", "part_of_speech", "partOfSpeech", "word_type"],
  ipa: ["ipa", "pronunciation", "phonetic", "phonetics", "transcription"],
  // i18n-ignore: JSON field aliases
  meaning: ["meaning", "vi", "vietnamese", "translation", "nghia", "nghĩa"],
  definition: ["definition", "def", "english_definition", "definition_en", "en_definition"],
  example: ["example", "sentence", "example_en", "exampleSentence"],
  example_vi: ["example_vi", "exampleVi", "example_translation", "sentence_vi", "example_meaning"],
  cefr: ["cefr", "level", "cefr_level"],
  synonyms: ["synonyms", "synonym", "syn"],
  antonyms: ["antonyms", "antonym", "ant", "opposite"],
  collocations: ["collocations", "collocation", "phrases", "common_phrases"],
  family: ["family", "word_family", "wordFamily", "forms", "related_forms"],
  note: ["note", "notes", "usage", "usage_note", "tip"],
  image: ["image", "image_url", "imageUrl", "picture"],
};

const pickKey = (o: Record<string, unknown>, field: string): unknown => {
  for (const k of ALIASES[field]) if (o[k] != null && o[k] !== "") return o[k];
  return undefined;
};

const asText = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(Array.isArray(v) ? v.join(", ") : v).trim();
  return s || null;
};

const asList = (v: unknown): string[] | null => {
  if (v == null) return null;
  const list = (Array.isArray(v) ? v.map(String) : String(v).split(/[,;|]/)).map((s) => s.trim()).filter(Boolean);
  return list.length ? list.slice(0, 10) : null;
};

const asCefr = (v: unknown): Cefr | null => {
  const s = String(v ?? "").toUpperCase().match(/[ABC][12]/)?.[0];
  return s && (CEFR as readonly string[]).includes(s) ? (s as Cefr) : null;
};

export type ImportResult = { items: VocabItemInput[]; skipped: number; error?: string };

/** Parses pasted JSON: an array of entries, or {items|words|vocabulary: [...]}; a bare string = a word. */
export function parseVocabJson(text: string): ImportResult {
  let data: unknown;
  try {
    // Tolerate a ```json fence around the payload (what chat assistants usually return).
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch (e) {
    return { items: [], skipped: 0, error: t("teacherVocab.error.invalidJson", { message: (e as Error).message }) };
  }
  const obj = data as Record<string, unknown>;
  const list = Array.isArray(data) ? data : obj?.items ?? obj?.words ?? obj?.vocabulary ?? obj?.wordlist;
  if (!Array.isArray(list)) return { items: [], skipped: 0, error: t("teacherVocab.error.expectedJsonArray") };

  const items: VocabItemInput[] = [];
  let skipped = 0;
  for (const raw of list) {
    if (typeof raw === "string") {
      if (raw.trim()) items.push({ word: raw.trim().slice(0, 80) });
      else skipped++;
      continue;
    }
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    const word = asText(pickKey(o, "word"));
    if (!word) {
      skipped++;
      continue;
    }
    items.push({
      word: word.slice(0, 80),
      pos: asText(pickKey(o, "pos"))?.slice(0, 40) ?? null,
      ipa: asText(pickKey(o, "ipa"))?.replace(/^\/|\/$/g, "").slice(0, 120) ?? null,
      meaning: asText(pickKey(o, "meaning"))?.slice(0, 300) ?? null,
      definition: asText(pickKey(o, "definition"))?.slice(0, 300) ?? null,
      example: asText(pickKey(o, "example"))?.slice(0, 400) ?? null,
      example_vi: asText(pickKey(o, "example_vi"))?.slice(0, 400) ?? null,
      cefr: asCefr(pickKey(o, "cefr")),
      synonyms: asList(pickKey(o, "synonyms")),
      antonyms: asList(pickKey(o, "antonyms")),
      collocations: asList(pickKey(o, "collocations")),
      family: asList(pickKey(o, "family")),
      note: asText(pickKey(o, "note"))?.slice(0, 400) ?? null,
      image: asText(pickKey(o, "image"))?.slice(0, 500) ?? null,
    });
  }
  return { items, skipped };
}

/** Entry fields in a stable order, for export and display. */
export function exportItems(items: VocabItemInput[]): object[] {
  return items.map((it) => {
    const out: Record<string, unknown> = { word: it.word };
    for (const k of ["pos", "ipa", "meaning", "definition", "example", "example_vi", "cefr", "collocations", "family", "synonyms", "antonyms", "note", "image"] as const) {
      const v = it[k];
      if (v != null && !(Array.isArray(v) && !v.length) && v !== "") out[k] = v;
    }
    return out;
  });
}

export const SAMPLE_JSON = JSON.stringify(
  {
    items: [
      {
        word: "decision",
        pos: "n",
        ipa: "dɪˈsɪʒən",
        // i18n-ignore-start: Vietnamese sample entry for teachers
        meaning: "quyết định",
        definition: "a choice that you make after thinking",
        example: "It was a hard decision to leave my old school.",
        example_vi: "Rời trường cũ là một quyết định khó khăn.",
        cefr: "A2",
        collocations: ["make a decision", "a difficult decision"],
        family: ["decide (v)", "decisive (adj)"],
        synonyms: ["choice"],
        antonyms: [],
        note: "Nói 'make a decision', không nói 'do a decision'.",
        // i18n-ignore-end
      },
    ],
  },
  null,
  2,
);

/** Prompt for any chat assistant (ChatGPT, Claude, Gemini…) that returns importable JSON. */
export function externalPrompt(opts: {
  topic: string;
  level?: string | null;
  /** Number of entries to pick; omitted when the topic is already a word list. */
  count?: number | null;
  form?: "word" | "phrase" | "both";
  /** Words already in the set, to leave out. */
  exclude?: string[];
}): string {
  const { topic, level, count, form = "word", exclude = [] } = opts;
  const formText = form === "phrase" ? "phrases, phrasal verbs or collocations" : form === "both" ? "a mix of single words and phrases" : "single words";
  return [
    `Create a vocabulary list for Vietnamese learners${level ? ` at level ${level}` : ""}.`,
    `Topic / words: ${topic || "<write the topic or paste your words here>"}`,
    ...(count ? [`Pick exactly ${count} entries (${formText}), the most useful ones first.`] : ["If a word list is given above, keep exactly those words."]),
    ...(exclude.length ? [`Do NOT include these words (already learned): ${exclude.slice(0, 400).join(", ")}`] : []),
    "",
    "For EACH entry use the most common everyday sense and give:",
    "- word: the clean headword (no article, no part of speech in brackets)",
    "- pos: n / v / adj / adv / prep / phr v / idiom / phrase",
    "- ipa: General American IPA with stress marks, no slashes",
    "- meaning: short Vietnamese gloss (2-8 words)",
    "- definition: one short English learner's-dictionary definition (max 15 words)",
    "- example: one natural English sentence (6-14 words) that contains the word",
    "- example_vi: Vietnamese translation of the example",
    "- cefr: A1 / A2 / B1 / B2 / C1 / C2",
    "- collocations: 2-4 common combinations",
    "- family: related forms with part of speech, e.g. \"beauty (n)\"",
    "- synonyms (0-3), antonyms (0-2)",
    "- note: optional one-sentence Vietnamese usage note or common mistake",
    "",
    "Reply with ONLY this JSON, nothing else:",
    SAMPLE_JSON,
  ].join("\n");
}

/** Fields a complete entry has. */
export const ENTRY_FIELDS: { key: keyof VocabItemInput; label: TKey }[] = [
  { key: "pos", label: "teacherVocab.field.partOfSpeech" },
  { key: "ipa", label: "teacherVocab.field.ipa" },
  { key: "meaning", label: "teacherVocab.field.meaning" },
  { key: "definition", label: "teacherVocab.field.definition" },
  { key: "example", label: "teacherVocab.field.example" },
  { key: "example_vi", label: "teacherVocab.field.exampleTranslation" },
  { key: "cefr", label: "teacherVocab.field.cefr" },
  { key: "collocations", label: "teacherVocab.field.collocations" },
];

const filled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!String(v ?? "").trim());

/** Missing fields and content warnings for one entry. */
export function entryQuality(it: VocabItemInput): { missing: string[]; warnings: string[] } {
  const missing = ENTRY_FIELDS.filter((f) => !filled(it[f.key])).map((f) => t(f.label));
  const warnings: string[] = [];
  if (it.example && !exampleHasWord(it.word, it.example)) warnings.push(t("teacherVocab.warning.exampleMissingWord"));
  if (it.meaning && meaningLooksEnglish(it.word, it.meaning)) warnings.push(t("teacherVocab.warning.meaningNotVietnamese"));
  return { missing, warnings };
}

// English function words that never occur in a Vietnamese gloss written without diacritics.
const ENGLISH_MARKERS = new Set(["the", "of", "to", "and", "is", "are", "for", "with", "that", "this", "or", "an", "in", "on", "be", "something", "someone", "somebody", "used", "when", "which"]);

/**
 * A gloss is flagged as English only when it has no Vietnamese diacritics AND shows a real English
 * sign (a function word, or nothing but the headword) — plain glosses such as "nhanh" or "xe taxi" pass.
 */
export function meaningLooksEnglish(word: string, meaning: string): boolean {
  if (/[à-ỹđ]/i.test(meaning)) return false;
  const tokens = meaning.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  const head = word.toLowerCase().trim();
  // The headword alone ("taxi" → "taxi") is a copy, not a gloss; "xe taxi" is a normal Vietnamese loanword use.
  return tokens.some((w) => ENGLISH_MARKERS.has(w)) || (tokens.length === 1 && tokens[0] === head);
}

// Irregular verbs: base → past / past participle forms, so "She gave me…" counts as an example of "give".
const IRREGULAR: Record<string, string[]> = {
  be: ["was", "were", "been"], begin: ["began", "begun"], bend: ["bent"], bite: ["bit", "bitten"], blow: ["blew", "blown"],
  break: ["broke", "broken"], bring: ["brought"], build: ["built"], burn: ["burnt"], buy: ["bought"], catch: ["caught"],
  choose: ["chose", "chosen"], come: ["came"], cost: ["cost"], creep: ["crept"], cut: ["cut"], deal: ["dealt"], dig: ["dug"],
  do: ["did", "done"], draw: ["drew", "drawn"], dream: ["dreamt"], drink: ["drank", "drunk"], drive: ["drove", "driven"],
  eat: ["ate", "eaten"], fall: ["fell", "fallen"], feed: ["fed"], feel: ["felt"], fight: ["fought"], find: ["found"],
  fly: ["flew", "flown"], forget: ["forgot", "forgotten"], forgive: ["forgave", "forgiven"], freeze: ["froze", "frozen"],
  get: ["got", "gotten"], give: ["gave", "given"], go: ["went", "gone"], grow: ["grew", "grown"], hang: ["hung"],
  have: ["had", "has"], hear: ["heard"], hide: ["hid", "hidden"], hit: ["hit"], hold: ["held"], hurt: ["hurt"],
  keep: ["kept"], know: ["knew", "known"], lay: ["laid"], lead: ["led"], leave: ["left"], lend: ["lent"], let: ["let"],
  lie: ["lay", "lain"], light: ["lit"], lose: ["lost"], make: ["made"], mean: ["meant"], meet: ["met"], pay: ["paid"],
  put: ["put"], read: ["read"], ride: ["rode", "ridden"], ring: ["rang", "rung"], rise: ["rose", "risen"], run: ["ran"],
  say: ["said"], see: ["saw", "seen"], seek: ["sought"], sell: ["sold"], send: ["sent"], set: ["set"], shake: ["shook", "shaken"],
  shine: ["shone"], shoot: ["shot"], show: ["shown"], shut: ["shut"], sing: ["sang", "sung"], sink: ["sank", "sunk"],
  sit: ["sat"], sleep: ["slept"], slide: ["slid"], speak: ["spoke", "spoken"], spend: ["spent"], spin: ["spun"],
  split: ["split"], spread: ["spread"], stand: ["stood"], steal: ["stole", "stolen"], stick: ["stuck"], sting: ["stung"],
  strike: ["struck"], swear: ["swore", "sworn"], sweep: ["swept"], swim: ["swam", "swum"], swing: ["swung"],
  take: ["took", "taken"], teach: ["taught"], tear: ["tore", "torn"], tell: ["told"], think: ["thought"], throw: ["threw", "thrown"],
  understand: ["understood"], wake: ["woke", "woken"], wear: ["wore", "worn"], win: ["won"], write: ["wrote", "written"],
};

/** Irregular forms of a word, including prefixed verbs (undertake → undertook, overcome → overcame). */
function irregularForms(p: string): string[] {
  if (IRREGULAR[p]) return IRREGULAR[p];
  for (const base of Object.keys(IRREGULAR)) {
    if (base.length >= 3 && p.length > base.length && p.endsWith(base)) {
      const prefix = p.slice(0, p.length - base.length);
      return IRREGULAR[base].map((f) => prefix + f);
    }
  }
  return [];
}

/** Loose check: every content word of the entry appears in the sentence (inflections and irregular forms allowed). */
export function exampleHasWord(word: string, example: string): boolean {
  const sent = example.toLowerCase();
  const parts = word
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s/]+/)
    .filter((p) => p.length > 2 && !["sth", "someone", "something", "one's", "the"].includes(p));
  if (!parts.length) return true;
  return parts.every((p) => {
    const stem = p.length > 5 ? p.slice(0, p.length - 2) : p.length > 3 ? p.slice(0, p.length - 1) : p;
    if (sent.includes(stem)) return true;
    return irregularForms(p).some((f) => new RegExp(`\\b${f}\\b`).test(sent));
  });
}
