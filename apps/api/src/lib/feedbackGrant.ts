// Decide whether a submission earns an AI comment: only work a teacher assigned (to the learner's
// class or to the learner directly) is commented. Self-practice is graded but not commented.
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { membershipActive } from "./classMembership";

type Db = ReturnType<typeof getDb>;

export interface FeedbackGrant {
  withFeedback: boolean; // generate an AI comment for this submission?
  viaClass: boolean; // granted as assigned work?
}

/** Is `exerciseInternalId` (exercises.id) a class/teacher-assigned exercise for this user? */
export async function isAssignedWork(db: Db, userId: string, exerciseInternalId: string): Promise<boolean> {
  const [byClass, byUser] = await Promise.all([
    db
      .select({ id: schema.classAssignments.exerciseId })
      .from(schema.classMembers)
      .innerJoin(schema.classes, eq(schema.classMembers.classId, schema.classes.id))
      .innerJoin(schema.classAssignments, eq(schema.classAssignments.classId, schema.classes.id))
      .where(
        and(
          eq(schema.classMembers.userId, userId),
          eq(schema.classAssignments.exerciseId, exerciseInternalId),
          membershipActive(),
        ),
      )
      .limit(1),
    db
      .select({ id: schema.userAssignments.exerciseId })
      .from(schema.userAssignments)
      .where(and(eq(schema.userAssignments.userId, userId), eq(schema.userAssignments.exerciseId, exerciseInternalId)))
      .limit(1),
  ]);
  return byClass.length > 0 || byUser.length > 0;
}

/** Resolve the AI-comment grant for a user submission. Call once per submission at grade time. */
export async function resolveFeedbackGrant(db: Db, userId: string, exerciseInternalId: string): Promise<FeedbackGrant> {
  const assigned = await isAssignedWork(db, userId, exerciseInternalId);
  return { withFeedback: assigned, viaClass: assigned };
}
