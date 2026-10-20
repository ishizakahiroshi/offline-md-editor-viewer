#!/usr/bin/env node
// Dual migration gate: retain legacy coverage and add strict public structural scanning.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, lstatSync, realpathSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stagedSnapshot, gitEnvironment, gitContext } from './secrets-scan.staged.mjs';

export const VERSION = '0.2.0';
// Runtime verification adopted from docsweep pilot f760ae4; no local install.
export const canonicalRuntime = Object.freeze({
  arch: 'x64',
  payload: '5458f08f85753cf6d33ad869063af16ca8f55a800bb9d17a78c4b6adc0651279',
  // https://github.com/ishizakahiroshi/doxguard/blob/v0.2.0/bin/doxguard.js
  launcher: '5374a0b83149b3ca78ad897c2475c6dbbbb44b55c4c6671f762c4e2bd8312b28',
});
export function verifyRuntime(root, arch = process.arch, expected = canonicalRuntime, fileStat = statSync) {
  if (arch !== expected.arch) throw new Error('unsupported canonical architecture');
  const rootDir = join(root,'node_modules','doxguard');
  const platformName = '@ishizakahiroshi/doxguard-linux-' + arch;
  const platformDir = join(root,'node_modules','@ishizakahiroshi','doxguard-linux-' + arch);
  const a = JSON.parse(readFileSync(join(rootDir,'package.json'),'utf8'));
  const b = JSON.parse(readFileSync(join(platformDir,'package.json'),'utf8'));
  if (a.name !== 'doxguard' || a.version !== '0.2.0' || a.type !== 'module'
      || a.bin?.doxguard !== 'bin/doxguard.js' || a.optionalDependencies?.[platformName] !== '0.2.0'
      || b.name !== platformName || b.version !== '0.2.0' || b.bin?.doxguard !== 'bin/doxguard' || b.exports !== undefined
      || JSON.stringify(b.os) !== '["linux"]' || JSON.stringify(b.cpu) !== JSON.stringify([arch])) throw new Error('package identity mismatch');
  const launcher = join(rootDir,'bin','doxguard.js');
  const binary = join(platformDir,'bin','doxguard');
  for (const path of [rootDir, platformDir, launcher, binary, join(rootDir,'package.json'), join(platformDir,'package.json')]) {
    if (realpathSync(path) !== resolve(path)) throw new Error('redirected runtime path');
  }
  if (!fileStat(launcher).isFile() || !fileStat(binary).isFile() || !(fileStat(binary).mode & 0o111)) throw new Error('entrypoint mismatch');
  // Node's in-process resolver caches successful results. A fresh launcher
  // must not see a higher-priority package added after a prior verification.
  for (const directory of [join(rootDir,'bin','node_modules'),join(rootDir,'node_modules')]) {
    try {
      lstatSync(join(directory,'@ishizakahiroshi','doxguard-linux-' + arch));
      throw new Error('nested platform candidate');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Resolve exactly as the canonical launcher does, excluding a nested or
  // redirected platform package with otherwise plausible outer metadata.
  if (realpathSync(createRequire(launcher).resolve(platformName + '/package.json')) !== realpathSync(join(platformDir,'package.json'))) throw new Error('platform resolution mismatch');
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  const payload = hash(binary), launch = hash(launcher);
  if (payload !== expected.payload || launch !== expected.launcher) throw new Error('canonical hash mismatch');
  return {launcher,binary,receipt:{package:'doxguard',version:'0.2.0',platform:'linux-' + arch,payload_sha256:payload,launcher_sha256:launch,canonical_match:true}};
}
const integer = value => Number.isSafeInteger(value) && value >= 0;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value);

export function scannerEnvironment(input, publicOnly = true) {
  const output = gitEnvironment(input);
  // Windows environment names are case insensitive even when Node exposes their spelling.
  for (const key of Object.keys(output)) {
    const upper = key.toUpperCase();
    if (upper.startsWith('DOXGUARD_') || (publicOnly && ['KB_ROOT', 'FAMILY_ROOT'].includes(upper))) delete output[key];
  }
  return output;
}

function fold(text) { return text.replace(/[\\/]+/g, '/').replace(/[A-Z]/g, c => c.toLowerCase()); }
export function redactMetadata(text, values) {
  if (typeof text !== 'string') return '(unavailable)';
  // Map each normalized character back to the original range. Never print raw match text.
  let normalized = '', starts = [], ends = [];
  for (let i = 0; i < text.length;) {
    const start = i;
    if (text[i] === '/' || text[i] === '\\') {
      while (i < text.length && (text[i] === '/' || text[i] === '\\')) i++;
      normalized += '/'; starts.push(start); ends.push(i);
    } else { normalized += fold(text[i]); starts.push(i); ends.push(++i); }
  }
  const spans = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value || value === '[redacted]') continue;
    const full = fold(value), forms = new Set([full]);
    if (full.includes('/')) {
      const short = full.replace(/^\/+/, '').replace(/[.]+$/, '');
      if (short.includes('/')) forms.add(short);
      const bare = short.replace(/(?:\.git|[.\-_])+$/g, '');
      if (bare.includes('/') && !bare.endsWith('/')) forms.add(bare);
    }
    for (const needle of forms) for (let at = normalized.indexOf(needle); at !== -1; at = normalized.indexOf(needle, at + 1)) spans.push([starts[at], ends[at + needle.length - 1]]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]);
  }
  let result = '', cursor = 0;
  for (const [start, end] of merged) { result += text.slice(cursor, start) + '[redacted]'; cursor = end; }
  return (result + text.slice(cursor)).replace(/[\x00-\x1f\x7f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function summarize(result, scanner, mode) {
  const failure = { scanner, mode, exit: 2, reason: 'scanner execution or JSON contract failed' };
  if (result.error || result.signal || ![0, 1, 2].includes(result.status)) return failure;
  let report;
  try { report = JSON.parse(result.stdout); } catch { return failure; }
  if (!report || !Array.isArray(report.hits) || !integer(report.scanned) || !integer(report.total_files)) return failure;
  if (report.scanned > report.total_files) return failure;
  if (scanner === 'doxguard' && (!integer(report.coverage_skips) || report.watchlist_needles !== 0
      || report.structural_patterns !== 4 || report.watchlist_statistics?.candidates !== 0
      || report.watchlist_statistics?.loaded !== 0 || report.baseline_applied !== false
      || report.baseline_suppressed_hits !== 0)) return failure;
  const allowedWarnings = new Set([
    'WARN: KB_ROOT env var not set — kb-derived watchlist skipped, structural regex only',
    'WARN: KB_ROOT env var が未設定 — kb 由来 watchlist をスキップ・構造 regex のみで継続',
    'WARN: FAMILY_ROOT env var not set — family watchlist skipped',
    'WARN: FAMILY_ROOT env var が未設定 — family watchlist をスキップ',
  ]);
  const coverageWarnings = scanner === 'legacy' ? String(result.stderr || '').split(/\r?\n/).filter(line => line && !allowedWarnings.has(line)).length : 0;
  if (scanner === 'legacy' && process.env.CI === 'true' && (report.kb_needles !== 0 || report.family_needles !== 0)) return failure;
  const values = report.hits.map(hit => hit?.matched).filter(value => typeof value === 'string');
  const hits = [];
  for (const hit of report.hits) {
    const line = hit?.lineNumber ?? hit?.line_number;
    if (!hit || typeof hit.file !== 'string' || !integer(line) || typeof hit.source !== 'string') return failure;
    hits.push({ file: redactMetadata(hit.file, values), line, reason: redactMetadata(hit.source, values) });
  }
  return {
    scanner, version: scanner === 'doxguard' ? VERSION : 'repository source', mode,
    coverageWarnings,
    exit: coverageWarnings ? 2 : report.hits.length > 0 || (scanner === 'doxguard' && report.coverage_skips > 0) ? Math.max(result.status, 1) : result.status,
    targets: report.total_files, scanned: report.scanned, hits,
    coverageSkips: scanner === 'doxguard' ? report.coverage_skips : null,
    legacyExcludedOrSkipped: scanner === 'legacy' ? report.exempt_or_skipped ?? null : undefined,
  };
}

export function runBoth({ execute, legacy, native, mode }) {
  // Do not short-circuit: launch both even after an error, nonzero exit, or malformed JSON.
  const results = [];
  for (const [scanner, command] of [['legacy', legacy], ['doxguard', native]]) {
    let result;
    try { result = execute(command); } catch { result = { status: 2, error: true }; }
    results.push(summarize(result, scanner, mode));
  }
  return { results, exit: results.some(result => result.exit !== 0) ? 1 : 0 };
}

// Native-only gate: the legacy scanner is never launched and no target-count comparison exists.
// A missing, unverifiable or failing native scanner stays a failure (no fallback).
export function runNative({ execute, native, mode }) {
  let result;
  try { result = execute(native); } catch { result = { status: 2, error: true }; }
  const results = [summarize(result, 'doxguard', mode)];
  return { results, exit: results.some(item => item.exit !== 0) ? 1 : 0 };
}

function main(rawArgv) {
  // --native-only may appear once, anywhere; the remaining arguments keep the existing mode grammar.
  const nativeOnly = rawArgv.includes('--native-only');
  if (rawArgv.filter(arg => arg === '--native-only').length > 1) throw new Error('mode');
  const argv = rawArgv.filter(arg => arg !== '--native-only');
  const mode = argv[0];
  const simple = ['--all-tracked', '--staged', '--history', '--controls'];
  const list = ['--files-from-list', '--path-from'];
  if (!(simple.includes(mode) && argv.length === 1) && !(list.includes(mode) && argv.length === 2)) throw new Error('mode');
  const env = scannerEnvironment(process.env, process.env.CI === 'true');
  const execute = ([command, ...args]) => spawnSync(command, args, { encoding: 'utf8', env, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  // Git checks on the caller's repository must see the same (validated) index the snapshot uses.
  const gitEnv = mode === '--staged' ? gitContext(process.cwd(), process.env).env : env;
  const git = args => spawnSync('git', args, { encoding: 'utf8', env: gitEnv, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  const actual = git(['rev-parse', 'HEAD']);
  const head = actual.stdout?.trim();
  const expected = process.env.EXPECTED_SOURCE_SHA;
  if (actual.status !== 0 || !sha(head) || (process.env.CI === 'true' && !sha(expected)) || (expected && expected !== head)) throw new Error('checkout');
  if (process.env.CI === 'true' && (git(['diff', '--quiet', 'HEAD', '--']).status !== 0 || git(['diff', '--cached', '--quiet', '--']).status !== 0)) throw new Error('dirty checkout');
  const config = JSON.parse(readFileSync('doxguard.ci.json', 'utf8'));
  if (!Array.isArray(config.watchlists) || config.watchlists.length || config.includeDefaultExemptPaths !== false || config.failOnSkip !== true || config.requireWatchlists !== false || config.allow?.disallowInlineAllow === true || config.allow?.disallowBareAllow !== true || !Array.isArray(config.exemptPaths) || config.exemptPaths.length || ['windowsPath', 'posixHome', 'privateIp', 'email'].some(key => config.structural?.[key] !== true)) throw new Error('config');
  let launcher = null, runtimeRoot = null;
  const verifyInvocation = () => {
    if (process.env.CI !== 'true') return;
    if (process.platform !== 'linux' || !runtimeRoot) throw new Error('canonical runtime unavailable');
    const identity = verifyRuntime(runtimeRoot);
    if (identity.launcher !== launcher) throw new Error('launcher changed');
    process.stdout.write(JSON.stringify({runtime_use: 'invocation', ...identity.receipt}) + '\n');
  };
  try {
    const require = createRequire(import.meta.url);
    const manifest = process.env.DOXGUARD_PACKAGE_ROOT ? join(resolve(process.env.DOXGUARD_PACKAGE_ROOT), 'package.json') : require.resolve('doxguard/package.json');
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    if (pkg.name !== 'doxguard' || pkg.version !== VERSION) throw new Error('version');
    launcher = join(resolve(manifest, '..'), 'bin/doxguard.js');
    runtimeRoot = resolve(manifest, '../../..');
    verifyInvocation();
    const version = execute([process.execPath, launcher, '--version']);
    if (version.status !== 0 || version.stdout.trim() !== `doxguard ${VERSION}`) launcher = null;
  } catch { /* launcher stays null: dual mode still runs legacy; native-only mode fails closed below. */ }
  if (mode === '--controls') {
    const directory = mkdtempSync(join(tmpdir(), 'dual-controls-'));
    const privateAddress = ['192', '168', '66', '77'].join('.');
    const windows = ['C:', 'Users', 'SyntheticControl', 'sample.txt'].join('\\');
    const cases = [
      ['clean', 'ordinary portable text', false],
      ['private-address', privateAddress, true],
      ['windows-path', windows, true],
      ['home-path', ['', 'home', 'SyntheticControl', 'sample.txt'].join('/'), true],
      ['unapproved-email', ['control', 'synthetic.test'].join('@'), true],
      ['bare-marker', `${privateAddress} # secrets-scan: allow`, true],
      ['scoped-marker', `${windows} # doxguard: allow Users`, false],
      ['unrelated-marker', `${windows} # doxguard: allow OtherControl`, true],
    ];
    let failed = false;
    try {
      for (const [name, content, expectedHit] of cases) {
        const path = join(directory, name + '.txt');
        writeFileSync(path, content + '\n');
        let result;
        try { verifyInvocation(); result = launcher ? execute([process.execPath, launcher, 'scan', '--path', path, '--block', '--strict', '--config', resolve('doxguard.ci.json'), '--format', 'json']) : {status:2,error:true}; } catch { result = {status:2,error:true}; }
        const report = summarize(result, 'doxguard', '--path');
        const passed = report.exit === (expectedHit ? 1 : 0) && report.targets === 1 && report.scanned === 1 && report.coverageSkips === 0 && Boolean(report.hits?.length) === expectedHit;
        failed ||= !passed;
        process.stdout.write(JSON.stringify({ control: name, passed, version: VERSION, expectedSourceSha: expected ?? null, actualHead: head }) + '\n');
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
    process.exitCode = failed ? 1 : 0;
    return;
  }
  const oldMode = mode === '--path-from' ? '--files-from-list' : mode;
  const legacy = [process.execPath, resolve('scripts/secrets-scan.mjs'), oldMode, ...argv.slice(1), '--block', '--format=json'];
  const native = launcher ? [process.execPath, launcher, 'scan', ...argv, '--block', '--strict', '--config', resolve('doxguard.ci.json'), '--format', 'json'] : [];
  let snapshot, output;
  try {
    if (mode === '--staged') snapshot = stagedSnapshot(process.cwd(), process.env);
    const scanExecute = command => {
      if (command === native) verifyInvocation();
      return command.length ? spawnSync(command[0], command.slice(1), { cwd: snapshot?.cwd ?? process.cwd(), encoding: 'utf8', env, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 300000 }) : { status: 2, error: true };
    };
    output = nativeOnly ? runNative({ execute: scanExecute, native, mode }) : runBoth({ execute: scanExecute, legacy, native, mode });
    if (nativeOnly) output.nativeOnly = true;
    if (snapshot) { snapshot.verify(); output.indexSnapshot = { head: snapshot.head, targets: snapshot.targets, bytes: snapshot.bytes }; }
  } finally { snapshot?.cleanup(); }
  if (!nativeOnly && mode !== '--history' && output.results.every(result => integer(result.targets)) && output.results[0].targets !== output.results[1].targets) {
    output.exit = 1;
    output.inputMismatch = true;
  }
  const after = git(['rev-parse', 'HEAD']);
  if (after.status !== 0 || after.stdout.trim() !== head) output.exit = 1;
  if (process.env.CI === 'true' && (git(['diff', '--quiet', 'HEAD', '--']).status !== 0 || git(['diff', '--cached', '--quiet', '--']).status !== 0)) output.exit = 1;
  process.stdout.write(JSON.stringify({ expectedSourceSha: expected ?? null, actualHead: head, ...output }) + '\n');
  process.exitCode = output.exit;
}
const isEntry = () => { try { return import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href; } catch { return false; } };
if (process.argv[1] && isEntry()) {
  try { main(process.argv.slice(2)); } catch { process.stderr.write('dual-scan: invalid configuration, target mode, or checkout identity\n'); process.exitCode = 2; }
}
