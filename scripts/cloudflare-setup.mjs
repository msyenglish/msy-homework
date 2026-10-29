// One-command install / update on Cloudflare.
//
//   pnpm cf:setup <token>                          # first install — nothing else is asked
//   pnpm cf:setup <token> --domain free.msyen.com  # with a domain of this Cloudflare account
//   pnpm cf:setup --update                         # re-run with the saved answers (pnpm cf:update)
//   pnpm cf:setup --dry-run                        # print the plan and the generated config only
//   pnpm cf:setup <token> --no-demo                # skip the demo learner made on a first install
//   pnpm cf:setup <token> --no-telemetry           # do not report this install's URL to free.msyen.com
// Without a token on the command line or in .deploy.env it asks for one.
//
// Every step is idempotent: existing resources are reused, secrets that already exist are never
// rotated (rotating JWT_SECRET would sign everyone out), and the teacher account is only created
// when there is none. Answers are saved in .deploy.env (gitignored, mode 600) and the generated
// config in apps/api/wrangler.prod.local.toml (gitignored) — wrangler.toml itself is never edited,
// so `git pull` stays conflict-free.
//
// Install count: after a deploy the script sends the app URL, "install"/"update" and the version to
// INSTALL_HUB, and the Worker repeats it once a day; nothing else is sent. --no-telemetry (or
// TELEMETRY=off) turns both off and is remembered in .deploy.env.
//
// Also from the environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, APP_NAME, APP_DOMAIN,
// WORKERS_SUBDOMAIN, TEACHER_EMAIL, TEACHER_PASSWORD, TELEMETRY. The first teacher is ADMIN_EMAIL /
// ADMIN_PASSWORD below unless those are set — the same documented default on every install.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "apps/api");
const ENV_FILE = join(ROOT, ".deploy.env");
const CONFIG = "wrangler.prod.local.toml";
const CF = "https://api.cloudflare.com/client/v4";
/** The project site that counts installs (same as INSTALL_HUB in apps/api/src/lib/installPing.ts). */
const INSTALL_HUB = "https://free.msyen.com";

const argv = process.argv.slice(2);
const UPDATE = argv.includes("--update");
const DRY = argv.includes("--dry-run");
const YES = argv.includes("--yes") || UPDATE;
/** `--name value` / `--name=value`. */
const flag = (n) => {
  const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return undefined;
  return argv[i].includes("=") ? argv[i].split("=").slice(1).join("=") : argv[i + 1];
};
const flagValues = new Set(["--token", "--domain", "--name"].map((f) => flag(f.slice(2))).filter(Boolean));
// A bare argument that is not a flag value is the token: `pnpm cf:setup cfat_…`.
const ARG_TOKEN = flag("token") || argv.find((a) => !a.startsWith("--") && !flagValues.has(a));

// The one default account of every install — documented on the public setup page; change it after signing in.
const ADMIN_EMAIL = "admin@msyen.com";
const ADMIN_PASSWORD = "msyen123";

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint("1");
const green = paint("32");
const yellow = paint("33");
const red = paint("31");
const step = (s) => console.log(`\n${bold("▸ " + s)}`);
const ok = (s) => console.log(green("✓ " + s));
const warn = (s) => console.log(yellow("⚠ " + s));
const die = (s) => {
  console.error(red("✘ " + s));
  process.exit(1);
};

// ---------- saved answers ----------
function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
function saveEnvFile(vals) {
  const body = [
    "# Written by scripts/cloudflare-setup.mjs — keep private (it holds your API token).",
    ...Object.entries(vals)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}=${v}`),
    "",
  ].join("\n");
  writeFileSync(ENV_FILE, body);
  chmodSync(ENV_FILE, 0o600);
}

// ---------- prompts ----------
const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
async function ask(question, def = "") {
  if (!rl) return def;
  const v = await rl.question(def ? `${question} [${def}]: ` : `${question}: `);
  return v.trim() || def;
}

/** What people actually paste: stray spaces/quotes, or the whole "Bearer xxx" header. */
const cleanToken = (t) => t.trim().replace(/^["']|["']$/g, "").replace(/^bearer\s+/i, "").trim();
const maskToken = (t) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)} (${t.length} ký tự)` : "(quá ngắn)");

