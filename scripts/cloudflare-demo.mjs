// Create the demo learner on an install made with `pnpm cf:setup`, so the learner side can be tried
// without signing up and studying first:
//   pnpm cf:demo            learner@msyen.com / msyen123 with about two weeks of activity
//   pnpm cf:demo --reset    delete the demo learner and recreate it (fresh dates)
// Runs apps/api/seed/demo-learner.mjs against the live app. It signs in as a teacher to make the class
// and assignments: TEACHER_EMAIL / TEACHER_PASSWORD, else the admin account saved in .deploy.env.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "apps/api");
const ENV_FILE = join(ROOT, ".deploy.env");
const die = (m) => {
  console.error(`✘ ${m}`);
  process.exit(1);
};

if (!existsSync(ENV_FILE)) die("Chưa có .deploy.env — lệnh này dùng cho bản đã cài bằng pnpm cf:setup.");
const saved = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .map((l) => /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
if (!saved.PROD_URL) die("Không thấy PROD_URL trong .deploy.env — chạy lại pnpm cf:setup.");

const res = spawnSync(process.execPath, ["seed/demo-learner.mjs", "--remote", ...process.argv.slice(2).filter((a) => a === "--reset")], {
  cwd: API_DIR,
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_API_TOKEN: saved.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: saved.CLOUDFLARE_ACCOUNT_ID,
    WRANGLER_CONFIG: saved.WRANGLER_CONFIG || "wrangler.prod.local.toml",
    APP_URL: saved.PROD_URL,
    OSS_TEACHER_EMAIL: process.env.TEACHER_EMAIL || saved.ADMIN_EMAIL || "admin@msyen.com",
    OSS_TEACHER_PASSWORD: process.env.TEACHER_PASSWORD || saved.ADMIN_INITIAL_PASSWORD || "msyen123",
  },
});
if (res.status !== 0) {
  console.error("✘ Chưa tạo được học viên demo.");
  console.error("  Nếu đã đổi mật khẩu giáo viên: TEACHER_EMAIL=<email> TEACHER_PASSWORD=<mật-khẩu> pnpm cf:demo");
  process.exit(1);
}
