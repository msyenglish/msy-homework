// Truy vấn dùng chung (public + teacher). Tập trung logic "tiến độ học sinh".
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { correctAnswerText, studentAnswerText, type GrammarWeak, type ReportStats } from "@msyen/shared";
import type { Db } from "../db";
import { schema } from "../db";
import { getUserAnalytics } from "./analytics";
import { inChunks } from "./bind";
import { membershipActive } from "./classMembership";
import { levelOut, userOut } from "./serialize";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Ngày lịch VN (YYYY-MM-DD) từ ISO UTC — dùng đếm ngày học trong tháng. */
function vnDay(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

// Số câu sai giữ lại trong snapshot (parent-facing, tránh JSON phình to).
const MISTAKES_CAP = 15;
// Số điểm ngữ pháp yếu nêu trong báo cáo tháng — nêu hết 20 điểm thì thành danh sách vô dụng.
const GRAMMAR_CAP = 6;

/**
 * Tên người học của một lượt nộp — tra ĐÚNG bảng theo chủ nhân.
 * Mọi lượt nộp đều mang `user_id` (mới) HOẶC `student_id` (lịch sử); quên nhánh users là
 * ra `null`/"Khách" cho toàn bộ người học hiện tại. Dùng chung cho chữa bài, auto-feedback,
 * và drawer lượt nộp theo bài.
 */
export async function learnerName(
  db: Db,
  owner: { studentId?: string | null; userId?: string | null },
): Promise<string | null> {
  if (owner.userId) {
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, owner.userId) });
    return u ? u.name || u.email : null;
  }
  if (owner.studentId) {
    const s = await db.query.students.findFirst({ where: eq(schema.students.id, owner.studentId) });
    return s?.name ?? null;
  }
  return null;
}

/** Who the comment is addressed to — name plus what the greeting needs to sound personal. */
export type LearnerProfile = { name: string | null; gender: string | null; age: number | null };

/**
 * Same lookup as `learnerName` but also returns gender + age, used by the feedback prompt to
 * open with a line that fits the learner. Both tables carry `birth_year` / `gender`; either may
 * be null (onboarding is optional), so every caller must survive a fully empty profile.
 */
export async function learnerProfile(
  db: Db,
  owner: { studentId?: string | null; userId?: string | null },
): Promise<LearnerProfile> {
  const row = owner.userId
    ? await db.query.users.findFirst({ where: eq(schema.users.id, owner.userId) })
    : owner.studentId
      ? await db.query.students.findFirst({ where: eq(schema.students.id, owner.studentId) })
      : null;
  if (!row) return { name: null, gender: null, age: null };
  const name = "email" in row ? row.name || row.email : row.name;
  const year = row.birthYear;
  // Year-precision only: no birth date is stored, so this can be off by one. Good enough for a
  // greeting, never use it for anything that must be exact.
  const age = year && year > 1900 ? new Date().getUTCFullYear() - year : null;
  return { name: name ?? null, gender: row.gender ?? null, age: age && age > 2 && age < 100 ? age : null };
}

export interface AssignmentProgress {
  exercise_id: string;
  title: string;
  skill: string | null;
  read_aloud: boolean;
  /** Vocab-deck exercise: its attempts live in vocab_submissions and open as the /s/:id report. */
  vocab_deck?: boolean;
  published: boolean;
  teacher_note: string | null;
  done: boolean;
  lastScore: number | null;
  lastTotal: number | null;
  lastAt: string | null;
  attempts: number;
  submissionId: string | null;
  feedback: string | null;
  assigned_at: string;
  // Tên lớp nếu bài đến từ lớp; null = cô giao riêng cho em này.
  class_name?: string | null;
}

/**
 * Toàn cảnh 1 NGƯỜI HỌC (user): hồ sơ + tiến độ bài được giao + lịch sử làm bài.
 * Bản song song `getStudentProgress` cho tầng user — khác ở hai chỗ:
 *  · bài được giao đến từ HAI nguồn (lớp + giao riêng), không phải bảng `assignments`
 *  · lượt nộp key theo `user_id`
 *
 */
