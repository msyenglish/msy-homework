// Brings a D1 database to a ready-to-use state: pending migrations, then any sample content pack
// (apps/api/seed/content/) not applied yet. Safe to run on every start.
//
//   node scripts/db-bootstrap.mjs --local     # + creates a default teacher when there is none
//   node scripts/db-bootstrap.mjs --remote    # production: content only; warns when no teacher
//
// WRANGLER_CONFIG=<file in apps/api> picks another config (default wrangler.toml).
// Local default teacher: OSS_TEACHER_EMAIL / OSS_TEACHER_PASSWORD (teacher@example.com / teacher123).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const API_DIR = fileURLToPath(new URL("../apps/api/", import.meta.url));
const CONFIG = process.env.WRANGLER_CONFIG || "wrangler.toml";
const remote = process.argv.includes("--remote");
const target = remote ? "--remote" : "--local";
const skipMigrate = process.argv.includes("--skip-migrate");

const toml = readFileSync(API_DIR + CONFIG, "utf8");
const dbName = toml.match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
if (!dbName) {
  console.error(`No database_name in apps/api/${CONFIG}`);
  process.exit(1);
}

// CI=1 skips wrangler's "apply migrations?" prompt.
const env = { ...process.env, CI: "1" };
// wrangler's own entry run by this Node: no pnpm/npx shim, so it works the same on Windows.
const WRANGLER_JS = join(API_DIR, "node_modules/wrangler/bin/wrangler.js");
const wrangler = (args, opts = {}) =>
  execFileSync(process.execPath, [WRANGLER_JS, ...args, "--config", CONFIG], { cwd: API_DIR, env, encoding: "utf8", ...opts });

function counts() {
  const out = wrangler(
    ["d1", "execute", dbName, target, "--json", "--command",
      "SELECT (SELECT count(*) FROM levels) AS levels, (SELECT count(*) FROM exercises) AS exercises, (SELECT count(*) FROM teachers) AS teachers"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  return JSON.parse(out.slice(out.indexOf("[")))[0].results[0];
}

console.log(`▸ D1 ${dbName} (${remote ? "remote" : "local"}, ${CONFIG})`);
if (!skipMigrate) wrangler(["d1", "migrations", "apply", dbName, target], { stdio: "inherit" });

// Content packs (apps/api/seed/content/NNNN_name.sql) apply once each, in order, like migrations;
// applied names are kept in settings.seed_packs so content a teacher deleted never comes back.
// A database that has content but no record predates packs: its content is pack 0001.
const PACKS_DIR = API_DIR + "seed/content/";
const packs = readdirSync(PACKS_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

function appliedPacks() {
  const out = wrangler(
    ["d1", "execute", dbName, target, "--json", "--command", "SELECT value FROM settings WHERE key = 'seed_packs'"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const row = JSON.parse(out.slice(out.indexOf("[")))[0].results[0];
  return row ? JSON.parse(row.value) : null;
}
function recordPacks(names) {
  const value = JSON.stringify(names).replace(/'/g, "''");
  wrangler(
    ["d1", "execute", dbName, target, "--command",
      `INSERT INTO settings (key, value) VALUES ('seed_packs', '${value}') ON CONFLICT(key) DO UPDATE SET value = excluded.value`],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

let c = counts();
let applied = appliedPacks();
if (!applied) {
  applied = c.levels > 0 || c.exercises > 0 ? packs.slice(0, 1) : [];
  if (applied.length) recordPacks(applied);
}
const pending = packs.filter((p) => !applied.includes(p));
for (const pack of pending) {
  console.log(`▸ Sample content pack ${pack}`);
  wrangler(["d1", "execute", dbName, target, `--file=./seed/content/${pack}`], { stdio: ["ignore", "ignore", "inherit"] });
  applied = [...applied, pack];
  recordPacks(applied);
}
c = counts();
console.log(
  pending.length
    ? `✓ Sample content: ${pending.length} pack(s) applied → ${c.levels} levels, ${c.exercises} exercises`
    : `✓ Sample content up to date (${applied.length}/${packs.length} packs, ${c.levels} levels, ${c.exercises} exercises)`,
);

if (c.teachers > 0) {
  console.log(`✓ ${c.teachers} teacher account(s)`);
} else if (remote) {
  console.log("⚠ No teacher account yet — create one:");
  console.log(`  cd apps/api && WRANGLER_CONFIG=${CONFIG} node seed/create-teacher.mjs you@example.com '<password>' 'Your name' --remote`);
} else {
  const email = process.env.OSS_TEACHER_EMAIL || "teacher@example.com";
  const password = process.env.OSS_TEACHER_PASSWORD || "teacher123";
  execFileSync("node", ["seed/create-teacher.mjs", email, password, "Teacher"], { cwd: API_DIR, env, stdio: ["ignore", "ignore", "inherit"] });
  console.log(`✓ Default teacher created → ${email} / ${password}  (change it in the app)`);
}
