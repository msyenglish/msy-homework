// VocabDeckConfig → VocabItem[] (assigned deck exercises and self-practice share this).
//   source=fixed  → exactly the listed vocab_items, in order
//   source=filter → the words of one set (optionally shuffled / capped)
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { VocabDeckConfig, VocabItem } from "@msyen/shared";
import { getDb, schema } from "../db";
import { inChunks } from "./bind";
import { vocabItemOut } from "./serialize";
import type { Bindings } from "./env";

/** Deterministic PRNG (mulberry32) seeded from a string hash (FNV-1a). */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let t = h >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Teacher-set words by id (learners' private words are never resolvable through a deck). */
export async function itemsByIds(db: ReturnType<typeof getDb>, ids: string[]): Promise<VocabItem[]> {
  if (!ids.length) return [];
  const rows = await inChunks(ids, (chunk) =>
    db.select().from(schema.vocabItems).where(and(inArray(schema.vocabItems.id, chunk), isNull(schema.vocabItems.userId))),
  );
  const byId = new Map(rows.map((r) => [r.id, vocabItemOut(r)]));
  return ids.map((id) => byId.get(id)).filter((x): x is VocabItem => !!x);
}

/** Words of one set, in the teacher's order. */
export async function setItems(db: ReturnType<typeof getDb>, setId: string): Promise<VocabItem[]> {
  const rows = await db
    .select()
    .from(schema.vocabItems)
    .where(eq(schema.vocabItems.setId, setId))
    .orderBy(asc(schema.vocabItems.position));
  return rows.map(vocabItemOut);
}

/**
 * `seed` pins a shuffled pick: the same seed always yields the same words. A learner's attempt at
 * an exercise passes one, so reopening the page (or another device) gets the deck the saved session
 * was built from instead of a fresh random draw that no longer matches it.
 */
export async function resolveVocabDeck(env: Bindings, cfg: VocabDeckConfig, seed?: string): Promise<VocabItem[]> {
  const db = getDb(env.DB);
  if (cfg.source === "fixed") return itemsByIds(db, cfg.wordIds ?? []);
  const setId = cfg.filter?.setId;
  if (!setId) return [];
  let items = await setItems(db, setId);
  if (cfg.filter?.shuffle) items = shuffle(items, seed ? seededRandom(seed) : Math.random);
  return cfg.filter?.count ? items.slice(0, cfg.filter.count) : items;
}
