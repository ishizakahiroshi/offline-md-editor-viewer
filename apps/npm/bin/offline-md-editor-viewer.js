#!/usr/bin/env node
"use strict";

// Launcher for Offline MD Editor & Viewer.
// Opens the bundled single-file HTML app in the default browser.
// Zero dependencies. CommonJS. Node >= 18.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const HTML_NAME = "offline-md-editor-viewer.html";
const htmlPath = path.resolve(__dirname, "..", HTML_NAME);

function getVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8")
    );
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

function printHelp() {
  console.log(
    [
      "offline-md-editor-viewer - open the offline Markdown editor/viewer in your default browser",
      "",
      "Usage:",
      "  offline-md-editor-viewer            Open the bundled HTML app in the default browser",
      "  offline-md-editor-viewer --path     Print the full path of the bundled HTML (does not open a browser)",
      "  offline-md-editor-viewer --help     Show this help",
      "  offline-md-editor-viewer --version  Show version",
      "",
      "The app runs fully offline in your browser. No network access is required.",
      "Project: https://github.com/ishizakahiroshi/offline-md-editor-viewer"
    ].join("\n")
  );
}

function openInBrowser(target) {
  // Use spawn with argument arrays only (no shell string concatenation).
  if (process.platform === "win32") {
    // `start` is a cmd builtin; the empty "" is the window title slot so the
    // path is not mistaken for a title. windowsVerbatimArguments keeps cmd
    // from mangling quoting.
    return spawn("cmd", ["/c", "start", "", target], {
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: false
    });
  }
  if (process.platform === "darwin") {
    return spawn("open", [target], { detached: true, stdio: "ignore" });
  }
  return spawn("xdg-open", [target], { detached: true, stdio: "ignore" });
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(getVersion());
    return;
  }

  if (!fs.existsSync(htmlPath)) {
    console.error(
      [
        `Error: bundled HTML not found: ${htmlPath}`,
        "",
        "The single-file HTML app is bundled only in the released npm tarball.",
        "If you are running from a source checkout, build it first:",
        "  .\\scripts\\release\\build-browser-single-html.ps1 -Clean -Verify",
        "then copy dist/browser/offline-md-editor-viewer.html into apps/npm/."
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  if (args.includes("--path")) {
    console.log(htmlPath);
    return;
  }

  if (args.length > 0) {
    console.error(`Error: unknown option: ${args.join(" ")}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  const child = openInBrowser(htmlPath);
  child.on("error", (err) => {
    console.error(`Error: failed to open the browser: ${err.message}`);
    console.error(`Open this file manually in your browser:\n  ${htmlPath}`);
    process.exitCode = 1;
  });
  child.unref();
  console.log(`Opening in your default browser:\n  ${htmlPath}`);
}

main();
