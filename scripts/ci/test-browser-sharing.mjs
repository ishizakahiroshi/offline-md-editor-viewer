import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../../apps/browser/offline-md-editor-viewer.html");
const context = vm.createContext({});
vm.runInContext(read("../../apps/browser/lib/marked.min.js"), context);

function functionsBetween(first, next) {
  const start = html.indexOf("      function " + first + "(");
  const end = html.indexOf("      " + next, start);
  assert.ok(start >= 0 && end > start, "production functions exist");
  vm.runInContext(html.slice(start, end), context);
}

functionsBetween("sharingChildren", "function sharingRecordPreview(");
functionsBetween("sharingReferences", "async function openSharingLinks(");

const lines = [
  "# 同じ見出し", "# 同じ見出し", "## 同じ見出し-1", "",
  "[same](a.md) [same](b.md#section)", "",
  "> line 1", "> [same](c.md)", "",
  "| left | right |", "| --- | --- |", "| ![image](image.png) | [file][ref] |", "",
  "[ref]: d.md", "",
  "Inline \`[ignored](one)\`.", "~~~", "[ignored](two)", "~~~", "",
  "- [nested](e.md)", "  - [nested](f.md)", "", "[外部](https://example.invalid)"
];
const source = lines.join("\n");
const tokens = context.marked.lexer(source);
assert.deepEqual(Array.from(context.sharingHeadingNames(tokens)), ["同じ見出し", "同じ見出し-1", "同じ見出し-1-1"]);
const results = Array.from(context.sharingReferences(tokens, source));
assert.deepEqual(results.map(item => [item.href, item.line]), [
  ["a.md",5], ["b.md#section",5], ["c.md",8], ["image.png",12],
  ["d.md",12], ["e.md",21], ["f.md",22], ["https://example.invalid",24]
]);
for (const ref of results) assert.match(source.slice(ref.offset), /^(?:!\[|\[)/);

// A lexed reference contributes once even if the same label and target occur
// repeatedly. The source offsets must identify each actual occurrence.
const repeated = "[a](x) [a](x)\n\n> [a](x)\n";
assert.deepEqual(Array.from(context.sharingReferences(context.marked.lexer(repeated), repeated), ref => ref.offset), [0, 7, 17]);
console.log("OK sharing link positions and rendered heading names");

// Real Range boundaries, including sub-character selection in formatted text,
// require a browser DOM. Run with --chromium /path/to/chrome when available.
if (process.argv[2] === "--chromium") {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve, dirname } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const base = resolve(tmpdir());
  const temp = mkdtempSync(join(base, "md-sharing-"));
  try {
    const script = async function testSharing() {
      const check = (value, message) => { if (!value) throw new Error(message); };
      function select(a, from, b, to) {
        const range = document.createRange();
        range.setStart(a, from);
        range.setEnd(b, to);
        return range;
      }
      const md = "# Heading\n\n__repeat__ [same](a.md) [same](b.md)\n\nplain\n\n| A | B |\n|---|---|\n| 1 | 2 |";
      source.value = md;
      renderMarkdown(md.replace(/\n/g, "\r\n"));
      check(sharingFresh(sharingRender), "fresh preview");
      const para = preview.querySelector("p");
      const bold = para.querySelector("strong").firstChild;
      const letter = sharingCapture(select(bold, 1, bold, 2));
      check(letter.markdown === "**e**" && letter.plain === "e" && letter.html.includes("<strong>e</strong>"), "one bold letter");
      const second = para.querySelectorAll("a")[1].firstChild;
      check(sharingCapture(select(second,0,second,4)).markdown === "[same](b.md)", "repeated label");
      const full = document.createRange();
      full.selectNodeContents(para);
      check(sharingCapture(full).markdown === "__repeat__ [same](a.md) [same](b.md)", "original source spelling");
      const next = para.nextElementSibling.firstChild;
      const multi = sharingCapture(select(second,0,next,2));
      check(multi.markdown === "[same](b.md)\n\npl" && multi.plain === "same\npl", "multiple blocks");
      const cell = preview.querySelectorAll("td")[1].firstChild;
      const table = sharingCapture(select(cell,0,cell,1));
      check(table.plain === "2" && table.html.includes("<td>2</td>") && !table.html.includes("button"), "partial table");
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(select(second,0,second,4));
      const elsewhere = new MouseEvent("contextmenu", { bubbles:true, cancelable:true, clientX:-10, clientY:-10 });
      preview.dispatchEvent(elsewhere);
      check(!elsewhere.defaultPrevented && sharingMenu.hidden, "native menu outside selection");
      const keyboard = new KeyboardEvent("keydown", {bubbles:true, cancelable:true, key:"F10", shiftKey:true});
      preview.dispatchEvent(keyboard);
      check(keyboard.defaultPrevented && !sharingMenu.hidden, "keyboard menu");
      sharingMenu.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"Escape"}));
      check(sharingMenu.hidden, "dismiss menu");
      await openSharingPrint();
      check(!sharingPrintButton.disabled && sharingPaper.textContent.includes("Heading") && !sharingPaper.querySelector("button"), "clean print paper");
      sharingDialog.close();
      source.value = "10. first\n11. second\n\nprefix # literal\n\n- [x] done\n- [ ] pending";
      renderMarkdown(source.value);
      const item = preview.querySelectorAll("ol li")[1].firstChild;
      check(sharingCapture(select(item,0,item,6)).markdown === "11. second", "ordered list numbering");
      const literal = preview.querySelector("p").firstChild;
      check(sharingCapture(select(literal,7,literal,16)).markdown === "\\# literal", "literal start after selection");
      await openSharingPrint();
      check(sharingPaper.textContent.includes("☑") && sharingPaper.textContent.includes("☐"), "printed task state");
      sharingDialog.close();
      const held = letter.snapshot;
      source.value = "x".repeat(PREVIEW_RENDER_SOFT_LIMIT_CHARS + 1);
      renderMarkdown(source.value);
      check(!sharingFresh(held) && !sharingRender, "paused render invalidates copy and print");
    };
    const anchor = '      if (!supportsFsAccess) {';
    const insertion = html.lastIndexOf(anchor);
    assert.ok(insertion >= 0);
    const result = 'document.documentElement.dataset.sharingTest';
    const invoke = '(' + script + ')().then(() => ' + result + '="passed", error => ' + result + '=String(error));\n';
    cpSync(new URL("../../apps/browser/lib/", import.meta.url), join(temp, "lib"), {recursive:true});
    const fixture = join(temp, "test.html");
    writeFileSync(fixture, html.slice(0, insertion) + invoke + html.slice(insertion));
    const run = spawnSync(process.argv[3], ["--headless", "--disable-gpu", "--disable-extensions",
      "--no-first-run", "--no-default-browser-check", "--user-data-dir=" + join(temp,"profile"),
      "--dump-dom", "--virtual-time-budget=3000", pathToFileURL(fixture).href],
      { encoding:"utf8", maxBuffer:8_000_000, timeout:40_000 });
    assert.ifError(run.error);
    assert.equal(run.status, 0, run.stderr.slice(-500));
    assert.equal(/<html\b[^>]*data-sharing-test="([^"]+)"/.exec(run.stdout)?.[1], "passed");
    console.log("OK Chromium selection, menu, print preview and stale document guards");
  } finally {
    if (dirname(temp) === base) rmSync(temp, {recursive:true, force:true, maxRetries:3, retryDelay:300});
  }
}
