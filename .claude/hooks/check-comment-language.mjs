#!/usr/bin/env node
/**
 * PostToolUse guard: rejects Vietnamese text inside code comments / JSDoc.
 *
 * Only the text an agent just inserted is inspected (Write `content`, Edit `new_string`),
 * so pre-existing Vietnamese comments in legacy files never trigger a false alarm.
 * User-facing strings stay untouched — only comment segments are scanned.
 *
 * Exit 2 → stderr is fed back to the model so it rewrites the comment in English.
 */

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|css|scss|sql|sh|py)$/i;
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

/** Collects every comment segment of a snippet, one entry per source line. */
function commentSegments(text, hashComments) {
  const out = [];
  let inBlock = false;
  let inTemplate = false;

  text.split("\n").forEach((line, i) => {
    const lineNo = i + 1;

    if (inBlock) {
      const end = line.indexOf("*/");
      out.push({ lineNo, text: end === -1 ? line : line.slice(0, end) });
      if (end === -1) return;
      // Leaving the block: without this every later line reads as comment, so any Vietnamese
      // user-facing string below a multi-line JSDoc gets reported as a violation.
      inBlock = false;
      scanCode(line.slice(end + 2), lineNo);
      return;
    }
    if (inTemplate) {
      // Inside a multi-line template literal: everything is data, not comment.
      const ticks = (line.match(/`/g) || []).length;
      if (ticks % 2 === 1) inTemplate = false;
      return;
    }
    scanCode(line, lineNo);
  });

  /** Walks code, skipping string literals, and captures `//` and `/* ... *\/` segments. */
  function scanCode(code, lineNo) {
    let quote = null;
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        continue;
      }
      if (c === "/" && code[i + 1] === "/") {
        out.push({ lineNo, text: code.slice(i + 2) });
        return;
      }
      if (c === "#" && hashComments) {
        out.push({ lineNo, text: code.slice(i + 1) });
        return;
      }
      if (c === "/" && code[i + 1] === "*") {
        const end = code.indexOf("*/", i + 2);
        if (end === -1) {
          out.push({ lineNo, text: code.slice(i + 2) });
          inBlock = true;
          return;
        }
        out.push({ lineNo, text: code.slice(i + 2, end) });
        i = end + 1;
      }
    }
    if (quote === "`") inTemplate = true;
  }

  return out;
}

const input = await readInput();
const ti = input.tool_input || {};
const file = ti.file_path || "";
if (!file || !CODE_EXT.test(file)) process.exit(0);
const hashComments = /\.(sh|py)$/i.test(file);

const snippets = [
  ti.content,
  ti.new_string,
  ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e && e.new_string) : []),
].filter((s) => typeof s === "string" && s.length > 0);

const offenders = [];
for (const snippet of snippets) {
  for (const seg of commentSegments(snippet, hashComments)) {
    if (VI.test(seg.text)) offenders.push(seg.text.trim());
  }
}

if (offenders.length > 0) {
  const list = [...new Set(offenders)].slice(0, 8).map((t) => `  - ${t}`).join("\n");
  console.error(
    `RULE #0 VIOLATION in ${file} — comments/JSDoc must be written in English (see CLAUDE.md).\n` +
      `Vietnamese found in these comment(s):\n${list}\n` +
      `Rewrite them in English now. Vietnamese is allowed ONLY in user-facing strings ` +
      `(UI text, HTTPException messages) — never in comments.`,
  );
  process.exit(2);
}
process.exit(0);
