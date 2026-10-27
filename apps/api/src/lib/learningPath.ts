// ============================================================
//  Engine "gạn giọt" lộ trình cho USER CÔNG KHAI.
//  Hạn mức ngày = DAILY_UNLOCK + số bài ĐẠT lần đầu hôm nay (kiếm lại quota),
//  trần cứng DAILY_UNLOCK_MAX; van hai là trần bài đã-mở-chưa-làm ROLLOVER_UNDONE.
//  Con trỏ lưu ở bảng user_level_progress (không ledger).
//  UNLOCK_MODE "rolling" (current) skips the daily quota: OPEN_SLOTS unfinished exercises stay open.
// ============================================================
import { and, eq } from "drizzle-orm";
import { DAILY_UNLOCK, DAILY_UNLOCK_MAX, OPEN_SLOTS, ROLLOVER_UNDONE, UNLOCK_MODE, type LibraryMeta } from "@msyen/shared";
import { getDb, schema } from "../db";

type Db = ReturnType<typeof getDb>;

/** Ngày hiện tại theo giờ VN (Asia/Ho_Chi_Minh), dạng YYYY-MM-DD. */
export function vnDateStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

/** Mốc nửa đêm VN kế tiếp (ISO) — khi nào quota ngày làm mới. VN = UTC+7, không DST. */
export function nextVnMidnightIso(now: Date = new Date()): string {
  const vn = new Date(now.getTime() + 7 * 3600_000); // dời sang "đồng hồ VN"
  const nextMidnightUtcMs = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - 7 * 3600_000;
  return new Date(nextMidnightUtcMs).toISOString();
}

export interface UnlockResult {
  unlockedCount: number;
  meta: LibraryMeta;
}

/**
 * Top-up (lười): tính lại số bài đã mở cho (user, level) theo 2 van, rồi upsert state.
 * `totalInLevel` = tổng bài trong level; `doneInLevel` = số bài của level user đã nộp ≥1 lần;
 * `passedToday` = số bài ĐẠT lần đầu trong hôm nay → mỗi bài hoàn lại 1 suất mở.
 */
export async function topUpUnlocks(
  db: Db,
  userId: string,
  levelId: string,
  totalInLevel: number,
  doneInLevel: number,
  passedToday = 0,
): Promise<UnlockResult> {
  const today = vnDateStr();
  // Làm được bài thì mở tiếp — tường là NỖ LỰC, không phải đồng hồ. Trần cứng vẫn giữ để
  // chống cày một mạch hết kho (và ghìm tốc độ crawl,).
  const dailyCap = Math.min(DAILY_UNLOCK + passedToday, DAILY_UNLOCK_MAX);

  const row = await db.query.userLevelProgress.findFirst({
    where: and(eq(schema.userLevelProgress.userId, userId), eq(schema.userLevelProgress.levelId, levelId)),
  });

  let unlockedCount = Math.min(row?.unlockedCount ?? 0, totalInLevel); // kẹp phòng bài bị xóa
  // Sang ngày mới → reset bộ đếm quota ngày.
  let unlockedToday = row && row.lastUnlockDate === today ? row.unlockedToday : 0;

  const rolling = UNLOCK_MODE === "rolling";
  // Rolling: keep OPEN_SLOTS unfinished exercises open, no daily cap.
  // Daily: open while BOTH valves have room and exercises remain.
  while (
    unlockedCount < totalInLevel &&
    (rolling ? unlockedCount - doneInLevel < OPEN_SLOTS : unlockedToday < dailyCap && unlockedCount - doneInLevel < ROLLOVER_UNDONE)
  ) {
    unlockedCount++;
    unlockedToday++;
  }

  // Only write when something actually moved. This runs on EVERY library load, and a write is the
  // most expensive thing D1 does — without this guard, refreshing the page ten times cost ten writes
  // that stored the exact same three numbers.
  const changed =
    !row ||
    row.unlockedCount !== unlockedCount ||
    row.unlockedToday !== unlockedToday ||
    row.lastUnlockDate !== today;
  if (changed) {
    await db
      .insert(schema.userLevelProgress)
      .values({ userId, levelId, unlockedCount, unlockedToday, lastUnlockDate: today })
      .onConflictDoUpdate({
        target: [schema.userLevelProgress.userId, schema.userLevelProgress.levelId],
        set: { unlockedCount, unlockedToday, lastUnlockDate: today },
      });
  }

  const activeUndone = Math.max(0, unlockedCount - doneInLevel);
  const meta: LibraryMeta = {
    mode: UNLOCK_MODE,
    daily: dailyCap,
    daily_base: DAILY_UNLOCK,
    earned_today: Math.min(passedToday, DAILY_UNLOCK_MAX - DAILY_UNLOCK),
    rollover: rolling ? OPEN_SLOTS : ROLLOVER_UNDONE,
    unlocked_today: unlockedToday,
    remaining_today: Math.max(0, dailyCap - unlockedToday),
    active_undone: activeUndone,
    done_in_level: doneInLevel,
    total_in_level: totalInLevel,
    next_unlock_at: rolling || unlockedCount >= totalInLevel ? null : nextVnMidnightIso(),
  };

  return { unlockedCount, meta };
}
