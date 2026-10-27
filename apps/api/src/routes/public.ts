// ============================================================
//  Route CÔNG KHAI — KHÔNG cần đăng nhập, KHÔNG có danh tính.
//  Khu học sinh cũ (passcode + bảng `students`) đã nghỉ hưu: mọi endpoint làm bài/chấm/
//  lịch sử nay nằm ở routes/library.ts (định danh bằng cookie user).
//  Còn lại đúng hai nhóm: link báo cáo gửi phụ huynh, và dữ liệu tra cứu chung.
// ============================================================
import { Hono } from "hono";
import { asc, eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { stripWordTag } from "@msyen/shared";
import { getDb, schema } from "../db";
import { grammarListOut, grammarOut, levelOut, topicOut } from "../lib/serialize";
import { pronounceVoiceFor, synthesizeSpeech } from "../lib/media";
import { fileUrl } from "../lib/files";
import { enforceRateLimit } from "../lib/rateLimit";
import { requireAnyAuth } from "../middleware/anyAuth";
import type { AppEnv } from "../lib/env";
import { speakableWord } from "../lib/vocabSets";

const pub = new Hono<AppEnv>();


/**
 * Báo cáo học tập tháng — link công khai gửi phụ huynh (id là UUID không đoán được).
 * Chỉ trả nội dung báo cáo, không lộ dữ liệu khác của học sinh.
 */
pub.get("/reports/:key", async (c) => {
  const db = getDb(c.env.DB);
  const key = c.req.param("key");
  // LEFT join cả hai bảng danh tính: báo cáo mới gắn `user_id`, báo cáo cũ gắn `student_id`.
  const [row] = await db
    .select({
      sName: schema.students.name,
      uName: schema.users.name,
      month: schema.reports.month,
      content: schema.reports.content,
      stats: schema.reports.stats,
      updatedAt: schema.reports.updatedAt,
    })
    .from(schema.reports)
    .leftJoin(schema.students, eq(schema.reports.studentId, schema.students.id))
    .leftJoin(schema.users, eq(schema.reports.userId, schema.users.id))
    // Ưu tiên khớp slug đẹp; vẫn chấp nhận id cũ để link cũ không hỏng.
    .where(or(eq(schema.reports.slug, key), eq(schema.reports.id, key)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy báo cáo" });
  // KHÔNG lộ email: trang này ai có link cũng xem được (gửi phụ huynh).
  const { sName, uName, ...rest } = row;
  return c.json({ ...rest, studentName: sName ?? uName ?? "Học sinh" });
});


/** Danh sách cấp độ công khai — cho user tự đăng ký chọn level (không lộ dữ liệu nhạy cảm). */
pub.get("/levels", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.levels)
    .orderBy(asc(schema.levels.position), asc(schema.levels.createdAt));
  return c.json({ items: rows.map(levelOut) });
});

/** Danh sách chủ đề công khai — cho user tự đăng ký chọn chủ đề quan tâm. */
pub.get("/topics", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.topics)
    .orderBy(asc(schema.topics.position), asc(schema.topics.createdAt));
  return c.json({ items: rows.map(topicOut) });
});

/**
 * Sổ tay ngữ pháp công khai — DANH SÁCH bản gọn (cho /u/grammar và picker của GV).
 * Chỉ select field cần để lọc/tìm/hiện card: bản đầy đủ 86 điểm nặng 244 KB mà danh sách
 * chỉ vẽ tiêu đề + tóm tắt. Mở một mục → web lazy-fetch `GET /grammar/:id`.
 * Bắt đăng nhập (user hoặc GV) — cả hai nơi gọi endpoint này đều đã đăng nhập.
 */
pub.get("/grammar", requireAnyAuth, async (c) => {
  await enforceRateLimit(c, c.env.RL_DATA, "grammar");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.grammar.id,
      title: schema.grammar.title,
      category: schema.grammar.category,
      cefr: schema.grammar.cefr,
      summary: schema.grammar.summary,
      signals: schema.grammar.signals,
      keywords: schema.grammar.keywords,
      drillTypes: schema.grammar.drillTypes,
      position: schema.grammar.position,
    })
    .from(schema.grammar)
    .orderBy(asc(schema.grammar.position), asc(schema.grammar.createdAt));
  return c.json({ items: rows.map(grammarListOut) });
});

