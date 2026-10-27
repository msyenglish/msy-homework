/** Cloudflare Workers Rate Limiting binding — `simple()` limiter, xem lib/rateLimit.ts. */
interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/** Cloudflare Analytics Engine dataset — ghi telemetry non-blocking, xem lib/telemetry.ts. */
interface AnalyticsEngineDataset {
  writeDataPoint(event: { indexes?: string[]; blobs?: (string | null)[]; doubles?: number[] }): void;
}

// Kiểu binding & biến ngữ cảnh dùng chung cho toàn bộ Hono app.
export type Bindings = {
  DB: D1Database;
  AUDIO: R2Bucket;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
  // ---- Rate-limit (xem wrangler.toml [[ratelimits]] + lib/rateLimit.ts) ----
  RL_DATA: RateLimit; // đọc dữ liệu đắt (vocab practice, grammar)
  RL_SPEAK: RateLimit; // TTS on-demand (word/speak)
  RL_AI: RateLimit; // learner-triggered AI spend (vocab suggest) — tightest of the limiters
  RL_AUTH: RateLimit; // login/register — blocks password guessing and bulk sign-ups
  // Analytics Engine: abuse telemetry (429/hit per scope/IP). Optional so dev needs no binding.
  ABUSE_AE?: AnalyticsEngineDataset;
  PUBLIC_BASE_URL?: string; // e.g. https://homework.example.com — used to build absolute links
  JWT_SECRET: string;
  // Optional: encrypts provider keys stored in D1. Falls back to JWT_SECRET when unset.
  KEY_ENCRYPTION_SECRET?: string;
  CRON_SECRET?: string; // secret: bảo vệ endpoint /api/v1/cron/*
  MEDIA_BACKFILL?: string; // "off" skips the hourly exercise-audio backfill cron
  DEV_QUICK_LOGIN?: string; // "1" (in .dev.vars only) enables /dev/quick-login for loopback clients
  // ---- Cổng AI đa provider ----
  // Mỗi provider: <P>_API_KEYS = nhiều key phẩy ngăn cách (xoay vòng + fallback),
  // <P>_BASE_URL = ghi đè endpoint (vd trỏ qua Cloudflare AI Gateway).
  // Đặt qua `wrangler secret put`, KHÔNG để trong wrangler.toml.
  // Tác vụ nào chạy provider/model nào thì cấu hình ở D1 (settings.ai_routes) qua
  // trang /teacher/ai — KHÔNG phải ở đây.
  GEMINI_API_KEYS?: string; // giữ tên cũ (google) để khỏi rotate secret đang chạy
  OPENAI_API_KEYS?: string;
  DEEPSEEK_API_KEYS?: string;
  XAI_API_KEYS?: string;
  ANTHROPIC_API_KEYS?: string;
  // Aggregator: ONE key reaches 300+ models. Its catalog is fetched at runtime and cached in D1
  // (settings.ai_openrouter_catalog), not hardcoded — see lib/ai/openrouter.ts.
  OPENROUTER_API_KEYS?: string;
  // Deepgram (TTS voices + word timings). Keys can also be entered on /teacher/ai (stored encrypted).
  DEEPGRAM_API_KEYS?: string;
  OPENAI_BASE_URL?: string;
  DEEPSEEK_BASE_URL?: string;
  XAI_BASE_URL?: string;
  ANTHROPIC_BASE_URL?: string;
  OPENROUTER_BASE_URL?: string;
  /** @deprecated Model mặc định nay lấy từ D1 (settings.ai_default). Chỉ còn dùng làm chốt cuối. */
  GEMINI_MODEL?: string;
  // Base URL tới Gemini. Mặc định gọi thẳng Google; đặt qua Cloudflare AI Gateway
  // để tránh chặn địa lý khi Worker egress qua PoP không được hỗ trợ (vd Hong Kong).
  // Dạng: https://gateway.ai.cloudflare.com/v1/<acct>/<gateway>/google-ai-studio/v1beta/models
  GEMINI_BASE_URL?: string;
  // ---- Queue: hàng chờ bất đồng bộ (tạo bài AI · chấm đọc to) ----
  // type "reading" → chấm phát âm; bỏ trống → sinh bài bằng AI.
  // Phải khớp `QueueJob` ở index.ts — thêm loại việc mới thì sửa CẢ HAI chỗ.
  AI_QUEUE: Queue<
    | { jobId: string; type?: "reading" | "grammar" | "tts"; force?: boolean }
    | { type: "quiz_feedback"; jobId: string }
  >;
  // ---- Queue TƯƠNG TÁC: job chấm đọc-to/nói + nhận xét quiz của học sinh (chờ ngay tại chỗ).
  // Tách khỏi AI_QUEUE để KHÔNG bị job sinh-bài/TTS/vocab chiếm hết slot → chậm, học sinh chạm
  // trần "nộp quá lâu". Cùng handler `queue()`, phân loại theo `type`. ----
  INTERACTIVE_QUEUE: Queue<{ jobId: string; type: "reading" | "writing" | "quiz_feedback" }>;
  // Làm giàu NỘI DUNG bài (IPA + dịch câu) — queue riêng để không bị backlog vocab bóp.
  CONTENT_QUEUE: Queue<
    | { type: "passage_ipa"; exerciseId: string }
  >;
  // ---- Speech ----
  // Azure Speech (pronunciation scoring + TTS). Missing → those features answer 503.
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string; // e.g. southeastasia

  // Tìm ảnh minh hoạ (kho ảnh miễn phí). Pexels chính, Pixabay fallback. Không đặt → tắt tìm ảnh.
  PEXELS_API_KEY?: string; // secret
  PIXABAY_API_KEY?: string; // secret
  // ---- Email giao dịch (Resend) — dùng cho "quên mật khẩu". Không đặt → tắt gửi email ----
  RESEND_API_KEY?: string; // secret
  EMAIL_FROM?: string; // e.g. "Homework <no-reply@example.com>" — domain verified at Resend
  // ---- Google OAuth (user công khai) — đặt qua `wrangler secret put`, không để trong wrangler.toml ----
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string; // e.g. https://homework.example.com/api/v1/account/oauth/google/callback
};

export type TeacherCtx = { id: string; email: string };
export type UserCtx = { id: string; email: string };

export type Variables = {
  teacher: TeacherCtx;
  user: UserCtx; // user CÔNG KHAI (public) — đặt bởi requireUser
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
