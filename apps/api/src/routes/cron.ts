// Endpoint cron (gọi được bằng curl từ server ngoài) — guard bằng CRON_SECRET.
// Cũng được gọi nội bộ bởi Cron Trigger của Cloudflare (xem index.ts scheduled()).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db";
import { runAutoFeedback } from "../lib/autoFeedback";
import { pruneUsage } from "../lib/ai/usage";
import { enqueueContentIpa, pickReadingNeedingIpa } from "../lib/contentBackfill";
import { enqueueExerciseAudio, pickExercisesNeedingAudio } from "../lib/audioBackfill";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

r.use("*", async (c, next) => {
  const token = c.req.query("token") || c.req.header("x-cron-token") || "";
  if (!c.env.CRON_SECRET || token !== c.env.CRON_SECRET) {
    throw new HTTPException(401, { message: "Sai token cron" });
  }
  await next();
});

r.post("/auto-feedback", async (c) => {
  const db = getDb(c.env.DB);
  // Dọn nhật ký AI cũ (> 180 ngày) — bám theo nhịp cron sẵn có, khỏi dựng trigger riêng.
  // Chạy TRƯỚC và độc lập với auto-feedback: kể cả khi auto-feedback tắt vẫn phải dọn.
  const pruned = await pruneUsage(db);
  const result = await runAutoFeedback(c.env, { limit: 15 });
  return c.json({ ...result, pruned });
});

// Trigger self-heal media NGAY (khỏi chờ cron giờ) sau khi seed/raw-insert bài: enqueue audio còn
// thiếu + IPA còn thiếu. Idempotent — chạy lại vô hại. Dùng khi dựng khung bài hàng loạt.
r.post("/backfill-media", async (c) => {
  const audio = await pickExercisesNeedingAudio(c.env);
  if (audio.length) await enqueueExerciseAudio(c.env, audio);
  const ipa = await pickReadingNeedingIpa(c.env);
  if (ipa.length) await enqueueContentIpa(c.env, ipa);
  return c.json({ enqueued_audio: audio.length, enqueued_ipa: ipa.length });
});

export default r;
