// Creates (or resets the password of) a teacher account.
//   node seed/create-teacher.mjs <email> <password> [name]            → local D1
//   node seed/create-teacher.mjs <email> <password> [name] --remote   → production D1
//   node seed/create-teacher.mjs <email> <password> --reset [--remote] → only change the password of an
//                                                                      existing account (name kept)
// WRANGLER_CONFIG=<file in apps/api> picks another config (its database_name is used).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const reset = args.includes("--reset");
const [email, password, name = "Teacher"] = args.filter((a) => a !== "--remote" && a !== "--reset");
if (!email || !password || password.length < 8) {
  console.error("Usage: node seed/create-teacher.mjs <email> <password (8+ chars)> [name] [--reset] [--remote]");
  process.exit(1);
}

// Same format as src/lib/password.ts: pbkdf2$<iterations>$<saltB64>$<hashB64>
const iterations = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
const passwordHash = `pbkdf2$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const sql = reset
  ? `UPDATE teachers SET password_hash = ${q(passwordHash)} WHERE email = ${q(email.toLowerCase())} RETURNING email;`
  : `INSERT INTO teachers (id, email, password_hash, name) VALUES (${q(randomUUID())}, ${q(email.toLowerCase())}, ${q(passwordHash)}, ${q(name)}) ` +
  `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, name = excluded.name;`;

const config = process.env.WRANGLER_CONFIG || "wrangler.toml";
const dbName = readFileSync(new URL(`../${config}`, import.meta.url), "utf8").match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
if (!dbName) {
  console.error(`No database_name in ${config}`);
  process.exit(1);
}

// wrangler's own entry run by this Node: no npx shim, and no shell that could mangle the quoted SQL.
const wranglerJs = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const out = execFileSync(
  process.execPath,
  [wranglerJs, "d1", "execute", dbName, remote ? "--remote" : "--local", "--config", config, "--json", "--command", sql],
  { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
// A reset that matched no row would otherwise "succeed" on a mistyped email (RETURNING tells).
const matched = (() => {
  try {
    return JSON.parse(out)[0]?.results?.length ?? 0;
  } catch {
    return 0;
  }
})();
if (reset && matched === 0) {
  console.error(`No teacher account with email ${email}.`);
  process.exit(2);
}
console.log(`Teacher ${email} ${reset ? "password reset" : "is ready"}${remote ? " (remote)" : " (local)"}.`);
