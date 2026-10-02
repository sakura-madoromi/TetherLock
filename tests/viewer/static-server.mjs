import http from 'node:http';
import path from 'node:path';
import {readFile} from 'node:fs/promises';

const root=path.resolve('dist'),prefix='/workbench/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.stl':'application/octet-stream','.csv':'text/csv; charset=utf-8','.zip':'application/zip'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:4173');
    if(url.pathname==='/'){res.writeHead(302,{Location:prefix});res.end();return;}
    if(!url.pathname.startsWith(prefix))throw new Error('404');
    const file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
    if(!file.startsWith(root+path.sep))throw new Error('404');
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Static verification: http://127.0.0.1:4173/workbench/'));
