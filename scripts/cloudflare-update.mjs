// Update an install made with `pnpm cf:setup` to the latest version, in one command:
//   pnpm cf:update
// D1 backup (to ./backups and R2) → fetch the published version → replay the install's own code edits on
// top of it → pnpm install → cloudflare-setup --update, which regenerates the deploy config from the new
// wrangler.toml, creates any resource the new version needs, applies pending migrations and
// sample-content packs, and deploys. Secrets and data are left as they are.
//   --reset   drop the install's own code edits and take the published version as is
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESET = process.argv.includes("--reset");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const tryGit = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
const run = (cmd, args) => {
  // pnpm is a .cmd shim on Windows, which only runs through a shell.
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" && cmd === "pnpm" });
  if (r.status !== 0) {
    console.error(`✘ ${cmd} ${args.join(" ")} lỗi.`);
    process.exit(1);
  }
};

if (!existsSync(join(ROOT, ".deploy.env"))) {
  console.error("✘ Chưa có .deploy.env — đây là lần cài đầu, hãy chạy: pnpm cf:setup");
  process.exit(1);
}

// Uncommitted edits to tracked files are saved as a commit, so they are replayed like any other own edit.
const dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty && !RESET) {
  console.log("▸ Lưu các file đã sửa trong thư mục cài đặt:\n" + dirty);
  run("git", ["add", "-u"]);
  run("git", ["-c", "user.name=MSY Homework", "-c", "user.email=update@localhost", "commit", "-q", "-m", "Tuỳ chỉnh riêng (cf:update tự lưu)"]);
}

// A copy of the data before anything changes; a failed backup does not block the update (D1 also
// keeps its own Time Travel history).
console.log("▸ Backup D1 trước khi cập nhật");
if (spawnSync(process.execPath, [join(ROOT, "scripts/cloudflare-backup.mjs")], { cwd: ROOT, stdio: "inherit" }).status !== 0) {
  console.log("⚠ Backup không chạy được — vẫn cập nhật tiếp (D1 Time Travel vẫn khôi phục được).");
}

const before = git("rev-parse", "--short", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
// The published commit this install was last updated to; commits after it are the install's own edits.
const BASE_FILE = resolve(ROOT, git("rev-parse", "--git-path", "msy-update-base"));
const base = (existsSync(BASE_FILE) && readFileSync(BASE_FILE, "utf8").trim()) || tryGit("rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`).stdout.trim();
const own = base && !RESET ? Number(tryGit("rev-list", "--count", `${base}..HEAD`).stdout.trim() || 0) : 0;

console.log("▸ Tải bản mới");
run("git", ["fetch", "--depth", "1", "origin", branch]);
const latest = git("rev-parse", "FETCH_HEAD");
if (own) {
  // Replay own edits on the new version rather than merging: the published history may be rewritten.
  console.log(`▸ Giữ ${own} chỉnh sửa riêng, đặt lên bản mới`);
  if (tryGit("rebase", "--onto", latest, base).status !== 0) {
    const files = tryGit("diff", "--name-only", "--diff-filter=U").stdout.trim();
    tryGit("rebase", "--abort");
    console.error("✘ Chỉnh sửa riêng đụng vào đúng chỗ bản mới cũng sửa — chưa cập nhật gì, app vẫn chạy bản cũ.");
    if (files) console.error("  File xung đột:\n  " + files.split("\n").join("\n  "));
    console.error("  Cách xử lý: sửa lại các file trên theo bản mới, hoặc bỏ chỉnh sửa riêng và lấy bản mới:");
    console.error("    pnpm cf:update --reset");
    process.exit(1);
  }
} else {
  // fetch + reset rather than pull: a reset keeps working even when the published history was rewritten.
  run("git", ["reset", "--hard", latest]);
}
writeFileSync(BASE_FILE, latest + "\n");
const after = git("rev-parse", "--short", "HEAD");
console.log(before === after ? "✓ Đã là bản mới nhất — vẫn deploy lại cho chắc." : `✓ ${before} → ${after}`);

console.log("\n▸ Cài gói");
run("pnpm", ["install", "--frozen-lockfile"]);

run("node", [join(ROOT, "scripts/cloudflare-setup.mjs"), "--update"]);
