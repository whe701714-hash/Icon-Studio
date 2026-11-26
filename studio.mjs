import {mountOriginal,originalLibrary,originalAssets} from './original.mjs?v=20261126-public1';
import {svg,styles,preset,shapes,demo} from './icons.mjs';
const names=Object.keys(shapes);
const displayNames={Home:'首页',Search:'搜索',Favorite:'收藏',Message:'消息',Profile:'个人中心',Settings:'设置',Cart:'购物车',Camera:'相机',Calendar:'日历',Location:'定位',Folder:'文件夹',Notification:'通知'};
const nameLabel=value=>displayNames[value]||value;
const featured=['Home','Search','Favorite','Message','Settings','Profile'];
const fresh = name => ({id:crypto.randomUUID(),name,semantic:name,variant:0,history:[],favorite:false});
const defaults={project:'预设图标项目',profile:preset('round'),locked:null,version:0,icons:names.map(fresh),library:[],favorites:[],refs:[]};
let state;
try {state={...defaults,...JSON.parse(localStorage.getItem('icon-studio-v2'))};} catch {state=defaults;}
const $=selector=>document.querySelector(selector);
const app=$('#app'), modal=$('#modal');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const action=(id,label,extra='',cls='')=>'<button type="button" class="'+cls+'" data-action="'+id+'" '+extra+'>'+label+'</button>';
const data=value=>'data-value="'+esc(value)+'"';
const options=(items,value)=>items.map(([key,label])=>'<option value="'+esc(key)+'" '+(key===value?'selected':'')+'>'+esc(label)+'</option>').join('');
const select=(field,items,value,label)=>'<select data-field="'+field+'" aria-label="'+label+'">'+options(items,value)+'</select>';
const profile=()=>state.locked||state.profile;
const styleOptions=styles.map(([id,label,name])=>[id,name+' · '+label]);
const selected=new Set();
let homeStyle='pop', filter='',query='', background='light', zoom=1, grid=24, guides=false, view='grid', scene='底部导航', left=matchMedia('(min-width: 871px)').matches,right=left, command='',quantity=1, job=null, dragged='', toastTimer;
const scenes={'底部导航':['Home','Search','Favorite','Message','Profile'],'功能宫格':['Cart','Camera','Calendar','Location'],'设置列表':['Profile','Notification','Settings'],'桌面工具栏':['Folder','Search','Calendar','Camera'],'仪表盘':['Home','Folder','Message','Settings']};
const save=()=>{try{localStorage.setItem('icon-studio-v2',JSON.stringify(state));}catch{notice('浏览器存储空间不足');}};
function notice(message){$('#toast').textContent=message; $('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
const route=()=>location.hash.slice(1)||'home';
const go=name=>{location.hash=name;};
const iconProfile=icon=>icon.profile||profile();
const glyph=(name,p,v=0)=>svg(name,p,v);
const mark='<span class="mark" aria-hidden="true">✳</span>';
function render(){
 const page=route(); const changed=!app.classList.contains('page-'+page);
 $('#nav').innerHTML='<a class="brand" href="#home">'+mark+'Icon Studio<span>.</span></a><nav aria-label="主导航">'+[['home','首页'],['studio','创作工作台'],['explore','风格探索'],['styles','我的风格'],['icons','我的图标']].map(([key,label])=>'<a class="'+(key===page?'active':'')+'" href="#'+key+'">'+label+'</a>').join('')+'</nav><a class="nav-cta" href="#studio">进入工作台</a>';
 app.className='page-'+page+(changed?' entering':'');
 if(page==='studio'){app.innerHTML='<section id="original"></section>';mountOriginal($('#original'));return;}
 app.innerHTML=({home,presets:studio,explore,styles:stylesPage,icons:iconsPage}[page]||home)();
 if(page==='styles')app.insertAdjacentHTML('beforeend',originalLibrary());
 if(page==='icons')app.insertAdjacentHTML('beforeend',originalAssets());
}
function home(){
 const p=preset(homeStyle);
 return '<section class="hero"><div class="hero-grid" aria-hidden="true"></div><div class="hero-title"><p class="eyebrow"><span></span> 原创图标创作工作室</p><h1><span>一种风格，</span><span><em>无限图标。</em></span></h1><p class="subtitle">上传你的原创设计，让 AI 延续你的视觉语言，打造统一的图标系统。</p><a class="primary" href="#studio">开始创作</a></div><div class="artwork" aria-label="六种图标语义">'+featured.map((name,i)=>'<div class="art art-'+i+'" style="--i:'+i+'"><div class="art-tile" data-art="'+name+'">'+glyph(name,p)+'</div><span>'+nameLabel(name)+'</span></div>').join('')+'</div><div class="style-strip"><span class="style-label">风格切换</span><div class="chips">'+styles.map(([id,label])=>action('home-style',label,data(id),'chip '+(homeStyle===id?'on':''))).join('')+'</div><span id="home-demo">'+(demo(p)?'示例材质':'')+'</span></div></section><section class="home-next"><p class="eyebrow">风格展览</p><h2>同一种语义，<br>不同的视觉语言。</h2><div class="gallery">'+styles.slice(0,4).map(card).join('')+'</div></section>';
}
function card([id,label,name]){
 const p=preset(id);
 return '<article class="style-card"><button class="sample" style="--tint:'+p.tint+'" data-action="style-detail" '+data(id)+' aria-label="查看 '+name+'">'+featured.map(n=>glyph(n,p)).join('')+'</button><div class="card-meta"><div><strong>'+name+'</strong><small>'+label+(demo(p)?' · 样例':'')+'</small></div>'+action('favorite-style',state.favorites.includes(id)?'♥':'♡',data(id)+' aria-label="收藏 '+name+'"','quiet')+'</div></article>';
}
function explore(){
 const result=styles.filter(item=>(!filter||item[0]===filter)&&item.slice(1,3).join(' ').toLowerCase().includes(query.toLowerCase()));
 return '<section class="collection"><p class="eyebrow">风格展览</p><h1>风格探索</h1><p>在成组图标中探索视觉语言。</p><div class="gallery-controls"><div class="chips">'+[['','全部'],...styles].map(([id,label])=>action('filter',label,data(id),'chip '+(filter===id?'on':''))).join('')+'</div><input data-field="search" type="search" placeholder="搜索风格" value="'+esc(query)+'" aria-label="搜索风格"></div><div class="gallery" id="gallery">'+(result.map(card).join('')||'<p>没有匹配的风格。</p>')+'</div></section>';
}
function dna(p){
 return '<div class="dna" style="--tint:'+p.tint+'"><div class="dna-glyphs">'+featured.slice(0,3).map(n=>glyph(n,p)).join('')+'</div><div class="dna-bottom"><div><strong>'+esc(p.name)+'</strong><small>'+(p.version?'V'+p.version:'草稿')+' · '+p.label+'</small></div><div class="swatches"><i style="background:'+p.color+'"></i><i style="background:'+p.accent+'"></i><i style="background:'+p.tint+'"></i></div></div></div>';
}
function stylesPage(){
 return '<section class="collection"><p class="eyebrow">风格库</p><h1>我的风格</h1><div class="gallery">'+(state.library.map((p,i)=>'<article>'+dna(p)+'<div class="row">'+action('load-style','使用风格',data(i),'primary small')+action('copy-style','复制',data(i),'quiet')+action('style-json','JSON',data(i),'quiet')+'</div></article>').join('')||'<p>在工作台保存第一张风格基因卡。</p>')+'</div><h2>收藏风格</h2><div class="gallery">'+(styles.filter(([id])=>state.favorites.includes(id)).map(card).join('')||'<p>还没有收藏风格。</p>')+'</div></section>';
}
function iconsPage(){
 return '<section class="collection"><p class="eyebrow">项目资产</p><h1>我的图标</h1><div class="row"><h2>'+esc(state.project)+'</h2><a class="primary small" href="#presets">打开预设项目</a></div><p>'+state.icons.length+' 个图标 · '+state.icons.filter(icon=>icon.favorite).length+' 个收藏</p><div class="library-grid">'+state.icons.map(i=>'<button data-action="open-icon" '+data(i.id)+'>'+glyph(i.semantic,iconProfile(i),i.variant)+'<span>'+esc(nameLabel(i.name))+'</span></button>').join('')+'</div></section>';
}
function studio(){
 return '<div class="workbar"><div class="row">'+action('left','◧','aria-label="切换风格面板" aria-expanded="'+left+'"','quiet')+'<input class="project" data-field="project" aria-label="项目名称" value="'+esc(state.project)+'"><a class="secondary small" href="#studio">根据我的设计生成</a></div><div class="row">'+action('export','导出','','primary small')+action('right','◨','aria-label="切换属性面板" aria-expanded="'+right+'"','quiet')+'</div></div><div class="workspace '+(!left?'hide-left ':'')+(!right?'hide-right':'')+'"><aside class="left-panel" '+(!left?'inert':'')+'>'+leftPanel()+'</aside><section class="canvas '+background+'" aria-label="图标画布"><div class="canvas-top"><div class="segmented">'+action('view','图标网格',data('grid'),view==='grid'?'on':'')+action('view','应用场景预览',data('ui'),view==='ui'?'on':'')+'</div><div class="row">'+(view==='grid'?select('zoom',[['0.8','紧凑'],['1','标准'],['1.25','放大']],String(zoom),'网格密度')+select('grid',['16','24','32','48'].map(v=>[v,v+' px']),String(grid),'设计网格')+action('guides','⊞','aria-label="规范辅助线" aria-pressed="'+guides+'"','quiet '+(guides?'on':'')):select('scene',Object.keys(scenes).map(v=>[v,v]),scene,'应用场景'))+select('background',[['light','浅色'],['dark','深色'],['transparent','透明']],background,'画布背景')+'</div></div><div class="canvas-body">'+(view==='grid'?iconGrid():uiPreview())+'</div>'+commandBar()+'</section><aside class="right-panel" '+(!right?'inert':'')+'>'+inspector()+'</aside></div>';
}
function leftPanel(){
 const p=profile(), disabled=state.locked?'disabled':'';
 return '<div class="panel-title"><h2>风格基因</h2><small>风格基因</small></div><label class="drop" id="drop" tabindex="0"><b>＋</b> 添加参考图<small>拖拽或选择本地图片</small><input id="upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple hidden></label>'+(state.refs.length?'<div class="ref-list">'+state.refs.map((r,i)=>'<img alt="'+esc(r.name)+'" src="'+esc(r.url)+'">'+action('remove-ref','×',data(i)+' aria-label="移除参考图"','quiet')).join('')+'</div><small>参考图已预览 · AI 分析待接入</small>':'')+select('preset',styleOptions,p.id,'风格预设').replace('<select',state.locked?'<select disabled':'<select')+'<div id="dna">'+dna(p)+'</div><fieldset '+disabled+'><legend>色板与造型</legend><div class="color-controls">'+[['color','主色'],['accent','强调色'],['tint','背景色']].map(([k,l])=>'<label><input type="color" data-field="'+k+'" value="'+p[k]+'">'+l+'</label>').join('')+'</div><div class="row visual-controls"><label><span>线条</span><input type="range" min="1" max="4" step=".25" value="'+p.width+'" data-field="width"></label><label><span>比例</span><input type="range" min=".65" max="1.1" step=".05" value="'+p.scale+'" data-field="scale"></label></div><div class="row">'+action('corner','◯ 圆润',data('round')+' '+disabled,'chip '+(p.corner==='round'?'on':''))+action('corner','◇ 几何',data('sharp')+' '+disabled,'chip '+(p.corner==='sharp'?'on':''))+'</div></fieldset>'+(demo(p)?'<p class="hint">复杂材质 · 演示样例</p>':'')+'<div class="panel-actions">'+action('lock',state.locked?'解锁 风格锁定':'锁定 风格锁定','','primary')+action('save-style','保存风格','','secondary')+'</div>';
}
function iconGrid(){
 return '<div class="canvas-heading"><h1>图标画布</h1><span>'+state.icons.length+' 个图标</span></div><div class="icon-grid '+(guides?'guides':'')+'" style="--cell:'+Math.round(125*zoom)+'px;--asset:'+Math.round(grid*2.2*zoom)+'px">'+state.icons.map(i=>'<article draggable="true" data-icon="'+i.id+'" class="icon-cell '+(selected.has(i.id)?'selected':'')+'"><button class="icon-main" data-action="select" '+data(i.id)+' aria-pressed="'+selected.has(i.id)+'">'+glyph(i.semantic,iconProfile(i),i.variant)+'<span>'+esc(nameLabel(i.name))+'</span></button><div class="hover-tools">'+action('favorite-icon',i.favorite?'♥':'♡',data(i.id)+' aria-label="收藏"')+action('remix','⟳',data(i.id)+' aria-label="重混"')+action('duplicate','⧉',data(i.id)+' aria-label="复制"')+action('delete','×',data(i.id)+' aria-label="删除"')+'</div></article>').join('')+(job?'<div class="skeleton"></div>':'')+'</div>'+(state.icons.length?'':'<p>输入语义，生成第一组图标。</p>');
}
function uiPreview(){
 const labels={Home:'首页',Search:'搜索',Favorite:'收藏',Message:'消息',Profile:'我的',Cart:'购物车',Camera:'相机',Calendar:'日历',Location:'位置',Notification:'通知',Settings:'设置',Folder:'文件'};
 return '<div class="canvas-heading"><h1>应用场景预览</h1><span>'+scene+'</span></div><div class="preview-stage"><div class="mock '+(scene==='底部导航'?'phone':scene==='桌面工具栏'||scene==='仪表盘'?'desktop':'mobile')+'"><div class="mock-title">'+scene+'</div><div class="mock-items '+(scene==='设置列表'||scene==='仪表盘'?'vertical':'')+'">'+scenes[scene].map(n=>{const i=state.icons.find(item=>item.semantic===n);return '<div>'+(i?glyph(i.semantic,iconProfile(i),i.variant):'<span class="empty-slot">—</span>')+'<span>'+labels[n]+'</span></div>';}).join('')+'</div></div></div>';
}
function inspector(){
 const items=state.icons.filter(i=>selected.has(i.id)), p=profile(), start='<div class="panel-title"><h2>图标属性</h2><small>图标属性</small></div>';
 if(!items.length)return start+dna(p)+'<dl><dt>当前版本</dt><dd>'+(p.version?'V'+p.version:'未锁定')+'</dd><dt>项目资产</dt><dd>'+state.icons.length+' 个图标</dd><dt>设计网格</dt><dd>'+grid+' × '+grid+'</dd><dt>参考安全区</dt><dd>内缩 2 / 24</dd></dl><p class="hint">选择图标查看候选方案。Shift 或 Ctrl 点击可多选。</p>'+action('select-all','选择全部图标','','secondary');
 if(items.length>1)return start+'<h3>'+items.length+' 个图标</h3><label>名称前缀<input data-field="prefix" placeholder="例如 navigation"></label><label>分组名称<input data-field="group" placeholder="例如 底部导航"></label><div class="stack">'+action('style-switch','风格切换','','secondary')+action('export','导出选区','','secondary')+action('delete-selected','删除选区','','secondary')+'</div>';
 const i=items[0], ip=iconProfile(i);
 return start+'<div class="inspector-preview">'+glyph(i.semantic,ip,i.variant)+'</div><label>名称<input data-field="icon-name" '+data(i.id)+' value="'+esc(nameLabel(i.name))+'"></label><label>语义'+select('semantic',names.map(v=>[v,nameLabel(v)]),i.semantic,'图标语义')+'</label><div class="section-label">图标重混 <small>候选方案</small></div><div class="candidates">'+[0,1,2].map(v=>action('variant',glyph(i.semantic,ip,v),data(v)+' aria-label="候选 '+(v+1)+'"',i.variant===v?'on':'')).join('')+'</div><dl><dt>继承风格</dt><dd>'+esc(ip.name)+(ip.version?' · V'+ip.version:'')+'</dd><dt>描边</dt><dd>'+ip.width+'</dd>'+(i.group?'<dt>集合</dt><dd>'+esc(i.group)+'</dd>':'')+'</dl><div class="stack">'+action('remix','重新生成候选',data(i.id),'secondary')+action('style-switch','风格切换','','secondary')+(i.history.length?action('compare','查看前后对比',data(i.id),'secondary'):'')+action('export','导出图标','','primary small')+'</div>';
}
const aliases={首页:'Home',主页:'Home',搜索:'Search',收藏:'Favorite',喜欢:'Favorite',消息:'Message',聊天:'Message',设置:'Settings',个人中心:'Profile',我的:'Profile',购物车:'Cart',相机:'Camera',日历:'Calendar',位置:'Location',定位:'Location',文件夹:'Folder',通知:'Notification'};
function tokens(){
 const words=[...Object.entries(aliases),...names.map(n=>[n,n])];
 return [...new Set(words.flatMap(([word,value])=>{const index=command.toLowerCase().indexOf(word.toLowerCase());return index<0?[]:[[index,value]];}).sort((a,b)=>a[0]-b[0]).map(([,value])=>value))];
}
function tags(){return tokens().map(v=>action('remove-token',nameLabel(v)+' ×',data(v),'token')).join('');}
function commandBar(){
 const p=profile();
 return '<div class="command"><div class="command-head"><strong>创作指令</strong><span>'+(job?'正在生成 '+job.done+' / '+job.total:state.locked?esc(p.name)+' · V'+p.version:'本地 SVG 模板生成')+'</span></div><div id="tags" class="tags">'+tags()+'</div><div class="command-entry"><input data-field="command" placeholder="生成首页、搜索、收藏和消息图标…" aria-label="输入图标语义" value="'+esc(command)+'"><label class="attach" title="添加参考图" aria-label="添加参考图" for="upload">＋</label>'+select('quantity',[1,2,3].map(n=>[String(n),n+' 个候选']),String(quantity),'候选数量')+action(job?'cancel':'generate',job?'取消':'生成','','primary small')+'</div></div>';
}
const byId=id=>state.icons.find(icon=>icon.id===id);
const update=()=>{save();render();};
const close=()=>modal.close();
function dialog(title,body){modal.innerHTML='<div class="dialog-head"><h2>'+title+'</h2>'+action('close','×','aria-label="关闭"','quiet')+'</div>'+body;if(!modal.open)modal.showModal();}
function download(name,contents,type){const url=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const scope=()=>state.icons.filter(i=>!selected.size||selected.has(i.id));
const exportable=()=>scope().filter(i=>!demo(iconProfile(i)));
const saveSvg=i=>download(i.name.replace(/[\\/:*?"<>|]/g,'-')+'.svg',glyph(i.semantic,iconProfile(i),i.variant).replace('viewBox','width="24" height="24" viewBox'),'image/svg+xml');
function styleSwitch(value='flat'){
 const p=preset(value);
 dialog('风格切换','<label>目标风格'+select('switch-target',styleOptions,value,'目标风格')+'</label><div class="comparison">'+[null,p].map((target,index)=>'<div><small>'+['切换前','切换后'][index]+'</small><div>'+scope().slice(0,6).map(i=>glyph(i.semantic,target||iconProfile(i),i.variant)).join('')+'</div></div>').join('')+'</div>'+(demo(p)?'<p>复杂材质仅提供示例预览。</p>':action('apply-switch','应用风格',data(value),'primary small')));
}
function record(i){i.history=[...i.history,{variant:i.variant,profile:{...iconProfile(i)},semantic:i.semantic}].slice(-12);}
async function addFiles(files){
 for(const f of [...files].slice(0,Math.max(0,8-state.refs.length))){
  if(!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(f.type)||f.size>320000){notice('支持 PNG、JPEG、WebP、GIF、SVG，每张最多 320 KB');continue;}
  try{const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(f);});state.refs.push({name:f.name,url});}catch{notice('无法读取参考图');}
 }
 update();
}
function generate(){
 const list=tokens(), p={...profile()};
 if(!list.length){notice('请输入支持的语义，例如首页、搜索、收藏或消息');return;}
 if(demo(p)){notice('该材质仅展示样例，请选择可生成的 SVG 风格');return;}
 const task={done:0,total:list.length*quantity};
 job=task;const batch=list.flatMap(n=>Array.from({length:quantity},(_,variant)=>({n,variant})));
 const step=()=>{
  if(job!==task)return;
  const next=batch[task.done++];
  state.icons.push({...fresh(next.n),variant:next.variant,profile:{...p}});
  if(task.done===task.total){job=null;notice('已生成 '+task.total+' 个 SVG 图标');}
  save();if(route()==='presets')render();
  if(job===task)setTimeout(step,170);
 };
 render();setTimeout(step,170);
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const {action:a,value:v}=b.dataset,i=byId(v);
 switch(a){
 case 'home-style': {
  homeStyle=v;const target=preset(v);
  document.querySelectorAll('[data-art]').forEach(tile=>{tile.innerHTML=glyph(tile.dataset.art,target);tile.firstChild.animate([{opacity:.25,transform:'scale(.88)'},{opacity:1,transform:'scale(1)'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:220});});
  document.querySelectorAll('[data-action="home-style"]').forEach(chip=>{chip.classList.toggle('on',chip.dataset.value===v);chip.setAttribute('aria-pressed',chip.dataset.value===v);});
  $('#home-demo').textContent=demo(target)?'示例材质':'';return;
 }
 case 'filter':filter=v;break;
 case 'favorite-style':state.favorites=state.favorites.includes(v)?state.favorites.filter(x=>x!==v):[...state.favorites,v];break;
 case 'style-detail':{const p=preset(v);dialog(p.name,dna(p)+'<div class="detail-icons">'+names.map(n=>'<div>'+glyph(n,p)+'<small>'+nameLabel(n)+'</small></div>').join('')+'</div><p>24 × 24 · '+p.label+(demo(p)?' · 示例材质':'')+'</p><div class="detail-icons detail-nav">'+featured.slice(0,5).map(n=>'<div>'+glyph(n,p)+'<small>'+nameLabel(n)+'</small></div>').join('')+'</div>'+action('use-style','使用此风格',data(v),'primary small'));return;}
 case 'use-style':case 'load-style':state.profile={...(a==='use-style'?preset(v):state.library[Number(v)]),version:0};state.locked=null;close();go('presets');break;
 case 'copy-style':state.library.push({...state.library[Number(v)],name:state.library[Number(v)].name+' 副本'});break;
 case 'style-json':download('style-profile.json',JSON.stringify(state.library[Number(v)],null,2),'application/json');return;
 case 'left':case 'right':{
  const side=a==='left'?'left':'right';if(side==='left')left=!left;else right=!right;
  const shown=side==='left'?left:right;
  $('.workspace').classList.toggle('hide-'+side,!shown);$('.'+side+'-panel').inert=!shown;b.setAttribute('aria-expanded',shown);return;
 }
 case 'view':view=v;break;
 case 'guides':guides=!guides;break;
 case 'corner':if(!state.locked)state.profile.corner=v;break;
 case 'lock':
  if(state.locked){state.profile={...state.locked,version:0};state.locked=null;notice('风格已解锁');}
  else {state.locked={...state.profile,version:++state.version,references:state.refs.map(r=>r.name),grid:24,safeInset:2,engine:demo(state.profile)?'sample':'svg-template'};notice('已锁定 V'+state.version);}
  break;
 case 'save-style':state.library.push({...profile()});notice('已保存风格基因卡');break;
 case 'open-icon':selected.clear();selected.add(v);right=true;go('presets');break;
 case 'select':
  if(!e.shiftKey&&!e.ctrlKey&&!e.metaKey){const same=selected.size===1&&selected.has(v);selected.clear();if(!same)selected.add(v);}
  else if(selected.has(v))selected.delete(v);else selected.add(v);
  right=true;break;
 case 'select-all':state.icons.forEach(i=>selected.add(i.id));break;
 case 'favorite-icon':if(i)i.favorite=!i.favorite;break;
 case 'remix':if(i&&!demo(iconProfile(i))){record(i);i.variant=(i.variant+1)%3;selected.clear();selected.add(v);right=true;}else notice('该材质仅展示样例');break;
 case 'variant':{const item=byId([...selected][0]);if(item&&!demo(iconProfile(item))){record(item);item.variant=Number(v);}else notice('该材质仅展示样例');break;}
 case 'duplicate':if(i)state.icons.splice(state.icons.indexOf(i)+1,0,{...i,id:crypto.randomUUID(),name:i.name+' 副本',history:[...i.history]});break;
 case 'delete':selected.delete(v);state.icons=state.icons.filter(x=>x.id!==v);break;
 case 'delete-selected':state.icons=state.icons.filter(x=>!selected.has(x.id));selected.clear();break;
 case 'style-switch':styleSwitch();return;
 case 'apply-switch':scope().forEach(i=>{record(i);i.profile=preset(v);});close();notice('风格已应用到选区');break;
 case 'compare':{const before=i.history.at(-1);dialog('前后对比','<div class="comparison"><div><small>修改前</small>'+glyph(before.semantic,before.profile,before.variant)+'</div><div><small>当前</small>'+glyph(i.semantic,iconProfile(i),i.variant)+'</div></div>');return;}
 case 'remove-ref':state.refs.splice(Number(v),1);break;
 case 'remove-token':command=tokens().filter(n=>n!==v).join('、');break;
 case 'generate':generate();return;
 case 'cancel':job=null;notice('生成已取消，已完成图标保留');break;
 case 'export':dialog('导出图标','<p>'+exportable().length+' 个可导出的原生 SVG</p><div class="row">'+action('export-svg','下载 SVG',exportable().length?'':'disabled','primary small')+action('export-json','风格基因 JSON','','secondary')+'</div>');return;
 case 'export-svg':exportable().forEach(saveSvg);close();notice('已发起 SVG 下载');return;
 case 'export-json':download('style-profile.json',JSON.stringify(profile(),null,2),'application/json');close();notice('已发起 JSON 下载');return;
 case 'close':close();return;
 default:return;
 }
 update();
});
document.addEventListener('input',e=>{
 const f=e.target.dataset.field,v=e.target.value;
 if(f==='command'){command=v;$('#tags').innerHTML=tags();}
 if(f==='search'){query=v;$('#gallery').innerHTML=styles.filter(item=>(!filter||item[0]===filter)&&item.slice(1,3).join(' ').toLowerCase().includes(v.toLowerCase())).map(card).join('')||'<p>没有匹配的风格。</p>';}
 if(['color','accent','tint','width','scale'].includes(f)&&!state.locked){
  state.profile[f]=e.target.type==='range'?Number(v):v;save();
  $('#dna').innerHTML=dna(profile());$('.canvas-body').innerHTML=view==='grid'?iconGrid():uiPreview();$('.right-panel').innerHTML=inspector();
 }
});
document.addEventListener('change',e=>{
 const el=e.target,{field:f}=el.dataset,v=el.value;
 if(el.id==='upload'){addFiles(el.files);return;}
 if(!f)return;
 switch(f){
 case 'preset':if(!state.locked)state.profile=preset(v);break;
 case 'project':state.project=v.trim()||'预设图标项目';break;
 case 'background':background=v;break;
 case 'scene':scene=v;break;
 case 'zoom':zoom=Number(v);break;
 case 'grid':grid=Number(v);break;
 case 'quantity':quantity=Number(v);break;
 case 'switch-target':styleSwitch(v);return;
 case 'icon-name':{const i=byId(el.dataset.value);i.name=v.trim()||i.semantic;break;}
 case 'semantic':{const i=byId([...selected][0]);record(i);i.semantic=v;break;}
 case 'prefix':if(v.trim())scope().forEach(i=>i.name=v.trim()+'-'+i.semantic.toLowerCase());break;
 case 'group':scope().forEach(i=>i.group=v.trim());break;
 default:return;
 }
 update();
});
document.addEventListener('keydown',e=>{
 if(e.target.id==='drop'&&['Enter',' '].includes(e.key)){e.preventDefault();$('#upload').click();}
 if(e.target.dataset.field==='command'&&e.key==='Enter'&&!e.isComposing&&!job){e.preventDefault();generate();}
});
document.addEventListener('dragstart',e=>{const cell=e.target.closest('[data-icon]');if(cell){dragged=cell.dataset.icon;e.dataTransfer.setData('text/plain',dragged);}});
document.addEventListener('dragover',e=>{const target=e.target.closest('#drop,[data-icon]');if(target){e.preventDefault();target.classList.add('drag-over');}});
document.addEventListener('dragleave',e=>e.target.closest('#drop,[data-icon]')?.classList.remove('drag-over'));
document.addEventListener('dragend',()=>{dragged='';document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));});
document.addEventListener('drop',e=>{
 const target=e.target.closest('#drop,[data-icon]');if(!target)return;
 e.preventDefault();target.classList.remove('drag-over');
 if(target.id==='drop'){addFiles(e.dataTransfer.files);return;}
 const from=state.icons.findIndex(i=>i.id===dragged), to=state.icons.findIndex(i=>i.id===target.dataset.icon);
 if(from>=0&&to>=0&&from!==to){const [item]=state.icons.splice(from,1);state.icons.splice(to,0,item);update();}
});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
render();


