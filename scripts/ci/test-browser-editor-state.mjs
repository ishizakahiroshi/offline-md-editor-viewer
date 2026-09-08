import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");

function extractFunction(name) {
  const signature = new RegExp(`function\\s+${name}\\s*\\(`);
  const match = signature.exec(html);
  assert.ok(match, `source function not found: ${name}`);
  const bodyMarker = html.indexOf(") {", match.index + match[0].length);
  const bodyStart = bodyMarker < 0 ? -1 : bodyMarker + 2;
  assert.notEqual(bodyStart, -1, `source function has no body: ${name}`);

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
      if (ch === "\\") {
        index += 1;
      } else if (ch === quote) {
        state = "code";
      }
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
    if (ch === "'" || ch === '"') {
      state = "quote";
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(match.index, index + 1);
    }
  }
  assert.fail(`source function has unbalanced braces: ${name}`);
}

// Same brace-balancing walk as extractFunction, but anchored on a literal
// prefix ending at the arrow function's opening "{" (event listeners are
// anonymous, so they cannot be located via the `function NAME(` signature).
function extractArrowFunctionBody(anchor) {
  const anchorIndex = html.indexOf(anchor);
  assert.ok(anchorIndex >= 0, `event handler anchor not found: ${anchor}`);
  const braceIndex = anchorIndex + anchor.length - 1;
  assert.equal(html[braceIndex], "{", `event handler anchor does not end at an opening brace: ${anchor}`);

  let depth = 0;
  let state = "code";
  let quote = "";
  for (let index = braceIndex; index < html.length; index += 1) {
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
      if (ch === "\\") {
        index += 1;
      } else if (ch === quote) {
        state = "code";
      }
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
      if (depth === 0) return html.slice(braceIndex, index + 1);
    }
  }
  assert.fail(`event handler has unbalanced braces: ${anchor}`);
}

function makeDeferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

const pendingTimers = new Map();
let nextTimerId = 0;
const fakeSetTimeout = (callback) => {
  const id = ++nextTimerId;
  pendingTimers.set(id, callback);
  return id;
};
const fakeClearTimeout = (id) => pendingTimers.delete(id);
const flushTimers = () => {
  for (const [id, callback] of [...pendingTimers]) {
    pendingTimers.delete(id);
    callback();
  }
};

const classes = new Set();
const counters = {
  dirty: 0,
  metrics: 0,
  find: 0,
  mirror: 0,
  render: 0,
  layout: 0,
  persistedCards: 0,
  persistedOutline: 0,
};
const source = {
  value: "before",
  selectionStart: 0,
  selectionEnd: 0,
  setRangeText(value, start, end) {
    this.value = this.value.slice(0, start) + value + this.value.slice(end);
  },
  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  },
};
const context = {
  console,
  source,
  sourceIsComposing: false,
  sourceCompositionChanged: false,
  sourceCompositionFlushText: null,
  sourceProgrammaticChange: false,
  activeDocumentId: "document-a",
  STORAGE_OUTLINE_VISIBLE_KEY: "outline",
  fileState: {
    readOnly: false,
    hasContent: true,
    handle: { name: "fixture.md" },
    encoding: "utf-8",
    buffer: new ArrayBuffer(0),
    bom: false,
    lineEnding: "lf",
    unsaved: false,
    previewAutoCollapsed: false,
    text: "before",
    renderGeneration: 0,
    undoStack: [],
    redoStack: [],
    compositionSnapshot: null,
    closed: false,
  },
  encodingSelect: { disabled: false },
  bomCheckbox: { disabled: false, checked: false },
  lineEndingSelect: { disabled: false, value: "lf" },
  editorPanel: { classList: { contains: () => false } },
  fileStatusBar: { style: {} },
  document: {
    body: {
      classList: {
        contains: (name) => classes.has(name),
        toggle(name, force) {
          const enabled = force === undefined ? !classes.has(name) : !!force;
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        },
      },
    },
  },
  window: { setTimeout: fakeSetTimeout },
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  renderDebounceTimer: null,
  RENDER_DEBOUNCE_MS: 150,
  setStatus: () => {},
  t: (_group, key) => key,
  setEncodingSelectValue: () => {},
  updateFileStatusBarVisibility: () => {},
  setReadOnlyMode: () => {},
  setAppDocumentTitle: () => {},
  setDirtyState(isDirty) {
    context.fileState.unsaved = isDirty;
    counters.dirty += 1;
  },
  updateEditorMetrics: () => { counters.metrics += 1; },
  isFindBarOpen: () => true,
  refreshFindMatches: () => { counters.find += 1; },
  scheduleMirroredSelectionUpdate: () => { counters.mirror += 1; },
  renderContent: () => { counters.render += 1; },
  getDocumentState(documentId = context.activeDocumentId) {
    return documentId === context.activeDocumentId ? context.fileState : null;
  },
  cardVisibility: { fileList: true, source: true, preview: true },
  dirState: { path: "", files: [] },
  hasDirectoryContent: () => false,
  saveCardVisibility: () => { counters.persistedCards += 1; },
  updateCardLayout: () => { counters.layout += 1; },
  outlineVisible: true,
  outlinePanel: { classList: { toggle: () => {} } },
  outlineToggleBtn: { setAttribute: () => {}, classList: { toggle: () => {} } },
  safeLocalStorageSet: () => { counters.persistedOutline += 1; },
  renderOutline: () => {},
};

