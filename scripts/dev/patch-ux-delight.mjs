/**
 * One-shot patch: inject UX delight features into offline-md-editor-viewer.html
 * Features: command palette, outline, zen, unsaved diff, recent files, char metrics
 * Run: node scripts/dev/patch-ux-delight.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "../../apps/browser/offline-md-editor-viewer.html");
let html = fs.readFileSync(htmlPath, "utf8");
const marker = "/* UX-DELIGHT-FEATURES */";
if (html.includes(marker)) {
  console.error("Already patched (marker found). Abort.");
  process.exit(1);
}

function mustReplace(from, to, label) {
  if (!html.includes(from)) {
    console.error(`FAIL: anchor not found: ${label}`);
    process.exit(1);
  }
  const next = html.replace(from, to);
  if (next === html) {
    console.error(`FAIL: replace no-op: ${label}`);
    process.exit(1);
  }
  html = next;
  console.log("ok:", label);
}

// ── CSS ──────────────────────────────────────────────────────────
const css = `
    /* UX-DELIGHT-FEATURES */
    .ux-toolbar-extra {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    body.zen-mode .toolbar-main > .btn,
    body.zen-mode .toolbar-main > .open-actions,
    body.zen-mode .toolbar-main > .drop,
    body.zen-mode .view-toggle-group,
    body.zen-mode .ux-toolbar-extra #outlineToggleBtn,
    body.zen-mode .ux-toolbar-extra #diffBtn,
    body.zen-mode .ux-toolbar-extra #recentFilesBtn {
      display: none !important;
    }
    body.zen-mode .file-list-panel,
    body.zen-mode #fileListSplitter {
      display: none !important;
    }
    body.zen-mode .layout {
      grid-template-columns: minmax(0, 1fr) !important;
    }
    body.zen-mode.has-zen-preview .layout {
      grid-template-columns: minmax(0, 1fr) 14px minmax(0, 1fr) !important;
    }
    body.zen-mode.has-zen-preview #splitter {
      display: block !important;
    }
    body.zen-mode .preview-panel.panel-hidden {
      display: none !important;
    }
    #zenExitBtn {
      display: none;
    }
    body.zen-mode #zenExitBtn {
      display: inline-flex;
    }
    body.zen-mode #zenModeBtn {
      display: none;
    }
    .editor-body {
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex: 1;
    }
    .editor-main-row {
      display: flex;
      flex: 1;
      min-height: 0;
      min-width: 0;
    }
    .outline-panel {
      width: 200px;
      min-width: 140px;
      max-width: 320px;
      flex-shrink: 0;
      border-right: 1px solid var(--line);
      background: var(--bg-elev);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .outline-panel.hidden {
      display: none;
    }
    .outline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--line);
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--muted);
      flex-shrink: 0;
    }
    .outline-list {
      overflow: auto;
      flex: 1;
      padding: 6px 0;
      min-height: 0;
    }
    .outline-item {
      display: block;
      width: 100%;
      text-align: left;
      border: 0;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 0.78rem;
      line-height: 1.35;
      padding: 5px 10px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .outline-item:hover,
    .outline-item:focus-visible {
      background: var(--accent-soft);
      outline: none;
    }
    .outline-item.is-active {
      background: var(--accent-soft);
      box-shadow: inset 3px 0 0 var(--accent);
      color: var(--text);
    }
    .outline-item[data-level="1"] { padding-left: 10px; font-weight: 700; }
    .outline-item[data-level="2"] { padding-left: 18px; }
    .outline-item[data-level="3"] { padding-left: 26px; }
    .outline-item[data-level="4"] { padding-left: 34px; }
    .outline-item[data-level="5"] { padding-left: 42px; }
    .outline-item[data-level="6"] { padding-left: 50px; }
    .outline-empty {
      padding: 12px 10px;
      color: var(--muted);
      font-size: 0.78rem;
    }
    .editor-main-row > .source-scroll-shell {
      flex: 1;
      min-width: 0;
    }
    .command-palette-overlay,
    .diff-overlay,
    .recent-overlay {
      z-index: 1200;
    }
    .command-palette-dialog {
      width: min(560px, 94vw);
      max-height: min(70vh, 520px);
      margin: 12vh auto 0;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .command-palette-input {
      width: 100%;
      border: 0;
      border-bottom: 1px solid var(--line);
      background: var(--input-bg);
      color: var(--text);
      font: inherit;
      font-size: 1rem;
      padding: 14px 16px;
      outline: none;
    }
    .command-palette-list {
      overflow: auto;
      max-height: 420px;
      padding: 6px;
    }
    .command-palette-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font: inherit;
      text-align: left;
      padding: 10px 12px;
      cursor: pointer;
    }
    .command-palette-item:hover,
    .command-palette-item.is-active {
      background: var(--accent-soft);
    }
    .command-palette-item .cmd-shortcut {
      color: var(--muted);
      font-size: 0.78rem;
      font-family: var(--mono-font);
      flex-shrink: 0;
    }
    .command-palette-empty {
      padding: 16px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .diff-dialog,
    .recent-dialog {
      width: min(920px, 96vw);
      max-height: min(82vh, 720px);
      margin: 8vh auto 0;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .recent-dialog {
      width: min(520px, 94vw);
      max-height: min(70vh, 520px);
    }
    .diff-header,
    .recent-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      flex-shrink: 0;
    }
    .diff-title,
    .recent-title {
      margin: 0;
      font-size: 1rem;
    }
    .diff-summary {
      color: var(--muted);
      font-size: 0.82rem;
      padding: 0 14px 8px;
    }
    .diff-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      min-height: 0;
      flex: 1;
      overflow: hidden;
      border-top: 1px solid var(--line);
    }
    .diff-col {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      border-right: 1px solid var(--line);
    }
    .diff-col:last-child { border-right: 0; }
    .diff-col-label {
      padding: 8px 12px;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--muted);
      border-bottom: 1px solid var(--line);
      background: var(--bg-elev);
    }
    .diff-pre {
      margin: 0;
      padding: 10px 12px;
      overflow: auto;
      flex: 1;
      font-family: var(--mono-font);
      font-size: 0.78rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text);
      background: var(--editable-bg);
    }
    .diff-line-add { background: rgba(46, 125, 79, 0.18); }
    .diff-line-del { background: rgba(179, 38, 30, 0.16); }
    .diff-line-chg { background: rgba(184, 134, 11, 0.16); }
    .diff-empty {
      padding: 24px;
      color: var(--muted);
      text-align: center;
    }
    .recent-list {
      overflow: auto;
      flex: 1;
      padding: 6px;
      min-height: 0;
    }
    .recent-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: 100%;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--text);
      font: inherit;
      text-align: left;
      padding: 10px 12px;
      cursor: pointer;
    }
    .recent-item:hover,
    .recent-item:focus-visible {
      background: var(--accent-soft);
      outline: none;
    }
    .recent-item-name { font-weight: 700; font-size: 0.92rem; }
    .recent-item-path {
      color: var(--muted);
      font-size: 0.76rem;
      font-family: var(--mono-font);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .recent-item-meta {
      color: var(--muted);
      font-size: 0.72rem;
    }
    .recent-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid var(--line);
    }
    .recent-empty {
      padding: 20px 12px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    @media (max-width: 720px) {
      .diff-body { grid-template-columns: 1fr; }
      .outline-panel { width: 150px; }
    }
`;

