import {unzipSync,strFromU8} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',parseTagValue:false,parseAttributeValue:false,trimValues:false,removeNSPrefix:true,processEntities:true,htmlEntities:true});
const array=x=>x==null?[]:Array.isArray(x)?x:[x];
const txt=x=>typeof x==='object'?String(x?.['#text']??''):String(x??'');
const rich=x=>x?.t!==undefined?txt(x.t):array(x?.r).map(r=>txt(r.t)).join('');
const fail=s=>{throw new Error(s)};
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let b=0;b<8;b++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
function inRange(address,range){
  const point=s=>{const m=/^([A-Z]+)([1-9]\d*)$/i.exec(s||'');return m?[Number(m[2]),[...m[1].toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)]:null};
  const [from,to]=String(range||'').split(':'),a=point(from),b=point(to||from),p=point(address);
  return !!(a&&b&&p&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]));
}
function xml(bytes,label){
  const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';
  const s=new TextDecoder(encoding,{fatal:true}).decode(bytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(s))fail('不支持带 DTD/实体声明的 XML');
  if(XMLValidator.validate(s)!==true)fail('XML 格式无效：'+label);
  return parser.parse(s);
}
// A central-directory gate bounds decompression before calling the ZIP library.
// It also rejects encrypted/multi-disk/ZIP64 inputs and duplicate member paths.
export function inspectZip(bytes){
  if(bytes.length>8*1024*1024)fail('文件超过 8 MB');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let e=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){e=i;break}
  if(e<0)fail('不是有效的 XLSX / ZIP 文件');
  if(v.getUint16(e+4,true)||v.getUint16(e+6,true))fail('不支持分卷 ZIP');
  const n=v.getUint16(e+10,true),size=v.getUint32(e+12,true),start=v.getUint32(e+16,true);
  if(n>2500||n!==v.getUint16(e+8,true)||start+size!==e)fail('ZIP 索引超限或无效');
  let p=start,total=0;const names=new Map();
  for(let i=0;i<n;i++){
    if(p+46>e||v.getUint32(p,true)!==0x02014b50)fail('ZIP 索引损坏');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),plain=v.getUint32(p+24,true),len=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
    if(flags&1||![0,8].includes(method)||plain===0xffffffff||compressed===0xffffffff||v.getUint16(p+34,true))fail('不支持加密、ZIP64 或此压缩格式');
    if(p+46+len+extra+comment>e||local+30>start)fail('ZIP 偏移无效');
    const name=strFromU8(bytes.subarray(p+46,p+46+len));
    if(names.has(name)||name.startsWith('/')||name.includes('..')||name.includes('\\'))fail('ZIP 路径重复或无效');
    names.set(name,{size:plain,crc:v.getUint32(p+16,true)});total+=plain;
    if(plain>12*1024*1024||total>32*1024*1024)fail('解压后内容超限');
    if(v.getUint32(local,true)!==0x04034b50||v.getUint16(local+8,true)!==method)fail('ZIP 本地记录不匹配');
    const l=v.getUint16(local+26,true),x=v.getUint16(local+28,true);
    if(strFromU8(bytes.subarray(local+30,local+30+l))!==name||local+30+l+x+compressed>start)fail('ZIP 本地边界无效');
    p+=46+len+extra+comment;
  }
  if(p!==e)fail('ZIP 目录长度无效');
  return names;
}
function resolvePart(base,target){
  if(typeof target!=='string'||!target||target.includes('\\')||/[?#\u0000]/.test(target)||/^[a-z]+:/i.test(target))fail('工作簿部件路径无效');
  if(target.startsWith('/'))target=target.slice(1);else target=base+target;
  const parts=[];
  for(const p of target.split('/')){if(p==='..'){if(!parts.length)fail('工作表路径越界');parts.pop()}else if(p!=='.'&&p!=='')parts.push(p)}
  return parts.join('/');
}
export function readXlsx(bytes,translate){
  const names=inspectZip(bytes);
  if([...names.keys()].some(n=>/vbaProject\.bin$/i.test(n)))fail('首版不支持含宏的工作簿');
  const entries=unzipSync(bytes,{filter:f=>f.name.endsWith('.xml')||f.name.endsWith('.rels')});
  for(const [name,content] of Object.entries(entries)){const meta=names.get(name);if(!meta||meta.size!==content.length||meta.crc!==crc32(content))fail('ZIP 部件完整性检查失败：'+name)}
  const read=name=>{if(!entries[name])fail('缺少工作簿部件：'+name);return xml(entries[name],name)};
  function relationships(name){
    const result=array(read(name).Relationships?.Relationship),ids=new Set();
    for(const r of result){if(typeof r['@Id']!=='string'||!r['@Id']||ids.has(r['@Id']))fail('部件关系 ID 缺失或重复');ids.add(r['@Id'])}
    return result;
  }
  let workbookPart='xl/workbook.xml';
  if(entries['_rels/.rels']){
    const offices=relationships('_rels/.rels').filter(r=>String(r['@Type']).endsWith('/officeDocument'));
    if(offices.length!==1||offices[0]['@TargetMode']==='External')fail('主工作簿关系无效');
    workbookPart=resolvePart('',offices[0]['@Target']);
  }
  const slash=workbookPart.lastIndexOf('/'),base=workbookPart.slice(0,slash+1),filename=workbookPart.slice(slash+1);
  const workbook=read(workbookPart).workbook;
  const rels=relationships(base+'_rels/'+filename+'.rels');
  const stringRels=rels.filter(r=>String(r['@Type']).endsWith('/sharedStrings'));
  if(stringRels.length>1||stringRels[0]?.['@TargetMode']==='External')fail('共享字符串关系无效');
  const stringsPart=stringRels.length?resolvePart(base,stringRels[0]['@Target']):base+'sharedStrings.xml';
  const shared=entries[stringsPart]?array(read(stringsPart).sst?.si).map(rich):[];
  if(stringRels.length&&!entries[stringsPart])fail('缺少共享字符串部件');
  const cells=[],warnings=[],sheets=[];
  for(const s of array(workbook?.sheets?.sheet)){
    const sheet=String(s['@name']??'');
    if(!sheet||sheet.length>128||sheets.some(n=>n.toLowerCase()===sheet.toLowerCase()))fail('工作表名称缺失或重复');
    if(sheets.length>=1000)fail('工作表数量超过 1000');
    const rel=rels.find(r=>r['@Id']===(s['@id']??s['@r:id']));
    if(!rel||rel['@TargetMode']==='External')fail('工作表关系无效');
    const part=resolvePart(base,rel['@Target']);
    const doc=read(part).worksheet;
    if(!doc)fail('首版只支持普通 worksheet');
    sheets.push(sheet);
    if(s['@state']&&s['@state']!=='visible')warnings.push('已包含隐藏工作表：'+sheet);
    if(doc.mergeCells)warnings.push(sheet+' 含合并单元格：诊断不依据视觉分组，请核对区域边界。');
    const masters=new Map(),pending=[],unsupportedRanges=[];const sheetStart=cells.length;
    for(const row of array(doc.sheetData?.row))for(const c of array(row.c)){
      const address=String(c['@r']??'').toUpperCase();
      const f=c.f;let formula=f===undefined?'':'='+txt(f);
      const ft=typeof f==='object'?f['@t']:undefined;
      let value=txt(c.v),kind='number';
      if(c['@t']!==undefined&&!['n','s','inlineStr','str','d','b','e'].includes(c['@t']))fail('未知单元格类型：'+c['@t']);
      if(c['@t']==='s'){
        const index=Number(value);if(!Number.isInteger(index)||index<0||index>=shared.length)fail('共享字符串索引无效');
        value=shared[index];kind='text';
      }else if(c['@t']==='inlineStr'){value=rich(c.is);kind='text'}
      else if(['str','d'].includes(c['@t']))kind='text';
      else if(c['@t']==='b')kind='boolean';
      else if(c['@t']==='e')kind='error';
      else if(value==='')kind='blank';
      if(ft==='shared'){
        const si=String(f['@si']);
        if(txt(f)){
          if(masters.has(si))fail('共享公式主节点重复');
          masters.set(si,{address,formula,range:f['@ref']});
        }else pending.push({index:cells.length,si});
      }else if(ft&&ft!=='normal'){kind='unsupported';if(f['@ref'])unsupportedRanges.push(f['@ref']);warnings.push(sheet+'!'+address+'：暂不支持 '+ft+' 公式及其结果区域')}
      if(f!==undefined&&formula==='='&&ft!=='shared')kind='unsupported';
      cells.push({sheet,address,formula,value,kind});
      if(cells.length>20000)fail('最多导入 20000 个单元格');
    }
    for(const p of pending){
      const c=cells[p.index],m=masters.get(p.si);
      if(!m||!inRange(c.address,m.range)){c.kind='unsupported';warnings.push(sheet+'!'+c.address+' 缺少有效的共享公式范围');continue}
      try{c.formula=translate(m.formula,m.address,c.address)}catch{c.kind='unsupported';warnings.push(sheet+'!'+c.address+' 共享公式无法展开')}
    }
    if(unsupportedRanges.length>200)fail('不支持的数组/数据表区域过多');
    for(let i=sheetStart;i<cells.length;i++)if(unsupportedRanges.some(r=>inRange(cells[i].address,r)))cells[i].kind='unsupported';
  }
  if(!sheets.length)fail('工作簿没有工作表');
  if(entries['xl/externalLinks/_rels/externalLink1.xml.rels'])warnings.push('包含外部链接；外部引用不重算、不联网读取。');
  return {schema:'mooncell.workbook.v1',cells,sheets,warnings};
}
