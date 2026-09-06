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

console.log("OK browser editor state contracts");
