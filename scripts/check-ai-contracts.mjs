// ============================================================
//  Guard: the line in every AI task prompt that spells out the JSON keys to return must list
//  EXACTLY the keys of its zod output schema. Nothing else enforces this — the prompt is a string
//  and the schema is a type, so a mismatch compiles, deploys, and only surfaces as a runtime
//  validation error once a learner submits. It cost a whole speaking feature: the judge prompt
//  was cloned from the writing grader
//  and kept asking for `task_band`/`coherence_band`, so `fluency_band` came back undefined and
//  z.coerce.number() turned it into NaN. Every submission failed for two days.
//
//  Run: node scripts/check-ai-contracts.mjs   (wired into scripts/deploy-prod.sh)
// ============================================================
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TASKS = "apps/api/src/lib/ai/tasks.ts";
const SCHEMAS = "packages/shared/src/schemas.ts";

const tasks = readFileSync(TASKS, "utf8");
// Prompt builders live in tasks.ts or in modules under lib/ai (e.g. lib/ai/writing/judge.ts).
const AI_DIR = "apps/api/src/lib/ai";
const sources = readdirSync(AI_DIR, { recursive: true })
  .filter((f) => String(f).endsWith(".ts"))
  .map((f) => readFileSync(join(AI_DIR, String(f)), "utf8"));
const schemas = readFileSync(SCHEMAS, "utf8");

const schemaKeys = {};
for (const m of schemas.matchAll(/export const (\w*OutputSchema) = z\.object\(\{([\s\S]*?)\n\}\);/g)) {
  schemaKeys[m[1]] = [...m[2].matchAll(/^ {2}(\w+):/gm)].map((k) => k[1]);
}

const taskDefs = {};
for (const m of tasks.matchAll(/const (\w+): AiTask = \{([\s\S]*?)\n\};/g)) {
  taskDefs[m[1]] = {
    output: m[2].match(/output:\s*(\w+)/)?.[1],
    builder: m[2].match(/build:\s*\(v[^)]*\)\s*=>\s*(\w+)\(/)?.[1],
    // Most tasks write the prompt inline in `build: (v) => [...]` — check that text too.
    inline: m[2].slice(m[2].search(/\bbuild:/)),
  };
}

// Anchored on the real declaration: "AI_TASKS" also appears in a comment far above.
const registry = tasks.match(/export const AI_TASKS = \{([\s\S]*?)\n\} satisfies/)?.[1] ?? "";
const nameToConst = {};
for (const m of registry.matchAll(/^ {2}(\w+):\s*(\w+),/gm)) nameToConst[m[1]] = m[2];
for (const m of registry.matchAll(/^ {2}(\w+),$/gm)) nameToConst[m[1]] = m[1];

/**
 * Keys named at the OUTERMOST level of the first {...} in `text`.
 *
 * A flat regex over every quoted word also picked up keys nested inside arrays — a contract like
 * {"emotions": [{"index": n, "emotion": s}]} reported index/emotion as extra top-level keys and
 * failed a perfectly correct task. Only depth 1 describes the object the schema validates.
 */
function topLevelKeys(text) {
  const start = text.indexOf("{");
  if (start < 0) return [];
  const keys = [];
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) break;
    } else if (ch === '"' && depth === 1) {
      const end = text.indexOf('"', i + 1);
      if (end < 0) break;
      const word = text.slice(i + 1, end);
      // Only a quoted word acting as a key (followed by ':' or listed bare in a key roll-call).
      if (/^\w+$/.test(word)) keys.push(word);
      i = end;
    }
  }
  return keys;
}

const builderBody = (fn) => {
  for (const src of sources) {
    for (const head of [`const ${fn} = (`, `function ${fn}(`]) {
      const i = src.indexOf(head);
      if (i < 0) continue;
      const j = src.indexOf("\n}", i);
      return src.slice(i, j < 0 ? src.length : j);
    }
  }
  return "";
};

let failures = 0;
let checked = 0;
for (const [name, constName] of Object.entries(nameToConst)) {
  const def = taskDefs[constName];
  const want = schemaKeys[def?.output ?? ""];
  if (!want?.length) continue;

  const body = def.builder ? builderBody(def.builder) : def.inline;
  const at = body.search(/Trả JSON|Return JSON/);
  if (at < 0) continue; // free-form task (single string field) — nothing to contract-check
  // The contract line is often split across a string concatenation; join it back first.
  const tail = body.slice(at, at + 600).replace(/'\s*\+\s*\n\s*'/g, "");
  const declared = topLevelKeys(tail);
  if (!declared.length) continue;

  checked++;
  const missing = want.filter((k) => !declared.includes(k));
  const extra = declared.filter((k) => !want.includes(k));
  if (missing.length || extra.length) {
    failures++;
    console.error(`\n✘ ${name}  (schema: ${def.output})`);
    if (missing.length) console.error(`    prompt THIẾU key : ${missing.join(", ")}`);
    if (extra.length) console.error(`    prompt THỪA key  : ${extra.join(", ")}`);
  }
}

if (failures) {
  console.error(`\n${failures} tác vụ AI có prompt lệch schema — sửa dòng "Trả JSON" trong ${TASKS}.`);
  process.exit(1);
}
console.log(`✓ Hợp đồng JSON khớp schema (${checked} tác vụ AI có khai báo).`);
