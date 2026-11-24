import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../apps/browser/offline-md-editor-viewer.html', import.meta.url), 'utf8');
const handlers = new Map();
function body() {
  return { style: { setProperty(key, value) { this[key] = value; } },
    setAttribute(key, value) { this[key] = value; }, focus() {}, hidden: true,
    getBoundingClientRect() { return { left: 10, bottom: 30 }; }, offsetWidth: 260, offsetHeight: 100,
    addEventListener(key, handler, options) { this[key] = handler; this[`${key}Options`] = options; },
    contains(target) { return target === this; }, getClientRects() { return [1]; } };
}
const sourceBody = body();
const preview = body();
const indicators = new Map();
const document = { body: {}, documentElement: {}, addEventListener() {}, getElementById(id) {
  if (!indicators.has(id)) indicators.set(id, body());
  return indicators.get(id);
} };
const context = {
  source: { closest: () => sourceBody }, preview, document,
  editorPanel: body(), previewPanel: body(),
  window: { innerWidth: 1200, innerHeight: 800, addEventListener: (type, handler) => handlers.set(type, handler) },
  t: (_group, key) => key, setUiTooltip() {},
  scheduleEditorMetricsUpdate() {}, setTimeout() { return 1; }, clearTimeout() {}
};
const start = html.indexOf('      const paneZoomStates =');
const end = html.indexOf('      function detectInitialFontScale()', start);
assert.ok(start > 0 && end > start);
vm.runInNewContext(html.slice(start, end), context);
let timeStamp = 1000;
function wheel(target, deltaY, extra = {}) {
  let prevented = false;
  target.wheel({ ctrlKey: true, deltaMode: 0, deltaY, timeStamp: timeStamp += 10,
    preventDefault() { prevented = true; }, ...extra });
  return prevented;
}
const scale = target => target.style['--pane-font-scale'] || '1';
assert.equal(sourceBody.wheelOptions.passive, false);
assert.equal(wheel(sourceBody, -100), true);
assert.equal(scale(sourceBody), '1.1');
assert.equal(scale(preview), '1');
for (let i = 0; i < 30; i++) wheel(sourceBody, -100);
assert.equal(scale(sourceBody), '2');
assert.equal(wheel(sourceBody, -100), true, 'limit still cancels page zoom');
for (let i = 0; i < 30; i++) wheel(sourceBody, 100);
assert.equal(scale(sourceBody), '0.5');
wheel(preview, -25); wheel(preview, -25); wheel(preview, -25);
assert.equal(scale(preview), '1');
wheel(preview, -25);
assert.equal(scale(preview), '1.1');
wheel(preview, -50); wheel(preview, 50);
assert.equal(scale(preview), '1.1', 'reversal discards previous direction');
timeStamp += 300;
wheel(preview, 50);
assert.equal(scale(preview), '1.1', 'stale partial movement is discarded');
wheel(preview, 100, { ctrlKey: false });
assert.equal(scale(preview), '1.1', 'ordinary wheel does not zoom');
assert.equal(wheel(preview, -100, { ctrlKey: false }), false);
wheel(preview, -3, { deltaMode: 1 });
assert.equal(scale(preview), '1.2');
wheel(preview, -1, { deltaMode: 2 });
assert.equal(scale(preview), '1.3');
wheel(preview, -9999);
assert.equal(scale(preview), '1.4', 'one event advances at most one step');
let prevented = false;
const reset = target => handlers.get('keydown')({ ctrlKey: true, key: '0', target,
  preventDefault() { prevented = true; } });
reset({});
assert.equal(prevented, false, 'outside inputs keep native shortcuts');
reset(document.body);
assert.equal(prevented, true);
assert.equal(scale(preview), '1');
assert.equal(scale(sourceBody), '0.5', 'reset affects only active pane');
context.editorPanel.focusin();
reset(sourceBody);
assert.equal(scale(sourceBody), '1');
assert.equal(indicators.get('sourceZoomIndicator').textContent, '100%');
const sourceButton = indicators.get('sourceZoomIndicator');
const menu = indicators.get('paneZoomMenu');
sourceButton.click();
assert.equal(menu.hidden, false, 'button opens controls');
assert.equal(sourceButton['aria-expanded'], 'true');
indicators.get('paneZoomIn').click();
assert.equal(scale(sourceBody), '1.1', 'plus changes the selected pane');
assert.equal(scale(preview), '1');
indicators.get('paneZoomOut').click();
assert.equal(scale(sourceBody), '1');
for (let i = 0; i < 20; i++) indicators.get('paneZoomIn').click();
assert.equal(indicators.get('paneZoomIn').disabled, true);
indicators.get('paneZoomReset').click();
assert.equal(scale(sourceBody), '1');
assert.equal(indicators.get('paneZoomIn').disabled, false);
sourceButton.click();
assert.equal(menu.hidden, true, 'same button toggles closed');
console.log('OK pane zoom: bounds, independent panes, wheel accumulation, native scrolling, reset');
