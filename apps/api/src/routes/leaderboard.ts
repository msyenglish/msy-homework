// Bảng xếp hạng điểm — view GIÁO VIÊN (mount dưới /teacher/leaderboard).
// Public user xem BXH qua /library/leaderboard (kèm hạng của chính mình).
import { Hono } from "hono";
import { getDb } from "../db";
import { getLeaderboard, parsePeriod } from "../lib/leaderboard";
import type { AppEnv } from "../lib/env";

const leaderboard = new Hono<AppEnv>();

leaderboard.get("/", async (c) => {
  const period = parsePeriod(c.req.query("period"));
  // Cô luôn thấy TÊN THẬT của mọi em (reveal) — ẩn danh chỉ để che giữa các em với nhau.
  const items = await getLeaderboard(getDb(c.env.DB), period, new Date(), { reveal: true });
  return c.json({ period, items });
});

export default leaderboard;
