import {core} from './api.mjs';
import {readXlsx} from './xlsx.mjs';
import {normalizeBook,digest,sealSession,restoreSession} from './session.mjs';
self.onmessage=async({data:{id,action,payload}})=>{
  try{
    let result;
    if(action==='load'){
      const bytes=new Uint8Array(payload.bytes);
      if(bytes.length>8*1024*1024)throw new Error('文件超过 8 MB');
      const name=payload.name;
      let raw;
      if(name.toLowerCase().endsWith('.xlsx'))raw=readXlsx(bytes,(formula,from,to)=>core({action:'translate',formula,from,to}));
      else if(name.toLowerCase().endsWith('.json'))raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      else throw new Error('请选择 .xlsx 或 .json 文件');
      const book=normalizeBook({...raw,name});
      result={book,report:core({action:'audit',cells:book.cells}),hash:await digest(bytes)};
    }else if(action==='restore')result=await restoreSession(payload,core);
    else if(action==='seal')result=await sealSession(payload);
    else if(action==='core')result=core(payload);
    else throw new Error('未知后台操作');
    self.postMessage({id,result});
  }catch(e){self.postMessage({id,error:e.message||String(e)})}
};
