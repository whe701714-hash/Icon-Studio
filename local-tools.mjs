export async function bitmap(url, max=1536){
 const image=new Image();
 image.src=url;await image.decode();
 const ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 return canvas;
}
function pixels(canvas){return canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);}
function bounds(data,box=[0,0,data.width,data.height]){
 const [x,y,w,h]=box;
 let l=x+w,r=x-1,t=y+h,b=y-1,cx=0,cy=0,weight=0,count=0;
 for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++){
  const a=data.data[(j*data.width+i)*4+3];
  if(a<24)continue;
  l=Math.min(l,i);r=Math.max(r,i);t=Math.min(t,j);b=Math.max(b,j);cx+=i*a;cy+=j*a;weight+=a;count++;
 }
 return count?{box:[l,t,r-l+1,b-t+1],cx:cx/weight,cy:cy/weight,count}:null;
}
const round=value=>Math.round(value*100);
function svgFacts(ref){
 if(ref.facts.type!=='image/svg+xml')return null;
 const doc=new DOMParser().parseFromString(new TextDecoder().decode(Uint8Array.from(atob(ref.url.split(',')[1]),c=>c.charCodeAt(0))),'image/svg+xml');
 const svg=doc.documentElement;
 if(svg.localName!=='svg')return null;
 const collect=key=>[...new Set([...svg.querySelectorAll('['+key+']'),svg].map(node=>node.getAttribute(key)).filter(Boolean))].slice(0,12);
 return {viewBox:svg.getAttribute('viewBox'),paths:svg.querySelectorAll('path[d]').length,fill:collect('fill'),stroke:collect('stroke'),strokeWidth:collect('stroke-width'),lineCap:collect('stroke-linecap'),lineJoin:collect('stroke-linejoin')};
}
export async function analyzeLocal(references){
 const colors=new Map(), measurements=[];
 for(const ref of references){
  const canvas=await bitmap(ref.url,192), data=pixels(canvas), subject=bounds(data);
  let clear=0;
  for(let i=0;i<data.data.length;i+=4){
   const [r,g,b,a]=data.data.subarray(i,i+4);
   if(a<24){clear++;continue;}
   if(a<96)continue;
   const key=[r,g,b].map(v=>v>>5).join(',');
   const total=colors.get(key)||[0,0,0,0];
   total[0]+=r*a;total[1]+=g*a;total[2]+=b*a;total[3]+=a;colors.set(key,total);
  }
  const [x,y,w,h]=subject?.box||[0,0,0,0];
  measurements.push({name:ref.name,width:ref.facts.width,height:ref.facts.height,transparent:round(clear/(data.width*data.height)),coverage:subject?round(subject.count/(data.width*data.height)):0,span:subject?round(Math.max(w/data.width,h/data.height)):0,margin:subject&&[round(y/data.height),round((data.width-x-w)/data.width),round((data.height-y-h)/data.height),round(x/data.width)],svg:svgFacts(ref)});
 }
 const palette=[...colors.values()].sort((a,b)=>b[3]-a[3]).slice(0,7).map(total=>'#'+total.slice(0,3).map(value=>Math.round(value/total[3]).toString(16).padStart(2,'0')).join(''));
 const spans=measurements.filter(item=>item.transparent>0&&item.span>0).map(item=>item.span);
 return {palette,measurements,inferred:{},confirmed:{name:'原创风格',color:palette.join('、'),composition:spans.length?'参考长边占比约 '+Math.round(spans.reduce((a,b)=>a+b,0)/spans.length)+'%':''},source:'local'};
}
function clearBackground(data,tolerance,feather){
 const {width:w,height:h,data:rgba}=data;
 const corners=[0,w-1,w*(h-1),w*h-1].filter(i=>rgba[i*4+3]>230);
 if(corners.length<3)return;
 const base=[0,1,2].map(c=>corners.map(i=>rgba[i*4+c]).sort((a,b)=>a-b)[Math.floor(corners.length/2)]);
 const distance=i=>Math.hypot(...base.map((value,c)=>rgba[i*4+c]-value));
 const queue=new Int32Array(w*h),seen=new Uint8Array(w*h);
 let head=0,tail=0;
 function seed(i){
  if(seen[i])return;
  seen[i]=1;
  const offset=i*4+3,d=distance(i);
  if(rgba[offset]<24||d<=tolerance){rgba[offset]=0;queue[tail++]=i;}
  else if(feather&&d<tolerance+22)rgba[offset]=Math.round(rgba[offset]*(d-tolerance)/22);
 }
 for(let x=0;x<w;x++){seed(x);seed(w*(h-1)+x);}
 for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
 while(head<tail){const i=queue[head++];if(i%w)seed(i-1);if(i%w<w-1)seed(i+1);if(i>=w)seed(i-w);if(i<w*(h-1))seed(i+w);}
}
function bands(length,filled){
 const result=[];
 for(let i=0;i<length;){if(!filled(i)){i++;continue;}const start=i++;while(i<length&&filled(i))i++;result.push([start,i-start]);}
 return result;
}
function alphaCells(data){
 const {width:w,height:h}=data;
 const rows=new Uint8Array(h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data.data[(y*w+x)*4+3]>35)rows[y]=1;
 return bands(h,y=>rows[y]).flatMap(([y,height])=>{
  const cols=new Uint8Array(w);
  for(let j=y;j<y+height;j++)for(let x=0;x<w;x++)if(data.data[(j*w+x)*4+3]>35)cols[x]=1;
  return bands(w,x=>cols[x]).map(([x,width])=>[x,y,width,height]);
 }).filter(([, ,width,height])=>width>=3&&height>=3).slice(0,64);
}
export async function prepareImport(ref,settings){
 const source=await bitmap(ref.url), context=source.getContext('2d'), data=pixels(source);
 if(settings.remove){clearBackground(data,settings.tolerance,settings.feather);context.putImageData(data,0,0);}
 const {width:w,height:h}=source;
 let boxes=[[0,0,w,h]];
 if(settings.mode==='alpha')boxes=alphaCells(data);
 if(settings.mode==='grid')boxes=Array.from({length:settings.rows*settings.cols},(_,index)=>{
  const col=index%settings.cols,row=Math.floor(index/settings.cols),x=Math.round(col*w/settings.cols),y=Math.round(row*h/settings.rows);
  return [x,y,Math.round((col+1)*w/settings.cols)-x,Math.round((row+1)*h/settings.rows)-y];
 });
 return {source,data,boxes};
}
export function normalize({source,data},box,size,ratio,center){
 const stats=bounds(data,box);
 if(!stats)return null;
 const [x,y,w,h]=stats.box;
 const scale=size*ratio/Math.max(w,h), width=w*scale,height=h*scale;
 const left=center?Math.max(0,Math.min(size-width,size/2-(stats.cx-x+.5)*scale)):(size-width)/2;
 const top=center?Math.max(0,Math.min(size-height,size/2-(stats.cy-y+.5)*scale)):(size-height)/2;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 canvas.getContext('2d').drawImage(source,x,y,w,h,left,top,width,height);
 return canvas.toDataURL('image/png');
}
const translated={首页:'Home',搜索:'Search',收藏:'Favorites',消息:'Messages',设置:'Settings',购物车:'Shopping cart',相机:'Camera',日历:'Calendar',定位:'Location',耳机:'Headphones',文件夹:'Folder',通知:'Notifications',宠物喂养:'Pet feeding',睡眠监测:'Sleep tracking',城市骑行:'Urban cycling',空气净化:'Air purification',植物养护:'Plant care',个人中心:'Profile'};
export function prompts(profile,semantics,kind,edit){
 const p=profile.confirmed;
 const fields=[['color','色彩','Color'],['shape','造型','Shape language'],['line','线条','Stroke'],['composition','构图与比例','Composition and proportions'],['material','材质光影','Material and lighting'],['distinct','独特特征','Distinctive features'],['keep','必须保留','Preserve'],['flex','允许变化','Allowed variation'],['prompt','补充提示','Additional guidance']];
 const specs=lang=>fields.filter(([key])=>p[key]).map(([key,zh,en])=>(lang==='zh'?zh+'：':en+': ')+p[key]).join('\n');
 const tasks={single:['生成一个图标','Generate one icon'],batch:['按语义顺序生成一套图标。每个语义单独输出，或使用等大网格且留出透明间隔','Generate an ordered icon set. Output individual files or an evenly spaced grid with transparent gutters'],consistency:['检查并修正图标与参考图的一致性，说明具体偏差','Check and correct deviations from the reference style, describing concrete differences'],edit:['局部修改目标图标，锁定其余视觉特征','Edit only the target icon and preserve the remaining visual attributes']};
 const task=tasks[kind];
 const targets=kind==='single'?semantics.slice(0,1):semantics;
 return [
  ['请以随附的原创参考图作为主要视觉依据。',task[0]+'。','目标语义：'+(targets.join('、')||'按随附图标'),specs('zh'),kind==='edit'?'局部修改：'+edit:'','输出：方形画布、主体清晰、留白统一，优先透明 PNG。','避免：文字、水印、装饰性画框、参考图未出现的材质或颜色。'+(p.avoid?' '+p.avoid:'')].filter(Boolean).join('\n'),
  ['Use the attached original artwork as the primary visual reference.',task[1]+'.','Target concepts: '+(targets.map(item=>translated[item]||item).join(', ')||'as shown in the attached icon'),specs('en'),kind==='edit'?'Local changes: '+edit:'','Output a square image with a clearly legible subject and consistent padding, preferably as a transparent PNG.','Avoid text, watermarks, decorative frames, and materials or colors absent from the references.'+(p.avoid?' '+p.avoid:'')].filter(Boolean).join('\n')
 ];
}
