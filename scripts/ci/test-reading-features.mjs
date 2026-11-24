import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourceHtml = fs.readFileSync(new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url), "utf8");
function between(start, end) {
  const first = sourceHtml.indexOf(start);
  const last = sourceHtml.indexOf(end, first);
  assert.ok(first >= 0 && last > first, start);
  return sourceHtml.slice(first, last);
}

function element() {
  return {
    children: [], dataset: {}, open: false, value: "", textContent: "", listeners: {},
    append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; },
    addEventListener(event, callback) { this.listeners[event] = callback; },
    querySelector() { return null; }, focus() {}, setAttribute(key, value) { this[key] = value; },
    showModal() { this.open = true; }, close() { this.open = false; },
    setSelectionRange(first, last) { this.selection = [first, last]; },
  };
}
const controls = new Map();
function byId(id) {
  if (!controls.has(id)) controls.set(id, element());
  return controls.get(id);
}
const documentStates = new Map();
const persisted = new Map();
const dirState = { handle: null, files: [] };
const context = vm.createContext({
  document: { getElementById: byId, createElement: element }, documentStates, dirState, activeDocumentId: "active",
  source: element(), preview: element(), outlineVisible: false, MAX_FILE_BYTES: 64 * 1024 * 1024,
  TextDecoder, clearTimeout, setTimeout, performance, crypto, STORAGE_KEY_PREFIX: "test-",
  getDocumentState(id = context.activeDocumentId) { return documentStates.get(id); },
  getDocumentTabLabel(state) { return state.name; },
  t(_section, key) { return key === "readingStats" ? "{n}/{u}/{s}" : key; },
  safeLocalStorageSet(key, value) { persisted.set(key, value); }, scheduleEditorMetricsUpdate() {},
  normalizePathForCompare(path) { return path.toLowerCase(); },
  selectDocumentTab(id) { context.activeDocumentId = id; },
  cardVisibility: { source: true }, updateEditorMetrics() {}, getLineTop(index) { return index * 20; },
  setStatus(message) { context.lastStatus = message; },
  IDBKeyRange: { bound(low, high) { return [low, high]; } }, DIRECTORY_STORE_NAME: "handles",
});
vm.runInContext(between("      function isBinaryBuffer(", "      function invokeTauri("), context);
vm.runInContext(between("      async function findDocumentForIdentity(", "      // BUG-TAURI-RAW-RESPONSE"), context);
vm.runInContext(between("      const readingSearchDialog =", "      function renderOutline("), context);
const database = new Map();
context.withDirectoryDb = callback => callback({
  transaction() {
    const tx = { objectStore() {
      return {
        getAll([low, high]) { return { result: [...database].filter(([key]) => low <= key && key <= high).map(([, value]) => value) }; },
        put(mark, key) { database.set(key, mark); }, delete(key) { database.delete(key); },
      };
    } };
    queueMicrotask(() => tx.oncomplete());
    return tx;
  },
});
function file(name, data = "") {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : Uint8Array.from(data);
  const handle = { kind: "file", name, getFile: async () => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer }),
    isSameEntry: async other => other === handle };
  return handle;
}
function directory(name, children) {
  return { kind: "directory", name, async *values() { yield* children; } };
}
function state(id, name, handle, text, extra = {}) {
  const record = { id, name, handle, text, hasContent: true, closed: false, viewMode: "markdown", ...extra };
  documentStates.set(id, record);
  return record;
}
async function search(query) {
  byId("readingQuery").value = query;
  await context.startReadingSearch();
  return byId("readingResults").children;
}
const status = () => byId("readingProgress").textContent;
const rainy = file("notes.md", "雨天 on disk");
const edited = file("notes.md", "旧版");
const sjis = file("旧文書.markdown", [0x23, 0x20, 0x89, 0x4a, 0x93, 0x56]);
const denied = file("locked.md");
denied.getFile = async () => { throw new Error("Permission denied"); };
dirState.handle = directory("project", [
  directory("一月", [rainy]), directory("二月", [edited]), sjis, denied, file("image.png", "雨天"),
  file("binary.md", [1, 0, 2]), file("oversized.md"),
]);
const oversized = [];
for await (const child of dirState.handle.values()) if (child.name === "oversized.md") oversized.push(child);
oversized[0].getFile = async () => ({ size: 64 * 1024 * 1024 + 1, arrayBuffer() { throw new Error("unexpected read"); } });
const active = state("active", "notes.md", edited, "旧版", { directoryEntryPath: "二月/notes.md" });
context.source.value = "下書き\n雨天はこちら";
const hits = await search("雨天");
assert.equal(status(), "readingDone · 3/3/1");
assert.deepEqual(new Set(hits.map(hit => hit.children[0].textContent)), new Set(["一月/notes.md · 1", "二月/notes.md · 2", "旧文書.markdown · 1"]));
byId("readingSearch").open = true;
await hits.find(hit => hit.children[0].textContent.startsWith("二月/")).listeners.click();
assert.deepEqual(context.source.selection, [4, 6]);
assert.equal(byId("readingQuery").value, "雨天");

