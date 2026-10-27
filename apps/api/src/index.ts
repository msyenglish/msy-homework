// ============================================================
//  Worker chính: phục vụ /api/v1 (Hono) + SPA tĩnh (ASSETS) — same-origin.
//  Cold start ~0ms (V8 isolate) → thay thế serverless Node chậm.
// ============================================================
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./lib/env";
import { requireTeacher } from "./middleware/auth";
import { requireUser } from "./middleware/userAuth";
import authRoutes from "./routes/auth";
import accountRoutes from "./routes/account";
import vocabPracticeRoutes from "./routes/vocabPractice";
import accountGrammarRoutes from "./routes/accountGrammar";
import accountOauthRoutes from "./routes/accountOauth";
import devLoginRoutes from "./routes/devLogin";
import libraryRoutes from "./routes/library";
import teacherUsersRoutes from "./routes/teacherUsers";
import classesRoutes from "./routes/classes";
import publicRoutes from "./routes/public";
import exercisesRoutes from "./routes/exercises";
import studentsRoutes from "./routes/students";
import levelsRoutes from "./routes/levels";
import topicsRoutes from "./routes/topics";
import vocabRoutes from "./routes/vocab";
import videoRoutes from "./routes/video";
import tagsRoutes from "./routes/tags";
import grammarRoutes from "./routes/grammar";
import pathsRoutes from "./routes/paths";
import submissionsRoutes from "./routes/submissions";
import readingRoutes from "./routes/reading";
import reportsRoutes from "./routes/reports";
import leaderboardRoutes from "./routes/leaderboard";
import aiRoutes from "./routes/ai";
import aiAdminRoutes from "./routes/aiAdmin"; // Cổng AI: điều phối provider/model, key, chi phí
import genTemplatesRoutes from "./routes/genTemplates";
import settingsRoutes from "./routes/settings";
import cronRoutes from "./routes/cron";
import publicReportRoutes from "./routes/publicReport";
import { audioServe, audioUpload } from "./routes/audio";
import { mediaRoutes } from "./routes/media";
import { SAFETY_NET_HOURS, runAutoFeedback } from "./lib/autoFeedback";
import { getSettings, setSettings } from "./lib/settings";
import { processAiJob } from "./lib/ai/jobs";
import { processReadingJob } from "./lib/readingJob";
import { processWritingJob } from "./lib/writingJob";
import { processQuizFeedbackJob } from "./lib/quizFeedback";
import { tagExerciseGrammar } from "./lib/grammarTag";
import { autoExerciseAudio } from "./lib/ttsJob";
import { getDb } from "./db";
import { enqueueContentIpa, generatePassageIpa, pickReadingNeedingIpa } from "./lib/contentBackfill";
import { enqueueExerciseAudio, pickExercisesNeedingAudio } from "./lib/audioBackfill";
import { applyAllDueEmailChanges } from "./lib/emailChange";
import type { Bindings } from "./lib/env";
import { getBrand } from "./lib/brand";
import { getUiTexts, publicUiTexts } from "./lib/uiTexts";
import uiTextsRoutes from "./routes/uiTexts";
import { applyTeacherTitle } from "@msyen/shared";

const app = new Hono<AppEnv>();

// CORS (same-origin ở prod & qua Vite proxy; cần khi chạy wrangler dev tách rời).
app.use("/api/*", async (c, next) => {
  const origins = (c.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: (o) => (origins.includes(o) ? o : origins[0] || o),
    credentials: true,
  })(c, next);
});