// ---------- Cloudflare REST ----------
let TOKEN = "";
async function cf(method, path, body) {
  const res = await fetch(`${CF}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && data.success !== false, data };
}
const cfErr = (r) => (r.data?.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${r.status}`;

// ---------- names ----------
const NAME_RE = /^[a-z][a-z0-9-]{2,40}$/;
const dbNameOf = (name) => name.replace(/-/g, "_");

/**
 * The deploy config: wrangler.toml with this install's names and IDs. Built from the CURRENT
 * wrangler.toml on every run, so bindings added by an update (a new queue…) are picked up.
 */
function buildConfig(base, { name, dbId, url, domain, noAnalytics, version, telemetry }) {
  let s = base;
  // Analytics Engine must be switched on per account before a Worker may bind it. The binding is
  // optional in the app (abuse telemetry only), so an account without it simply goes without.
  if (noAnalytics) s = s.replace(/^\[\[analytics_engine_datasets\]\][^[]*/m, "");
  const swap = (re, to) => {
    if (!re.test(s)) die(`wrangler.toml không còn dòng ${re} — script setup cần cập nhật.`);
    s = s.replace(re, to);
  };
  swap(/^name\s*=\s*"[^"]*"/m, `name = "${name}"`);
  swap(/^database_name\s*=\s*"[^"]*"/m, `database_name = "${dbNameOf(name)}"`);
  swap(/^database_id\s*=\s*"[^"]*"/m, `database_id = "${dbId}"`);
  swap(/^bucket_name\s*=\s*"[^"]*"/m, `bucket_name = "${name}"`);
  // Queues follow the worker name: "english-homework-ai-jobs" → "<name>-ai-jobs".
  s = s.replace(/^(queue\s*=\s*")english-homework-([^"]+)"/gm, `$1${name}-$2"`);
  // Rate-limit namespaces and the abuse dataset are per ACCOUNT: an install next to other apps must not
  // share their counters, so both follow the app name (a stable block of ids per name).
  const rlBase = 1000 + (fnv1a(name) % 8000) * 10;
  let k = 0;
  s = s.replace(/^(namespace_id\s*=\s*")\d+(")/gm, (_, a, b) => `${a}${rlBase + ++k}${b}`);
  s = s.replace(/^(dataset\s*=\s*")[^"]*(")/m, `$1${dbNameOf(name)}_abuse$2`);
  swap(/^PUBLIC_BASE_URL\s*=\s*"[^"]*"/m, `PUBLIC_BASE_URL = "${url}"`);
  swap(/^ALLOWED_ORIGINS\s*=\s*"[^"]*"/m, `ALLOWED_ORIGINS = "${url}"`);
  swap(/^APP_VERSION\s*=\s*"[^"]*"/m, `APP_VERSION = "${version}"`);
  swap(/^TELEMETRY\s*=\s*"[^"]*"/m, `TELEMETRY = "${telemetry ? "on" : "off"}"`);
  if (domain) s += `\n[[routes]]\npattern = "${domain}"\ncustom_domain = true\n`;
  return `# Generated by scripts/cloudflare-setup.mjs from wrangler.toml — do not edit, re-run the setup.\n${s}`;
}
/** Runs a command showing its output live, and also returns that output for inspection. */
function runTee(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ["inherit", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

/** bash for deploy-prod.sh — on Windows the one shipped with Git for Windows. */
function bashPath() {
  if (process.platform !== "win32") return "bash";
  try {
    const git = execFileSync("where", ["git"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
    const bash = join(dirname(git), "..", "bin", "bash.exe");
    if (existsSync(bash)) return bash;
  } catch {
    /* fall through */
  }
  die("Không tìm thấy bash của Git for Windows — cài Git (scripts/install.ps1 tự cài) rồi chạy lại.");
}

/** Small stable hash of a string (FNV-1a, 32-bit). */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** "2.0.0+d401071": the package version and the commit this install runs. */
function appVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  let sha = "";
  try {
    sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    /* not a git checkout */
  }
  return sha ? `${pkg.version}+${sha}` : pkg.version;
}

/** Tells the project site this install exists; a failure never stops the setup. */
async function pingHub(url, event, version) {
  if (url.replace(/\/+$/, "") === INSTALL_HUB) return false;
  try {
    const r = await fetch(`${INSTALL_HUB}/api/v1/installs/ping`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, event, version }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

const queuesOf = (toml) => [...new Set([...toml.matchAll(/^queue\s*=\s*"([^"]+)"/gm)].map((m) => m[1]))];

const WRANGLER_JS = join(API_DIR, "node_modules/wrangler/bin/wrangler.js");
function wrangler(args, { capture = false } = {}) {
  // wrangler's own entry run by this Node: no pnpm shim, so it works the same on Windows.
  const res = spawnSync(process.execPath, [WRANGLER_JS, ...args, "--config", CONFIG], {
    cwd: API_DIR,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return { code: res.status ?? 1, out: res.stdout ?? "", err: res.stderr ?? "" };
}

// ====================================================================================
async function main() {
  const saved = loadEnvFile();
  console.log(bold(UPDATE ? "Cập nhật English Homework trên Cloudflare" : "Cài English Homework lên Cloudflare"));
  if (DRY) warn("--dry-run: chỉ in kế hoạch, không tạo hay đổi gì.");

  // ---- 1) Token + account ----
  step("Cloudflare API token");
  TOKEN = cleanToken(ARG_TOKEN || process.env.CLOUDFLARE_API_TOKEN || saved.CLOUDFLARE_API_TOKEN || "");
  let accs = null;
  if (!DRY) {
    const interactive = !!rl && !YES;
    if (!TOKEN && interactive) {
      console.log(
        "Tạo token: mở dash.cloudflare.com → góc phải trên: biểu tượng người → My Profile → API Tokens →\n" +
          "  Create Token → Create Custom Token → thêm các quyền (cột Account):\n" +
          "    Workers Scripts: Edit · D1: Edit · Workers R2 Storage: Edit · Queues: Edit · Account Settings: Read\n" +
          "  (dùng domain riêng: thêm Zone · DNS: Edit và Zone · Workers Routes: Edit)\n" +
          "  → Continue to summary → Create Token → bấm Copy.",
      );
    }
    // Checked right away and asked again on a mistake, instead of failing at the end of the run.
    for (let attempt = 1; ; attempt++) {
      if (!TOKEN && interactive) TOKEN = cleanToken(await ask("Dán token vào đây rồi Enter"));
      if (!TOKEN) die("Thiếu CLOUDFLARE_API_TOKEN.");
      accs = await cf("GET", "/accounts?per_page=50");
      if (accs.ok && accs.data.result?.length) {
        ok(`Token hợp lệ: ${maskToken(TOKEN)}`);
        break;
      }
      // 6003/6111/1000/9109: malformed, unknown or revoked token — say that, not the raw header error.
      const codes = (accs.data?.errors ?? []).map((e) => e.code);
      const why = accs.ok
        ? "token không thấy tài khoản nào — thiếu quyền Account Settings: Read"
        : codes.some((c) => [6003, 6111, 1000, 9109].includes(c))
          ? "token sai, thiếu ký tự hoặc đã bị xoá"
          : cfErr(accs);
      if (!interactive || attempt >= 3) die(`Token không dùng được (${why}). Tạo token mới rồi chạy lại lệnh.`);
      warn(`Token ${maskToken(TOKEN)} không dùng được (${why}) — dán lại.`);
      TOKEN = "";
    }
  }

  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || saved.CLOUDFLARE_ACCOUNT_ID || "";
  let accountName = "";
  if (!DRY) {
    const list = accs.data.result ?? [];
    if (!list.length) die("Token không thấy tài khoản Cloudflare nào.");
    if (accountId) {
      const hit = list.find((a) => a.id === accountId);
      if (!hit) die(`Token không có quyền với tài khoản ${accountId}.`);
      accountName = hit.name;
    } else if (list.length === 1 || YES) {
      [accountId, accountName] = [list[0].id, list[0].name];
    } else {
      list.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} (${a.id})`));
      const pick = Number(await ask("Chọn tài khoản", "1")) - 1;
      if (!list[pick]) die("Lựa chọn không hợp lệ.");
      [accountId, accountName] = [list[pick].id, list[pick].name];
    }
    ok(`Tài khoản: ${accountName} (${accountId})`);
  } else {
    accountId ||= "<account-id>";
  }
  process.env.CLOUDFLARE_API_TOKEN = TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  const A = `/accounts/${accountId}`;

  // ---- 2) Name, address ----
  step("Tên app và địa chỉ");
  // Nothing is asked here: sensible defaults, overridable with --name / --domain.
  const name = flag("name") || process.env.APP_NAME || saved.APP_NAME || "msy-homework";
  if (!NAME_RE.test(name)) die(`Tên "${name}" không hợp lệ — chỉ chữ thường, số và gạch nối, 3-41 ký tự, bắt đầu bằng chữ.`);
  let domain = flag("domain") ?? process.env.APP_DOMAIN ?? saved.APP_DOMAIN ?? "";
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const adminEmail = (process.env.TEACHER_EMAIL || ADMIN_EMAIL).toLowerCase();
  const adminPassword = process.env.TEACHER_PASSWORD || ADMIN_PASSWORD;
  if (adminPassword.length < 8) die("Mật khẩu cần ít nhất 8 ký tự.");

  let url = domain ? `https://${domain}` : "";
  if (!url) {
    if (DRY) url = `https://${name}.<subdomain>.workers.dev`;
    else {
      let sub = await cf("GET", `${A}/workers/subdomain`);
      if (!sub.ok || !sub.data.result?.subdomain) {
        // A new account has no workers.dev subdomain until one is claimed.
        // "Jane.doe@gmail.com's Account" → "jane-doe": the account-wide name every Worker URL carries.
        const base = (accountName || name).replace(/'s account$/i, "").replace(/@.*$/, "");
        const want =
          process.env.WORKERS_SUBDOMAIN ||
          base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
          name;
        const pick = want;
        console.log(`  Tài khoản chưa có tên miền workers.dev — tạo "${pick}" (đặt tên khác: WORKERS_SUBDOMAIN=…).`);
        sub = await cf("PUT", `${A}/workers/subdomain`, { subdomain: pick });
        if (!sub.ok) die(`Không tạo được tên miền workers.dev (${cfErr(sub)}). Mở Workers & Pages một lần trên dashboard rồi chạy lại.`);
      }
      url = `https://${name}.${sub.data.result.subdomain}.workers.dev`;
    }
  }
  ok(`Địa chỉ: ${url}`);

  // ---- 3) Resources ----
  step("Tài nguyên Cloudflare (đã có thì dùng lại)");
  const base = readFileSync(join(API_DIR, "wrangler.toml"), "utf8");
  const dbName = dbNameOf(name);
  let dbId = "<database-id>";
  if (!DRY) {
    const found = await cf("GET", `${A}/d1/database?name=${encodeURIComponent(dbName)}`);
    if (!found.ok) die(`Không đọc được D1 (${cfErr(found)}) — token cần quyền D1: Edit.`);
    const hit = (found.data.result ?? []).find((d) => d.name === dbName);
    if (hit) {
      dbId = hit.uuid;
      ok(`D1 ${dbName} (có sẵn)`);
    } else {
      const made = await cf("POST", `${A}/d1/database`, { name: dbName });
      if (!made.ok) die(`Không tạo được D1 (${cfErr(made)}).`);
      dbId = made.data.result.uuid;
      ok(`D1 ${dbName} (mới tạo)`);
    }

    const bucket = await cf("GET", `${A}/r2/buckets/${name}`);
    if (bucket.ok) ok(`R2 ${name} (có sẵn)`);
    else {
      // R2 has to be switched on once by the account owner (a payment method on file, free tier).
      // Wait for it here instead of making them start over.
      for (let attempt = 1; ; attempt++) {
        const made = await cf("POST", `${A}/r2/buckets`, { name });
        if (made.ok) break;
        const msg = cfErr(made);
        if (!/10042|enable R2/i.test(msg)) die(`Không tạo được R2 (${msg}) — token cần quyền Workers R2 Storage: Edit.`);
        const link = `https://dash.cloudflare.com/${accountId}/r2/overview`;
        if (!rl || attempt > 5) die(`R2 chưa được bật — mở ${link}, bật R2 (gói miễn phí) rồi chạy lại lệnh này.`);
        warn(`R2 chưa được bật. Mở ${link} → bật R2 (gói miễn phí, Cloudflare có thể đòi thêm thẻ).`);
        await rl.question("Bật xong thì bấm Enter để chạy tiếp… ");
      }
      ok(`R2 ${name} (mới tạo)`);
    }
  }

  let noAnalytics = saved.NO_ANALYTICS_ENGINE === "1";
  const version = appVersion();
  const telemetry = !(argv.includes("--no-telemetry") || (process.env.TELEMETRY ?? saved.TELEMETRY) === "off");
  let config = buildConfig(base, { name, dbId, url, domain, noAnalytics, version, telemetry });
  if (!DRY) {
    const have = await cf("GET", `${A}/queues?per_page=100`);
    if (!have.ok) die(`Không đọc được Queues (${cfErr(have)}) — token cần quyền Queues: Edit.`);
    const names = new Set((have.data.result ?? []).map((q) => q.queue_name));
    for (const q of queuesOf(config)) {
      if (names.has(q)) {
        ok(`Queue ${q} (có sẵn)`);
        continue;
      }
      const made = await cf("POST", `${A}/queues`, { queue_name: q });
      if (!made.ok) die(`Không tạo được queue ${q} (${cfErr(made)}).`);
      ok(`Queue ${q} (mới tạo)`);
    }
  }

  // ---- 4) Config + saved answers ----
  step("Cấu hình");
  if (DRY) {
    console.log(config);
    console.log(`Queues: ${queuesOf(config).join(", ")}`);
    return;
  }
  writeFileSync(join(API_DIR, CONFIG), config);
  const answers = {
    ...saved,
    CLOUDFLARE_API_TOKEN: TOKEN,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    APP_NAME: name,
    APP_DOMAIN: domain,
    WRANGLER_CONFIG: CONFIG,
    PROD_URL: url,
    TELEMETRY: telemetry ? "" : "off",
  };
  saveEnvFile(answers);
  ok(`apps/api/${CONFIG} · .deploy.env`);

  // ---- 5) Build, migrate, sample content, deploy ----
  step("Build + migrate + dữ liệu mẫu + deploy");
  const deployArgs = [join(ROOT, "scripts/deploy-prod.sh"), "--skip-typecheck", "--skip-smoke"];
  const deployEnv = { ...process.env, WRANGLER_CONFIG: CONFIG, PROD_URL: url };
  let deploy = await runTee(bashPath(), deployArgs, { cwd: ROOT, env: deployEnv });
  if (deploy.code !== 0 && !noAnalytics && /10089|enable Analytics Engine/i.test(deploy.out)) {
    warn("Tài khoản chưa bật Analytics Engine — bỏ phần ghi nhật ký chống lạm dụng (không ảnh hưởng tính năng) và deploy lại.");
    noAnalytics = true;
    config = buildConfig(base, { name, dbId, url, domain, noAnalytics, version, telemetry });
    writeFileSync(join(API_DIR, CONFIG), config);
    saveEnvFile({ ...answers, NO_ANALYTICS_ENGINE: "1" });
    // Migrations and sample content already went through on the first attempt.
    deploy = await runTee(bashPath(), [...deployArgs, "--skip-migrate", "--skip-seed"], { cwd: ROOT, env: deployEnv });
  }
  if (deploy.code !== 0) die("Deploy lỗi — xem log ở trên. Sửa xong chạy lại lệnh này (an toàn khi chạy lại).");

  // ---- 6) Secrets (only the missing ones) ----
  step("Secrets");
  const listed = wrangler(["secret", "list", "--format", "json"], { capture: true });
  let existing = [];
  try {
    existing = JSON.parse(listed.out).map((x) => x.name);
  } catch {
    warn("Không đọc được danh sách secret — chỉ đặt những secret chắc chắn thiếu.");
  }
  const wanted = {
    JWT_SECRET: randomBytes(32).toString("base64"),
    CRON_SECRET: randomBytes(24).toString("hex"),
  };
  const missing = Object.fromEntries(Object.entries(wanted).filter(([k]) => !existing.includes(k)));
  if (Object.keys(missing).length) {
    const tmp = join(ROOT, ".deploy.secrets.json");
    writeFileSync(tmp, JSON.stringify(missing));
    chmodSync(tmp, 0o600);
    const put = wrangler(["secret", "bulk", tmp]);
    rmSync(tmp, { force: true });
    if (put.code !== 0) die("Không đặt được secret.");
    ok(`Đã tạo: ${Object.keys(missing).join(", ")}`);
  } else ok("JWT_SECRET, CRON_SECRET đã có (giữ nguyên)");

  // ---- 7) Teacher account ----
  step("Tài khoản giáo viên");
  const q = wrangler(["d1", "execute", dbName, "--remote", "--json", "--command", "SELECT count(*) AS n FROM teachers"], { capture: true });
  let teachers = -1;
  try {
    teachers = JSON.parse(q.out)[0].results[0].n;
  } catch {
    warn("Không đếm được tài khoản giáo viên.");
  }
  let created = null;
  if (teachers === 0) {
    // Never leave an install nobody can sign in to: there is always an admin account.
    const password = adminPassword;
    execFileSync(process.execPath, ["seed/create-teacher.mjs", adminEmail, password, "Admin", "--remote"], {
      cwd: API_DIR,
      env: { ...process.env, WRANGLER_CONFIG: CONFIG },
      stdio: ["ignore", "ignore", "inherit"],
    });
    created = { email: adminEmail, password };
    // Kept with the other answers so a lost terminal window does not mean a password reset.
    saveEnvFile({ ...loadEnvFile(), ADMIN_EMAIL: adminEmail, ADMIN_INITIAL_PASSWORD: password });
    ok(`Đã tạo ${adminEmail}`);
  } else if (teachers > 0) ok(`${teachers} tài khoản giáo viên (giữ nguyên)`);

  // ---- 8) Smoke test ----
  step(`Kiểm tra ${url}`);
  let up = false;
  for (let i = 0; i < 10 && !up; i++) {
    const r = await fetch(`${url}/api/v1/auth/me`).catch(() => null);
    up = r?.status === 401;
    if (!up) await new Promise((res) => setTimeout(res, 3000));
  }
  up ? ok("App đang chạy") : warn("Chưa gọi được app — domain mới có thể cần vài phút để có chứng chỉ HTTPS.");
  if (telemetry && up && (await pingHub(url, UPDATE ? "update" : "install", version))) {
    ok(`Đã báo địa chỉ app về ${INSTALL_HUB} để đếm số bản cài (tắt: pnpm cf:setup --update --no-telemetry)`);
  }

  // ---- 9) Demo learner (first install only) ----
  // A learner with two weeks of history, so the learner side can be tried without studying first.
  let demo = false;
  if (created && up && !process.argv.includes("--no-demo")) {
    step("Học viên demo");
    demo = spawnSync(process.execPath, [join(ROOT, "scripts/cloudflare-demo.mjs")], { cwd: ROOT, stdio: "inherit" }).status === 0;
    if (!demo) warn("Chưa tạo được học viên demo — chạy lại sau: pnpm cf:demo");
  }

  console.log(`\n${green(bold("✓ Xong"))} → ${bold(url)}`);
  console.log(`  Giáo viên: ${url}/teacher/login${created ? ` · ${created.email} / ${created.password}` : ""}`);
  console.log(`  Học viên:  ${url}/u/login${demo ? " · learner@msyen.com / msyen123 (học viên demo, đã có 2 tuần học)" : ""}`);
  console.log("  Key AI / Azure / Deepgram: thêm ở /teacher/ai → tab Key sau khi đăng nhập.");
  console.log("  Cập nhật bản mới: pnpm cf:update · Backup: pnpm cf:backup · Đăng nhập Google: pnpm cf:google");
  console.log(`  Hướng dẫn đầy đủ: ${url}/setup`);
  if (created) {
    console.log(yellow("  Đăng nhập rồi đổi email/mật khẩu ở Cài đặt → Tài khoản. Mật khẩu ban đầu cũng lưu ở .deploy.env."));
  }
  console.log("  Quên mật khẩu: pnpm cf:reset-password");
}

main()
  .catch((e) => die(e?.message || String(e)))
  .finally(() => rl?.close());
