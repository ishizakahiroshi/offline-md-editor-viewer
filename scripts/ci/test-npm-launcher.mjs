import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const launcher = require(path.join(repoRoot, "apps/npm/bin/offline-md-editor-viewer.js"));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "apps/npm/package.json"), "utf8")
);
const browserHtml = path.join(repoRoot, "apps/browser/offline-md-editor-viewer.html");
const fixtureTarget = path.join(
  repoRoot,
  "fixture space-日本語-%NAME%-%-&-^.html"
);
const fixtureUrl = pathToFileURL(fixtureTarget).href;

function makeFakeSpawn(outcome) {
  const calls = [];
  let lastChild;
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.unrefCount = 0;
    child.unref = () => {
      child.unrefCount += 1;
    };
    lastChild = child;
    calls.push({ command, args, options });
    queueMicrotask(() => {
      if (outcome.type === "error") {
        child.emit("error", new Error(outcome.message));
      } else {
        child.emit("close", outcome.code, outcome.signal || null);
      }
    });
    return child;
  };
  return { calls, getLastChild: () => lastChild, spawnImpl };
}

function expectRejected(promise, messagePart) {
  return promise.then(
    () => assert.fail(`expected rejection containing ${messagePart}`),
    (error) => {
      assert.match(error.message, new RegExp(messagePart));
      return error;
    }
  );
}

const windowsSpec = launcher.buildLaunchSpec(fixtureTarget, "win32", "C:\\Windows");
assert.equal(windowsSpec.command, "C:\\Windows\\System32\\rundll32.exe");
assert.deepEqual(windowsSpec.args, ["url.dll,FileProtocolHandler", fixtureUrl]);
assert.equal(fileURLToPath(windowsSpec.args[1]), fixtureTarget);
assert.equal(windowsSpec.args.length, 2);
assert.ok(!windowsSpec.command.includes("cmd"));
assert.ok(!windowsSpec.args.includes("start"));
assert.ok(!windowsSpec.args.includes("/c"));

for (const platform of ["darwin", "linux"]) {
  const spec = launcher.buildLaunchSpec(fixtureTarget, platform);
  assert.equal(spec.args.length, 1);
  assert.equal(spec.args[0], fixtureUrl);
}
assert.throws(
  () => launcher.buildLaunchSpec(fixtureTarget, "sunos"),
  /unsupported platform/
);

{
  const fake = makeFakeSpawn({ type: "close", code: 0 });
  const result = await launcher.openInBrowser(fixtureTarget, {
    platform: "win32",
    systemRoot: "C:\\Windows",
    spawnImpl: fake.spawnImpl
  });
  assert.equal(result.code, 0);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].args, windowsSpec.args);
  assert.equal(fake.calls[0].options.detached, true);
  assert.equal(fake.calls[0].options.stdio, "ignore");
  assert.equal(fake.getLastChild().unrefCount, 1);
}

{
  const fake = makeFakeSpawn({ type: "close", code: 7 });
  await expectRejected(
    launcher.openInBrowser(fixtureTarget, {
      platform: "linux",
      spawnImpl: fake.spawnImpl
    }),
    "exit code 7"
  );
  assert.equal(fake.getLastChild().unrefCount, 1);
}

{
  const fake = makeFakeSpawn({ type: "error", message: "launcher missing" });
  await expectRejected(
    launcher.openInBrowser(fixtureTarget, {
      platform: "linux",
      spawnImpl: fake.spawnImpl
    }),
    "launcher missing"
  );
  assert.equal(fake.getLastChild().unrefCount, 1);
}

{
  const output = [];
  const errors = [];
  const fake = makeFakeSpawn({ type: "close", code: 0 });
  const exitCode = await launcher.main([], {
    htmlPath: browserHtml,
    platform: "linux",
    spawnImpl: fake.spawnImpl,
    stdout: (value) => output.push(value),
    stderr: (value) => errors.push(value)
  });
  assert.equal(exitCode, 0);
  assert.equal(errors.length, 0);
  assert.match(output.join("\n"), /Opened in your default browser/);
  assert.match(output.join("\n"), new RegExp(pathToFileURL(browserHtml).href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

{
  const output = [];
  const errors = [];
  const fake = makeFakeSpawn({ type: "close", code: 9 });
  const exitCode = await launcher.main([], {
    htmlPath: browserHtml,
    platform: "linux",
    spawnImpl: fake.spawnImpl,
    stdout: (value) => output.push(value),
    stderr: (value) => errors.push(value)
  });
  assert.equal(exitCode, 1);
  assert.equal(output.length, 0);
  assert.match(errors.join("\n"), /failed to open the browser/);
  assert.match(errors.join("\n"), /Open this file manually/);
  assert.match(errors.join("\n"), /file:/);
}

assert.equal(packageJson.bin["offline-md-editor-viewer"], "bin/offline-md-editor-viewer.js");
assert.ok(packageJson.files.includes("bin/"));
assert.ok(packageJson.files.includes("offline-md-editor-viewer.html"));
assert.ok(packageJson.files.includes("README.md"));

console.log("npm launcher tests passed");
