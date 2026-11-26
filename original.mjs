const blank={refs:[],profile:null,locked:null,version:0,icons:[],styles:[],failures:[]};
const database=await new Promise(resolve=>{
 const request=indexedDB.open('icon-studio-original',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('project');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>resolve(null);
});
let state={...blank};
if(database)await new Promise(resolve=>{
 const request=database.transaction('project').objectStore('project').get('current');
 request.onsuccess=()=>{state={...blank,...request.result};resolve();};
 request.onerror=resolve;
});
const clean=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const imageMarkup=(ref,cls='')=>'<img class="'+cls+'" src="'+clean(ref.url)+'" alt="'+clean(ref.name)+'">';
const btn=(name,label,value='',cls='secondary')=>'<button type="button" class="'+cls+'" data-original="'+name+'" data-value="'+clean(value)+'">'+label+'</button>';
const fields={name:'风格名称',color:'色彩语言',shape:'造型语言',line:'线条语言',composition:'构图与比例',material:'材质与光影',distinct:'独特特征',prompt:'风格提示词',keep:'必须保留',flex:'允许变化',avoid:'禁止出现'};
let root,settings=localStorage.getItem('icon-studio-api')||'',access=sessionStorage.getItem('icon-studio-access')||'';
let selected='',command='',semantics=[],variants=1,size=256,transparent=true,busy=null,message='',left=true,right=true,background='light',view='grid';
const routes={analyze:'分析参考图',generate:'生成图标',evaluate:'检查一致性',semantics:'提取语义'};
const scenes={底部导航:['首页','搜索','收藏','消息','我的'],功能宫格:['购物车','相机','日历','定位'],设置列表:['个人中心','通知','设置'],桌面工具栏:['文件夹','搜索','日历','相机'],仪表盘:['首页','文件夹','消息','设置']};
let scene='底部导航';
const byId=id=>state.icons.find(icon=>icon.id===id);
const configure=()=>'<details class="orig-connect"><summary>AI 服务连接</summary><label>服务地址<input data-original-field="endpoint" type="url" placeholder="https://你的后端域名" value="'+clean(settings)+'"></label><label>服务访问码<input data-original-field="access" type="password" autocomplete="off" value="'+clean(access)+'"></label>'+btn('status','检查连接')+'<small>执行 AI 操作时，相关参考图会发送到配置的后端和 OpenAI。</small></details>';
let storageError=false;
function save(){
 if(!database){storageError=true;return;}
 const tx=database.transaction('project','readwrite');
 tx.onerror=()=>{storageError=true;report('浏览器存储空间不足，最近改动仅保留在当前页面');};
 tx.objectStore('project').put(state,'current');
}
function report(text){message=text;if(root?.isConnected)root.querySelector('.orig-status').textContent=text;}
function endpoint(){
 if(!settings&&['127.0.0.1','localhost'].includes(location.hostname))return location.origin;
 if(!settings)throw new Error('请先在「AI 服务连接」中配置服务地址和访问码');
 const url=new URL(settings);
 if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('AI 服务地址必须使用 HTTPS');
 return url.origin;
}
async function ask(route,payload,signal){
 const url=endpoint()+'/api/'+route;
 if(route!=='status'&&!access)throw new Error('请输入 AI 服务访问码');
 let response;
 try{response=await fetch(url,payload?{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify(payload),signal}:{signal});}
 catch(error){if(error.name==='AbortError')throw error;throw new Error('无法连接 AI 服务，请检查地址、网络和跨域配置');}
 const body=await response.json().catch(()=>null);
 if(!response.ok||!body)throw new Error(body?.error||'AI 服务返回了无法读取的响应');
 return body;
}
function task(label,run){
 if(busy)return;
 const controller=new AbortController();
 busy={label,controller};message='';draw();
 Promise.resolve().then(()=>run(controller.signal)).catch(error=>report(error.name==='AbortError'?'已取消等待，已完成的结果保留':error.message)).finally(()=>{busy=null;draw();});
}
function resample(url,dimensions,region){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onerror=()=>reject(new Error('无法解码图片，请检查文件格式'));
  img.onload=()=>{
   const canvas=document.createElement('canvas');
   const [x,y,w,h]=region||[0,0,1,1];
   const sourceWidth=img.naturalWidth*w,sourceHeight=img.naturalHeight*h;
   const scale=dimensions/Math.max(sourceWidth,sourceHeight);
   canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));
   canvas.getContext('2d').drawImage(img,img.naturalWidth*x,img.naturalHeight*y,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
   resolve({url:canvas.toDataURL('image/png'),width:img.naturalWidth,height:img.naturalHeight});
  };
  img.src=url;
 });
}
async function fileRef(file){
 const type=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'})[file.name.split('.').pop().toLowerCase()];
 if(!type||file.size>8*1024*1024)throw new Error('支持 PNG、JPG、WEBP、SVG，单张最大 8 MB');
 const url=await new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;
  reader.readAsDataURL(file.slice(0,file.size,type));
 });
 const raster=await resample(url,768);
 if(raster.url.length>2700000)throw new Error('模型输入图像过大，请缩小后重试');
 return {id:crypto.randomUUID(),name:file.name,url,input:type==='image/svg+xml'?raster.url:(file.size<=2*1024*1024?url:raster.url),facts:{type,bytes:file.size,width:raster.width,height:raster.height}};
}
function changeRefs(refs){state.refs=refs;state.profile=null;state.locked=null;save();draw();}
async function files(list,replace){
 if(busy)return;
 const next=[...state.refs], errors=[];
 for(const file of [...list].slice(0,replace?1:Math.max(0,6-next.length))){
  try{
   const ref=await fileRef(file);
   const pos=next.findIndex(item=>item.id===replace);
   if(pos>=0)next[pos]=ref;else next.push(ref);
  }catch(error){errors.push(error.message);}
 }
 if(next.some((ref,index)=>ref!==state.refs[index]))changeRefs(next);
 report(errors.join('；')||(next.length===6?'已达到 6 张参考图上限':'参考图已就绪'));
}
function lockedSpec(snapshot){
 const {references,...profile}=snapshot;
 return {references:references.map(ref=>ref.input),profile:{...profile,referenceNames:references.map(ref=>ref.name)}};
}
function modelFields(data){
 const source=data.inference||{};
 const confirmed={};
 for(const name of Object.keys(fields))confirmed[name]=typeof source[name]==='string'?source[name].slice(0,1500):'';
 return {inferred:source,confirmed,palette:Array.isArray(source.palette)?source.palette.filter(value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)).slice(0,12):[],vision:data.model};
}
function profileView(){
 const draft=state.profile;
 if(!draft)return '<p class="hint">上传后分析原创设计，确认视觉规范后即可锁定。</p>';
 const locked=Boolean(state.locked);
 return '<div class="orig-palette">'+draft.palette.map(v=>'<span style="--swatch:'+v+'">'+v+'</span>').join('')+'</div><small>模型推断可在下方修订并确认。文件属性见各参考图。</small><div class="orig-fields">'+Object.entries(fields).map(([key,label])=>'<label>'+label+'<textarea maxlength="1500" rows="'+(key==='name'?1:2)+'" '+(locked?'readonly ':'')+'data-original-field="profile" data-key="'+key+'">'+clean(draft.confirmed[key])+'</textarea></label>').join('')+'</div>'+(draft.inferred.extra?'<details><summary>其他推断</summary><pre>'+clean(JSON.stringify(draft.inferred.extra,null,2))+'</pre></details>':'')+btn('lock',locked?'解锁并修订':'确认并锁定', '', 'primary')+(locked?btn('save-style','保存原创风格'):'');
}
function referenceView(){
 return '<div class="orig-assets">'+state.refs.map(ref=>'<article>'+btn('ref',imageMarkup(ref)+'<span>'+clean(ref.name)+'</span>',ref.id,'orig-asset')+'<div class="orig-tools">'+btn('replace','替换',ref.id,'quiet')+btn('remove-ref','移除',ref.id,'quiet')+'</div></article>').join('')+'</div>';
}
function outputView(){
 if(view==='scene'){
  return '<div class="preview-stage"><div class="mock"><div class="mock-title">'+scene+'</div><div class="mock-items '+(['设置列表','仪表盘'].includes(scene)?'vertical':'')+'">'+scenes[scene].map((semantic,index)=>{
   const icon=state.icons.find(item=>item.semantic===semantic)||state.icons[index];
   return '<div>'+(icon?imageMarkup({name:icon.semantic,url:icon.url},'scene-icon'):'<span>—</span>')+'<span>'+clean(icon?.semantic||semantic)+'</span></div>';
  }).join('')+'</div></div></div>';
 }
 return '<div class="orig-assets">'+state.icons.map(icon=>'<article>'+btn('select',imageMarkup({name:icon.semantic,url:icon.url})+'<span>'+clean(icon.semantic)+'</span><small>'+clean(icon.review?.status||'待检查')+'</small>',icon.id,'orig-asset '+(icon.id===selected?'on':''))+'</article>').join('')+state.failures.map(f=>'<article class="orig-failed"><b>'+clean(f.semantic)+'</b><small>'+clean(f.error)+'</small>'+btn('retry','重试',f.id,'quiet')+'</article>').join('')+'</div>'+(!state.icons.length&&!state.failures.length?'<div class="orig-empty"><strong>让原创风格延伸到新的图标</strong><p>上传并锁定参考图，在底部输入需要的图标。</p></div>':'');
}
function inspection(){
 const icon=byId(selected);
 if(!icon)return '<h2>图标属性</h2><p class="hint">选择生成结果，可检查一致性、局部修改或导出。</p>';
 return '<h2>图标属性</h2>'+imageMarkup({name:icon.semantic,url:icon.url},'orig-inspect')+'<strong>'+clean(icon.semantic)+'</strong><small>风格版本 '+icon.snapshot.version+' · '+clean(icon.review?.status||'待检查')+'</small>'+(icon.review?.notes?'<p class="hint">'+clean(icon.review.notes)+'</p>':'')+btn('evaluate','检查一致性')+btn('confirm','标记为已确认')+'<label>局部修改<textarea maxlength="700" data-original-field="edit" placeholder="例如减少内部细节，保留材质与光影"></textarea></label>'+btn('edit','应用修改')+btn('regenerate','重新生成')+(icon.history?.length?btn('compare','查看版本与撤销'):'')+btn('adopt','添加为辅助参考')+btn('png','下载 PNG')+btn('remove-icon','删除图标');
}
function draw(){
 if(!root?.isConnected)return;
 const switched=root.dataset.initial!=='yes';
 root.dataset.initial='yes';
 root.innerHTML='<div class="workbar"><div class="row">'+btn('left',left?'收起风格':'展开风格','','quiet')+'<b>原创风格工作台</b></div><div class="row"><a class="secondary small" href="#presets">使用系统预设</a>'+btn('right',right?'收起属性':'展开属性','','quiet')+'</div></div><div class="workspace original-workspace '+(!left?'hide-left ':'')+(!right?'hide-right':'')+'"><aside class="left-panel"><h2>风格基因</h2><label class="drop orig-drop" tabindex="0">＋ 上传参考图标<small>拖拽或选择 1–6 张 PNG、JPG、WEBP、SVG</small><input data-original-file type="file" accept=".png,.jpg,.jpeg,.webp,.svg" multiple hidden></label>'+btn('analyze','分析原创风格','','primary')+profileView()+configure()+'</aside><section class="canvas '+background+'"><div class="canvas-top"><div class="segmented">'+btn('view','图标画布','grid',view==='grid'?'on':'')+btn('view','应用场景预览','scene',view==='scene'?'on':'')+'</div><div class="row">'+(view==='scene'?'<select data-original-field="scene" aria-label="应用场景">'+Object.keys(scenes).map(key=>'<option '+(scene===key?'selected':'')+'>'+key+'</option>').join('')+'</select>':'')+'<select aria-label="画布背景" data-original-field="background">'+[['light','浅色'],['dark','深色'],['transparent','透明']].map(([key,label])=>'<option value="'+key+'" '+(key===background?'selected':'')+'>'+label+'</option>').join('')+'</select>'+btn('zip','批量导出')+'</div></div><div class="canvas-body"><h2>我的原创参考图标</h2>'+referenceView()+(!state.refs.length?'<p class="hint">添加原创图标，建议使用 3–6 张同系列作品。</p>':'')+'<h2 class="orig-result-title">AI 生成图标</h2>'+outputView()+'</div><div class="command orig-command"><div class="command-head"><strong>AI 创作指令</strong><span role="status" class="orig-status">'+clean(busy?.label||message||(state.locked?'已锁定风格 · 版本 '+state.locked.version:storageError?'本地存储不可用':'等待确认风格'))+'</span></div><textarea data-original-field="command" maxlength="1000" rows="2" placeholder="例如生成宠物喂养、睡眠监测、城市骑行图标">'+clean(command)+'</textarea><div class="orig-tags">'+semantics.map((item,index)=>'<label><input maxlength="80" aria-label="图标语义 '+(index+1)+'" data-original-field="semantic" data-key="'+index+'" value="'+clean(item)+'">'+btn('remove-tag','×',index,'quiet')+'</label>').join('')+'</div><div class="orig-generate">'+btn('parse','提取语义','','quiet')+btn('add-tag','添加语义','','quiet')+'<label>候选 <select data-original-field="variants">'+[1,2,3].map(n=>'<option '+(n===variants?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>PNG <select data-original-field="size">'+[64,128,256,512,1024].map(n=>'<option '+(n===size?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label><input type="checkbox" data-original-field="transparent" '+(transparent?'checked':'')+'> 透明背景</label>'+btn(busy?'cancel':'generate',busy?'取消':'生成图标','','primary small')+'</div></div></section><aside class="right-panel">'+inspection()+'</aside></div>';
 if(busy)root.querySelectorAll('[data-original]').forEach(button=>{if(!['cancel','left','right'].includes(button.dataset.original))button.disabled=true;});
 if(switched)root.querySelector('.original-workspace').animate([{opacity:.6},{opacity:1}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:190});
}
export function mountOriginal(element){root=element;draw();}
export function originalLibrary(){return '<section class="collection orig-library"><h2>原创风格</h2><div class="gallery">'+(state.styles.map((item,index)=>'<article><div class="orig-library-images">'+item.references.slice(0,3).map(ref=>imageMarkup(ref)).join('')+'</div><h3>'+clean(item.confirmed.name||'原创风格')+'</h3><small>版本 '+item.version+'</small><div class="row">'+btn('load-style','使用',index)+btn('copy-style','复制',index)+btn('json','下载 JSON',index)+'</div></article>').join('')||'<p>锁定原创风格后，可在工作台保存。</p>')+'</div></section>';}
export function originalAssets(){return '<section class="collection orig-library"><h2>原创生成资产</h2><div class="orig-assets">'+(state.icons.map(icon=>'<article>'+btn('open',imageMarkup({name:icon.semantic,url:icon.url})+'<span>'+clean(icon.semantic)+'</span>',icon.id,'orig-asset')+'</article>').join('')||'<p>原创模式生成的图标会出现在这里。</p>')+'</div></section>';}
function show(title,body){const box=document.querySelector('#modal');box.innerHTML='<div class="dialog-head"><h2>'+title+'</h2>'+btn('close','关闭','','quiet')+'</div>'+body;if(!box.open)box.showModal();return box;}
function simpleParse(){
 return command.trim().replace(/^.*?(?:请生成|生成|绘制|设计)\s*/,'').replace(/图标(?:[，。,.；;].*)?$/,'').split(/[、，,；;\n]|(?:以及|和|与)/).map(v=>v.trim().replace(/[。.!！]$/,'')).filter(Boolean).slice(0,16);
}
async function generate(item,signal){
 const {snapshot,semantic,previous,edit,transparent}=item;
 const input=lockedSpec(snapshot);
 if(previous)input.target=(await resample(previous,768)).url;
 const result=await ask('generate',{...input,semantic,transparent,edit},signal);
 if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(result.image))throw new Error('服务未返回有效 PNG');
 if(signal.aborted)throw new DOMException('已取消','AbortError');
 return result;
}
async function batch(items,signal){
 for(const [index,item] of items.entries()){
  if(signal.aborted)throw new DOMException('已取消','AbortError');
  report('正在生成 '+(index+1)+' / '+items.length+' · '+item.semantic);
  try{
   const result=await generate(item,signal);
   state.failures=state.failures.filter(f=>f.id!==item.id);
   if(item.target){
    const icon=byId(item.target);
    if(icon){icon.history=[...(icon.history||[]),{url:icon.url,review:icon.review}].slice(-6);icon.url=result.image;icon.review=null;icon.model=result.model;}
   }else state.icons.push({id:crypto.randomUUID(),semantic:item.semantic,snapshot:item.snapshot,url:result.image,model:result.model,transparent:item.transparent,history:[]});
   save();
  }catch(error){
   if(error.name==='AbortError')throw error;
   state.failures=[...state.failures.filter(f=>f.id!==item.id),{...item,error:error.message}];save();
  }
  draw();report('已处理 '+(index+1)+' / '+items.length);
 }
 report(state.failures.length?'生成已结束，可单独重试失败项':'生成完成，建议检查一致性');
}
function fileName(name){return name.replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,65)||'图标';}
function download(filename,data){
 const url=URL.createObjectURL(data);
 const anchor=Object.assign(document.createElement('a'),{href:url,download:filename});anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function png(icon){return (await fetch((await resample(icon.url,size)).url)).blob();}
function zip(entries){
 const encoder=new TextEncoder(),locals=[],central=[];let offset=0,total=0;
 const make=length=>new Uint8Array(length);
 const set=(buffer,position,value,width=4)=>new DataView(buffer.buffer)[width===4?'setUint32':'setUint16'](position,value,true);
 for(const [name,data] of entries){
  const n=encoder.encode(name);let crc=-1;
  for(const byte of data){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  crc=(~crc)>>>0;
  const local=make(30),entry=make(46);
  set(local,0,0x04034b50);set(local,4,20,2);set(local,6,0x800,2);set(local,14,crc);set(local,18,data.length);set(local,22,data.length);set(local,26,n.length,2);
  set(entry,0,0x02014b50);set(entry,4,20,2);set(entry,6,20,2);set(entry,8,0x800,2);set(entry,16,crc);set(entry,20,data.length);set(entry,24,data.length);set(entry,28,n.length,2);set(entry,42,offset);
  locals.push(local,n,data);central.push(entry,n);offset+=local.length+n.length+data.length;total+=entry.length+n.length;
 }
 const end=make(22);set(end,0,0x06054b50);set(end,8,entries.length,2);set(end,10,entries.length,2);set(end,12,total);set(end,16,offset);
 return new Blob([...locals,...central,end],{type:'application/zip'});
}
let replacing='';
document.addEventListener('input',event=>{
 const el=event.target,f=el.dataset.originalField;
 if(!f)return;
 if(f==='command'){command=el.value;semantics=[];root.querySelector('.orig-tags').replaceChildren();}
 if(f==='semantic')semantics[Number(el.dataset.key)]=el.value;
 if(f==='profile'&&state.profile&&!state.locked){state.profile.confirmed[el.dataset.key]=el.value;save();}
 if(f==='endpoint'){settings=el.value.trim();localStorage.setItem('icon-studio-api',settings);}
 if(f==='access'){access=el.value;sessionStorage.setItem('icon-studio-access',access);}
});
document.addEventListener('change',event=>{
 const el=event.target,f=el.dataset.originalField;
 if(el.hasAttribute('data-original-file')){const target=replacing;replacing='';files(el.files,target);el.value='';}
 if(f==='variants')variants=Number(el.value);
 if(f==='size')size=Number(el.value);
 if(f==='transparent')transparent=el.checked;
 if(f==='background'){background=el.value;draw();}
 if(f==='scene'){scene=el.value;draw();}
});
document.addEventListener('keydown',event=>{
 const drop=event.target.closest('.orig-drop');
 if(drop&&['Enter',' '].includes(event.key)){event.preventDefault();replacing='';drop.querySelector('input').click();}
});
document.addEventListener('dragover',event=>{const area=event.target.closest('.orig-drop');if(area){event.preventDefault();area.classList.add('drag-over');}});
document.addEventListener('dragleave',event=>event.target.closest('.orig-drop')?.classList.remove('drag-over'));
document.addEventListener('drop',event=>{const area=event.target.closest('.orig-drop');if(area){event.preventDefault();area.classList.remove('drag-over');files(event.dataTransfer.files);}});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-original]');
 if(!button)return;
 const value=button.dataset.value,action=button.dataset.original,icon=byId(selected),ref=state.refs.find(item=>item.id===value);
 const modal=document.querySelector('#modal');
 switch(action){
 case 'left':left=!left;break;
 case 'right':right=!right;break;
 case 'view':view=value;break;
 case 'select':selected=value;right=true;break;
 case 'open':selected=value;right=true;location.hash='studio';return;
 case 'status':{
  const connected=button.closest('details');
  ask('status').then(info=>{connected.open=true;report(info.ready?'AI 服务可用，执行操作时会验证访问码':'服务已响应，尚未配置密钥或访问码');}).catch(error=>report(error.message));return;
 }
 case 'analyze':
  if(!state.refs.length)return report('请先上传原创参考图');
  if(state.locked)return report('请先解锁风格再分析');
  task('正在分析原创参考图',async signal=>{state.profile=modelFields(await ask('analyze',{references:state.refs.map(item=>item.input)},signal));save();report('分析完成，请确认视觉规范');});return;
 case 'lock':
  if(state.locked)state.locked=null;
  else if(state.profile&&state.refs.length){
   if(JSON.stringify(state.profile).length>11500)return report('风格分析和确认内容超过长度限制');
   state.locked={...structuredClone(state.profile),id:crypto.randomUUID(),version:++state.version,references:[...state.refs],generation:{size:1024,format:'png'}};
  }
  save();break;
 case 'save-style':if(state.locked){state.styles.push(state.locked);save();report('已保存原创风格');}return;
 case 'load-style':{
  const saved=state.styles[Number(value)];state.refs=[...saved.references];state.profile=structuredClone(saved);delete state.profile.references;delete state.profile.version;delete state.profile.id;state.locked=saved;save();location.hash='studio';return;
 }
 case 'copy-style':{
  const saved=structuredClone(state.styles[Number(value)]);saved.id=crypto.randomUUID();saved.confirmed.name=(saved.confirmed.name||'原创风格')+' 副本';state.styles.push(saved);save();window.dispatchEvent(new Event('hashchange'));return;
 }
 case 'json':download('原创风格.json',new Blob([JSON.stringify(state.styles[Number(value)],null,2)],{type:'application/json'}));return;
 case 'ref':if(ref){
  const box=show('原创参考图预览',imageMarkup(ref,'orig-reference-large')+'<p>'+ref.facts.width+' × '+ref.facts.height+' 像素 · '+Math.round(ref.facts.bytes/1024)+' KB</p><p class="hint">拖动框选区域后，可将裁切副本添加为参考。</p>'+btn('crop','添加框选区域',ref.id,'primary'));
  const img=box.querySelector('img');let start=null;
  img.draggable=false;
  const xy=e=>{const r=img.getBoundingClientRect();return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];};
  img.onpointerdown=e=>{start=xy(e);img.setPointerCapture(e.pointerId);delete box.dataset.region;box.querySelector('p.hint').textContent='正在框选';};
  img.onpointerup=e=>{if(!start)return;const end=xy(e);const region=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(start[0]-end[0]),Math.abs(start[1]-end[1])];start=null;if(region[2]<.02||region[3]<.02)return;box.dataset.region=JSON.stringify(region);box.querySelector('p.hint').textContent='已框选区域，确认后添加裁切副本。';};
  }return;
 case 'crop':
  if(!modal.dataset.region||!ref)return;
  if(state.refs.length>=6){modal.querySelector('p.hint').textContent='已达到 6 张参考图上限';return;}
  {const region=JSON.parse(modal.dataset.region);modal.close();task('正在保存区域',async()=>{const cropped=await resample(ref.url,768,region);changeRefs([...state.refs,{id:crypto.randomUUID(),name:ref.name+' · 裁切',url:cropped.url,input:cropped.url,facts:{type:'image/png',bytes:Math.floor(cropped.url.length*.75),width:Math.round(cropped.width*region[2]),height:Math.round(cropped.height*region[3])}}]);});}return;
 case 'replace':replacing=value;root.querySelector('[data-original-file]').click();return;
 case 'remove-ref':changeRefs(state.refs.filter(item=>item.id!==value));return;
 case 'add-tag':if(!semantics.length)semantics=simpleParse();if(semantics.length<16)semantics.push('');break;
 case 'remove-tag':semantics.splice(Number(value),1);break;
 case 'parse':
  if(!command.trim())return report('请输入图标需求');
  if(!settings&&!access){semantics=simpleParse();message='已按标点拆分，请检查语义标签';break;}
  task('正在提取图标语义',async signal=>{const result=await ask('semantics',{text:command},signal);semantics=result.items;report('请检查并编辑语义标签');});return;
 case 'generate':{
  if(!state.locked)return report('请先分析并锁定原创风格');
  if(!semantics.length){semantics=simpleParse();message='请核对语义标签后，再点击生成图标';draw();return;}
  const items=[...new Set(semantics.map(item=>item.trim()).filter(Boolean))];
  if(!items.length)return report('至少需要一个有效语义');
  const queue=items.flatMap(semantic=>Array.from({length:variants},()=>({id:crypto.randomUUID(),semantic,snapshot:state.locked,transparent})));
  task('准备生成 '+queue.length+' 个图标',signal=>batch(queue,signal));return;
 }
 case 'cancel':busy?.controller.abort();return;
 case 'retry':{const failure=state.failures.find(item=>item.id===value);if(failure)task('正在重试',signal=>batch([failure],signal));return;}
 case 'evaluate':if(icon)task('正在检查一致性',async signal=>{const target=(await resample(icon.url,768)).url;icon.review=await ask('evaluate',{...lockedSpec(icon.snapshot),target},signal);save();});return;
 case 'confirm':if(icon){icon.review={status:'用户已确认',notes:icon.review?.notes};save();}break;
 case 'edit':case 'regenerate':if(icon){
  const edit=root.querySelector('[data-original-field="edit"]').value.trim();
  if(action==='edit'&&!edit)return report('请输入局部修改要求');
  task('正在修改图标',signal=>batch([{id:crypto.randomUUID(),semantic:icon.semantic,snapshot:icon.snapshot,transparent:icon.transparent,target:icon.id,...(action==='edit'?{previous:icon.url,edit}:{})}],signal));
 }return;
 case 'compare':if(icon)show('图标版本','<div class="orig-version"><div><b>当前版本</b>'+imageMarkup({url:icon.url,name:icon.semantic})+'</div>'+icon.history.map((entry,index)=>'<div><b>历史版本 '+(index+1)+'</b>'+imageMarkup({url:entry.url,name:icon.semantic})+btn('restore','恢复此版本',index)+'</div>').join('')+'</div>');return;
 case 'restore':if(icon){const chosen=icon.history[Number(value)];icon.history=[...icon.history,{url:icon.url,review:icon.review}].slice(-6);icon.url=chosen.url;icon.review=chosen.review;save();modal.close();}break;
 case 'adopt':if(icon)show('添加辅助参考','<p>当前资产使用的锁定版本会保留。将此图加入参考集合后，请重新分析并确认新的风格版本。</p>'+btn('adopt-confirm','确认添加',icon.id,'primary'));return;
 case 'adopt-confirm':{
  const item=byId(value);if(!item)return;
  modal.close();if(state.refs.length>=6)return report('请先移除一张参考图');
  task('正在添加辅助参考',async()=>{const data=await resample(item.url,768);changeRefs([...state.refs,{id:crypto.randomUUID(),name:item.semantic+' · 辅助参考',url:item.url,input:data.url,facts:{type:'image/png',bytes:Math.floor(item.url.length*.75),width:data.width,height:data.height}}]);});return;
 }
 case 'remove-icon':if(icon){state.icons=state.icons.filter(item=>item.id!==selected);state.failures=state.failures.filter(item=>item.target!==selected);selected='';save();}break;
 case 'png':if(icon)task('正在导出 PNG',async()=>{download(fileName(icon.semantic)+'-'+size+'.png',await png(icon));report('已导出 PNG');});return;
 case 'zip':
  if(!state.icons.length)return report('请先生成图标');
  task('正在打包 PNG',async signal=>{const entries=[];for(const [index,item] of state.icons.entries()){if(signal.aborted)throw new DOMException('已取消','AbortError');entries.push([index+1+'-'+fileName(item.semantic)+'-'+size+'.png',new Uint8Array(await (await png(item)).arrayBuffer())]);}download('原创图标.zip',zip(entries));report('已导出压缩包');});return;
 case 'close':modal.close();return;
 default:return;
 }
 draw();
});
