import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url), "utf8");
const start = html.indexOf("async function inspectWorkspaceReference(");
const end = html.indexOf("function getRelativeLinkPathPart(", start);
assert.ok(start > 0 && end > start);
const seen = [];
const context = vm.createContext({
  getDocumentState: () => ({}),
  documentBelongsToCurrentDirectory: () => true,
  dirState: { handle: {} },
  isTauri: false,
  async getNestedFileHandle(root, path) {
    seen.push(path);
    if (path === "unreadable") throw { name: "NotAllowedError" };
    if (path === "missing") throw { name: "NotFoundError" };
    return { name: path.split("/").pop() };
  }
});
const inspect = vm.runInContext(html.slice(start, end) + "\ninspectWorkspaceReference", context);
assert.equal((await inspect("../same.md#%E7%AF%80", "a/source.md")).fragment, "節");
assert.equal((await inspect("same.md", "b/source.md")).entry.path, "b/same.md");
assert.equal((await inspect("missing", "note.md")).kind, "missing");
assert.equal((await inspect("unreadable", "note.md")).kind, "unverified");
const reads = seen.length;
for (const ref of ["../../elsewhere", "%2Fabsolute", "C:/absolute", "file:///elsewhere"]) {
  assert.equal((await inspect(ref, "a/note.md")).kind, "outside");
}
assert.equal((await inspect("https://example.invalid", "")).kind, "external");
assert.equal((await inspect("#anchor", "")).kind, "anchor");
assert.equal((await inspect("relative", "")).kind, "unverified");
context.documentBelongsToCurrentDirectory = () => false;
assert.equal((await inspect("same.md", "b/source.md")).kind, "unverified");
assert.equal(seen.length, reads);
console.log("OK local reference resolution, root boundaries, permissions and single-file mode");
