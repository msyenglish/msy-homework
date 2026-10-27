// ============================================================
//  Thư viện CÔNG KHAI cho user tự đăng ký (public self-serve).
//  Guard bằng requireUser (cookie msyen_user) — KHÔNG assignment-gated như học sinh.
//  Nội dung lọc theo LEVEL user tự chọn (users.levelId → levels.name → exercises.level).
//  GẠN GIỌT: mỗi ngày chỉ mở dần một số bài (engine ở lib/learningPath.ts) —
//  gate "đã mở" áp cả khi xem đề lẫn khi nộp.
//  v1: chỉ bài quiz (read_aloud là non-goal).
// ============================================================
import { Hono } from "hono";
import { and, asc, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  CEFR_GROUP,
  cefrOfLevelName,
  checkDictation,
  collectWeakPhonemes,
  readingPace,
  correctAnswerText,
  dictationHint,
  dictationHintCap,
  DICTATION_HINT_MAX,
  type Cefr,
  gradeSubmission,
  publicSegment,
  dictationLessonMax,
  dictationPoints,
  quizPoints,
  quizPointsFromDetails,
  recordPoints,
  shadowLessonMax,
  shadowPoints,
  videoDictBlanks,
  WEAK_PRON_SCORE,
  pointsToLevel,
  targetWordsOf,
  UNLOCK_PASS_PCT,
  vocabGradedScore,
  type AzureSegment,
  type LibraryItem,
  type LibraryMeta,
  type PublicExercise,
  type PublicVideoLesson,
  type VideoMode,
  type VideoShadowDetail,
  type VideoSegment,
} from "@msyen/shared";
import { getDb, schema, type Db } from "../db";
import { inChunks } from "../lib/bind";
import { resolveVocabDeck } from "../lib/vocabResolve";
import { buildAssignQueue, ENFORCE_LOCK } from "../lib/assignQueue";
import { wordlistItems } from "../lib/wordlistResolve";
import { publicQuestion } from "../lib/serialize";
import { dictationPublicFields } from "../lib/dictation";
import { membershipActive } from "../lib/classMembership";
import { topUpUnlocks, vnDateStr } from "../lib/learningPath";
import { getLeaderboard, parsePeriod } from "../lib/leaderboard";
import { getUserAnalytics } from "../lib/analytics";
import { resolveFeedbackGrant } from "../lib/feedbackGrant";
import { generateReadingFeedback } from "../lib/recordFeedback";
import { assessPronunciation } from "../lib/media";
import { recordVideoShadow, videoAudioKey } from "../lib/videoShadow";
import { getDictationProgress, recordDictationCheck, recordDictationHint, recordDictationReveal } from "../lib/videoDictation";
import { buildReadingResult, buildWritingResult } from "../lib/recordResult";
import { newReadingRecKey, recExt } from "../lib/files";
import type { VideoDictLevel } from "@msyen/shared";
import type { AppEnv } from "../lib/env";
import { runAiTask } from "../lib/ai/hub";

/** Upload cap for one learner recording. */
const MAX_RECORD_BYTES = 5 * 1024 * 1024;
/** Cap on the raw Azure results posted with a browser-scored take. */
const MAX_SEGMENTS_BYTES = 2 * 1024 * 1024;

const library = new Hono<AppEnv>();

// Bảng xếp hạng điểm (public user xem) — kèm hạng của chính mình (me).
// POST để tránh edge-cache (Gotcha #4); period ở body.
library.post("/leaderboard", async (c) => {
  const { id: userId } = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as { period?: string };
  const period = parsePeriod(body.period);
  // viewerId = chính em → em luôn thấy tên thật của mình; người khác bật ẩn danh thì bị che.
  const items = await getLeaderboard(getDb(c.env.DB), period, new Date(), { viewerId: userId });
  const me = items.find((e) => e.user_id === userId) ?? null;
  return c.json({ period, items, me });
});

// Phân tích quá trình học của CHÍNH user (dashboard tiến độ). POST → tránh edge-cache.
library.post("/analytics", async (c) => {
  const { id: userId } = c.get("user");
  const data = await getUserAnalytics(getDb(c.env.DB), userId, new Date());
  if (!data) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });
  return c.json(data);
});

type ExerciseRow = typeof schema.exercises.$inferSelect;

/**
 * The columns a library CARD needs — everything the listing endpoints select.
 *
 * Deliberately WITHOUT the heavy JSON blobs. Across the published bank they weigh
 * `video_segments` 13.9 MB, `audio_cues` 3.0 MB, `passage_ipa` 1.9 MB, and Drizzle JSON-parses every
 * row it selects, so `SELECT *` made one library load read ~7 MB to render a grid of titles.
 * `segCount` stands in for `video_segments`: the card only ever wanted its length.
 * `passage` stays — the read-aloud card prints an exact word count, and counting words in SQL would
 * miscount newlines and repeated spaces.
 */
const cardCols = {
  id: schema.exercises.id,
  exerciseId: schema.exercises.exerciseId,
  title: schema.exercises.title,
  skill: schema.exercises.skill,
  level: schema.exercises.level,
  topicId: schema.exercises.topicId,
  image: schema.exercises.image,
  readAloud: schema.exercises.readAloud,
  speakingPrompt: schema.exercises.speakingPrompt,
  video: schema.exercises.video,
  youtubeId: schema.exercises.youtubeId,
  videoModes: schema.exercises.videoModes,
  vocabDeck: schema.exercises.vocabDeck,
  passage: schema.exercises.passage,
  // Decides the renderer, and therefore what the card has to ask before opening the exercise
  // (grammar_translate picks a hint rung in a modal first).
  templateId: schema.exercises.templateId,
  translateLevel: schema.exercises.translateLevel,
  segCount: sql<number>`coalesce(json_array_length(${schema.exercises.videoSegments}), 0)`,
} as const;

type CardRow = Pick<
  ExerciseRow,
  | "id"
  | "exerciseId"
  | "title"
  | "skill"
  | "level"
  | "topicId"
  | "image"
  | "readAloud"
  | "speakingPrompt"
  | "video"
  | "youtubeId"
  | "videoModes"
  | "vocabDeck"
  | "passage"
  | "templateId"
  | "translateLevel"
> & { segCount: number };

/**
 * Bài cô GIAO cho các lớp mà user này đang học — CỬA RIÊNG, bỏ qua mọi luật thư viện
 * (level · chủ đề · phạm vi nhãn · gạn giọt). Cô đã chủ động giao thì em phải làm được
 * ngay, kể cả bài ngoài cấp độ hoặc mang nhãn scope="student".
 *
 * Vẫn bắt buộc `published`: bài đang soạn dở thì không ai làm được, kể cả được giao.
 * Trả theo thứ tự MỚI GIAO TRƯỚC — bài cô vừa giao là thứ em cần thấy đầu tiên.
 */
export async function assignedExercises(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<(CardRow & { assignedAt: string })[]> {
  // Two sources of assignment: the learner's CLASS, and exercises assigned to them directly.
  const [byClass, byUser] = await Promise.all([
    db
      .select({ ex: cardCols, assignedAt: schema.classAssignments.assignedAt, position: schema.classAssignments.position })
      .from(schema.classMembers)
      .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
      .innerJoin(schema.classAssignments, eq(schema.classAssignments.classId, schema.classes.id))
      .innerJoin(schema.exercises, eq(schema.classAssignments.exerciseId, schema.exercises.id))
      .where(
        and(
          eq(schema.classMembers.userId, userId),
          membershipActive(),
          eq(schema.exercises.published, true),
        ),
      ),
    db
      .select({ ex: cardCols, assignedAt: schema.userAssignments.assignedAt, position: schema.userAssignments.position })
      .from(schema.userAssignments)
      .innerJoin(schema.exercises, eq(schema.userAssignments.exerciseId, schema.exercises.id))
      .where(and(eq(schema.userAssignments.userId, userId), eq(schema.exercises.published, true))),
  ]);

  // Gộp hai nguồn; trùng (vừa của lớp vừa giao riêng) → chỉ hiện một lần.
  // THỨ TỰ LỘ TRÌNH: position cô xếp trước, bài chưa xếp (NULL) xếp sau theo ngày giao cũ→mới.
  // Đây là thứ tự mà hàng chờ trượt dựa vào để mở dần — xem lib/assignQueue.ts.
  const seen = new Set<string>();
  const out: (CardRow & { assignedAt: string; position: number | null })[] = [];
  const ordered = [...byClass, ...byUser].sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.assignedAt.localeCompare(b.assignedAt),
  );
  for (const r of ordered) {
    if (seen.has(r.ex.id)) continue;
    seen.add(r.ex.id);
    out.push({ ...r.ex, assignedAt: r.assignedAt, position: r.position });
  }
  return out;
}

interface LibraryState {
  levelName: string;
  levelId: string;
  exs: CardRow[]; // already sorted in path order
  // `points` = điểm CAO NHẤT trong các lượt (đã trừ 50% ở lượt dùng gợi ý) — không suy ra
  // được từ `correct` nên phải gom riêng.
  // `firstPassAt` = lượt ĐẦU TIÊN đạt ≥ UNLOCK_PASS_PCT — dùng để hoàn quota mở bài trong ngày;
  // lấy lượt đầu (không phải lượt gần nhất) để làm lại bài cũ không kiếm thêm suất.
  // `bestId`/`bestPct` = the attempt the card advertises. The report the card links to must be
  // THIS one, otherwise the score on the card and the score on the report disagree.
  best: Record<
    string,
    {
      correct: number;
      total: number;
      points: number;
      attempts: number;
      lastAt?: string;
      lastId?: string;
      bestId?: string;
      bestPct?: number;
      bestAt?: string;
      firstPassAt?: string;
    }
  >;
  unlockedCount: number; // số bài đầu danh sách đã mở khóa
  meta: LibraryMeta;
}

/** Ghi mốc lượt ĐẦU TIÊN đạt ngưỡng cho một bài (mọi nguồn: quiz · vocab · đọc-to/nói). */
function markPass(
  b: LibraryState["best"][string],
  pctScore: number,
  at: string | null | undefined,
): void {
  if (!at || pctScore < UNLOCK_PASS_PCT) return;
  if (!b.firstPassAt || at < b.firstPassAt) b.firstPassAt = at;
}

/**
 * Keeps the id of the HIGHEST-scoring attempt (every kind: quiz · read-aloud · speaking · writing).
 * Ties go to the most recent attempt, so its feedback matches the passage the learner read last.
 */
function markBest(
  b: LibraryState["best"][string],
  pctScore: number,
  id: string | null | undefined,
  at: string | null | undefined,
): void {
  if (!id) return;
  const better = b.bestPct == null || pctScore > b.bestPct;
  const tie = b.bestPct != null && pctScore === b.bestPct && (!b.bestAt || (at ?? "") > b.bestAt);
  if (!better && !tie) return;
  b.bestPct = pctScore;
  b.bestId = id;
  b.bestAt = at ?? undefined;
}

/**
 * Trạng thái thư viện của user: danh sách bài (đã sắp thứ tự) + tiến độ + số bài đã mở.
 * null nếu user chưa chọn level. Dùng chung cho cả liệt kê, xem đề, chấm.
 */