mustReplace(
  "    .source-header-left.mode-label-fallback .wrap-toggle-wrap {\n      gap: 4px;\n      margin-left: 4px;\n    }\n  </style>",
  `    .source-header-left.mode-label-fallback .wrap-toggle-wrap {\n      gap: 4px;\n      margin-left: 4px;\n    }\n${css}\n  </style>`,
  "CSS inject"
);

// ── Toolbar buttons ──────────────────────────────────────────────
mustReplace(
  `        <div class="save-status">
          <small id="statusText">`,
  `        <div class="ux-toolbar-extra" role="group" aria-label="Extra tools">
          <button id="commandPaletteBtn" class="icon-btn" type="button" aria-label="Command palette">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M8 11h6"/></svg>
          </button>
          <button id="outlineToggleBtn" class="icon-btn" type="button" aria-pressed="false" aria-label="Outline">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button id="zenModeBtn" class="icon-btn" type="button" aria-label="Focus mode">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
          </button>
          <button id="zenExitBtn" class="btn" type="button" aria-label="Exit focus mode">
            <span class="btn-label" id="zenExitLabel">Exit focus</span>
          </button>
          <button id="diffBtn" class="icon-btn" type="button" aria-label="Unsaved diff">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/><path d="M14 14h.01"/><path d="M10 10h.01"/></svg>
          </button>
          <button id="recentFilesBtn" class="icon-btn" type="button" aria-label="Recent files">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
        </div>
        <div class="save-status">
          <small id="statusText">`,
  "Toolbar buttons"
);

// ── Overlays (command palette / diff / recent) ───────────────────
mustReplace(
  `    <div id="confirmOverlay" class="confirm-overlay modal-overlay" hidden>
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="confirm-header">
          <h2 id="confirmTitle" class="confirm-title"></h2>
        </div>
        <div class="confirm-body">
          <p id="confirmMessage" class="confirm-message"></p>
          <div class="confirm-actions">
            <button id="confirmCancelBtn" class="btn" type="button">Cancel</button>
            <button id="confirmOkBtn" class="btn" type="button">OK</button>
          </div>
        </div>
      </section>
    </div>

    <div class="layout" id="layout">`,
  `    <div id="confirmOverlay" class="confirm-overlay modal-overlay" hidden>
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="confirm-header">
          <h2 id="confirmTitle" class="confirm-title"></h2>
        </div>
        <div class="confirm-body">
          <p id="confirmMessage" class="confirm-message"></p>
          <div class="confirm-actions">
            <button id="confirmCancelBtn" class="btn" type="button">Cancel</button>
            <button id="confirmOkBtn" class="btn" type="button">OK</button>
          </div>
        </div>
      </section>
    </div>

    <div id="commandPaletteOverlay" class="command-palette-overlay modal-overlay" hidden>
      <section class="command-palette-dialog" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle">
        <h2 id="commandPaletteTitle" class="visually-hidden">Command palette</h2>
        <input id="commandPaletteInput" class="command-palette-input" type="text" autocomplete="off" spellcheck="false" />
        <div id="commandPaletteList" class="command-palette-list" role="listbox"></div>
      </section>
    </div>

    <div id="diffOverlay" class="diff-overlay modal-overlay" hidden>
      <section class="diff-dialog" role="dialog" aria-modal="true" aria-labelledby="diffTitle">
        <div class="diff-header">
          <h2 id="diffTitle" class="diff-title"></h2>
          <button id="diffCloseBtn" class="icon-btn" type="button" aria-label="Close">
            <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div id="diffSummary" class="diff-summary"></div>
        <div id="diffBody" class="diff-body">
          <div class="diff-col">
            <div id="diffDiskLabel" class="diff-col-label"></div>
            <pre id="diffDiskPre" class="diff-pre"></pre>
          </div>
          <div class="diff-col">
            <div id="diffEditedLabel" class="diff-col-label"></div>
            <pre id="diffEditedPre" class="diff-pre"></pre>
          </div>
        </div>
        <div id="diffEmpty" class="diff-empty hidden"></div>
      </section>
    </div>

    <div id="recentOverlay" class="recent-overlay modal-overlay" hidden>
      <section class="recent-dialog" role="dialog" aria-modal="true" aria-labelledby="recentTitle">
        <div class="recent-header">
          <h2 id="recentTitle" class="recent-title"></h2>
          <button id="recentCloseBtn" class="icon-btn" type="button" aria-label="Close">
            <svg class="close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div id="recentList" class="recent-list"></div>
        <div class="recent-footer">
          <button id="recentClearBtn" class="btn" type="button"></button>
        </div>
      </section>
    </div>

    <div class="layout" id="layout">`,
  "Overlays"
);

// ── Outline panel + wrap editor body ─────────────────────────────
mustReplace(
  `          <div class="source-scroll-shell">
            <div id="lineNumberGutter" class="line-number-gutter" aria-label="Line numbers">
              <div id="lineNumberTrack" class="line-number-track"></div>
            </div>
            <div class="source-editor-layer">
              <pre id="sourceHighlight" class="source-highlight" aria-hidden="true"></pre>
              <pre id="sourceFindHighlight" class="source-find-highlight" aria-hidden="true"></pre>
              <pre id="sourceSelectionMirror" class="source-selection-mirror" aria-hidden="true"></pre>
              <textarea id="source" spellcheck="false"></textarea>
              <div id="sourceEofMarker" class="source-eof-marker" aria-hidden="true">[EOF]</div>
            </div>
          </div>
        </div>`,
  `          <div class="editor-main-row">
            <aside id="outlinePanel" class="outline-panel hidden" aria-label="Document outline">
              <div class="outline-header">
                <span id="outlineHeaderLabel"></span>
                <button id="outlineCloseBtn" class="icon-btn" type="button" aria-label="Close outline">
                  <svg class="close-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div id="outlineList" class="outline-list"></div>
            </aside>
            <div class="source-scroll-shell">
              <div id="lineNumberGutter" class="line-number-gutter" aria-label="Line numbers">
                <div id="lineNumberTrack" class="line-number-track"></div>
              </div>
              <div class="source-editor-layer">
                <pre id="sourceHighlight" class="source-highlight" aria-hidden="true"></pre>
                <pre id="sourceFindHighlight" class="source-find-highlight" aria-hidden="true"></pre>
                <pre id="sourceSelectionMirror" class="source-selection-mirror" aria-hidden="true"></pre>
                <textarea id="source" spellcheck="false"></textarea>
                <div id="sourceEofMarker" class="source-eof-marker" aria-hidden="true">[EOF]</div>
              </div>
            </div>
          </div>
        </div>`,
  "Outline panel HTML"
);

