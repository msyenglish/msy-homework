// Creates a demo learner with about two weeks of realistic activity, for testing.
//   node seed/demo-learner.mjs            (the app must be running: pnpm oss)
//   node seed/demo-learner.mjs --reset    deletes the demo learner first, then recreates it
//   node seed/demo-learner.mjs --remote   a deployed install (APP_URL + WRANGLER_CONFIG; see pnpm cf:demo)
//
// Everything goes through the real API (class enrolment, assignments, grading, vocab memory,
// grammar drill), so scores, points and memory state are exactly what the app would produce.
// Afterwards the timestamps are spread over the last 14 days so streaks, charts and reports
// have history.
//
// Env: APP_URL (http://localhost:5185) · WRANGLER_CONFIG (wrangler.toml)
//      OSS_TEACHER_EMAIL / OSS_TEACHER_PASSWORD (teacher@example.com / teacher123)
//      DEMO_LEARNER_EMAIL / DEMO_LEARNER_PASSWORD (learner@example.com / learner123;
//      learner@msyen.com / msyen123 with --remote)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API_DIR = fileURLToPath(new URL("../", import.meta.url));
const REMOTE = process.argv.includes("--remote");
const CONFIG = process.env.WRANGLER_CONFIG || "wrangler.toml";
const BASE = (process.env.APP_URL || "http://localhost:5185").replace(/\/$/, "");
const TEACHER = { email: process.env.OSS_TEACHER_EMAIL || "teacher@example.com", password: process.env.OSS_TEACHER_PASSWORD || "teacher123" };
const LEARNER = {
  email: (process.env.DEMO_LEARNER_EMAIL || (REMOTE ? "learner@msyen.com" : "learner@example.com")).toLowerCase(),
  password: process.env.DEMO_LEARNER_PASSWORD || (REMOTE ? "msyen123" : "learner123"),
  name: "Emma Tran",
};
// English on purpose: these names appear in the README and guide screenshots.
const CLASS_NAME = "Demo Class";
const DAYS = 14;

const dbName = readFileSync(API_DIR + CONFIG, "utf8").match(/^database_name\s*=\s*"([^"]+)"/m)?.[1];
if (!dbName) throw new Error(`No database_name in apps/api/${CONFIG}`);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Deterministic PRNG so every run produces the same history. */
let seed = 20261027;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

