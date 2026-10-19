let worker=null,sequence=0;
const pending=new Map();
export function cancelAnalysis(message='已取消后台操作，保留原工作簿'){
  worker?.terminate();worker=null;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error(message))}
  pending.clear();
}
export function rpc(action,payload){
  if(!worker){
    const url=URL.createObjectURL(new Blob([__MOONCELL_WORKER__],{type:'text/javascript'}));
    try{worker=new Worker(url)}finally{URL.revokeObjectURL(url)}
    worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data.result)};
    worker.onerror=e=>{e.preventDefault();cancelAnalysis('后台分析失败，请重试或更换新版浏览器')};
  }
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>cancelAnalysis('分析超过 30 秒，已停止。请缩小工作簿后重试'),30000);
    pending.set(id,{resolve,reject,timer});worker.postMessage({id,action,payload});
  });
}
