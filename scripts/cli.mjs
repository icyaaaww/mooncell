import {readFile,stat} from 'node:fs/promises';
import {core} from '../web/api.mjs';
import {readXlsx} from '../web/xlsx.mjs';
async function read(path){
  if((await stat(path)).size>8*1024*1024)throw new Error('文件超过 8 MB');
  const bytes=new Uint8Array(await readFile(path));
  const book=path.toLowerCase().endsWith('.xlsx')?readXlsx(bytes,(formula,from,to)=>core({action:'translate',formula,from,to})):JSON.parse(new TextDecoder().decode(bytes));
  if(book.schema!=='mooncell.workbook.v1')throw new Error('未知工作簿格式');
  return book;
}
try{
  const [action,a,b,flag]=process.argv.slice(2);let result;
  if(action==='audit'&&a){const book=await read(a);result={...core({action:'audit',cells:book.cells}),warnings:book.warnings||[]}}
  else if(action==='compare'&&a&&b&&flag==='--aligned'){result=core({action:'compare',before:(await read(a)).cells,after:(await read(b)).cells})}
  else throw new Error('用法：node scripts/cli.mjs audit FILE.xlsx | compare OLD.xlsx NEW.xlsx --aligned（确认行列位置一致）');
  console.log(JSON.stringify(result,null,2));
}catch(e){console.error(e.message);process.exitCode=1}
