// Verify Content-Security-Policy uses sha256 hashes (no 'unsafe-inline') and
// that those hashes match the current inline <script>/<style> bodies and the
// static style="..." attribute values in the source HTML. Also checks that
// apps/desktop/src-tauri/tauri.conf.json carries the same script/style hashes.
//
// Usage: node scripts/ci/check-csp-hashes.mjs

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const htmlPath = path.join(repoRoot, "apps/browser/offline-md-editor-viewer.html");
const tauriConfPath = path.join(repoRoot, "apps/desktop/src-tauri/tauri.conf.json");

const html = fs.readFileSync(htmlPath, "utf8");
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));

function sha256Base64(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("base64");
}

function extractBodies(htmlText, pattern) {
  const bodies = [];
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(htmlText)) !== null) {
    bodies.push(match[1]);
  }
  return bodies;
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const INLINE_STYLE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

const scriptBodies = extractBodies(html, INLINE_SCRIPT);
const styleBodies = extractBodies(html, INLINE_STYLE);
assert.ok(scriptBodies.length >= 1, "expected at least one inline script");
assert.ok(styleBodies.length >= 1, "expected at least one inline style");

const scriptHashes = scriptBodies.map((body) => `'sha256-${sha256Base64(body)}'`);
const styleHashes = styleBodies.map((body) => `'sha256-${sha256Base64(body)}'`);

// Static style attributes in markup (ignore matches that only appear inside the
// large inline script by stripping script/style contents first).
const markupOnly = html
  .replace(INLINE_SCRIPT, "<script></script>")
  .replace(INLINE_STYLE, "<style></style>");
const attrValues = new Set();
for (const match of markupOnly.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) {
  attrValues.add(match[1]);
}
const attrHashes = [...attrValues].map((value) => `'sha256-${sha256Base64(value)}'`);

const metaMatch = html.match(
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i
);
assert.ok(metaMatch, "missing Content-Security-Policy meta tag");
const metaCsp = metaMatch[1];

assert.doesNotMatch(metaCsp, /unsafe-inline/, "HTML meta CSP must not contain unsafe-inline");
assert.match(metaCsp, /script-src-attr\s+'none'/, "script-src-attr 'none' required");

for (const hash of scriptHashes) {
  assert.match(metaCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `meta CSP missing script hash ${hash}`);
}
for (const hash of styleHashes) {
  assert.match(metaCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `meta CSP missing style hash ${hash}`);
}
if (attrHashes.length > 0) {
  assert.match(metaCsp, /'unsafe-hashes'/, "style attributes require 'unsafe-hashes'");
  for (const hash of attrHashes) {
    assert.match(metaCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `meta CSP missing style-attr hash ${hash}`);
  }
}

const tauriCsp = tauriConf?.app?.security?.csp;
assert.equal(typeof tauriCsp, "string", "tauri.conf.json app.security.csp missing");
assert.doesNotMatch(tauriCsp, /unsafe-inline/, "tauri CSP must not contain unsafe-inline");
for (const hash of scriptHashes) {
  assert.match(tauriCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `tauri CSP missing script hash ${hash}`);
}
for (const hash of styleHashes) {
  assert.match(tauriCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `tauri CSP missing style hash ${hash}`);
}
if (attrHashes.length > 0) {
  assert.match(tauriCsp, /'unsafe-hashes'/);
  for (const hash of attrHashes) {
    assert.match(tauriCsp, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `tauri CSP missing style-attr hash ${hash}`);
  }
}
assert.match(tauriCsp, /style-src\s[^;]*'self'/, "tauri style-src must allow 'self' for linked CSS");
assert.match(tauriCsp, /frame-ancestors\s+'none'/);

console.log(
  `OK CSP hashes (scripts=${scriptHashes.length}, styles=${styleHashes.length}, style-attrs=${attrHashes.length})`
);
