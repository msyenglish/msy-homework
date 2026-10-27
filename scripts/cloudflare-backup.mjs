// Back up the live D1 database of an install made with `pnpm cf:setup`:
//   pnpm cf:backup
// Exports the whole database to SQL (wrangler d1 export), keeps a copy in ./backups/ and uploads one
// to the app's own R2 bucket under backups/d1/. `pnpm cf:update` runs it before every update.
// Restore: see docs/DEPLOY.md (D1 Time Travel for the last days, or the SQL file into a new database).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
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
const CONFIG = saved.WRANGLER_CONFIG || "wrangler.prod.local.toml";
const toml = readFileSync(join(API_DIR, CONFIG), "utf8");
const dbName = toml.match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
const bucket = toml.match(/^bucket_name\s*=\s*"([^"]+)"/m)?.[1];
if (!dbName || !bucket) die(`Không đọc được database_name / bucket_name trong ${CONFIG}.`);

const env = { ...process.env, CLOUDFLARE_API_TOKEN: saved.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: saved.CLOUDFLARE_ACCOUNT_ID };
const wrangler = (args) =>
  execFileSync(process.execPath, [join(API_DIR, "node_modules/wrangler/bin/wrangler.js"), ...args, "--config", CONFIG], {
    cwd: API_DIR,
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = `${dbName}-${stamp}.sql`;
const dir = join(ROOT, "backups");
mkdirSync(dir, { recursive: true });
const local = join(dir, file);

console.log(`▸ Xuất D1 ${dbName}…`);
wrangler(["d1", "export", dbName, "--remote", "--output", local]);
const mb = (statSync(local).size / 1048576).toFixed(1);
console.log(`✓ backups/${file} (${mb} MB)`);

console.log(`▸ Đẩy lên R2 ${bucket}/backups/d1/${file}…`);
wrangler(["r2", "object", "put", `${bucket}/backups/d1/${file}`, "--file", local, "--content-type", "application/sql", "--remote"]);
console.log("✓ Đã lưu một bản trên R2");
