// ============================================================
//  Bảng xếp hạng ĐIỂM ẢO của user công khai theo kỳ (tuần/tháng/quý/năm).
//  Tính TRỰC TIẾP từ submissions (best-per-exercise × POINTS_PER_CORRECT),
//  lọc theo submittedAt trong kỳ — dùng index (user_id, submitted_at).
//  Không có bảng tổng hợp: dữ liệu luôn chính xác, đủ nhanh ở quy mô lớp.
// ============================================================
import { and, gte, isNotNull, lt } from "drizzle-orm";
import { anonAlias, pointScopeKey, quizPoints, recordPoints, type Level } from "@msyen/shared";
import { schema, type Db } from "../db";
import { levelOut } from "./serialize";

// Kỳ HIỆN TẠI (mốc bắt đầu → nay) + kỳ TRƯỚC (quá khứ, 1 khoảng đóng) + tất cả.
export const LEADERBOARD_PERIODS = [
  "week", "month", "quarter", "year", "all",
  "last_week", "last_month", "last_quarter", "last_year",
] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

/** Ép period từ query/body về giá trị hợp lệ; mặc định "month". */
export function parsePeriod(v: string | null | undefined): LeaderboardPeriod {
  return (LEADERBOARD_PERIODS as readonly string[]).includes(v ?? "") ? (v as LeaderboardPeriod) : "month";
}

// Giờ VN = UTC+7. submittedAt lưu UTC ISO → quy mốc kỳ theo VN rồi đổi lại UTC.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

type BaseKind = "week" | "month" | "quarter" | "year";

/** Mốc bắt đầu kỳ (theo lịch VN) của `kind` chứa thời điểm `now`, trả về ms UTC. */
function baseStartUtcMs(kind: BaseKind, now: Date): number {
  const vn = new Date(now.getTime() + VN_OFFSET_MS); // coi các field UTC như giờ VN
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();
  let startVnMs: number;
  if (kind === "year") startVnMs = Date.UTC(y, 0, 1);
  else if (kind === "quarter") startVnMs = Date.UTC(y, Math.floor(m / 3) * 3, 1);
  else if (kind === "month") startVnMs = Date.UTC(y, m, 1);
  else {
    // week: về thứ Hai đầu tuần
    const dow = vn.getUTCDay(); // 0=CN … 6=T7
    const diff = (dow + 6) % 7; // số ngày kể từ thứ Hai
    startVnMs = Date.UTC(y, m, d - diff);
  }
  return startVnMs - VN_OFFSET_MS;
}

/**
 * Khoảng thời gian của kỳ dạng ISO UTC: `[start, end)`.
 * - Kỳ hiện tại (week/month/…): start = đầu kỳ, end = null (đến hiện tại).
 * - Kỳ trước (last_*): [đầu kỳ trước, đầu kỳ hiện tại) — 1 khoảng đóng.
 * - all: {null, null} (không lọc thời gian).
 */
export function periodBounds(period: LeaderboardPeriod, now: Date): { start: string | null; end: string | null } {
  if (period === "all") return { start: null, end: null };
  const last = period.match(/^last_(week|month|quarter|year)$/);
  if (last) {
    const kind = last[1] as BaseKind;
    const curStart = baseStartUtcMs(kind, now);
    // 1ms trước đầu kỳ hiện tại rơi vào kỳ trước → tính đầu kỳ trước.
    const prevStart = baseStartUtcMs(kind, new Date(curStart - 1));
    return { start: new Date(prevStart).toISOString(), end: new Date(curStart).toISOString() };
  }
  return { start: new Date(baseStartUtcMs(period as BaseKind, now)).toISOString(), end: null };
}

export interface LeaderboardEntry {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  level: Level | null;
  points: number;
  exercises_done: number;
  accuracy: number; // % đúng trung bình trên các bài đã làm (best-per-exercise), 0-100
  rank: number;
}

/**
 * Ẩn danh khi hiển thị BXH:
 * - `viewerId`: id người đang xem — em bật ẩn danh vẫn thấy TÊN THẬT của chính mình.
 * - `reveal`: true = không ẩn danh gì cả (view giáo viên, cô luôn thấy tên thật ai cũng vậy).
 */
export interface LeaderboardView {
  viewerId?: string | null;
  reveal?: boolean;
}

/** A ranked row before the viewer's anonymity rules are applied. */
type RankedRow = LeaderboardEntry & { anonymous: boolean };

