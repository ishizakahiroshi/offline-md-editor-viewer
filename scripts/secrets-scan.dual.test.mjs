import { statSync, symlinkSync, unlinkSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { scannerEnvironment, redactMetadata, summarize, runBoth, runNative, verifyRuntime, canonicalRuntime } from './secrets-scan.dual.mjs';
const clean = (extra = {}) => ({ status: 0, stdout: JSON.stringify({ total_files: 2, scanned: 2, kb_needles:0, family_needles:0, coverage_skips: 0, watchlist_needles: 0, structural_patterns:4, watchlist_statistics:{candidates:0,loaded:0}, baseline_applied:false,baseline_suppressed_hits:0, hits: [], ...extra }) });
const value = ['192', '168', '67', '89'].join('.');
const leak = () => ({ status: 1, stdout: JSON.stringify({ total_files: 2, scanned: 2, kb_needles:0, family_needles:0, hits: [{ file: `fixture-${value}.txt`, lineNumber: 3, matched: value, source: `structural fixture ${value}`, line: `never print ${value}` }] }) });

test('legacy failure still executes native and fails aggregate', () => {
  const calls = [];
  const out = runBoth({ execute: c => { calls.push(c); return calls.length === 1 ? leak() : clean(); }, legacy: ['old'], native: ['new'], mode: '--all-tracked' });
  assert.equal(calls.length, 2); assert.equal(out.exit, 1); assert.equal(out.results[1].exit, 0);
});
test('native failure rejects successful legacy', () => {
  let calls = 0;
  const out = runBoth({ execute: () => ++calls === 1 ? clean() : { status: 2, stdout: 'invalid' }, legacy: [], native: [], mode: '--all-tracked' });
  assert.equal(out.exit, 1); assert.equal(calls, 2);
});
test('throwing first scanner still runs second', () => {
  let calls = 0;
  const out = runBoth({ execute: () => { if (++calls === 1) throw new Error('hidden'); return clean(); }, legacy: [], native: [], mode: '--all-tracked' });
  assert.equal(calls, 2); assert.equal(out.exit, 1);
});
test('both successful reports permit aggregate', () => {
  assert.equal(runBoth({ execute: () => clean(), legacy: [], native: [], mode: '--all-tracked' }).exit, 0);
});
test('redacts matches from filenames and reason, discards raw source and stderr', () => {
  const result = summarize({ ...leak(), stderr: `raw ${value}` }, 'legacy', '--all-tracked');
  const text = JSON.stringify(result);
  assert.equal(text.includes(value), false); assert.equal(text.includes('never print'), false); assert.equal(text.includes('raw'), false);
  assert.equal(result.hits[0].file, 'fixture-[redacted].txt'); assert.equal(result.hits[0].line, 3); assert.ok(result.hits[0].reason.includes('[redacted]'));
});
test('path separator runs, case, bare leading slash and punctuation aliases redact', () => {
  const p = ['C:', 'Users', 'SyntheticPerson'].join('/');
  assert.equal(redactMetadata(p.toUpperCase().replaceAll('/', '\\\\'), [p]), '[redacted]');
  assert.equal(redactMetadata('home/SyntheticPerson/file', [['', 'home', 'SyntheticPerson.'].join('/')]), '[redacted]/file');
});
test('terminal control and workflow injection cannot make additional lines', () => {
  assert.equal(redactMetadata('safe\n::error::\u202etest', []), 'safe\\u000a::error::\\u202etest');
});
test('public scanner environment removes private settings regardless of spelling', () => {
  assert.deepEqual(scannerEnvironment({ kb_root: 'hidden', FAMILY_root: 'hidden', Doxguard_Config: 'hidden', DOXGUARD_BINARY_PATH: 'hidden', Path: 'safe' }), { Path: 'safe', GIT_OPTIONAL_LOCKS: '0' });
});
test('local legacy retains existing watchlist variables without transferring native overrides', () => {
  assert.deepEqual(scannerEnvironment({ KB_ROOT: 'private', FAMILY_ROOT: 'private', DOXGUARD_CONFIG: 'private' }, false), { KB_ROOT: 'private', FAMILY_ROOT: 'private', GIT_OPTIONAL_LOCKS: '0' });
});
test('strict native coverage skip fails even if child exits zero', () => {
  assert.equal(summarize(clean({ coverage_skips: 1 }), 'doxguard', '--all-tracked').exit, 1);
});
test('private watchlist unexpectedly loaded fails closed without raw output', () => {
  assert.equal(summarize(clean({ watchlist_needles: 1 }), 'doxguard', '--all-tracked').exit, 2);
});
test('missing counts, malformed hits, killed subprocess fail closed', () => {
  for (const result of [{ status: 0, stdout: '{}' }, clean({ hits: [null] }), { ...clean(), signal: 'SIGTERM' }]) assert.equal(summarize(result, 'legacy', '--all-tracked').exit, 2);
});

// Synthetic Linux mode is explicit: Windows chmod does not emulate POSIX
// execute bits. Actual production calls always use the default real statSync.
const syntheticExecutableStat = path => ({isFile:()=>statSync(path).isFile(),mode:0o755});
function syntheticRuntime() {
  const root=mkdtempSync(join(tmpdir(),'runtime-unit-'));
  const a=join(root,'node_modules','doxguard');
  const b=join(root,'node_modules','@ishizakahiroshi','doxguard-linux-x64');
  for(const dir of [a,b])mkdirSync(join(dir,'bin'),{recursive:true});
  const rootMeta={name:'doxguard',version:'0.2.0',type:'module',bin:{doxguard:'bin/doxguard.js'},optionalDependencies:{'@ishizakahiroshi/doxguard-linux-x64':'0.2.0'}};
  const platformMeta={name:'@ishizakahiroshi/doxguard-linux-x64',version:'0.2.0',bin:{doxguard:'bin/doxguard'},os:['linux'],cpu:['x64']};
  const reset=()=>{writeFileSync(join(a,'package.json'),JSON.stringify(rootMeta));writeFileSync(join(b,'package.json'),JSON.stringify(platformMeta));writeFileSync(join(a,'bin','doxguard.js'),'synthetic-launcher');writeFileSync(join(b,'bin','doxguard'),'synthetic-native');chmodSync(join(b,'bin','doxguard'),0o755);};
  reset();
  const hash=value=>createHash('sha256').update(value).digest('hex');
  return {root,a,b,rootMeta,platformMeta,reset,expected:{arch:'x64',payload:hash('synthetic-native'),launcher:hash('synthetic-launcher')}};
}
test('runtime identity matches exact root/platform relationship and both hashes',()=>{
  const f=syntheticRuntime();
  try {
    const identity=verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat);
    assert.equal(identity.receipt.canonical_match,true);
    assert.equal(identity.receipt.payload_sha256,f.expected.payload);
    assert.equal(identity.receipt.launcher_sha256,f.expected.launcher);
    assert.throws(()=>verifyRuntime(f.root,'x64',canonicalRuntime,syntheticExecutableStat), /canonical hash mismatch/); // synthetic bytes are never accepted as public release
    assert.throws(()=>verifyRuntime(f.root,'arm64',f.expected,syntheticExecutableStat));
    assert.equal(canonicalRuntime.payload,'5458f08f85753cf6d33ad869063af16ca8f55a800bb9d17a78c4b6adc0651279');
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test('runtime rejects wrong optional pin, bin, module type and platform metadata',()=>{
  const f=syntheticRuntime();
  try {
    for(const change of [{version:'0.2.1'},{name:'other'},{type:'commonjs'},{bin:{doxguard:'other.js'}},{optionalDependencies:{}},{optionalDependencies:{'@ishizakahiroshi/doxguard-linux-x64':'^0.2.0'}}]) {
      f.reset();writeFileSync(join(f.a,'package.json'),JSON.stringify({...f.rootMeta,...change}));assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));
    }
    for(const change of [{name:'other'},{version:'0.2.1'},{exports:{'./package.json':'./other.json'}},{bin:{doxguard:'elsewhere'}},{os:['darwin']},{os:['linux','darwin']},{cpu:['arm64']},{cpu:['x64','arm64']}]) {
      f.reset();writeFileSync(join(f.b,'package.json'),JSON.stringify({...f.platformMeta,...change}));assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));
    }
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test('runtime rejects either altered payload and nonexecutable native before invocation',()=>{
  const f=syntheticRuntime();
  try {
    for(const path of [join(f.a,'bin','doxguard.js'),join(f.b,'bin','doxguard')]) {
      f.reset();writeFileSync(path,'different-bytes');assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));
    }
    f.reset();
    assert.doesNotThrow(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));
    const nonExecutableStat=path=>({...syntheticExecutableStat(path),mode:0o644});
    assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,nonExecutableStat), /entrypoint mismatch/);
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test('runtime rejects nested platform package resolution despite matching outer package',()=>{
  const f=syntheticRuntime();
  try {
    const nested=join(f.a,'node_modules','@ishizakahiroshi','doxguard-linux-x64');mkdirSync(nested,{recursive:true});writeFileSync(join(nested,'package.json'),JSON.stringify(f.platformMeta));
    assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test('runtime rejects symlinked launcher and payload despite matching bytes',()=>{
  const f=syntheticRuntime();
  try {
    for(const [path,bytes] of [[join(f.a,'bin','doxguard.js'),'synthetic-launcher'],[join(f.b,'bin','doxguard'),'synthetic-native']]) {
      const target=join(f.root,'redirected');writeFileSync(target,bytes);chmodSync(target,0o755);unlinkSync(path);symlinkSync(target,path);
      assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));unlinkSync(path);f.reset();
    }
  } finally {rmSync(f.root,{recursive:true,force:true});}
});

test('runtime rejects nested candidates added after successful cached resolution',()=>{
  for(const sub of ['', 'bin']) {
    const f=syntheticRuntime();
    try {
      assert.doesNotThrow(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat));
      const nested=join(f.a,sub,'node_modules','@ishizakahiroshi','doxguard-linux-x64');
      mkdirSync(nested,{recursive:true});writeFileSync(join(nested,'package.json'),JSON.stringify(f.platformMeta));
      assert.throws(()=>verifyRuntime(f.root,'x64',f.expected,syntheticExecutableStat), /nested platform candidate/);
    } finally {rmSync(f.root,{recursive:true,force:true});}
  }
});

