// Reset a teacher's password on an install made with `pnpm cf:setup`, using the saved Cloudflare
// token (.deploy.env) — for when the password is lost and nobody can sign in to change it.
//   pnpm cf:reset-password                       # pick the account, generate a new password
//   pnpm cf:reset-password you@example.com       # that account, generated password
//   pnpm cf:reset-password you@example.com 'new-password-8+'
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "apps/api");
const ENV_FILE = join(ROOT, ".deploy.env");
const die = (m) => {
  console.error(`✘ ${m}`);
  process.exit(1);
};

if (!existsSync(ENV_FILE)) die("Chưa có .deploy.env — lệnh này dùng cho bản đã cài bằng pnpm cf:setup (chạy trong thư mục đã cài).");
const saved = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .map((l) => /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const CONFIG = saved.WRANGLER_CONFIG || "wrangler.prod.local.toml";
if (!saved.CLOUDFLARE_API_TOKEN) die(".deploy.env không có CLOUDFLARE_API_TOKEN.");
if (!existsSync(join(API_DIR, CONFIG))) die(`Thiếu apps/api/${CONFIG} — chạy pnpm cf:update để sinh lại.`);
const env = { ...process.env, CLOUDFLARE_API_TOKEN: saved.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: saved.CLOUDFLARE_ACCOUNT_ID, WRANGLER_CONFIG: CONFIG };
const dbName = readFileSync(join(API_DIR, CONFIG), "utf8").match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
if (!dbName) die(`Không đọc được database_name trong ${CONFIG}.`);

const [argEmail, argPassword] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

// Teachers on the live database, so the account can be picked instead of typed.
const out = execFileSync(
  process.execPath,
  [join(API_DIR, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", dbName, "--remote", "--json", "--config", CONFIG, "--command", "SELECT email, name FROM teachers ORDER BY created_at"],
  { cwd: API_DIR, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
let teachers = [];
try {
  teachers = JSON.parse(out)[0].results;
} catch {
  die("Không đọc được danh sách giáo viên (token còn hạn không?).");
}
if (!teachers.length) die("Chưa có tài khoản giáo viên nào — chạy pnpm cf:update để tạo tài khoản admin mặc định.");

const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
let email = argEmail?.toLowerCase();
if (!email) {
  if (teachers.length === 1) email = teachers[0].email;
  else {
    teachers.forEach((t, i) => console.log(`  ${i + 1}. ${t.email}${t.name ? ` (${t.name})` : ""}`));
    const pick = rl ? Number((await rl.question("Chọn tài khoản [1]: ")).trim() || "1") - 1 : 0;
    email = teachers[pick]?.email;
    if (!email) die("Lựa chọn không hợp lệ.");
  }
}
if (!teachers.some((t) => t.email === email)) die(`Không có giáo viên ${email}. Có: ${teachers.map((t) => t.email).join(", ")}`);

let password = argPassword || (rl ? (await rl.question("Mật khẩu mới (bỏ trống = tự sinh): ")).trim() : "");
rl?.close();
if (!password) password = randomBytes(9).toString("base64url");
if (password.length < 8) die("Mật khẩu cần ít nhất 8 ký tự.");

execFileSync(process.execPath, ["seed/create-teacher.mjs", email, password, "--reset", "--remote"], {
  cwd: API_DIR,
  env,
  stdio: ["ignore", "ignore", "inherit"],
});
console.log(`\n✓ Đã đặt lại mật khẩu cho ${email}`);
console.log(`  Mật khẩu mới: ${password}`);
console.log(`  Đăng nhập: ${saved.PROD_URL || ""}/teacher/login — rồi đổi mật khẩu ở Cài đặt → Tài khoản.`);
