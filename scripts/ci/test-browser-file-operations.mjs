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

// Same brace-balancing walk as extractFunction, but for an inline
// addEventListener("click", () => { ... }) body that has no function name to
// anchor on. startMarker must end at the body's opening "{".
function extractBracedBlock(startMarker) {
  const markerIndex = html.indexOf(startMarker);
  assert.ok(markerIndex !== -1, `block start not found: ${startMarker}`);
  const bodyStart = markerIndex + startMarker.length;
  let depth = 1;
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
      if (depth === 0) return html.slice(bodyStart, index);
    }
  }
  assert.fail(`block has unbalanced braces: ${startMarker}`);
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

const documentManagerContext = { Map };
vm.runInNewContext(`
  ${extractFunction("createDocumentState")}
  const documentStates = new Map();
  let activeDocumentId = "document-a";
  documentStates.set("document-a", createDocumentState("document-a", { text: "A" }));
  documentStates.set("document-b", createDocumentState("document-b", { text: "B" }));
  ${extractFunction("getDocumentState")}
  ${extractFunction("beginFileLoad")}
  ${extractFunction("isFileLoadCurrent")}
  this.manager = {
    beginFileLoad,
    isFileLoadCurrent,
    switchActive(id) { activeDocumentId = id; },
    close(id) {
      const state = documentStates.get(id);
      state.closed = true;
      state.loadGeneration += 1;
      state.buffer = null;
      documentStates.delete(id);
    },
    get(id) { return documentStates.get(id); }
  };
`, documentManagerContext);
const loadA = documentManagerContext.manager.beginFileLoad("document-a");
documentManagerContext.manager.switchActive("document-b");
assert.equal(documentManagerContext.manager.isFileLoadCurrent(loadA), true, "switching documents keeps A's load scoped to A");
assert.equal(documentManagerContext.manager.get("document-b").text, "B", "switching does not replace B with A state");
documentManagerContext.manager.close("document-a");
assert.equal(documentManagerContext.manager.isFileLoadCurrent(loadA), false, "closing A invalidates A's delayed load");
assert.equal(documentManagerContext.manager.get("document-b").text, "B", "a closed document load cannot overwrite B");

const savedWrites = [];
const saveContext = {
  activeDocumentId: "document-a",
  source: { value: "A edited" },
  encodingSelect: { value: "utf-8" },
  bomCheckbox: { checked: false },
  lineEndingSelect: { value: "lf" },
  isTauri: false,
  window: { confirm: () => true },
  t: (_group, key) => key,
  setStatus: () => {},
  setEncodingSelectValue: () => {},
  setDirtyState: () => {},
  ensureWritableHandle: async () => "existing",
  encodeFileContent: (text) => new TextEncoder().encode(text),
  writeFileHandleBytes: async (handle, bytes) => { savedWrites.push({ handle, text: new TextDecoder().decode(bytes) }); },
};
const saveHandleA = { requestPermission: async () => "granted" };
saveContext.documentStates = new Map([
  ["document-a", { id: "document-a", text: "A edited", handle: saveHandleA, readOnly: false, closed: false, unsaved: true }],
  ["document-b", { id: "document-b", text: "B edited", handle: { requestPermission: async () => "granted" }, readOnly: false, closed: false, unsaved: true }],
]);
saveContext.getDocumentState = (id = saveContext.activeDocumentId) => saveContext.documentStates.get(id) || null;
vm.runInNewContext(`${extractFunction("saveFile")}\nthis.saveFile = saveFile;`, saveContext);
const saveA = saveContext.saveFile();
saveContext.activeDocumentId = "document-b";
saveContext.source.value = "B edited";
await saveA;
assert.equal(savedWrites.length, 1, "one save writes one document");
assert.equal(savedWrites[0].handle, saveHandleA, "a pending save keeps A's handle after switching to B");
assert.equal(savedWrites[0].text, "A edited", "a pending save keeps A's captured text");
assert.equal(saveContext.documentStates.get("document-a").unsaved, false, "saved A becomes clean");
assert.equal(saveContext.documentStates.get("document-b").unsaved, true, "saving A does not mark B clean");