async function libraryState(
  db: ReturnType<typeof getDb>,
  userId: string,
  /** Already-loaded row, so the listing route does not read the same user twice. */
  known?: typeof schema.users.$inferSelect | null,
): Promise<LibraryState | null> {
  const user = known ?? (await db.query.users.findFirst({ where: eq(schema.users.id, userId) }));
  if (!user?.levelId) return null;
  const level = await db.query.levels.findFirst({ where: eq(schema.levels.id, user.levelId) });
  if (!level) return null;

  // LỘ TRÌNH (path) KHÔNG lọc theo chủ đề: bài đã xếp vào chặng là curriculum CHUNG cho mọi user,
  // luôn hiện đúng thứ tự — kể cả bài NỀN TẢNG (chào hỏi/ngữ pháp) vốn không thuộc chủ đề vocab nào.
  // `users.topics` nay dùng cho browse/AI-gen scope (gợi ý sinh thêm bài cùng chủ đề), KHÔNG gán
  // cứng pool gạn giọt nữa — nếu không, bài nền tảng (topic NULL, hoặc topic lệch sở thích) bị loại
  // khỏi lộ trình.
  const conds = [
    eq(schema.exercises.published, true),
    eq(schema.exercises.level, level.name),
    // Bài ĐỌC-TO / NÓI nay GỘP CHUNG pool drip (không lọc read_aloud nữa) → gạn giọt cùng nhịp,
    // hiển thị == path, record RẢI ĐỀU thay vì đổ hết cùng lúc. Trước đây record đi cửa riêng
    // (/record/list) KHÔNG gạn giọt → danh sách luyện tập bị record áp đảo dù path cân bằng.
    // LỘ TRÌNH LÀ DANH SÁCH TRẮNG: chỉ bài ĐÃ XẾP vào một chặng (path_order != NULL) mới
    // lọt ra thư viện user. Level chưa dựng lộ trình → thư viện rỗng, cô phải vào
    // /teacher/paths xếp bài trước. Bài cô GIAO đi cửa riêng (assignedExercises), miễn luật này.
    sql`${schema.exercises.pathOrder} is not null`,
    // PHẠM VI: bài mang nhãn scope="student" là của riêng học sinh cô → KHÔNG lọt ra
    // thư viện công khai. Bài chưa gắn nhãn (tag_id NULL) = "all".
    // `published` là điều kiện BẮT BUỘC để học sinh làm được bài, nên không thể dùng nó
    // để giấu bài — phải lọc bằng nhãn ở đây.
    sql`(${schema.exercises.tagId} is null or exists (
      select 1 from tags where tags.id = ${schema.exercises.tagId} and tags.scope = 'all'
    ))`,
  ];
  // LỚP HỌC THUẬT là OPT-IN: user chưa bật → loại bài layer='academic' khỏi pool (không thấy, không
  // tính thiếu vì total đếm từ pool đã lọc). Bật → thấy hết. Bài lõi (layer NULL) luôn vào. Xem exercises.layer.
  if (!user.academicEnabled) {
    conds.push(sql`(${schema.exercises.layer} is null or ${schema.exercises.layer} != 'academic')`);
  }

  // Danh sách bài của level, sắp theo "lộ trình": path_order (nulls last) → createdAt cũ→mới.
  const exs = await db
    .select(cardCols)
    .from(schema.exercises)
    .where(and(...conds))
    .orderBy(
      sql`${schema.exercises.pathOrder} is null`,
      asc(schema.exercises.pathOrder),
      asc(schema.exercises.createdAt),
    );

  // Tiến độ của user: số câu đúng cao nhất + số lần làm, theo từng bài.
  const subs = await db
    .select({
      id: schema.submissions.id,
      exerciseId: schema.submissions.exerciseId,
      score: schema.submissions.score,
      total: schema.submissions.total,
      hintUsed: schema.submissions.hintUsed,
      points: schema.submissions.points,
      createdAt: schema.submissions.submittedAt,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.userId, userId));

  const best: LibraryState["best"] = {};
  for (const s of subs) {
    const b = (best[s.exerciseId] ||= { correct: 0, total: s.total, points: 0, attempts: 0 });
    b.correct = Math.max(b.correct, s.score);
    b.points = Math.max(b.points, s.points ?? quizPoints(s.score, !!s.hintUsed));
    b.total = s.total;
    b.attempts++;
    markPass(b, s.total > 0 ? (s.score / s.total) * 100 : 0, s.createdAt);
    markBest(b, s.total > 0 ? (s.score / s.total) * 100 : 0, s.id, s.createdAt);
    // `lastId` still feeds the "last attempt" meta; the report opened from the card follows `bestId`.
    if (!b.lastAt || s.createdAt > b.lastAt) {
      b.lastAt = s.createdAt;
      b.lastId = s.id;
    }
  }
  await mergeVocabBest(db, userId, best);
  await mergeRecordBest(db, userId, best); // đọc-to/nói nay trong pool → phải gộp best (bảng riêng)

  // Chỉ đếm bài ĐÃ LÀM thuộc chính level này (user đổi level thì bài cũ không tính).
  const doneInLevel = exs.reduce((n, e) => n + (best[e.id] ? 1 : 0), 0);
  // Bài đạt LẦN ĐẦU trong hôm nay → mỗi bài hoàn lại 1 suất mở (xem topUpUnlocks).
  const today = vnDateStr();
  const passedToday = exs.reduce((n, e) => {
    const at = best[e.id]?.firstPassAt;
    return n + (at && vnDateStr(new Date(at)) === today ? 1 : 0);
  }, 0);
  const { unlockedCount, meta } = await topUpUnlocks(db, userId, user.levelId, exs.length, doneInLevel, passedToday);

  return { levelName: level.name, levelId: user.levelId, exs, best, unlockedCount, meta };
}

/**
 * Gộp kết quả bài BỘ THẺ TỪ VỰNG vào bản đồ tiến độ.
 *
 * Bài bộ thẻ nộp sang bảng RIÊNG (`vocab_submissions`) chứ không phải `submissions`, nên nếu
 * chỉ đọc `submissions` thì học xong bộ thẻ vẫn bị coi là CHƯA LÀM — và tệ hơn: gạn giọt đếm
 * bài đã làm để mở bài kế, nên người học sẽ kẹt vĩnh viễn ở bài từ vựng.
 *
 * `vocab_submissions.score` là PHẦN TRĂM (0-100) còn `total` là số từ → quy về {correct,total}
 * giống quiz để hiển thị "N/M" và tính điểm cùng một luật.
 */
async function mergeVocabBest(
  db: ReturnType<typeof getDb>,
  userId: string,
  best: LibraryState["best"],
  exerciseIds?: string[],
): Promise<void> {
  if (exerciseIds && !exerciseIds.length) return;
  const select = (extra?: SQL | undefined) =>
    db
      .select({
        id: schema.vocabSubmissions.id,
        exerciseId: schema.vocabSubmissions.exerciseId,
        score: schema.vocabSubmissions.score,
        total: schema.vocabSubmissions.total,
        points: schema.vocabSubmissions.points,
        createdAt: schema.vocabSubmissions.submittedAt,
      })
      .from(schema.vocabSubmissions)
      .where(and(eq(schema.vocabSubmissions.userId, userId), extra));
  const rows = exerciseIds
    ? await inChunks(exerciseIds, (ids) => select(inArray(schema.vocabSubmissions.exerciseId, ids)))
    : await select();
  for (const r of rows) {
    if (!r.exerciseId) continue; // free-practice session (user_deck) — not tied to any exercise
    const correct = Math.round(((r.score ?? 0) / 100) * (r.total ?? 0));
    const b = (best[r.exerciseId] ||= { correct: 0, total: r.total ?? 0, points: 0, attempts: 0 });
    // `total` must travel WITH the best attempt: a later short session (a redo of 3 weak words)
    // used to overwrite it while `correct` kept the older, higher value — the card then read "9/3".
    if (correct >= b.correct) {
      b.correct = correct;
      b.total = r.total ?? b.total;
    }
    // Deck points are memory progress per SESSION (they cannot repeat), so they add up — the same
    // rule /me/stats and the leaderboard use. Sessions from before memory points fall back to quizPoints.
    b.points += r.points ?? quizPoints(correct);
    b.attempts++;
    markPass(b, r.score ?? 0, r.createdAt); // vocab sessions already store a percentage
    markBest(b, r.score ?? 0, r.id, r.createdAt);
    if (r.createdAt && (!b.lastAt || r.createdAt > b.lastAt)) {
      b.lastAt = r.createdAt;
      b.lastId = r.id;
    }
  }
}

/**
 * Gộp best của bài ĐỌC-TO / NÓI (nộp ở bảng reading/speaking_submissions RIÊNG) vào map best.
 * Quy về {correct: điểm/100, total: 100} — toItem tính điểm bằng recordPoints(correct). Không truyền
 * `exerciseIds` = lấy toàn bộ record của user (dùng cho pool drip đã gộp read-aloud/nói).
 */
async function mergeRecordBest(
  db: ReturnType<typeof getDb>,
  userId: string,
  best: LibraryState["best"],
  exerciseIds?: string[],
): Promise<void> {
  if (exerciseIds && !exerciseIds.length) return;
  const readingQ = (extra?: SQL | undefined) =>
    db
      .select({ id: schema.readingSubmissions.id, exerciseId: schema.readingSubmissions.exerciseId, score: schema.readingSubmissions.pronScore, points: schema.readingSubmissions.points, audioKey: schema.readingSubmissions.audioKey, createdAt: schema.readingSubmissions.submittedAt })
      .from(schema.readingSubmissions)
      .where(and(eq(schema.readingSubmissions.userId, userId), extra));
  const writingQ = (extra?: SQL | undefined) =>
    db
      .select({ id: schema.writingSubmissions.id, exerciseId: schema.writingSubmissions.exerciseId, score: schema.writingSubmissions.overallScore, createdAt: schema.writingSubmissions.submittedAt })
      .from(schema.writingSubmissions)
      .where(and(eq(schema.writingSubmissions.userId, userId), extra));
  const ids = exerciseIds;
  const [rRows, wRows] = await Promise.all([
    ids ? inChunks(ids, (s) => readingQ(inArray(schema.readingSubmissions.exerciseId, s))) : readingQ(),
    ids ? inChunks(ids, (s) => writingQ(inArray(schema.writingSubmissions.exerciseId, s))) : writingQ(),
  ]);
  // Shadowing VIDEO là hoạt động RIÊNG trên cùng bài với nghe-viết: cộng dồn điểm, KHÔNG để
  // điểm phát âm đè lên tiến độ nghe-viết (`correct`/`total` của thẻ bài).
  for (const r of rRows) {
    if (!r.exerciseId || !r.audioKey?.startsWith("video:")) continue;
    const b = (best[r.exerciseId] ||= { correct: 0, total: 100, points: 0, attempts: 0 });
    b.points += r.points ?? recordPoints(r.score);
    b.attempts++;
    if (r.createdAt && (!b.lastAt || r.createdAt > b.lastAt)) b.lastAt = r.createdAt;
  }
  for (const r of [...rRows.filter((x) => !x.audioKey?.startsWith("video:")), ...wRows]) {
    if (!r.exerciseId) continue;
    const b = (best[r.exerciseId] ||= { correct: 0, total: 100, points: 0, attempts: 0 });
    b.correct = Math.max(b.correct, r.score);
    b.total = 100;
    b.attempts++;
    markPass(b, r.score, r.createdAt); // read-aloud / writing are scored out of 100
    markBest(b, r.score, r.id, r.createdAt);
    if (r.createdAt && (!b.lastAt || r.createdAt > b.lastAt)) {
      b.lastAt = r.createdAt;
      b.lastId = r.id;
    }
  }
}

/**
 * Bài NGHE & NÓI của một cấp độ — NGOÀI lộ trình: không cần `path_order`, không gạn giọt.
 * Dạng này rời rạc (mỗi bài một video/audio, không nối tiếp nhau) nên xếp chặng chỉ gây vướng;
 * the only gate is the level.
 */
async function levelVideos(
  db: ReturnType<typeof getDb>,
  levelName: string,
  academicEnabled: boolean,
): Promise<CardRow[]> {
  // Pool opens across the whole CEFR GROUP, not one level (see CEFR_GROUP in shared): a lesson
  // here is a standalone video, so a Pre-A1 learner reaching into A1/A2 costs nothing and turns
  // a thin shelf into a usable one. Unknown level name → fall back to that exact level.
  const band = cefrOfLevelName(levelName);
  const group = band ? CEFR_GROUP[band] : null;
  let names = [levelName];
  const rank = new Map<string, number>();
  if (group) {
    const rows = await db.select().from(schema.levels);
    const inGroup = rows.filter((l) => {
      const b = cefrOfLevelName(l.name);
      return b && CEFR_GROUP[b] === group;
    });
    // Own level first, then the rest of the group in ladder order — the easiest reachable lesson
    // should be the first one on screen, not whichever happens to be oldest.
    for (const l of inGroup) rank.set(l.name, l.name === levelName ? -1 : l.position);
    if (inGroup.length) names = inGroup.map((l) => l.name);
  }
  const conds = [
    eq(schema.exercises.published, true),
    eq(schema.exercises.video, true),
    inArray(schema.exercises.level, names),
    sql`${schema.exercises.deletedAt} is null`,
    // Cùng luật phạm vi nhãn với lộ trình: bài scope="student" không lọt ra thư viện công khai.
    sql`(${schema.exercises.tagId} is null or exists (
      select 1 from tags where tags.id = ${schema.exercises.tagId} and tags.scope = 'all'
    ))`,
  ];
  if (!academicEnabled) {
    conds.push(sql`(${schema.exercises.layer} is null or ${schema.exercises.layer} != 'academic')`);
  }
  const rows = await db.select(cardCols).from(schema.exercises).where(and(...conds)).orderBy(asc(schema.exercises.createdAt));
  if (!rank.size) return rows;
  return rows.sort((a, b) => (rank.get(a.level ?? "") ?? 99) - (rank.get(b.level ?? "") ?? 99));
}

/**
 * Per-lesson progress for Dictation & Shadowing, counted in SEGMENTS.
 *
 * A video lesson has no single grade — it is 100-300 sentences worked one at a time — so the card
 * cannot report it the way a quiz does. `done` counts the distinct segments touched in either mode
 * (a segment done in both counts once); `avg` is the mean shadowing score, or null when the learner
 * has only ever typed. Without this the card reads "not started" until the whole lesson is over.
 */