for (const name of [
  "prepareSourceChange",
  "scheduleSourceRender",
  "runSourceChangePipeline",
  "applySourceTextChange",
  "handleSourceCompositionStart",
  "handleSourceCompositionEnd",
  "handleSourceInput",
  "restoreDocumentHistorySnapshot",
  "handleSourceBeforeInput",
  "setCardVisibility",
  "setOutlineVisible",
]) {
  const code = extractFunction(name);
  vm.runInNewContext(`${code}\nthis[${JSON.stringify(name)}] = ${name};`, context);
}

context.applySourceTextChange("after", 1, 6);
assert.equal(context.source.value, "after", "programmatic replacement updates source text");
assert.equal(counters.dirty, 1, "programmatic replacement marks the document dirty");
assert.equal(counters.metrics, 1, "programmatic replacement runs editor metrics");
assert.equal(counters.find, 1, "programmatic replacement refreshes find state once");
assert.equal(counters.mirror, 1, "programmatic replacement refreshes selection mirror");
flushTimers();
assert.equal(counters.render, 1, "programmatic replacement schedules preview rendering");

Object.assign(counters, { dirty: 0, metrics: 0, find: 0, mirror: 0, render: 0 });
context.source.value = "日本";
context.handleSourceCompositionStart();
context.handleSourceInput({ isComposing: true });
assert.equal(counters.dirty, 1, "IME input marks dirty immediately");
assert.equal(counters.metrics, 0, "IME input defers metrics while composing");
context.handleSourceCompositionEnd();
assert.equal(counters.metrics, 1, "IME composition end flushes metrics once");
context.handleSourceInput({ isComposing: false });
assert.equal(counters.metrics, 1, "duplicate post-composition input is coalesced");
flushTimers();
assert.equal(counters.render, 1, "IME composition schedules one preview render");

context.source.value = "first";
context.source.selectionStart = 5;
context.source.selectionEnd = 5;
context.fileState.undoStack = [];
context.fileState.redoStack = [];
let emptyUndoPrevented = false;
context.handleSourceBeforeInput({ inputType: "historyUndo", preventDefault: () => { emptyUndoPrevented = true; } });
assert.equal(emptyUndoPrevented, true, "empty document history still prevents the shared textarea undo");
assert.equal(context.source.value, "first", "empty document history leaves the source text unchanged");

context.fileState.undoStack = [{ text: "before", selectionStart: 0, selectionEnd: 0 }];
context.fileState.redoStack = [];
let undoPrevented = false;
context.handleSourceBeforeInput({ inputType: "historyUndo", preventDefault: () => { undoPrevented = true; } });
assert.equal(undoPrevented, true, "document history intercepts native undo after document switches");
assert.equal(context.source.value, "before", "undo restores only the active document snapshot");
assert.equal(context.fileState.redoStack[0].text, "first", "undo keeps an active-document redo snapshot");

