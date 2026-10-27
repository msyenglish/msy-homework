// ============================================================
//  Phân tích toàn diện quá trình học của MỘT user công khai.
//  Tính TRỰC TIẾP từ submissions + reading_submissions (không bảng tổng hợp),
//  gom theo thời gian thực để dựng dashboard (KPI, timeline, kỹ năng, loại câu,
//  lịch nhiệt, phát âm). Dùng chung cho giáo viên (xem user) và user tự xem.
// ============================================================
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { pointScopeKey, pointsToLevel, quizPoints, recordPoints, vocabGradedScore, skillLabel, questionTypeLabel, type Level, type Skill, type QuestionType, type GradeDetail } from "@msyen/shared";
import { schema, type Db } from "../db";
import { levelOut } from "./serialize";
import { getLeaderboard } from "./leaderboard";
import { inChunks } from "./bind";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày theo lịch VN (YYYY-MM-DD) từ một ISO UTC. */
function vnDay(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}
/** Ngày VN (YYYY-MM-DD) của thứ Hai đầu tuần chứa mốc `iso`. */
function vnWeekStart(iso: string): string {
  const vn = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const diff = (vn.getUTCDay() + 6) % 7; // số ngày kể từ thứ Hai
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - diff))
    .toISOString()
    .slice(0, 10);
}
/** "dd/MM" cho nhãn trục. */
function ddmm(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}
function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface UserAnalytics {
  user: { id: string; name: string | null; avatar_url: string | null; email: string | null; level: Level | null };
  kpis: {
    total_points: number;
    exercises_done: number;
    avg_accuracy: number; // %, theo bài làm tốt nhất mỗi bài
    streak_days: number;
    best_streak_days: number; // highest the streak has ever reached
    /** Consecutive idle days up to yesterday. 0 while the streak is alive. */
    streak_missed_days: number;
    /** What the streak loses if today ends with no practice (0 once today counts). */
    streak_next_penalty: number;
    rank: number | null; // hạng toàn thời gian trên BXH
  };
  timeline: { week: string; label: string; points: number; accuracy: number | null }[];
  /** `accuracy` = mean of the best result per exercise (0-100); `exercises` = how many fed it. */
  skills: { skill: Skill; label: string; exercises: number; accuracy: number }[];
  question_types: { type: QuestionType; label: string; correct: number; total: number; accuracy: number }[];
  heatmap: { date: string; count: number }[]; // 182 ngày gần nhất
  pronunciation: {
    has_data: boolean;
    count: number;
    avg_pron: number;
    avg_accuracy: number;
    avg_fluency: number;
    avg_completeness: number;
    avg_prosody: number | null;
    trend: { date: string; label: string; score: number }[];
  };
  // XP level derived from total points (same curve as the library hero badge).
  xp: { level: number; points: number; into: number; need: number; percent: number };
  // How far the learner is along the path of their current level.
  path: { level: string | null; done: number; total: number; percent: number };
  // Writing — 4 criteria (content, organisation, grammar, vocabulary), averaged over every take.
  writing: {
    has_data: boolean;
    count: number;
    avg_overall: number;
    avg_task: number | null;
    avg_coherence: number | null;
    avg_grammar: number | null;
    avg_lexical: number | null;
    avg_words: number;
    trend: { date: string; label: string; score: number }[];
  };
  // Grammar points the learner keeps missing (from questions.grammar_id on wrong answers).
  grammar_weak: { id: string; title: string; category: string | null; cefr: string | null; wrong: number; seen: number }[];
  // Nghe & Nói (bài video): nghe-viết theo câu + shadowing theo đoạn — hoạt động riêng, không
  // trộn vào thẻ "đọc to" (cùng bảng reading_submissions nhưng khác hẳn kiểu luyện).
  video: {
    has_data: boolean;
    lessons: number; // số bài Nghe & Nói đã đụng tới
    dict_segments: number; // số câu nghe-viết đã xong
    dict_total: number; // số câu đã đụng tới (kể cả chưa xong)
    dict_first_ok: number; // số câu đúng ngay lần gõ đầu
    dict_first_ok_pct: number;
    hints: number; // số lần mở gợi ý
    revealed: number; // số câu phải xin đáp án
    shadow_segments: number; // số đoạn đã nói nhại
    shadow_avg: number; // điểm phát âm trung bình các đoạn đã nói
  };
}

