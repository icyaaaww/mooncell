import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import {core} from '../web/api.mjs';
import {readXlsx,inspectZip} from '../web/xlsx.mjs';
import {demo} from '../web/demo.mjs';
const translate=(formula,from,to)=>core({action:'translate',formula,from,to});
const fixture=async name=>new Uint8Array(await readFile(new URL('../examples/quotation-'+name+'.xlsx',import.meta.url)));
function archive(sheet,shared=''){
  return zipSync({
    'xl/workbook.xml':strToU8('<workbook xmlns:r="x"><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml':strToU8(sheet),
    ...(shared?{'xl/sharedStrings.xml':strToU8(shared)}:{})
  });
}
test('independent XLSX producer imports and diagnoses actual cells',async()=>{
  const book=readXlsx(await fixture('broken'),translate);
  assert.equal(book.cells.find(c=>c.address==='A3').value,'调研访谈');
  const result=core({action:'audit',cells:book.cells});
  assert.equal(result.findings.length,1);assert.equal(result.findings[0].address,'F7');assert.equal(result.findings[0].candidate,'=D7*E7');
});
test('clean and legitimate exception fixtures are reported honestly',async()=>{
  const clean=core({action:'audit',cells:readXlsx(await fixture('clean'),translate).cells});assert.equal(clean.findings.length,0);
  const exception=core({action:'audit',cells:readXlsx(await fixture('exception'),translate).cells});assert.equal(exception.findings.length,1);assert.match(exception.findings[0].message,/业务例外/);
});
test('preview matches independent Python arithmetic reference',async()=>{
  const book=readXlsx(await fixture('broken'),translate);
  const ref=JSON.parse(await readFile(new URL('../examples/reference-values.json',import.meta.url)));
  const result=core({action:'preview',cells:book.cells,sheet:'项目报价',address:'F7',candidate:'=D7*E7'});
  assert.equal(result.impacts.length,3);
  for(const impact of result.impacts){assert.equal(impact.error,'');assert.equal(impact.before,ref[impact.address].before);assert.equal(impact.after,ref[impact.address].after)}
});
test('constant gap is a candidate while prior version confirms formula replacement',async()=>{
  const current=readXlsx(await fixture('overwritten'),translate).cells;
  const findings=core({action:'audit',cells:current}).findings;
  assert.equal(findings.length,1);assert.equal(findings[0].rule,'constant_gap');
  const changes=core({action:'compare',before:readXlsx(await fixture('clean'),translate).cells,after:current});
  assert.equal(changes.length,1);assert.equal(changes[0].rule,'formula_replaced');assert.equal(changes[0].address,'F7');
});
test('shared formulas expand with absolute references preserved',()=>{
  const bytes=archive('<worksheet><sheetData><row><c r="C1"><f t="shared" si="0" ref="C1:C2">$A1*B$1</f><v>10</v></c></row><row><c r="C2"><f t="shared" si="0"/><v>20</v></c></row></sheetData></worksheet>');
  const book=readXlsx(bytes,translate);assert.equal(book.cells[1].formula,'=$A2*B$1');
});
test('shared rich strings preserve whitespace and XML escapes',()=>{
  const bytes=archive('<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>','<sst><si><r><t> A &amp; </t></r><r><t>B </t></r></si></sst>');
  assert.equal(readXlsx(bytes,translate).cells[0].value,' A & B ');
});
test('array formulas are exposed as unsupported',()=>{
  const bytes=archive('<worksheet><sheetData><row><c r="A1"><f t="array" ref="A1:A2">SUM(B1:B2)</f></c></row><row><c r="A2"><v>7</v></c></row></sheetData></worksheet>');
  const book=readXlsx(bytes,translate);assert.equal(core({action:'audit',cells:book.cells}).skipped.length,1);
  assert.equal(book.cells[1].kind,'unsupported');
});
test('duplicate addresses and out-of-range references reject input',()=>{
  const b=demo();assert.throws(()=>core({action:'audit',cells:[...b.cells,b.cells[0]]}),/重复/);
  assert.throws(()=>core({action:'audit',cells:[{...b.cells[0],address:'XFE1'}]}),/无效/);
});
test('bad ZIP and pre-decompression size guard reject input',()=>{
  assert.throws(()=>inspectZip(new Uint8Array(30)),/有效/);
  const bytes=archive('<worksheet/>');const v=new DataView(bytes.buffer);let p=0;for(;p<bytes.length-4;p++)if(v.getUint32(p,true)===0x02014b50)break;
  v.setUint32(p+24,40*1024*1024,true);assert.throws(()=>readXlsx(bytes,translate),/超限/);
});
test('DTD input rejected without fetching anything',()=>{
  const bytes=archive('<!DOCTYPE x [<!ENTITY y SYSTEM "https://example.invalid/a">]><worksheet/>');assert.throws(()=>readXlsx(bytes,translate),/DTD/);
});
test('corrupt ZIP checksum rejected',()=>{
  const bytes=archive('<worksheet/>');const v=new DataView(bytes.buffer);let p=0;for(;p<bytes.length-4;p++)if(v.getUint32(p,true)===0x02014b50)break;
  v.setUint32(p+16,123,true);assert.throws(()=>readXlsx(bytes,translate),/完整性/);
});
test('formula parser preserves strings and rejects unsupported structure',()=>{
  assert.equal(translate('=IF(A1=1,"A1","B1")','C1','C2'),'=IF(A2=1,"A1","B1")');
  assert.equal(core({action:'audit',cells:[{sheet:'S',address:'A1',value:'',kind:'blank',formula:'=A1 B2'}]}).skipped.length,1);
});
test('stale preview cannot be applied to changed source data',()=>{
  const clean=demo('clean');assert.throws(()=>core({action:'preview',cells:clean.cells,sheet:'项目报价',address:'F7',candidate:'=D7*E7'}),/失效/);
});
test('generated reference translations preserve formula structure',()=>{
  for(let row=3;row<=60;row++)assert.equal(translate('=$A3*B$2+SUM(C3:D3)','E3','E'+row),`=$A${row}*B$2+SUM(C${row}:D${row})`);
});
test('synthetic display caches remain numeric and match independent totals',()=>{
  assert.equal(demo('broken').cells.find(c=>c.address==='F13').value,'54000');
  assert.equal(demo('clean').cells.find(c=>c.address==='F14').value,'57876');
});

test('nonstandard workbook and string parts resolve through package relationships',()=>{
  const bytes=zipSync({
    '_rels/.rels':strToU8('<Relationships><Relationship Id="root" Type="x/officeDocument" Target="custom/main.xml"/></Relationships>'),
    'custom/main.xml':strToU8('<workbook xmlns:r="x"><sheets><sheet name="位置" r:id="sheet"/></sheets></workbook>'),
    'custom/_rels/main.xml.rels':strToU8('<Relationships><Relationship Id="sheet" Target="../data/page.xml"/><Relationship Id="strings" Type="x/sharedStrings" Target="../data/strings.xml"/></Relationships>'),
    'data/page.xml':strToU8('<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>'),
    'data/strings.xml':strToU8('<sst><si><t>已解析关系</t></si></sst>')
  });
  const b=readXlsx(bytes,translate);assert.equal(b.cells[0].value,'已解析关系');assert.deepEqual(b.sheets,['位置']);
});
test('duplicate relationship IDs and invalid cell type fail clearly',()=>{
  const bytes=zipSync({
    'xl/workbook.xml':strToU8('<workbook/>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="a"/><Relationship Id="a"/></Relationships>')
  });
  assert.throws(()=>readXlsx(bytes,translate),/ID/);
  assert.throws(()=>readXlsx(archive('<worksheet><sheetData><row><c r="A1" t="bad"><v>1</v></c></row></sheetData></worksheet>'),translate),/类型/);
});
test('UTF-16 XML parts import without corrupting non-ASCII values',()=>{
  const xml='<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>中文报价</t></is></c></row></sheetData></worksheet>';
  const bytes=zipSync({
    'xl/workbook.xml':strToU8('<workbook xmlns:r="x"><sheets><sheet name="S" r:id="a"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="a" Target="worksheets/s.xml"/></Relationships>'),
    'xl/worksheets/s.xml':new Uint8Array(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(xml,'utf16le')]))
  });assert.equal(readXlsx(bytes,translate).cells[0].value,'中文报价');
});

