import {analyzeLocal,prepareImport,normalize,prompts,separateReferenceIcons} from './local-tools.mjs';
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
let direct=true;
let quota=null, pending=[], publicSitekey='', turnstileScript;
const managedEndpoint=new URL('./ai-endpoint.json',import.meta.url);
let root,access=sessionStorage.getItem('icon-studio-pilot')||'';
const invitation=new URLSearchParams(location.hash.split('?')[1]).get('invite');
if(invitation){access=invitation;sessionStorage.setItem('icon-studio-pilot',invitation);const cleanUrl=new URL(location.href);cleanUrl.hash='studio';history.replaceState(null,'',cleanUrl);}
let selected='',command='',semantics=[],variants=1,size=256,transparent=true,busy=null,message='',left=matchMedia('(min-width: 871px)').matches,right=left,background='light',view='grid';
const routes={analyze:'分析参考图',generate:'生成图标',evaluate:'检查一致性',semantics:'提取语义'};
const scenes={底部导航:['首页','搜索','收藏','消息','我的'],功能宫格:['购物车','相机','日历','定位'],设置列表:['个人中心','通知','设置'],桌面工具栏:['文件夹','搜索','日历','相机'],仪表盘:['首页','文件夹','消息','设置']};
let scene='底部导航';
const byId=id=>state.icons.find(icon=>icon.id===id);
let storageError=false;
function save(){
 if(!database){storageError=true;return;}
 const tx=database.transaction('project','readwrite');
 tx.onerror=()=>{storageError=true;report('浏览器存储空间不足，最近改动仅保留在当前页面');};
 tx.objectStore('project').put(state,'current');
}
function report(text){message=text;if(root?.isConnected)root.querySelector('.orig-status').textContent=text;}
async function ask(route,payload,signal){
 const deadline=AbortSignal.timeout(route==='analyze'?25000:45000);
 const requestSignal=signal?AbortSignal.any([signal,deadline]):deadline;
 return requestAI(route,payload,requestSignal).catch(error=>{
  if(signal?.aborted)throw new DOMException('已取消','AbortError');
  if(deadline.aborted)throw new Error('服务响应超时，请重试');
  if(error.name==='TypeError')throw new Error('无法连接云端生成服务，请检查网络后重试');
  throw error;
 });
}
async function requestAI(route,payload,signal){
 const configResponse=await fetch(managedEndpoint,{signal,cache:'no-store'});
 if(!configResponse.ok)throw new Error('无法读取云端服务配置');
 const config=await configResponse.json().catch(()=>null);
 if(typeof config?.url!=='string'||!config.url.startsWith('https://'))throw new Error('生成服务尚未发布');
 publicSitekey=typeof config.turnstileSitekey==='string'?config.turnstileSitekey:'';
 const headers=access?{Authorization:'Bearer '+access}:{};
 if(payload&&!access){
  if(!publicSitekey)throw new Error('公开生成尚未启用');
  headers['X-Turnstile-Token']=await verifyVisitor(signal);
 }
 let body;const submittedImages=[];
 if(payload){
  body=new FormData();
  body.set('id',payload.id||crypto.randomUUID());
  for(const url of (payload.references||[])){
   const view=await resample(url,480,undefined,true);
   const binary=/^data:image\/png;base64,/.test(url)&&Math.max(view.width,view.height)<512?url:view.url;
   const file=await (await fetch(binary,{signal})).blob();
   if(file.size>=1100000)throw new Error('参考图太大，请先裁成单张图标');
   body.append('reference',file,'reference.png');
   if(route==='generate')submittedImages.push(binary);
  }
  if(payload.target){const url=(await resample(payload.target,480)).url;body.set('target',await (await fetch(url)).blob(),'target.png');}
  if(payload.profile)body.set('profile',JSON.stringify(payload.profile.confirmed||payload.profile));
  for(const field of ['semantic','edit'])if(payload[field])body.set(field,payload[field]);
 }
 const started=performance.now();
 const result=await fetch(config.url+'/api/'+route,{method:payload?'POST':'GET',headers,body,signal});
 const data=await result.json().catch(()=>null);
 console.info('Icon Studio AI 请求',{route,status:result.status,elapsedMs:Math.round(performance.now()-started),workerMs:data?.elapsedMs});
 if(!data)throw new Error('云端服务返回异常（HTTP '+result.status+'），请重试');
 if(!result.ok)throw Object.assign(new Error(data.error||'生成服务请求失败'),{status:result.status});
 quota=data.quota||(route==='status'?data:quota);
 return route==='generate'?{...data,submittedImages}:data;
}
function task(label,run){
 if(busy)return;
 const controller=new AbortController();
 busy={label,controller};message='';draw();
 Promise.resolve().then(()=>run(controller.signal)).catch(error=>report(error.name==='AbortError'?'已取消等待，已完成的结果保留':error.message)).finally(()=>{busy=null;pending=[];draw();});
}
function resample(url,dimensions,region,noUpscale=false){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onerror=()=>reject(new Error('无法解码图片，请检查文件格式'));
  img.onload=()=>{
   try{
   const canvas=document.createElement('canvas');
   const [x,y,w,h]=region||[0,0,1,1];
   const sourceWidth=img.naturalWidth*w,sourceHeight=img.naturalHeight*h;
   const ratio=dimensions/Math.max(sourceWidth,sourceHeight);
   const scale=noUpscale?Math.min(1,ratio):ratio;
   canvas.width=Math.max(1,Math.round(sourceWidth*scale));canvas.height=Math.max(1,Math.round(sourceHeight*scale));
   canvas.getContext('2d').drawImage(img,img.naturalWidth*x,img.naturalHeight*y,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
   resolve({url:canvas.toDataURL('image/png'),width:img.naturalWidth,height:img.naturalHeight});
   }catch{reject(new Error('浏览器无法处理该图片'));}
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
function changeRefs(refs){state.refs=refs;state.representatives=(state.representatives||[]).filter(id=>refs.some(ref=>ref.id===id));state.profile=null;state.locked=null;save();draw();}
async function files(list,replace){
 if(busy)return;
 const next=[...state.refs], errors=[];let automatic=[];
 for(const file of [...list].slice(0,replace?1:Math.max(0,6-next.length))){
  try{
   const ref=await fileRef(file);
   const pos=next.findIndex(item=>item.id===replace);
   if(pos>=0)next[pos]=ref;else next.push(ref);
  }catch(error){errors.push(error.message);}
 }
  if(next.some((ref,index)=>ref!==state.refs[index])){
  if(!replace&&list.length===1&&next.length<6){
   const source=next.at(-1);
   if(source.facts.width/source.facts.height>1.25){
    try{const crops=await separateReferenceIcons(source);if(crops.length>=4)automatic=crops.slice(0,6-next.length);}catch{}
   }
  }
  changeRefs([...next,...automatic]);
  if(automatic.length){state.representatives=automatic.slice(0,3).map(item=>item.id);save();draw();return report('已从截图分离图标。请检查裁切，并选择需要使用的参考。');}
 }
 report(errors.join('；')||(next.length===6?'已达到 6 张参考图上限':'参考图已就绪'));
}
function lockedSpec(snapshot){
 const {references,measurements,...profile}=snapshot;
 return {references:references.filter(ref=>!profile.selectedRefs||profile.selectedRefs.includes(ref.id)).slice(0,3).map(ref=>ref.input),profile:{...profile,referenceNames:references.map(ref=>ref.name)}};
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
 return '<div class="orig-palette">'+draft.palette.map(v=>'<span style="--swatch:'+v+'">'+v+'</span>').join('')+'</div>'+(draft.source==='local'?'<small>浏览器直接测量。造型、材质和光影请手动确认。</small>'+localMeasurements(draft):'<small>模型推断可在下方修订并确认。文件属性见各参考图。</small>')+'<div class="orig-fields">'+Object.entries(fields).map(([key,label])=>'<label>'+label+'<textarea maxlength="1500" rows="'+(key==='name'?1:2)+'" '+(locked?'readonly ':'')+'data-original-field="profile" data-key="'+key+'">'+clean(draft.confirmed[key])+'</textarea></label>').join('')+'</div>'+(draft.inferred.extra?'<details><summary>其他推断</summary><pre>'+clean(JSON.stringify(draft.inferred.extra,null,2))+'</pre></details>':'')+btn('lock',locked?'解锁并修订':'确认并锁定', '', 'primary')+(locked?btn('save-style','保存原创风格'):'');
}
function referenceView(){
 return '<div class="orig-assets">'+state.refs.map(ref=>'<article>'+btn('ref',imageMarkup(ref)+'<span>'+clean(ref.name)+'</span>',ref.id,'orig-asset')+'<div class="orig-tools">'+btn('replace','替换',ref.id,'quiet')+btn('remove-ref','移除',ref.id,'quiet')+(!ref.derivedFrom?btn('split-source','识别图标',ref.id,'quiet'):'')+btn('reference-choice',effectiveRefs().includes(ref)?'已选参考':'选为参考',ref.id,'quiet')+'</div></article>').join('')+'</div>';
}
function outputView(){
 if(view==='scene'){
  return '<div class="preview-stage"><div class="mock"><div class="mock-title">'+scene+'</div><div class="mock-items '+(['设置列表','仪表盘'].includes(scene)?'vertical':'')+'">'+scenes[scene].map((semantic,index)=>{
   const icon=state.icons.find(item=>item.semantic===semantic)||state.icons[index];
   return '<div>'+(icon?imageMarkup({name:icon.semantic,url:icon.url},'scene-icon'):'<span>—</span>')+'<span>'+clean(icon?.semantic||semantic)+'</span></div>';
  }).join('')+'</div></div></div>';
 }
 return '<div class="orig-assets">'+pending.filter(item=>['等待','生成中'].includes(item.status)).map(item=>'<article class="orig-failed">'+clean(item.semantic)+' · '+item.status+'</article>').join('')+state.icons.map(icon=>'<article>'+btn('select',imageMarkup({name:icon.semantic,url:icon.showOriginal&&icon.original?icon.original:icon.url})+'<span>'+clean(icon.semantic)+'</span><small>'+clean(icon.review?.status||(icon.elapsedMs?'生成成功 · '+(icon.elapsedMs/1000).toFixed(2)+' 秒':'待检查'))+'</small>',icon.id,'orig-asset '+(icon.id===selected?'on':''))+'</article>').join('')+state.failures.map(f=>'<article class="orig-failed"><b>'+clean(f.semantic)+'</b><small>'+clean(f.error)+'</small>'+btn('retry','重试',f.id,'quiet')+'</article>').join('')+'</div>'+(!state.icons.length&&!state.failures.length?'<div class="orig-empty"><strong>让原创风格延伸到新的图标</strong><p>上传参考图后，输入语义即可生成。风格分析和锁定可选。</p></div>':'');
}
function inspection(){
 const icon=byId(selected);
 if(!icon)return '<h2>图标属性</h2><p class="hint">选择生成结果，可检查一致性、局部修改或导出。</p>';
 return '<h2>图标属性</h2>'+imageMarkup({name:icon.semantic,url:icon.showOriginal&&icon.original?icon.original:icon.url},'orig-inspect')+'<strong>'+clean(icon.semantic)+'</strong><small>风格版本 '+(icon.snapshot?.version||'未绑定')+' · '+clean(icon.review?.status||'待检查')+'</small>'+(icon.review?.notes?'<p class="hint">'+clean(icon.review.notes)+'</p>':'')+(direct&&icon.snapshot?.references?.length?btn('evaluate','检查一致性'):'')+btn('confirm','标记为已确认')+'<label>局部修改<textarea maxlength="700" data-original-field="edit" placeholder="例如减少内部细节，保留材质与光影"></textarea></label>'+(direct&&icon.snapshot?.references?.length?btn('edit','应用修改')+btn('regenerate','重新生成'):btn('edit-prompt','构建局部修改提示词'))+(icon.original?btn('background-tool','调节去背景')+btn('toggle-original',icon.showOriginal?'查看透明结果':'查看原图'):'')+(icon.history?.length?btn('compare','查看版本与撤销'):'')+btn('adopt','添加为辅助参考')+btn('png','下载 PNG')+btn('remove-icon','删除图标')+(icon.audit?btn('request-audit','查看生成请求'):'');
}
function draw(){
 if(!root?.isConnected)return;
 const switched=root.dataset.initial!=='yes';
 root.dataset.initial='yes';
 root.innerHTML='<div class="workbar"><div class="row">'+btn('left',left?'收起风格':'展开风格','','quiet')+'<div class="segmented">'+btn('mode','高级辅助','local',!direct?'on':'')+btn('mode','AI 图标创作','direct',direct?'on':'')+'</div></div><div class="row"><a class="secondary small" href="#presets">使用系统预设</a>'+btn('right',right?'收起属性':'展开属性','','quiet')+'</div></div><div class="workspace original-workspace '+(!left?'hide-left ':'')+(!right?'hide-right':'')+'"><aside class="left-panel"><h2>风格基因</h2><label class="drop orig-drop" tabindex="0">＋ 上传参考图标<small>拖拽或选择 1–6 张 PNG、JPG、WEBP、SVG</small><input data-original-file type="file" accept=".png,.jpg,.jpeg,.webp,.svg" multiple hidden></label>'+btn('analyze',direct?'AI 分析原创风格':'本地分析参考图','','primary')+profileView()+(direct?((access||publicSitekey)?'<small>'+(access?'私人测试':'公开免费')+' · '+(quota?'今日剩余 AI 次数 '+quota.remainingGenerations+' 次 · 本站预留估算 '+quota.estimatedReserved+' Neurons':'正在读取额度')+'</small>':'<p class="hint">'+(publicSitekey?'公开免费使用 · 首次提交需通过安全验证':'正在检查公开生成服务')+'</p>'):'')+'</aside><section class="canvas '+background+'"><div class="canvas-top"><div class="segmented">'+btn('view','图标画布','grid',view==='grid'?'on':'')+btn('view','应用场景预览','scene',view==='scene'?'on':'')+'</div><div class="row">'+(view==='scene'?'<select data-original-field="scene" aria-label="应用场景">'+Object.keys(scenes).map(key=>'<option '+(scene===key?'selected':'')+'>'+key+'</option>').join('')+'</select>':'')+'<select aria-label="画布背景" data-original-field="background">'+[['light','浅色'],['dark','深色'],['transparent','透明']].map(([key,label])=>'<option value="'+key+'" '+(key===background?'selected':'')+'>'+label+'</option>').join('')+'</select>'+(!direct?btn('import','导入生成结果','','primary small')+btn('rename','批量重命名','','quiet'):'')+btn('zip','批量导出')+'</div></div><div class="canvas-body"><h2>我的原创参考图标</h2>'+referenceView()+(!state.refs.length?'<p class="hint">添加原创图标，建议使用 3–6 张同系列作品。</p>':'')+'<h2 class="orig-result-title">'+(direct?'AI 生成图标':'创作资产')+'</h2>'+outputView()+'</div><div class="command orig-command"><div class="command-head"><strong>'+(direct?'AI 图标创作':'图标需求与提示词')+'</strong><span role="status" class="orig-status">'+clean(busy?.label||message||(state.locked?'已锁定风格 · 版本 '+state.locked.version:storageError?'本地存储不可用':'上传参考图后即可生成'))+'</span></div><textarea data-original-field="command" maxlength="1000" rows="2" placeholder="例如生成宠物喂养、睡眠监测、城市骑行图标">'+clean(command)+'</textarea><div class="orig-tags">'+semantics.map((item,index)=>'<label><input maxlength="80" aria-label="图标语义 '+(index+1)+'" data-original-field="semantic" data-key="'+index+'" value="'+clean(item)+'">'+btn('remove-tag','×',index,'quiet')+'</label>').join('')+'</div><div class="orig-generate">'+btn('parse','提取语义','','quiet')+btn('add-tag','添加语义','','quiet')+(direct?'<label>候选 <select data-original-field="variants">'+[1,2,3].map(n=>'<option '+(n===variants?'selected':'')+'>'+n+'</option>').join('')+'</select></label>':'')+'<label>PNG <select data-original-field="size">'+[64,128,256,512,1024].map(n=>'<option '+(n===size?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+(direct?'<label><input type="checkbox" data-original-field="transparent" '+(transparent?'checked':'')+'> 透明背景</label>':'')+btn(busy?'cancel':direct?'generate':'prompt',busy?'取消':direct?'生成图标':'生成提示词','','primary small')+'</div></div></section><aside class="right-panel">'+inspection()+'</aside></div>';
 if(busy)root.querySelectorAll('[data-original]').forEach(button=>{if(!['cancel','left','right'].includes(button.dataset.original))button.disabled=true;});
 if(switched)root.querySelector('.original-workspace').animate([{opacity:.6},{opacity:1}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:190});
}
export function mountOriginal(element){root=element;draw();ask('status').then(()=>{if(!busy)draw();}).catch(error=>report(error.message));}
export function originalLibrary(){return '<section class="collection orig-library"><h2>原创风格</h2><div class="gallery">'+(state.styles.map((item,index)=>'<article><div class="orig-library-images">'+item.references.slice(0,3).map(ref=>imageMarkup(ref)).join('')+'</div><h3>'+clean(item.confirmed.name||'原创风格')+'</h3><small>版本 '+item.version+'</small><div class="row">'+btn('load-style','使用',index)+btn('copy-style','复制',index)+btn('json','下载 JSON',index)+'</div></article>').join('')||'<p>锁定原创风格后，可在工作台保存。</p>')+'</div></section>';}
export function originalAssets(){return '<section class="collection orig-library"><h2>原创生成资产</h2><div class="orig-assets">'+(state.icons.map(icon=>'<article>'+btn('open',imageMarkup({name:icon.semantic,url:icon.showOriginal&&icon.original?icon.original:icon.url})+'<span>'+clean(icon.semantic)+'</span>',icon.id,'orig-asset')+'</article>').join('')||'<p>原创模式生成的图标会出现在这里。</p>')+'</div></section>';}
function show(title,body){const box=document.querySelector('#modal');box.innerHTML='<div class="dialog-head"><h2>'+title+'</h2>'+btn('close','关闭','','quiet')+'</div>'+body;if(!box.open)box.showModal();return box;}
function simpleParse(){
 return command.trim().replace(/^.*?(?:请生成|生成|绘制|设计)\s*/,'').replace(/图标(?:[，。,.；;].*)?$/,'').split(/[、，,；;\n]|(?:以及|和|与)/).map(v=>v.trim().replace(/[。.!！]$/,'')).filter(Boolean).slice(0,16);
}
async function generate(item,signal){
 const {snapshot,semantic,previous,edit,transparent}=item;
 const input={...lockedSpec(snapshot),id:item.id};
 if(previous)input.target=(await resample(previous,768)).url;
 const result=await ask('generate',{...input,semantic,edit},signal);
 if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(result.image))throw new Error('服务未返回有效图像');
 if(signal.aborted)throw new DOMException('已取消','AbortError');
 const asset={...result,original:result.image};
 if(!transparent)return asset;
 try{
  const prepared=await prepareImport({url:result.image},{mode:'single',remove:true,tolerance:26,feather:true});
  return {...asset,image:prepared.source.toDataURL('image/png')};
 }catch{return {...asset,backgroundWarning:true};}
}
async function batch(items,signal){
 pending=items.map(item=>({...item,status:'等待'}));
 for(const [index,item] of items.entries()){
  if(signal.aborted)throw new DOMException('已取消','AbortError');
  pending[index].status='生成中';draw();
  report('正在生成 '+(index+1)+' / '+items.length+' · '+item.semantic);
  try{
   const result=await generate(item,signal);
   state.failures=state.failures.filter(f=>f.id!==item.id&&f.id!==item.retryId);
   if(item.target){
    const icon=byId(item.target);
    if(icon){icon.history=[...(icon.history||[]),{url:icon.url,original:icon.original,review:icon.review}].slice(-6);icon.url=result.image;icon.original=result.original;icon.showOriginal=false;icon.review=null;icon.model=result.model;icon.audit=result.audit;icon.submittedImages=result.submittedImages;}
   }else state.icons.push({id:crypto.randomUUID(),semantic:item.semantic,snapshot:item.snapshot,url:result.image,original:result.original,model:result.model,transparent:item.transparent,elapsedMs:result.elapsedMs,audit:result.audit,submittedImages:result.submittedImages,history:[]});
   pending[index].status='成功';save();
  }catch(error){
   if(error.name==='AbortError')throw error;
   pending[index].status='失败';
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
const chosenRefs=()=>state.refs.filter(ref=>state.representatives?.includes(ref.id));
function effectiveRefs(){const chosen=chosenRefs();return (chosen.length?chosen:state.refs).slice(0,3);}
document.addEventListener('input',event=>{
 const el=event.target,f=el.dataset.originalField;
 if(!f)return;
 if(f==='command'){command=el.value;semantics=[];root.querySelector('.orig-tags').replaceChildren();}
 if(f==='semantic')semantics[Number(el.dataset.key)]=el.value;
 if(f==='profile'&&state.profile&&!state.locked){state.profile.confirmed[el.dataset.key]=el.value;save();}
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
 case 'mode':direct=value==='direct';message='';break;
 case 'prompt':promptDialog('batch','',semantics.length?null:simpleParse());return;
 case 'edit-prompt':if(icon)promptDialog('edit',root.querySelector('[data-original-field="edit"]').value,[icon.semantic],icon.snapshot||state.locked);return;
 case 'copy-prompt':{
  const text=modal.querySelector('#prompt-'+value);
  navigator.clipboard.writeText(text.value).then(()=>modal.querySelector('#prompt-message').textContent='已复制').catch(()=>{text.select();modal.querySelector('#prompt-message').textContent='请使用键盘复制所选文字';});return;
 }
 case 'references-zip':{
  const refs=modal.snapshotForPrompt?.references||[];
  Promise.all(refs.map(async(ref,index)=>[index+1+'-'+ref.name.replace(/[\\/]/g,'-'),new Uint8Array(await (await fetch(ref.url)).arrayBuffer())])).then(entries=>download('原创参考图.zip',zip(entries))).catch(()=>{modal.querySelector('#prompt-message').textContent='参考图打包失败';});return;
 }
 case 'import':importRefs=[];importDialog();return;
 case 'add-region':{
  const item=prepared?.[Number(value)];
  if(item&&item.boxes.length<64){item.boxes.push([0,0,item.source.width,item.source.height]);paintBoxes(item,Number(value));}return;
 }
 case 'delete-region':{
  const [index,pos]=value.split(',').map(Number);const item=prepared?.[index];
  if(item){item.boxes.splice(pos,1);paintBoxes(item,index);}return;
 }
 case 'apply-import':{
  if(!prepared)return;
  const count=prepared.reduce((sum,item)=>sum+item.boxes.length,0);
  if(count>64){modal.querySelector('#import-status').textContent='每批最多导入 64 个图标，请减少切割区域。';return;}
  const names=semantics.length?semantics:simpleParse();
  const assets=[];
  for(const item of prepared)for(const region of item.boxes){
   const url=normalize(item,region,size,importOptions.ratio/100,importOptions.center);
   if(!url)continue;
   assets.push({id:crypto.randomUUID(),semantic:names[assets.length]?.trim()||item.name.replace(/\.[^.]+$/,'')+(item.boxes.length>1?' '+(item.boxes.indexOf(region)+1):''),url,snapshot:state.locked,history:[],imported:true});
  }
  if(!assets.length){modal.querySelector('#import-status').textContent='所选区域没有可见图标，请调整框选或背景容差。';return;}
  state.icons.push(...assets);save();modal.close();view='grid';selected=assets[0].id;message='已导入 '+assets.length+' 个 '+size+' 像素图标';break;
 }
 case 'rename':if(state.icons.length)show('批量重命名','<label>按顺序输入名称，每行一个<textarea id="rename-list" rows="8">'+clean(state.icons.map(item=>item.semantic).join('\n'))+'</textarea></label>'+btn('apply-rename','保存名称','','primary small'));else report('请先导入图标');return;
 case 'apply-rename':{
  const replacements=modal.querySelector('#rename-list').value.split(/\r?\n/);
  state.icons.forEach((item,index)=>{const name=replacements[index]?.trim();if(name)item.semantic=name.slice(0,80);});save();modal.close();break;
 }
 case 'split-source':{
  const ref=state.refs.find(item=>item.id===value);
  if(!ref)return;
  task('正在识别截图内图标',async()=>{
   const crops=await separateReferenceIcons(ref);
   if(!crops.length)return report('未识别到独立图标，请点击原图手动框选');
   const remaining=state.refs.filter(item=>item.derivedFrom!==ref.id);
   const slots=6-remaining.length;
   if(slots<1)return report('参考区已满，请先移除不需要的参考图');
   const added=crops.slice(0,slots);
   changeRefs([...remaining,...added]);
   state.representatives=added.slice(0,3).map(item=>item.id);save();
   report('已从截图分离 '+added.length+' 张图标，原图仍保留。请检查裁切并选择参考。');
  });return;
 }
 case 'reference-choice':{
  if(state.locked)return report('请先解锁风格，再更换生成参考');
  const ids=effectiveRefs().map(item=>item.id); const pos=ids.indexOf(value);
  if(pos<0&&ids.length>=3)return report('最多选择三张，请先取消一张');
  if(pos>=0&&ids.length===1)return report('至少选择一张参考图');
  state.representatives=pos<0?[...ids,value]:ids.filter(id=>id!==value);state.profile=null;save();break;
 }
 case 'analyze':
  if(!state.refs.length)return report('请先上传原创参考图');
  if(state.locked)return report('请先解锁风格再分析');
  task(direct?'正在分析原创参考图':'正在提取本地视觉特征',async signal=>{
   const refs=effectiveRefs();
   if(!direct){
    state.profile=await analyzeLocal(refs);save();report('本地分析完成，请确认视觉规范');return;
   }
   
   try {
    state.profile=modelFields(await ask('analyze',{references:refs.map(item=>item.input)},signal));
    save();report('AI 分析完成，请确认视觉规范');
   } catch(error) {
    if(signal.aborted||error.name==='AbortError'||error.status===401||error.status===403)throw error;
    state.profile=await analyzeLocal(refs);
    save();report('AI 分析暂不可用，已提取本地色板与比例。请补充造型特征后锁定，生成仍使用原始参考图。');
   }
  });return;
 case 'lock':
  if(state.locked)state.locked=null;
  else if(state.profile&&state.refs.length){
   if(JSON.stringify(state.profile).length>11500)return report('风格分析和确认内容超过长度限制');
   state.locked={...structuredClone(state.profile),id:crypto.randomUUID(),version:++state.version,references:[...state.refs],selectedRefs:effectiveRefs().map(ref=>ref.id),generation:{size:1024,format:'png'}};
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
  semantics=simpleParse();message='已按标点拆分，请检查语义标签';break;
 case 'generate':{
  if(!effectiveRefs().length)return report('请先上传原创参考图');
  const snapshot=state.locked||{id:crypto.randomUUID(),version:0,references:effectiveRefs(),confirmed:state.profile?.confirmed||{name:'原创参考',keep:'以实际参考图为准，保留配色、形状和线条语言'}};
  if(!semantics.length)semantics=simpleParse();
  const items=[...new Set(semantics.map(item=>item.trim()).filter(Boolean))];
  if(!items.length)return report('至少需要一个有效语义');
  if(items.length*variants>6)return report('每批最多生成六张，可减少语义或候选数量');
  const queue=items.flatMap(semantic=>Array.from({length:variants},()=>({id:crypto.randomUUID(),semantic,snapshot,transparent})));
  task('准备生成 '+queue.length+' 个图标',signal=>batch(queue,signal));return;
 }
 case 'cancel':busy?.controller.abort();return;
 case 'retry':{const failure=state.failures.find(item=>item.id===value);if(failure)task('正在重试',signal=>batch([{...failure,id:crypto.randomUUID(),retryId:failure.id}],signal));return;}
 case 'evaluate':if(icon?.snapshot?.references?.length)task('正在检查一致性',async signal=>{const target=(await resample(icon.url,768)).url;icon.review=await ask('evaluate',{...lockedSpec(icon.snapshot),target},signal);save();});return;
 case 'confirm':if(icon){icon.review={status:'用户已确认',notes:icon.review?.notes};save();}break;
 case 'edit':case 'regenerate':if(icon?.snapshot?.references?.length){
  const edit=root.querySelector('[data-original-field="edit"]').value.trim();
  if(action==='edit'&&!edit)return report('请输入局部修改要求');
  task('正在修改图标',signal=>batch([{id:crypto.randomUUID(),semantic:icon.semantic,snapshot:icon.snapshot,transparent:icon.transparent,target:icon.id,...(action==='edit'?{previous:icon.url,edit}:{})}],signal));
 }return;
 case 'compare':if(icon)show('图标版本','<div class="orig-version"><div><b>当前版本</b>'+imageMarkup({url:icon.url,name:icon.semantic})+'</div>'+icon.history.map((entry,index)=>'<div><b>历史版本 '+(index+1)+'</b>'+imageMarkup({url:entry.url,name:icon.semantic})+btn('restore','恢复此版本',index)+'</div>').join('')+'</div>');return;
 case 'restore':if(icon){const chosen=icon.history[Number(value)];icon.history=[...icon.history,{url:icon.url,original:icon.original,review:icon.review}].slice(-6);icon.url=chosen.url;icon.original=chosen.original;icon.showOriginal=false;icon.review=chosen.review;save();modal.close();}break;
 case 'adopt':if(icon)show('添加辅助参考','<p>当前资产使用的锁定版本会保留。将此图加入参考集合后，请重新分析并确认新的风格版本。</p>'+btn('adopt-confirm','确认添加',icon.id,'primary'));return;
 case 'adopt-confirm':{
  const item=byId(value);if(!item)return;
  modal.close();if(state.refs.length>=6)return report('请先移除一张参考图');
  task('正在添加辅助参考',async()=>{const data=await resample(item.url,768);changeRefs([...state.refs,{id:crypto.randomUUID(),name:item.semantic+' · 辅助参考',url:item.url,input:data.url,facts:{type:'image/png',bytes:Math.floor(item.url.length*.75),width:data.width,height:data.height}}]);});return;
 }
 case 'remove-icon':if(icon){state.icons=state.icons.filter(item=>item.id!==selected);state.failures=state.failures.filter(item=>item.target!==selected);selected='';save();}break;
  case 'request-audit':if(icon?.audit){
  const refs=icon.snapshot.references.filter(ref=>!icon.snapshot.selectedRefs||icon.snapshot.selectedRefs.includes(ref.id)).slice(0,3);
  show('实际模型请求','<div class="orig-assets">'+(icon.submittedImages||[]).map((url,index)=>imageMarkup({name:refs[index]?.name||'模型参考图',url},'orig-inspect')).join('')+'</div><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+clean(JSON.stringify(icon.audit,null,2))+'</pre>');
 }return;
 case 'toggle-original':if(icon){icon.showOriginal=!icon.showOriginal;save();}break;
 case 'background-tool':if(icon?.original)backgroundTool(icon);return;
 case 'png':if(icon)task('正在导出 PNG',async()=>{download(fileName(icon.semantic)+'-'+size+'.png',await png(icon));report('已导出 PNG');});return;
 case 'zip':
  if(!state.icons.length)return report('请先生成图标');
  task('正在打包 PNG',async signal=>{const entries=[];for(const [index,item] of state.icons.entries()){if(signal.aborted)throw new DOMException('已取消','AbortError');entries.push([index+1+'-'+fileName(item.semantic)+'-'+size+'.png',new Uint8Array(await (await png(item)).arrayBuffer())]);}download('原创图标.zip',zip(entries));report('已导出压缩包');});return;
 case 'close':modal.close();return;
 default:return;
 }
 draw();
});
function localMeasurements(draft){
 return '<div class="local-measurements">'+draft.measurements.map(item=>'<details><summary>'+clean(item.name)+'</summary><small>'+item.width+' × '+item.height+' 像素 · 透明 '+item.transparent+'%</small><small>可见像素 '+item.coverage+'% · 边界长边 '+item.span+'%</small>'+(item.margin?'<small>上右下左留白 '+item.margin.join('% / ')+'%</small>':'')+(item.transparent===0?'<small>图片全不透明，边界包含背景。</small>':'')+(item.svg?'<small>SVG 路径 '+item.svg.paths+' · 视口 '+clean(item.svg.viewBox||'未声明')+'</small><small>填充 '+clean(item.svg.fill.join('、')||'未声明')+' · 描边 '+clean(item.svg.stroke.join('、')||'未声明')+' · 粗细 '+clean(item.svg.strokeWidth.join('、')||'未声明')+'</small>':'')+'</details>').join('')+'</div>';
}
function promptDialog(kind='batch',edit='',targets=null,snapshot=state.locked){
 if(!snapshot)return report('请先分析并确认风格');
 const items=targets||semantics.filter(value=>value.trim()).map(value=>value.trim());
 const types=[['single','单图标'],['batch','批量'],['consistency','一致性'],['edit','局部修改']];
 const [zh,en]=prompts(snapshot,items,kind,edit);
 const box=show('生成提示词','<p class="hint">在外部工具中手动上传原始参考图并粘贴提示词。局部修改时也上传目标图标。英文版保留无法确定译法的用户原文。</p><label>提示词用途<select id="prompt-kind">'+types.map(([key,label])=>'<option value="'+key+'" '+(key===kind?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+(kind==='edit'?'<label>修改要求<input maxlength="700" id="prompt-edit" value="'+clean(edit)+'"></label>':'')+'<div class="local-prompt"><label>中文<textarea readonly rows="7" id="prompt-zh">'+clean(zh)+'</textarea></label>'+btn('copy-prompt','复制中文','zh')+'<label>英文<textarea readonly rows="7" id="prompt-en">'+clean(en)+'</textarea></label>'+btn('copy-prompt','复制英文','en')+'</div><div class="row">'+btn('references-zip','下载原始参考图')+'<a class="primary small" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">打开 ChatGPT</a></div><span id="prompt-message" role="status"></span>');
 box.snapshotForPrompt=snapshot;
 box.querySelector('#prompt-kind').onchange=event=>promptDialog(event.target.value,edit,items,snapshot);
 const editInput=box.querySelector('#prompt-edit');
 if(editInput)editInput.oninput=()=>{const [cn,english]=prompts(snapshot,items,kind,editInput.value);box.querySelector('#prompt-zh').value=cn;box.querySelector('#prompt-en').value=english;};
}
let importRefs=[], prepared=null, generation=0;
const importOptions={mode:'single',rows:2,cols:2,remove:false,tolerance:34,feather:true,ratio:78,center:true};
function importDialog(){
 prepared=null;
 const box=show('导入生成结果','<p class="hint">图标保留为透明 PNG。纯色背景可尝试移除，复杂背景请先在外部工具处理。</p><label>选择图标文件<input type="file" id="result-files" accept=".png,.jpg,.jpeg,.webp,.svg" multiple></label><div class="local-import-settings"><label>切割方式<select id="cut-mode"><option value="single">每文件一个图标</option><option value="grid">按行列切割</option><option value="alpha">按透明间隔切割</option></select></label><label>行数<input type="number" min="1" max="8" id="cut-rows" value="'+importOptions.rows+'"></label><label>列数<input type="number" min="1" max="8" id="cut-cols" value="'+importOptions.cols+'"></label><label>主体长边占比 %<input type="number" min="35" max="100" id="asset-ratio" value="'+importOptions.ratio+'"></label><label>背景容差<input type="number" min="5" max="100" id="bg-tolerance" value="'+importOptions.tolerance+'"></label></div><div class="local-checks"><label><input type="checkbox" id="bg-remove">移除纯色背景</label><label><input type="checkbox" id="edge-feather" checked>柔化边缘</label><label><input type="checkbox" id="asset-center" checked>按可见像素重心对齐</label></div><p id="import-status" role="status"></p><div id="import-preview"></div><div class="row">'+btn('apply-import','确认导入','','primary small')+'</div>');
 box.querySelector('#cut-mode').value=importOptions.mode;
 box.querySelector('#bg-remove').checked=importOptions.remove;
 box.querySelector('#edge-feather').checked=importOptions.feather;
 box.querySelector('#asset-center').checked=importOptions.center;
 box.querySelector('#result-files').onchange=async event=>{
  const run=++generation;const result=[];let skipped=0;
  for(const file of [...event.target.files].slice(0,16)){try{result.push(await fileRef(file));}catch{skipped++;}}
  if(run!==generation||!box.open||!box.querySelector('#result-files'))return;
  importRefs=result;updateImport(skipped?'有 '+skipped+' 张文件无法读取。':'');
 };
 box.querySelectorAll('.local-import-settings input,.local-import-settings select,.local-checks input').forEach(el=>el.onchange=()=>updateImport());
 updateImport();
}
function numberValue(box,id,min,max,fallback){
 const value=Number(box.querySelector('#'+id).value);
 return Number.isFinite(value)&&value>=min&&value<=max?Math.round(value):fallback;
}
async function updateImport(note=''){
 const run=++generation,box=document.querySelector('#modal'),preview=box.querySelector('#import-preview'),status=box.querySelector('#import-status');
 if(!preview)return;
 Object.assign(importOptions,{mode:box.querySelector('#cut-mode').value,rows:numberValue(box,'cut-rows',1,8,2),cols:numberValue(box,'cut-cols',1,8,2),ratio:numberValue(box,'asset-ratio',35,100,78),tolerance:numberValue(box,'bg-tolerance',5,100,34),remove:box.querySelector('#bg-remove').checked,feather:box.querySelector('#edge-feather').checked,center:box.querySelector('#asset-center').checked});
 prepared=null;preview.replaceChildren();status.textContent=importRefs.length?'正在计算切割区域…':note||'请选择一张或多张文件。';
 if(!importRefs.length)return;
 const settings={...importOptions};
 try{
  const result=[];
  for(const ref of importRefs){
   const item=await prepareImport(ref,settings);
   if(run!==generation||!preview.isConnected||!box.open)return;
   result.push({...item,name:ref.name});
  }
  prepared=result;
  status.textContent=note+' 识别到 '+result.reduce((sum,item)=>sum+item.boxes.length,0)+' 个区域。可编辑坐标，或在下方图片拖动新增区域。';
  result.forEach((item,index)=>{
   const area=document.createElement('section');area.className='import-source';
   area.innerHTML='<strong>'+clean(item.name)+'</strong><small>处理图尺寸 '+item.source.width+' × '+item.source.height+'</small><div class="import-stage" aria-label="按住并拖动以框选区域"></div><div class="import-boxes"></div>'+btn('add-region','新增区域',index,'quiet');
   preview.append(area);
   const stage=area.querySelector('.import-stage');
   stage.append(item.source);
   let start=null;
   const point=event=>{const b=stage.getBoundingClientRect();return [Math.max(0,Math.min(item.source.width,Math.round((event.clientX-b.left)/b.width*item.source.width))),Math.max(0,Math.min(item.source.height,Math.round((event.clientY-b.top)/b.height*item.source.height)))];};
   stage.onpointerdown=event=>{start=point(event);stage.setPointerCapture(event.pointerId);};
   stage.onpointerup=event=>{
    if(!start)return;const end=point(event),x=Math.min(start[0],end[0]),y=Math.min(start[1],end[1]),w=Math.abs(start[0]-end[0]),h=Math.abs(start[1]-end[1]);start=null;
    if(w>2&&h>2&&item.boxes.length<64){item.boxes.push([x,y,w,h]);paintBoxes(item,index);}
   };
   paintBoxes(item,index);
  });
 }catch{status.textContent='无法计算切割区域，请尝试更小的图片。';}
}
function paintBoxes(item,index){
 const area=document.querySelectorAll('.import-source')[index], stage=area.querySelector('.import-stage'), rows=area.querySelector('.import-boxes');
 stage.querySelectorAll('i').forEach(el=>el.remove());
 rows.innerHTML=item.boxes.map((region,pos)=>{
  const overlay=document.createElement('i');
  const [x,y,w,h]=region;
  Object.assign(overlay.style,{left:x/item.source.width*100+'%',top:y/item.source.height*100+'%',width:w/item.source.width*100+'%',height:h/item.source.height*100+'%'});stage.append(overlay);
  return '<div><span>'+String(pos+1)+'</span>'+region.map((v,col)=>'<input type="number" min="0" aria-label="'+['横坐标','纵坐标','宽度','高度'][col]+'" data-region="'+pos+'" data-coordinate="'+col+'" value="'+v+'">').join('')+btn('delete-region','移除',index+','+pos,'quiet')+'</div>';
 }).join('');
 rows.onchange=event=>{
  const input=event.target,{region,coordinate}=input.dataset;
  if(region===undefined)return;
  const current=item.boxes[Number(region)];
  const limits=[item.source.width-1,item.source.height-1,item.source.width,item.source.height];
  current[coordinate]=Math.min(limits[coordinate],Math.max(Number(coordinate)>1?1:0,Math.round(Number(input.value)||0)));
  current[2]=Math.min(current[2],item.source.width-current[0]);current[3]=Math.min(current[3],item.source.height-current[1]);paintBoxes(item,index);
 };
}
function backgroundTool(icon){
 const box=show('去除背景','<p class="hint">默认只移除与四周相连的底色。开启内部去白可处理描边中的留白，但可能移除白色或浅色主体。纯白主体和相同颜色的背景无法仅靠颜色可靠分离。</p><div class="comparison"><div>'+imageMarkup({url:icon.original,name:'原始图像'},'background-sample')+'</div><div class="background-checker"><img class="background-sample" id="background-result" alt="去背景预览"></div></div><label>背景容差<input id="background-tolerance" type="range" min="4" max="75" value="26"></label><label><input id="background-inside" type="checkbox"> 同时去除内部留白</label><button class="primary small" id="background-save" disabled>保存透明结果</button>');
 let index=0,previewUrl='';
 const update=async()=>{
  const request=++index;
  box.querySelector('#background-save').disabled=true;
  try{
   const result=await prepareImport({url:icon.original},{mode:'single',remove:true,tolerance:Number(box.querySelector('#background-tolerance').value),feather:true,interior:box.querySelector('#background-inside').checked});
   if(request!==index||!box.open||!box.querySelector('#background-result'))return;
   previewUrl=result.source.toDataURL('image/png');
   box.querySelector('#background-result').src=previewUrl;
   box.querySelector('#background-save').disabled=false;
  }catch{report('无法处理原始图像');}
 };
 box.querySelector('#background-tolerance').oninput=update;
 box.querySelector('#background-inside').onchange=update;
 box.querySelector('#background-save').onclick=()=>{if(previewUrl){icon.url=previewUrl;icon.showOriginal=false;save();box.close();draw();report('已保存透明 PNG，原图已保留');}};
 update();
}


async function verifyVisitor(signal){
 if(!turnstileScript){
  turnstileScript=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
   script.onload=()=>resolve(window.turnstile);
   script.onerror=()=>{turnstileScript=null;script.remove();reject(new Error('安全验证加载失败，请检查网络后重试'));};
   document.head.append(script);
  });
 }
 return new Promise((resolve,reject)=>{
  const box=document.createElement('dialog');
  box.className='orig-security';
  const title=document.createElement('h2');title.textContent='免费生成安全验证';
  const area=document.createElement('div'),cancel=document.createElement('button');
  cancel.textContent='取消';cancel.className='secondary small';
  box.append(title,area,cancel);document.body.append(box);box.showModal();
  let widget;
  const finish=(error,token)=>{
   signal?.removeEventListener('abort',abort);
   if(widget!==undefined)window.turnstile?.remove(widget);
   box.remove();
   if(error)reject(error);else resolve(token);
  };
  const abort=()=>finish(new DOMException('已取消','AbortError'));
  box.oncancel=event=>{event.preventDefault();abort();};
  cancel.onclick=abort;
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  turnstileScript.then(api=>{
   if(!box.isConnected)return;
   if(!api)throw new Error('安全验证未加载');
   widget=api.render(area,{sitekey:publicSitekey,action:'icon-studio',callback:token=>finish(null,token),'error-callback':()=>finish(new Error('安全验证失败，请重试')),'expired-callback':()=>finish(new Error('安全验证已过期，请重试'))});
  }).catch(error=>finish(error));
 });
}


