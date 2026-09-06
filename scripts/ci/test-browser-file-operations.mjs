import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");

function extractFunction(name) {
  const signature = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = signature.exec(html);
  assert.ok(match, `source function not found: ${name}`);
  const functionStart = html.slice(Math.max(0, match.index - 6), match.index) === "async "
    ? match.index - 6
    : match.index;
  const bodyMarker = html.indexOf(") {", match.index + match[0].length);
  assert.notEqual(bodyMarker, -1, `source function has no body: ${name}`);
  const bodyStart = bodyMarker + 2;
  let depth = 0;
  let state = "code";
  let quote = "";
  for (let index = bodyStart; index < html.length; index += 1) {
    const ch = html[index];
    const next = html[index + 1];
    if (state === "line-comment") {
      if (ch === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (ch === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "quote") {
      if (ch === "\\") index += 1;
      else if (ch === quote) state = "code";
      continue;
    }
    if (ch === "/" && next === "/") {
      state = "line-comment";
      index += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      state = "quote";
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(functionStart, index + 1);
    }
  }
  assert.fail(`source function has unbalanced braces: ${name}`);
}

const statusMessages = [];
const context = {
  console,
  isTauri: false,
  directoryStartupGeneration: 0,
  directoryStartupOwner: "initial",
  DIRECTORY_STORE_NAME: "handles",
  LAST_DIRECTORY_KEY: "lastDirectory",
  t: (_group, key) => key,
  setStatus: (message, error) => statusMessages.push({ message, error }),
  sortDirectoryFiles: () => {},
  renderFileList: () => {},
  appendExternalDropResult: (_targetEntry, _targetHandle, result) => !!result,
  copyWebkitEntryToHandle: async (entry) => {
    if (entry.name === "broken") throw new Error("fixture copy failure");
    return entry.name === "skipped" ? null : { kind: "file", name: entry.name, fileHandle: {} };
  },
  invokeTauri: async () => {},
  openDirectoryDb: async () => null,
};

for (const name of [
  "beginDirectoryStartupIntent",
  "isDirectoryStartupIntentCurrent",
  "isTerminalDirectoryHandleError",
  "snapshotDataTransfer",
  "getDroppedDirectoryFiles",
  "writeFileHandleBytes",
  "copyExternalDropItemsToHandle",
  "webDirectoryEntryExists",
  "fsRenameEntry",
  "withDirectoryDb",
  "readDirectoryStore",
  "writeDirectoryStore",
]) {
  const code = extractFunction(name);
  vm.runInNewContext(`${code}\nthis[${JSON.stringify(name)}] = ${name};`, context);
}

const restoreIntent = context.beginDirectoryStartupIntent("restore");
const explicitIntent = context.beginDirectoryStartupIntent("open-file");
assert.equal(context.isDirectoryStartupIntentCurrent(restoreIntent), false, "explicit open invalidates pending restore");
assert.equal(context.isDirectoryStartupIntentCurrent(explicitIntent), true, "latest startup intent remains current");
assert.equal(context.isTerminalDirectoryHandleError({ name: "NotFoundError" }), true);
assert.equal(context.isTerminalDirectoryHandleError({ name: "NotAllowedError" }), false, "permission denial is retryable");

let fileGetterCalls = 0;
let entryGetterCalls = 0;
let handleGetterCalls = 0;
const droppedFile = { name: "note.md", size: 0 };
const droppedEntry = { isDirectory: true, name: "notes" };
const droppedHandle = { kind: "directory", name: "notes" };
const rawItem = {
  kind: "file",
  type: "text/markdown",
  getAsFile() {
    fileGetterCalls += 1;
    return droppedFile;
  },
  webkitGetAsEntry() {
    entryGetterCalls += 1;
    return droppedEntry;
  },
  getAsFileSystemHandle() {
    handleGetterCalls += 1;
    return Promise.resolve(droppedHandle);
  },
};
const transfer = context.snapshotDataTransfer({
  items: [rawItem],
  files: [droppedFile],
  types: ["Files"],
});
rawItem.getAsFile = () => { throw new Error("protected mode"); };
rawItem.webkitGetAsEntry = () => { throw new Error("protected mode"); };
rawItem.getAsFileSystemHandle = () => Promise.reject(new Error("protected mode"));
assert.equal(fileGetterCalls, 1, "File is captured before any await");
assert.equal(entryGetterCalls, 1, "webkit entry is captured before any await");
assert.equal(handleGetterCalls, 1, "FileSystemHandle promise is started before any await");
context.collectDirectoryHandleFiles = async (handle) => [{ kind: "file", name: `${handle.name}.md` }];
context.collectWebkitEntryFiles = async (entry) => [{ kind: "file", name: `${entry.name}.md` }];
const droppedDirectory = await context.getDroppedDirectoryFiles(transfer.items[0]);
assert.equal(droppedDirectory.name, "notes", "drop uses the pre-await handle snapshot");

let closed = 0;
let aborted = 0;
await context.writeFileHandleBytes({
  async createWritable() {
    return {
      async write() {},
      async close() { closed += 1; },
      async abort() { aborted += 1; },
    };
  },
}, new Uint8Array([1]));
assert.equal(closed, 1, "successful writes close exactly once");
await assert.rejects(
  context.writeFileHandleBytes({
    async createWritable() {
      return {
        async write() { throw new Error("write failure"); },
        async close() { throw new Error("close must not commit failure"); },
        async abort() { aborted += 1; },
      };
    },
  }, new Uint8Array([2])),
  /write failure/
);
assert.equal(aborted, 1, "failed writes use best-effort abort");

statusMessages.length = 0;
const copyResult = await context.copyExternalDropItemsToHandle([
  { entry: { name: "ok" } },
  { entry: { name: "broken" } },
  { entry: null },
], { requestPermission: async () => "granted" }, null);
assert.equal(copyResult.processed, 1);
assert.equal(copyResult.failed, 1);
assert.equal(copyResult.skipped, 1);
assert.equal(copyResult.permissionDenied, false);
assert.equal(statusMessages.at(-1).message, "externalDropCopyPartial", "partial drop never reports all-success text");

statusMessages.length = 0;
const emptyCopyResult = await context.copyExternalDropItemsToHandle([{ entry: null }], { requestPermission: async () => "granted" }, null);
assert.equal(emptyCopyResult.processed, 0);
assert.equal(statusMessages.at(-1).message, "externalDropCopyNone", "zero-item drop does not report copied");

let createTrueCalls = 0;
const existingParent = {
  async getFileHandle(_name, options) {
    if (options && options.create === true) createTrueCalls += 1;
    return {};
  },
  async getDirectoryHandle() {
    throw { name: "NotFoundError" };
  },
};
assert.equal(await context.webDirectoryEntryExists(existingParent, "existing.md"), true);
await assert.rejects(
  context.fsRenameEntry({
    name: "old.md",
    fileHandle: { async getFile() { return { size: 3, async arrayBuffer() { return new ArrayBuffer(3); } }; } },
    parentDirectoryHandle: existingParent,
  }, "existing.md"),
  /ALREADY_EXISTS/
);
assert.equal(createTrueCalls, 0, "rename collision is rejected before create:true");

let dbClosed = 0;
const fakeDb = { close() { dbClosed += 1; } };
context.openDirectoryDb = async () => fakeDb;
await assert.rejects(context.withDirectoryDb(async () => { throw new Error("transaction failure"); }), /transaction failure/);
assert.equal(dbClosed, 1, "IndexedDB connection closes after operation failure");

function makeTransaction(result) {
  const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
  const request = { result: undefined, error: null, onsuccess: null, onerror: null };
  const store = {
    get() {
      queueMicrotask(() => {
        request.result = result;
        request.onsuccess?.();
        queueMicrotask(() => tx.oncomplete?.());
      });
      return request;
    },
    put() {
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      return request;
    },
    delete() {
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      return request;
    },
  };
  tx.objectStore = () => store;
  return tx;
}
const readDb = { transaction: () => makeTransaction({ kind: "directory" }) };
assert.deepEqual(await context.readDirectoryStore(readDb), { kind: "directory" }, "directory read waits for request and transaction completion");
const writeDb = { transaction: () => makeTransaction(undefined) };
assert.equal(await context.writeDirectoryStore(writeDb, { kind: "directory" }), true, "directory write waits for transaction completion");

assert.match(html, /catch \(err\) \{[\s\S]*folderExpandFailed/);
assert.match(html, /snapshotDataTransfer\(e\.dataTransfer\)\.items/);
assert.match(html, /writable\.abort\(\)/);
assert.match(html, /db\.close\(\)/);

console.log("OK browser file operation contracts");