export async function getUserProgress(db: Db, userId: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) return null;

  const levelRow = user.levelId
    ? await db.query.levels.findFirst({ where: eq(schema.levels.id, user.levelId) })
    : null;
  const level = levelRow ? levelOut(levelRow) : null;

  const exCols = {
    exerciseId: schema.exercises.id,
    exSlug: schema.exercises.exerciseId,
    title: schema.exercises.title,
    skill: schema.exercises.skill,
    readAloud: schema.exercises.readAloud,
    isDeck: sql<number>`${schema.exercises.vocabDeck} is not null`,
    published: schema.exercises.published,
  };

  const [byClass, byUser, subs, readingSubs, vocabSubs] = await Promise.all([
    db
      .select({ ...exCols, teacherNote: schema.classAssignments.teacherNote, assignedAt: schema.classAssignments.assignedAt, className: schema.classes.name })
      .from(schema.classMembers)
      .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
      .innerJoin(schema.classAssignments, eq(schema.classAssignments.classId, schema.classes.id))
      .innerJoin(schema.exercises, eq(schema.classAssignments.exerciseId, schema.exercises.id))
      .where(and(eq(schema.classMembers.userId, userId), membershipActive())),
    db
      .select({ ...exCols, teacherNote: schema.userAssignments.teacherNote, assignedAt: schema.userAssignments.assignedAt })
      .from(schema.userAssignments)
      .innerJoin(schema.exercises, eq(schema.userAssignments.exerciseId, schema.exercises.id))
      .where(eq(schema.userAssignments.userId, userId)),
    db
      .select({
        id: schema.submissions.id,
        exerciseId: schema.submissions.exerciseId,
        score: schema.submissions.score,
        total: schema.submissions.total,
        submittedAt: schema.submissions.submittedAt,
        teacherFeedback: schema.submissions.teacherFeedback,
        title: schema.exercises.title,
        skill: schema.exercises.skill,
      })
      .from(schema.submissions)
      .innerJoin(schema.exercises, eq(schema.submissions.exerciseId, schema.exercises.id))
      .where(eq(schema.submissions.userId, userId))
      .orderBy(desc(schema.submissions.submittedAt)),
    db
      .select({
        id: schema.readingSubmissions.id,
        exerciseId: schema.readingSubmissions.exerciseId,
        pronScore: schema.readingSubmissions.pronScore,
        submittedAt: schema.readingSubmissions.submittedAt,
        aiFeedback: schema.readingSubmissions.aiFeedback,
        teacherFeedback: schema.readingSubmissions.teacherFeedback,
      })
      .from(schema.readingSubmissions)
      .where(eq(schema.readingSubmissions.userId, userId))
      .orderBy(desc(schema.readingSubmissions.submittedAt)),
    // Vocab-deck exercises submit here, not to `submissions` (self-practice rows have no exercise).
    db
      .select({
        id: schema.vocabSubmissions.id,
        exerciseId: schema.vocabSubmissions.exerciseId,
        score: schema.vocabSubmissions.score,
        total: schema.vocabSubmissions.total,
        submittedAt: schema.vocabSubmissions.submittedAt,
      })
      .from(schema.vocabSubmissions)
      .where(and(eq(schema.vocabSubmissions.userId, userId), isNotNull(schema.vocabSubmissions.exerciseId)))
      .orderBy(desc(schema.vocabSubmissions.submittedAt)),
  ]);

  // Gộp hai nguồn giao bài; trùng thì bài GIAO RIÊNG thắng (ghi chú của cô cho riêng em
  // cụ thể hơn ghi chú chung của lớp).
  type Assigned = (typeof byUser)[number] & { className: string | null };
  const assignMap = new Map<string, Assigned>();
  for (const a of byClass) assignMap.set(a.exerciseId, a);
  for (const a of byUser) assignMap.set(a.exerciseId, { ...a, className: null });

  // Lượt TỐT NHẤT mỗi bài, theo từng loại (quiz / đọc to / nói).
  const bestOf = <T extends { exerciseId: string }>(rows: T[], score: (r: T) => number) => {
    const best: Record<string, T> = {};
    const count: Record<string, number> = {};
    for (const r of rows) {
      count[r.exerciseId] = (count[r.exerciseId] || 0) + 1;
      const cur = best[r.exerciseId];
      if (!cur || score(r) > score(cur)) best[r.exerciseId] = r;
    }
    return { best, count };
  };
  const quiz = bestOf(subs, (s) => s.score);
  const reading = bestOf(readingSubs, (r) => r.pronScore);
  // `score` is a percentage over `total` words — shown as words right, like the learner's card.
  const vocab = bestOf(
    vocabSubs.map((v) => ({ ...v, exerciseId: v.exerciseId!, correct: Math.round((v.score / 100) * v.total) })),
    (v) => v.score,
  );

  const assignments: AssignmentProgress[] = [...assignMap.values()]
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
    .map((a) => {
      const base = {
        exercise_id: a.exSlug,
        title: a.title,
        skill: a.skill,
        read_aloud: a.readAloud,
        published: a.published,
        teacher_note: a.teacherNote,
        assigned_at: a.assignedAt,
        class_name: a.className,
      };
      if (a.isDeck) {
        const lv = vocab.best[a.exerciseId];
        return { ...base, vocab_deck: true, done: !!lv, lastScore: lv?.correct ?? null, lastTotal: lv?.total ?? null,
          lastAt: lv?.submittedAt ?? null, attempts: vocab.count[a.exerciseId] || 0,
          submissionId: lv?.id ?? null, feedback: null };
      }
      if (a.readAloud) {
        const lr = reading.best[a.exerciseId];
        return { ...base, done: !!lr, lastScore: lr?.pronScore ?? null, lastTotal: lr ? 100 : null,
          lastAt: lr?.submittedAt ?? null, attempts: reading.count[a.exerciseId] || 0,
          submissionId: lr?.id ?? null, feedback: lr ? lr.teacherFeedback ?? lr.aiFeedback : null };
      }
      const last = quiz.best[a.exerciseId];
      return { ...base, done: !!last, lastScore: last?.score ?? null, lastTotal: last?.total ?? null,
        lastAt: last?.submittedAt ?? null, attempts: quiz.count[a.exerciseId] || 0,
        submissionId: last?.id ?? null, feedback: last?.teacherFeedback ?? null };
    });

  const classes = await db
    .select({ id: schema.classes.id, name: schema.classes.name })
    .from(schema.classMembers)
    .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
    .where(eq(schema.classMembers.userId, userId));

  return {
    // `active`/`classes` are not part of PublicUser (shared with the learner-facing layer) —
    // only the teacher pages see them.
    user: { ...userOut(user, level), active: user.active, classes },
    assignments,
    submissions: subs.map((s) => ({
      id: s.id,
      exercise: s.title,
      skill: s.skill,
      score: s.score,
      total: s.total,
      submitted_at: s.submittedAt,
      hasFeedback: !!s.teacherFeedback,
    })),
  };
}