async function videoSegmentProgress(
  db: Db,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, { done: number; avg: number | null }>> {
  const out = new Map<string, { done: number; avg: number | null }>();
  if (!exerciseIds.length) return out;
  const [shadow, dict] = await Promise.all([
    inChunks(exerciseIds, (ids) =>
      db
        .select({ exerciseId: schema.videoShadowScores.exerciseId, segment: schema.videoShadowScores.segment, score: schema.videoShadowScores.score })
        .from(schema.videoShadowScores)
        .where(and(eq(schema.videoShadowScores.userId, userId), inArray(schema.videoShadowScores.exerciseId, ids))),
    ),
    inChunks(exerciseIds, (ids) =>
      db
        .select({ exerciseId: schema.videoDictationScores.exerciseId, segment: schema.videoDictationScores.segment })
        .from(schema.videoDictationScores)
        .where(
          and(
            eq(schema.videoDictationScores.userId, userId),
            eq(schema.videoDictationScores.done, true),
            inArray(schema.videoDictationScores.exerciseId, ids),
          ),
        ),
    ),
  ]);
  const segs = new Map<string, Set<number>>();
  const scores = new Map<string, number[]>();
  for (const r of shadow) {
    (segs.get(r.exerciseId) ?? segs.set(r.exerciseId, new Set()).get(r.exerciseId)!).add(r.segment);
    (scores.get(r.exerciseId) ?? scores.set(r.exerciseId, []).get(r.exerciseId)!).push(r.score);
  }
  for (const r of dict) {
    (segs.get(r.exerciseId) ?? segs.set(r.exerciseId, new Set()).get(r.exerciseId)!).add(r.segment);
  }
  for (const [id, set] of segs) {
    const sc = scores.get(id) ?? [];
    out.set(id, {
      done: set.size,
      avg: sc.length ? Math.round(sc.reduce((s, x) => s + x, 0) / sc.length) : null,
    });
  }
  return out;
}

/** Library listing for the user's level: exercises + progress + drip-unlock state. */
library.post("/", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  const st = await libraryState(db, userId, me);
  // Assigned exercises do not depend on the level, so they load even before one is chosen.
  const assigned = await assignedExercises(db, userId);

  // Map chủ đề (id → object) để gắn màu/icon vào từng bài.
  const topicRows = await db.select().from(schema.topics);
  const topicMap = new Map(topicRows.map((t) => [t.id, { id: t.id, name: t.name, color: t.color, icon: t.icon ?? null }]));

  // Tiến độ của bài được giao: `st.best` chỉ phủ bài trong level, bài cô giao có thể nằm
  // ngoài → truy vấn riêng cho đúng, đừng để bài đã làm hiện thành "chưa làm".
  const assignedBest: LibraryState["best"] = {};
  if (assigned.length) {
    const subs = await inChunks(assigned.map((e) => e.id), (ids) =>
      db
        .select({ id: schema.submissions.id, exerciseId: schema.submissions.exerciseId, score: schema.submissions.score, total: schema.submissions.total, hintUsed: schema.submissions.hintUsed, points: schema.submissions.points, createdAt: schema.submissions.submittedAt })
        .from(schema.submissions)
        .where(and(eq(schema.submissions.userId, userId), inArray(schema.submissions.exerciseId, ids))),
    );
    for (const s of subs) {
      const b = (assignedBest[s.exerciseId] ||= { correct: 0, total: s.total, points: 0, attempts: 0 });
      b.correct = Math.max(b.correct, s.score);
      b.points = Math.max(b.points, s.points ?? quizPoints(s.score, !!s.hintUsed));
      b.total = s.total;
      b.attempts++;
      markBest(b, s.total > 0 ? (s.score / s.total) * 100 : 0, s.id, s.createdAt);
      if (!b.lastAt || s.createdAt > b.lastAt) {
        b.lastAt = s.createdAt;
        b.lastId = s.id;
      }
    }
    await mergeVocabBest(db, userId, assignedBest, assigned.map((e) => e.id));
    // Bài cô giao dạng ĐỌC-TO / NÓI nộp ở bảng riêng → phải gộp best vào đây, không thì bài
    // đọc-to/nói cô giao luôn hiện "chưa làm". Quy về {correct: điểm/100, total: 100}.
    await mergeRecordBest(db, userId, assignedBest, assigned.map((e) => e.id));
  }

  // Số "mục" mỗi bài (để card hiện "N câu"/"N từ" giúp học sinh liệu sức trước khi vào):
  // quiz = số câu hỏi (1 query gộp); đọc to = số từ trong đoạn; bộ thẻ = số từ theo cấu hình.
  const allExs = [...(st?.exs ?? []), ...assigned];
  const quizIds = allExs.filter((e) => !e.readAloud && !e.vocabDeck).map((e) => e.id);
  const qcRows = await inChunks(quizIds, (ids) =>
    db
      .select({ eid: schema.questions.exerciseId, n: sql<number>`count(*)` })
      .from(schema.questions)
      .where(inArray(schema.questions.exerciseId, ids))
      .groupBy(schema.questions.exerciseId),
  );
  const qcMap = new Map(qcRows.map((r) => [r.eid, Number(r.n)]));
  const itemCount = (e: CardRow): number => {
    if (e.video) return e.segCount;
    if (e.readAloud && e.passage) return e.passage.trim().split(/\s+/).filter(Boolean).length;
    if (e.vocabDeck) {
      const d = e.vocabDeck;
      return d.source === "fixed" ? d.wordIds?.length ?? 0 : d.filter?.count ?? 0;
    }
    // Writing has no questions — show the TARGET word count parsed from the prompt instead
    // (card renders it as "~N words"). Speaking (also promptless-questions) has no analogous
    // count so it stays 0 → card hides the meta line entirely.
    if (e.skill === "writing") return targetWordsOf(e.speakingPrompt ?? "");
    return qcMap.get(e.id) ?? 0;
  };

  // Vocab decks keep their unfinished session on the server (scopeKey = exercise slug). A deck the
  // learner walked away from writes NO submission, so the card must read the session to avoid
  // showing a half-done exercise as untouched.
  const openDecks = new Map<string, { answered: number; total: number }>();
  if (allExs.some((e) => e.vocabDeck)) {
    const rows = await db
      .select({
        scopeKey: schema.vocabPracticeSessions.scopeKey,
        state: schema.vocabPracticeSessions.state,
      })
      .from(schema.vocabPracticeSessions)
      .where(and(eq(schema.vocabPracticeSessions.userId, userId), eq(schema.vocabPracticeSessions.scope, "exercise")));
    for (const r of rows) {
      if (!r.scopeKey) continue;
      openDecks.set(r.scopeKey, { answered: r.state.answered?.length ?? 0, total: r.state.queue.length });
    }
  }

  const toItem = (
    e: CardRow,
    best: LibraryState["best"],
    locked: boolean,
    assignedAt?: string,
  ): LibraryItem => {
    const b = best[e.id];
    const open = openDecks.get(e.exerciseId);
    return {
      doing_answered: open?.answered ?? null,
      doing_total: open?.total ?? null,
      exercise_id: e.exerciseId,
      title: e.title,
      skill: e.skill ?? null,
      level: e.level ?? null,
      topic: e.topicId ? topicMap.get(e.topicId) ?? null : null,
      image: e.image ?? null,
      template_id: e.templateId ?? null,
      translate_level: e.translateLevel ?? null,
      read_aloud: e.readAloud ?? false,
      video: e.video ?? false,
      youtube_id: e.youtubeId ?? null,
      video_modes: e.videoModes ?? null,
      done: !!b,
      best_correct: b ? b.correct : null,
      total: b ? b.total : null,
      attempts: b ? b.attempts : 0,
      // Read-aloud is scored /100 → recordPoints; quiz → quizPoints (same rule on the path and on
      // assigned work).
      points: b ? (e.readAloud ? recordPoints(b.correct) : b.points) : 0,
      locked,
      q_count: itemCount(e),
      assigned_at: assignedAt ?? null,
      last_attempt_at: b?.lastAt ?? null,
      last_submission_id: b?.lastId ?? null,
      // The card advertises the BEST score, so the report it opens must be that same attempt.
      best_submission_id: b?.bestId ?? b?.lastId ?? null,
    };
  };

  // Chưa chọn level → thư viện rỗng (frontend nhắc chọn level), nhưng bài cô giao vẫn hiện.
  const items = st ? st.exs.map((e, idx) => toItem(e, st.best, idx >= st.unlockedCount)) : [];
  // Hàng chờ trượt cho bài cô giao: mở dần theo tiến độ (không theo ngày). Xem lib/assignQueue.ts.
  const queue = buildAssignQueue(assigned, (e) => {
    const b = assignedBest[e.id];
    return b ? { correct: b.correct, total: b.total, attempts: b.attempts } : undefined;
  });
  // Mốc MỞ KHOÁ: bài vừa lọt vào cửa sổ thì ghi lại thời điểm (idempotent) — UI hiện
  // "mở lúc nào" thay cho ngày giao, vốn có thể đã lâu.
  const openIds = assigned.filter((e) => !queue.slots.get(e.id)?.locked).map((e) => e.id);
  const unlockedAt = new Map<string, string>();
  if (openIds.length) {
    const rows = await inChunks(openIds, (ids) =>
      db
        .select()
        .from(schema.assignmentUnlocks)
        .where(and(eq(schema.assignmentUnlocks.userId, userId), inArray(schema.assignmentUnlocks.exerciseId, ids))),
    );
    for (const r of rows) unlockedAt.set(r.exerciseId, r.unlockedAt);
    const fresh = openIds.filter((id) => !unlockedAt.has(id));
    if (fresh.length) {
      const now = new Date().toISOString();
      for (let i = 0; i < fresh.length; i += 40) {
        await db
          .insert(schema.assignmentUnlocks)
          .values(fresh.slice(i, i + 40).map((exerciseId) => ({ userId, exerciseId, unlockedAt: now })))
          .onConflictDoNothing();
      }
      for (const id of fresh) unlockedAt.set(id, now);
    }
  }
  // ---- NGHE & NÓI: danh sách RIÊNG, ngoài lộ trình ----
  // Dạng này không xếp chặng (nội dung theo video/audio có sẵn, không nối tiếp nhau như bài lộ
  // trình) → lọc theo LEVEL, mở hết cho mọi tài khoản, chỉ chặn bằng gói.
  const videos = st ? await levelVideos(db, st.levelName, !!me?.academicEnabled) : [];
  const videoBest: LibraryState["best"] = {};
  if (videos.length) await mergeRecordBest(db, userId, videoBest, videos.map((e) => e.id));
  const segProgress = videos.length ? await videoSegmentProgress(db, userId, videos.map((e) => e.id)) : new Map();
  return c.json({
    level: st?.levelName ?? null,
    meta: st?.meta ?? null,
    items,
    videos: videos.map((e) => {
      const p = segProgress.get(e.id);
      return {
        ...toItem(e, videoBest, false),
        seg_done: p?.done ?? 0,
        seg_avg: p?.avg ?? null,
      };
    }),
    assigned: assigned.map((e) => {
      const slot = queue.slots.get(e.id);
      return {
        ...toItem(e, assignedBest, slot?.locked ?? false, e.assignedAt),
        assign_state: slot?.state ?? "todo",
        queued: slot?.queued ?? true,
        unlocked_at: unlockedAt.get(e.id) ?? null,
      };
    }),
    assigned_queue: queue.summary,
  });
});

/**
 * Tổng điểm ảo + lịch sử của user (TOÀN BỘ bài đã làm, kể cả khi đã đổi level).
 * Điểm best-per-exercise: quiz → quizPoints, đọc-to/nói → recordPoints (thang /100).
 * Gộp cả 3 kỹ năng để khớp leaderboard/analytics.
 */
