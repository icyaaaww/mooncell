import {readFile,stat} from 'node:fs/promises';
import {core} from '../web/api.mjs';
import {readXlsx} from '../web/xlsx.mjs';
import {normalizeBook} from '../web/session.mjs';
const help=`用法：
  node scripts/cli.mjs audit FILE.xlsx [--fail-on-findings]
  node scripts/cli.mjs compare OLD.xlsx NEW.xlsx --aligned [--fail-on-findings]

输入支持 XLSX 和 MoonCell 工作簿 JSON。--aligned 表示确认工作表名称及行列位置一致。
默认退出码：0 成功分析，1 输入或执行失败。
--fail-on-findings：存在异常候选或版本变化时返回 2，仍输出完整 JSON。
退出码 0 不代表业务数据正确；请检查 skipped 未分析项。`;
function options(args){
  const [action,...rest]=args,files=[],flags=new Set();let literal=false;
  if(!['audit','compare'].includes(action))throw new Error(help);
  for(const arg of rest){
    if(arg==='--'&&!literal){literal=true;continue}
    if(!literal&&arg.startsWith('--')){
      if(!['--aligned','--fail-on-findings'].includes(arg)||flags.has(arg))throw new Error('未知或重复选项：'+arg);
      flags.add(arg);
    }else files.push(arg);
  }
  if(files.length!==(action==='audit'?1:2))throw new Error('输入文件数量不正确。\n'+help);
  if(action==='compare'&&!flags.has('--aligned'))throw new Error('版本比较需要 --aligned 确认工作表名称及行列位置一致');
  if(action==='audit'&&flags.has('--aligned'))throw new Error('--aligned 仅用于 compare');
  return {action,files,strict:flags.has('--fail-on-findings')};
}
async function read(path){
  if((await stat(path)).size>8*1024*1024)throw new Error('文件超过 8 MB');
  const bytes=new Uint8Array(await readFile(path));
  if(!/\.(xlsx|json)$/i.test(path))throw new Error('请选择 .xlsx 或 .json 文件');
  const book=path.toLowerCase().endsWith('.xlsx')?readXlsx(bytes,(formula,from,to)=>core({action:'translate',formula,from,to})):JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return normalizeBook(book);
}
try{
  const args=process.argv.slice(2);
  if(args.length===1&&['--help','-h'].includes(args[0]))console.log(help);
  else {
    const {action,files:[a,b],strict}=options(args);let result,count;
    if(action==='audit'){const book=await read(a);result={...core({action:'audit',cells:book.cells}),warnings:book.warnings};count=result.findings.length}
    else{result=core({action:'compare',before:(await read(a)).cells,after:(await read(b)).cells});count=result.length}
    console.log(JSON.stringify(result,null,2));if(strict&&count)process.exitCode=2;
  }
}catch(e){console.error(e.message);process.exitCode=1}