// ── Status metrics ───────────────────────────────────────────────
mustReplace(
  `          <span id="totalLinesStatus" class="status-metric"></span>
          <span id="byteCountStatus" class="status-metric"></span>
        </div>`,
  `          <span id="totalLinesStatus" class="status-metric"></span>
          <span id="byteCountStatus" class="status-metric"></span>
          <span id="charCountStatus" class="status-metric"></span>
          <span id="wordCountStatus" class="status-metric"></span>
          <span id="readingTimeStatus" class="status-metric"></span>
          <span id="selectionCountStatus" class="status-metric" style="display:none"></span>
        </div>`,
  "Status metrics HTML"
);

// ── visually-hidden utility if missing ───────────────────────────
if (!html.includes(".visually-hidden")) {
  mustReplace(
    "/* UX-DELIGHT-FEATURES */",
    `/* UX-DELIGHT-FEATURES */
    .visually-hidden {
      position: absolute !important;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0);
      white-space: nowrap; border: 0;
    }`,
    "visually-hidden utility"
  );
}

// ── Element refs ─────────────────────────────────────────────────
mustReplace(
  `      const totalLinesStatus = document.getElementById("totalLinesStatus");
      const byteCountStatus = document.getElementById("byteCountStatus");`,
  `      const totalLinesStatus = document.getElementById("totalLinesStatus");
      const byteCountStatus = document.getElementById("byteCountStatus");
      const charCountStatus = document.getElementById("charCountStatus");
      const wordCountStatus = document.getElementById("wordCountStatus");
      const readingTimeStatus = document.getElementById("readingTimeStatus");
      const selectionCountStatus = document.getElementById("selectionCountStatus");
      const commandPaletteBtn = document.getElementById("commandPaletteBtn");
      const outlineToggleBtn = document.getElementById("outlineToggleBtn");
      const zenModeBtn = document.getElementById("zenModeBtn");
      const zenExitBtn = document.getElementById("zenExitBtn");
      const zenExitLabel = document.getElementById("zenExitLabel");
      const diffBtn = document.getElementById("diffBtn");
      const recentFilesBtn = document.getElementById("recentFilesBtn");
      const outlinePanel = document.getElementById("outlinePanel");
      const outlineHeaderLabel = document.getElementById("outlineHeaderLabel");
      const outlineCloseBtn = document.getElementById("outlineCloseBtn");
      const outlineList = document.getElementById("outlineList");
      const commandPaletteOverlay = document.getElementById("commandPaletteOverlay");
      const commandPaletteInput = document.getElementById("commandPaletteInput");
      const commandPaletteList = document.getElementById("commandPaletteList");
      const commandPaletteTitle = document.getElementById("commandPaletteTitle");
      const diffOverlay = document.getElementById("diffOverlay");
      const diffTitle = document.getElementById("diffTitle");
      const diffCloseBtn = document.getElementById("diffCloseBtn");
      const diffSummary = document.getElementById("diffSummary");
      const diffBody = document.getElementById("diffBody");
      const diffEmpty = document.getElementById("diffEmpty");
      const diffDiskLabel = document.getElementById("diffDiskLabel");
      const diffEditedLabel = document.getElementById("diffEditedLabel");
      const diffDiskPre = document.getElementById("diffDiskPre");
      const diffEditedPre = document.getElementById("diffEditedPre");
      const recentOverlay = document.getElementById("recentOverlay");
      const recentTitle = document.getElementById("recentTitle");
      const recentCloseBtn = document.getElementById("recentCloseBtn");
      const recentList = document.getElementById("recentList");
      const recentClearBtn = document.getElementById("recentClearBtn");`,
  "Element refs"
);

// ── Storage keys + fileState.baselineText ────────────────────────
mustReplace(
  `      const STORAGE_LAST_DIRECTORY_TAURI_KEY = STORAGE_KEY_PREFIX + "last_directory_tauri_path";`,
  `      const STORAGE_LAST_DIRECTORY_TAURI_KEY = STORAGE_KEY_PREFIX + "last_directory_tauri_path";
      const STORAGE_RECENT_FILES_KEY = STORAGE_KEY_PREFIX + "recent_files";
      const STORAGE_OUTLINE_VISIBLE_KEY = STORAGE_KEY_PREFIX + "outline_visible";
      const RECENT_FILES_MAX = 15;
      const READING_CHARS_PER_MIN = 500;`,
  "Storage keys"
);

mustReplace(
  `        previewAutoCollapsed: false,    // 旧: previewAutoCollapsed（true while a non-Markdown file is loaded）
      };`,
  `        previewAutoCollapsed: false,    // 旧: previewAutoCollapsed（true while a non-Markdown file is loaded）
        baselineText: "",               // last loaded/saved text for unsaved diff
      };`,
  "fileState.baselineText"
);

// ── i18n strings ─────────────────────────────────────────────────
// Helper: en + ja full, others use English for speed but readable.
function row(en, ja) {
  // LANGS: en, ja, zh-TW, zh-CN, es, de, ko, pt-BR, ru, vi, fr, it, id
  return JSON.stringify([en, ja, en, en, en, en, en, en, en, en, en, en, en]);
}