const TIMELINE_WEEKS = 12;
const HEATMAP_DAYS = 182;

export async function getUserAnalytics(db: Db, userId: string, now: Date): Promise<UserAnalytics | null> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return null;

  const [subs, reads, vocabs, levels, board, writes, dictRows, shadowRows, grammars] = await Promise.all([
    db
      .select({
        exerciseId: schema.submissions.exerciseId,
        score: schema.submissions.score,
        total: schema.submissions.total,
        details: schema.submissions.details,
        hintUsed: schema.submissions.hintUsed,
        points: schema.submissions.points,
        submittedAt: schema.submissions.submittedAt,
      })
      .from(schema.submissions)
      .where(eq(schema.submissions.userId, userId)),
    db
      .select({
        exerciseId: schema.readingSubmissions.exerciseId,
        pronScore: schema.readingSubmissions.pronScore,
        accuracy: schema.readingSubmissions.accuracy,
        fluency: schema.readingSubmissions.fluency,
        completeness: schema.readingSubmissions.completeness,
        prosody: schema.readingSubmissions.prosody,
        points: schema.readingSubmissions.points,
        audioKey: schema.readingSubmissions.audioKey,
        submittedAt: schema.readingSubmissions.submittedAt,
      })
      .from(schema.readingSubmissions)
      .where(eq(schema.readingSubmissions.userId, userId)),
    // Từ vựng — CẢ buổi TỰ luyện lẫn bộ thẻ cô giao (trước đây tự luyện bị bỏ ngoài dashboard).
    db
      .select({
        id: schema.vocabSubmissions.id,
        exerciseId: schema.vocabSubmissions.exerciseId,
        points: schema.vocabSubmissions.points,
        result: schema.vocabSubmissions.result,
        submittedAt: schema.vocabSubmissions.submittedAt,
      })
      .from(schema.vocabSubmissions)
      .where(eq(schema.vocabSubmissions.userId, userId)),
    db.select().from(schema.levels),
    getLeaderboard(db, "all", now), // cached for a few minutes (see leaderboard.ts)
    db
      .select({
        exerciseId: schema.writingSubmissions.exerciseId,
        overallScore: schema.writingSubmissions.overallScore,
        taskBand: schema.writingSubmissions.taskBand,
        coherenceBand: schema.writingSubmissions.coherenceBand,
        grammarBand: schema.writingSubmissions.grammarBand,
        lexicalBand: schema.writingSubmissions.lexicalBand,
        wordCount: schema.writingSubmissions.wordCount,
        submittedAt: schema.writingSubmissions.submittedAt,
      })
      .from(schema.writingSubmissions)
      .where(eq(schema.writingSubmissions.userId, userId)),
    db
      .select()
      .from(schema.videoDictationScores)
      .where(eq(schema.videoDictationScores.userId, userId)),
    // Not `detail`: the per-word result of every take, read only by the lesson page.
    db
      .select({ exerciseId: schema.videoShadowScores.exerciseId, score: schema.videoShadowScores.score })
      .from(schema.videoShadowScores)
      .where(eq(schema.videoShadowScores.userId, userId)),
    db
      .select({
        id: schema.grammarSubmissions.id,
        points: schema.grammarSubmissions.points,
        correct: schema.grammarSubmissions.correct,
        total: schema.grammarSubmissions.total,
        result: schema.grammarSubmissions.result,
        submittedAt: schema.grammarSubmissions.submittedAt,
      })
      .from(schema.grammarSubmissions)
      .where(eq(schema.grammarSubmissions.userId, userId)),
  ]);

  // Skill per exercise, for the exercises this learner actually touched. Reading the whole table
  // (1.5k+ rows) to resolve a few dozen ids made every dashboard load scale with the content bank.
  const touchedIds = [
    ...new Set(
      [...subs, ...reads, ...writes, ...vocabs]
        .map((r) => r.exerciseId)
        .filter((id): id is string => !!id),
    ),
  ];
  const exercises = await inChunks(touchedIds, (ids) =>
    db.select({ id: schema.exercises.id, skill: schema.exercises.skill }).from(schema.exercises).where(inArray(schema.exercises.id, ids)),
  );
  const skillByEx = new Map<string, Skill | null>(exercises.map((e) => [e.id, e.skill ?? null]));
  const levelById = new Map<string, Level>(levels.map((l) => [l.id, levelOut(l)]));

  // ---- Chuẩn hóa MỌI lượt nộp (quiz + đọc-to + nói) về một dạng có ĐIỂM để tính chung.
  // record: điểm 0-100 → recordPoints, quy % đúng về thang /100. Bài id duy nhất nên 3 nguồn
  // không đụng key. Xem quyết định "gộp chung hết".
  interface Scored { exId: string; points: number; corr: number; tot: number; at: string }
  const scored: Scored[] = [
    ...subs.map((s) => ({ exId: s.exerciseId, points: s.points ?? quizPoints(s.score, !!s.hintUsed), corr: s.score, tot: s.total, at: s.submittedAt })),
    ...reads.map((r) => ({ exId: pointScopeKey(r.exerciseId, r.audioKey), points: r.points ?? recordPoints(r.pronScore), corr: r.pronScore, tot: 100, at: r.submittedAt })),
    // Bài VIẾT chấm thang /100 như bài nói → cùng cách quy điểm; thiếu dòng này thì kỹ năng
    // "Viết" không bao giờ có mặt trong radar/điểm.
    ...writes.map((r) => ({ exId: r.exerciseId, points: recordPoints(r.overallScore), corr: r.overallScore, tot: 100, at: r.submittedAt })),
    // Vocab: quy {correct,total} loại flashcard; buổi chỉ-flashcard (total 0) bỏ qua. Khoá theo
    // LƯỢT nộp — điểm là tiến bộ trí nhớ, tự nó không lặp lại được nên không gộp best-per-exercise.
    ...vocabs
      .map((v) => ({ v, g: vocabGradedScore(v.result) }))
      .filter((x) => x.g.total > 0)
      .map(({ v, g }) => ({
        exId: `vocab:${v.id}`,
        points: v.points ?? (v.exerciseId ? quizPoints(g.correct) : 0),
        corr: g.correct,
        tot: g.total,
        at: v.submittedAt,
      })),
    // Grammar drills: same rule as vocab — keyed per SESSION, points are memory progress.
    ...grammars.map((g) => ({ exId: `grammar:${g.id}`, points: g.points, corr: g.correct, tot: g.total, at: g.submittedAt })),
  ];

  // ---- Best-per-exercise (điểm & độ chính xác "thành thạo") ----
  const best = new Map<string, { points: number; corr: number; tot: number }>();
  for (const s of scored) {
    const cur = best.get(s.exId);
    if (!cur || s.points > cur.points) best.set(s.exId, { points: s.points, corr: s.corr, tot: s.tot });
  }
  let totalPoints = 0;
  let bestCorrect = 0;
  let bestTotal = 0;
  for (const b of best.values()) {
    totalPoints += b.points;
    bestCorrect += b.corr;
    bestTotal += b.tot;
  }

  // ---- Skill accuracy: MEAN of the best result per exercise, NOT a pooled correct/total ----
  // Pooling was wrong the moment one skill mixed units. A listening quiz scores 6/11 QUESTIONS
  // while a video dictation of the same skill scores 35/221 WORDS — pooled, the 221-word
  // denominator drowns the quiz and Listening reads ~11% for a learner who is doing fine.
  // One exercise = one data point, each normalised to 0-100 first.
  const skillPct = new Map<Skill, number[]>();
  const pushPct = (sk: Skill, corr: number, tot: number) => {
    if (tot <= 0) return;
    skillPct.set(sk, [...(skillPct.get(sk) ?? []), Math.min(100, (corr / tot) * 100)]);
  };
  // Video lessons are measured from their per-SEGMENT rows below, not from the submission row:
  // that row carries cumulative PROGRESS (words typed so far / words in the whole video), so a
  // learner two sentences into a long video would look like 3% accuracy.
  const videoExIds = new Set([...dictRows, ...shadowRows].map((r) => r.exerciseId));
  for (const [exId, b] of best) {
    const sk = skillByEx.get(exId);
    if (sk && !videoExIds.has(exId)) pushPct(sk, b.corr, b.tot);
  }
  // One data point per video lesson: how many of the segments the learner actually touched were
  // right on the FIRST check (hints/reveals count against it, exactly like the video panel).
  const dictByEx = new Map<string, { ok: number; n: number }>();
  for (const r of dictRows) {
    const a = dictByEx.get(r.exerciseId) ?? { ok: 0, n: 0 };
    a.ok += r.firstOk ? 1 : 0;
    a.n += 1;
    dictByEx.set(r.exerciseId, a);
  }
  for (const [exId, a] of dictByEx) {
    const sk = skillByEx.get(exId);
    if (sk) pushPct(sk, a.ok, a.n);
  }
  // Vocabulary sessions are not tied to `exercises` (self-practice) and grammar drills are keyed
  // `grammar:<id>`, so neither resolves through skillByEx — feed them in directly.
  for (const v of vocabs) {
    const g = vocabGradedScore(v.result);
    pushPct("vocabulary", g.correct, g.total);
  }
  for (const g of grammars) pushPct("grammar", g.correct, g.total);

  // ---- Loại câu hỏi (từ details[] của mọi lượt nộp) ----
  const typeAgg = new Map<QuestionType, { correct: number; total: number }>();
  for (const s of subs) {
    const details = (s.details ?? []) as GradeDetail[];
    for (const d of details) {
      const a = typeAgg.get(d.type) ?? { correct: 0, total: 0 };
      a.total += 1;
      if (d.correct) a.correct += 1;
      typeAgg.set(d.type, a);
    }
  }

  // ---- Timeline 12 tuần: điểm (best-per-exercise trong tuần) + độ chính xác ----
  const weekBest = new Map<string, Map<string, number>>(); // week -> exId -> best POINTS
  const weekAcc = new Map<string, { correct: number; total: number }>();
  for (const s of scored) {
    const w = vnWeekStart(s.at);
    const perEx = weekBest.get(w) ?? new Map<string, number>();
    perEx.set(s.exId, Math.max(perEx.get(s.exId) ?? 0, s.points));
    weekBest.set(w, perEx);
    const acc = weekAcc.get(w) ?? { correct: 0, total: 0 };
    acc.correct += s.corr;
    acc.total += s.tot;
    weekAcc.set(w, acc);
  }
  const thisMonday = vnWeekStart(now.toISOString());
  const timeline: UserAnalytics["timeline"] = [];
  for (let i = TIMELINE_WEEKS - 1; i >= 0; i--) {
    const wDate = new Date(new Date(thisMonday + "T00:00:00Z").getTime() - i * 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const perEx = weekBest.get(wDate);
    let pts = 0;
    if (perEx) for (const p of perEx.values()) pts += p;
    const acc = weekAcc.get(wDate);
    timeline.push({
      week: wDate,
      label: ddmm(wDate),
      points: pts,
      accuracy: acc && acc.total > 0 ? round((acc.correct / acc.total) * 100) : null,
    });
  }

  // ---- Lịch nhiệt 182 ngày (mọi kỹ năng) ----
  const dayCount = new Map<string, number>();
  for (const s of scored) dayCount.set(vnDay(s.at), (dayCount.get(vnDay(s.at)) ?? 0) + 1);
  const todayVn = vnDay(now.toISOString());
  const heatmap: UserAnalytics["heatmap"] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(new Date(todayVn + "T00:00:00Z").getTime() - i * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    heatmap.push({ date: d, count: dayCount.get(d) ?? 0 });
  }

  // ---- Streak: it grows by one, it DECAYS by steps, and it is never wiped ----
  //
  // A day with any practice adds 1. A missed day subtracts as many points as the length of the
  // current miss run: the first idle day costs 1, the next 2, then 3… down to a floor of 0. Coming
  // back adds on top of whatever is left instead of restarting at 1. A streak is months of saved-up
  // effort, and losing all of it to one holiday is why people quit; the rising step keeps the "do
  // not skip another day" pressure without selling a freeze item.
  //
  // TODAY is still open, so it never carries a penalty — only closed days do.
  const dayAfter = (day: string) =>
    new Date(new Date(day + "T00:00:00Z").getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const activeDays = [...dayCount.keys()].sort();
  let streak = 0;
  let bestStreak = 0;
  let missedRun = 0; // consecutive idle days up to yesterday — it sets the size of the next cut
  if (activeDays.length) {
    for (let day = activeDays[0]; day <= todayVn; day = dayAfter(day)) {
      if (dayCount.has(day)) {
        streak += 1;
        missedRun = 0;
        if (streak > bestStreak) bestStreak = streak;
      } else if (day !== todayVn) {
        missedRun += 1;
        streak = Math.max(0, streak - missedRun);
      }
    }
  }
  // What letting today lapse would cost — the progress page shows it as a warning.
  const streakNextPenalty = dayCount.has(todayVn) ? 0 : Math.min(streak, missedRun + 1);

  // ---- Phát âm (reading_submissions) — CHỈ bài đọc to. Dòng audio_key "video:*" là bản tổng
  // của shadowing (luyện nói nhại theo video), kiểu luyện khác hẳn → tách sang khối `video`. ----
  const readAloud = reads.filter((r) => !r.audioKey?.startsWith("video:"));
  const prosodyVals = readAloud.map((r) => r.prosody).filter((v): v is number => v != null);
  const avg = (arr: number[]) => (arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
  const pronTrend = [...readAloud]
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .slice(-12)
    .map((r) => ({ date: r.submittedAt, label: ddmm(vnDay(r.submittedAt)), score: r.pronScore }));

  // ---- Writing: per-criterion average + trend over the last 12 takes ----
  const avgOf = <T>(rows: T[], pick: (r: T) => number | null | undefined): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v != null);
    return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const trendOf = <T extends { submittedAt: string }>(rows: T[], pick: (r: T) => number) =>
    [...rows]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
      .slice(-12)
      .map((r) => ({ date: r.submittedAt, label: ddmm(vnDay(r.submittedAt)), score: pick(r) }));

  // ---- Lộ trình cấp độ hiện tại: đã xong bao nhiêu trên tổng bài ĐÃ XẾP CHẶNG ----
  const levelName = user.levelId ? (levelById.get(user.levelId)?.name ?? null) : null;
  const pathConds = [
    eq(schema.exercises.published, true),
    isNotNull(schema.exercises.pathOrder),
    eq(schema.exercises.level, levelName ?? ""),
  ];
  // Lớp học thuật là opt-in → user chưa bật thì không tính vào mẫu số (khớp thư viện).
  if (!user.academicEnabled) {
    pathConds.push(sql`(${schema.exercises.layer} is null or ${schema.exercises.layer} != 'academic')`);
  }
  const pathRows = levelName
    ? await db.select({ id: schema.exercises.id }).from(schema.exercises).where(and(...pathConds))
    : [];
  const pathDone = pathRows.filter((r) => best.has(r.id)).length;

  // ---- Điểm ngữ pháp còn yếu: nhãn grammar_id ở cấp CÂU, đếm sai/đã gặp trên mọi lượt nộp ----
  const gStat = new Map<string, { wrong: number; seen: number }>();
  const detailExIds = [...new Set(subs.map((s) => s.exerciseId).filter(Boolean))];
  const gQuestions = await inChunks(detailExIds, (ids) =>
    db
      .select({ exerciseId: schema.questions.exerciseId, position: schema.questions.position, grammarId: schema.questions.grammarId })
      .from(schema.questions)
      .where(inArray(schema.questions.exerciseId, ids)),
  );
  const gidByKey = new Map(gQuestions.map((q) => [`${q.exerciseId}:${q.position}`, q.grammarId]));
  for (const sub of subs) {
    for (const d of (sub.details ?? []) as GradeDetail[]) {
      const gid = gidByKey.get(`${sub.exerciseId}:${d.position}`);
      if (!gid) continue;
      const g = gStat.get(gid) ?? { wrong: 0, seen: 0 };
      g.seen += 1;
      if (!d.correct) g.wrong += 1;
      gStat.set(gid, g);
    }
  }
  // Drill verdicts carry `grammar_id` per item, so they feed the same tally directly.
  for (const sub of grammars) {
    for (const v of sub.result?.verdicts ?? []) {
      if (!v.grammar_id) continue;
      const g = gStat.get(v.grammar_id) ?? { wrong: 0, seen: 0 };
      g.seen += 1;
      if (!v.correct) g.wrong += 1;
      gStat.set(v.grammar_id, g);
    }
  }
  const weakIds = [...gStat.entries()].filter(([, g]) => g.wrong > 0).map(([id]) => id);
  const weakRows = weakIds.length
    ? await inChunks(weakIds, (ids) =>
        db
          .select({ id: schema.grammar.id, title: schema.grammar.title, category: schema.grammar.category, cefr: schema.grammar.cefr })
          .from(schema.grammar)
          .where(inArray(schema.grammar.id, ids)),
      )
    : [];
  const grammarWeak = weakRows
    .map((g) => ({ ...g, ...gStat.get(g.id)! }))
    .sort((a, b) => b.wrong - a.wrong || b.seen - a.seen)
    .slice(0, 6);

  // ---- Nghe & Nói: gom tiến độ TỪNG CÂU (nghe-viết) và TỪNG ĐOẠN (shadowing) ----
  const dictDone = dictRows.filter((r) => r.done);
  const dictFirstOk = dictRows.filter((r) => r.firstOk).length;
  const videoLessons = new Set([...dictRows, ...shadowRows].map((r) => r.exerciseId)).size;
  const shadowAvg = shadowRows.length
    ? round(shadowRows.reduce((a, r) => a + r.score, 0) / shadowRows.length)
    : 0;

  const xp = pointsToLevel(totalPoints);

  const rankEntry = board.find((e) => e.user_id === userId);

  return {
    user: {
      id: user.id,
      name: user.name ?? null,
      avatar_url: user.avatarUrl ?? null,
      email: user.email ?? null,
      level: user.levelId ? (levelById.get(user.levelId) ?? null) : null,
    },
    kpis: {
      total_points: totalPoints,
      exercises_done: best.size,
      avg_accuracy: bestTotal > 0 ? round((bestCorrect / bestTotal) * 100) : 0,
      streak_days: streak,
      best_streak_days: bestStreak,
      streak_missed_days: missedRun,
      streak_next_penalty: streakNextPenalty,
      rank: rankEntry ? rankEntry.rank : null,
    },
    timeline,
    skills: Array.from(skillPct.entries()).map(([skill, pcts]) => ({
      skill,
      label: skillLabel(skill, true),
      exercises: pcts.length,
      accuracy: pcts.length ? round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
    })),
    question_types: Array.from(typeAgg.entries()).map(([type, a]) => ({
      type,
      label: questionTypeLabel(type),
      correct: a.correct,
      total: a.total,
      accuracy: a.total > 0 ? round((a.correct / a.total) * 100) : 0,
    })),
    heatmap,
    pronunciation: {
      has_data: readAloud.length > 0,
      count: readAloud.length,
      avg_pron: avg(readAloud.map((r) => r.pronScore)),
      avg_accuracy: avg(readAloud.map((r) => r.accuracy)),
      avg_fluency: avg(readAloud.map((r) => r.fluency)),
      avg_completeness: avg(readAloud.map((r) => r.completeness)),
      avg_prosody: prosodyVals.length ? avg(prosodyVals) : null,
      trend: pronTrend,
    },
    xp: {
      level: xp.level,
      points: totalPoints,
      into: xp.into,
      need: Math.max(1, xp.span),
      percent: round(Math.min(100, xp.progress * 100)),
    },
    path: {
      level: levelName,
      done: pathDone,
      total: pathRows.length,
      percent: pathRows.length ? round((pathDone / pathRows.length) * 100) : 0,
    },
    writing: {
      has_data: writes.length > 0,
      count: writes.length,
      avg_overall: avgOf(writes, (r) => r.overallScore) ?? 0,
      avg_task: avgOf(writes, (r) => r.taskBand),
      avg_coherence: avgOf(writes, (r) => r.coherenceBand),
      avg_grammar: avgOf(writes, (r) => r.grammarBand),
      avg_lexical: avgOf(writes, (r) => r.lexicalBand),
      avg_words: avgOf(writes, (r) => r.wordCount) ?? 0,
      trend: trendOf(writes, (r) => r.overallScore),
    },
    grammar_weak: grammarWeak,
    video: {
      has_data: dictRows.length > 0 || shadowRows.length > 0,
      lessons: videoLessons,
      dict_segments: dictDone.length,
      dict_total: dictRows.length,
      dict_first_ok: dictFirstOk,
      dict_first_ok_pct: dictRows.length ? round((dictFirstOk / dictRows.length) * 100) : 0,
      hints: dictRows.reduce((a, r) => a + r.hints, 0),
      revealed: dictRows.filter((r) => r.revealed).length,
      shadow_segments: shadowRows.length,
      shadow_avg: shadowAvg,
    },
  };
}
