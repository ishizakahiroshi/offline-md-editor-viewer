import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../../apps/browser/offline-md-editor-viewer.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");

const sourceMatch = html.match(/const REGEX_FIND_WORKER_SOURCE = `([\s\S]*?)`;/);
assert.ok(sourceMatch, "regex worker source not found");
const workerMessages = [];
const workerContext = {
  self: {
    postMessage(message) {
      workerMessages.push(message);
    },
  },
};
vm.runInNewContext(sourceMatch[1], workerContext);
assert.equal(typeof workerContext.self.onmessage, "function", "worker handler is defined");

workerContext.self.onmessage({
  data: {
    type: "search",
    requestId: 7,
    generation: 3,
    query: "(a)(b)",
    text: "xxAByyabzz",
    caseSensitive: false,
    wholeWord: false,
    limit: 2000,
  },
});
const result = workerMessages.pop();
assert.equal(result.type, "result");
assert.equal(
  JSON.stringify(result.matches.map(({ start, end, text, captures }) => ({ start, end, text, captures }))),
  JSON.stringify([
    { start: 2, end: 4, text: "AB", captures: ["A", "B"] },
    { start: 6, end: 8, text: "ab", captures: ["a", "b"] },
  ]),
);
assert.equal(result.capped, false);

workerContext.self.onmessage({
  data: {
    requestId: 8,
    generation: 4,
    query: "[",
    text: "abc",
    caseSensitive: true,
    wholeWord: false,
    limit: 2000,
  },
});
assert.equal(workerMessages.pop().type, "error", "invalid regex fails closed inside worker");

function extractFunction(name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(match, `source function not found: ${name}`);
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
    if (state === "regex") {
      if (ch === "\\") index += 1;
      else if (ch === "/") state = "code";
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
    if (ch === "/") {
      state = "regex";
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

const replacementContext = {};
vm.runInNewContext(
  `${extractFunction("expandFindReplacement")}\nthis.expandFindReplacement = expandFindReplacement;`,
  replacementContext,
);
assert.equal(
  replacementContext.expandFindReplacement(
    { text: "AB", captures: ["A", "B"], groups: { first: "A" } },
    "$1/$2/$&/$$/$<first>",
  ),
  "A/B/AB/$/A",
  "regex replacement uses Worker-captured groups without re-running the pattern",
);

assert.match(html, /worker-src blob:/);
assert.match(html, /REGEX_FIND_TIMEOUT_MS = 750/);
assert.match(html, /regexFindWorker\.terminate\(\)/);
assert.match(html, /generation !== findGeneration/);
assert.match(html, /requestId !== regexFindRequestId/);
assert.match(html, /findRegexTimeout/);
assert.match(html, /findRegexUnavailable/);
assert.match(html, /findState\.pending/);

console.log("OK browser regex worker contracts");