test('native baseline, candidate watchlists, structural weakening and invalid target count fail closed', () => {
  for (const change of [{baseline_applied:true},{baseline_suppressed_hits:1},{structural_patterns:3},{watchlist_statistics:{candidates:1,loaded:0}},{scanned:3}]) assert.equal(summarize(clean(change),'doxguard','--all-tracked').exit,2);
  assert.equal(summarize(clean({total_files:0,scanned:0}),'doxguard','--staged').exit,0);
});

// --native-only end-to-end: a synthetic repo that has NO scripts/secrets-scan.mjs, scanned through a
// fake exact-version native package. CI is not 'true', so the Linux hash pin is not part of this test.
const fakeLauncher = `
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('doxguard 0.2.0'); process.exit(0); }
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\\r?\\n/).filter(Boolean);
const hits = [];
for (const file of files) readFileSync(file, 'utf8').split(/\\r?\\n/).forEach((line, i) => {
  const m = line.match(/\\b192\\.168\\.\\d+\\.\\d+\\b/);
  if (m) hits.push({ file, lineNumber: i + 1, matched: m[0], source: 'structural private-ip' });
});
console.log(JSON.stringify({ total_files: files.length, scanned: files.length, coverage_skips: 0, watchlist_needles: 0, structural_patterns: 4,
  watchlist_statistics: { candidates: 0, loaded: 0 }, baseline_applied: false, baseline_suppressed_hits: 0, hits }));
process.exit(hits.length ? 1 : 0);
`;
function nativeOnlyFixture(content, withPackage = true) {
  const root = mkdtempSync(join(tmpdir(), 'native-only-'));
  mkdirSync(join(root, 'scripts'));
  for (const name of ['secrets-scan.dual.mjs', 'secrets-scan.staged.mjs']) copyFileSync(join(import.meta.dirname, name), join(root, 'scripts', name));
  copyFileSync(join(import.meta.dirname, '..', 'doxguard.ci.json'), join(root, 'doxguard.ci.json'));
  writeFileSync(join(root, 'sample.txt'), content + '\n');
  const pkg = join(root, 'fake-pkg');
  mkdirSync(join(pkg, 'bin'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'doxguard', version: '0.2.0', type: 'module' }));
  writeFileSync(join(pkg, 'bin', 'doxguard.js'), fakeLauncher);
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: root, stdio: 'ignore' });
  git('init', '-q'); git('add', 'sample.txt', 'doxguard.ci.json', 'scripts'); git('commit', '-q', '-m', 'fixture');
  const env = { ...process.env, DOXGUARD_PACKAGE_ROOT: withPackage ? pkg : join(root, 'no-such-package') };
  delete env.CI; delete env.EXPECTED_SOURCE_SHA;
  const run = (...args) => {
    const r = spawnSync(process.execPath, [join(root, 'scripts', 'secrets-scan.dual.mjs'), ...args], { cwd: root, env, encoding: 'utf8', timeout: 120000 });
    let report = null; try { report = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch {}
    return { status: r.status, report };
  };
  return { root, run };
}
test('native-only: detection exits 1, runs only the native scanner, needs no legacy script', () => {
  const f = nativeOnlyFixture(['192', '168', '66', '77'].join('.'));
  try {
    const r = f.run('--native-only', '--all-tracked');
    assert.equal(r.status, 1);
    assert.deepEqual(r.report?.results.map(x => x.scanner), ['doxguard']);
    assert.equal(r.report.results[0].hits.length, 1);
    assert.equal(r.report.nativeOnly, true);
    assert.equal(JSON.stringify(r.report).includes(['192', '168', '66', '77'].join('.')), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('native-only: clean repo exits 0 (flag position is free)', () => {
  const f = nativeOnlyFixture('ordinary portable text');
  try {
    for (const args of [['--native-only', '--all-tracked'], ['--all-tracked', '--native-only']]) {
      const r = f.run(...args);
      assert.equal(r.status, 0); assert.deepEqual(r.report?.results.map(x => x.scanner), ['doxguard']);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('native-only: missing native package fails closed without falling back', () => {
  const f = nativeOnlyFixture('ordinary portable text', false);
  try {
    const r = f.run('--native-only', '--all-tracked');
    assert.ok(r.status >= 1);
    assert.deepEqual(r.report?.results.map(x => x.scanner), ['doxguard']);
    assert.equal(r.report.results[0].exit, 2);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('native-only: duplicate flag and unknown mode are rejected', () => {
  const f = nativeOnlyFixture('ordinary portable text');
  try {
    assert.equal(f.run('--native-only', '--native-only', '--all-tracked').status, 2);
    assert.equal(f.run('--native-only').status, 2);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('runNative: failure, throw and coverage skip are failures', () => {
  assert.equal(runNative({ execute: () => clean(), native: [], mode: '--all-tracked' }).exit, 0);
  assert.equal(runNative({ execute: () => { throw new Error('hidden'); }, native: [], mode: '--all-tracked' }).exit, 1);
  assert.equal(runNative({ execute: () => ({ status: 2, stdout: 'invalid' }), native: [], mode: '--all-tracked' }).exit, 1);
  assert.equal(runNative({ execute: () => clean({ coverage_skips: 1 }), native: [], mode: '--all-tracked' }).exit, 1);
});

test('legacy unexpected stderr is redacted but fails coverage acceptance',()=>{
 const output=summarize({...clean(),stderr:'unexpected synthetic warning'},'legacy','--all-tracked');
 assert.equal(output.exit,2);assert.equal(output.coverageWarnings,1);assert.equal(JSON.stringify(output).includes('synthetic warning'),false);
});
