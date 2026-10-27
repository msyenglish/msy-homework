// ============================================================
//  Model registry (D1 `ai_models`) — the models tasks can be routed to.
//  Seeded with DEFAULT_MODELS the first time it is read; after that the teacher owns the list.
// ============================================================
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";
import { DEFAULT_MODELS, isProviderId, PROVIDER_IDS, type ModelInfo } from "./models";

const SEEDED_KEY = "ai_models_seeded";

type ModelRow = typeof schema.aiModels.$inferSelect;

const toInfo = (r: ModelRow): ModelInfo | null =>
  isProviderId(r.provider)
    ? {
        id: r.modelId,
        provider: r.provider,
        label: r.label,
        inPrice: r.inPrice,
        outPrice: r.outPrice,
        audio: r.audio,
        jsonSchema: r.jsonSchema,
        free: r.free,
        note: r.note ?? undefined,
      }
    : null;

const toRow = (m: ModelInfo) => ({
  provider: m.provider,
  modelId: m.id,
  label: m.label,
  inPrice: m.inPrice,
  outPrice: m.outPrice,
  audio: m.audio,
  jsonSchema: m.jsonSchema,
  free: m.free,
  note: m.note ?? null,
});

/** Inserts the given models, skipping ones already present. Small batches (D1 bind-param cap). */
export async function insertModels(db: Db, models: ModelInfo[]): Promise<void> {
  for (let i = 0; i < models.length; i += 8) {
    await db.insert(schema.aiModels).values(models.slice(i, i + 8).map(toRow)).onConflictDoNothing();
  }
}

/** All registered models, provider order then insertion order. Seeds the defaults on first use. */
export async function listModels(db: Db): Promise<ModelInfo[]> {
  let rows = await db.select().from(schema.aiModels);
  if (!rows.length) {
    const [flag] = await db.select().from(schema.settings).where(eq(schema.settings.key, SEEDED_KEY));
    if (!flag) {
      await insertModels(db, DEFAULT_MODELS);
      await db.insert(schema.settings).values({ key: SEEDED_KEY, value: "1" }).onConflictDoNothing();
      rows = await db.select().from(schema.aiModels);
    }
  }
  const order = (p: string) => PROVIDER_IDS.indexOf(p as (typeof PROVIDER_IDS)[number]);
  return rows
    .sort((a, b) => order(a.provider) - order(b.provider) || a.createdAt.localeCompare(b.createdAt) || a.inPrice - b.inPrice)
    .map(toInfo)
    .filter((m): m is ModelInfo => !!m);
}

export async function upsertModel(db: Db, m: ModelInfo): Promise<void> {
  const row = toRow(m);
  await db
    .insert(schema.aiModels)
    .values(row)
    .onConflictDoUpdate({
      target: [schema.aiModels.provider, schema.aiModels.modelId],
      set: { label: row.label, inPrice: row.inPrice, outPrice: row.outPrice, audio: row.audio, jsonSchema: row.jsonSchema, free: row.free, note: row.note },
    });
}