library.post("/me/stats", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);

  const [subs, reads, vocabs, writes, grammars] = await Promise.all([
    db
      .select({
        exerciseId: schema.submissions.exerciseId,
        score: schema.submissions.score,
        total: schema.submissions.total,
        hintUsed: schema.submissions.hintUsed,
        points: schema.submissions.points,
        submittedAt: schema.submissions.submittedAt,
        title: schema.exercises.title,
        slug: schema.exercises.exerciseId,
        skill: schema.exercises.skill,
        video: schema.exercises.video,
      })
      .from(schema.submissions)
      .innerJoin(schema.exercises, eq(schema.submissions.exerciseId, schema.exercises.id))
      .where(eq(schema.submissions.userId, userId)),
    db
      .select({
        exerciseId: schema.readingSubmissions.exerciseId,
        score: schema.readingSubmissions.pronScore,
        points: schema.readingSubmissions.points,
        audioKey: schema.readingSubmissions.audioKey,
        submittedAt: schema.readingSubmissions.submittedAt,
        title: schema.exercises.title,
        slug: schema.exercises.exerciseId,
        skill: schema.exercises.skill,
      })
      .from(schema.readingSubmissions)
      .innerJoin(schema.exercises, eq(schema.readingSubmissions.exerciseId, schema.exercises.id))
      .where(eq(schema.readingSubmissions.userId, userId)),
    // Từ vựng — CẢ buổi tự luyện (leftJoin: exerciseId có thể null) lẫn bộ thẻ cô giao.
    db
      .select({
        id: schema.vocabSubmissions.id,
        exerciseId: schema.vocabSubmissions.exerciseId,
        points: schema.vocabSubmissions.points,
        result: schema.vocabSubmissions.result,
        submittedAt: schema.vocabSubmissions.submittedAt,
        title: schema.exercises.title,
        slug: schema.exercises.exerciseId,
        skill: schema.exercises.skill,
      })
      .from(schema.vocabSubmissions)
      .leftJoin(schema.exercises, eq(schema.vocabSubmissions.exerciseId, schema.exercises.id))
      .where(eq(schema.vocabSubmissions.userId, userId)),
    // Bài VIẾT nộp ở bảng riêng — thiếu ở đây thì bài viết vừa mất điểm vừa vắng khỏi lịch sử.
    db
      .select({
        exerciseId: schema.writingSubmissions.exerciseId,
        score: schema.writingSubmissions.overallScore,
        submittedAt: schema.writingSubmissions.submittedAt,
        title: schema.exercises.title,
        slug: schema.exercises.exerciseId,
        skill: schema.exercises.skill,
      })
      .from(schema.writingSubmissions)
      .innerJoin(schema.exercises, eq(schema.writingSubmissions.exerciseId, schema.exercises.id))
      .where(eq(schema.writingSubmissions.userId, userId)),
    // Grammar drills are self-directed: no exercise row to join, so title/slug are synthesised.
    db
      .select({
        id: schema.grammarSubmissions.id,
        mode: schema.grammarSubmissions.mode,
        grammarIds: schema.grammarSubmissions.grammarIds,
        points: schema.grammarSubmissions.points,
        correct: schema.grammarSubmissions.correct,
        total: schema.grammarSubmissions.total,
        submittedAt: schema.grammarSubmissions.submittedAt,
      })
      .from(schema.grammarSubmissions)
      .where(eq(schema.grammarSubmissions.userId, userId)),
  ]);

  // Chuẩn hóa: quiz giữ total thật; record quy về /100 và điểm theo recordPoints.
  // Vocab: quy {correct,total} đã LOẠI flashcard; buổi chỉ-flashcard (total 0) bị bỏ khỏi điểm/lịch sử.
  // `kind` = HOẠT ĐỘNG thật sự, không phải kỹ năng của bài: một bài Nghe & Nói sinh ra 2 dòng
  // (nghe-viết ở `submissions`, shadowing ở `reading_submissions`) nên nếu chỉ hiện tên bài thì
  // lịch sử có 2 dòng trùng tên mà không biết dòng nào là gì.
  const rows = [
    ...subs.map((s) => ({ ...s, kind: s.video ? ("dictation" as const) : ("quiz" as const), total: s.total, points: s.points ?? quizPoints(s.score, !!s.hintUsed) })),
    ...reads.map((s) => ({ ...s, kind: s.audioKey?.startsWith("video:") ? ("shadowing" as const) : ("read_aloud" as const), total: 100, points: s.points ?? recordPoints(s.score) })),
    ...writes.map((s) => ({ ...s, kind: "writing" as const, total: 100, points: recordPoints(s.score) })),
    // Khoá theo LƯỢT nộp: điểm từ vựng là tiến bộ trí nhớ, cộng dồn chứ không lấy lượt tốt nhất.
    ...vocabs
      .map((v) => {
        const g = vocabGradedScore(v.result);
        return {
          exerciseId: `vocab:${v.id}`,
          kind: "vocab" as const,
          score: g.correct,
          total: g.total,
          submittedAt: v.submittedAt,
          title: v.title ?? "Luyện từ vựng",
          slug: v.slug ?? "",
          skill: v.skill ?? ("vocabulary" as const),
          points: v.points ?? (v.exerciseId ? quizPoints(g.correct) : 0),
        };
      })
      .filter((v) => v.total > 0),
    // Keyed per SESSION like vocab: the points ARE the progress made, so they accumulate.
    // Two drills share this table; without a distinct kind the history showed both as
    // "Luyện ngữ pháp" with no way to tell which activity a row was.
    ...grammars.map((g) => ({
      exerciseId: `grammar:${g.id}`,
      kind: (g.mode === "translate" ? "grammar_translate" : "grammar") as "grammar" | "grammar_translate",
      score: g.correct,
      total: g.total,
      submittedAt: g.submittedAt,
      title: g.mode === "translate" ? "Dịch câu Việt–Anh" : "Luyện ngữ pháp",
      slug: "",
      skill: "grammar" as const,
      points: g.points,
    })),
  ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const bestPts: Record<string, number> = {};
  for (const r of rows) bestPts[r.exerciseId] = Math.max(bestPts[r.exerciseId] ?? 0, r.points);
  let points = 0;
  for (const p of Object.values(bestPts)) points += p;

  return c.json({
    points,
    level: pointsToLevel(points), // cấp XP suy ra từ tổng điểm (không lưu riêng)
    exercises_done: Object.keys(bestPts).length,
    attempts: rows.length,
    history: rows.slice(0, 100).map((s) => ({
      exercise_id: s.slug,
      title: s.title,
      skill: s.skill,
      kind: s.kind,
      score: s.score,
      total: s.total,
      submitted_at: s.submittedAt,
    })),
  });
});

// ---- Game "chờ chấm" (endless runner) ----
// Giải trí trong lúc chờ chấm bài nói/đọc to. Kỷ lục 1 dòng/user + TOP 10 chung.

/** TOP 10 kỷ lục — tên hiển thị, KHÔNG lộ email của ai. */
async function gameTop(db: ReturnType<typeof getDb>) {
  const rows = await db
    .select({ name: schema.users.name, best: schema.gameScores.best })
    .from(schema.gameScores)
    .innerJoin(schema.users, eq(schema.gameScores.userId, schema.users.id))
    .orderBy(desc(schema.gameScores.best))
    .limit(10);
  return rows.map((r) => ({ name: r.name || "Bạn nào đó", score: r.best }));
}

library.post("/game/top", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const mine = await db.query.gameScores.findFirst({ where: eq(schema.gameScores.userId, userId) });
  return c.json({ best: mine?.best ?? 0, top: await gameTop(db) });
});

/** Nộp điểm — chỉ ghi khi CAO HƠN kỷ lục cũ. Chặn trên để client không bơm số bậy. */
library.post("/game/score", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as { score?: number };
  const s = Math.max(0, Math.min(1_000_000, Math.floor(Number(body.score) || 0)));

  const mine = await db.query.gameScores.findFirst({ where: eq(schema.gameScores.userId, userId) });
  if (!mine) {
    await db.insert(schema.gameScores).values({ userId, best: s });
  } else if (s > mine.best) {
    await db
      .update(schema.gameScores)
      .set({ best: s, updatedAt: new Date().toISOString() })
      .where(eq(schema.gameScores.userId, userId));
  }
  return c.json({ best: Math.max(s, mine?.best ?? 0), top: await gameTop(db) });
});

/**
 * Báo cáo tháng CỦA CHÍNH user (cô viết cho thành viên lớp). Trả cả `slug` để em/phụ huynh
 * mở được trang công khai `/r/<slug>`. POST → tránh edge-cache (Gotcha #4).
 */
library.post("/me/reports", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      month: schema.reports.month,
      slug: schema.reports.slug,
      id: schema.reports.id,
      stats: schema.reports.stats,
      updatedAt: schema.reports.updatedAt,
    })
    .from(schema.reports)
    .where(eq(schema.reports.userId, userId))
    .orderBy(desc(schema.reports.month));
  // List nhẹ cho lưới card — chỉ vài KPI rút từ snapshot, KHÔNG kéo cả stats (mistakes/timeline).
  const items = rows.map((r) => ({
    id: r.id,
    month: r.month,
    slug: r.slug,
    updatedAt: r.updatedAt,
    avg_pct: r.stats?.avg_pct != null ? Math.round(r.stats.avg_pct) : null,
    exercises_done: r.stats?.exercises_done ?? null,
    has_stats: !!r.stats,
  }));
  return c.json({ items });
});

/**
 * Một báo cáo tháng CỦA CHÍNH user — kèm snapshot số liệu đầy đủ (`stats`) để trang chi tiết
 * trong app (`/u/reports/:month`) vẽ chart, không phải rời sang link công khai. POST → né edge-cache.
 */
library.post("/me/reports/:month", async (c) => {
  const { id: userId } = c.get("user");
  const month = c.req.param("month");
  const db = getDb(c.env.DB);
  const row = await db.query.reports.findFirst({
    where: and(eq(schema.reports.userId, userId), eq(schema.reports.month, month)),
  });
  if (!row) throw new HTTPException(404, { message: "Không tìm thấy báo cáo tháng này." });
  const me = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return c.json({
    studentName: me?.name || me?.email || "Bạn",
    month: row.month,
    content: row.content,
    stats: row.stats,
    slug: row.slug, // để trang chi tiết dựng link chia sẻ công khai /r/<slug>
    updatedAt: row.updatedAt,
  });
});

/**
 * Tìm bài trong danh sách đã mở của user theo slug. Ném lỗi đúng nghĩa nếu:
 * không tồn tại (404) · đọc-to (400) · sai level (403) · chưa mở khóa (403).
 */
async function requireUnlocked(db: ReturnType<typeof getDb>, userId: string, slug: string): Promise<ExerciseRow> {
  const id = await resolveUnlockedId(db, userId, slug);
  // The listing queries carry CARD columns only (see `cardCols`), so building the exercise payload
  // needs one full row. One extra read on the open-an-exercise path buys a listing that no longer
  // drags every passage and transcript through the Worker.
  const full = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, id) });
  if (!full) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  return full;
}

/** Id of the exercise `slug` refers to, or the HTTPException explaining why it is out of reach. */
export async function resolveUnlockedId(db: ReturnType<typeof getDb>, userId: string, slug: string): Promise<string> {
  // Teacher-assigned exercises bypass every library rule (drip, level, scope="student" tags).
  // The sliding queue only gates them when ENFORCE_LOCK is on — see lib/assignQueue.ts.
  const assignedList = await assignedExercises(db, userId);
  const assigned = assignedList.find((e) => e.exerciseId === slug);
  if (assigned && !ENFORCE_LOCK) return assigned.id;
  if (assigned) {
    const best: LibraryState["best"] = {};
    await mergeVocabBest(db, userId, best, assignedList.map((e) => e.id));
    const subs = await inChunks(assignedList.map((e) => e.id), (ids) =>
      db
        .select({ exerciseId: schema.submissions.exerciseId, score: schema.submissions.score, total: schema.submissions.total })
        .from(schema.submissions)
        .where(and(eq(schema.submissions.userId, userId), inArray(schema.submissions.exerciseId, ids))),
    );
    for (const s of subs) {
      const b = (best[s.exerciseId] ||= { correct: 0, total: s.total, points: 0, attempts: 0 });
      b.correct = Math.max(b.correct, s.score);
      b.total = s.total;
      b.attempts++;
    }
    const { slots } = buildAssignQueue(assignedList, (e) => {
      const b = best[e.id];
      return b ? { correct: b.correct, total: b.total, attempts: b.attempts } : undefined;
    });
    if (slots.get(assigned.id)?.locked) {
      throw new HTTPException(403, {
        message: "Bài này chưa tới lượt. Hoàn thành các bài cô giao đang mở (từ 50% trở lên) để mở tiếp nhé.",
      });
    }
    return assigned.id;
  }

  const st = await libraryState(db, userId);
  const idx = st ? st.exs.findIndex((e) => e.exerciseId === slug) : -1;
  if (st && idx >= 0) {
    if (idx >= st.unlockedCount) {
      throw new HTTPException(403, { message: "Bài này chưa mở khóa. Hoàn thành các bài đang mở hoặc quay lại ngày mai nhé." });
    }
    return st.exs[idx].id;
  }

  // Không nằm trong danh sách playable của level → phân loại lỗi cho rõ.
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, slug) });
  if (!ex || !ex.published) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  if (ex.readAloud) throw new HTTPException(400, { message: "Bài đọc to chưa mở cho tài khoản công khai." });
  throw new HTTPException(403, { message: "Bài này không thuộc cấp độ của bạn." });
}

/** Lấy đề (ẩn đáp án). Bài phải published + đúng level + ĐÃ MỞ KHÓA. */
library.post("/:slug", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);

  const ex = await requireUnlocked(db, userId, c.req.param("slug"));

  // Bài ĐỌC TO / NÓI không có câu hỏi → không phục vụ qua endpoint quiz (kể cả bài cô giao,
  // vốn được requireUnlocked cho qua). Trả về đây thì trang render <Quiz> rỗng. Trang phải
  // dùng /:slug/record. Xem [[record-speaking-not-quiz-routing]].
  if (ex.readAloud) {
    throw new HTTPException(400, { message: "Bài đọc to — dùng màn ghi âm, không phải trắc nghiệm." });
  }

  const qs = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.exerciseId, ex.id))
    .orderBy(schema.questions.position);

  const dict = await dictationPublicFields(ex, qs);
  const out: PublicExercise = {
    exercise_id: ex.exerciseId,
    title: ex.title,
    skill: ex.skill ?? null,
    passage: ex.passage ?? null,
    passage_ipa: ex.passageIpa ?? null,
    audio_url: ex.audioUrl ?? null,
    audio_cues: dict.audio_cues,
    dictation: dict.dictation,
    read_aloud: false,
    wordlist: ex.wordlist ?? null,
    translate_level: ex.translateLevel ?? null,
    template_id: ex.templateId ?? null,
    questions: await Promise.all(qs.map(publicQuestion)),
  };
  // Bài BỘ THẺ từ vựng: không có câu hỏi. Resolve luôn danh sách TỪ ở server để trang chỉ
  // cần MỘT vòng gọi (nguồn "filter" bốc ngẫu nhiên nên mỗi lượt vào là một bộ khác).
  if (ex.vocabDeck) {
    out.vocab_deck = ex.vocabDeck;
    // Seeded per learner AND per attempt: a shuffled pick stays the same across reloads/devices
    // (so the saved session still matches it) and changes once that attempt is submitted.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(schema.vocabSubmissions)
      .where(and(eq(schema.vocabSubmissions.userId, userId), eq(schema.vocabSubmissions.exerciseId, ex.id)));
    out.vocab_items = await resolveVocabDeck(c.env, ex.vocabDeck, `${userId}:${ex.id}:${n}`);
  }
  return c.json(out);
});