const switchContext = {
  Map,
  source: {
    value: "A edited",
    selectionStart: 2,
    selectionEnd: 2,
    scrollTop: 12,
    scrollLeft: 3,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  },
  preview: { scrollTop: 8 },
  bomCheckbox: { checked: false },
  lineEndingSelect: { value: "lf" },
  clearTimeout: () => {},
  disposeRegexFindWorker: () => {},
  findState: { matches: [], currentIndex: -1, error: "", capped: false, pending: false },
  isFindBarOpen: () => false,
  refreshFindMatches: () => {},
  setEncodingSelectValue: () => {},
  setReadOnlyMode: () => {},
  updateCardLayout: () => {},
  updateEditorMetrics: () => {},
  renderContent: () => {},
  setDirtyState: () => {},
  setAppDocumentTitle: () => {},
};
vm.runInNewContext(`
  ${extractFunction("createDocumentState")}
  const documentStates = new Map();
  let activeDocumentId = "document-a";
  let renderDebounceTimer = null;
  let findGeneration = 0;
  let regexFindRequestId = 0;
  let sourceIsComposing = false;
  let sourceCompositionChanged = false;
  let sourceCompositionFlushText = null;
  documentStates.set("document-a", createDocumentState("document-a", { text: "A" }));
  documentStates.set("document-b", createDocumentState("document-b", { text: "B edited", selectionStart: 1, selectionEnd: 1 }));
  ${extractFunction("getDocumentState")}
  ${extractFunction("captureActiveDocumentState")}
  ${extractFunction("activateDocumentState")}
  this.documents = documentStates;
  this.activateDocumentState = activateDocumentState;
  this.activeId = () => activeDocumentId;
`, switchContext);
assert.equal(switchContext.activateDocumentState("document-b"), true, "B can be activated without replacing A");
assert.equal(switchContext.documents.get("document-a").text, "A edited", "switching captures A's edited text");
assert.equal(switchContext.source.value, "B edited", "switching restores B's edited text");
switchContext.source.value = "B newer";
assert.equal(switchContext.activateDocumentState("document-a"), true, "A can be reactivated");
assert.equal(switchContext.documents.get("document-b").text, "B newer", "switching back captures B's edited text");
assert.equal(switchContext.source.value, "A edited", "switching back restores A's text");

classes.clear();
context.cardVisibility = { fileList: true, source: true, preview: true };
context.setCardVisibility("preview", false);
assert.equal(counters.persistedCards, 1, "normal card changes persist");
classes.add("zen-mode");
context.setCardVisibility("preview", true);
assert.equal(counters.persistedCards, 1, "Zen card changes do not persist");

context.setOutlineVisible(false, { persist: false });
assert.equal(counters.persistedOutline, 0, "Zen outline changes can be non-persistent");
context.setOutlineVisible(true);
assert.equal(counters.persistedOutline, 1, "normal outline changes persist");

