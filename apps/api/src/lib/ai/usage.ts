// ============================================================
//  Nhật ký lượt gọi AI → bảng ai_usage. Nguồn số liệu cho tab "Chi phí" ở /teacher/ai.
//  NGUYÊN TẮC: ghi log KHÔNG BAO GIỜ được làm hỏng request AI — mọi lỗi ở đây chỉ
//  console.error rồi nuốt.
// ============================================================
import { and, desc, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";
import { costOf, costWith, type ModelInfo, type ProviderId } from "./models";

export type UsageRow = {
  task: string;
  provider: ProviderId;
  model: string;
  /** Catalog entry used for pricing — required for runtime models (OpenRouter) that
   *  `costOf` cannot look up by id. */
  modelInfo?: ModelInfo;
  /** Real charge reported by the provider — wins over the list-price estimate when present. */
  costUsd?: number;
  keyId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  ok: boolean;
  error?: string | null;
};

/** Ghi 1 dòng nhật ký. Chi phí CHỤP tại đây theo giá catalog hiện hành (không tính lúc đọc). */
export async function logUsage(db: Db, row: UsageRow): Promise<void> {
  try {
    const inputTokens = row.inputTokens ?? 0;
    const outputTokens = row.outputTokens ?? 0;
    await db.insert(schema.aiUsage).values({
      task: row.task,
      provider: row.provider,
      model: row.model,
      keyId: row.keyId ?? null,
      inputTokens,
      outputTokens,
      costUsd:
        row.costUsd ??
        (row.modelInfo
          ? costWith(row.modelInfo, inputTokens, outputTokens)
          : costOf(row.model, inputTokens, outputTokens)),
      latencyMs: row.latencyMs ?? null,
      ok: row.ok,
      error: row.error ? row.error.slice(0, 200) : null,
    });
  } catch (e) {
    console.error("[ai/usage] ghi nhật ký lỗi (bỏ qua):", (e as Error).message);
  }
}

/** Xoá nhật ký cũ hơn `days` ngày — gọi từ cron auto-feedback. */
export async function pruneUsage(db: Db, days = 180): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const res = await db.delete(schema.aiUsage).where(lte(schema.aiUsage.createdAt, cutoff));
    return (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  } catch (e) {
    console.error("[ai/usage] dọn nhật ký lỗi (bỏ qua):", (e as Error).message);
    return 0;
  }
}

export type UsageSummary = {
  total: { calls: number; inputTokens: number; outputTokens: number; costUsd: number; failed: number };
  byTask: { task: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number; failed: number }[];
  byModel: { provider: string; model: string; calls: number; costUsd: number; failed: number }[];
  recentErrors: { id: string; createdAt: string; task: string; provider: string; model: string; error: string | null }[];
};

/** Tổng hợp cho tab "Chi phí". `from`/`to` là ISO date (bao gồm cả 2 đầu). */
export async function usageSummary(db: Db, from: string, to: string): Promise<UsageSummary> {
  const range = and(gte(schema.aiUsage.createdAt, from), lte(schema.aiUsage.createdAt, to));
  const failedSql = sql<number>`sum(case when ${schema.aiUsage.ok} = 0 then 1 else 0 end)`;

  const [totalRow] = await db
    .select({
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)`,
      failed: sql<number>`coalesce(${failedSql}, 0)`,
    })
    .from(schema.aiUsage)
    .where(range);

  const byTask = await db
    .select({
      task: schema.aiUsage.task,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsage.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsage.outputTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)`,
      failed: sql<number>`coalesce(${failedSql}, 0)`,
    })
    .from(schema.aiUsage)
    .where(range)
    .groupBy(schema.aiUsage.task)
    .orderBy(desc(sql`sum(${schema.aiUsage.costUsd})`));

  const byModel = await db
    .select({
      provider: schema.aiUsage.provider,
      model: schema.aiUsage.model,
      calls: sql<number>`count(*)`,
      costUsd: sql<number>`coalesce(sum(${schema.aiUsage.costUsd}), 0)`,
      failed: sql<number>`coalesce(${failedSql}, 0)`,
    })
    .from(schema.aiUsage)
    .where(range)
    .groupBy(schema.aiUsage.provider, schema.aiUsage.model)
    .orderBy(desc(sql`sum(${schema.aiUsage.costUsd})`));

  const recentErrors = await db
    .select({
      id: schema.aiUsage.id,
      createdAt: schema.aiUsage.createdAt,
      task: schema.aiUsage.task,
      provider: schema.aiUsage.provider,
      model: schema.aiUsage.model,
      error: schema.aiUsage.error,
    })
    .from(schema.aiUsage)
    .where(and(range, sql`${schema.aiUsage.ok} = 0`))
    .orderBy(desc(schema.aiUsage.createdAt))
    .limit(20);

  return {
    total: totalRow ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, failed: 0 },
    byTask,
    byModel,
    recentErrors,
  };
}

/** Deletes failed calls — one by id, or every failure since `from` — so fixed problems leave the log. */
export async function clearUsageErrors(db: Db, opts: { id?: string; from?: string }): Promise<number> {
  const where = and(
    sql`${schema.aiUsage.ok} = 0`,
    opts.id ? sql`${schema.aiUsage.id} = ${opts.id}` : undefined,
    opts.from ? gte(schema.aiUsage.createdAt, opts.from) : undefined,
  );
  const res = await db.delete(schema.aiUsage).where(where);
  return res.meta?.changes ?? 0;
}
