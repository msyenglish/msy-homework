#!/usr/bin/env node
/**
 * Fails when the web app contains hardcoded Vietnamese UI text (string literals or JSX text outside
 * apps/web/src/i18n). Honors the same `i18n-ignore` markers as .claude/hooks/check-ui-i18n.mjs.
 * Usage: node scripts/check-i18n.mjs [--verbose]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/web/src");
const ts = createRequire(path.join(ROOT, "apps/web/package.json"))("typescript");
const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const verbose = process.argv.includes("--verbose");

const walk = (p) =>
  fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : /\.tsx?$/.test(p) ? [p] : [];

/** Marks lines covered by an `i18n-ignore` marker (same line, line above, or a start/end block). */
function ignoredLines(lines) {
  let inRange = false;
  return lines.map((l, i) => {
    if (/i18n-ignore-start/.test(l)) inRange = true;
    const single = /i18n-ignore(?!-(start|end|file))/;
    const hit = inRange || single.test(l) || single.test(lines[i - 1] || "");
    if (/i18n-ignore-end/.test(l)) inRange = false;
    return hit;
  });
}

let total = 0;
for (const file of walk(SRC).filter((f) => !f.startsWith(path.join(SRC, "i18n") + path.sep))) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("i18n-ignore-file")) continue;
  const ignored = ignoredLines(src.split("\n"));
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const hits = [];
  const visit = (node) => {
    const literal =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node);
    if (literal && VI.test(node.text)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      if (!ignored[line]) hits.push(`${line + 1}: ${node.text.trim().replace(/\s+/g, " ").slice(0, 90)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!hits.length) continue;
  total += hits.length;
  console.log(`${path.relative(ROOT, file)} (${hits.length})`);
  if (verbose) for (const h of hits) console.log(`  ${h}`);
}

if (total) {
  console.error(`\n${total} hardcoded Vietnamese UI string(s). Move them to i18n/vi + i18n/en (docs/I18N.md) or mark with i18n-ignore.`);
  process.exit(1);
}
console.log("i18n: no hardcoded Vietnamese UI text.");
