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
// BUG-TAURI-RAW-RESPONSE-001: ここは以前「素の配列は拒否する」を期待値にしていたが、
// それは実機の挙動と逆だった。desktop_read_file_bytes が tauri::ipc::Response を返しても、
// この IPC 経路では ArrayBuffer ではなく数値の配列として届く（実測で確認）。拒否する実装だと
// Desktop 版でファイルを 1 つも開けない。配列は受け入れ、バイト列でないものだけ拒否する。
assert.deepEqual(
  Array.from(new Uint8Array(context.bytesToArrayBuffer([1, 2, 3]))),
  [1, 2, 3]
);
assert.throws(() => context.bytesToArrayBuffer("not bytes"), /non-binary/);
assert.throws(() => context.bytesToArrayBuffer(null), /non-binary/);

assert.match(html, /invokeTauriRaw\("desktop_write_file_bytes", bytes/);
assert.doesNotMatch(html.slice(html.indexOf('invokeTauriRaw("desktop_write_file_bytes"'), html.indexOf('invokeTauriRaw("desktop_write_file_bytes"') + 500), /Array\.from\(bytes\)/);
assert.match(rust, /Result<tauri::ipc::Response, String>/);
assert.match(rust, /tauri::ipc::Response::new\(bytes\)/);
assert.match(
  rust,
  /fn desktop_write_file_bytes\(\s*allowlist: tauri::State<'_, WorkspaceAllowlist>,\s*request: tauri::ipc::Request<'_>,\s*\)/s
);
// BUG-TAURI-RAW-REQUEST-001: 送信側も raw body だけを受ける実装に戻さないこと。
// この IPC 経路では Uint8Array が JSON の数値配列として届き、Raw だけを受けると
// Desktop 版で保存が一切できなくなる（実機で再現）。両方を受けることを検査する。
assert.match(rust, /tauri::ipc::InvokeBody::Raw\(raw\)/);
assert.match(rust, /tauri::ipc::InvokeBody::Json\(value\) => std::borrow::Cow::Owned\(json_body_to_bytes\(value\)\?\)/);
assert.match(rust, /fn json_body_to_bytes\(value: &serde_json::Value\) -> Result<Vec<u8>, String>/);
// 旧: raw body 以外を拒否するエラー文言の存在を検査していたが、その経路自体を廃止した。
// 文言の有無ではなく、上の「両方の body を受ける」構造で検査する。
assert.match(rust, /Duplicate raw path header/);
assert.match(rust, /frontend_ready: AtomicBool/);
assert.match(rust, /\.manage\(CloseGuardState::default\(\)\)/);
assert.match(rust, /fn desktop_frontend_ready/);
assert.match(rust, /if should_prevent_close\(frontend_ready\)/);
assert.match(rust, /close_guard_stays_disabled_until_frontend_ready/);
assert.match(html, /await invokeTauri\("desktop_frontend_ready"\)/);
assert.match(html, /closeGuardSetupFailed/);

// LAUNCH-RS-001..004: 2 本目の exe 起動を既存ウィンドウへ渡す配線（plan_document-tabs.md C3）。
assert.match(rust, /\.plugin\(tauri_plugin_single_instance::init\(/);
assert.match(rust, /fn desktop_take_pending_launch_paths/);
assert.match(rust, /desktop_take_pending_launch_paths,/);
assert.match(rust, /"desktop-open-launch-paths"/);
assert.match(rust, /fn placement_scoped_identifier\(base: &str, exe_dir: &str\) -> String/);
assert.match(rust, /let mut context = tauri::generate_context!\(\);/);
assert.match(rust, /context\.config_mut\(\)\.identifier = scoped_identifier;/);
assert.match(rust, /\.run\(context\);/);
assert.match(rust, /struct PendingLaunchPathsState/);
assert.match(rust, /fn placement_scoped_identifier_is_deterministic_and_placement_sensitive/);
assert.match(rust, /fn secondary_instance_launch_paths_filters_and_dedupes/);
assert.match(rust, /fn pending_launch_queue_drops_new_entries_once_full/);

console.log("OK Tauri IPC and lifecycle contracts");
