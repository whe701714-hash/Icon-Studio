export const shapes = {
 Home:'M4 11 12 4l8 7v9H14v-5h-4v5H4Z',
 Search:'M17 11a6 6 0 1 1-12 0 6 6 0 1 1 12 0ZM15.5 15.5 21 21',
 Favorite:'M12 20 5 13C-1 6 8 2 12 8c4-6 13-2 7 5Z',
 Message:'M5 5h14q2 0 2 2v8q0 2-2 2h-7l-5 4v-4H5q-2 0-2-2V7q0-2 2-2Z',
 Profile:'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 20q0-6 8-6t8 6Z',
 Settings:'M10 3h4l1 3 3 1 3 3-2 2 1 3-2 3-3-1-2 4h-3l-1-3-3-1-3-3 2-2-1-3 2-3 3 1Z M14 12a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z',
 Cart:'M2 4h3l3 11h10l3-8H6M10 20h.1M17 20h.1',
 Camera:'M4 7h4l2-3h4l2 3h4v13H4ZM15 13a3 3 0 1 0-6 0 3 3 0 1 0 6 0Z',
 Calendar:'M4 6h16v15H4ZM4 11h16M8 3v5M16 3v5',
 Location:'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0ZM14 10a2 2 0 1 0-4 0 2 2 0 1 0 4 0Z',
 Folder:'M3 6h7l2 3h9v11H3Z',
 Notification:'M5 17h14l-2-4v-3a5 5 0 1 0-10 0v3ZM10 21h4'
};
const alternates = {
 Home:'M3 11 12 3l9 8M6 10v11h12V10M10 21v-6h4v6',
 Search:'M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0ZM14 14l6 6',
 Favorite:'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
 Message:'M21 11c0 5-4 8-9 8H8l-4 2 1-5a8 8 0 0 1-2-5c0-4 4-7 9-7s9 3 9 7Z',
 Profile:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0ZM15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM6 18q1-5 6-5t6 5'
};
export const styles = [
 ['round','线性','Soft Outline','#254aff','#b8c8ff','#e8edff'],
 ['flat','扁平','Solid Forms','#ff623f','#ffd5c6','#fff0e9'],
 ['pop','撞色','Color Clash','#2026ef','#ecff59','#eff6b9'],
 ['duo','双色','Soft Duotone','#794ccd','#d7befb','#f1e8fc'],
 ['gradient','渐变','Sunset Gradient','#ef435f','#ffae4b','#ffe8da'],
 ['clay','3D','Clay Objects','#ed7545','#ffc4a7','#fbe5d7'],
 ['glass','玻璃','Tinted Glass','#14888a','#a1e9db','#def8f1'],
 ['sketch','手绘','Ink Lines','#242629','#ffc0a9','#f5e9dc'],
 ['pixel','像素','Pixel Grid','#153f29','#a4e990','#e2f4d6']
];
export const preset = key => {
 const [id,label,name,color,accent,tint] = styles.find(style => style[0]===key) || styles[0];
 return {id,label,name,color,accent,tint,width:2,corner:'round',scale:1,material:'soft',version:0};
};
export const demo = p => ['clay','glass','sketch'].includes(p.id);
let sequence = 0;
export function svg(name,p,variant=0){
 const id='ink'+sequence++;
 const order=Object.keys(shapes);
 const index=order.indexOf(name);
 const kind=Math.abs(variant)%3;
 const path=(kind!==0&&alternates[name])||shapes[name]||shapes.Folder;
 const linear=p.id==='round'||p.id==='sketch';
 const fill=!linear&& !['Search','Cart'].includes(name) ? (p.id==='duo'?p.accent:['gradient','clay','glass'].includes(p.id)?'url(#'+id+')':p.color):'none';
 const stroke=linear||fill==='none'||p.id==='duo'||p.id==='pop'?p.color:fill;
 const joint=p.corner==='round'&&p.id!=='pixel'?'round':'miter';
 const transform='translate(12 12) scale('+p.scale+' '+(kind===2?p.scale*.88:p.scale)+') translate(-12 -12)';
 const back=p.id==='pop'?'<rect x="2" y="2" width="20" height="20" rx="5" fill="'+p.accent+'"/>' : '';
 const dot=p.id==='pop'&&index%2===0?'<circle cx="19" cy="6" r="2.4" fill="#ff6445"/>':'';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="'+id+'" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="'+p.accent+'"/><stop offset="1" stop-color="'+p.color+'"/></linearGradient></defs>'+back+'<g transform="'+transform+'"><path d="'+path+'" fill="'+fill+'" fill-rule="evenodd" stroke="'+stroke+'" stroke-width="'+(linear||fill==='none'?p.width:p.id==='duo'?1.2:.55)+'" stroke-linecap="'+(joint==='round'?'round':'square')+'" stroke-linejoin="'+joint+'"/>'+dot+'</g></svg>';
}
