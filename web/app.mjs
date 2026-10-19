import {core} from './api.mjs';
import {readXlsx} from './xlsx.mjs';
import {demo} from './demo.mjs';
const $=id=>document.getElementById(id);
const labels={pattern_outlier:'公式结构不一致',formula_replaced:'公式变成常量',formula_removed:'公式被移除',formula_changed:'公式发生变化',formula_added:'新增公式'};
let book,report,old=null,diff=[],tab='audit',selected=null,sheet='',reviews=new Map(),source='demo',hash='',oldHash='',busy=false,activeAddress='',comparisonPerformed=false;
const id=f=>f.sheet+'!'+f.address+'|'+f.rule;
const list=()=>tab==='audit'?report.findings:diff;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':''}
function syncCompare(){$('compare').disabled=!old||!$('aligned').checked||busy;$('clear-baseline').hidden=!old}
function auditBook(next,name,isDemo,fingerprint=''){
  const result=core({action:'audit',cells:next.cells});
  book={...next,name};report=result;source=isDemo?'demo':'file';hash=fingerprint;sheet=next.sheets?.[0]||next.cells[0]?.sheet||'';
  reviews=new Map();diff=[];tab='audit';selected=report.findings[0]||null;activeAddress=selected?.address||'';
  old=null;oldHash='';comparisonPerformed=false;$('aligned').checked=false;$('baseline-name').textContent='尚未加载旧版';
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
  const findings=list();$('finding-count').textContent=findings.length;
  $('tab-audit').className=tab==='audit'?'active':'';$('tab-diff').className=tab==='diff'?'active':'';
  $('findings').replaceChildren();
  if(!findings.length){$('findings').append(el('p',tab==='audit'?'当前规则未发现结构异常。这不代表表格没有错误；可加载旧版检查公式是否被替换。':comparisonPerformed?'已完成同地址比较，没有发现公式变化。':old?'完成版本比较后，变化会显示在这里。':'先在左侧加载旧版，并确认行列位置对应。','empty'));return}
  for(const f of findings){
    const b=el('button',undefined,'finding'+(selected&&id(f)===id(selected)?' active':''));
    b.append(el('strong',f.sheet+' · '+f.address),el('span',reviews.get(id(f))==='exception'?'合理例外':reviews.get(id(f))==='confirmed'?'确认问题':'待核查','badge'),el('small',labels[f.rule]||f.rule));
    b.onclick=()=>{selected=f;sheet=f.sheet;activeAddress=f.address;render();document.querySelector('td.selected')?.scrollIntoView({block:'nearest',inline:'nearest'})};$('findings').append(b);
  }
}
const coord=a=>{const m=/^([A-Z]+)(\d+)$/.exec(a.toUpperCase());if(!m)return [1,1];return [Number(m[2]),[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)]};
const colName=n=>{let s='';while(n){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26)}return s};
function showCell(c){activeAddress=c.address;$('active-address').textContent=c.address;$('active-formula').textContent=c.formula||c.value||'空白单元格'}
function renderGrid(){
  const cells=book.cells.filter(c=>c.sheet===sheet),map=new Map(cells.map(c=>[c.address.toUpperCase(),c]));
  const [ar,ac]=coord(activeAddress||'A1');
  let maxR=15,maxC=6;for(const c of cells){const [r,col]=coord(c.address);maxR=Math.max(maxR,r);maxC=Math.max(maxC,col)}
  const startR=ar>50?Math.max(1,ar-12):1,startC=ac>12?Math.max(1,ac-5):1;
  const endR=Math.min(maxR,startR+59),endC=Math.min(maxC,startC+13);
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
    const result=el('div');result.id='preview-result';b.onclick=()=>{try{
      const preview=core({action:'preview',cells:book.cells,sheet:f.sheet,address:f.address,candidate:f.candidate});result.replaceChildren();
      result.append(el('p','以下数值由 MoonBit 重新计算，未使用文件缓存。未覆盖的公式仍需人工检查。','hint'));
      if(preview.unresolved_formulas)result.append(el('p',`${preview.unresolved_formulas} 个公式无法解析，其潜在下游影响未被证明完整。`,'error'));
      for(const p of preview.impacts){const d=el('div',undefined,'impact');d.append(el('strong',p.sheet+'!'+p.address));if(p.error)d.append(el('p','无法重算：'+p.error,'hint'));else{const numbers=el('div',undefined,'numbers');numbers.append(el('span',format(p.before)),el('span','→'),el('strong',format(p.after)));d.append(numbers)}result.append(d)}
    }catch(e){result.replaceChildren(el('p',e.message,'error'))}};box.append(b,result);
  }
  const actions=el('div',undefined,'review-buttons');for(const [state,text] of [['confirmed','确认是问题'],['exception','标记合理例外'],['pending','撤销判断']]){const b=el('button',text,'secondary');b.onclick=()=>{if(state==='pending')reviews.delete(id(f));else reviews.set(id(f),state);renderFindings();renderDetail()};actions.append(b)}box.append(actions);
  box.append(el('p',reviews.has(id(f))?'已记录本次审核判断；导出后保留。':'审核判断仅在本次会话中保留。','success-note'));
}
function format(n){return n==null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:6}).format(n)}
async function digest(bytes){if(!globalThis.crypto?.subtle)return '';return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')}
async function load(file){
  if(!file)throw new Error('请选择文件');if(file.size>8*1024*1024)throw new Error('文件超过 8 MB');
  const bytes=new Uint8Array(await file.arrayBuffer());let data;
  if(file.name.toLowerCase().endsWith('.xlsx'))data=readXlsx(bytes,(formula,from,to)=>core({action:'translate',formula,from,to}));
  else if(file.name.toLowerCase().endsWith('.json')){data=JSON.parse(new TextDecoder().decode(bytes));if(data.schema!=='mooncell.workbook.v1'||!Array.isArray(data.cells))throw new Error('不是 MoonCell 工作簿 JSON');data.sheets=[...new Set(data.cells.map(c=>c.sheet))];data.warnings=Array.isArray(data.warnings)?data.warnings.map(String):[];}
  else throw new Error('请选择 .xlsx 或 .json 文件');
  core({action:'audit',cells:data.cells});return {data,hash:await digest(bytes)};
}
function guarded(fn){return async()=>{if(busy)return;busy=true;syncCompare();try{await fn()}catch(e){status(e.message,true)}finally{busy=false;syncCompare()}}}
$('upload').onchange=guarded(async()=>{const file=$('upload').files[0];if(!file)return;status('正在本机读取和分析…');const r=await load(file);auditBook(r.data,file.name,false,r.hash);$('upload').value=''});
$('baseline').onchange=guarded(async()=>{const file=$('baseline').files[0];if(!file)return;const r=await load(file);old=r.data;old.name=file.name;oldHash=r.hash;resetComparison();$('baseline-name').textContent='旧版：'+file.name;$('baseline').value='';status('旧版已载入，请确认位置对应后比较。')});
$('aligned').onchange=syncCompare;
function resetComparison(){diff=[];comparisonPerformed=false;reviews=new Map([...reviews].filter(([k])=>k.endsWith('|pattern_outlier')));$('aligned').checked=false;tab='audit';selected=report.findings[0]||null;render()}
$('demo-baseline').onclick=()=>{old=demo('clean');old.name='演示原始版本';oldHash='';resetComparison();$('baseline-name').textContent='旧版：合成演示原始版本';syncCompare();status('请确认两版位置对应。实际文件请使用其真实旧版。')};
$('clear-baseline').onclick=()=>{old=null;oldHash='';resetComparison();$('baseline-name').textContent='尚未加载旧版'};
$('compare').onclick=()=>{try{if(!old||!$('aligned').checked)return;diff=core({action:'compare',before:old.cells,after:book.cells});comparisonPerformed=true;tab='diff';selected=diff[0]||null;if(selected){sheet=selected.sheet;activeAddress=selected.address}render();status('按同名工作表、同一地址比较；没有自动匹配行列移动。')}catch(e){status(e.message,true)}};
$('load-demo').onclick=()=>{const d=demo($('scenario').value);auditBook(d,d.name,true)};
$('sheet').onchange=()=>{sheet=$('sheet').value;activeAddress='';renderGrid()};
for(const t of ['audit','diff'])$('tab-'+t).onclick=()=>{tab=t;selected=list()[0]||null;if(selected){sheet=selected.sheet;activeAddress=selected.address}render()};
$('export').onclick=()=>{
  const data={schema:'mooncell.review.v1',engine:'0.1.0',createdAt:new Date().toISOString(),source:{name:book.name,sha256:hash||null,synthetic:source==='demo'},baseline:old?{name:old.name,sha256:oldHash||null,aligned:$('aligned').checked}:null,comparisonPerformed,analysis:report,changes:diff,decisions:Object.fromEntries(reviews),warnings:book.warnings||[],limitations:'Heuristic candidates require human review. Comparison uses exact addresses. Unsupported formulas are not verified.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='MoonCell-审查记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出审查记录，其中包含公式和证据，请按文件敏感程度保管。');
};
try{const d=demo('broken');auditBook(d,d.name,true)}catch(e){status('初始化失败：'+e.message,true)}