app.onError(async (err, c) => {
  if (err instanceof HTTPException) {
    // User-facing messages are written in the default teacher voice.
    const { title } = await getBrand(c.env).catch(() => ({ title: "cô" as const }));
    return c.json({ error: applyTeacherTitle(err.message, title) }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Lỗi máy chủ" }, 500);
});

const api = new Hono<AppEnv>();

// ---- Công khai (học sinh) ----
api.route("/auth", authRoutes);
api.route("/account/vocab", vocabPracticeRoutes); // luyện từ vựng v2 (requireUser trong file)
api.route("/account/grammar", accountGrammarRoutes); // luyện ngữ pháp (requireUser trong file)
api.route("/account", accountRoutes); // tài khoản user công khai (đăng ký/đăng nhập)
api.route("/account/oauth", accountOauthRoutes); // Google OAuth
api.route("/dev", devLoginRoutes); // one-click sign-in, 404 unless DEV_QUICK_LOGIN=1 on localhost
api.route("/media", audioServe); // phát tài nguyên R2 (URL mới, sạch): /api/v1/media/<key>
api.route("/audio", audioServe); // ALIAS cũ — URL/key đã lưu trong DB vẫn phát được
api.route("/cron", cronRoutes); // guard bằng CRON_SECRET (curl được từ server ngoài)
api.route("/public", publicReportRoutes); // báo cáo lượt nộp — link công khai cho phụ huynh
api.route("/", publicRoutes);

// ---- User công khai đã đăng nhập (yêu cầu cookie msyen_user) ----
// QUAN TRỌNG: KHÔNG mount guard "*" ở "/" — làm vậy biến requireUser thành middleware
// toàn cục "/*", chặn luôn mọi route đăng ký SAU đó (teacher, health) → 401 nhầm.
// Chỉ gắn guard đúng path /library (như teacher gắn ở /teacher).
api.use("/library", requireUser);
api.use("/library/*", requireUser);
api.route("/library", libraryRoutes);

// ---- Giáo viên (yêu cầu đăng nhập) ----
const teacher = new Hono<AppEnv>();
teacher.use("*", requireTeacher);
teacher.route("/exercises", exercisesRoutes);
teacher.route("/students", studentsRoutes);
teacher.route("/users", teacherUsersRoutes); // user công khai (read-only)
teacher.route("/classes", classesRoutes); // lớp học — tư cách thành viên phủ lên users
teacher.route("/levels", levelsRoutes);
teacher.route("/topics", topicsRoutes); // quản lý chủ đề bài tập (global)
teacher.route("/vocab", vocabRoutes); // ngân hàng từ vựng (vocab v2)
teacher.route("/video", videoRoutes); // bài học qua video (transcript → đoạn luyện)
teacher.route("/tags", tagsRoutes); // quản lý nhãn bài tập (kèm phạm vi all/student)
teacher.route("/grammar", grammarRoutes); // quản lý sổ tay ngữ pháp (CRUD)
teacher.route("/paths", pathsRoutes); // quản lý lộ trình (chặng + thứ tự bài) cho user công khai
teacher.route("/submissions", submissionsRoutes);
teacher.route("/reading", readingRoutes);
teacher.route("/reports", reportsRoutes);
teacher.route("/leaderboard", leaderboardRoutes); // BXH điểm user công khai theo kỳ
teacher.route("/ai", aiRoutes);
teacher.route("/ai", aiAdminRoutes); // /ai/config · /ai/keys · /ai/usage (không đụng path của aiRoutes)
teacher.route("/gen-templates", genTemplatesRoutes);
teacher.route("/settings", settingsRoutes);
teacher.route("/ui-texts", uiTextsRoutes);
teacher.route("/audio", audioUpload);
teacher.route("/media", mediaRoutes); // tìm ảnh online (Pexels/Pixabay) + nhập vào R2
api.route("/teacher", teacher);

api.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));
// Teacher-edited interface copy (public, read before the app renders).
api.get("/ui-texts", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json(publicUiTexts(await getUiTexts(c.env)));
});
// Branding for the SPA shell (public, read before the app renders).
api.get("/brand", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json(await getBrand(c.env));
});

app.route("/api/v1", api);

// An unmatched API path must answer as an API. Without this it fell through to the SPA fallback
// below and returned the HTML shell with status 200, so a typo'd endpoint looked like a success.
app.all("/api/*", (c) => c.json({ error: "Không tìm thấy endpoint" }, 404));

// ---- SPA fallback: every non-/api request is served from the static assets ----
// The app is not meant for search engines: every page gets noindex,nofollow (robots.txt stops
// well-behaved bots; noindex also covers engines that indexed it anyway).
// Hashed build files that no longer exist. `not_found_handling = "single-page-application"` answers
// EVERY miss with the HTML shell at status 200, so a tab left open across a deploy asks for its old
// /assets/index-<hash>.css and receives HTML: the browser then reports a MIME error (and for a JS
// chunk, "Unexpected token '<'") instead of a plain 404. A miss under /assets must say 404.
const STATIC_EXT = /\.(css|js|mjs|map|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|json|txt|xml|wasm)$/i;