const i18nBlock = `
        // ===== UX delight (command palette / outline / zen / diff / recent / metrics) =====
        "ui.commandPalette": ${row("Command palette", "コマンドパレット")},
        "ui.commandPalettePlaceholder": ${row("Type a command…", "コマンドを入力…")},
        "ui.commandPaletteEmpty": ${row("No matching commands", "一致するコマンドがありません")},
        "ui.outlineTitle": ${row("Outline", "アウトライン")},
        "ui.outlineEmpty": ${row("No headings", "見出しがありません")},
        "ui.outlineToggle": ${row("Toggle outline", "アウトライン表示切替")},
        "ui.zenMode": ${row("Focus mode", "フォーカスモード")},
        "ui.zenExit": ${row("Exit focus", "フォーカス解除")},
        "ui.diffTitle": ${row("Unsaved changes", "未保存の変更")},
        "ui.diffDisk": ${row("Last saved / loaded", "保存時 / 読み込み時")},
        "ui.diffEdited": ${row("Current buffer", "編集中")},
        "ui.diffNoChanges": ${row("No differences", "差分はありません")},
        "ui.diffNoBaseline": ${row("No baseline to compare (new unsaved buffer).", "比較元がありません（未保存の新規バッファ）。")},
        "ui.diffSummary": ${row("+{add} / ~{chg} / -{del}", "+{add} / ~{chg} / -{del}")},
        "ui.recentFiles": ${row("Recent files", "最近のファイル")},
        "ui.recentFilesEmpty": ${row("No recent files yet", "最近のファイルはまだありません")},
        "ui.recentFilesClear": ${row("Clear list", "一覧をクリア")},
        "ui.recentOpenFailed": ${row("Could not reopen. Use Open to pick the file again.", "再度開けませんでした。開くからファイルを選び直してください。")},
        "ui.charCount": ${row("Chars {count}", "文字数 {count}")},
        "ui.wordCount": ${row("Words {count}", "単語数 {count}")},
        "ui.readingTime": ${row("~{min} min", "読了 約 {min} 分")},
        "ui.selectionCount": ${row("Sel {count}", "選択 {count}")},
        "ui.cmdNew": ${row("New file", "新規作成")},
        "ui.cmdOpen": ${row("Open file", "ファイルを開く")},
        "ui.cmdFolder": ${row("Open folder", "フォルダを開く")},
        "ui.cmdSave": ${row("Save", "保存")},
        "ui.cmdSaveAs": ${row("Save as", "別名で保存")},
        "ui.cmdFind": ${row("Find", "検索")},
        "ui.cmdReplace": ${row("Replace", "置換")},
        "ui.cmdOutline": ${row("Toggle outline", "アウトライン切替")},
        "ui.cmdZen": ${row("Toggle focus mode", "フォーカスモード切替")},
        "ui.cmdDiff": ${row("Show unsaved diff", "未保存 diff を表示")},
        "ui.cmdRecent": ${row("Recent files", "最近のファイル")},
        "ui.cmdThemeDark": ${row("Theme: Dark", "テーマ: ダーク")},
        "ui.cmdThemeBlue": ${row("Theme: Blue", "テーマ: ブルー")},
        "ui.cmdThemeLight": ${row("Theme: Light", "テーマ: ライト")},
        "ui.cmdToggleFileList": ${row("Toggle file list", "ファイル一覧の表示切替")},
        "ui.cmdTogglePreview": ${row("Toggle preview", "プレビューの表示切替")},
        "status.recentOpened": ${row("Reopened recent file", "最近のファイルを開きました")},
`;

mustReplace(
  `        "ui.totalLines": ["Lines {count}", "総行数 {count}", "總行數 {count}", "总行数 {count}", "Líneas {count}", "Zeilen {count}", "총 줄 {count}", "Linhas {count}", "Строк {count}", "Dòng {count}", "Lignes {count}", "Righe {count}", "Baris {count}"],
        "ui.totalBytes": ["Bytes {count}", "バイト数 {count}", "位元組 {count}", "字节 {count}", "Bytes {count}", "Bytes {count}", "바이트 {count}", "Bytes {count}", "Байт {count}", "Byte {count}", "Octets {count}", "Byte {count}", "Byte {count}"],`,
  `        "ui.totalLines": ["Lines {count}", "総行数 {count}", "總行數 {count}", "总行数 {count}", "Líneas {count}", "Zeilen {count}", "총 줄 {count}", "Linhas {count}", "Строк {count}", "Dòng {count}", "Lignes {count}", "Righe {count}", "Baris {count}"],
        "ui.totalBytes": ["Bytes {count}", "バイト数 {count}", "位元組 {count}", "字节 {count}", "Bytes {count}", "Bytes {count}", "바이트 {count}", "Bytes {count}", "Байт {count}", "Byte {count}", "Octets {count}", "Byte {count}", "Byte {count}"],
${i18nBlock}`,
  "i18n keys"
);

