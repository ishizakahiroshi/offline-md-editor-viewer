#!/usr/bin/env node
"use strict";

// Launcher for Offline MD Editor & Viewer.
// Opens the bundled single-file HTML app in the default browser.
// Zero dependencies. CommonJS. Node >= 18.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

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

function printHelp(write = console.log) {
  write(
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

function buildLaunchSpec(target, platform = process.platform, systemRoot = process.env.SystemRoot) {
  const fileUrl = pathToFileURL(target).href;

  if (platform === "win32") {
    const windowsRoot = systemRoot || "C:\\Windows";
    return {
      command: path.win32.join(windowsRoot, "System32", "rundll32.exe"),
      args: ["url.dll,FileProtocolHandler", fileUrl]
    };
  }
  if (platform === "darwin") {
    return { command: "open", args: [fileUrl] };
  }
  if (platform === "linux") {
    return { command: "xdg-open", args: [fileUrl] };
  }

  throw new Error(`unsupported platform: ${platform}`);
}

function observeChildProcess(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    child.once("error", (error) => settle(reject, error));
    child.once("close", (code, signal) => {
      if (code === 0) {
        settle(resolve, { code, signal });
        return;
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code}`;
      const error = new Error(`browser launcher exited with ${detail}`);
      error.exitCode = code;
      error.signal = signal;
      settle(reject, error);
    });
  });
}

async function openInBrowser(target, options = {}) {
  const platform = options.platform || process.platform;
  const systemRoot = options.systemRoot || process.env.SystemRoot;
  const spawnImpl = options.spawnImpl || spawn;
  const spec = buildLaunchSpec(target, platform, systemRoot);
  const child = spawnImpl(spec.command, spec.args, {
    detached: true,
    stdio: "ignore"
  });

  try {
    return await observeChildProcess(child);
  } finally {
    // Keep the child reference until its result has been observed. This also
    // guarantees that an error/nonzero exit cannot be reported as success.
    if (typeof child.unref === "function") child.unref();
  }
}

async function main(args = process.argv.slice(2), options = {}) {
  const write = options.stdout || console.log;
  const writeError = options.stderr || console.error;
  const targetPath = options.htmlPath || htmlPath;
  const targetUrl = pathToFileURL(targetPath).href;

  if (args.includes("--help") || args.includes("-h")) {
    printHelp(write);
    return 0;
  }
  if (args.includes("--version") || args.includes("-v")) {
    write(getVersion());
    return 0;
  }

  if (!fs.existsSync(targetPath)) {
    writeError(
      [
        `Error: bundled HTML not found: ${targetPath}`,
        "",
        "The single-file HTML app is bundled only in the released npm tarball.",
        "If you are running from a source checkout, build it first:",
        "  .\\scripts\\release\\build-browser-single-html.ps1 -Clean -Verify",
        "then copy dist/browser/offline-md-editor-viewer.html into apps/npm/."
      ].join("\n")
    );
    return 1;
  }

  if (args.includes("--path")) {
    write(targetPath);
    return 0;
  }

  if (args.length > 0) {
    writeError(`Error: unknown option: ${args.join(" ")}`);
    printHelp(writeError);
    return 1;
  }

  try {
    await openInBrowser(targetPath, options);
  } catch (error) {
    writeError(`Error: failed to open the browser: ${error.message}`);
    writeError(`Open this file manually in your browser:\n  ${targetUrl}`);
    return 1;
  }

  write(`Opened in your default browser:\n  ${targetUrl}`);
  return 0;
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  HTML_NAME,
  buildLaunchSpec,
  getVersion,
  htmlPath,
  main,
  observeChildProcess,
  openInBrowser,
  pathToFileURL
};
