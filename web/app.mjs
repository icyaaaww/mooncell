import {rpc,cancelAnalysis} from './background.mjs';
import {VERSION,MAX_SESSION,findingKey,normalizeBook} from './session.mjs';
import {labels,reviewReport,htmlReport} from './report.mjs';
import {demo} from './demo.mjs';
const $=id=>document.getElementById(id);
let book,report,old=null,diff=[],tab='audit',selected=null,sheet='',reviews=new Map(),source='demo',hash='',oldHash='',busy=false,activeAddress='',comparisonPerformed=false;
const id=f=>findingKey(f,book);
const core=request=>rpc('core',request);
const list=()=>tab==='audit'?report.findings:diff;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':''}
function syncCompare(){$('compare').disabled=!old||!$('aligned').checked||busy;$('clear-baseline').hidden=!old}
async function auditBook(next,name,isDemo,fingerprint='',analyzed=null){
  next=normalizeBook({...next,name});
  const result=analyzed||await core({action:'audit',cells:next.cells});
  book={...next,name};report=result;source=isDemo?'demo':'file';hash=fingerprint;sheet=next.sheets?.[0]||next.cells[0]?.sheet||'';
  reviews=new Map();diff=[];tab='audit';selected=report.findings[0]||null;activeAddress=selected?.address||'';if(selected)sheet=selected.sheet;
  old=null;oldHash='';comparisonPerformed=false;$('aligned').checked=false;$('baseline-name').textContent='尚未加载旧版';
  $('review-filter').value='all';$('finding-query').value='';
  render();status(isDemo?'已载入合成样例。可切换正常对照表和合理例外。':'文件已在本机分析。未修改原始文件。');
}
function render(){
  $('book-name').textContent=book.name;$('source-label').textContent=source==='demo'?'合成演示 / 可复现案例':'本地文件 / 不上传';
  $('metrics').replaceChildren();
  for(const [n,t,c] of [[report.formulas,'个公式',''],[report.findings.length,'处待核查','warn'],[report.skipped.length,'个未分析','']]){const e=el('div',undefined,'metric '+c);e.append(el('strong',n),el('span',t));$('metrics').append(e)}
  const sheets=[...new Set([...(book.sheets||[]),...book.cells.map(c=>c.sheet)])];
  $('sheet').replaceChildren(...sheets.map(s=>{const o=el('option',s);o.value=s;return o}));$('sheet').value=sheet;
  $('warnings').replaceChildren(...[...(book.warnings||[]),...report.skipped.map(f=>f.sheet+'!'+f.address+'：'+f.message)].map(s=>el('li',s)));
  $('warning-count').textContent=report.skipped.length?'· '+report.skipped.length+' 个公式未分析':'';
  syncCompare();renderFindings();renderGrid();renderDetail();
}
function renderFindings(){
  const filter=$('review-filter').value,query=$('finding-query').value.trim().toLowerCase();
  const findings=list().filter(f=>(filter==='all'||(reviews.get(id(f))?.state||'pending')===filter)&&(!query||(f.sheet+'!'+f.address+' '+f.formula+' '+(reviews.get(id(f))?.note||'')).toLowerCase().includes(query)));$('finding-count').textContent=findings.length+' / '+list().length;
  $('tab-audit').className=tab==='audit'?'active':'';$('tab-diff').className=tab==='diff'?'active':'';
  $('findings').replaceChildren();
  if(!findings.length){$('findings').append(el('p',list().length?'没有符合当前筛选条件的记录。':tab==='audit'?'当前规则未发现结构异常。这不代表表格没有错误；可加载旧版检查公式是否被替换。':comparisonPerformed?'已完成同地址比较，没有发现公式变化。':old?'完成版本比较后，变化会显示在这里。':'先在左侧加载旧版，并确认行列位置对应。','empty'));return}
  for(const f of findings.slice(0,200)){
    const b=el('button',undefined,'finding'+(selected&&id(f)===id(selected)?' active':''));
    b.append(el('strong',f.sheet+' · '+f.address),el('span',reviews.get(id(f))?.state==='exception'?'合理例外':reviews.get(id(f))?.state==='confirmed'?'确认问题':'待核查','badge'),el('small',labels[f.rule]||f.rule));
    b.onclick=()=>{selected=f;sheet=f.sheet;activeAddress=f.address;render();document.querySelector('td.selected')?.scrollIntoView({block:'nearest',inline:'nearest'})};$('findings').append(b);
  }
  if(findings.length>200)$('findings').append(el('p','显示前 200 项，请使用地址或备注筛选。导出包含全部记录。','hint'));
}
const coord=a=>{const m=/^([A-Z]+)(\d+)$/.exec(a.toUpperCase());if(!m)return [1,1];return [Number(m[2]),[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)]};
const colName=n=>{let s='';while(n){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26)}return s};
function showCell(c){activeAddress=c.address;$('active-address').textContent=c.address;$('active-formula').textContent=c.formula||c.value||'空白单元格'}
function renderGrid(){
  const cells=book.cells.filter(c=>c.sheet===sheet),map=new Map(cells.map(c=>[c.address.toUpperCase(),c]));
  const [ar,ac]=coord(activeAddress||'A1');
  let maxR=15,maxC=6;for(const c of cells){const [r,col]=coord(c.address);maxR=Math.max(maxR,r);maxC=Math.max(maxC,col)}
  const startR=ar>50?Math.max(1,ar-12):1,startC=ac>12?Math.max(1,ac-5):1;
  const endR=Math.min(1048576,Math.max(ar,Math.min(maxR,startR+59))),endC=Math.min(16384,Math.max(ac,Math.min(maxC,startC+13)));
  $('table-note').textContent=`显示 ${startR}–${endR} 行 / ${colName(startC)}–${colName(endC)} 列；分析覆盖已导入单元格`;
  const suspect=new Set(report.findings.filter(f=>f.sheet===sheet).map(f=>f.address));
  const evidence=new Set(selected?.sheet===sheet?selected.evidence.map(s=>s.split('  ')[0]):[]);
  const table=$('grid');table.style.minWidth=((endC-startC+1)*96+34)+'px';table.replaceChildren();const head=el('tr');head.append(el('th',''));
  for(let c=startC;c<=endC;c++)head.append(el('th',colName(c)));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
  for(let r=startR;r<=endR;r++){const row=el('tr');row.append(el('th',r));for(let col=startC;col<=endC;col++){
    const a=colName(col)+r,c=map.get(a)||{sheet,address:a,value:'',formula:'',kind:'blank'};
    const td=el('td');if(c.kind==='text')td.classList.add('text');if(c.formula)td.classList.add('formula');if(evidence.has(a))td.classList.add('evidence');if(suspect.has(a))td.classList.add('suspect');if(a===activeAddress)td.classList.add('selected');
    const b=el('button',c.value!==''?c.value:c.formula?'ƒ':'');b.title=a+(c.formula?'  '+c.formula:'');b.setAttribute('aria-label',a+' '+(c.formula||c.value||'空白'));
    b.onclick=()=>{showCell(c);renderGrid();const f=list().find(f=>f.sheet===sheet&&f.address===a);if(f){selected=f;renderFindings();renderGrid();renderDetail()}};td.append(b);row.append(td);
  }body.append(row)}table.append(body);
  const active=map.get(activeAddress);if(active)showCell(active);else{$('active-address').textContent=activeAddress||'—';$('active-formula').textContent='选择一个单元格'}
}
function renderDetail(){
  const box=$('detail');box.replaceChildren();if(!selected)return;const f=selected;
  box.append(el('div',f.address,'detail-title'),el('p',f.message,'detail-message'));
  box.append(el('div','当前公式 / 内容','section-label'),el('code',f.formula||book.cells.find(c=>c.sheet===f.sheet&&c.address.toUpperCase()===f.address)?.value||'空白','code'));
  box.append(el('div','判断依据','section-label'),el('div',f.evidence.join('\n'),'evidence-list'));
  if(f.candidate){
    box.append(el('div','结构一致的候选 · 需要确认业务含义','section-label'),el('code',f.candidate,'code'));
    const b=el('button','预览候选对结果的影响 →','primary');b.id='preview';
    const result=el('div');result.id='preview-result';b.onclick=guarded(async()=>{try{
      const preview=await core({action:'preview',cells:book.cells,sheet:f.sheet,address:f.address,candidate:f.candidate});result.replaceChildren();
      result.append(el('p','以下数值由 MoonBit 重新计算，未使用文件缓存。未覆盖的公式仍需人工检查。','hint'));
      if(preview.unresolved_formulas)result.append(el('p',`${preview.unresolved_formulas} 个公式无法解析，其潜在下游影响未被证明完整。`,'error'));
      for(const p of preview.impacts){const d=el('div',undefined,'impact');d.append(el('strong',p.sheet+'!'+p.address));if(p.error)d.append(el('p','无法重算：'+p.error,'hint'));else{const numbers=el('div',undefined,'numbers');numbers.append(el('span',format(p.before)),el('span','→'),el('strong',format(p.after)));d.append(numbers)}result.append(d)}
    }catch(e){result.replaceChildren(el('p',e.message,'error'))}});box.append(b,result);
  }
  const noteLabel=el('label','审核备注（最多 2000 字）','section-label');noteLabel.htmlFor='review-note';
  const note=el('textarea');note.id='review-note';note.maxLength=2000;note.rows=3;note.value=reviews.get(id(f))?.note||'';
  note.oninput=()=>{reviews.set(id(f),{state:reviews.get(id(f))?.state||'pending',note:note.value});dirty=true};box.append(noteLabel,note);
  const actions=el('div',undefined,'review-buttons');for(const [state,text] of [['confirmed','确认是问题'],['exception','标记合理例外'],['pending','撤销判断']]){const b=el('button',text,'secondary');b.onclick=()=>{reviews.set(id(f),{state,note:reviews.get(id(f))?.note||''});dirty=true;renderFindings();renderDetail()};actions.append(b)}box.append(actions);
  box.append(el('p','判断和备注保留在内存中。请“保存审核进度”后再关闭页面。','success-note'));
}
function format(n){return n==null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:6}).format(n)}
let dirty=false,cancelled=false;
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
async function load(file){
  if(!file)throw new Error('请选择文件');if(file.size>8*1024*1024)throw new Error('文件超过 8 MB');
  const bytes=await file.arrayBuffer();if(cancelled)throw new Error('已取消读取，保留原工作簿');
  return rpc('load',{name:file.name,bytes});
}
function setBusy(value){
  busy=value;document.body.setAttribute('aria-busy',String(value));
  for(const control of document.querySelectorAll('button,input,select,textarea'))if(control.id!=='cancel')control.disabled=value;
  $('cancel').hidden=!value;syncCompare();
}
function guarded(fn){return async()=>{if(busy)return;cancelled=false;setBusy(true);try{await fn()}catch(e){status(e.message,true)}finally{setBusy(false)}}}
$('cancel').onclick=()=>{cancelled=true;cancelAnalysis()};
$('upload').onchange=guarded(async()=>{const file=$('upload').files[0];if(!file)return;status('正在后台读取和分析，可取消…');try{const r=await load(file);await auditBook(r.book,file.name,false,r.hash,r.report);dirty=false}finally{$('upload').value=''}});
$('baseline').onchange=guarded(async()=>{const file=$('baseline').files[0];if(!file)return;try{const r=await load(file);old=r.book;oldHash=r.hash;resetComparison();$('baseline-name').textContent='旧版：'+file.name;status('旧版已载入，请确认位置对应后比较。');dirty=true}finally{$('baseline').value=''}});
$('aligned').onchange=()=>{if(comparisonPerformed){diff=[];comparisonPerformed=false;keepAuditReviews();tab='audit';selected=report.findings[0]||null;if(selected){sheet=selected.sheet;activeAddress=selected.address}render()}dirty=true;syncCompare()};
function keepAuditReviews(){const valid=new Set(report.findings.map(id));reviews=new Map([...reviews].filter(([k])=>valid.has(k)))}
function resetComparison(){diff=[];comparisonPerformed=false;keepAuditReviews();$('aligned').checked=false;tab='audit';selected=report.findings[0]||null;if(selected){sheet=selected.sheet;activeAddress=selected.address}render()}
$('demo-baseline').onclick=()=>{old=normalizeBook(demo('clean'));old.name='演示原始版本';oldHash='';resetComparison();$('baseline-name').textContent='旧版：合成演示原始版本';syncCompare();dirty=true;status('请确认两版位置对应。实际文件请使用其真实旧版。')};
$('clear-baseline').onclick=()=>{old=null;oldHash='';resetComparison();$('baseline-name').textContent='尚未加载旧版';dirty=true};
$('compare').onclick=guarded(async()=>{if(!old||!$('aligned').checked)return;diff=await core({action:'compare',before:old.cells,after:book.cells});comparisonPerformed=true;tab='diff';selected=diff[0]||null;if(selected){sheet=selected.sheet;activeAddress=selected.address}render();dirty=true;status('按同名工作表、同一地址比较；没有自动匹配行列移动。')});
$('load-demo').onclick=guarded(async()=>{const d=demo($('scenario').value);await auditBook(d,d.name,true);dirty=false});
$('sheet').onchange=()=>{sheet=$('sheet').value;selected=list().find(f=>f.sheet===sheet)||null;activeAddress=selected?.address||'';renderFindings();renderGrid();renderDetail()};
for(const t of ['audit','diff'])$('tab-'+t).onclick=()=>{tab=t;selected=list()[0]||null;if(selected){sheet=selected.sheet;activeAddress=selected.address}render()};
$('review-filter').onchange=renderFindings;$('finding-query').oninput=renderFindings;
function jump(address){
  if(!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address)){status('请输入有效的 A1 地址，例如 F7 或 AA120',true);return}
  const [r,c]=coord(address);if(r>1048576||c>16384){status('地址超出工作表范围',true);return}
  activeAddress=address;renderGrid();status('已定位 '+sheet+'!'+address);
}
$('jump-form').onsubmit=e=>{e.preventDefault();jump($('jump-address').value.trim().toUpperCase())};
for(const [button,dr,dc] of [['prev-rows',-50,0],['next-rows',50,0],['prev-cols',0,-12],['next-cols',0,12]])$(button).onclick=()=>{const [r,c]=coord(activeAddress||'A1');jump(colName(Math.max(1,Math.min(16384,c+dc)))+Math.max(1,Math.min(1048576,r+dr)))};
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function state(){return {book,old,report,diff,reviews,source,hash,oldHash,comparisonPerformed,aligned:$('aligned').checked}}
$('export').onclick=()=>{download(JSON.stringify(reviewReport(state()),null,2),'MoonCell-审查记录.json','application/json');status('已导出审查记录。记录包含公式和证据，请按数据敏感程度保管。')};
$('export-html').onclick=()=>{download(htmlReport(reviewReport(state())),'MoonCell-审查报告.html','text/html');status('已导出可直接阅读和打印的 HTML 报告。报告含公式和证据。')};
$('save-session').onclick=guarded(async()=>{
  const payload={engine:VERSION,createdAt:new Date().toISOString(),book,old,source,hash,oldHash,comparisonPerformed,aligned:$('aligned').checked,reviews:[...reviews].map(([key,r])=>({key,...r}))};
  const bundle=await rpc('seal',payload);download(JSON.stringify(bundle),'MoonCell-审核进度.mooncell.json','application/json');dirty=false;status('已生成会话下载，包含工作簿全部导入数据、旧版和审核备注；请妥善保管。');
});
$('restore-session').onchange=guarded(async()=>{
  const file=$('restore-session').files[0];if(!file)return;
  try{
    if(file.size>MAX_SESSION)throw new Error('会话超过 16 MB');status('正在校验会话并重新分析…');
    const text=await file.text();if(cancelled)throw new Error('已取消读取，保留原工作簿');
    const r=await rpc('restore',text);
    book=r.book;old=r.old;source=r.source;hash=r.hash;oldHash=r.oldHash;report=r.report;diff=r.diff;comparisonPerformed=r.comparisonPerformed;
    reviews=new Map(r.reviews.map(({key,state,note})=>[key,{state,note}]));$('aligned').checked=r.aligned;tab='audit';selected=report.findings[0]||null;sheet=selected?.sheet||book.sheets[0]||'';activeAddress=selected?.address||'';
    $('baseline-name').textContent=old?'旧版：'+old.name:'尚未加载旧版';$('review-filter').value='all';$('finding-query').value='';dirty=false;render();status('审核进度已恢复，输入完整性已校验，所有发现已重新计算。');
  }finally{$('restore-session').value=''}
});
guarded(async()=>{const d=demo('broken');await auditBook(d,d.name,true)})();
