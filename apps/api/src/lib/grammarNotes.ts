// Dựng danh sách ĐIỂM NGỮ PHÁP của một bài kèm ngữ cảnh bài làm (GrammarNote[]).
// Dùng chung cho: báo cáo lượt nộp /s/:id · drawer "Xem lại" · màn kết quả sau khi nộp.
// Nhãn nằm sẵn ở questions.grammar_id (AI gắn lúc lưu bài) → KHÔNG tốn lượt AI nào khi chấm.
// Trả bản GỌN thôi; web lazy-fetch chi tiết qua GET /grammar/:id khi học sinh bấm mở rộng.
import { inArray } from "drizzle-orm";
import type { GrammarNote } from "@msyen/shared";
import { schema, type Db } from "../db";

/**
 * @param questions  câu hỏi của bài (cần position + grammarId)
 * @param wrongPositions  vị trí các câu học sinh làm SAI
 * Sắp xếp: nhiều câu sai nhất lên trước → phần "cần chú ý" nằm ngay đầu.
 */
export async function grammarNotesFor(
  db: Db,
  questions: { position: number; grammarId: string | null }[],
  wrongPositions: Iterable<number>,
): Promise<GrammarNote[]> {
  const wrong = new Set(wrongPositions);
  const byGrammar = new Map<string, { positions: number[]; wrongPositions: number[] }>();
  for (const q of questions) {
    if (!q.grammarId) continue;
    const entry = byGrammar.get(q.grammarId) ?? { positions: [], wrongPositions: [] };
    entry.positions.push(q.position);
    if (wrong.has(q.position)) entry.wrongPositions.push(q.position);
    byGrammar.set(q.grammarId, entry);
  }
  if (!byGrammar.size) return [];

  const rows = await db
    .select({
      id: schema.grammar.id,
      title: schema.grammar.title,
      category: schema.grammar.category,
      cefr: schema.grammar.cefr,
      summary: schema.grammar.summary,
    })
    .from(schema.grammar)
    .where(inArray(schema.grammar.id, [...byGrammar.keys()]));

  return rows
    .map((g) => ({ ...g, ...byGrammar.get(g.id)! }))
    .sort((a, b) => b.wrongPositions.length - a.wrongPositions.length || a.positions[0] - b.positions[0]);
}