// ── Core JS logic injection before window keydown ────────────────
const logic = `
      /* UX-DELIGHT-FEATURES */
      let outlineVisible = localStorage.getItem(STORAGE_OUTLINE_VISIBLE_KEY) === "true";
      let outlineRaf = 0;
      let zenActive = false;
      let zenSnapshot = null;
      let commandPaletteActiveIndex = 0;
      let commandPaletteCommands = [];

      function countWords(text) {
        const s = String(text || "");
        if (!s) return 0;
        const latin = s.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
        const cjk = s.match(/[\\u3040-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]/g);
        return (latin ? latin.length : 0) + (cjk ? cjk.reduce((n, chunk) => n + chunk.length, 0) : 0);
      }

      function updateTextMetrics(text = source.value) {
        if (!charCountStatus) return;
        const chars = text.length;
        const words = countWords(text);
        const minutes = chars === 0 ? 0 : Math.max(1, Math.ceil(chars / READING_CHARS_PER_MIN));
        charCountStatus.textContent = t("ui", "charCount").replace("{count}", chars.toLocaleString());
        wordCountStatus.textContent = t("ui", "wordCount").replace("{count}", words.toLocaleString());
        readingTimeStatus.textContent = t("ui", "readingTime").replace("{min}", String(minutes));
        const selStart = source.selectionStart || 0;
        const selEnd = source.selectionEnd || 0;
        const selLen = Math.abs(selEnd - selStart);
        if (selLen > 0 && document.activeElement === source) {
          selectionCountStatus.style.display = "";
          selectionCountStatus.textContent = t("ui", "selectionCount").replace("{count}", selLen.toLocaleString());
        } else {
          selectionCountStatus.style.display = "none";
          selectionCountStatus.textContent = "";
        }
      }

      function setBaselineText(text) {
        fileState.baselineText = String(text ?? "");
      }

      function loadRecentFiles() {
        try {
          const raw = localStorage.getItem(STORAGE_RECENT_FILES_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(parsed)) return [];
          return parsed
            .filter((item) => item && typeof item === "object" && typeof item.name === "string")
            .slice(0, RECENT_FILES_MAX);
        } catch (_err) {
          return [];
        }
      }

      function saveRecentFiles(list) {
        safeLocalStorageSet(STORAGE_RECENT_FILES_KEY, JSON.stringify(list.slice(0, RECENT_FILES_MAX)));
      }

      function rememberRecentFile(entry) {
        if (!entry || !entry.name) return;
        const next = {
          name: entry.name,
          path: entry.path || "",
          tauriPath: entry.tauriPath || "",
          openedAt: Date.now()
        };
        if (!next.path && !next.tauriPath && !next.name) return;
        const prev = loadRecentFiles().filter((item) => {
          if (next.tauriPath && item.tauriPath) return item.tauriPath !== next.tauriPath;
          if (next.path && item.path) return item.path !== next.path;
          return !(item.name === next.name && !item.tauriPath && !item.path);
        });
        prev.unshift(next);
        saveRecentFiles(prev);
      }

      function rememberCurrentAsRecent() {
        const name = currentFileName.textContent || (fileState.handle && fileState.handle.name) || "";
        if (!name) return;
        const tauriPath = (fileState.handle && fileState.handle.tauriPath) || dirState.entryTauriPath || "";
        const path = dirState.entryPath || "";
        rememberRecentFile({ name, path, tauriPath });
      }

      function parseOutlineHeadings(text) {
        const lines = String(text || "").split(/\\r\\n|\\r|\\n/);
        const items = [];
        let offset = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const m = /^(#{1,6})\\s+(.+?)\\s*$/.exec(line);
          if (m) {
            items.push({
              level: m[1].length,
              text: m[2].replace(/\\s+#*\\s*$/, "").trim() || m[2],
              line: i + 1,
              start: offset
            });
          }
          offset += line.length + 1;
        }
        return items;
      }

      function renderOutline() {
        if (!outlineList) return;
        outlineList.replaceChildren();
        if (!fileState.hasContent) {
          const empty = document.createElement("div");
          empty.className = "outline-empty";
          empty.textContent = t("ui", "outlineEmpty");
          outlineList.appendChild(empty);
          return;
        }
        const items = parseOutlineHeadings(source.value);
        if (!items.length) {
          const empty = document.createElement("div");
          empty.className = "outline-empty";
          empty.textContent = t("ui", "outlineEmpty");
          outlineList.appendChild(empty);
          return;
        }
        const caret = source.selectionStart || 0;
        let activeIdx = 0;
        for (let i = 0; i < items.length; i++) {
          if (items[i].start <= caret) activeIdx = i;
        }
        items.forEach((item, idx) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "outline-item" + (idx === activeIdx ? " is-active" : "");
          btn.dataset.level = String(item.level);
          btn.dataset.start = String(item.start);
          btn.dataset.line = String(item.line);
          btn.textContent = item.text;
          btn.title = item.text;
          btn.addEventListener("click", () => {
            const start = Number(btn.dataset.start) || 0;
            source.focus({ preventScroll: true });
            source.setSelectionRange(start, start);
            const line = Number(btn.dataset.line) || 1;
            const approx = (line - 1) * (parseFloat(getComputedStyle(source).lineHeight) || 20);
            source.scrollTop = Math.max(0, approx - source.clientHeight * 0.25);
            updateEditorMetrics();
            renderOutline();
          });
          outlineList.appendChild(btn);
        });
      }

      function scheduleOutlineRefresh() {
        if (!outlineVisible) return;
        if (outlineRaf) cancelAnimationFrame(outlineRaf);
        outlineRaf = requestAnimationFrame(() => {
          outlineRaf = 0;
          renderOutline();
        });
      }

      function setOutlineVisible(visible) {
        outlineVisible = !!visible && fileState.hasContent;
        if (outlinePanel) outlinePanel.classList.toggle("hidden", !outlineVisible);
        if (outlineToggleBtn) {
          outlineToggleBtn.setAttribute("aria-pressed", outlineVisible ? "true" : "false");
          outlineToggleBtn.classList.toggle("active", outlineVisible);
        }
        safeLocalStorageSet(STORAGE_OUTLINE_VISIBLE_KEY, outlineVisible ? "true" : "false");
        if (outlineVisible) renderOutline();
      }

      function toggleOutline() {
        setOutlineVisible(!outlineVisible);
      }

      function enterZenMode() {
        if (zenActive) return;
        zenSnapshot = {
          cardVisibility: { ...cardVisibility },
          outlineVisible
        };
        zenActive = true;
        document.body.classList.add("zen-mode");
        document.body.classList.toggle("has-zen-preview", !!cardVisibility.preview && !fileState.previewAutoCollapsed);
        // Force source visible; hide file list via CSS; keep preview if was on
        cardVisibility = { fileList: false, source: true, preview: !!cardVisibility.preview };
        setOutlineVisible(false);
        updateCardLayout();
        closeAppMenu();
        closeCommandPalette();
        closeRecentFiles();
        closeDiffView();
      }

      function exitZenMode() {
        if (!zenActive) return;
        zenActive = false;
        document.body.classList.remove("zen-mode", "has-zen-preview");
        if (zenSnapshot) {
          cardVisibility = { ...zenSnapshot.cardVisibility };
          saveCardVisibility();
          setOutlineVisible(!!zenSnapshot.outlineVisible);
        }
        zenSnapshot = null;
        updateCardLayout();
      }

      function toggleZenMode() {
        if (zenActive) exitZenMode();
        else enterZenMode();
      }

      function lcsDiffLines(aLines, bLines) {
        // Bounded LCS for readability; cap to avoid O(n*m) blowups on huge files.
        const MAX = 2000;
        const a = aLines.length > MAX ? aLines.slice(0, MAX) : aLines;
        const b = bLines.length > MAX ? bLines.slice(0, MAX) : bLines;
        const n = a.length;
        const m = b.length;
        const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
        for (let i = 1; i <= n; i++) {
          for (let j = 1; j <= m; j++) {
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
        const ops = [];
        let i = n;
        let j = m;
        while (i > 0 || j > 0) {
          if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            ops.push({ type: "eq", left: a[i - 1], right: b[j - 1] });
            i--; j--;
          } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.push({ type: "add", left: "", right: b[j - 1] });
            j--;
          } else {
            ops.push({ type: "del", left: a[i - 1], right: "" });
            i--;
          }
        }
        ops.reverse();
        if (aLines.length > MAX || bLines.length > MAX) {
          ops.push({ type: "eq", left: "…", right: "…" });
        }
        return ops;
      }

      function renderDiffSide(pre, lines, classFor) {
        pre.replaceChildren();
        lines.forEach((line) => {
          const div = document.createElement("div");
          if (line.cls) div.className = line.cls;
          div.textContent = line.text.length ? line.text : " ";
          pre.appendChild(div);
        });
      }

      function openDiffView() {
        if (!fileState.hasContent) return;
        closeCommandPalette();
        closeRecentFiles();
        diffTitle.textContent = t("ui", "diffTitle");
        diffDiskLabel.textContent = t("ui", "diffDisk");
        diffEditedLabel.textContent = t("ui", "diffEdited");
        const baseline = fileState.baselineText;
        const current = source.value;
        if (baseline === "" && current === "") {
          diffBody.classList.add("hidden");
          diffEmpty.classList.remove("hidden");
          diffEmpty.textContent = t("ui", "diffNoChanges");
          diffSummary.textContent = "";
          diffOverlay.hidden = false;
          return;
        }
        if (baseline === current) {
          diffBody.classList.add("hidden");
          diffEmpty.classList.remove("hidden");
          diffEmpty.textContent = t("ui", "diffNoChanges");
          diffSummary.textContent = t("ui", "diffSummary").replace("{add}", "0").replace("{chg}", "0").replace("{del}", "0");
          diffOverlay.hidden = false;
          return;
        }
        if (baseline === "" && fileState.unsaved && !fileState.handle) {
          // new buffer — still show vs empty
        }
        diffBody.classList.remove("hidden");
        diffEmpty.classList.add("hidden");
        const aLines = baseline.split(/\\r\\n|\\r|\\n/);
        const bLines = current.split(/\\r\\n|\\r|\\n/);
        const ops = lcsDiffLines(aLines, bLines);
        let add = 0, del = 0, chg = 0;
        const left = [];
        const right = [];
        for (let k = 0; k < ops.length; k++) {
          const op = ops[k];
          if (op.type === "eq") {
            left.push({ text: op.left, cls: "" });
            right.push({ text: op.right, cls: "" });
          } else if (op.type === "add") {
            add++;
            left.push({ text: "", cls: "" });
            right.push({ text: op.right, cls: "diff-line-add" });
          } else if (op.type === "del") {
            // pair adjacent del+add as change when possible
            if (ops[k + 1] && ops[k + 1].type === "add") {
              chg++;
              left.push({ text: op.left, cls: "diff-line-chg" });
              right.push({ text: ops[k + 1].right, cls: "diff-line-chg" });
              k++;
            } else {
              del++;
              left.push({ text: op.left, cls: "diff-line-del" });
              right.push({ text: "", cls: "" });
            }
          }
        }
        diffSummary.textContent = t("ui", "diffSummary")
          .replace("{add}", String(add))
          .replace("{chg}", String(chg))
          .replace("{del}", String(del));
        renderDiffSide(diffDiskPre, left);
        renderDiffSide(diffEditedPre, right);
        diffOverlay.hidden = false;
        diffCloseBtn.focus();
      }

      function closeDiffView() {
        if (diffOverlay) diffOverlay.hidden = true;
      }

      function openRecentFiles() {
        closeCommandPalette();
        closeDiffView();
        recentTitle.textContent = t("ui", "recentFiles");
        recentClearBtn.textContent = t("ui", "recentFilesClear");
        recentList.replaceChildren();
        const items = loadRecentFiles();
        if (!items.length) {
          const empty = document.createElement("div");
          empty.className = "recent-empty";
          empty.textContent = t("ui", "recentFilesEmpty");
          recentList.appendChild(empty);
        } else {
          items.forEach((item) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "recent-item";
            const nameEl = document.createElement("span");
            nameEl.className = "recent-item-name";
            nameEl.textContent = item.name;
            const pathEl = document.createElement("span");
            pathEl.className = "recent-item-path";
            pathEl.textContent = item.tauriPath || item.path || item.name;
            const metaEl = document.createElement("span");
            metaEl.className = "recent-item-meta";
            metaEl.textContent = item.openedAt ? new Date(item.openedAt).toLocaleString() : "";
            btn.appendChild(nameEl);
            btn.appendChild(pathEl);
            btn.appendChild(metaEl);
            btn.addEventListener("click", () => {
              openRecentFileEntry(item).catch((err) => {
                setStatus(t("ui", "recentOpenFailed") + (err && err.message ? " " + err.message : ""), true);
              });
            });
            recentList.appendChild(btn);
          });
        }
        recentOverlay.hidden = false;
      }

      function closeRecentFiles() {
        if (recentOverlay) recentOverlay.hidden = true;
      }

      async function openRecentFileEntry(item) {
        if (!confirmDiscardUnsavedChanges()) return;
        closeRecentFiles();
        if (item.tauriPath && isTauri) {
          await loadTauriFilePath(item.tauriPath, { statusMessage: t("status", "recentOpened") });
          return;
        }
        if (item.path && dirState.handle) {
          const flat = flattenTreeFiles(dirState.files);
          const hit = flat.find((e) => e.path === item.path || e.name === item.name);
          if (hit) {
            await loadDirectoryEntry(hit);
            setStatus(t("status", "recentOpened"), false);
            return;
          }
        }
        // Fallback: open picker
        setStatus(t("ui", "recentOpenFailed"), true);
        await openWithFsAccess();
      }

      function getCommandPaletteCommands() {
        return [
          { id: "new", label: t("ui", "cmdNew"), shortcut: "", run: () => newBtn.click() },
          { id: "open", label: t("ui", "cmdOpen"), shortcut: "", run: () => openBtn.click() },
          { id: "folder", label: t("ui", "cmdFolder"), shortcut: "", run: () => folderBtn.click() },
          { id: "save", label: t("ui", "cmdSave"), shortcut: "Ctrl+S", run: () => { if (!saveBtn.disabled) saveBtn.click(); } },
          { id: "saveAs", label: t("ui", "cmdSaveAs"), shortcut: "Ctrl+Shift+S", run: () => { if (!saveAsBtn.disabled) saveAsBtn.click(); } },
          { id: "find", label: t("ui", "cmdFind"), shortcut: "Ctrl+F", run: () => openFindBar(false) },
          { id: "replace", label: t("ui", "cmdReplace"), shortcut: "Ctrl+H", run: () => openFindBar(true) },
          { id: "outline", label: t("ui", "cmdOutline"), shortcut: "", run: () => toggleOutline() },
          { id: "zen", label: t("ui", "cmdZen"), shortcut: "", run: () => toggleZenMode() },
          { id: "diff", label: t("ui", "cmdDiff"), shortcut: "", run: () => openDiffView() },
          { id: "recent", label: t("ui", "cmdRecent"), shortcut: "", run: () => openRecentFiles() },
          { id: "themeDark", label: t("ui", "cmdThemeDark"), shortcut: "", run: () => applyTheme("dark") },
          { id: "themeBlue", label: t("ui", "cmdThemeBlue"), shortcut: "", run: () => applyTheme("blue") },
          { id: "themeLight", label: t("ui", "cmdThemeLight"), shortcut: "", run: () => applyTheme("light") },
          { id: "toggleFileList", label: t("ui", "cmdToggleFileList"), shortcut: "", run: () => setCardVisibility("fileList", !cardVisibility.fileList) },
          { id: "togglePreview", label: t("ui", "cmdTogglePreview"), shortcut: "", run: () => setCardVisibility("preview", !cardVisibility.preview) },
        ];
      }

      function filterCommands(query) {
        const q = String(query || "").trim().toLowerCase();
        const all = getCommandPaletteCommands();
        if (!q) return all;
        return all.filter((cmd) => cmd.label.toLowerCase().includes(q) || cmd.id.includes(q));
      }

      function renderCommandPaletteList() {
        commandPaletteCommands = filterCommands(commandPaletteInput.value);
        commandPaletteList.replaceChildren();
        if (!commandPaletteCommands.length) {
          const empty = document.createElement("div");
          empty.className = "command-palette-empty";
          empty.textContent = t("ui", "commandPaletteEmpty");
          commandPaletteList.appendChild(empty);
          return;
        }
        if (commandPaletteActiveIndex >= commandPaletteCommands.length) commandPaletteActiveIndex = 0;
        if (commandPaletteActiveIndex < 0) commandPaletteActiveIndex = commandPaletteCommands.length - 1;
        commandPaletteCommands.forEach((cmd, idx) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "command-palette-item" + (idx === commandPaletteActiveIndex ? " is-active" : "");
          btn.setAttribute("role", "option");
          btn.setAttribute("aria-selected", idx === commandPaletteActiveIndex ? "true" : "false");
          const label = document.createElement("span");
          label.textContent = cmd.label;
          btn.appendChild(label);
          if (cmd.shortcut) {
            const sc = document.createElement("span");
            sc.className = "cmd-shortcut";
            sc.textContent = cmd.shortcut;
            btn.appendChild(sc);
          }
          btn.addEventListener("click", () => runCommandPaletteItem(idx));
          commandPaletteList.appendChild(btn);
        });
        const active = commandPaletteList.querySelector(".is-active");
        if (active) active.scrollIntoView({ block: "nearest" });
      }

      function runCommandPaletteItem(idx) {
        const cmd = commandPaletteCommands[idx];
        closeCommandPalette();
        if (cmd && typeof cmd.run === "function") {
          try { cmd.run(); } catch (err) {
            setStatus(String(err && err.message ? err.message : err), true);
          }
        }
      }

      function openCommandPalette() {
        closeDiffView();
        closeRecentFiles();
        closeAppMenu();
        commandPaletteTitle.textContent = t("ui", "commandPalette");
        commandPaletteInput.placeholder = t("ui", "commandPalettePlaceholder");
        commandPaletteInput.value = "";
        commandPaletteActiveIndex = 0;
        commandPaletteOverlay.hidden = false;
        renderCommandPaletteList();
        window.setTimeout(() => commandPaletteInput.focus(), 0);
      }

      function closeCommandPalette() {
        if (commandPaletteOverlay) commandPaletteOverlay.hidden = true;
      }

      function applyUxDelightLanguage() {
        setUiTooltip(commandPaletteBtn, t("ui", "commandPalette") + " (Ctrl+K)");
        setUiTooltip(outlineToggleBtn, t("ui", "outlineToggle"));
        setUiTooltip(zenModeBtn, t("ui", "zenMode"));
        setUiTooltip(diffBtn, t("ui", "diffTitle"));
        setUiTooltip(recentFilesBtn, t("ui", "recentFiles"));
        zenExitLabel.textContent = t("ui", "zenExit");
        setUiTooltip(zenExitBtn, t("ui", "zenExit"));
        outlineHeaderLabel.textContent = t("ui", "outlineTitle");
        setUiTooltip(outlineCloseBtn, t("ui", "closeSource"));
        setUiTooltip(diffCloseBtn, t("ui", "findClose"));
        setUiTooltip(recentCloseBtn, t("ui", "findClose"));
        recentClearBtn.textContent = t("ui", "recentFilesClear");
        if (!commandPaletteOverlay.hidden) {
          commandPaletteTitle.textContent = t("ui", "commandPalette");
          commandPaletteInput.placeholder = t("ui", "commandPalettePlaceholder");
          renderCommandPaletteList();
        }
        if (!diffOverlay.hidden) openDiffView();
        if (!recentOverlay.hidden) openRecentFiles();
        if (outlineVisible) renderOutline();
        updateTextMetrics();
      }

      commandPaletteBtn.addEventListener("click", () => openCommandPalette());
      outlineToggleBtn.addEventListener("click", () => toggleOutline());
      outlineCloseBtn.addEventListener("click", () => setOutlineVisible(false));
      zenModeBtn.addEventListener("click", () => toggleZenMode());
      zenExitBtn.addEventListener("click", () => exitZenMode());
      diffBtn.addEventListener("click", () => openDiffView());
      diffCloseBtn.addEventListener("click", () => closeDiffView());
      recentFilesBtn.addEventListener("click", () => openRecentFiles());
      recentCloseBtn.addEventListener("click", () => closeRecentFiles());
      recentClearBtn.addEventListener("click", () => {
        saveRecentFiles([]);
        openRecentFiles();
      });
      commandPaletteOverlay.addEventListener("click", (e) => {
        if (e.target === commandPaletteOverlay) closeCommandPalette();
      });
      diffOverlay.addEventListener("click", (e) => {
        if (e.target === diffOverlay) closeDiffView();
      });
      recentOverlay.addEventListener("click", (e) => {
        if (e.target === recentOverlay) closeRecentFiles();
      });
      commandPaletteInput.addEventListener("input", () => {
        commandPaletteActiveIndex = 0;
        renderCommandPaletteList();
      });
      commandPaletteInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          commandPaletteActiveIndex += 1;
          renderCommandPaletteList();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          commandPaletteActiveIndex -= 1;
          renderCommandPaletteList();
        } else if (e.key === "Enter") {
          e.preventDefault();
          runCommandPaletteItem(commandPaletteActiveIndex);
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeCommandPalette();
        }
      });
`;

