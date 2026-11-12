import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

export function gitEnvironment(input) {
  const env={...input};
  for(const name of Object.keys(env)) if(name.toUpperCase().startsWith('GIT_')) delete env[name];
  env.GIT_OPTIONAL_LOCKS='0';
  return env;
}
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const norm=p=>process.platform==='win32'?p.toLowerCase():p;
const same=(a,b)=>norm(realpathSync(a))===norm(realpathSync(b));
const inside=(parent,child)=>{const r=relative(norm(realpathSync(parent)),norm(realpathSync(child)));return r!==''&&!r.startsWith('..')&&!isAbsolute(r);};
const gitOut=(cwd,env,args)=>{
  const result=spawnSync('git',args,{cwd,env,maxBuffer:64*1024*1024,timeout:60000,windowsHide:true});
  if(result.error||result.signal||result.status!==0)throw new Error('staged snapshot Git operation failed');
  return result.stdout;
};
// Resolve which repository and which index the caller means. The repository is always the one
// discovered from `root`. An inherited GIT_INDEX_FILE (alternate index, as Git sets for
// `git commit <paths>`) is kept only when it is an existing regular file inside that repository's
// own git dir. Inherited GIT_DIR / GIT_WORK_TREE / GIT_COMMON_DIR must point at that same
// repository or the call fails. Every other GIT_* name is dropped. Anything undecidable throws.
export function gitContext(root, inputEnv=process.env) {
  const clean=gitEnvironment(inputEnv);
  const q=args=>decode(gitOut(root,clean,args)).trim();
  const gitDir=q(['rev-parse','--absolute-git-dir']);
  const top=q(['rev-parse','--show-toplevel']);
  const common=resolve(root,q(['rev-parse','--path-format=absolute','--git-common-dir']));
  const found=new Map();
  for(const [name,value] of Object.entries(inputEnv)){
    const upper=name.toUpperCase();
    if(!['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE'].includes(upper)||value===undefined)continue;
    if(found.has(upper)||typeof value!=='string'||value==='')throw new Error('ambiguous Git path variable');
    found.set(upper,value);
  }
  try{
    if(found.has('GIT_DIR')&&!same(resolve(root,found.get('GIT_DIR')),gitDir))throw new Error('x');
    if(found.has('GIT_WORK_TREE')&&!same(resolve(root,found.get('GIT_WORK_TREE')),top))throw new Error('x');
    if(found.has('GIT_COMMON_DIR')&&!same(resolve(root,found.get('GIT_COMMON_DIR')),common))throw new Error('x');
    let index;
    if(found.has('GIT_INDEX_FILE')){
      index=resolve(root,found.get('GIT_INDEX_FILE'));
      if(!lstatSync(index).isFile()||!inside(gitDir,index))throw new Error('x');
    }else index=resolve(root,q(['rev-parse','--git-path','index']));
    const env=index&&found.has('GIT_INDEX_FILE')?{...clean,GIT_INDEX_FILE:index}:clean;
    return {env,clean,index,gitDir,alternateIndex:found.has('GIT_INDEX_FILE')};
  }catch{throw new Error('inherited Git path variable does not belong to this repository');}
}
export function stagedSnapshot(root, inputEnv=process.env) {
  const ctx=gitContext(root,inputEnv);
  const run=(cwd,args,input)=>{
    const result=spawnSync('git',args,{cwd,env:cwd===root?ctx.env:ctx.clean,input,maxBuffer:64*1024*1024,timeout:60000,windowsHide:true});
    if(result.error||result.signal||result.status!==0)throw new Error('staged snapshot Git operation failed');
    return result.stdout;
  };
  const head=decode(run(root,['rev-parse','HEAD'])).trim();
  const index=ctx.index;
  const indexBefore=hash(readFileSync(index));
  const entries=run(root,['ls-files','--stage','-z']);
  const records=decode(entries).split('\0').filter(Boolean);
  if(records.length>100000)throw new Error('staged snapshot target limit');
  const indexed=new Map();
  for(const record of records){
    const m=/^(100644|100755|120000|160000) ([a-f0-9]{40,64}) 0\t([\s\S]+)$/.exec(record);
    if(!m)throw new Error('unmerged or unsupported index entry');
    const path=m[3];
    if(path.startsWith('/')||path.split('/').some(x=>!x||x==='..'||x==='.'||x.toLowerCase()==='.git')||/[\r\n\0\\:]/.test(path))throw new Error('unrepresentable index path');
    indexed.set(path,{mode:m[1],oid:m[2]});
  }
  const selected=decode(run(root,['diff','--cached','--name-only','-z','--no-ext-diff','--no-textconv','--diff-filter=ACMRT','HEAD','--'])).split('\0').filter(Boolean);
  const objectDir=decode(run(root,['rev-parse','--path-format=absolute','--git-path','objects'])).trim();
  if(/[\r\n]/.test(objectDir))throw new Error('unrepresentable object directory');
  const directory=mkdtempSync(join(tmpdir(),'doxguard-staged-'));
  const verify=()=>{
    if(decode(run(root,['rev-parse','HEAD'])).trim()!==head||hash(readFileSync(index))!==indexBefore)throw new Error('source HEAD or index changed');
  };
  try{
    run(directory,['init','--quiet','--object-format='+ (head.length===64?'sha256':'sha1')]);
    mkdirSync(join(directory,'.git','objects','info'),{recursive:true});
    writeFileSync(join(directory,'.git','objects','info','alternates'),objectDir+'\n');
    run(directory,['update-ref','HEAD',head]);
    run(directory,['read-tree','--empty']);
    run(directory,['update-index','-z','--index-info'],entries);
    let bytes=0;
    for(const path of selected){
      const entry=indexed.get(path);if(!entry)throw new Error('selected path absent from index');
      if(entry.mode==='160000')throw new Error('submodule target requires explicit coverage');
      const body=run(root,['cat-file','blob',entry.oid]);bytes+=body.length;
      if(bytes>512*1024*1024)throw new Error('staged snapshot byte limit');
      const target=join(directory,path);mkdirSync(dirname(target),{recursive:true});
      // A symlink is represented by its literal index bytes, never followed. Native
      // staged scanning still sees mode 120000 and retains its coverage failure.
      writeFileSync(target,body,{mode:entry.mode==='100755'?0o755:0o644});
    }
    verify();
    return {cwd:directory,head,targets:selected.length,bytes,verify,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
  }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}
