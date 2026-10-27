// Gắn ĐIỂM NGỮ PHÁP cho từng câu hỏi của một bài (questions.grammar_id) bằng AI.
// Chạy NỀN qua hàng chờ sau khi lưu bài → giáo viên không phải chờ Gemini lúc bấm Lưu.
// Chỉ đụng tới câu CHƯA gắn (grammar_id IS NULL): saveExercise giữ lại nhãn của những câu
// không đổi nội dung, nên lưu lại bài đã gắn rồi thường KHÔNG tốn thêm lượt AI nào.
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { GrammarCatalogItem } from "@msyen/shared";
import { getDb, schema, type Db } from "../db";
import type { Bindings } from "./env";
import { runAiTask } from "./ai/hub";
import { fullQuestion } from "./serialize";

/** Câu hỏi thuộc kiểu KHÔNG nhắm ngữ pháp → khỏi tốn lượt AI hỏi cho có. */
const SKIP_TYPES = new Set(["matching", "categorize"]);

/**
 * Sổ tay ngữ pháp bản GỌN để nạp vào prompt (sinh bài / sinh câu hỏi / gắn nhãn).
 * Chỉ id + tên + band + dấu hiệu → 129 dòng (v7). KHÔNG còn "không đáng kể": đo 08/2026 là
 * ~12,5k ký tự cho một prompt sinh câu hỏi. Chỗ nào biết trước điểm/cấp cần nhắm thì lọc danh
 * mục lại trước khi nạp (xem `questionsGrammarContext` ở routes/ai.ts).
 */
export async function grammarCatalog(db: Db): Promise<GrammarCatalogItem[]> {
  return db
    .select({
      id: schema.grammar.id,
      title: schema.grammar.title,
      cefr: schema.grammar.cefr,
      keywords: schema.grammar.keywords,
    })
    .from(schema.grammar)
    .orderBy(asc(schema.grammar.cefr), asc(schema.grammar.position));
}

/**
 * KHỐI GRAMMAR FOCUS cho prompt sinh bài — kéo form/dấu hiệu/lỗi thường gặp của đúng các
 * điểm ngữ pháp đã chọn, kèm RULE ép "đáp án duy nhất đúng theo ngữ cảnh".
 */
export async function grammarFocusText(db: Db, ids: string[]): Promise<string> {
  const clean = ids.filter(Boolean);
  if (!clean.length) return "";
  const rows = await db.select().from(schema.grammar).where(inArray(schema.grammar.id, clean));
  if (!rows.length) return "";
  const blocks = rows.map((g) => {
    const forms = (g.forms ?? []).map((f) => f.formula).filter(Boolean).join("  |  ");
    const signals = (g.signals ?? []).join(", ");
    const mistakes = (g.mistakes ?? []).join("; ");
    return [
      `### ${g.title} (${g.cefr})`,
      g.summary ? `- Summary: ${g.summary}` : "",
      forms ? `- Form: ${forms}` : "",
      signals ? `- Signals to INCLUDE in items so ONLY this form is correct: ${signals}` : "",
      mistakes ? `- Common learner mistakes (choice items: use them as DISTRACTORS; written items: make the sentence need the correct form): ${mistakes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "GRAMMAR FOCUS — every question must TEST these point(s) and make the target form the ONLY correct answer:",
    ...blocks,
    "RULE: each item MUST contain a signal or context that forces the target form; in choice items the distractors are other tenses/forms that are WRONG in that context — never equally-valid answers. No item may be correct under more than one form.",
  ].join("\n\n");
}

export async function tagExerciseGrammar(env: Bindings, exerciseRowId: string): Promise<number> {
  const db = getDb(env.DB);

  const [ex, catalog, untagged] = await Promise.all([
    db.query.exercises.findFirst({ where: eq(schema.exercises.id, exerciseRowId) }),
    grammarCatalog(db),
    db
      .select()
      .from(schema.questions)
      .where(and(eq(schema.questions.exerciseId, exerciseRowId), isNull(schema.questions.grammarId)))
      .orderBy(asc(schema.questions.position)),
  ]);

  if (!ex || ex.readAloud) return 0; // recording exercises have no questions
  if (!catalog.length) return 0; // chưa nạp sổ tay ngữ pháp
  const candidates = untagged.filter((q) => !SKIP_TYPES.has(q.type));
  if (!candidates.length) {
    await syncDrillItems(db, exerciseRowId); // already tagged: still refresh the drill copies
    return 0;
  }

  const out = await runAiTask<{ tags: { position: number; grammar_id?: string | null }[] }>(env, "tag_grammar", {
    title: ex.title,
    skill: ex.skill,
    level: ex.level,
    passage: ex.passage ?? ex.audioScript,
    catalog,
    questions: candidates.map((q) => ({
      position: q.position,
      type: q.type,
      question: q.question,
      options: q.options,
      // fill_blank keeps its answer in `accept`: without it the model tags a gap it cannot see filled.
      answer: q.answer ?? q.accept?.[0] ?? null,
      explanation: q.explanation,
    })),
  });

  // Chống model BỊA id: chỉ nhận id có thật trong sổ tay, và đúng câu đang cần gắn.
  const known = new Set(catalog.map((g) => g.id));
  const wanted = new Map(candidates.map((q) => [q.position, q.id]));
  let n = 0;
  for (const tag of out.tags) {
    const qid = wanted.get(tag.position);
    const gid = tag.grammar_id?.trim();
    if (!qid || !gid || !known.has(gid)) continue;
    await db.update(schema.questions).set({ grammarId: gid }).where(eq(schema.questions.id, qid));
    n++;
  }
  await syncDrillItems(db, exerciseRowId);
  return n;
}

// Question types a standalone drill card can show (no passage, no audio needed).
const DRILLABLE = new Set(["multiple_choice", "fill_blank", "ordering"]);

/**
 * Copies the grammar-tagged questions of a GRAMMAR exercise into the grammar practice bank, so a
 * teacher builds the drill pool just by writing exercises. Re-running updates the copies.
 */
export async function syncDrillItems(db: ReturnType<typeof getDb>, exerciseRowId: string): Promise<number> {
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, exerciseRowId) });
  if (!ex || ex.skill !== "grammar" || ex.deletedAt) return 0;
  const qs = await db
    .select()
    .from(schema.questions)
    .where(and(eq(schema.questions.exerciseId, exerciseRowId), isNotNull(schema.questions.grammarId)));
  const usable = qs.filter((q) => DRILLABLE.has(q.type));
  if (!usable.length) return 0;
  const points = await db.select({ id: schema.grammar.id, cefr: schema.grammar.cefr }).from(schema.grammar);
  const cefrOf = new Map(points.map((p) => [p.id, p.cefr]));
  let n = 0;
  for (const q of usable) {
    const cefr = cefrOf.get(q.grammarId!);
    if (!cefr) continue;
    const values = { grammarId: q.grammarId!, cefr, type: q.type, payload: fullQuestion(q), status: "live", source: "teacher" };
    await db
      .insert(schema.grammarItems)
      .values({ ...values, questionId: q.id })
      .onConflictDoUpdate({ target: schema.grammarItems.questionId, set: values });
    n++;
  }
  return n;
}
