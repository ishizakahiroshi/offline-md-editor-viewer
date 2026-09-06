import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");
const workflowFiles = fs.readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();
assert.ok(workflowFiles.length > 0, "no workflow files found");

const actionUses = [];
for (const fileName of workflowFiles) {
  const filePath = path.join(workflowsDir, fileName);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = /^\s+uses:\s*([^\s#]+)(?:\s+#\s*(.*))?$/.exec(line);
    if (match) actionUses.push({ fileName, line: index + 1, ref: match[1], comment: match[2] || "" });
  });
}

assert.ok(actionUses.length > 0, "no GitHub Actions uses entries found");
for (const action of actionUses) {
  const at = action.ref.lastIndexOf("@");
  assert.notEqual(at, -1, `${action.fileName}:${action.line} has no action ref`);
  const digest = action.ref.slice(at + 1);
  assert.match(
    digest,
    /^[0-9a-f]{40}$/,
    `${action.fileName}:${action.line} must use a full immutable SHA: ${action.ref}`
  );
  assert.match(
    action.comment,
    /\bv\d+\.\d+(?:\.\d+)?\b|\bstable\b/i,
    `${action.fileName}:${action.line} must retain a human-readable action version comment`
  );
}

const release = fs.readFileSync(path.join(workflowsDir, "release.yml"), "utf8");
assert.match(release, /permissions:\s*\n\s+contents: read/);
assert.match(release, /publish-release:[\s\S]*?permissions:\s*\n\s+contents: write/);
assert.match(release, /publish-npm:[\s\S]*?id-token: write/);

const dependabotPath = path.join(repoRoot, ".github", "dependabot.yml");
const dependabot = fs.readFileSync(dependabotPath, "utf8");
assert.match(dependabot, /package-ecosystem:\s*github-actions/);
assert.match(dependabot, /interval:\s*monthly/);

console.log(`OK workflow contracts (${actionUses.length} pinned actions)`);
