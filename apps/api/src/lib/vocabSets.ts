// Teacher vocabulary sets: slug, item writes, word counts and AI filling of missing fields.
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { normalizeWordForCompare, type VocabItemInput } from "@msyen/shared";
import { getDb, schema } from "../db";
import { runAiTask } from "./ai/hub";
import type { Bindings } from "./env";

type Db = ReturnType<typeof getDb>;

/** URL slug from a set name; a numeric suffix keeps it unique. */
export async function uniqueSetSlug(db: Db, name: string, exceptId?: string): Promise<string> {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bo-tu";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const clash = await db
      .select({ id: schema.vocabSets.id })
      .from(schema.vocabSets)
      .where(exceptId ? and(eq(schema.vocabSets.slug, slug), ne(schema.vocabSets.id, exceptId)) : eq(schema.vocabSets.slug, slug))
      .limit(1);
    if (!clash.length) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/**
 * Text handed to TTS for a headword: editorial notation (`letter of credit (LC)`, `lean on/against`)
 * is shown but not read aloud.
 */
export function speakableWord(word: string): string {
  let t = (word || "").replace(/\([^)]*\)/g, " ");
  t = t.replace(/(\S+)\/\S+/g, "$1");
  return t.replace(/\s+/g, " ").trim() || word;
}

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
const cleanList = (v: string[] | null | undefined) => {
  const out = (v ?? []).map((s) => s.trim()).filter(Boolean);
  return out.length ? out : null;
};

/** Input → insertable row fields (shared by set items and a learner's own words). */
export function itemRow(it: VocabItemInput, position: number) {
  return {
    word: it.word.trim(),
    wordKey: normalizeWordForCompare(it.word),
    pos: clean(it.pos),
    ipa: clean(it.ipa),
    meaning: clean(it.meaning),
    example: clean(it.example),
    synonyms: cleanList(it.synonyms),
    image: clean(it.image),
    definition: clean(it.definition),
    exampleVi: clean(it.example_vi),
    cefr: clean(it.cefr),
    collocations: cleanList(it.collocations),
    family: cleanList(it.family),
    antonyms: cleanList(it.antonyms),
    note: clean(it.note),
    position,
  };
}

/** Replaces every word of a set, keeping ids of the rows that are still present. */
export async function replaceSetItems(db: Db, setId: string, items: VocabItemInput[]): Promise<number> {
  const existing = await db.select({ id: schema.vocabItems.id }).from(schema.vocabItems).where(eq(schema.vocabItems.setId, setId));
  const keep = new Set(items.map((i) => i.id).filter((id): id is string => !!id));
  const now = new Date().toISOString();
  for (const row of existing) {
    if (!keep.has(row.id)) await db.delete(schema.vocabItems).where(eq(schema.vocabItems.id, row.id));
  }
  const known = new Set(existing.map((r) => r.id));
  for (const [i, it] of items.entries()) {
    const values = itemRow(it, i);
    if (it.id && known.has(it.id)) {
      await db.update(schema.vocabItems).set({ ...values, updatedAt: now }).where(and(eq(schema.vocabItems.id, it.id), eq(schema.vocabItems.setId, setId)));
    } else {
      await db.insert(schema.vocabItems).values({ ...values, setId });
    }
  }
  return refreshSetCount(db, setId);
}

/** Recounts a set's words into vocab_sets.word_count. */
export async function refreshSetCount(db: Db, setId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.vocabItems)
    .where(and(eq(schema.vocabItems.setId, setId), isNull(schema.vocabItems.userId)));
  const n = row?.n ?? 0;
  await db.update(schema.vocabSets).set({ wordCount: n, updatedAt: new Date().toISOString() }).where(eq(schema.vocabSets.id, setId));
  return n;
}

