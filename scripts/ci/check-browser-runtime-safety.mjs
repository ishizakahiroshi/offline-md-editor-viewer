// Regression checks for safety helpers embedded in the single-file Browser app.
// Executes the real helper source in a minimal VM instead of duplicating it.

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = "apps/browser/offline-md-editor-viewer.html";
const html = fs.readFileSync(htmlPath, "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return html.slice(start, end);
}

// localStorage can throw SecurityError for blocked/opaque storage origins. The
// app must fall back to defaults, and all getItem callers must use this helper.
const safeGetSource = sourceBetween(
  "function safeLocalStorageGet(key)",
  "function safeLocalStorageSet(key, value)"
);
const storageWarnings = [];
const storageContext = vm.createContext({
  console: { warn: (...args) => storageWarnings.push(args) },
  localStorage: { getItem: () => "saved" }
});
new vm.Script(safeGetSource).runInContext(storageContext);
assert.equal(new vm.Script('safeLocalStorageGet("key")').runInContext(storageContext), "saved");
storageContext.localStorage.getItem = () => {
  throw new Error("storage blocked");
};
assert.equal(new vm.Script('safeLocalStorageGet("key")').runInContext(storageContext), null);
assert.equal(storageWarnings.length, 1);
assert.equal((html.match(/localStorage\.getItem\(/g) || []).length, 1, "direct getItem call remains outside safeLocalStorageGet");

// Reject oversized Browser files before arrayBuffer() allocates the whole file.
assert.match(html, /const MAX_FILE_BYTES = 64 \* 1024 \* 1024;/);
const readSource = sourceBetween(
  "async function readMarkdownFile(file)",
  "function invokeTauri(command, args = {})"
);
const readContext = vm.createContext({
  decodeMarkdownBuffer: () => ({ text: "decoded", encoding: "utf-8", hasBom: false })
});
new vm.Script(`const MAX_FILE_BYTES = 64 * 1024 * 1024;\n${readSource}`).runInContext(readContext);

let oversizedArrayBufferCalled = false;
readContext.testFile = {
  size: 64 * 1024 * 1024 + 1,
  arrayBuffer: async () => {
    oversizedArrayBufferCalled = true;
    return new ArrayBuffer(0);
  }
};
await assert.rejects(
  new vm.Script("readMarkdownFile(testFile)").runInContext(readContext),
  /File is too large/
);
assert.equal(oversizedArrayBufferCalled, false, "oversized file was allocated before rejection");

readContext.testFile = {
  size: 4,
  arrayBuffer: async () => new ArrayBuffer(4)
};
const loaded = await new vm.Script("readMarkdownFile(testFile)").runInContext(readContext);
assert.equal(loaded.text, "decoded");
assert.equal(loaded.buffer.byteLength, 4);

// Folder rename is backed by the native command/state path only. Keep the UI
// reachable on Desktop and keep the Browser limitation explicit in all READMEs.
assert.ok(html.includes("renameFileMenuBtn.hidden = isEmpty || (isDir && !isTauri);"));
assert.ok(html.includes('if (!entry || (entry.kind === "dir" && !isTauri)) return;'));
const readmeEn = fs.readFileSync("README.md", "utf8");
const readmeJa = fs.readFileSync("README.ja.md", "utf8");
assert.ok(readmeEn.includes("| Rename folders in the tree | | ✓ |"));
assert.ok(readmeJa.includes("| ツリー内でのフォルダ名変更 | | ✓ |"));
assert.ok(html.includes("| Rename folders in the tree | | ✓ |"));
assert.ok(html.includes("| ツリー内でのフォルダ名変更 | | ✓ |"));

console.log("OK browser runtime safety contracts");
