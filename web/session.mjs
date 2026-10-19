// Session checksums detect corruption, not authorship or trusted provenance.
export const VERSION='1.0.0';
export const MAX_SESSION=16*1024*1024;
const fail=message=>{throw new Error(message)};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const string=(x,max=32768)=>typeof x==='string'&&x.length<=max;
export function canonical(x){
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(object(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  return JSON.stringify(x);
}
export async function digest(bytes){
  if(!globalThis.crypto?.subtle)fail('浏览器不支持本地 SHA-256，请使用新版 Chrome、Edge 或 Firefox');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function normalizeBook(input){
  if(!object(input)||input.schema!=='mooncell.workbook.v1'||!Array.isArray(input.cells)||input.cells.length>20000)fail('不是受支持的 MoonCell 工作簿 JSON');
  const cells=input.cells.map(c=>{
    if(!object(c)||!['sheet','address','formula','value','kind'].every(k=>string(c[k])))fail('单元格字段无效');
    return {sheet:c.sheet,address:c.address.toUpperCase(),formula:c.formula,value:c.value,kind:c.kind};
  });
  const sheets=input.sheets??[...new Set(cells.map(c=>c.sheet))];
  if(!Array.isArray(sheets)||sheets.length>1000||sheets.some(s=>!string(s,128)||!s||s.includes('\0'))||new Set(sheets.map(s=>s.toLowerCase())).size!==sheets.length||cells.some(c=>!sheets.includes(c.sheet)))fail('工作表列表无效');
  const warnings=input.warnings??[];
  if(!Array.isArray(warnings)||warnings.length>20000||warnings.some(w=>!string(w,2048)))fail('文件提示无效');
  if(input.name!==undefined&&!string(input.name,512))fail('文件名称过长');
  return {schema:'mooncell.workbook.v1',name:input.name||'未命名工作簿',cells,sheets:[...sheets],warnings:[...warnings]};
}
export function findingKey(f,book){
  const target=book.cells.find(c=>c.sheet===f.sheet&&c.address.toUpperCase()===f.address);
  return canonical({finding:f,value:target?.value??'',kind:target?.kind??'blank'});
}
function validatePayload(p){
  if(!object(p)||p.engine!==VERSION)fail('会话引擎版本不匹配，请用创建它的版本打开');
  if(!['demo','file'].includes(p.source)||!string(p.hash,64)||!string(p.oldHash,64)||[p.hash,p.oldHash].some(h=>h&&!/^[a-f0-9]{64}$/.test(h)))fail('来源指纹无效');
  if(typeof p.comparisonPerformed!=='boolean'||typeof p.aligned!=='boolean'||(p.comparisonPerformed&&(!p.old||!p.aligned)))fail('版本比较状态无效');
  if(!Array.isArray(p.reviews)||p.reviews.length>40000)fail('审核记录无效');
  const keys=new Set();
  for(const r of p.reviews){
    if(!object(r)||!string(r.key,262144)||!['pending','confirmed','exception'].includes(r.state)||!string(r.note,2000)||keys.has(r.key))fail('审核判断或备注无效');
    keys.add(r.key);
  }
  if(!string(p.createdAt,40)||!Number.isFinite(Date.parse(p.createdAt)))fail('会话时间无效');
}
export async function sealSession(payload){
  validatePayload(payload);
  const data=canonical(payload);
  if(new TextEncoder().encode(data).length>MAX_SESSION-512)fail('会话超过 16 MB，请使用单独的审查报告');
  return {schema:'mooncell.session.v1',checksum:await digest(new TextEncoder().encode(data)),payload};
}
export async function restoreSession(text,analyze){
  if(new TextEncoder().encode(text).length>MAX_SESSION)fail('会话超过 16 MB');
  const bundle=JSON.parse(text);
  if(bundle?.schema==='mooncell.review.v1')fail('这是审查报告，不能恢复工作簿。请选择保存的 .mooncell.json 会话');
  if(!object(bundle)||bundle.schema!=='mooncell.session.v1'||!object(bundle.payload)||!string(bundle.checksum,64))fail('不是 MoonCell 会话文件');
  const p=bundle.payload;
  validatePayload(p);
  if(await digest(new TextEncoder().encode(canonical(p)))!==bundle.checksum)fail('会话完整性校验失败，文件可能损坏或被修改');
  const book=normalizeBook(p.book),old=p.old?normalizeBook(p.old):null;
  const report=analyze({action:'audit',cells:book.cells});
  if(old)analyze({action:'audit',cells:old.cells});
  const diff=p.comparisonPerformed?analyze({action:'compare',before:old.cells,after:book.cells}):[];
  const valid=new Set([...report.findings,...diff].map(f=>findingKey(f,book)));
  if(p.reviews.some(r=>!valid.has(r.key)))fail('审核记录与重新分析的证据不一致，未恢复任何判断');
  return {...p,book,old,report,diff};
}
