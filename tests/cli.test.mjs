import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,['scripts/cli.mjs',...args],{cwd:root,encoding:'utf8',timeout:15000});
const clean='examples/quotation-clean.xlsx',broken='examples/quotation-broken.xlsx';
test('CLI strict auditing distinguishes clean files from candidates without losing JSON output',()=>{
  let r=run('audit',clean,'--fail-on-findings');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).findings.length,0);
  r=run('audit','--fail-on-findings',broken);assert.equal(r.status,2,r.stderr);assert.equal(JSON.parse(r.stdout).findings[0].address,'F7');
  r=run('audit',broken);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).findings.length,1);
});
test('CLI comparisons preserve explicit alignment and strict exit status',()=>{
  let r=run('compare',clean,'examples/quotation-overwritten.xlsx','--aligned','--fail-on-findings');assert.equal(r.status,2,r.stderr);assert.equal(JSON.parse(r.stdout)[0].rule,'formula_replaced');
  r=run('compare',clean,clean,'--fail-on-findings','--aligned');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),[]);
  r=run('compare',clean,broken,'--fail-on-findings');assert.equal(r.status,1);assert.match(r.stderr,/--aligned/);assert.equal(r.stdout,'');
});
test('CLI rejects misspelled flags and extra inputs instead of silently bypassing requested checks',()=>{
  for(const args of [['audit',broken,'--fail-on-finding'],['audit',clean,broken],['audit',clean,'--aligned'],['audit',clean,'--fail-on-findings','--fail-on-findings']]){
    const r=run(...args);assert.equal(r.status,1);assert.equal(r.stdout,'');
  }
});
test('CLI invalid file or metadata returns failure rather than a clean audit',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'mooncell-cli-'));
  try{
    const file=path.join(dir,'invalid.json');await writeFile(file,JSON.stringify({schema:'mooncell.workbook.v1',sheets:['Wrong'],cells:[{sheet:'S',address:'A1',formula:'',value:'1',kind:'number'}]}));
    const r=run('audit',file,'--fail-on-findings');assert.equal(r.status,1);assert.match(r.stderr,/工作表/);assert.equal(r.stdout,'');
    assert.equal(run('audit',path.join(dir,'missing.xlsx')).status,1);
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('CLI help explains exit codes and uncertainty',()=>{
  const r=run('--help');assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/返回 2/);assert.match(r.stdout,/不代表业务数据正确/);
});