mustReplace(
  `      window.addEventListener("keydown", (e) => {
        // --- Escape: close dialogs / bars / menus ---
        if (e.key === "Escape") {
          if (!confirmOverlay.hidden) { closeConfirmDialog(false); return; }
          if (!promptOverlay.hidden) { closeTextPrompt(null); return; }
          if (!licenseTextsOverlay.hidden) { closeLicenseTextsDialog(); }
          if (isFindBarOpen()) { closeFindBar(); return; }
          if (!aboutOverlay.hidden) { closeAboutDialog(); }
          closeAppMenu();
          hideFileContextMenu();
          return;
        }`,
  `${logic}

      window.addEventListener("keydown", (e) => {
        // --- Escape: close dialogs / bars / menus ---
        if (e.key === "Escape") {
          if (!confirmOverlay.hidden) { closeConfirmDialog(false); return; }
          if (!promptOverlay.hidden) { closeTextPrompt(null); return; }
          if (!commandPaletteOverlay.hidden) { closeCommandPalette(); return; }
          if (!diffOverlay.hidden) { closeDiffView(); return; }
          if (!recentOverlay.hidden) { closeRecentFiles(); return; }
          if (!licenseTextsOverlay.hidden) { closeLicenseTextsDialog(); }
          if (isFindBarOpen()) { closeFindBar(); return; }
          if (!aboutOverlay.hidden) { closeAboutDialog(); }
          if (zenActive) { exitZenMode(); return; }
          closeAppMenu();
          hideFileContextMenu();
          return;
        }
        // --- Ctrl/Cmd+K or Ctrl/Cmd+Shift+P: command palette ---
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === "k" || (k === "p" && e.shiftKey)) {
            e.preventDefault();
            if (commandPaletteOverlay.hidden) openCommandPalette();
            else closeCommandPalette();
            return;
          }
        }`,
  "Logic + keydown hooks"
);