/** "2026-07" → { from: "2026-07-01", to: "2026-08-01" } (đầu tháng kế). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  // Đầu tháng kế (rollover năm) — so sánh chuỗi ISO chuẩn từ vựng với submittedAt.
  const ny = m >= 12 ? y + 1 : y;
  const nm = m >= 12 ? 1 : m + 1;
  const to = `${ny}-${String(nm).padStart(2, "0")}-01`;
  return { from, to };
}

/**
 * Thống kê THẬT của học sinh trong khoảng [from, to) từ submissions:
 * điểm TB, theo kỹ năng, timeline theo thời gian, danh sách câu sai.
 * Dùng chung cho báo cáo AI (students.ts) và snapshot lúc lưu (reports.ts).
 */
/**
 * Câu SAI của một người học trong khoảng thời gian — nguồn cho prompt báo cáo tháng.
 * Nhận `owner` (student cũ HOẶC user) nên dùng chung được cho cả hai trang giáo viên.
 */
export async function getMistakes(
  db: Db,
  owner: { studentId?: string; userId?: string },
  from: string,
  to: string,
): Promise<unknown[]> {
  const subs = await db
    .select({
      exerciseRowId: schema.submissions.exerciseId,
      answers: schema.submissions.answers,
      details: schema.submissions.details,
      title: schema.exercises.title,
      skill: schema.exercises.skill,
    })
    .from(schema.submissions)
    .innerJoin(schema.exercises, eq(schema.submissions.exerciseId, schema.exercises.id))
    .where(
      and(
        owner.studentId
          ? eq(schema.submissions.studentId, owner.studentId)
          : eq(schema.submissions.userId, owner.userId!),
        gte(schema.submissions.submittedAt, from),
        lt(schema.submissions.submittedAt, to),
      ),
    )
    .orderBy(asc(schema.submissions.submittedAt));

  const exIds = [...new Set(subs.map((s) => s.exerciseRowId))];
  const allQ = await inChunks(exIds, (ids) =>
    db.select().from(schema.questions).where(inArray(schema.questions.exerciseId, ids)),
  );
  const qByEx: Record<string, Record<number, (typeof allQ)[number]>> = {};
  for (const q of allQ) (qByEx[q.exerciseId] ||= {})[q.position] = q;

  const wrong: unknown[] = [];
  for (const s of subs) {
    const qmap = qByEx[s.exerciseRowId] || {};
    for (const d of s.details) {
      if (d.correct) continue;
      const q = qmap[d.position];
      if (!q) continue;
      wrong.push({
        exercise: s.title,
        skill: s.skill,
        type: q.type,
        question: q.question,
        studentAnswer: String(s.answers[d.position] ?? "").trim(),
        correctAnswer: q.type === "multiple_choice" ? q.answer : (q.accept?.[0] ?? ""),
      });
    }
  }
  return wrong;
}

