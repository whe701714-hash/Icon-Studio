import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {api} from './icon-api.mjs';
const files = {'/':'index.html','/studio.css':'studio.css','/studio.mjs':'studio.mjs','/icons.mjs':'icons.mjs','/original.mjs':'original.mjs','/original.css':'original.css','/local-tools.mjs':'local-tools.mjs','/ai-endpoint.json':'ai-endpoint.json'};
const types = {html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json'};
createServer(async (request,response)=>{
  if(request.url.startsWith('/api/'))return api(request,response);
  const file=files[new URL(request.url,'http://localhost').pathname];
  if(!file){response.writeHead(404).end();return;}
  try {
    const body=await readFile(new URL(file,import.meta.url));
    response.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-store'}).end(body);
  } catch { response.writeHead(500).end(); }
}).listen(Number(process.env.PORT||process.env.ICON_STUDIO_PORT||4173),process.env.ICON_HOST||'127.0.0.1',()=>console.log('http://127.0.0.1:'+(process.env.PORT||process.env.ICON_STUDIO_PORT||4173)));


