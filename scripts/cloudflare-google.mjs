// Turn on "Sign in with Google" for learners on an install made with `pnpm cf:setup`:
//   pnpm cf:google <client-id> <client-secret>
//   pnpm cf:google                      # asks for both; prints what to paste into Google Cloud first
//   pnpm cf:google --off                # turn it off again
// Only the client id and secret are stored (as Worker secrets); the callback URL follows the app
// address. Step-by-step for Google Cloud Console: the public setup page (/setup) and docs/DEPLOY.md.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

if (!existsSync(ENV_FILE)) die("Chưa có .deploy.env — lệnh này dùng cho bản đã cài bằng pnpm cf:setup.");
const saved = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .map((l) => /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const CONFIG = saved.WRANGLER_CONFIG || "wrangler.prod.local.toml";
const url = (saved.PROD_URL || "").replace(/\/$/, "");
const env = { ...process.env, CLOUDFLARE_API_TOKEN: saved.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: saved.CLOUDFLARE_ACCOUNT_ID };
const wrangler = (args, input) =>
  execFileSync(process.execPath, [join(API_DIR, "node_modules/wrangler/bin/wrangler.js"), ...args, "--config", CONFIG], {
    cwd: API_DIR,
    env,
    input,
    stdio: [input ? "pipe" : "ignore", "ignore", "inherit"],
  });

const args = process.argv.slice(2);
if (args.includes("--off")) {
  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
    try {
      wrangler(["secret", "delete", name], "y\n");
    } catch {
      /* already absent */
    }
  }
  console.log("✓ Đã tắt đăng nhập Google.");
  process.exit(0);
}

console.log("Trong Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application), điền:");
console.log(`  Authorized JavaScript origins: ${url}`);
console.log(`  Authorized redirect URIs:      ${url}/api/v1/account/oauth/google/callback\n`);

let [clientId, clientSecret] = args.filter((a) => !a.startsWith("--"));
if (!clientId || !clientSecret) {
  if (!process.stdin.isTTY) die("Cách dùng: pnpm cf:google <client-id> <client-secret>");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  clientId ||= (await rl.question("Client ID: ")).trim();
  clientSecret ||= (await rl.question("Client secret: ")).trim();
  rl.close();
}
if (!/\.apps\.googleusercontent\.com$/.test(clientId)) die("Client ID phải có dạng …apps.googleusercontent.com — kiểm tra lại.");
if (!clientSecret) die("Thiếu client secret.");

const tmp = join(ROOT, ".deploy.secrets.json");
writeFileSync(tmp, JSON.stringify({ GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret }));
try {
  wrangler(["secret", "bulk", tmp]);
} finally {
  rmSync(tmp, { force: true });
}
console.log(`✓ Đã bật đăng nhập Google — thử ở ${url}/u/login (nút "Đăng nhập với Google").`);