test('missing or nondecimal shared string indices cannot silently select a different cell value',()=>{
  const shared='<sst><si><t>不得误读为这个文本</t></si><si><t>第二项</t></si></sst>';
  for(const value of ['', ' ', '0x0', '1e0', '1.0', '-1', '4294967296']){
    const bytes=archive(`<worksheet><sheetData><row><c r="A1" t="s"><v>${value}</v></c></row></sheetData></worksheet>`,shared);
    assert.throws(()=>readXlsx(bytes,translate),/共享字符串索引/);
  }
  assert.throws(()=>readXlsx(archive('<worksheet><sheetData><row><c r="A1" t="s"/></row></sheetData></worksheet>',shared),translate),/共享字符串索引/);
  const valid=archive('<worksheet><sheetData><row><c r="A1" t="s"><v> +01 </v></c></row></sheetData></worksheet>',shared);
  assert.equal(readXlsx(valid,translate).cells[0].value,'第二项');
});

test('shared formula indices normalize decimal spelling and require explicit valid masters',()=>{
  const good=archive('<worksheet><sheetData><row><c r="C1"><f t="shared" si="00" ref="C1:C2">A1*B1</f></c></row><row><c r="C2"><f t="shared" si="0"/></c></row></sheetData></worksheet>');
  assert.equal(readXlsx(good,translate).cells[1].formula,'=A2*B2');
  for(const attrs of ['ref="C1:C2"','si="x" ref="C1:C2"','si="0"','si="0" ref="D1:D2"']){
    const bytes=archive(`<worksheet><sheetData><row><c r="C1"><f t="shared" ${attrs}>A1*B1</f></c></row></sheetData></worksheet>`);
    assert.throws(()=>readXlsx(bytes,translate),/共享公式/);
  }
  const duplicate=archive('<worksheet><sheetData><row><c r="C1"><f t="shared" si="00" ref="C1:C2">A1*B1</f></c><c r="C2"><f t="shared" si="0" ref="C1:C2">A2*B2</f></c></row></sheetData></worksheet>');
  assert.throws(()=>readXlsx(duplicate,translate),/重复/);
});