assert.match(html, /catch \(err\) \{[\s\S]*folderExpandFailed/);
assert.match(html, /snapshotDataTransfer\(e\.dataTransfer\)\.items/);
assert.match(html, /writable\.abort\(\)/);
assert.match(html, /db\.close\(\)/);

// BUG-EXIT-PER-DOC-001: 終了確認は未保存文書を1件ずつ requestCloseDocument で確認し、
// 「戻る」または保存失敗・保存先キャンセルで false が返った時点で残りは確認せず中止する。
// すべて解決したときだけ true を返す（全文書一括の単発確認への回帰を防ぐ）。
{
  const exitDocsCancel = new Map([
    ["document-a", { id: "document-a", closed: false, unsaved: true }],
    ["document-b", { id: "document-b", closed: false, unsaved: true }],
    ["document-c", { id: "document-c", closed: false, unsaved: false }],
  ]);
  const exitCallsCancel = [];
  const exitContextCancel = {
    documentStates: exitDocsCancel,
    requestCloseDocument: async (documentId) => {
      exitCallsCancel.push(documentId);
      if (documentId === "document-a") {
        exitDocsCancel.delete("document-a");
        return true;
      }
      return false; // user chose "back" (or save failed/was canceled) for document-b
    },
  };
  vm.runInNewContext(
    `${extractFunction("confirmAllUnsavedDocumentsForExit")}\nthis.confirmAllUnsavedDocumentsForExit = confirmAllUnsavedDocumentsForExit;`,
    exitContextCancel
  );
  const canExitCancel = await exitContextCancel.confirmAllUnsavedDocumentsForExit();
  assert.equal(canExitCancel, false, "exit is aborted once a document close is canceled or fails to save");
  assert.deepEqual(exitCallsCancel, ["document-a", "document-b"], "unsaved documents are confirmed one at a time, stopping at the first unresolved document");
  assert.equal(exitDocsCancel.has("document-b"), true, "the document the user backed out on remains open");
  assert.equal(exitDocsCancel.has("document-c"), true, "documents that were never unsaved are left untouched by the exit sweep");

  const exitDocsAllResolved = new Map([
    ["document-a", { id: "document-a", closed: false, unsaved: true }],
    ["document-b", { id: "document-b", closed: false, unsaved: true }],
  ]);
  const exitCallsAllResolved = [];
  const exitContextAllResolved = {
    documentStates: exitDocsAllResolved,
    requestCloseDocument: async (documentId) => {
      exitCallsAllResolved.push(documentId);
      exitDocsAllResolved.delete(documentId);
      return true;
    },
  };
  vm.runInNewContext(
    `${extractFunction("confirmAllUnsavedDocumentsForExit")}\nthis.confirmAllUnsavedDocumentsForExit = confirmAllUnsavedDocumentsForExit;`,
    exitContextAllResolved
  );
  const canExitAllResolved = await exitContextAllResolved.confirmAllUnsavedDocumentsForExit();
  assert.equal(canExitAllResolved, true, "exit proceeds once every unsaved document is resolved");
  assert.deepEqual(exitCallsAllResolved, ["document-a", "document-b"], "every unsaved document is confirmed before exit is allowed");
  assert.equal(exitDocsAllResolved.size, 0, "all resolved documents are removed from the unsaved sweep");
}

// Tab context menu "close other tabs" / "close tabs to the right" both close a fixed id
// list one at a time via closeDocumentTabsInOrder. Cancelling (or a failed save) on one
// id must stop the sweep there, leaving every later id in the list untouched and open.
{
  const closeOrderDocs = new Map([
    ["document-a", { id: "document-a", closed: false }],
    ["document-b", { id: "document-b", closed: false }],
    ["document-c", { id: "document-c", closed: false }],
  ]);
  const closeOrderCallsCancel = [];
  const closeOrderContextCancel = {
    requestCloseDocument: async (documentId) => {
      closeOrderCallsCancel.push(documentId);
      if (documentId === "document-b") return false; // user cancels (or save fails) on document-b
      closeOrderDocs.delete(documentId);
      return true;
    },
  };
  vm.runInNewContext(
    `${extractFunction("closeDocumentTabsInOrder")}\nthis.closeDocumentTabsInOrder = closeDocumentTabsInOrder;`,
    closeOrderContextCancel
  );
  const closeOrderResultCancel = await closeOrderContextCancel.closeDocumentTabsInOrder([
    "document-a",
    "document-b",
    "document-c",
  ]);
  assert.equal(closeOrderResultCancel, false, "the sweep reports abort once a document close is canceled or fails to save");
  assert.deepEqual(closeOrderCallsCancel, ["document-a", "document-b"], "document-c is never confirmed once document-b is unresolved");
  assert.equal(closeOrderDocs.has("document-a"), false, "document-a closed before the cancellation is not reverted");
  assert.equal(closeOrderDocs.has("document-b"), true, "the document the user backed out on remains open");
  assert.equal(closeOrderDocs.has("document-c"), true, "documents after the cancellation point are left open and unconfirmed");

  const closeOrderCallsAllResolved = [];
  const closeOrderContextAllResolved = {
    requestCloseDocument: async (documentId) => {
      closeOrderCallsAllResolved.push(documentId);
      return true;
    },
  };
  vm.runInNewContext(
    `${extractFunction("closeDocumentTabsInOrder")}\nthis.closeDocumentTabsInOrder = closeDocumentTabsInOrder;`,
    closeOrderContextAllResolved
  );
  const closeOrderResultAllResolved = await closeOrderContextAllResolved.closeDocumentTabsInOrder([
    "document-a",
    "document-b",
    "document-c",
  ]);
  assert.equal(closeOrderResultAllResolved, true, "the sweep reports success once every id in the list is resolved");
  assert.deepEqual(
    closeOrderCallsAllResolved,
    ["document-a", "document-b", "document-c"],
    "every id in the captured list is confirmed in order"
  );
}

// C3: the tab context menu's "copy path" / "open in Explorer" items must not
// appear where they cannot work — an untitled tab has no path, and neither
// item can promise a path the Browser build has no folder handle for.
{
  const makeTabMenuButtons = () => ({
    closeDocumentTabMenuBtn: { hidden: false },
    closeOtherDocumentTabsMenuBtn: { hidden: false },
    closeDocumentTabsToRightMenuBtn: { hidden: false },
    tabCopyFileNameMenuBtn: { hidden: false },
    tabCopyPathMenuBtn: { hidden: false },
    tabOpenInExplorerMenuBtn: { hidden: false },
  });
  const makeTabMenuContext = (isTauriValue) => ({
    ...makeTabMenuButtons(),
    documentTabContextMenu: {},
    documentStates: new Map([
      ["untitled-doc", { id: "untitled-doc", closed: false }],
      ["desktop-doc", { id: "desktop-doc", closed: false, handle: { tauriPath: "C:\\Users\\me\\notes\\todo.md" } }],
      ["browser-folder-doc", { id: "browser-folder-doc", closed: false, directoryEntryPath: "todo.md", directoryRootName: "notes" }],
    ]),
    isTauri: isTauriValue,
    hideFileContextMenu: () => {},
    positionContextMenu: () => {},
  });
  const menuSource = `${extractFunction("getDocumentPathLabel")}\n${extractFunction("showDocumentTabContextMenu")}\nthis.showDocumentTabContextMenu = showDocumentTabContextMenu;`;

  const desktopMenuContext = makeTabMenuContext(true);
  vm.runInNewContext(menuSource, desktopMenuContext);

  desktopMenuContext.showDocumentTabContextMenu("untitled-doc", 0, 0);
  assert.equal(desktopMenuContext.tabCopyFileNameMenuBtn.hidden, false, "an untitled tab still offers copy file name");
  assert.equal(desktopMenuContext.tabCopyPathMenuBtn.hidden, true, "an untitled tab has no save location to copy a path from");
  assert.equal(desktopMenuContext.tabOpenInExplorerMenuBtn.hidden, true, "an untitled tab has nowhere for Explorer to open");

  desktopMenuContext.showDocumentTabContextMenu("desktop-doc", 0, 0);
  assert.equal(desktopMenuContext.tabCopyPathMenuBtn.hidden, false, "a saved Desktop document has a path to copy");
  assert.equal(desktopMenuContext.tabOpenInExplorerMenuBtn.hidden, false, "a Desktop build with a tauriPath offers open-in-Explorer");

  desktopMenuContext.showDocumentTabContextMenu("browser-folder-doc", 0, 0);
  assert.equal(desktopMenuContext.tabCopyPathMenuBtn.hidden, false, "a folder-opened document has a relative path to copy even without a tauriPath");

  const browserMenuContext = makeTabMenuContext(false);
  vm.runInNewContext(menuSource, browserMenuContext);

  browserMenuContext.showDocumentTabContextMenu("desktop-doc", 0, 0);
  assert.equal(browserMenuContext.tabCopyPathMenuBtn.hidden, false, "the Browser build still offers copy path when a path exists");
  assert.equal(browserMenuContext.tabOpenInExplorerMenuBtn.hidden, true, "the Browser build never offers open-in-Explorer, even with a tauriPath-shaped handle");

  browserMenuContext.showDocumentTabContextMenu("untitled-doc", 0, 0);
  assert.equal(browserMenuContext.tabOpenInExplorerMenuBtn.hidden, true, "the Browser build hides open-in-Explorer for an untitled tab too");
}

// C3: "open in Explorer" must hand desktop_open_path_in_explorer the file's
// parent directory, never the file itself. The Tauri command rejects any path
// that is not a directory, so passing the file path would always fail.
{
  const openInExplorerBody = extractBracedBlock('tabOpenInExplorerMenuBtn.addEventListener("click", () => {');
  const runOpenInExplorerSource = `function runOpenInExplorer() {\n${openInExplorerBody}\n}\nthis.runOpenInExplorer = runOpenInExplorer;`;

  const backslashCalls = [];
  const backslashContext = {
    tabContextMenuDocumentId: "desktop-doc",
    hideDocumentTabContextMenu: () => {},
    documentStates: new Map([
      ["desktop-doc", { id: "desktop-doc", closed: false, handle: { tauriPath: "C:\\Users\\me\\notes\\todo.md" } }],
    ]),
    isTauri: true,
    invokeTauri: (command, args) => {
      backslashCalls.push({ command, args });
      return Promise.resolve();
    },
    setStatus: () => {},
    t: (_group, key) => key,
  };
  vm.runInNewContext(runOpenInExplorerSource, backslashContext);
  backslashContext.runOpenInExplorer();
  assert.equal(backslashCalls.length, 1, "Explorer launch is requested exactly once");
  assert.equal(backslashCalls[0].command, "desktop_open_path_in_explorer");
  assert.equal(
    backslashCalls[0].args.path,
    "C:\\Users\\me\\notes",
    "Explorer opens the file's parent directory, not the file itself"
  );

  const forwardSlashCalls = [];
  const forwardSlashContext = {
    tabContextMenuDocumentId: "desktop-doc",
    hideDocumentTabContextMenu: () => {},
    documentStates: new Map([
      ["desktop-doc", { id: "desktop-doc", closed: false, handle: { tauriPath: "/home/me/notes/todo.md" } }],
    ]),
    isTauri: true,
    invokeTauri: (command, args) => {
      forwardSlashCalls.push({ command, args });
      return Promise.resolve();
    },
    setStatus: () => {},
    t: (_group, key) => key,
  };
  vm.runInNewContext(runOpenInExplorerSource, forwardSlashContext);
  forwardSlashContext.runOpenInExplorer();
  assert.equal(
    forwardSlashCalls[0].args.path,
    "/home/me/notes",
    "the parent-directory split also works with forward-slash paths"
  );

  const browserBuildCalls = [];
  const browserBuildContext = {
    tabContextMenuDocumentId: "desktop-doc",
    hideDocumentTabContextMenu: () => {},
    documentStates: new Map([
      ["desktop-doc", { id: "desktop-doc", closed: false, handle: { tauriPath: "C:\\Users\\me\\notes\\todo.md" } }],
    ]),
    isTauri: false,
    invokeTauri: (command, args) => {
      browserBuildCalls.push({ command, args });
      return Promise.resolve();
    },
    setStatus: () => {},
    t: (_group, key) => key,
  };
  vm.runInNewContext(runOpenInExplorerSource, browserBuildContext);
  browserBuildContext.runOpenInExplorer();
  assert.equal(browserBuildCalls.length, 0, "the Browser build never invokes the Explorer command, even if isTauri is bypassed at this layer");
}

// BUG-TAURI-RAW-RESPONSE-001: desktop_read_file_bytes の応答は、転送経路によって
// ArrayBuffer でも数値の素の配列でも届く。配列を弾く実装に戻すと Desktop 版で
// ファイルが 1 つも開けなくなるため、両方を受けることを検査する。
{
  const bytesContext = { console };
  vm.runInNewContext(
    `${extractFunction("bytesToArrayBuffer")}
     this.bytesToArrayBuffer = bytesToArrayBuffer;
     // instanceof は realm をまたぐと成立しないので、値は vm 側で作る。
     this.makeArrayBuffer = (values) => Uint8Array.from(values).buffer;
     this.makeView = (values, begin, end) => Uint8Array.from(values).subarray(begin, end);`,
    bytesContext
  );
  const { bytesToArrayBuffer, makeArrayBuffer, makeView } = bytesContext;
  const toBytes = (buffer) => Array.from(new Uint8Array(buffer));

  const fromPlainArray = bytesToArrayBuffer([35, 32, 111, 102]);
  assert.deepEqual(
    toBytes(fromPlainArray),
    [35, 32, 111, 102],
    "a plain byte array is accepted and keeps its bytes and order"
  );

  assert.deepEqual(
    toBytes(bytesToArrayBuffer(makeView([1, 2, 3, 4, 5], 1, 4))),
    [2, 3, 4],
    "a typed array view is sliced to its own range"
  );

  const raw = makeArrayBuffer([9, 9]);
  assert.equal(bytesToArrayBuffer(raw), raw, "an ArrayBuffer is passed through unchanged");

  assert.throws(
    () => bytesToArrayBuffer("not bytes"),
    /non-binary file response/,
    "a response that is not bytes is still rejected"
  );
}

// close-requested のリスナ本体を切り出して、終了までの手順が崩れていないかを見る。
// 行の並びそのものではなく「1件ずつの確認を通ってから強制クローズする」構造を検査する。
const closeGuardStart = html.indexOf("await appWindow.listen(closeRequestedEvent,");
const closeGuardEnd = html.indexOf("desktop_force_close_window", closeGuardStart);
assert.ok(
  closeGuardStart >= 0 && closeGuardEnd > closeGuardStart,
  "the desktop close guard listener is present"
);
const closeRequestedListener = html.slice(closeGuardStart, closeGuardEnd);
assert.match(
  closeRequestedListener,
  /await confirmAllUnsavedDocumentsForExit\(\)/,
  "the desktop close guard confirms unsaved documents one at a time before exiting"
);
assert.match(
  closeRequestedListener,
  /if \(!canExit\) return;/,
  "the desktop close guard aborts the exit when a document confirmation is cancelled"
);
assert.match(
  closeRequestedListener,
  /if \(exitConfirmInProgress\) return;/,
  "repeated close requests do not start a second confirmation loop"
);

console.log("OK browser file operation contracts");