app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const path = new URL(c.req.url).pathname;
  if (
    STATIC_EXT.test(path) &&
    (res.headers.get("content-type") ?? "").includes("text/html")
  ) {
    return c.text("Not found", 404);
  }
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  return out;
});

// ---- Cron Trigger (Cloudflare) — chạy tự động nhận xét nếu được bật ----
async function scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
  ctx.waitUntil(
    (async () => {
      try {
        const db = getDb(env.DB);
        const st = await getSettings(db);
        // The cron fires hourly; the AI-comment safety net runs every SAFETY_NET_HOURS.
        const last = st.auto_feedback_last_run ? Date.parse(st.auto_feedback_last_run) : 0;
        if (Date.now() - last < SAFETY_NET_HOURS * 3_600_000 - 60_000) return;
        await runAutoFeedback(env, { limit: 20 });
        await setSettings(db, { auto_feedback_last_run: new Date().toISOString() });
      } catch (e) {
        console.error("Cron auto-feedback lỗi:", e);
      }
    })(),
  );
  // Áp các yêu cầu đổi email đã tới hạn (2 ngày) — kể cả khi user không vào app.
  ctx.waitUntil(
    (async () => {
      try {
        await applyAllDueEmailChanges(getDb(env.DB));
      } catch (e) {
        console.error("Cron apply email change lỗi:", e);
      }
    })(),
  );
  // Sinh IPA + dịch câu (passage_ipa) cho bài reading còn thiếu → CONTENT_QUEUE riêng (song ngữ).
  ctx.waitUntil(
    (async () => {
      try {
        const ids = await pickReadingNeedingIpa(env);
        if (ids.length) await enqueueContentIpa(env, ids);
      } catch (e) {
        console.error("Cron passage IPA lỗi:", e);
      }
    })(),
  );
  // Self-heal AUDIO for listening/mixed exercises still missing audio_url → AI_QUEUE tts.
  ctx.waitUntil(
    (async () => {
      try {
        if (env.MEDIA_BACKFILL === "off") return;
        const ids = await pickExercisesNeedingAudio(env);
        if (ids.length) await enqueueExerciseAudio(env, ids);
      } catch (e) {
        console.error("Cron exercise audio lỗi:", e);
      }
    })(),
  );
}

// ---- Queue consumer: async jobs (AI exercise generation, read-aloud grading, grammar tagging) ----
// Dispatch on `type`: "reading" → pronunciation grading; "writing" → writing grading;
// "grammar" → tag grammar points on questions · "tts" → listening audio from the script
// (both jobId = exercises.id); default → AI exercise generation.
type QueueJob =
  | { jobId: string; type?: "reading" | "writing" | "grammar" | "tts"; force?: boolean }
  // Sinh IPA + dịch câu cho passage (CONTENT_QUEUE riêng). Xem lib/contentBackfill.
  | { type: "passage_ipa"; exerciseId: string }
  // Write the AI comment for a freshly graded quiz submission (jobId = submissions.id).
  | { type: "quiz_feedback"; jobId: string };

async function queue(batch: MessageBatch<QueueJob>, env: Bindings) {
  for (const msg of batch.messages) {
    try {
      if (msg.body.type === "passage_ipa") await generatePassageIpa(env, msg.body.exerciseId);
      else if (msg.body.type === "reading") await processReadingJob(env, msg.body.jobId);
      else if (msg.body.type === "writing") await processWritingJob(env, msg.body.jobId);
      else if (msg.body.type === "quiz_feedback") await processQuizFeedbackJob(env, msg.body.jobId);
      else if (msg.body.type === "grammar") await tagExerciseGrammar(env, msg.body.jobId);
      else if (msg.body.type === "tts") await autoExerciseAudio(env, msg.body.jobId, { force: msg.body.force });
      else await processAiJob(env, msg.body.jobId);
    } catch (e) {
      console.error("Queue job lỗi:", e);
    } finally {
      // processor đã tự đánh dấu error → ack để không retry vô hạn.
      msg.ack();
    }
  }
}

export default { fetch: app.fetch, scheduled, queue } satisfies ExportedHandler<Bindings, QueueJob>;
