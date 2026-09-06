import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url);
const rustPath = new URL("../../apps/desktop/src-tauri/src/lib.rs", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");
const rust = fs.readFileSync(rustPath, "utf8");

function extractFunction(name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(match, `source function not found: ${name}`);
  const bodyMarker = html.indexOf(") {", match.index + match[0].length);
  assert.notEqual(bodyMarker, -1, `source function has no body: ${name}`);
  let depth = 0;
  let state = "code";
  let quote = "";
  for (let index = bodyMarker + 2; index < html.length; index += 1) {
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
      if (depth === 0) return html.slice(match.index, index + 1);
    }
  }
  assert.fail(`source function has unbalanced braces: ${name}`);
}

const context = {
  TextEncoder,
  ArrayBuffer,
  Uint8Array,
  isTauri: true,
  tauriCore: {
    invoke: (...args) => {
      context.lastInvoke = args;
      return Promise.resolve("ok");
    }
  },
  tauriInternals: null
};
for (const name of ["encodeTauriPathHeader", "invokeTauriRaw", "bytesToArrayBuffer"]) {
  const code = extractFunction(name);
  vm.runInNewContext(`${code}\nthis[${JSON.stringify(name)}] = ${name};`, context);
}

const path = "C:\\資料 %25\\日本語.md";
const encoded = context.encodeTauriPathHeader(path);
assert.equal(encoded, Array.from(new TextEncoder().encode(path), (byte) => byte.toString(16).padStart(2, "0")).join(""));
const body = new Uint8Array([0, 1, 255]);
await context.invokeTauriRaw("desktop_write_file_bytes", body, { "x-offline-md-editor-path": encoded });
assert.equal(context.lastInvoke[0], "desktop_write_file_bytes");
assert.strictEqual(context.lastInvoke[1], body);
assert.equal(JSON.stringify(context.lastInvoke[2]), JSON.stringify({ headers: { "x-offline-md-editor-path": encoded } }));

const buffer = new Uint8Array([1, 2, 3]).buffer;
assert.strictEqual(context.bytesToArrayBuffer(buffer), buffer);
const viewSource = new Uint8Array([9, 8, 7, 6]);
const view = viewSource.subarray(1, 3);
assert.deepEqual(Array.from(new Uint8Array(context.bytesToArrayBuffer(view))), [8, 7]);
assert.throws(() => context.bytesToArrayBuffer([1, 2, 3]), /non-binary/);

assert.match(html, /invokeTauriRaw\("desktop_write_file_bytes", bytes/);
assert.doesNotMatch(html.slice(html.indexOf('invokeTauriRaw("desktop_write_file_bytes"'), html.indexOf('invokeTauriRaw("desktop_write_file_bytes"') + 500), /Array\.from\(bytes\)/);
assert.match(rust, /Result<tauri::ipc::Response, String>/);
assert.match(rust, /tauri::ipc::Response::new\(bytes\)/);
assert.match(rust, /fn desktop_write_file_bytes\(request: tauri::ipc::Request<'_>\)/);
assert.match(rust, /tauri::ipc::InvokeBody::Raw\(bytes\)/);
assert.match(rust, /Raw byte request body is required/);
assert.match(rust, /Duplicate raw path header/);
assert.match(rust, /frontend_ready: AtomicBool/);
assert.match(rust, /\.manage\(CloseGuardState::default\(\)\)/);
assert.match(rust, /fn desktop_frontend_ready/);
assert.match(rust, /if should_prevent_close\(frontend_ready\)/);
assert.match(rust, /close_guard_stays_disabled_until_frontend_ready/);
assert.match(html, /await invokeTauri\("desktop_frontend_ready"\)/);
assert.match(html, /closeGuardSetupFailed/);

console.log("OK Tauri IPC and lifecycle contracts");