// ── Hook updateEditorMetrics ─────────────────────────────────────
mustReplace(
  `        totalLinesStatus.textContent = t("ui", "totalLines").replace("{count}", lineCount.toLocaleString());
        updateByteCountStatus(text);
        updateSourceScrollChrome();
        updateEofMarker();
      }`,
  `        totalLinesStatus.textContent = t("ui", "totalLines").replace("{count}", lineCount.toLocaleString());
        updateByteCountStatus(text);
        updateTextMetrics(text);
        scheduleOutlineRefresh();
        updateSourceScrollChrome();
        updateEofMarker();
      }`,
  "updateEditorMetrics hooks"
);

// ── Hook setLoadedMarkdown baseline + recent ─────────────────────
mustReplace(
  `        fileStatusBar.style.display = "";
        fileState.hasContent = true;
        fileState.unsaved = false;
        setReadOnlyMode(false);
        setDirtyState(false);
        if (options.statusMessage) {
          setStatus(options.statusMessage, false);
        }
      }`,
  `        fileStatusBar.style.display = "";
        fileState.hasContent = true;
        fileState.unsaved = false;
        setBaselineText(text);
        setReadOnlyMode(false);
        setDirtyState(false);
        if (options.statusMessage) {
          setStatus(options.statusMessage, false);
        }
        // recent + outline after load (name may be set by caller via setAppDocumentTitle)
        window.setTimeout(() => {
          rememberCurrentAsRecent();
          if (outlineVisible || localStorage.getItem(STORAGE_OUTLINE_VISIBLE_KEY) === "true") {
            setOutlineVisible(true);
          }
        }, 0);
      }`,
  "setLoadedMarkdown hooks"
);

