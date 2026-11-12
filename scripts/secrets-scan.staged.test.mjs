import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, unlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stagedSnapshot, gitEnvironment } from './secrets-scan.staged.mjs';
const git=(root,args)=>{const r=spawnSync('git',args,{cwd:root,env:gitEnvironment(process.env),encoding:'utf8'});assert.equal(r.status,0,'synthetic Git setup failed');return r.stdout.trim()};
function fixture(fn){const root=mkdtempSync(join(tmpdir(),'snapshot-test-'));try{git(root,['init','-q']);git(root,['config','user.name','Synthetic']);git(root,['config','user.email',['fixture','example.invalid'].join('@')]);writeFileSync(join(root,'original.txt'),'base\n');git(root,['add','--','original.txt']);git(root,['commit','-qm','synthetic baseline']);fn(root);}finally{rmSync(root,{recursive:true,force:true})}}
function unchanged(root,fn){const head=git(root,['rev-parse','HEAD']),index=readFileSync(join(root,'.git','index'));fn();assert.equal(git(root,['rev-parse','HEAD']),head);assert.deepEqual(readFileSync(join(root,'.git','index')),index)}
test('partial stage snapshot uses index bytes and leaves original worktree/index/HEAD untouched',()=>fixture(root=>{
 writeFileSync(join(root,'original.txt'),'index value\n');git(root,['add','--','original.txt']);writeFileSync(join(root,'original.txt'),'worktree value\n');unchanged(root,()=>{const s=stagedSnapshot(root);try{assert.equal(readFileSync(join(s.cwd,'original.txt'),'utf8'),'index value\n');assert.equal(git(s.cwd,['show',':original.txt']),'index value');assert.equal(git(s.cwd,['show','HEAD:original.txt']),'base');s.verify()}finally{s.cleanup()}});assert.equal(readFileSync(join(root,'original.txt'),'utf8'),'worktree value\n');
}));
test('rename, spaces and leading dash preserve target paths and baseline',()=>fixture(root=>{
 git(root,['mv','--','original.txt','- renamed file.txt']);const s=stagedSnapshot(root);try{assert.equal(s.targets,1);assert.equal(readFileSync(join(s.cwd,'- renamed file.txt'),'utf8'),'base\n');assert.equal(git(s.cwd,['diff','--cached','--name-status']),'R100\toriginal.txt\t- renamed file.txt')}finally{s.cleanup()}
}));
test('deletion-only staged set is empty',()=>fixture(root=>{git(root,['rm','--','original.txt']);const s=stagedSnapshot(root);try{assert.equal(s.targets,0)}finally{s.cleanup()}}));
test('binary staged bytes are unchanged even if worktree unreadable',()=>fixture(root=>{
 const bytes=Buffer.from([255,254,0,4,5]);writeFileSync(join(root,'raw.bin'),bytes);git(root,['add','--','raw.bin']);chmodSync(join(root,'raw.bin'),0);const s=stagedSnapshot(root);try{assert.deepEqual(readFileSync(join(s.cwd,'raw.bin')),bytes)}finally{s.cleanup();chmodSync(join(root,'raw.bin'),0o600)}
}));
test('symlink type change retains index mode but never follows target',()=>fixture(root=>{
 unlinkSync(join(root,'original.txt'));symlinkSync('nonexistent-outside',join(root,'original.txt'));git(root,['add','--','original.txt']);const s=stagedSnapshot(root);try{assert.match(git(s.cwd,['ls-files','--stage']),/^120000 /);assert.equal(readFileSync(join(s.cwd,'original.txt'),'utf8'),'nonexistent-outside')}finally{s.cleanup()}
}));
test('unrelated GIT path variables are rejected case-insensitively, other GIT names are dropped',()=>fixture(root=>{
 for(const bad of [{GIT_DIR:'/nonexistent'},{gIt_wOrK_tReE:'/nonexistent'},{GIT_INDEX_FILE:'/nonexistent'}])assert.throws(()=>stagedSnapshot(root,{...process.env,...bad}),/./);
 const s=stagedSnapshot(root,{...process.env,git_config_count:'1',GIT_NAMESPACE:'x'});try{s.verify();assert.equal(s.targets,0)}finally{s.cleanup()}
 assert.deepEqual(gitEnvironment({GIT_DIR:'x',git_config_count:'1',Path:'safe'}),{Path:'safe',GIT_OPTIONAL_LOCKS:'0'});
}));