/**
 * GRAMMAR MAP — the handbook as a graph: one node per point, edges from `related`.
 * Deliberately NOT folded into `GET /grammar`: that list is drawn on every handbook visit and
 * `related` is dead weight there. Registered BEFORE `/grammar/:id` or the param route eats "map".
 * `compare` ships as a count only — the decision chart lazy-fetches the full point when opened.
 */
pub.get("/grammar/map", requireAnyAuth, async (c) => {
  await enforceRateLimit(c, c.env.RL_DATA, "grammar");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.grammar.id,
      title: schema.grammar.title,
      category: schema.grammar.category,
      cefr: schema.grammar.cefr,
      position: schema.grammar.position,
      related: schema.grammar.related,
      compare: schema.grammar.compare,
    })
    .from(schema.grammar)
    .orderBy(asc(schema.grammar.position), asc(schema.grammar.createdAt));
  const ids = new Set(rows.map((r) => r.id));
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      cefr: r.cefr,
      position: r.position,
      // Keep only edges pointing at a point that actually exists (legacy rows hold stale slugs).
      related: (r.related ?? []).filter((x) => ids.has(x)),
      compare_count: (r.compare ?? []).length,
    })),
  });
});

/**
 * ONE grammar point — reports and review screens lazy-fetch it when an entry is expanded.
 * A cookie-less public GET, so the edge cache is shared across every report (see Gotcha #4);
 * report payloads therefore only carry the slim GrammarNote instead of the whole handbook.
 * NO login required here (unlike /grammar): the public report pages /r/:id and /s/:id — which
 * parents and students open without an account — lazy-fetch this via GrammarNotes.
 * Rate-limited only, to stop rapid scraping.
 */
pub.get("/grammar/:id", async (c) => {
  await enforceRateLimit(c, c.env.RL_DATA, "grammar");
  const db = getDb(c.env.DB);
  const row = await db.query.grammar.findFirst({ where: eq(schema.grammar.id, c.req.param("id")) });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy điểm ngữ pháp này" });
  return c.json(grammarOut(row));
});

/**
 * Nghe phát âm MỘT từ (TTS on-demand) — không danh tính, cache theo hash từ+giọng trên R2.
 * Dùng chung ở mọi nơi có tooltip từ (thư viện user, báo cáo công khai).
 */
pub.post("/word/speak", async (c) => {
  await enforceRateLimit(c, c.env.RL_SPEAK, "speak");
  const body = (await c.req.json().catch(() => ({}))) as { word?: unknown; gender?: unknown };
  const raw = typeof body.word === "string" ? body.word : "";
  // Strip editorial notation before validating: headwords like `letter of credit (LC)` or
  // `lean on/against` otherwise fail the character check below and the card falls silent.
  const word = speakableWord((stripWordTag(raw) || raw).trim());
  // CỤM TỪ cũng là một mục từ vựng hợp lệ ("construction site", "carry out") — chặn khoảng trắng
  // làm mọi thẻ cụm câm tiếng (fallback khi chưa pre-gen audio). Vẫn giữ vòng vây chặt vì endpoint
  // này KHÔNG cần đăng nhập: chỉ chữ cái + nháy + gạch nối + khoảng trắng, tối đa 60 ký tự.
  if (!word || word.length > 60 || !/^[A-Za-z][A-Za-z'’\- ]*$/.test(word)) {
    throw new HTTPException(400, { message: "Từ không hợp lệ" });
  }
  const voice = await pronounceVoiceFor(c.env, body.gender === "male" ? "male" : "female");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${word.toLowerCase()}|${voice}`));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `tts/word/${hash}.mp3`;
  if (!(await c.env.AUDIO.head(key))) {
    const { bytes, contentType } = await synthesizeSpeech(c.env, { text: word, voice });
    await c.env.AUDIO.put(key, bytes, { httpMetadata: { contentType } });
  }
  return c.json({ url: fileUrl(key) });
});

export default pub;
