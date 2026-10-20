import test from 'node:test';
import assert from 'node:assert/strict';
import {core} from '../web/api.mjs';
import {demo} from '../web/demo.mjs';
import {VERSION,findingKey,sealSession,restoreSession,normalizeBook} from '../web/session.mjs';
import {reviewReport,htmlReport} from '../web/report.mjs';
function state(){const book=normalizeBook(demo('broken')),old=normalizeBook(demo('clean')),report=core({action:'audit',cells:book.cells}),diff=core({action:'compare',before:old.cells,after:book.cells});return {book,old,report,diff,source:'demo',hash:'',oldHash:'',comparisonPerformed:true,aligned:true,reviews:new Map([[findingKey(report.findings[0],book),{state:'exception',note:'已与同事核对，保留原公式'}]])}}
function payload(s){return {engine:VERSION,createdAt:new Date().toISOString(),book:s.book,old:s.old,source:s.source,hash:s.hash,oldHash:s.oldHash,comparisonPerformed:s.comparisonPerformed,aligned:s.aligned,reviews:[...s.reviews].map(([key,r])=>({key,...r}))}}
test('session restores independently recomputed findings, baseline and human notes',async()=>{
  const s=state(),bundle=await sealSession(payload(s));let calls=0;
  const r=await restoreSession(JSON.stringify(bundle),x=>{calls++;return core(x)});
  assert.equal(calls,3);assert.deepEqual(r.report,s.report);assert.deepEqual(r.diff,s.diff);assert.equal(r.reviews[0].note,'已与同事核对，保留原公式');
});
test('changed input without new checksum is rejected',async()=>{
  const bundle=await sealSession(payload(state()));bundle.payload.book.cells[0].value='changed';
  await assert.rejects(restoreSession(JSON.stringify(bundle),core),/完整性/);
});
test('recomputed checksum cannot reattach judgments to different evidence',async()=>{
  const p=payload(state());p.book=normalizeBook(demo('clean'));
  await assert.rejects(restoreSession(JSON.stringify(await sealSession(p)),core),/证据不一致/);
});
test('numeric contents bind constant-gap review identity',()=>{
  const a=normalizeBook(demo('overwritten')),f=core({action:'audit',cells:a.cells}).findings[0],k=findingKey(f,a);
  a.cells.find(c=>c.address==='F7').value='123';assert.notEqual(findingKey(f,a),k);
});
test('legacy reports cannot silently restore a partial workspace',async()=>{
  await assert.rejects(restoreSession(JSON.stringify({schema:'mooncell.review.v1'}),core),/不能恢复/);
});
test('unknown engine, invalid review state, duplicate records and unaligned comparisons fail',async()=>{
  for(const mutate of [p=>p.engine='9.0.0',p=>p.reviews[0].state='approved',p=>p.reviews.push(p.reviews[0]),p=>p.aligned=false,p=>p.reviews[0].note='x'.repeat(2001)]){
    const p=payload(state());mutate(p);await assert.rejects(sealSession(p));
  }
});
test('book metadata is bounded and invalid sheets cannot hide cells',()=>{
  const b=demo();assert.throws(()=>normalizeBook({...b,sheets:['Missing']}),/工作表/);
  assert.throws(()=>normalizeBook({...b,warnings:['x'.repeat(2049)]}),/提示/);
});
test('HTML report escapes input, contains notes and does not embed executable scripts',()=>{
  const s=state();s.book.name='<script>alert(1)</script>';s.reviews.set(findingKey(s.report.findings[0],s.book),{state:'confirmed',note:'<img src=x onerror=alert(1)>'});
  const html=htmlReport(reviewReport(s));assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script|<img/);assert.match(html,/确认问题/);assert.match(html,/已确认位置对应并比较/);
});

test('reports include computed impacts only for the same workbook and candidate',()=>{
  const s=state(),f=s.report.findings[0],result=core({action:'preview',cells:s.book.cells,sheet:f.sheet,address:f.address,candidate:f.candidate});
  s.previews=new Map([[findingKey(f,s.book),{book:s.book,result,computedAt:'2026-10-20T06:00:00Z'}]]);
  let report=reviewReport(s);assert.equal(report.items[0].preview.impacts.find(i=>i.address==='F14').after,57876);assert.match(htmlReport(report),/57876/);assert.match(htmlReport(report),/原文件未修改/);
  s.book=structuredClone(s.book);report=reviewReport(s);assert.equal(report.items[0].preview,null);assert.match(htmlReport(report),/本次未计算预览/);
  s.previews=new Map([[findingKey(f,s.book),{book:s.book,result:{...result,candidate:'=0'}}]]);assert.equal(reviewReport(s).items[0].preview,null);
});

test('report preview failures stay explicit and escaped',()=>{
  const s=state(),f=s.report.findings[0];s.previews=new Map([[findingKey(f,s.book),{book:s.book,computedAt:'2026-10-20T06:00:00Z',result:{candidate:f.candidate,unresolved_formulas:2,impacts:[{sheet:'<script>bad</script>',address:'F14',before:null,after:null,error:'<img src=x> 不支持的函数'}]}}]]);
  const html=htmlReport(reviewReport(s));assert.match(html,/2 个公式无法解析/);assert.match(html,/&lt;img/);assert.match(html,/不支持的函数/);assert.doesNotMatch(html,/<script|<img/);
});