/**
 * POST /:slug/translate-answer — the English sentence for ONE translate question.
 *
 * The drill colours each character as it is typed, which a hash cannot do. Handing the sentence over
 * one question at a time, only for the one the learner has opened, keeps a whole exercise's answers
 * from arriving in a single payload. Same contract as the self-study drill
 * (/account/grammar/translate/sessions/:id/answer). POST so the edge cache never sees it (gotcha #4).
 */
library.post("/:slug/translate-answer", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await requireUnlocked(db, userId, c.req.param("slug"));
  const body = (await c.req.json().catch(() => ({}))) as { position?: unknown };
  const position = Number(body.position);
  if (!Number.isFinite(position)) throw new HTTPException(400, { message: "Thiếu số thứ tự câu." });
  const q = await db.query.questions.findFirst({
    where: and(eq(schema.questions.exerciseId, ex.id), eq(schema.questions.position, position)),
  });
  if (!q || q.type !== "translate") throw new HTTPException(404, { message: "Câu này không phải câu dịch." });
  return c.json({ position, en: q.answer ?? "" });
});

/** Graded SERVER-SIDE + stored as a submission (tied to userId). The exercise must be unlocked. */
library.post("/:slug/grade", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const answers = (body?.answers ?? {}) as Record<string, string>;
  // Gợi ý: phụ đề audio (hint_used) phủ CẢ bài; gợi ý per-câu chỉ phạt đúng câu đó.
  const subtitleHint = !!body?.hint_used;
  const hintPositions: number[] = Array.isArray(body?.hint_positions)
    ? [...new Set((body.hint_positions as unknown[]).map(Number).filter((n) => Number.isFinite(n)))]
    : [];
  const hintUsed = subtitleHint || hintPositions.length > 0;

  const ex = await requireUnlocked(db, userId, c.req.param("slug"));
  // A deck has no questions: grading it here wrote a 0/0 quiz row that marked it "done" with nothing
  // learned. Decks submit through /account/vocab/submit.
  if (ex.vocabDeck) throw new HTTPException(400, { message: "Bài bộ thẻ từ vựng nộp qua màn luyện thẻ, không chấm như trắc nghiệm." });

  const qs = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.exerciseId, ex.id))
    .orderBy(schema.questions.position);

  const answerMap: Record<number, string> = {};
  for (const [k, v] of Object.entries(answers)) answerMap[Number(k)] = v;

  const { score, total, details } = gradeSubmission(
    qs.map((q) => ({
      position: q.position,
      type: q.type,
      answer: q.answer,
      accept: q.accept,
      pairs: q.pairs,
      items: q.items,
      article_lenient: q.articleLenient,
    })),
    answerMap,
  );

  // Decide AI comment + spend quota BEFORE inserting (class work is free; free/pro capped daily).
  // withFeedback → mark "pending" and enqueue the comment job (written in a few seconds);
  // else "skipped" (no comment today).
  // Điểm thưởng tính NGAY tại đây (phạt 50% từng câu có gợi ý) và lưu vào lượt nộp —
  // các bảng tổng hợp chỉ việc lấy max, không phải suy lại từ `score`.
  const points = quizPointsFromDetails(details, subtitleHint ? "all" : hintPositions);

  const grant = await resolveFeedbackGrant(db, userId, ex.id);
  const feedbackStatus = grant.withFeedback ? "pending" : "skipped";

  // Lưu lượt nộp gắn userId (studentId để null → KHÔNG lẫn vào báo cáo học sinh).
  const [ins] = await db
    .insert(schema.submissions)
    .values({
      exerciseId: ex.id,
      userId,
      score,
      total,
      answers: answerMap,
      details,
      hintUsed,
      hintPositions: hintPositions.length ? hintPositions : null,
      points,
      feedbackStatus,
    })
    .returning({ id: schema.submissions.id });

  // Nhận xét là job USER-FACING (em đang chờ ở trang báo cáo) → INTERACTIVE_QUEUE, không xếp
  // sau hàng loạt job sinh nội dung (podcast/vocab/tts) trên AI_QUEUE.
  if (grant.withFeedback) await c.env.INTERACTIVE_QUEUE.send({ type: "quiz_feedback", jobId: ins.id });

  const review = qs.map((q) => ({ position: q.position, correctAnswer: correctAnswerText(q) }));
  // submission_id → the practice page jumps straight to /s/:id, where the comment appears.
  return c.json({ score, total, details, review, points, submission_id: ins.id });
});

/**
 * Ask for the comment on an OWN submission that was graded while the daily allowance was empty.
 * The report page offers this once the allowance is back, so the learner is not forced to redo the
 * exercise just to get a comment. Spends one slot through the same grant as grading does.
 */
library.post("/submission/:id/feedback", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const sub = await db.query.submissions.findFirst({ where: eq(schema.submissions.id, c.req.param("id")) });
  if (!sub || sub.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });
  if (sub.teacherFeedback) return c.json({ status: "done" });
  if (sub.feedbackStatus === "pending") return c.json({ status: "pending" }); // already queued — do not duplicate

  const grant = await resolveFeedbackGrant(db, userId, sub.exerciseId);
  if (!grant.withFeedback) {
    throw new HTTPException(429, { message: "Hôm nay em đã dùng hết lượt nhận xét rồi. Mai em quay lại nhé." });
  }
  await db
    .update(schema.submissions)
    .set({ feedbackStatus: "pending", feedbackSkipped: 0 })
    .where(eq(schema.submissions.id, sub.id));
  await c.env.INTERACTIVE_QUEUE.send({ type: "quiz_feedback", jobId: sub.id });
  return c.json({ status: "pending" });
});

/**
 * Same "ask for the comment" flow as the quiz one above, for the learner's OWN read-aloud
 * submission. Unlike quiz (queued), generation runs INLINE here — the reading/speaking comment
 * task is text-only and short, exactly like the teacher "regenerate feedback" route.
 */
library.post("/reading-submission/:id/feedback", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const sub = await db.query.readingSubmissions.findFirst({ where: eq(schema.readingSubmissions.id, c.req.param("id")) });
  if (!sub || sub.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });
  if (sub.aiFeedback) return c.json({ status: "done", feedback: sub.aiFeedback });

  const grant = await resolveFeedbackGrant(db, userId, sub.exerciseId);
  if (!grant.withFeedback) {
    throw new HTTPException(429, { message: "Hôm nay em đã dùng hết lượt nhận xét rồi. Mai em quay lại nhé." });
  }

  const feedback = await generateReadingFeedback(c.env, db, sub);
  await db.update(schema.readingSubmissions).set({ aiFeedback: feedback }).where(eq(schema.readingSubmissions.id, sub.id));
  return c.json({ status: "done", feedback });
});

// ============================================================
//  RECORD (đọc to / nói) cho USER công khai. Gate: published + đúng loại + đúng
//  LEVEL user (KHÔNG gạn giọt — điều kiện mở khóa đặt sau) + QUOTA free/pro theo ngày.
//  Consumer chấm nền dùng chung (đã hỗ trợ userId + withFeedback).
// ============================================================
type RecordKind = "reading" | "writing";

/** Tìm bài record user được phép làm + tier hiệu lực. Ném lỗi rõ nghĩa nếu không hợp lệ. */
async function requireRecordAccess(
  db: ReturnType<typeof getDb>,
  userId: string,
  slug: string,
  kind: RecordKind,
): Promise<{ ex: ExerciseRow }> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });

  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, slug) });
  if (!ex || !ex.published) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });

  if (kind === "reading" && (!ex.readAloud || !ex.passage?.trim())) {
    throw new HTTPException(400, { message: "Bài này không phải bài đọc to" });
  }
  // Bài VIẾT: nhận diện theo `skill` (KHÔNG dùng cờ `speaking` — đó là bài NÓI). Tái dùng
  // speakingPrompt/speakingFramework/speakingSample làm đề/dàn ý/bài mẫu.
  if (kind === "writing" && (ex.skill !== "writing" || !ex.speakingPrompt?.trim())) {
    throw new HTTPException(400, { message: "Bài này không phải bài viết" });
  }

  // Gate LEVEL: bài phải thuộc cấp độ user đang chọn (bài không gắn level → cho qua).
  // NGOẠI LỆ: bài cô GIAO đi trước mọi luật (như requireUnlocked) — cô đã chủ động giao
  // thì em phải làm được, kể cả bài lệch cấp độ. Thiếu ngoại lệ này thì record 403 →
  // trang làm bài tưởng không phải record, rơi sang <Quiz> rỗng ("template trả lời").
  const isAssigned = (await assignedExercises(db, userId)).some((e) => e.exerciseId === slug);
  if (!isAssigned && user.levelId && ex.level) {
    const level = await db.query.levels.findFirst({ where: eq(schema.levels.id, user.levelId) });
    if (level && ex.level !== level.name) {
      throw new HTTPException(403, { message: "Bài này không thuộc cấp độ của bạn." });
    }
  }

  return { ex };
}

/**
 * Danh sách bài RECORD (đọc to + nói) cho user: published + đúng LEVEL (bài không gắn
 * level luôn hiện). Kèm điểm cao nhất + số lượt đã làm. KHÔNG gạn giọt.
 */
library.post("/record/list", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });

  const levelName = user.levelId
    ? (await db.query.levels.findFirst({ where: eq(schema.levels.id, user.levelId) }))?.name ?? null
    : null;

  // Bài đọc-to HOẶC nói, published. Lọc level: chỉ giữ bài cùng level HOẶC không gắn level.
  // Only the card's columns: a full row drags passage IPA, audio cues and questions JSON along.
  const exs = await db
    .select({
      id: schema.exercises.id,
      exerciseId: schema.exercises.exerciseId,
      title: schema.exercises.title,
      skill: schema.exercises.skill,
      level: schema.exercises.level,
    })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.published, true),
        eq(schema.exercises.readAloud, true),
        // CÙNG CỔNG như pool quiz: chỉ bài đã XẾP lộ trình (path_order != null) mới lọt ra kho
        // record. Trước đây record bỏ qua cổng này nên DUMP cả level (mọi bài đọc-to/nói
        // published) vào thư viện của mọi user — user chỉ được giao 1 bài vẫn thấy cả pool.
        // Bài record được GIAO đi cửa riêng (assignedExercises), miễn luật này nên vẫn hiện.
        sql`${schema.exercises.pathOrder} is not null`,
        // Cùng luật phạm vi như pool quiz ở trên — thiếu ở đây là bài riêng rò ra kho
        // đọc to/nói của user công khai.
        sql`(${schema.exercises.tagId} is null or exists (
          select 1 from tags where tags.id = ${schema.exercises.tagId} and tags.scope = 'all'
        ))`,
      ),
    )
    .orderBy(asc(schema.exercises.pathOrder), asc(schema.exercises.createdAt));
  // User ĐÃ chọn level → CHỈ bài record cùng level. Bỏ nhánh `!e.level` cũ: bài demo/test
  // không gắn level (test-reading, demo-record…) từng rò ra kho record của MỌI user có cấp độ.
  // User CHƯA có level → hiện bài chưa gắn level (đỡ rỗng trơn khi mới vào).
  const visible = exs.filter((e) => (levelName ? e.level === levelName : !e.level));

  // Điểm cao nhất + số lượt của user cho từng bài (reading & speaking riêng bảng).
  const rRows = await db
      .select({ exerciseId: schema.readingSubmissions.exerciseId, score: schema.readingSubmissions.pronScore })
      .from(schema.readingSubmissions)
      .where(eq(schema.readingSubmissions.userId, userId));
  const stat = new Map<string, { best: number; attempts: number }>();
  for (const r of rRows) {
    const s = stat.get(r.exerciseId) ?? { best: 0, attempts: 0 };
    s.best = Math.max(s.best, r.score);
    s.attempts++;
    stat.set(r.exerciseId, s);
  }

  const items = visible.map((e) => {
    const s = stat.get(e.id);
    return {
      exercise_id: e.exerciseId,
      title: e.title,
      kind: "reading" as const,
      skill: e.skill ?? null,
      level: e.level ?? null,
      best_score: s ? s.best : null,
      attempts: s ? s.attempts : 0,
      points: s ? recordPoints(s.best) : 0,
    };
  });
  return c.json({ level: levelName, items });
});

