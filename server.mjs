import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files = {'/':'index.html','/studio.css':'studio.css','/studio.mjs':'studio.mjs','/icons.mjs':'icons.mjs'};
const types = {html:'text/html',css:'text/css',mjs:'text/javascript'};
createServer(async (request,response)=>{
  const file=files[new URL(request.url,'http://localhost').pathname];
  if(!file){response.writeHead(404).end();return;}
  try {
    const body=await readFile(new URL(file,import.meta.url));
    response.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-store'}).end(body);
  } catch { response.writeHead(500).end(); }
}).listen(Number(process.env.ICON_STUDIO_PORT||4173),'127.0.0.1',()=>console.log('http://127.0.0.1:'+(process.env.ICON_STUDIO_PORT||4173)));
