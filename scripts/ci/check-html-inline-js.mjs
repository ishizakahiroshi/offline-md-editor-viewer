// Syntax gate for the inline JavaScript inside a single-file HTML app.
//
// The app ships as one HTML file with its whole runtime in inline <script> blocks,
// so a syntax error is not caught by any build step: the file simply loads and the
// app does nothing. This script compiles every inline block (without executing it)
// and exits non-zero on the first failure.
//
// Usage: node scripts/ci/check-html-inline-js.mjs <html-path> [<html-path> ...]

import fs from "node:fs";
import vm from "node:vm";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/ci/check-html-inline-js.mjs <html-path> [...]");
  process.exit(2);
}

// Matches <script> blocks that have no src attribute (i.e. blocks with a body).
const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const TYPE_ATTR = /<script[^>]*\btype\s*=\s*["']([^"']+)["']/i;

let failed = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL ${file}: file not found`);
    failed += 1;
    continue;
  }

  const html = fs.readFileSync(file, "utf8");
  const blocks = [...html.matchAll(INLINE_SCRIPT)];
  if (blocks.length === 0) {
    console.error(`FAIL ${file}: no inline <script> block found`);
    failed += 1;
    continue;
  }

  let checked = 0;
  let fileFailed = 0;
  for (const [index, match] of blocks.entries()) {
    const tag = match[0].slice(0, match[0].indexOf(">") + 1);
    const type = TYPE_ATTR.exec(tag)?.[1]?.toLowerCase() ?? "";
    // Skip data blocks (JSON-LD, templates); only real script types are compiled.
    if (type && !["text/javascript", "module", "application/javascript"].includes(type)) {
      continue;
    }

    const source = match[1];
    if (source.trim() === "") continue;

    // Line offset so reported positions map back to the HTML file.
    const lineOffset = html.slice(0, match.index).split("\n").length - 1;
    try {
      new vm.Script(source, { filename: file, lineOffset });
      checked += 1;
    } catch (error) {
      console.error(`FAIL ${file} (inline block #${index + 1}): ${error.message}`);
      fileFailed += 1;
    }
  }

  if (fileFailed > 0) {
    failed += fileFailed;
  } else if (checked === 0) {
    console.error(`FAIL ${file}: no compilable inline script block found`);
    failed += 1;
  } else {
    console.log(`OK ${file}: ${checked} inline script block(s) compiled`);
  }
}

if (failed > 0) {
  console.error(`${failed} inline script check(s) failed.`);
  process.exit(1);
}