export async function computeReportStats(
  db: Db,
  owner: { studentId?: string; userId?: string },
  from: string,
  to: string,
  now: Date = new Date(),
): Promise<ReportStats> {
  // Chủ nhân báo cáo: học sinh cũ (lịch sử) HOẶC user (thành viên lớp)
  const ownerWhere = owner.studentId
    ? eq(schema.submissions.studentId, owner.studentId)
    : eq(schema.submissions.userId, owner.userId!);
  const subs = await db
    .select({
      exerciseRowId: schema.submissions.exerciseId,
      answers: schema.submissions.answers,
      details: schema.submissions.details,
      score: schema.submissions.score,
      total: schema.submissions.total,
      submittedAt: schema.submissions.submittedAt,
      title: schema.exercises.title,
      skill: schema.exercises.skill,
    })
    .from(schema.submissions)
    .innerJoin(schema.exercises, eq(schema.submissions.exerciseId, schema.exercises.id))
    .where(
      and(
        ownerWhere,
        gte(schema.submissions.submittedAt, from),
        lt(schema.submissions.submittedAt, to),
      ),
    )
    .orderBy(asc(schema.submissions.submittedAt));

  // Tổng quan + theo kỹ năng + timeline.
  let pctSum = 0;
  let pctCount = 0;
  const bySkill: Record<string, { done: number; pctSum: number; pctCount: number }> = {};
  const timeline: ReportStats["timeline"] = [];
  for (const s of subs) {
    if (s.total > 0) {
      const pct = (s.score / s.total) * 100;
      pctSum += pct;
      pctCount++;
      const key = s.skill || "khác";
      const b = (bySkill[key] ||= { done: 0, pctSum: 0, pctCount: 0 });
      b.done++;
      b.pctSum += pct;
      b.pctCount++;
      timeline.push({ date: s.submittedAt, pct: Math.round(pct), title: s.title, skill: s.skill });
    }
  }

  // Danh sách câu sai (đề + đáp án của em + đáp án đúng).
  const exIds = [...new Set(subs.map((s) => s.exerciseRowId))];
  const allQ = await inChunks(exIds, (ids) =>
    db.select().from(schema.questions).where(inArray(schema.questions.exerciseId, ids)),
  );
  const qByEx: Record<string, Record<number, (typeof allQ)[number]>> = {};
  for (const q of allQ) (qByEx[q.exerciseId] ||= {})[q.position] = q;

  const mistakes: ReportStats["mistakes"] = [];
  // Gom ĐIỂM NGỮ PHÁP yếu trong kỳ: đếm câu sai / câu đã gặp theo nhãn questions.grammar_id.
  // Đếm cả câu ĐÚNG (seen) để "sai 3/4 câu" nói lên nhiều hơn con số sai trần trụi.
  const gStat = new Map<string, { wrong: number; seen: number }>();
  for (const s of subs) {
    const qmap = qByEx[s.exerciseRowId] || {};
    for (const d of s.details) {
      const q = qmap[d.position];
      if (q?.grammarId) {
        const g = gStat.get(q.grammarId) ?? { wrong: 0, seen: 0 };
        g.seen++;
        if (!d.correct) g.wrong++;
        gStat.set(q.grammarId, g);
      }
      if (d.correct) continue;
      if (!q) continue;
      // Dùng helper dùng chung → đúng cho MỌI dạng (matching/ordering/categorize, không chỉ MC/điền).
      const raw = s.answers[d.position];
      const rawStr = raw == null ? undefined : String(raw);
      mistakes.push({
        exercise: s.title,
        skill: s.skill,
        question: q.question,
        student_answer: studentAnswerText(q, rawStr),
        correct_answer: correctAnswerText(q),
        blank: !rawStr || !rawStr.trim(), // em không trả lời gì → tách sang mục "bỏ trống"
      });
    }
  }

  // Chỉ nêu điểm CÒN SAI, nặng nhất trước; cắt bớt để snapshot báo cáo khỏi phình.
  const weakIds = [...gStat.entries()].filter(([, g]) => g.wrong > 0).map(([id]) => id);
  const grammarWeak: GrammarWeak[] = weakIds.length
    ? (
        await inChunks(weakIds, (ids) =>
          db
            .select({
              id: schema.grammar.id,
              title: schema.grammar.title,
              category: schema.grammar.category,
              cefr: schema.grammar.cefr,
              summary: schema.grammar.summary,
            })
            .from(schema.grammar)
            .where(inArray(schema.grammar.id, ids)),
        )
      )
        .map((g) => ({ ...g, ...gStat.get(g.id)! }))
        .sort((a, b) => b.wrong - a.wrong || a.seen - b.seen)
        .slice(0, GRAMMAR_CAP)
    : [];

  // ---- Phần ĐỌC TO (chấm phát âm) trong tháng ----
  const reads = await db
    .select({
      pronScore: schema.readingSubmissions.pronScore,
      accuracy: schema.readingSubmissions.accuracy,
      fluency: schema.readingSubmissions.fluency,
      completeness: schema.readingSubmissions.completeness,
      words: schema.readingSubmissions.words,
      aiFeedback: schema.readingSubmissions.aiFeedback,
      submittedAt: schema.readingSubmissions.submittedAt,
      title: schema.exercises.title,
    })
    .from(schema.readingSubmissions)
    .innerJoin(schema.exercises, eq(schema.readingSubmissions.exerciseId, schema.exercises.id))
    .where(
      and(
        owner.studentId
          ? eq(schema.readingSubmissions.studentId, owner.studentId)
          : eq(schema.readingSubmissions.userId, owner.userId!),
        gte(schema.readingSubmissions.submittedAt, from),
        lt(schema.readingSubmissions.submittedAt, to),
      ),
    )
    .orderBy(asc(schema.readingSubmissions.submittedAt));

  let reading: ReportStats["reading"];
  if (reads.length) {
    const avg = (sel: (r: (typeof reads)[number]) => number) =>
      Math.round(reads.reduce((s, r) => s + sel(r), 0) / reads.length);
    // Đếm từ phát âm chưa chuẩn/thiếu lặp lại → trọng tâm luyện đọc.
    const wc: Record<string, number> = {};
    for (const r of reads)
      for (const w of r.words)
        if (w.errorType !== "None") {
          const k = w.word.toLowerCase();
          wc[k] = (wc[k] ?? 0) + 1;
        }
    const weak_words = Object.entries(wc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));
    reading = {
      count: reads.length,
      avg_pron: avg((r) => r.pronScore),
      avg_accuracy: avg((r) => r.accuracy),
      avg_fluency: avg((r) => r.fluency),
      avg_completeness: avg((r) => r.completeness),
      timeline: reads.map((r) => ({ date: r.submittedAt, pron: r.pronScore, title: r.title })),
      weak_words,
      // Nhận xét phát âm đã sinh lúc chấm (mới nhất trước, cắt 3) → báo cáo tháng dùng lại.
      notes: [...reads]
        .reverse()
        .map((r) => r.aiFeedback?.trim())
        .filter((s): s is string => !!s)
        .slice(0, 3),
    };
  }

  // ---- Khối MỞ RỘNG — chỉ cho user thành viên lớp (owner.userId). Học sinh cũ bỏ qua. ----
  let attendance: ReportStats["attendance"];
  let questionTypes: ReportStats["question_types"];
  let vocab: ReportStats["vocab"];
  if (owner.userId) {
    const userId = owner.userId;

    // Độ chính xác theo LOẠI câu (từ details câu quiz trong tháng — đã có `subs`).
    const typeAgg = new Map<string, { correct: number; total: number }>();
    for (const s of subs)
      for (const d of s.details) {
        const a = typeAgg.get(d.type) ?? { correct: 0, total: 0 };
        a.total++;
        if (d.correct) a.correct++;
        typeAgg.set(d.type, a);
      }
    if (typeAgg.size)
      questionTypes = [...typeAgg.entries()].map(([type, a]) => ({
        type,
        correct: a.correct,
        total: a.total,
        accuracy: a.total ? Math.round((a.correct / a.total) * 100) : 0,
      }));

    // Từ vựng — buổi luyện trong tháng + số từ đã học/thuộc.
    const vsubs = await db
      .select({ score: schema.vocabSubmissions.score, submittedAt: schema.vocabSubmissions.submittedAt })
      .from(schema.vocabSubmissions)
      .where(
        and(
          eq(schema.vocabSubmissions.userId, userId),
          gte(schema.vocabSubmissions.submittedAt, from),
          lt(schema.vocabSubmissions.submittedAt, to),
        ),
      );
    const vprog = await db
      .select({ learned: schema.userVocabProgress.learned, learnedAt: schema.userVocabProgress.learnedAt })
      .from(schema.userVocabProgress)
      .where(eq(schema.userVocabProgress.userId, userId));
    const wordsMastered = vprog.filter((p) => p.learned).length;
    const wordsLearnedMonth = vprog.filter(
      (p) => p.learned && p.learnedAt && p.learnedAt >= from && p.learnedAt < to,
    ).length;
    if (vsubs.length || wordsMastered) {
      vocab = {
        sessions: vsubs.length,
        avg_pct: vsubs.length
          ? Math.round(vsubs.reduce((s, r) => s + r.score, 0) / vsubs.length)
          : null,
        words_learned: wordsLearnedMonth,
        words_mastered: wordsMastered,
      };
    }

    // Chuyên cần & xếp hạng — streak/best/tổng điểm/rank là snapshot TOÀN THỜI GIAN (getUserAnalytics).
    // active_days theo THÁNG: đếm ngày VN có ít nhất một lượt nộp (quiz + đọc-to + nói).
    const monthDays = new Set<string>();
    for (const s of subs) monthDays.add(vnDay(s.submittedAt));
    for (const r of reads) monthDays.add(vnDay(r.submittedAt));
    for (const v of vsubs) monthDays.add(vnDay(v.submittedAt)); // ngày làm từ vựng cũng tính chuyên cần
    const analytics = await getUserAnalytics(db, userId, now);
    if (analytics) {
      attendance = {
        active_days: monthDays.size,
        streak_days: analytics.kpis.streak_days,
        best_streak_days: analytics.kpis.best_streak_days,
        total_points: analytics.kpis.total_points,
        rank: analytics.kpis.rank,
      };
    }
  }

  return {
    exercises_done: subs.length,
    avg_pct: pctCount ? pctSum / pctCount : null,
    by_skill: Object.entries(bySkill).map(([skill, b]) => ({
      skill,
      done: b.done,
      avg_pct: b.pctCount ? b.pctSum / b.pctCount : null,
    })),
    timeline,
    mistakes: mistakes.slice(0, MISTAKES_CAP),
    grammar: grammarWeak,
    reading,
    attendance,
    question_types: questionTypes,
    vocab,
  };
}