type Filled = {
  word: string;
  pos?: string;
  ipa?: string;
  meaning?: string;
  definition?: string;
  example?: string;
  example_vi?: string;
  cefr?: string;
  synonyms?: string[];
  antonyms?: string[];
  collocations?: string[];
  family?: string[];
  note?: string;
};

const CEFR = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

/** Fields a complete entry has; an item missing any of them is sent to the AI. */
export function missingFields(it: VocabItemInput): string[] {
  const miss: string[] = [];
  if (!it.pos?.trim()) miss.push("pos");
  if (!it.ipa?.trim()) miss.push("ipa");
  if (!it.meaning?.trim()) miss.push("meaning");
  if (!it.definition?.trim()) miss.push("definition");
  if (!it.example?.trim()) miss.push("example");
  if (!it.example_vi?.trim()) miss.push("example_vi");
  if (!it.cefr) miss.push("cefr");
  if (!it.collocations?.length) miss.push("collocations");
  if (!it.family?.length) miss.push("family");
  return miss;
}

/**
 * AI fills every field of the given words (batches of 20). `overwrite` false = only empty fields are
 * filled, the teacher's own text is kept; true = the AI version replaces everything but the word.
 */
export async function aiFillItems(
  env: Bindings,
  items: VocabItemInput[],
  context?: string | null,
  opts: { overwrite?: boolean; instruction?: string | null } = {},
): Promise<VocabItemInput[]> {
  const needs = opts.overwrite ? items : items.filter((i) => missingFields(i).length);
  const filled = new Map<string, Filled>();
  for (let i = 0; i < needs.length; i += 20) {
    const words = needs.slice(i, i + 20).map((n) => n.word.trim());
    const out = await runAiTask<{ items: Filled[] }>(env, "fill_vocab", { words, context: context ?? null, instruction: opts.instruction ?? null });
    for (const f of out.items ?? []) filled.set(normalizeWordForCompare(f.word), f);
  }
  const pick = <T>(mine: T | null | undefined, theirs: T | undefined, has: (v: T) => boolean): T | null =>
    !opts.overwrite && mine != null && has(mine) ? mine : theirs ?? mine ?? null;
  const str = (v: string) => !!v.trim();
  const arr = (v: string[]) => v.length > 0;
  return items.map((it) => {
    const f = filled.get(normalizeWordForCompare(it.word));
    if (!f) return it;
    const cefr = f.cefr?.toUpperCase().trim();
    return {
      ...it,
      pos: pick(it.pos, f.pos, str),
      ipa: pick(it.ipa, f.ipa?.replace(/^\/|\/$/g, ""), str),
      meaning: pick(it.meaning, f.meaning, str),
      definition: pick(it.definition, f.definition, str),
      example: pick(it.example, f.example, str),
      example_vi: pick(it.example_vi, f.example_vi, str),
      cefr: pick(it.cefr, cefr && CEFR.has(cefr) ? (cefr as VocabItemInput["cefr"]) : undefined, (v) => !!v),
      synonyms: pick(it.synonyms, f.synonyms?.slice(0, 5), arr),
      antonyms: pick(it.antonyms, f.antonyms?.slice(0, 5), arr),
      collocations: pick(it.collocations, f.collocations?.slice(0, 6), arr),
      family: pick(it.family, f.family?.slice(0, 6), arr),
      note: pick(it.note, f.note, str),
    };
  });
}

/** Creates a set with its words (used by the AI deck job). Returns the set id. */
export async function createSetWithItems(
  db: Db,
  args: { teacherId: string | null; name: string; levelId?: string | null; description?: string | null; items: VocabItemInput[] },
): Promise<string> {
  const slug = await uniqueSetSlug(db, args.name);
  const [set] = await db
    .insert(schema.vocabSets)
    .values({ name: args.name, slug, description: args.description ?? null, levelId: args.levelId ?? null, teacherId: args.teacherId })
    .returning({ id: schema.vocabSets.id });
  await replaceSetItems(db, set.id, args.items);
  return set.id;
}
