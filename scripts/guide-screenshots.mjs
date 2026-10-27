// Captures the screenshots used by the teacher guide (docs/guide/images/*.jpg).
//
//   pnpm dev                                  # the app must be running (web + api, local D1)
//   node scripts/guide-screenshots.mjs        # BASE_URL defaults to http://localhost:5173
//   node scripts/guide-screenshots.mjs 30-    # only shots whose name starts with "30-"
//
// Needs Playwright (`pnpm add -Dw playwright && npx playwright install chromium`) and the dev
// quick-login (DEV_QUICK_LOGIN=1 in apps/api/.dev.vars). The interface is switched to English and
// the light theme so every shot looks the same. Each shot is independent: one that fails is
// reported and skipped, the others still run.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const BASE = (process.env.BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const OUT = "docs/guide/images";
const only = process.argv[2] || "";

/** Opens a page and waits for the app to settle. */
async function open(page, path) {
  await page.goto(BASE + path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(900);
  // A half-saved source file shows Vite's error overlay — never save that as a guide image.
  if (await page.locator("vite-error-overlay").count()) throw new Error("Vite error overlay is showing (a source file does not compile)");
  // A learner account can carry its own dark-theme choice; keep every shot light.
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

const click = async (page, locator) => {
  await locator.first().click({ timeout: 6000 });
  await page.waitForTimeout(800);
};

// role: which account the shot needs. full: whole scrollable page instead of the viewport.
// mask: locators painted over before the shot (private values such as API keys).
const SHOTS = [
  { name: "01-home", role: null, run: (p) => open(p, "/home") },
  { name: "02-teacher-login", role: null, run: (p) => open(p, "/teacher/login") },

  { name: "10-learners", role: "teacher", run: (p) => open(p, "/teacher/students") },
  {
    name: "11-classes",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/students");
      await click(p, p.getByRole("button", { name: /^Classes/ }));
    },
  },
  {
    name: "12-learner-detail",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/students");
      // The whole learner card opens their page.
      await click(p, p.locator("div.cursor-pointer").filter({ hasText: "@" }));
      await p.waitForTimeout(800);
    },
  },

  { name: "20-exercises", role: "teacher", run: (p) => open(p, "/teacher/exercises") },
  { name: "21-editor-ai", role: "teacher", run: (p) => open(p, "/teacher/exercises/new?mode=ai") },
  { name: "22-editor-manual", role: "teacher", full: true, run: (p) => open(p, "/teacher/exercises/new?mode=custom") },
  {
    name: "23-exercise-assign",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/exercises");
      await click(p, p.getByRole("button", { name: /Assign|Assigned/ }));
    },
  },

  { name: "30-paths", role: "teacher", run: (p) => open(p, "/teacher/paths") },

  { name: "40-vocab", role: "teacher", run: (p) => open(p, "/teacher/vocab") },
  {
    name: "41-vocab-add",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/vocab");
      await click(p, p.getByRole("button", { name: /Add words|Add word/ }));
    },
  },

  { name: "50-grammar", role: "teacher", run: (p) => open(p, "/teacher/grammar?p=past-simple") },
  {
    name: "51-grammar-drill",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/grammar?p=past-simple");
      await click(p, p.getByRole("button", { name: /^Drill sentences/ }));
    },
  },
  {
    name: "52-grammar-translate",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/grammar?p=past-simple");
      await click(p, p.getByRole("button", { name: /^Translation sentences/ }));
    },
  },

  { name: "60-reports", role: "teacher", run: (p) => open(p, "/teacher/reports") },
  {
    name: "61-reports-batch",
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/reports");
      await click(p, p.getByRole("button", { name: /Batch create/ }));
    },
  },

  { name: "70-ai", role: "teacher", run: (p) => open(p, "/teacher/ai") },
  ...[["71-ai-models", /^Models$/], ["72-ai-keys", /^Keys$/], ["73-ai-voice", /^Voice$/]].map(([name, label]) => ({
    name,
    role: "teacher",
    // Saved keys show their last 4 characters and a label — never publish those.
    mask: (p) => [p.locator("div").filter({ has: p.getByText(/••••/) }).filter({ hasNotText: "Google Gemini" })],
    run: async (p) => {
      await open(p, "/teacher/ai");
      await click(p, p.getByRole("button", { name: label }));
    },
  })),

  ...["brand", "telegram", "account"].map((tab, i) => ({
    name: `8${i}-settings-${tab}`,
    role: "teacher",
    run: async (p) => {
      await open(p, "/teacher/exercises");
      await click(p, p.getByRole("button", { name: /^Settings/ }));
      await click(p, p.getByRole("button", { name: /General settings/ }));
      const label = { brand: /^Branding/, telegram: /^Telegram/, account: /^Account/ }[tab];
      await click(p, p.getByRole("tab", { name: label }));
    },
  })),
  { name: "85-texts", role: "teacher", run: (p) => open(p, "/teacher/texts") },

  { name: "90-learner-library", role: "user", run: (p) => open(p, "/u/library") },
  { name: "91-learner-grammar", role: "user", run: (p) => open(p, "/u/grammar") },
];

async function signedIn(browser, role) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  // English interface, light theme — set before the app boots.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("ui_lang", "en");
      localStorage.setItem("theme", "light");
    } catch {}
  });
  // A learner account stores its own theme; answer "light" so the app does not switch to dark.
  await ctx.route("**/api/v1/account/me", async (route) => {
    const res = await route.fetch();
    const body = await res.json().catch(() => null);
    if (body?.user) body.user.theme = "light";
    await route.fulfill({ response: res, json: body });
  });
  if (role) {
    const p = await ctx.newPage();
    await p.goto(BASE + "/home");
    const ok = await p.evaluate(
      (r) => fetch("/api/v1/dev/quick-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: r }) }).then((x) => x.ok),
      role,
    );
    if (!ok) throw new Error(`quick-login as ${role} failed — set DEV_QUICK_LOGIN=1 in apps/api/.dev.vars`);
    await p.close();
  }
  return ctx;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const contexts = {};
let failed = 0;
for (const shot of SHOTS.filter((s) => s.name.startsWith(only))) {
  const key = shot.role ?? "anon";
  contexts[key] ??= await signedIn(browser, shot.role);
  const page = await contexts[key].newPage();
  try {
    await shot.run(page);
    await page.screenshot({
      path: `${OUT}/${shot.name}.jpg`,
      type: "jpeg",
      quality: 82,
      fullPage: !!shot.full,
      mask: shot.mask ? shot.mask(page) : [],
      maskColor: "#cbd5e1",
    });
    console.log(`ok   ${shot.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${shot.name}: ${String(e.message || e).split("\n")[0]}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(failed ? `${failed} shot(s) failed` : "all shots captured");
process.exitCode = failed ? 1 : 0;
