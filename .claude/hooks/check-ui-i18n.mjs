#!/usr/bin/env node
/**
 * PostToolUse guard: rejects hardcoded Vietnamese UI text in the web app.
 *
 * Only the text an agent just inserted is inspected (Write `content`, Edit `new_string`), so files not
 * yet converted never trigger. String literals and JSX text are found with the TypeScript parser;
 * a literal is allowed when its line or the line above carries `i18n-ignore`, it sits between
 * `i18n-ignore-start` and `i18n-ignore-end`, or the file contains `i18n-ignore-file`.
 *
 * Exit 2 → stderr is fed back to the model so it moves the text into the i18n catalogs.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Reads the hook payload from stdin. */
async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

const input = await readInput();
const ti = input.tool_input || {};
const file = ti.file_path || "";
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
if (!/^apps\/web\/src\/.+\.(ts|tsx)$/.test(rel) || rel.startsWith("apps/web/src/i18n/")) process.exit(0);
if (existsSync(file) && readFileSync(file, "utf8").includes("i18n-ignore-file")) process.exit(0);

let ts;
try {
  ts = createRequire(path.join(root, "apps/web/package.json"))("typescript");
} catch {
  process.exit(0);
}

const snippets = [
  ti.content,
  ti.new_string,
  ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e && e.new_string) : []),
].filter((s) => typeof s === "string" && VI.test(s));

const fileText = existsSync(file) ? readFileSync(file, "utf8") : "";
const kind = rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

/** Returns the ignore state per line: a marker on the line or above, or inside a start/end range. */
function ignoredLines(lines) {
  let inRange = false;
  return lines.map((l, i) => {
    if (/i18n-ignore-start/.test(l)) inRange = true;
    const hit = inRange || /i18n-ignore(?!-(start|end|file))/.test(l) || /i18n-ignore(?!-(start|end|file))/.test(lines[i - 1] || "");
    if (/i18n-ignore-end/.test(l)) inRange = false;
    return hit;
  });
}

/** Collects Vietnamese literals of `text` whose start offset falls inside [from, to). */
function scan(text, from, to) {
  const lines = text.split("\n");
  const ignored = ignoredLines(lines);
  const sf = ts.createSourceFile("snippet" + path.extname(rel), text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const visit = (node) => {
    const literal =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node);
    if (literal && VI.test(node.text)) {
      const pos = node.getStart(sf);
      if (pos >= from && pos < to && !ignored[sf.getLineAndCharacterOfPosition(pos).line]) {
        found.push(node.text.trim().replace(/\s+/g, " ").slice(0, 80));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const offenders = [];
for (const snippet of snippets) {
  // Prefer the written file so markers outside the edited snippet still count.
  const at = fileText.indexOf(snippet);
  offenders.push(...(at >= 0 ? scan(fileText, at, at + snippet.length) : scan(snippet, 0, snippet.length)));
}

if (offenders.length > 0) {
  const list = [...new Set(offenders)].slice(0, 8).map((t) => `  - ${t}`).join("\n");
  console.error(
    `RULE #1 VIOLATION in ${rel} — the web UI is bilingual (vi + en); UI text must not be hardcoded.\n` +
      `Hardcoded Vietnamese found:\n${list}\n` +
      `Move each string to apps/web/src/i18n/vi/<ns>.ts AND en/<ns>.ts and render it with t("ns.key") ` +
      `(see docs/I18N.md). If it is intentionally not UI text (AI prompt, DB data value, Vietnamese ` +
      `sample content), mark it: \`i18n-ignore\` on that line or the line above, an \`i18n-ignore-start\` … \`i18n-ignore-end\` block, or \`i18n-ignore-file\`.`,
  );
  process.exit(2);
}
process.exit(0);