// BUG-TABS-ASYNC-TOGGLE-001: modeToggle の change ハンドラは、確認ダイアログ待ちの間に
// document tab が切り替わっても、切り替わった後の文書へ読み取り専用状態を適用しては
// ならない。ハンドラ本体を HTML からそのまま抽出して実行し、回帰させないことを確認する。
{
  function buildToggleHarness(startUnsaved) {
    const docs = new Map([
      ["document-a", { id: "document-a", unsaved: startUnsaved, readOnly: false, handle: null, hasContent: true }],
      ["document-b", { id: "document-b", unsaved: false, readOnly: false, handle: null, hasContent: true }],
    ]);
    const harness = {
      activeDocumentId: "document-a",
      modeToggle: { checked: false },
      supportsFsAccess: true,
      t: (_group, key) => key,
      setStatus: () => {},
      updateModeToggleLabels: () => {},
      setDirtyState: () => {},
      updateEditorMetrics: () => {},
    };
    harness.getDocumentState = (id = harness.activeDocumentId) => docs.get(id) || null;
    harness.fileState = new Proxy({}, {
      get(_t, prop) {
        const state = docs.get(harness.activeDocumentId);
        return state ? state[prop] : undefined;
      },
      set(_t, prop, value) {
        const state = docs.get(harness.activeDocumentId);
        if (!state) return false;
        state[prop] = value;
        return true;
      },
    });
    harness.setReadOnlyModeCalls = [];
    harness.setReadOnlyMode = (enabled) => {
      harness.setReadOnlyModeCalls.push({ documentId: harness.activeDocumentId, enabled: !!enabled });
      harness.fileState.readOnly = !!enabled;
    };
    const deferred = makeDeferred();
    harness.openConfirmDialog = () => deferred.promise;
    harness.resolveConfirm = deferred.resolve;
    vm.runInNewContext(`
      async function runModeToggle() ${extractArrowFunctionBody('modeToggle.addEventListener("change", async () => {')}
      this.runModeToggle = runModeToggle;
    `, harness);
    harness.docs = docs;
    return harness;
  }

  const drifted = buildToggleHarness(true);
  const pendingDrift = drifted.runModeToggle();
  drifted.activeDocumentId = "document-b";
  drifted.resolveConfirm(true);
  await pendingDrift;
  assert.equal(drifted.setReadOnlyModeCalls.length, 0, "leaving the tab during the confirm skips applying read-only anywhere");
  assert.equal(drifted.docs.get("document-a").readOnly, false, "the original document keeps its read/write state after the tab was left");
  assert.equal(drifted.docs.get("document-b").readOnly, false, "the newly active document is not forced read-only by another tab's toggle");

  const stable = buildToggleHarness(true);
  const pendingStable = stable.runModeToggle();
  stable.resolveConfirm(true);
  await pendingStable;
  assert.deepEqual(
    stable.setReadOnlyModeCalls,
    [{ documentId: "document-a", enabled: true }],
    "confirming without switching tabs still applies read-only to the confirmed document"
  );
  assert.equal(stable.docs.get("document-a").readOnly, true, "the confirmed document becomes read-only");
}