function sql(command) {
  // wrangler's own entry run by this Node: no pnpm shim, so it works the same on Windows.
  const wrangler = API_DIR + "node_modules/wrangler/bin/wrangler.js";
  const args = ["d1", "execute", dbName, REMOTE ? "--remote" : "--local", "--json", "--config", CONFIG, "--command", command];
  const out = execFileSync(process.execPath, [wrangler, ...args], {
    cwd: API_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out.slice(out.indexOf("[")));
}
const rows = (command) => sql(command).at(-1).results;

/** Minimal cookie-jar client for one account. */
function client() {
  const jar = new Map();
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.error ?? data?.message ?? text}`);
    return data;
  };
}

/** An answer string for one question, right or deliberately wrong (format = what the UI sends). */
function answerFor(qn, right) {
  switch (qn.type) {
    case "multiple_choice":
      return right ? qn.answer : pick((qn.options ?? []).filter((o) => o !== qn.answer)) ?? "";
    case "fill_blank":
      return right ? qn.accept?.[0] ?? "" : "idk";
    case "ordering":
    case "translate":
      return right ? qn.answer : String(qn.answer ?? "").split(" ").reverse().join(" ");
    case "matching": {
      const pairs = qn.pairs ?? [];
      const rights = pairs.map((p) => p.right);
      return JSON.stringify(Object.fromEntries(pairs.map((p, i) => [p.left, right ? p.right : rights[(i + 1) % rights.length]])));
    }
    case "categorize": {
      const items = qn.items ?? [];
      return JSON.stringify(Object.fromEntries(items.map((it) => [it.text, right ? it.category : qn.categories?.[0] ?? it.category])));
    }
    default:
      return "";
  }
}

// ── 0. reset / existing account ──────────────────────────────────────────────

const existing = rows(`SELECT id FROM users WHERE email = ${q(LEARNER.email)}`)[0];
if (existing && !process.argv.includes("--reset")) {
  console.log(`Demo learner ${LEARNER.email} already exists — run with --reset to recreate it.`);
  process.exit(0);
}
if (existing) {
  const uid = q(existing.id);
  sql(
    [
      `DELETE FROM submissions WHERE user_id = ${uid}`,
      `DELETE FROM vocab_submissions WHERE user_id = ${uid}`,
      `DELETE FROM grammar_submissions WHERE user_id = ${uid}`,
      `DELETE FROM reports WHERE user_id = ${uid}`,
      `DELETE FROM users WHERE id = ${uid}`,
    ].join("; "),
  );
  console.log(`✓ Removed the previous demo learner`);
}

// ── 1. teacher side: class, enrolment, assignments ───────────────────────────

const teacher = client();
await teacher("POST", "/api/v1/auth/login", TEACHER).catch((e) => {
  console.error(`Teacher login failed (${TEACHER.email}) — is the app running at ${BASE}? ${e.message}`);
  process.exit(1);
});

const levels = (await teacher("GET", "/api/v1/teacher/levels")).items ?? [];
const level = levels.find((l) => l.name === "Pre A1 Starters") ?? levels[0];
if (!level) throw new Error("No levels — run pnpm db:seed first");

const classes = (await teacher("GET", "/api/v1/teacher/classes")).items ?? [];
const cls = classes.find((c) => c.name === CLASS_NAME) ?? (await teacher("POST", "/api/v1/teacher/classes", { name: CLASS_NAME, note: "Demo class" })).class;
await teacher("POST", `/api/v1/teacher/classes/${cls.id}/members`, { ...LEARNER, level_id: level.id });

// Quiz exercises of the first level, in path order (read-aloud, video and vocab decks need a mic / AI).
const exercises = rows(
  `SELECT e.exercise_id AS slug, e.title FROM exercises e
   WHERE e.published = 1 AND e.deleted_at IS NULL AND e.level = ${q(level.name)}
     AND coalesce(e.read_aloud, 0) = 0 AND coalesce(e.video, 0) = 0 AND coalesce(e.template_id, '') <> 'vocab_deck'
     AND (SELECT count(*) FROM questions qq WHERE qq.exercise_id = e.id) >= 3
   ORDER BY e.path_order, e.created_at LIMIT 14`,
);
await teacher("PUT", `/api/v1/teacher/classes/${cls.id}/assignments`, { slugs: exercises.map((e) => e.slug) });
console.log(`✓ ${LEARNER.name} <${LEARNER.email}> in "${CLASS_NAME}" · ${exercises.length} exercises assigned`);

// ── 2. learner side ──────────────────────────────────────────────────────────

const learner = client();
await learner("POST", "/api/v1/account/login", { email: LEARNER.email, password: LEARNER.password });
await learner("PATCH", "/api/v1/account/me", { birth_year: 2014, gender: "female", level_id: level.id });

/** Activity log used to spread timestamps afterwards: [table, id, dayOffset]. */
const log = [];
// Study days: most of the last two weeks, with a couple of gaps so the streak is believable.
const studyDays = [13, 12, 11, 9, 8, 7, 6, 4, 3, 2, 1, 0];
let dayCursor = 0;
const nextDay = () => studyDays[Math.min(dayCursor++, studyDays.length - 1)];

// Exercises: the last two stay undone so the learner has work waiting.
let done = 0;
for (const ex of exercises.slice(0, -2)) {
  const full = await teacher("GET", `/api/v1/teacher/exercises/${ex.slug}`);
  const accuracy = 0.55 + rand() * 0.45;
  const day = nextDay();
  const attempt = async (acc) => {
    const answers = Object.fromEntries(full.questions.map((qn) => [qn.position, answerFor(qn, rand() < acc)]));
    const r = await learner("POST", `/api/v1/library/${ex.slug}/grade`, { answers });
    log.push(["submissions", r.submission_id, day]);
    return r;
  };
  const first = await attempt(accuracy);
  // A weak first try gets a second, better one the same day.
  if (first.score / Math.max(first.total, 1) < 0.7) await attempt(0.9);
  done++;
}
console.log(`✓ ${done} exercises done (${log.length} attempts)`);

// Vocabulary: four sessions over the first common-words set.
const deck = await learner("GET", "/api/v1/account/vocab/sets/common-words-1-500").catch(() => null);
let vocabSessions = 0;
if (deck?.words?.length) {
  for (let s = 0; s < 4; s++) {
    const words = deck.words.slice(s * 15, s * 15 + 15);
    const perWord = words.map((w) => {
      const correct = rand() < 0.8 ? 3 : 2;
      return { word: w.word, wordId: w.id, seen: ["flashcard", "matching", "listen_choice"], correct, total: 3, mastered: correct === 3 };
    });
    const score = Math.round((100 * perWord.reduce((n, w) => n + w.correct, 0)) / (perWord.length * 3));
    const r = await learner("POST", "/api/v1/account/vocab/submit", {
      score,
      total: perWord.length,
      result: { score, total: perWord.length, perWord, weakWords: perWord.filter((w) => !w.mastered).map((w) => w.word) },
    });
    log.push(["vocab_submissions", r.id, studyDays[s * 3]]);
    vocabSessions++;
  }
}
console.log(`✓ ${vocabSessions} vocabulary sessions (${vocabSessions * 15} words)`);

// Grammar drill: two sessions on the first grammar points of the path.
let grammarSessions = 0;
for (const ids of [["verb-to-be"], ["present-simple"]]) {
  const s = await learner("POST", "/api/v1/account/grammar/session", { grammarIds: ids, count: 10 }).catch(() => null);
  if (!s?.items?.length) continue;
  const payloads = new Map(
    rows(`SELECT id, payload FROM grammar_items WHERE id IN (${s.items.map((i) => q(i.id)).join(",")})`).map((r) => [r.id, JSON.parse(r.payload)]),
  );
  const answers = s.items.map((it) => ({ item_id: it.id, answer: answerFor(payloads.get(it.id) ?? it, rand() < 0.8) }));
  await learner("POST", "/api/v1/account/grammar/submit", { session_id: s.session_id, answers });
  grammarSessions++;
}
console.log(`✓ ${grammarSessions} grammar drill sessions`);

// ── 3. spread the history over the last two weeks ────────────────────────────

const at = (dayOffset, minute) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dayOffset);
  d.setUTCHours(12, 0, 0, 0); // 19:00 Vietnam time — after school
  d.setUTCMinutes(minute);
  return d.toISOString();
};
const uid = rows(`SELECT id FROM users WHERE email = ${q(LEARNER.email)}`)[0].id;
const updates = log.map(([table, id, day], i) => `UPDATE ${table} SET submitted_at = ${q(at(day, 5 + (i % 6) * 7))} WHERE id = ${q(id)}`);
const grammarIds = rows(`SELECT id FROM grammar_submissions WHERE user_id = ${q(uid)} ORDER BY submitted_at`).map((r) => r.id);
grammarIds.forEach((id, i) => updates.push(`UPDATE grammar_submissions SET submitted_at = ${q(at(studyDays[2 + i * 4], 50))} WHERE id = ${q(id)}`));
const start = at(DAYS + 2, 0);
updates.push(
  `UPDATE users SET created_at = ${q(start)}, last_seen_at = ${q(new Date().toISOString())} WHERE id = ${q(uid)}`,
  `UPDATE class_members SET joined_at = ${q(start)} WHERE user_id = ${q(uid)}`,
  `UPDATE class_assignments SET assigned_at = ${q(start)} WHERE class_id = ${q(cls.id)}`,
  `UPDATE assignment_unlocks SET unlocked_at = ${q(start)} WHERE user_id = ${q(uid)}`,
);
// Study time per active day (VN calendar date), split across the areas the learner used.
for (const day of studyDays) {
  const date = at(day, 0).slice(0, 10);
  const areas = { library: 600 + Math.floor(rand() * 900), vocab: day % 3 === 0 ? 300 + Math.floor(rand() * 400) : 0, grammar: day % 4 === 2 ? 240 : 0 };
  for (const [area, seconds] of Object.entries(areas)) {
    if (seconds) updates.push(`INSERT OR REPLACE INTO user_study_time (user_id, date, area, seconds, updated_at) VALUES (${q(uid)}, ${q(date)}, ${q(area)}, ${seconds}, ${q(at(day, 59))})`);
  }
}
for (let i = 0; i < updates.length; i += 40) sql(updates.slice(i, i + 40).join("; "));
console.log(`✓ History spread over ${studyDays.length} study days`);

// ── 4. a saved monthly report ────────────────────────────────────────────────
// A fixed English sample rather than an AI run, so screenshots do not depend on a model or a key.
const month = new Date().toISOString().slice(0, 7);
await teacher("POST", "/api/v1/teacher/reports", {
  user_id: uid,
  month,
  content: [
    "Overall:",
    `${LEARNER.name} studied on ${studyDays.length} of the last ${DAYS} days and finished 12 of 14 assigned exercises, ` +
      "with an average score of 83%. Her effort has been steady and she rarely skips a day.",
    "",
    "Strengths:",
    "- Reading: she follows short texts well and scored 100% on \"Anna and Her Friends\".",
    "- Grammar: contractions and the verb \"to be\" are now accurate in most answers.",
    "",
    "To improve:",
    "- Listening for details: numbers and names in dialogues are often missed.",
    "- Articles a/an: she sometimes drops the article before a singular noun.",
    "",
    "Next month:",
    "1. Replay each listening exercise once more before answering.",
    "2. Review the \"Articles a/an\" grammar point and do one drill a week.",
    "3. Keep the daily streak going with short vocabulary sessions.",
    "",
    "Message:",
    "Great work this month, Emma! Keep listening carefully and you will see your scores climb even higher.",
  ].join("\n"),
});
console.log(`✓ Monthly report saved (${month})`);

console.log(`\nDemo learner ready → ${BASE}/u/login  ${LEARNER.email} / ${LEARNER.password}`);