/** Lấy đề record cho user (passage/prompt để hiển thị màn ghi âm). */
library.post("/:slug/record", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const slug = c.req.param("slug");
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, slug) });
  if (!ex || !ex.published) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  const isWriting = ex.skill === "writing" && !!ex.speakingPrompt?.trim();
  // Bài KHÔNG phải ghi âm/viết (quiz / bộ thẻ) → trả CỜ 200 để client rẽ sang quiz, KHÔNG ném 400
  // (endpoint này là bước "dò loại bài"; ném 400 làm bẩn console dù luồng vẫn đúng).
  if (!ex.readAloud && !isWriting) {
    return c.json({ exercise_id: ex.exerciseId, title: ex.title, read_aloud: false, questions: [] } as PublicExercise);
  }
  const kind: RecordKind = isWriting ? "writing" : "reading";
  await requireRecordAccess(db, userId, slug, kind); // ném lỗi nếu không hợp lệ

  const out: PublicExercise = {
    exercise_id: ex.exerciseId,
    title: ex.title,
    skill: ex.skill ?? null,
    passage: ex.passage ?? null,
    passage_ipa: ex.passageIpa ?? null,
    audio_url: ex.audioUrl ?? null,
    audio_cues: ex.audioCues ?? null,
    read_aloud: ex.readAloud ?? false,
    writing: isWriting,
    speaking_prompt: ex.speakingPrompt ?? null,
    speaking_framework: ex.speakingFramework ?? null,
    speaking_image: ex.speakingImage ?? null,
    wordlist: ex.wordlist ?? null,
    questions: [],
  };
  // Writing: "Suggested vocabulary" = wordlist (keywords only) → resolved from the word bank.
  if (isWriting && ex.wordlist?.length) {
    out.wordlist_items = wordlistItems(ex.wordlist);
  }
  return c.json(out);
});

/** NỘP bản ghi ĐỌC TO (user): size cap + quota → lưu R2 + job(userId) + queue. */
library.post("/:slug/reading/grade", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex } = await requireRecordAccess(db, userId, c.req.param("slug"), "reading");

  const body = await c.req.parseBody();
  const audio = body.audio;
  if (!(audio instanceof File) || audio.size === 0) throw new HTTPException(400, { message: "Thiếu bản ghi âm" });
  if (audio.size > MAX_RECORD_BYTES) throw new HTTPException(413, { message: "Bản ghi quá lớn (tối đa 5MB)." });

  // Raw Azure results when the browser scored the take (Speech SDK, continuous mode).
  let browserSegments: AzureSegment[] | null = null;
  if (typeof body.segments === "string" && body.segments) {
    if (body.segments.length > MAX_SEGMENTS_BYTES) throw new HTTPException(413, { message: "Kết quả chấm quá lớn." });
    try {
      const parsed = JSON.parse(body.segments) as unknown;
      if (Array.isArray(parsed)) browserSegments = parsed as AzureSegment[];
    } catch {
      throw new HTTPException(400, { message: "Kết quả chấm không hợp lệ" });
    }
  }

  const grant = await resolveFeedbackGrant(db, userId, ex.id);

  const buf = await audio.arrayBuffer();
  const contentType = audio.type || "audio/webm";
  const audioKey = newReadingRecKey(recExt(contentType));
  await c.env.AUDIO.put(audioKey, buf, { httpMetadata: { contentType } });

  const [job] = await db
    .insert(schema.readingJobs)
    .values({ exerciseId: ex.id, userId, audioKey, contentType, browserSegments, status: "queued", withFeedback: grant.withFeedback })
    .returning({ id: schema.readingJobs.id });
  await c.env.INTERACTIVE_QUEUE.send({ jobId: job.id, type: "reading" });

  return c.json({ job_id: job.id, status: "queued", with_feedback: grant.withFeedback });
});

/** POLL chấm đọc to (user, cookie). Chỉ chủ nhân job xem được. */
library.post("/reading/jobs/:id", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const job = await db.query.readingJobs.findFirst({ where: eq(schema.readingJobs.id, c.req.param("id")) });
  if (!job || job.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });

  if (job.status === "error") return c.json({ status: "error", error: job.error ?? "Chấm bài thất bại, thử lại nhé." });
  if (job.status !== "done" || !job.submissionId) return c.json({ status: job.status });

  const sub = await db.query.readingSubmissions.findFirst({ where: eq(schema.readingSubmissions.id, job.submissionId) });
  if (!sub) throw new HTTPException(404, { message: "Không tìm thấy kết quả" });
  return c.json({ status: "done", result: await buildReadingResult(c.env, db, sub, { userId }) });
});

/** CHẤM LẠI lượt đọc bị lỗi — audio còn ở R2 nên KHÔNG cần upload lại. Chỉ chủ nhân, chỉ từ trạng thái error. */
library.post("/reading/jobs/:id/regrade", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const job = await db.query.readingJobs.findFirst({ where: eq(schema.readingJobs.id, c.req.param("id")) });
  if (!job || job.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });
  if (job.status === "done") return c.json({ status: "done" }); // đã xong, không cần chấm lại
  if (job.status !== "error") return c.json({ status: job.status }); // đang chạy → cứ chờ (tránh nhân đôi job)
  // Audio đã bị dọn/không còn → không chấm lại được, phải thu lại.
  if (!job.audioKey || !(await c.env.AUDIO.head(job.audioKey))) {
    throw new HTTPException(409, { message: "Bản ghi không còn để chấm lại — em thu lại giúp cô nhé." });
  }
  await db.update(schema.readingJobs).set({ status: "queued", error: null, updatedAt: new Date().toISOString() }).where(eq(schema.readingJobs.id, job.id));
  await c.env.INTERACTIVE_QUEUE.send({ jobId: job.id, type: "reading" });
  return c.json({ status: "queued" });
});

/** Lượt đọc to TỐT NHẤT của user cho 1 bài (mở lại hiện kết quả cao nhất). */
library.post("/:slug/reading/latest", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  const sub = await db.query.readingSubmissions.findFirst({
    where: and(eq(schema.readingSubmissions.exerciseId, ex.id), eq(schema.readingSubmissions.userId, userId)),
    orderBy: desc(schema.readingSubmissions.pronScore),
  });
  return c.json({ result: sub ? await buildReadingResult(c.env, db, sub, { userId }) : null });
});

// Vietnamese translation of a writing task's outline, on demand (only when the learner asks).
// The first translation is stored in `speakingFramework.outlineVi`, so later learners skip the AI call.
library.post("/:slug/outline-vi", async (c) => {
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex || !ex.published) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  const fw = ex.speakingFramework;
  const outline = fw?.outline ?? [];
  if (!outline.length) return c.json({ vi: [] });
  // Đã có bản dịch (khớp số ý) → trả cache trong DB, không gọi AI nữa.
  if (fw?.outlineVi && fw.outlineVi.length === outline.length) return c.json({ vi: fw.outlineVi });
  const out = (await runAiTask(c.env, "translate_outline", { outline })) as { vi: string[] };
  // A reply with the wrong number of lines would be cached and then never match again (and the
  // next click would pay for it again): return it, keep nothing.
  if (out.vi?.length !== outline.length) return c.json(out);
  // Lưu bản dịch vào DB cho lần sau; lỗi ghi thì bỏ qua, vẫn trả kết quả cho học sinh.
  try {
    await db
      .update(schema.exercises)
      .set({ speakingFramework: { ...fw!, outlineVi: out.vi } })
      .where(eq(schema.exercises.id, ex.id));
  } catch {
    /* ghi cache lỗi → thôi */
  }
  return c.json(out);
});

/** Mở lại báo cáo 1 lượt đọc to theo id (F5/URL). Chỉ chủ nhân xem được. */
library.post("/reading/result/:id", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const sub = await db.query.readingSubmissions.findFirst({ where: eq(schema.readingSubmissions.id, c.req.param("id")) });
  if (!sub || sub.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });
  return c.json({ result: await buildReadingResult(c.env, db, sub, { userId }) });
});

// ============================================================
//  Bài VIẾT (writing) — CLONE bài NÓI bỏ Azure/audio: nhận text thuần qua JSON, không multipart.
//  Quota RIÊNG (writingQuota) — tách hẳn khỏi record (đọc to/nói).
// ============================================================
const MIN_WRITING_WORDS = 40;
// C2's final project targets 1 200 words, so the cap has to sit above it or a learner who hits
// the target exactly gets rejected for overshooting by a sentence.
const MAX_WRITING_WORDS = 1500;

/** NỘP bài VIẾT (user): quota riêng → lưu text thẳng + job(userId) + queue. */
library.post("/:slug/writing/grade", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex } = await requireRecordAccess(db, userId, c.req.param("slug"), "writing");

  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string });
  const text = (body.text ?? "").trim();
  if (!text) throw new HTTPException(400, { message: "Thiếu bài viết" });
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WRITING_WORDS) throw new HTTPException(400, { message: `Bài quá ngắn — cần tối thiểu ${MIN_WRITING_WORDS} từ.` });
  if (wordCount > MAX_WRITING_WORDS) throw new HTTPException(400, { message: `Bài quá dài — tối đa ${MAX_WRITING_WORDS} từ.` });

  const [job] = await db
    .insert(schema.writingJobs)
    .values({ exerciseId: ex.id, userId, text, status: "queued" })
    .returning({ id: schema.writingJobs.id });
  await c.env.INTERACTIVE_QUEUE.send({ jobId: job.id, type: "writing" });

  return c.json({ job_id: job.id, status: "queued" });
});

/** POLL chấm viết (user, cookie). Chỉ chủ nhân job xem được. */
library.post("/writing/jobs/:id", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const job = await db.query.writingJobs.findFirst({ where: eq(schema.writingJobs.id, c.req.param("id")) });
  if (!job || job.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });

  if (job.status === "error") return c.json({ status: "error", error: job.error ?? "Chấm bài thất bại, thử lại nhé." });
  if (job.status !== "done" || !job.submissionId) return c.json({ status: job.status });

  const sub = await db.query.writingSubmissions.findFirst({ where: eq(schema.writingSubmissions.id, job.submissionId) });
  if (!sub) throw new HTTPException(404, { message: "Không tìm thấy kết quả" });
  return c.json({ status: "done", result: await buildWritingResult(db, sub, { userId }) });
});

/** Lượt viết TỐT NHẤT của user cho 1 bài. */
library.post("/:slug/writing/latest", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  const sub = await db.query.writingSubmissions.findFirst({
    where: and(eq(schema.writingSubmissions.exerciseId, ex.id), eq(schema.writingSubmissions.userId, userId)),
    orderBy: desc(schema.writingSubmissions.overallScore),
  });
  return c.json({ result: sub ? await buildWritingResult(db, sub, { userId }) : null });
});

/** Mở lại báo cáo 1 lượt viết theo id. */
library.post("/writing/result/:id", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const sub = await db.query.writingSubmissions.findFirst({ where: eq(schema.writingSubmissions.id, c.req.param("id")) });
  if (!sub || sub.userId !== userId) throw new HTTPException(404, { message: "Không tìm thấy lượt nộp" });
  return c.json({ result: await buildWritingResult(db, sub, { userId }) });
});

// Build the compact attempt list from rows (newest first). `outOf` carries the quiz denominator;
// record-based kinds score out of 100 and leave it null.
type HistoryRow = { id: string; score: number; audioKey?: string | null; outOf?: number | null; submittedAt: string };

function historyItems(rows: HistoryRow[]) {
  // Rank on the same scale the learner sees: a quiz attempt is 7/10, not 7.
  const pctOf = (r: HistoryRow) => (r.outOf ? (r.score / r.outOf) * 100 : r.score);
  const bestScore = rows.reduce((m, r) => Math.max(m, pctOf(r)), 0);
  let bestMarked = false;
  const count = rows.length;
  return rows.map((r, i) => {
    const isBest = !bestMarked && pctOf(r) === bestScore;
    if (isBest) bestMarked = true;
    return {
      submission_id: r.id,
      pron_score: Math.round(r.score * 10) / 10, // shared field: /100 for record, raw score for quiz
      out_of: r.outOf ?? null, // null → the score is already out of 100
      attempt_no: count - i,
      submitted_at: r.submittedAt,
      has_audio: !!r.audioKey,
      is_best: isBest,
    };
  });
}

/** Lịch sử các lượt đọc to của user cho 1 bài. */
library.post("/:slug/reading/history", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) return c.json({ items: [] });
  const rows = await db
    .select({
      id: schema.readingSubmissions.id,
      score: schema.readingSubmissions.pronScore,
      audioKey: schema.readingSubmissions.audioKey,
      submittedAt: schema.readingSubmissions.submittedAt,
    })
    .from(schema.readingSubmissions)
    .where(and(eq(schema.readingSubmissions.exerciseId, ex.id), eq(schema.readingSubmissions.userId, userId)))
    .orderBy(desc(schema.readingSubmissions.submittedAt));
  return c.json({ items: historyItems(rows) });
});

/** Lịch sử các lượt làm bài quiz (trắc nghiệm / điền từ / nghe chép) của user cho 1 bài. */
library.post("/:slug/quiz/history", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) return c.json({ items: [] });
  const rows = await db
    .select({
      id: schema.submissions.id,
      score: schema.submissions.score,
      outOf: schema.submissions.total,
      submittedAt: schema.submissions.submittedAt,
    })
    .from(schema.submissions)
    .where(and(eq(schema.submissions.exerciseId, ex.id), eq(schema.submissions.userId, userId)))
    .orderBy(desc(schema.submissions.submittedAt));
  return c.json({ items: historyItems(rows) });
});

/** Vocab-deck sessions this user ran for one exercise (`score` is already a percentage). */
library.post("/:slug/vocab/history", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) return c.json({ items: [] });
  const rows = await db
    .select({
      id: schema.vocabSubmissions.id,
      score: schema.vocabSubmissions.score,
      submittedAt: schema.vocabSubmissions.submittedAt,
    })
    .from(schema.vocabSubmissions)
    .where(and(eq(schema.vocabSubmissions.exerciseId, ex.id), eq(schema.vocabSubmissions.userId, userId)))
    .orderBy(desc(schema.vocabSubmissions.submittedAt));
  return c.json({ items: historyItems(rows) });
});