// Alternate-index and input-identity tests. Each asserts the exact blob that reaches the snapshot.
const gitE=(root,args,extra={},input)=>{const r=spawnSync('git',args,{cwd:root,env:{...gitEnvironment(process.env),...extra},encoding:'utf8',input});assert.equal(r.status,0,'synthetic Git setup failed');return r.stdout.trim()};
const alt=(root,name='alt-index.tmp')=>{const p=join(root,'.git',name);gitE(root,['read-tree','HEAD'],{GIT_INDEX_FILE:p});return p};
const blobOf=(root,text)=>gitE(root,['hash-object','--stdin'],{},text);
function inspected(s,root,path,text){
 assert.equal(readFileSync(join(s.cwd,path),'utf8'),text);
 assert.equal(gitE(s.cwd,['rev-parse',':'+path]),blobOf(root,text));
}
test('1 normal index with one staged file is inspected',()=>fixture(root=>{
 writeFileSync(join(root,'one.txt'),'normal blob\n');git(root,['add','--','one.txt']);
 const s=stagedSnapshot(root);try{assert.equal(s.targets,1);inspected(s,root,'one.txt','normal blob\n')}finally{s.cleanup()}
}));
test('2 alternate index with one file while normal index is empty is inspected',()=>fixture(root=>{
 const p=alt(root);writeFileSync(join(root,'two.txt'),'alternate blob\n');gitE(root,['add','--','two.txt'],{GIT_INDEX_FILE:p});
 for(const value of [p,join('.git','alt-index.tmp')]){
  const s=stagedSnapshot(root,{...process.env,GIT_INDEX_FILE:value});try{assert.equal(s.targets,1);inspected(s,root,'two.txt','alternate blob\n');s.verify()}finally{s.cleanup()}
 }
 assert.equal(git(root,['diff','--cached','--name-only']),'');
}));
test('3 empty alternate index wins over a non-empty normal index',()=>fixture(root=>{
 const p=alt(root);writeFileSync(join(root,'three.txt'),'normal only\n');git(root,['add','--','three.txt']);
 const s=stagedSnapshot(root,{...process.env,GIT_INDEX_FILE:p});try{assert.equal(s.targets,0);assert.equal(gitE(s.cwd,['ls-files']),'original.txt')}finally{s.cleanup()}
 const n=stagedSnapshot(root);try{assert.equal(n.targets,1);inspected(n,root,'three.txt','normal only\n')}finally{n.cleanup()}
}));
test('4 partial staging inspects the staged blob, not the worktree',()=>fixture(root=>{
 const p=alt(root);writeFileSync(join(root,'original.txt'),'staged part\n');gitE(root,['add','--','original.txt'],{GIT_INDEX_FILE:p});writeFileSync(join(root,'original.txt'),'worktree part\n');
 for(const env of [{...process.env,GIT_INDEX_FILE:p}]){const s=stagedSnapshot(root,env);try{assert.equal(s.targets,1);inspected(s,root,'original.txt','staged part\n')}finally{s.cleanup()}}
 git(root,['add','--','original.txt']);writeFileSync(join(root,'original.txt'),'later edit\n');
 const n=stagedSnapshot(root);try{assert.equal(n.targets,1);inspected(n,root,'original.txt','worktree part\n')}finally{n.cleanup()}
}));
test('5 commit-only state (index equals HEAD) has no targets for normal and alternate index',()=>fixture(root=>{
 const p=alt(root);writeFileSync(join(root,'extra.txt'),'normal only\n');git(root,['add','--','extra.txt']);
 const n=stagedSnapshot(root);try{assert.equal(n.targets,1);inspected(n,root,'extra.txt','normal only\n')}finally{n.cleanup()}
 const a=stagedSnapshot(root,{...process.env,GIT_INDEX_FILE:p});try{assert.equal(a.targets,0);assert.equal(gitE(a.cwd,['ls-files']),'original.txt')}finally{a.cleanup()}
 git(root,['rm','-q','--cached','--','extra.txt']);
 for(const env of [process.env,{...process.env,GIT_INDEX_FILE:p}]){const s=stagedSnapshot(root,env);try{assert.equal(s.targets,0);assert.equal(gitE(s.cwd,['rev-parse',':original.txt']),blobOf(root,'base\n'));s.verify()}finally{s.cleanup()}}
}));
test('6 inherited variables for an unrelated repository are rejected',()=>fixture(root=>{
 const other=mkdtempSync(join(tmpdir(),'snapshot-other-'));
 try{
  git(other,['init','-q']);writeFileSync(join(other,'x.txt'),'other\n');git(other,['add','--','x.txt']);
  const outside=join(tmpdir(),'snapshot-outside-index-'+process.pid);writeFileSync(outside,'');
  try{
   for(const bad of [{GIT_DIR:join(other,'.git')},{GIT_WORK_TREE:other},{GIT_INDEX_FILE:join(other,'.git','index')},{GIT_INDEX_FILE:outside},{GIT_COMMON_DIR:join(other,'.git')},{GIT_INDEX_FILE:join(root,'.git')}])
    assert.throws(()=>stagedSnapshot(root,{...process.env,...bad}),/./,JSON.stringify(Object.keys(bad)));
  }finally{rmSync(outside,{force:true})}
  assert.equal(git(other,['ls-files']),'x.txt');
 }finally{rmSync(other,{recursive:true,force:true})}
}));
test('7 deletion-only staged set stays an explicit empty set and a missing alternate index is a failure',()=>fixture(root=>{
 git(root,['rm','--','original.txt']);const s=stagedSnapshot(root);try{assert.equal(s.targets,0)}finally{s.cleanup()}
 assert.throws(()=>stagedSnapshot(root,{...process.env,GIT_INDEX_FILE:join(root,'.git','absent-index')}));
}));
test('source index change after snapshot is detected',()=>fixture(root=>{
 const s=stagedSnapshot(root);try{writeFileSync(join(root,'new.txt'),'changed');git(root,['add','--','new.txt']);assert.throws(()=>s.verify())}finally{s.cleanup()}
}));
test('unmerged index is rejected without modifying original state',()=>fixture(root=>{
 const oid=git(root,['rev-parse','HEAD:original.txt']);git(root,['update-index','--force-remove','--','original.txt']);const record=`100644 ${oid} 1\toriginal.txt\n100644 ${oid} 2\toriginal.txt\n`;const r=spawnSync('git',['update-index','--index-info'],{cwd:root,env:gitEnvironment(process.env),input:record,encoding:'utf8'});assert.equal(r.status,0);unchanged(root,()=>assert.throws(()=>stagedSnapshot(root),/unmerged/));
}));
test('missing staged blob is a coverage failure, not an empty success',()=>fixture(root=>{
 const oid='1'.repeat(40);git(root,['update-index','--add','--cacheinfo',`100644,${oid},missing.txt`]);unchanged(root,()=>assert.throws(()=>stagedSnapshot(root)));
}));
test('newline filenames fail closed instead of truncating target list',()=>fixture(root=>{
 writeFileSync(join(root,'line\nbreak.txt'),'synthetic');git(root,['add','--','line\nbreak.txt']);unchanged(root,()=>assert.throws(()=>stagedSnapshot(root),/unrepresentable/));
}));