// "All time" reads every submission ever made, and the learner dashboard asks for it on every
// visit (for the rank). Kept per Worker isolate for a few minutes; shorter periods are cheap.
const ALL_TIME_TTL_MS = 5 * 60 * 1000;
let allTimeCache: { at: number; rows: RankedRow[] } | null = null;

/** Xếp hạng user công khai theo điểm trong kỳ (chỉ tính tài khoản đang hoạt động, có điểm > 0). */
export async function getLeaderboard(
  db: Db,
  period: LeaderboardPeriod,
  now: Date,
  view: LeaderboardView = {},
): Promise<LeaderboardEntry[]> {
  let rows: RankedRow[];
  if (period === "all" && allTimeCache && now.getTime() - allTimeCache.at < ALL_TIME_TTL_MS) {
    rows = allTimeCache.rows;
  } else {
    rows = await rankUsers(db, period, now);
    if (period === "all") allTimeCache = { at: now.getTime(), rows };
  }
  // Ẩn danh với NGƯỜI KHÁC: thay tên bằng biệt danh con vật + bỏ avatar (ảnh Google lộ mặt).
  // Avatar null → fallback DiceBear theo seed id, không định danh được em.
  return rows.map(({ anonymous, ...e }) =>
    !view.reveal && anonymous && e.user_id !== view.viewerId ? { ...e, name: anonAlias(e.user_id), avatar_url: null } : e,
  );
}