/** Lịch sử các lượt viết của user cho 1 bài. */
library.post("/:slug/writing/history", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) return c.json({ items: [] });
  const rows = await db
    .select({
      id: schema.writingSubmissions.id,
      score: schema.writingSubmissions.overallScore,
      submittedAt: schema.writingSubmissions.submittedAt,
    })
    .from(schema.writingSubmissions)
    .where(and(eq(schema.writingSubmissions.exerciseId, ex.id), eq(schema.writingSubmissions.userId, userId)))
    .orderBy(desc(schema.writingSubmissions.submittedAt));
  return c.json({ items: historyItems(rows) });
});

/**
 * Earlier DRAFTS of one writing task, with the text and the feedback — what /history deliberately
 * omits. The learner needs both open while revising, otherwise "revise on the feedback" means
 * "remember the feedback". Newest first; capped because only the last few are ever consulted.
 */
library.post("/:slug/writing/drafts", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, c.req.param("slug")) });
  if (!ex) return c.json({ items: [] });
  const rows = await db
    .select({
      id: schema.writingSubmissions.id,
      score: schema.writingSubmissions.overallScore,
      text: schema.writingSubmissions.text,
      wordCount: schema.writingSubmissions.wordCount,
      feedback: schema.writingSubmissions.aiFeedback,
      submittedAt: schema.writingSubmissions.submittedAt,
    })
    .from(schema.writingSubmissions)
    .where(and(eq(schema.writingSubmissions.exerciseId, ex.id), eq(schema.writingSubmissions.userId, userId)))
    .orderBy(desc(schema.writingSubmissions.submittedAt))
    .limit(5);
  // Numbering must come from the FULL history, not the page: with 7 submissions the newest is
  // draft 7, not draft 5.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.writingSubmissions)
    .where(and(eq(schema.writingSubmissions.exerciseId, ex.id), eq(schema.writingSubmissions.userId, userId)));
  // The best draft is what revision works from and what the judge is given, so it has to be found
  // over the FULL history too — with 6+ submissions it can fall outside this page, in which case it
  // is appended so the panel can still show it. Ties go to the later draft, as in writingJob.
  const [bestRow] = await db
    .select({ id: schema.writingSubmissions.id, submittedAt: schema.writingSubmissions.submittedAt })
    .from(schema.writingSubmissions)
    .where(and(eq(schema.writingSubmissions.exerciseId, ex.id), eq(schema.writingSubmissions.userId, userId)))
    .orderBy(desc(schema.writingSubmissions.overallScore), desc(schema.writingSubmissions.submittedAt))
    .limit(1);
  const page = rows.map((r, i) => ({ r, attemptNo: total - i })); // rows are newest-first
  if (bestRow && !page.some((p) => p.r.id === bestRow.id)) {
    const [extra] = await db
      .select({
        id: schema.writingSubmissions.id,
        score: schema.writingSubmissions.overallScore,
        text: schema.writingSubmissions.text,
        wordCount: schema.writingSubmissions.wordCount,
        feedback: schema.writingSubmissions.aiFeedback,
        submittedAt: schema.writingSubmissions.submittedAt,
      })
      .from(schema.writingSubmissions)
      .where(eq(schema.writingSubmissions.id, bestRow.id));
    // Its attempt number is how many drafts existed up to and including it.
    const [{ upTo }] = await db
      .select({ upTo: sql<number>`count(*)` })
      .from(schema.writingSubmissions)
      .where(
        and(
          eq(schema.writingSubmissions.exerciseId, ex.id),
          eq(schema.writingSubmissions.userId, userId),
          lte(schema.writingSubmissions.submittedAt, bestRow.submittedAt),
        ),
      );
    if (extra) page.push({ r: extra, attemptNo: upTo });
  }
  return c.json({
    items: page.map(({ r, attemptNo }) => ({
      submission_id: r.id,
      attempt_no: attemptNo,
      score: r.score,
      text: r.text,
      word_count: r.wordCount,
      feedback: r.feedback,
      submitted_at: r.submittedAt,
      is_best: r.id === bestRow?.id,
    })),
  });
});

// ============================================================
//  BÀI HỌC QUA VIDEO (YouTube) — nghe-viết + shadowing theo từng đoạn.
//  Gate như record: published + đúng loại (video) + (được giao HOẶC đúng level).
// ============================================================

/** Tìm bài video user được phép làm + tier + danh sách đoạn. Ném lỗi rõ nghĩa nếu không hợp lệ. */
async function requireVideoAccess(
  db: ReturnType<typeof getDb>,
  userId: string,
  slug: string,
): Promise<{ ex: ExerciseRow; segments: VideoSegment[]; modes: VideoMode[] }> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new HTTPException(404, { message: "Không tìm thấy tài khoản" });

  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.exerciseId, slug) });
  if (!ex || !ex.published) throw new HTTPException(404, { message: "Không tìm thấy bài tập" });
  if (!ex.video) throw new HTTPException(400, { message: "Bài này không phải bài Nghe & Nói" });
  const segments = (ex.videoSegments ?? []).filter((s) => s && s.text?.trim());
  // Nguồn media: audio (audio_url) | video (youtube_id). Bài cũ chưa có media_source → suy theo cột.
  const source = ex.mediaSource ?? (ex.youtubeId ? "video" : "audio");
  const hasMedia = source === "audio" ? !!ex.audioUrl : !!ex.youtubeId;
  if (!segments.length || !hasMedia) throw new HTTPException(400, { message: "Bài Nghe & Nói chưa có nội dung" });

  // Gate LEVEL — by CEFR GROUP, matching exactly what levelVideos puts on the shelf. An
  // exact-level check here would 403 on lessons the library itself just listed. Assigned work
  // still bypasses everything (see requireRecordAccess).
  const isAssigned = (await assignedExercises(db, userId)).some((e) => e.exerciseId === slug);
  if (!isAssigned && user.levelId && ex.level) {
    const level = await db.query.levels.findFirst({ where: eq(schema.levels.id, user.levelId) });
    const mine = cefrOfLevelName(level?.name);
    const theirs = cefrOfLevelName(ex.level);
    const sameGroup = mine && theirs && CEFR_GROUP[mine] === CEFR_GROUP[theirs];
    if (level && ex.level !== level.name && !sameGroup) {
      throw new HTTPException(403, { message: "Bài này không thuộc cấp độ của bạn." });
    }
  }

  const modes: VideoMode[] = ex.videoModes?.length ? ex.videoModes : ["dictation", "shadowing"];
  return { ex, segments, modes };
}

/** Lấy bài video cho user (theo chế độ). shadowing → text đầy đủ; dictation → đã che đáp án. */
library.post("/:slug/video", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => ({}))) as { mode?: VideoMode };
  const { ex, segments, modes } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const mode: VideoMode = body.mode && modes.includes(body.mode) ? body.mode : modes[0];

  const source = ex.mediaSource ?? (ex.youtubeId ? "video" : "audio");
  const out: PublicVideoLesson = {
    exercise_id: ex.exerciseId,
    title: ex.title,
    media_source: source,
    youtube_id: source === "video" ? ex.youtubeId : null,
    audio_url: source === "audio" ? ex.audioUrl : null,
    audio_cues: source === "audio" ? ex.audioCues ?? null : null,
    video_lang: ex.videoLang ?? null,
    mode,
    modes,
    segments: segments.map((s) => publicSegment(s, mode)),
  };
  // Shadowing: hand back the takes already graded so a reload (or coming back to a line) shows the
  // marked-up words again instead of an empty recorder. Rows with no detail are pre-0145 takes.
  if (mode === "shadowing") {
    const rows = await db
      .select({ segment: schema.videoShadowScores.segment, detail: schema.videoShadowScores.detail })
      .from(schema.videoShadowScores)
      .where(and(eq(schema.videoShadowScores.userId, userId), eq(schema.videoShadowScores.exerciseId, ex.id)));
    out.shadow_done = rows
      .filter((r): r is { segment: number; detail: VideoShadowDetail } => r.detail != null)
      .map((r) => ({ segment: r.segment, detail: r.detail }));
  }
  // Same deal for the typing mode: the lines already cleared travel WITH the lesson, so a learner
  // signing in on another device resumes instead of starting over. The local draft used to be the
  // only memory dictation had, and it never left the browser it was typed in.
  if (mode === "dictation") {
    const rows = await db
      .select({
        segment: schema.videoDictationScores.segment,
        attempts: schema.videoDictationScores.attempts,
        hints: schema.videoDictationScores.hints,
        firstOk: schema.videoDictationScores.firstOk,
        revealed: schema.videoDictationScores.revealed,
        level: schema.videoDictationScores.level,
      })
      .from(schema.videoDictationScores)
      .where(
        and(
          eq(schema.videoDictationScores.userId, userId),
          eq(schema.videoDictationScores.exerciseId, ex.id),
          eq(schema.videoDictationScores.done, true),
        ),
      );
    out.dict_done = rows.map((r) => ({
      segment: r.segment,
      attempts: r.attempts,
      hints: r.hints,
      first_ok: r.firstOk,
      revealed: r.revealed,
      level: r.level,
    }));
  }
  return c.json(out);
});

// ── NGHE-VIẾT: vòng luyện TỨC THÌ theo từng câu (check→sửa→đúng), không nộp bài tổng hợp ──

/** Lấy 1 đoạn theo index (ném lỗi nếu không hợp lệ). */
function pickSegment(segments: VideoSegment[], raw: unknown): VideoSegment {
  const seg = segments.find((s) => s.i === Number(raw));
  if (!seg) throw new HTTPException(400, { message: "Đoạn không hợp lệ" });
  return seg;
}

// Band lân cận để lọc danh mục ngữ pháp gợi ý (bài A2 thì gợi ý A1-B1, không lôi cả C2 vào).
const NEAR_BANDS: Record<string, string[]> = {
  "Pre-A1": ["Pre-A1", "A1"],
  A1: ["Pre-A1", "A1", "A2"],
  A2: ["A1", "A2", "B1"],
  B1: ["A2", "B1", "B2"],
  B2: ["B1", "B2", "C1"],
  C1: ["B2", "C1", "C2"],
  C2: ["C1", "C2"],
};

/** Độ khó do CLIENT gửi (chỉ để tính hệ số điểm) — lọc trắng, giá trị lạ coi như không có. */
const dictLevel = (v?: string | null): string | null =>
  v && ["easy", "medium", "hard", "hardest"].includes(v) ? v : null;

/** CHECK 1 câu tức thì — trả đúng/sai (per-blank), CHỈ lộ đáp án khi đã đúng. Ghi tiến độ. */
library.post("/:slug/video/dictation/check", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const body = (await c.req.json().catch(() => ({}))) as { segment?: number; sentence?: string; blanks?: string[]; level?: string };
  const seg = pickSegment(segments, body.segment);

  const res = checkDictation(seg, { segment: seg.i, sentence: body.sentence, blanks: body.blanks });
  const { done_count } = await recordDictationCheck(db, userId, ex.id, seg.i, res.correct, segments, dictLevel(body.level));
  return c.json({ ...res, done_count, total: segments.length });
});

/**
 * Per-word hint: `word` is the blank the caret is in, `level` the level that word is now open to
 * (1..DICTATION_HINT_MAX), `total` the levels opened across the line. The stored total is clamped to
 * what the line's blanks at `rung` can give away, so the client cannot price a line arbitrarily.
 */
library.post("/:slug/video/dictation/hint", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const body = (await c.req.json().catch(() => ({}))) as { segment?: number; word?: number; level?: number; total?: number; rung?: string };
  const seg = pickSegment(segments, body.segment);
  const level = Math.max(1, Math.min(DICTATION_HINT_MAX, Number(body.level) || 1));
  const word = Number.isInteger(body.word) ? Number(body.word) : undefined;
  const rung = (dictLevel(body.rung) ?? "medium") as VideoDictLevel;
  const opened = Math.max(level, Math.min(dictationHintCap(seg.text, rung), Math.round(Number(body.total) || 0)));

  const targets = dictationHint(seg, level, word);
  await recordDictationHint(db, userId, ex.id, seg.i, opened, segments);
  return c.json({ segment: seg.i, word, level, targets });
});

/** XEM ĐÁP ÁN (bỏ cuộc) — trả câu đúng, đánh dấu đã xong (không tính đúng-lần-đầu). */
library.post("/:slug/video/dictation/reveal", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const body = (await c.req.json().catch(() => ({}))) as { segment?: number; level?: string };
  const seg = pickSegment(segments, body.segment);

  const { done_count } = await recordDictationReveal(db, userId, ex.id, seg.i, segments, dictLevel(body.level));
  return c.json({ segment: seg.i, expected: seg.text, done_count, total: segments.length });
});

/**
 * TỔNG KẾT bài Nghe & Nói: số liệu nghe-viết + nói nhại + điểm + những câu vật lộn nhất.
 * Một chỗ duy nhất để nhìn lại buổi học — trước đây làm xong câu cuối là hết, không có gì.
 */
/**
 * Aggregate rows a video lesson writes to: `submissions` for dictation, `reading_submissions`
 * (audio_key "video:<id>") for shadowing. A session may have either or both, so the session
 * feedback has to be stored on whichever exists — writing only to `submissions` silently threw
 * the feedback away for anyone who had only ever shadowed, after charging them a quota unit.
 */