const crHits = [];
for await (const hit of context.readingLineMatches("a\r\nb\r雨天", "雨天", () => true)) crHits.push(hit);
assert.equal(crHits[0].offset, 4);
assert.equal(crHits[0].line, 3);

dirState.handle = null;
const other = state("background", "memo.md", null, "background edit");
assert.equal((await search("background edit")).length, 1);
assert.equal((await search("旧版")).length, 0);
const fallback = await file("fallback.md", "disk only").getFile();
other.readingDirectoryFile = fallback;
assert.equal(await context.readingEntryText({ file: fallback }), "background edit");
const distinct = await file("fallback.md", "separate file").getFile();
assert.equal(await context.readingEntryText({ file: distinct }), "separate file");
context.source.value = "x\n".repeat(251);
assert.equal((await search("x")).length, 250);
assert.equal(status(), "readingLimit · 250/0/0");

let resume;
let entered;
const started = new Promise(resolve => { entered = resolve; });
const pendingFile = file("slow.md");
pendingFile.getFile = async () => { entered(); return new Promise(resolve => { resume = resolve; }); };
dirState.handle = directory("slow", [pendingFile]);
byId("readingQuery").value = "old";
const previousRun = context.startReadingSearch();
await started;
context.cancelReadingSearch();
assert.match(status(), /^readingStopped/);
dirState.handle = directory("new", [file("new.md", "fresh")]);
assert.equal((await search("fresh")).length, 1);
resume(await file("old.md", "old").getFile());
await previousRun;
assert.equal(status(), "readingDone · 1/0/0");
assert.equal(byId("readingResults").children[0].children[0].textContent, "new.md · 1");

const calls = [];
context.collectTauriShallowFiles = async path => {
  calls.push(path);
  return path === "R" ? { truncated: false, warnings: [], files: [{ kind: "dir", path: "sub", tauriPath: "R/sub" }] }
    : { truncated: false, warnings: ["unread"], files: [{ name: "file.md", path: "sub/file.md", tauriPath: "R/sub/file.md" }] };
};
let unread = 0;
const tauriEntries = [];
for await (const entry of context.readingFolderEntries("R", () => true, () => { unread++; })) tauriEntries.push(entry);
assert.deepEqual(calls, ["R", "R/sub"]);
assert.equal(tauriEntries[0].path, "sub/file.md");
assert.equal(unread, 1);

const source = "# 親\n## 会議\n~~~\n## コード\n~~~\n## 会議\n# 別の親\n## 会議";
context.source.value = source;
const headings = context.readingHeadingRecords(source);
assert.equal(headings.length, 5);
assert.equal(headings[1].duplicates, 2);
assert.equal(headings[3].duplicates, 1);
assert.equal(headings[2].ordinal, 2);
database.set("unrelated", { name: "other session" });
context.toggleReadingBookmark(headings[4]);
await vm.runInContext("readingMarkWrite", context);
const [mark] = await context.readingBookmarkStore("list");
assert.deepEqual([...mark.trail], ["別の親", "会議"]);
assert.equal(await context.readingSameFile(mark, active), true);
assert.equal(await context.readingSameFile(mark, { handle: rainy }), false);
context.source.value = "追記\n" + source;
byId("readingBookmarks").open = true;
await context.openReadingBookmark(mark);
assert.deepEqual(context.source.selection, [context.source.value.lastIndexOf("## 会議"), context.source.value.lastIndexOf("## 会議")]);
context.toggleReadingBookmark(headings[1]);
await vm.runInContext("readingMarkWrite", context);
const dup = (await context.readingBookmarkStore("list")).find(item => item.duplicates > 1);
byId("readingBookmarks").open = true;
await context.openReadingBookmark(dup);
assert.equal(byId("readingBookmarks").open, true);
assert.equal(byId("readingBookmarkList").children.length, 2);
context.toggleReadingBookmark(headings[1]);
await vm.runInContext("readingMarkWrite", context);
assert.equal((await context.readingBookmarkStore("list")).length, 1);
assert.ok(database.has("unrelated"));

const before = context.source.value;
context.setReadingPreset("relaxed", true);
assert.equal(context.preview.dataset.readingPreset, "relaxed");
assert.equal(persisted.get("test-reading_preset"), "relaxed");
context.setReadingPreset("invalid", false);
assert.equal(context.preview.dataset.readingPreset, "standard");
assert.equal(persisted.get("test-reading_preset"), "relaxed");
assert.equal(context.source.value, before);
console.log("OK reading features: folder recursion and decoding, tab snapshots, search limits/cancellation, heading bookmarks and reading presets");
