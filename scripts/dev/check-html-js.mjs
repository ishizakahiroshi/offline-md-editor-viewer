import fs from "fs";
const html = fs.readFileSync("apps/browser/offline-md-editor-viewer.html", "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
console.log("inline scripts", scripts.length);
try {
  new Function(scripts[0]);
  console.log("syntax ok", scripts[0].length);
} catch (e) {
  console.log("FAIL", e.message);
}
for (const n of [
  "openCommandPalette",
  "toggleZenMode",
  "openDiffView",
  "openRecentFiles",
  "parseOutlineHeadings",
  "updateTextMetrics",
  "setBaselineText",
  "applyUxDelightLanguage",
]) {
  console.log(n, html.includes("function " + n));
}
console.log("outline panel html", html.includes('id="outlinePanel"'));
console.log("charCountStatus", html.includes('id="charCountStatus"'));
