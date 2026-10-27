// Email change flow (shared by user self-change, /me lazy-apply, hourly cron, admin edit).
// One table `email_changes` holds pending + history. See schema for row states.
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { EmailChangeRow, UserRow } from "../db/schema";

export const EMAIL_CHANGE_GRACE_DAYS = 2; // user self-change takes effect after this many days

type Db = ReturnType<typeof getDb>;

const PLACEHOLDER_DOMAIN = "@lop.msyen.local"; // giữ chỗ cho học sinh nhỏ chưa có email thật

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
}

/** Pending change đang chờ của user (chưa áp, chưa hủy). null nếu không có. */
export async function getPendingEmailChange(db: Db, userId: string): Promise<EmailChangeRow | null> {
  const row = await db.query.emailChanges.findFirst({
    where: and(
      eq(schema.emailChanges.userId, userId),
      isNull(schema.emailChanges.appliedAt),
      isNull(schema.emailChanges.canceledAt),
    ),
    orderBy: desc(schema.emailChanges.createdAt),
  });
  return row ?? null;
}

/** Email đã bị user khác chiếm chưa (loại trừ chính user này)? */
async function emailTaken(db: Db, email: string, exceptUserId: string): Promise<boolean> {
  const dup = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  return !!dup && dup.id !== exceptUserId;
}

/** Áp 1 pending change nếu email đích còn trống; nếu đã bị chiếm thì hủy để khỏi kẹt. */
async function applyOne(db: Db, row: EmailChangeRow): Promise<void> {
  const now = new Date().toISOString();
  if (await emailTaken(db, row.newEmail, row.userId)) {
    await db.update(schema.emailChanges).set({ canceledAt: now }).where(eq(schema.emailChanges.id, row.id));
    return;
  }
  await db.update(schema.users).set({ email: row.newEmail }).where(eq(schema.users.id, row.userId));
  await db.update(schema.emailChanges).set({ appliedAt: now }).where(eq(schema.emailChanges.id, row.id));
}

/**
 * Áp pending đã tới hạn cho MỘT user (gọi lười ở /me). Trả UserRow (đã cập nhật email nếu có áp).
 */
export async function applyDueEmailChange(db: Db, user: UserRow): Promise<UserRow> {
  const now = new Date().toISOString();
  const due = await db.query.emailChanges.findFirst({
    where: and(
      eq(schema.emailChanges.userId, user.id),
      isNull(schema.emailChanges.appliedAt),
      isNull(schema.emailChanges.canceledAt),
      lte(schema.emailChanges.effectiveAt, now),
    ),
  });
  if (!due) return user;
  await applyOne(db, due);
  const fresh = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
  return fresh ?? user;
}

/** Quét TẤT CẢ pending đã tới hạn (cron mỗi giờ) — áp kể cả khi user không vào app. Trả số đã áp. */
export async function applyAllDueEmailChanges(db: Db): Promise<number> {
  const now = new Date().toISOString();
  const due = await db.query.emailChanges.findMany({
    where: and(
      isNull(schema.emailChanges.appliedAt),
      isNull(schema.emailChanges.canceledAt),
      lte(schema.emailChanges.effectiveAt, now),
    ),
  });
  for (const row of due) await applyOne(db, row);
  return due.length;
}
