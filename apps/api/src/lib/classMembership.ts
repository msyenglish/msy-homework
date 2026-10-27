// LIVE class membership — the shared rule wherever class rights are checked (class
// assignments and everything else gated on the class).
import { eq } from "drizzle-orm";
import { schema } from "../db";

/** WHERE condition: the class is active. Needs `class_members` JOINed with `classes`. */
export function membershipActive() {
  return eq(schema.classes.active, true);
}
