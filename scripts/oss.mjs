// Runs the full local stack on fixed ports: web :5185 (proxy /api → api :8795).
// Ports fail fast when taken (strictPort) instead of silently shifting to another one.
// Override with WEB_PORT / API_PORT / INSPECTOR_PORT.
// Before starting, prepares the local D1 (migrations, sample content and a default teacher on an
// empty database — see db-bootstrap.mjs); `--skip-db` skips that step.
// WRANGLER_CONFIG=<file in apps/api> runs against another config; the bootstrap uses the same one.
import { execFileSync, spawn } from "node:child_process";

const WEB_PORT = process.env.WEB_PORT || "5185";
const API_PORT = process.env.API_PORT || "8795";
const INSPECTOR_PORT = process.env.INSPECTOR_PORT || "9295";
const CONFIG = process.env.WRANGLER_CONFIG || "wrangler.toml";

if (!process.argv.includes("--skip-db")) {
  execFileSync("node", [new URL("./db-bootstrap.mjs", import.meta.url).pathname, "--local"], { stdio: "inherit" });
}

const procs = [];
function run(name, args, env = {}) {
  // detached → own process group, so shutdown also stops the vite/wrangler grandchildren.
  const p = spawn("pnpm", args, { stdio: ["ignore", "pipe", "pipe"], detached: true, env: { ...process.env, ...env } });
  const tag = (line) => (line ? `[${name}] ${line}\n` : "");
  for (const s of [p.stdout, p.stderr]) {
    s.on("data", (d) => process.stdout.write(d.toString().split("\n").map(tag).join("")));
  }
  p.on("exit", (code) => {
    console.log(`[${name}] exited (${code})`);
    shutdown(code ?? 1);
  });
  procs.push(p);
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

run("api", ["--filter", "@msyen/api", "exec", "wrangler", "dev", "--config", CONFIG, "--port", API_PORT, "--inspector-port", INSPECTOR_PORT,
  "--var", `ALLOWED_ORIGINS:http://localhost:${WEB_PORT}`,
  "--var", `PUBLIC_BASE_URL:http://localhost:${WEB_PORT}`,
]);
run("web", ["--filter", "@msyen/web", "exec", "vite", "--port", WEB_PORT, "--strictPort", "--host"], {
  API_TARGET: `http://localhost:${API_PORT}`,
});

console.log(`\n  OSS local → http://localhost:${WEB_PORT}  (api :${API_PORT})\n`);