async function rankUsers(db: Db, period: LeaderboardPeriod, now: Date): Promise<RankedRow[]> {
  const { start, end } = periodBounds(period, now);
  // Cùng bộ lọc kỳ cho cả 3 bảng nộp (quiz · đọc-to · nói) — MỌI bài đều tính điểm như nhau.
  const rangeConds = (col: Parameters<typeof gte>[0]) => {
    const cs = [];
    if (start) cs.push(gte(col, start));
    if (end) cs.push(lt(col, end));
    return cs;
  };

  const [subs, reads, vocabs, users, levels, writes, grammars] = await Promise.all([
    db
      .select({
        userId: schema.submissions.userId,
        exerciseId: schema.submissions.exerciseId,
        score: schema.submissions.score,
        total: schema.submissions.total,
        hintUsed: schema.submissions.hintUsed,
        points: schema.submissions.points,
      })
      .from(schema.submissions)
      .where(and(isNotNull(schema.submissions.userId), ...rangeConds(schema.submissions.submittedAt))),
    db
      .select({
        userId: schema.readingSubmissions.userId,
        exerciseId: schema.readingSubmissions.exerciseId,
        score: schema.readingSubmissions.pronScore,
        points: schema.readingSubmissions.points,
        audioKey: schema.readingSubmissions.audioKey,
      })
      .from(schema.readingSubmissions)
      .where(and(isNotNull(schema.readingSubmissions.userId), ...rangeConds(schema.readingSubmissions.submittedAt))),
    // Vocabulary — self-practice AND assigned decks. `points` is MEMORY PROGRESS (see
    // shared/points.ts), which cannot repeat, so best-per-exercise does not apply here.
    //
    // `result` (the whole VocabDeckResult) is deliberately NOT selected here. This query spans
    // EVERY learner, so pulling one JSON blob per session is the one place in the app whose cost
    // grows with the whole user base at once. Accuracy therefore comes from the stored
    // `score`/`total` instead of `vocabGradedScore`, which means a session's flashcard-only words
    // count towards accuracy here (they never count towards POINTS, and points decide the ranking).
    db
      .select({
        id: schema.vocabSubmissions.id,
        userId: schema.vocabSubmissions.userId,
        exerciseId: schema.vocabSubmissions.exerciseId,
        points: schema.vocabSubmissions.points,
        score: schema.vocabSubmissions.score,
        total: schema.vocabSubmissions.total,
      })
      .from(schema.vocabSubmissions)
      .where(and(isNotNull(schema.vocabSubmissions.userId), ...rangeConds(schema.vocabSubmissions.submittedAt))),
    // Named columns, not the row: `SELECT *` here dragged every `password_hash` and `google_sub`
    // in the database into a ranking computation.
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        avatarUrl: schema.users.avatarUrl,
        levelId: schema.users.levelId,
        active: schema.users.active,
        anonymous: schema.users.anonymous,
      })
      .from(schema.users),
    db.select().from(schema.levels),
    // Bài VIẾT: chấm bằng LLM, thang /100 như bài nói → quy điểm cùng recordPoints.
    db
      .select({
        userId: schema.writingSubmissions.userId,
        exerciseId: schema.writingSubmissions.exerciseId,
        score: schema.writingSubmissions.overallScore,
      })
      .from(schema.writingSubmissions)
      .where(and(isNotNull(schema.writingSubmissions.userId), ...rangeConds(schema.writingSubmissions.submittedAt))),
    // Grammar drills. `points` is memory progress (first clears + on-time reviews + tiers), which
    // cannot repeat, so the key is the SUBMISSION — best-per-exercise would swallow later sessions.
    db
      .select({
        id: schema.grammarSubmissions.id,
        userId: schema.grammarSubmissions.userId,
        points: schema.grammarSubmissions.points,
        correct: schema.grammarSubmissions.correct,
        total: schema.grammarSubmissions.total,
      })
      .from(schema.grammarSubmissions)
      .where(and(...rangeConds(schema.grammarSubmissions.submittedAt))),
  ]);

  const levelById = new Map<string, Level>(levels.map((l) => [l.id, levelOut(l)]));

  // best-per-exercise theo từng user (làm lại không cộng thêm). Giữ điểm CAO NHẤT mỗi bài;
  // `points` đã quy đổi theo loại (quiz vs record), `corr/tot` để tính % đúng trung bình
  // (record: quy về thang /100). Bài id là duy nhất nên 3 nguồn không đụng key nhau.
  const bestByUser = new Map<string, Map<string, { points: number; corr: number; tot: number }>>();
  const add = (userId: string | null, exId: string, points: number, corr: number, tot: number) => {
    if (!userId) return;
    const perEx = bestByUser.get(userId) ?? new Map<string, { points: number; corr: number; tot: number }>();
    const cur = perEx.get(exId);
    if (!cur || points > cur.points) perEx.set(exId, { points, corr, tot });
    bestByUser.set(userId, perEx);
  };
  for (const s of subs) add(s.userId, s.exerciseId, s.points ?? quizPoints(s.score, !!s.hintUsed), s.score, s.total);
  for (const r of reads) add(r.userId, pointScopeKey(r.exerciseId, r.audioKey), r.points ?? recordPoints(r.score), r.score, 100);
  for (const r of writes) add(r.userId, r.exerciseId, recordPoints(r.score), r.score, 100);
  for (const v of vocabs) {
    const tot = v.total ?? 0;
    if (tot <= 0) continue;
    const corr = Math.round(((v.score ?? 0) / 100) * tot);
    // Keyed per SUBMISSION, not per exercise: each session adds exactly the memory it moved.
    // Sessions predating the `points` column keep the old rule (assigned decks scored, self-practice
    // free) — 2 rows in production, and no new ones can appear.
    const pts = v.points ?? (v.exerciseId ? quizPoints(corr) : 0);
    add(v.userId, `vocab:${v.id}`, pts, corr, tot);
  }
  for (const g of grammars) add(g.userId, `grammar:${g.id}`, g.points, g.correct, g.total);

  const rows = users
    .filter((u) => u.active) // tài khoản bị tạm khóa không lên bảng
    .map((u) => {
      const perEx = bestByUser.get(u.id);
      let points = 0;
      let sumCorrect = 0;
      let sumTotal = 0;
      if (perEx)
        for (const b of perEx.values()) {
          points += b.points;
          sumCorrect += b.corr;
          sumTotal += b.tot;
        }
      return {
        user_id: u.id,
        name: u.name ?? null,
        avatar_url: u.avatarUrl ?? null,
        anonymous: !!u.anonymous,
        level: u.levelId ? (levelById.get(u.levelId) ?? null) : null,
        points,
        exercises_done: perEx ? perEx.size : 0,
        accuracy: sumTotal > 0 ? Math.round((sumCorrect / sumTotal) * 100) : 0,
      };
    })
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points || b.exercises_done - a.exercises_done);

  // Xếp hạng kiểu thi đấu: cùng điểm → cùng hạng, hạng kế nhảy bậc.
  let rank = 0;
  let seen = 0;
  let prev = Number.NaN;
  return rows.map((e) => {
    seen++;
    if (e.points !== prev) {
      rank = seen;
      prev = e.points;
    }
    return { ...e, rank };
  });
}