// BUG-TABS-ASYNC-ENCODING-001: encodingSelect の change ハンドラは、確認/描画待ちの間に
// document tab が切り替わっても、切り替わった後の文書へ decode 結果を書き込んではならない。
// ハンドラ本体を HTML からそのまま抽出して実行し、回帰させないことを確認する。
{
  function buildEncodingHarness(startUnsaved) {
    const docs = new Map([
      ["document-a", { id: "document-a", unsaved: startUnsaved, buffer: new ArrayBuffer(4), bom: false, encoding: "utf-8", text: "before-a" }],
      ["document-b", { id: "document-b", unsaved: false, buffer: new ArrayBuffer(4), bom: false, encoding: "utf-8", text: "before-b" }],
    ]);
    const harness = {
      activeDocumentId: "document-a",
      encodingSelect: { value: "shift_jis" },
      bomCheckbox: { checked: false },
      lineEndingSelect: { value: "lf" },
      source: { value: "before-a" },
      t: (_group, key) => key,
      setStatus: () => {},
      setEncodingSelectValue: () => {},
      updateByteCountStatus: () => {},
      updateEditorMetrics: () => {},
      setEncodingControlsBusy: () => {},
      decodeMarkdownBuffer: () => ({ text: "auto-decoded", encoding: "utf-8", hasBom: false }),
      decodeBuffer: (_buffer, encoding) => `decoded-as-${encoding}`,
      detectLineEnding: () => "lf",
    };
    harness.getDocumentState = (id = harness.activeDocumentId) => docs.get(id) || null;
    harness.fileState = new Proxy({}, {
      get(_t, prop) {
        const state = docs.get(harness.activeDocumentId);
        return state ? state[prop] : undefined;
      },
      set(_t, prop, value) {
        const state = docs.get(harness.activeDocumentId);
        if (!state) return false;
        state[prop] = value;
        return true;
      },
    });
    harness.setLoadedMarkdownCalls = [];
    harness.setLoadedMarkdown = (text, encoding) => {
      harness.setLoadedMarkdownCalls.push({ documentId: harness.activeDocumentId, text, encoding });
      const state = docs.get(harness.activeDocumentId);
      state.text = text;
      state.encoding = encoding;
      state.unsaved = false;
    };
    const confirmDeferred = makeDeferred();
    harness.openConfirmDialog = () => confirmDeferred.promise;
    harness.resolveConfirm = confirmDeferred.resolve;
    const paintDeferred = makeDeferred();
    harness.waitForPaint = () => paintDeferred.promise;
    harness.resolvePaint = paintDeferred.resolve;
    vm.runInNewContext(`
      async function runEncodingChange() ${extractArrowFunctionBody('encodingSelect.addEventListener("change", async () => {')}
      this.runEncodingChange = runEncodingChange;
    `, harness);
    harness.docs = docs;
    return harness;
  }

  const driftedDuringConfirm = buildEncodingHarness(true);
  const pendingConfirmDrift = driftedDuringConfirm.runEncodingChange();
  driftedDuringConfirm.activeDocumentId = "document-b";
  driftedDuringConfirm.resolveConfirm(true);
  await pendingConfirmDrift;
  assert.equal(driftedDuringConfirm.setLoadedMarkdownCalls.length, 0, "leaving the tab during the encoding confirm skips applying the decode anywhere");
  assert.equal(driftedDuringConfirm.docs.get("document-a").text, "before-a", "the original document's text is untouched after the tab was left");
  assert.equal(driftedDuringConfirm.docs.get("document-b").text, "before-b", "the newly active document is not overwritten by another tab's encoding change");

  const driftedDuringPaint = buildEncodingHarness(false);
  const pendingPaintDrift = driftedDuringPaint.runEncodingChange();
  driftedDuringPaint.activeDocumentId = "document-b";
  driftedDuringPaint.resolvePaint();
  await pendingPaintDrift;
  assert.equal(driftedDuringPaint.setLoadedMarkdownCalls.length, 0, "leaving the tab while decoding skips applying the decode anywhere");
  assert.equal(driftedDuringPaint.docs.get("document-a").text, "before-a", "the original document's text is untouched after the tab was left mid-decode");

  const stableEncoding = buildEncodingHarness(false);
  const pendingStableEncoding = stableEncoding.runEncodingChange();
  stableEncoding.resolvePaint();
  await pendingStableEncoding;
  assert.deepEqual(
    stableEncoding.setLoadedMarkdownCalls,
    [{ documentId: "document-a", text: "decoded-as-shift_jis", encoding: "shift_jis" }],
    "confirming without switching tabs still applies the decoded text to the confirmed document"
  );
  assert.equal(stableEncoding.docs.get("document-a").text, "decoded-as-shift_jis", "the target document receives the decoded text");
}

const literalCalls = new Set();
for (const match of html.matchAll(/\bt\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/g)) {
  literalCalls.add(`${match[1]}.${match[2]}`);
}
const stringTableKeys = new Set(
  [...html.matchAll(/^\s*"((?:ui|status|preview|about)\.[^"]+)":\s*\[/gm)].map((match) => match[1])
);
const missingLiteralKeys = [...literalCalls].filter((key) => !stringTableKeys.has(key));
assert.deepEqual(missingLiteralKeys, [], "all literal i18n calls are registered");
assert.match(html, /if \(!licenseTextsOverlay\.hidden\) \{ closeLicenseTextsDialog\(\); return; \}/);
assert.match(html, /if \(!aboutOverlay\.hidden\) \{ closeAboutDialog\(\); return; \}/);
assert.match(html, /status\.noFilesMatchFilter/);
assert.match(html, /const documentStates = new Map\(\)/, "document states are stored independently");
assert.match(html, /const documentId = activeDocumentId;[\s\S]*const snapshot = \{[\s\S]*text: source\.value/, "save captures its target document before awaiting");

console.log("OK browser editor state contracts");