// ── Hook clearLoadedContent ──────────────────────────────────────
mustReplace(
  `        fileState.hasContent = false;
        source.value = "";
        source.scrollTop = 0;
        source.scrollLeft = 0;
        fileState.viewMode = "markdown";
        fileState.previewAutoCollapsed = false;
        updateCardLayout();
        renderMarkdown("");
        preview.scrollTop = 0;
        updateEditorMetrics();
        fileState.unsaved = false;
        setReadOnlyMode(false);
        setDirtyState(false);
        setAppDocumentTitle();
      }`,
  `        fileState.hasContent = false;
        source.value = "";
        source.scrollTop = 0;
        source.scrollLeft = 0;
        fileState.viewMode = "markdown";
        fileState.previewAutoCollapsed = false;
        setBaselineText("");
        updateCardLayout();
        renderMarkdown("");
        preview.scrollTop = 0;
        updateEditorMetrics();
        fileState.unsaved = false;
        setReadOnlyMode(false);
        setDirtyState(false);
        setAppDocumentTitle();
        setOutlineVisible(false);
      }`,
  "clearLoadedContent hooks"
);

// ── Hook successful save to refresh baseline ─────────────────────
// Find setDirtyState(false) after write - look for save success patterns
// Safer: wrap setDirtyState to update baseline when clearing dirty after save
mustReplace(
  `      function setDirtyState(isDirty) {
        fileState.unsaved = isDirty;
        if (!fileState.hasContent) {`,
  `      function setDirtyState(isDirty) {
        const wasDirty = fileState.unsaved;
        fileState.unsaved = isDirty;
        if (wasDirty && !isDirty && fileState.hasContent) {
          // Saved or reloaded clean — refresh baseline for diff
          setBaselineText(source.value);
          rememberCurrentAsRecent();
        }
        if (!fileState.hasContent) {`,
  "setDirtyState baseline refresh"
);

// ── applyLanguage hook ───────────────────────────────────────────
mustReplace(
        `        updateEditorMetrics();
        source.placeholder = t("ui", "sourcePlaceholder");
        document.getElementById("splitterTooltip").textContent = t("ui", "splitterTooltip");`,
  `        updateEditorMetrics();
        if (typeof applyUxDelightLanguage === "function") applyUxDelightLanguage();
        source.placeholder = t("ui", "sourcePlaceholder");
        document.getElementById("splitterTooltip").textContent = t("ui", "splitterTooltip");`,
  "applyLanguage hook"
);

// ── source selection listener for selection count ────────────────
mustReplace(
  `      findReplaceBar.addEventListener("keydown", handleFindKeydown);`,
  `      findReplaceBar.addEventListener("keydown", handleFindKeydown);
      source.addEventListener("select", () => updateTextMetrics());
      source.addEventListener("keyup", () => updateTextMetrics());
      source.addEventListener("mouseup", () => updateTextMetrics());`,
  "selection metric listeners"
);

// ── new file should set baseline empty ───────────────────────────
// setLoadedMarkdown already handles via setBaselineText(text)

// ── Fix editor-body CSS: original .editor-body may exist ──────────
// Check if .editor-body already defined with display settings that conflict
if ((html.match(/\\.editor-body\\s*\\{/g) || []).length > 1) {
  console.log("note: multiple .editor-body rules exist (ok if cascade works)");
}

fs.writeFileSync(htmlPath, html, "utf8");
console.log("Wrote", htmlPath);
console.log("Done. Size:", html.length);