async function findVideoAggregates(db: Db, userId: string, exerciseRowId: string) {
  const [quiz, shadow] = await Promise.all([
    db.query.submissions.findFirst({
      where: and(eq(schema.submissions.userId, userId), eq(schema.submissions.exerciseId, exerciseRowId)),
    }),
    db.query.readingSubmissions.findFirst({
      where: and(
        eq(schema.readingSubmissions.userId, userId),
        eq(schema.readingSubmissions.exerciseId, exerciseRowId),
        eq(schema.readingSubmissions.audioKey, videoAudioKey(exerciseRowId)),
      ),
    }),
  ]);
  return { quiz, shadow };
}

type VideoAggregates = Awaited<ReturnType<typeof findVideoAggregates>>;

/** Stored session feedback — dictation row wins, shadowing row is the fallback. */
function savedFeedback(aggs: VideoAggregates) {
  const row = aggs.quiz?.teacherFeedback ? aggs.quiz : aggs.shadow?.teacherFeedback ? aggs.shadow : null;
  return { feedback: row?.teacherFeedback ?? null, grammarIds: row?.feedbackGrammar ?? [] };
}

/** Write the feedback to every aggregate the session has, so a reload always finds it. */
async function saveVideoFeedback(db: Db, aggs: VideoAggregates, feedback: string, grammarIds: string[]) {
  const set = { teacherFeedback: feedback, feedbackGrammar: grammarIds.length ? grammarIds : null };
  if (aggs.quiz) await db.update(schema.submissions).set(set).where(eq(schema.submissions.id, aggs.quiz.id));
  if (aggs.shadow)
    await db.update(schema.readingSubmissions).set(set).where(eq(schema.readingSubmissions.id, aggs.shadow.id));
}

library.post("/:slug/video/report", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const [dict, shadowRows, aggs] = await Promise.all([
    getDictationProgress(db, userId, ex.id),
    db
      .select({ segment: schema.videoShadowScores.segment, score: schema.videoShadowScores.score })
      .from(schema.videoShadowScores)
      .where(and(eq(schema.videoShadowScores.userId, userId), eq(schema.videoShadowScores.exerciseId, ex.id))),
    findVideoAggregates(db, userId, ex.id),
  ]);
  const saved = savedFeedback(aggs);
  const gIds = saved.grammarIds;
  const gRows = gIds.length
    ? await db
        .select({ id: schema.grammar.id, title: schema.grammar.title, cefr: schema.grammar.cefr })
        .from(schema.grammar)
        .where(inArray(schema.grammar.id, gIds))
    : [];
  const textOf = new Map(segments.map((s) => [s.i, s.text]));
  const texts = segments.map((s) => s.text);
  const done = dict.filter((r) => r.done);

  // Words the learner actually typed — blanks filled, counted at the level each line was done at.
  const levelOf = (r: { level?: string | null }) => (dictLevel(r.level) ?? "medium") as VideoDictLevel;
  const typedWords = done.reduce((n, r) => n + videoDictBlanks(textOf.get(r.segment) ?? "", levelOf(r)).length, 0);
  // Longest run of CONSECUTIVE lines typed right on the first try — the stat worth bragging about.
  let streak = 0;
  let run = 0;
  let prev = -2;
  for (const r of [...dict].sort((a, b) => a.segment - b.segment)) {
    run = r.first_ok ? (r.segment === prev + 1 ? run + 1 : 1) : 0;
    if (r.first_ok) prev = r.segment;
    streak = Math.max(streak, run);
  }
  const days = new Set(dict.map((r) => (r.updated_at ?? "").slice(0, 10)).filter(Boolean)).size;
  // The WORDS behind the struggle: every blank of a line that needed the deepest hint or a reveal.
  // Per-line stats say "this line was hard"; these say WHICH word to look up.
  const trickySeen = new Set<string>();
  const tricky: { word: string; segment: number; why: "hint" | "revealed" }[] = [];
  for (const r of [...dict].filter((x) => x.revealed || x.hints >= 3).sort((a, b) => a.segment - b.segment)) {
    const text = textOf.get(r.segment) ?? "";
    const words = text.trim().split(/\s+/);
    for (const i of videoDictBlanks(text, levelOf(r))) {
      const w = (words[i] ?? "").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
      const key = w.toLowerCase();
      if (!w || trickySeen.has(key)) continue;
      trickySeen.add(key);
      tricky.push({ word: w, segment: r.segment, why: r.revealed ? "revealed" : "hint" });
    }
  }

  return c.json({
    title: ex.title,
    level: ex.level ?? null,
    total: segments.length,
    dictation: {
      done: done.length,
      first_ok: dict.filter((r) => r.first_ok).length,
      revealed: dict.filter((r) => r.revealed).length,
      hint_lines: dict.filter((r) => r.hints > 0).length,
      points: dictationPoints(dict, (r) => textOf.get((r as { segment: number }).segment) ?? ""),
      typed_words: typedWords,
      streak,
      days,
      tricky: tricky.slice(0, 24),
      // Câu vật lộn nhiều nhất — đây mới là thứ đáng nhìn lại, không phải danh sách 200 câu.
      hardest: dict
        .filter((r) => r.attempts > 1 || r.revealed || r.hints > 0)
        .sort((a, b) => b.attempts + (b.revealed ? 5 : 0) - (a.attempts + (a.revealed ? 5 : 0)))
        .slice(0, 8)
        .map((r) => ({ segment: r.segment, text: textOf.get(r.segment) ?? "", attempts: r.attempts, hints: r.hints, revealed: r.revealed })),
    },
    shadow: {
      done: shadowRows.length,
      avg: shadowRows.length ? Math.round(shadowRows.reduce((s, r) => s + r.score, 0) / shadowRows.length) : 0,
      points: shadowPoints(shadowRows, (seg: number) => textOf.get(seg) ?? ""),
      // Only lines that actually fell short — not just the bottom 5 of a good run.
      weakest: shadowRows
        .filter((r) => r.score < WEAK_PRON_SCORE)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map((r) => ({ segment: r.segment, text: textOf.get(r.segment) ?? "", score: r.score })),
    },
    max: {
      dictation: { easy: dictationLessonMax(texts, "easy"), medium: dictationLessonMax(texts, "medium"), hard: dictationLessonMax(texts, "hard"), hardest: dictationLessonMax(texts, "hardest") },
      shadow: shadowLessonMax(texts),
    },
    feedback: saved.feedback,
    grammar: gRows,
  });
});

/** NHẬN XÉT của cô cho bài Nghe & Nói — dùng chung ví quota nhận xét (free 3 / pro 15). */
library.post("/:slug/video/feedback", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const body = (await c.req.json().catch(() => ({}))) as { level?: string; regen?: boolean };
  const aggs = await findVideoAggregates(db, userId, ex.id);
  const already = savedFeedback(aggs);
  // Already written: hand back the STORED copy — no AI call, no quota spent. `regen` is the way
  // out for a learner who practised more since: it costs a fresh grant and overwrites.
  if (already.feedback && !body.regen) {
    const grammar = already.grammarIds.length
      ? await db
          .select({ id: schema.grammar.id, title: schema.grammar.title, cefr: schema.grammar.cefr })
          .from(schema.grammar)
          .where(inArray(schema.grammar.id, already.grammarIds))
      : [];
    return c.json({ feedback: already.feedback, grammar, cached: true });
  }

  const [dict, shadowRows, user] = await Promise.all([
    getDictationProgress(db, userId, ex.id),
    db
      .select({ segment: schema.videoShadowScores.segment, score: schema.videoShadowScores.score })
      .from(schema.videoShadowScores)
      .where(and(eq(schema.videoShadowScores.userId, userId), eq(schema.videoShadowScores.exerciseId, ex.id))),
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
  ]);
  const doneCount = dict.filter((r) => r.done).length;
  if (!doneCount && !shadowRows.length)
    throw new HTTPException(400, { message: "Em làm vài câu đã rồi cô nhận xét nhé!" });

  const textOf = new Map(segments.map((s) => [s.i, s.text]));
  // Danh mục ngữ pháp để AI CHỌN (không tự bịa tên) — lọc quanh band của bài cho đỡ nhiễu.
  const bands = ex.level ? NEAR_BANDS[ex.level] ?? null : null;
  const gQuery = db
    .select({ id: schema.grammar.id, title: schema.grammar.title, cefr: schema.grammar.cefr })
    .from(schema.grammar);
  const gOpts = await (bands ? gQuery.where(inArray(schema.grammar.cefr, bands as Cefr[])) : gQuery).limit(60);
  const out = await runAiTask<{ feedback: string; grammar_ids?: string[] | null }>(c.env, "video_feedback", {
    title: ex.title,
    level: ex.level ?? null,
    name: user?.name ?? null,
    gender: (user?.gender ?? null) as "male" | "female" | "other" | null,
    age: user?.birthYear && user.birthYear > 1900 ? new Date().getUTCFullYear() - user.birthYear : null,
    dictation: {
      level: dictLevel(body.level) ?? "medium",
      done: doneCount,
      total: segments.length,
      first_ok: dict.filter((r) => r.first_ok).length,
      revealed: dict.filter((r) => r.revealed).length,
      hint_lines: dict.filter((r) => r.hints > 0).length,
      hardest: dict
        .filter((r) => r.attempts > 1 || r.revealed || r.hints > 0)
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 8)
        .map((r) => ({ text: textOf.get(r.segment) ?? "", attempts: r.attempts, hints: r.hints, revealed: r.revealed })),
    },
    shadow: shadowRows.length
      ? {
          done: shadowRows.length,
          total: segments.length,
          avg: Math.round(shadowRows.reduce((s, r) => s + r.score, 0) / shadowRows.length),
          weakest: shadowRows
            .filter((r) => r.score < WEAK_PRON_SCORE)
            .sort((a, b) => a.score - b.score)
            .slice(0, 5)
            .map((r) => ({ text: textOf.get(r.segment) ?? "", score: r.score })),
        }
      : null,
    grammar_options: gOpts,
  });
  const feedback = out?.feedback?.trim();
  if (!feedback) throw new HTTPException(502, { message: "Cô chưa viết được nhận xét, em thử lại sau nhé." });
  const okIds = new Set(gOpts.map((g) => g.id));
  const grammarIds = (out?.grammar_ids ?? []).filter((id) => okIds.has(id)).slice(0, 3);
  await saveVideoFeedback(db, aggs, feedback, grammarIds);
  const grammar = grammarIds.length ? gOpts.filter((g) => grammarIds.includes(g.id)) : [];
  return c.json({ feedback, grammar, cached: false });
});

/** TIẾN ĐỘ + THỐNG KÊ của user cho bài này (để nạp lại + hiện danh sách câu + số liệu học). */
library.post("/:slug/video/progress", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));
  const dictation = await getDictationProgress(db, userId, ex.id);
  return c.json({ total: segments.length, dictation });
});

/** Chấm SHADOWING một ĐOẠN (đồng bộ, phản hồi tại chỗ). Quota RIÊNG; KHÔNG lưu điểm (feedback-only MVP). */
library.post("/:slug/video/shadow", async (c) => {
  const { id: userId } = c.get("user");
  const db = getDb(c.env.DB);
  const { ex, segments } = await requireVideoAccess(db, userId, c.req.param("slug"));

  const form = await c.req.parseBody();
  const audio = form.audio;
  const segIdx = Number(form.segment);
  const seg = segments.find((s) => s.i === segIdx);
  if (!seg) throw new HTTPException(400, { message: "Đoạn không hợp lệ" });
  if (!(audio instanceof File) || audio.size === 0) throw new HTTPException(400, { message: "Thiếu bản ghi âm" });
  if (audio.size > MAX_RECORD_BYTES) throw new HTTPException(413, { message: "Bản ghi quá lớn (tối đa 5MB)." });

  const buf = await audio.arrayBuffer();
  const assess = await assessPronunciation(c.env, {
    audio: buf,
    contentType: audio.type || "audio/webm",
    filename: audio.name || "shadow.webm",
    referenceText: seg.text,
  });
  // Azure's own scores; pace and word counts are for display.
  const pace = readingPace(assess.words);
  const detail: VideoShadowDetail = {
    score: assess.pronScore,
    fidelity: assess.accuracy,
    fluency: assess.fluency,
    prosody: assess.prosody,
    clarity: assess.completeness,
    wpm: pace?.wpm ?? null,
    pause_pct: pace?.pausePct ?? null,
    omissions: assess.words.filter((w) => w.errorType === "Omission").length,
    insertions: assess.words.filter((w) => w.errorType === "Insertion").length,
    words: assess.words,
    weak_phonemes: collectWeakPhonemes(assess.words).map((p) => p.phoneme),
    transcript: assess.transcript,
  };
  // Store the segment score + its detail (best kept) + refresh the lesson total → feeds
  // points/streak/leaderboard, and lets a reload show the marked-up line again.
  const agg = await recordVideoShadow(db, userId, ex.id, seg.i, assess.pronScore, segments, detail);

  return c.json({
    segment: seg.i,
    ...detail,
    overall: agg, // { avg, done, total } — lesson-wide aggregate
  });
});

export default library;
