import http from 'node:http';
import {readFile} from 'node:fs/promises';
const page=new URL('../dist/MoonCell.html',import.meta.url);
const port=Number(process.env.PORT||4308);
http.createServer(async(req,res)=>{
  if(req.url==='/'||req.url?.startsWith('/MoonCell.html')){
    try{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(page));}
    catch{res.end('Build the app first: npm run build');}
  }else{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`MoonCell: http://127.0.0.1:${port}/MoonCell.html`));
