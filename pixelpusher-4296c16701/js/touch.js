import {clamp,EFFECTS,mappedValue,setMappedValue} from './core.js';
// DOM indicators are siblings of the canvas: never enter captureStream/toBlob.
export class PictureController{
 constructor(canvas,overlay,{getEffects,onChange,onFreeze,onStutter,status}){
  Object.assign(this,{canvas,overlay,getEffects,onChange,onFreeze,onStutter,status});this.points=new Map();this.base=new Map();this.startTime=0;this.freeze=false;this.moved=false;this.pair=null;
  for(const [name,fn] of [['pointerdown',e=>this.down(e)],['pointermove',e=>this.move(e)],['pointerup',e=>this.up(e)],['pointercancel',e=>this.up(e,true)],['lostpointercapture',e=>this.up(e,true)]])canvas.addEventListener(name,fn,{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('dragstart',e=>e.preventDefault());
  window.addEventListener('blur',()=>this.cancel());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
 }
 point(e){const r=this.canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp(1-(e.clientY-r.top)/r.height),px:e.clientX,py:e.clientY};}
 effects(){return this.targets||[];}
 down(e){e.preventDefault();if(this.points.size>=2)return;this.canvas.setPointerCapture(e.pointerId);const p=this.point(e);this.points.set(e.pointerId,{...p,startX:p.px,startY:p.py});
  if(this.points.size===1){this.targets=this.getEffects();this.base=new Map(this.targets.map(f=>[f.id,{values:[...f.values],intensity:f.intensity}]));this.startTime=performance.now();this.moved=false;this.timer=setTimeout(()=>{if(!this.moved&&this.points.size===1){this.freeze=true;this.onFreeze(true);this.status.textContent='FREEZE / release to resume';}},480);}
  if(this.points.size===2){clearTimeout(this.timer);this.moved=true;const [a,b]=[...this.points.values()];this.pair={distance:Math.hypot(b.px-a.px,b.py-a.py),angle:Math.atan2(a.py-b.py,b.px-a.px),base:new Map(this.effects().map(f=>[f.id,{values:[...f.values],intensity:f.intensity}]))};}
  this.apply();
 }
 move(e){if(!this.points.has(e.pointerId))return;e.preventDefault();const old=this.points.get(e.pointerId),p={...old,...this.point(e)};this.points.set(e.pointerId,p);if(Math.hypot(p.px-old.startX,p.py-old.startY)>9){this.moved=true;clearTimeout(this.timer);}if(!this.freeze)this.apply();else this.draw();}
 apply(){const points=[...this.points.values()];if(!points.length)return;
  for(const effect of this.effects()){
   const m=effect.touch;setMappedValue(effect,m.x,points[0].x);setMappedValue(effect,m.y,points[0].y);
   if(points[1]){setMappedValue(effect,m.x2,points[1].x);setMappedValue(effect,m.y2,points[1].y);
    const [a,b]=points,pair=this.pair,base=pair.base.get(effect.id);const ratio=Math.hypot(b.px-a.px,b.py-a.py)/Math.max(2,pair.distance);
    let angle=Math.atan2(a.py-b.py,b.px-a.px)-pair.angle;angle=Math.atan2(Math.sin(angle),Math.cos(angle));
    // Pinch/twist intentionally take precedence if mapped to an XY destination too.
    setMappedValue(effect,m.pinch,mappedValue(base,m.pinch)+Math.log(Math.max(.05,ratio))*.45);setMappedValue(effect,m.twist,mappedValue(base,m.twist)+angle/(Math.PI*2));
   }
  }
  if(this.effects().length)this.onChange();this.draw();
 }
 draw(){this.overlay.replaceChildren();const first=this.effects()[0],def=first?.params?{params:first.params}:EFFECTS.find(e=>e.id===first?.id);let i=0;for(const p of this.points.values()){
  const dot=document.createElement('div');dot.className='touch-dot touch-'+i;dot.style.left=p.x*100+'%';dot.style.top=(1-p.y)*100+'%';const label=document.createElement('span');const m=first?.touch;label.style.left=p.x>.5?'-150px':'0px';const name=k=>m[k]===-1?(first.kind==='group'?'Influence':'Intensity'):m[k]===-2?'—':def.params[m[k]].name;label.textContent=first?`${i+1} / ${name(i?'x2':'x')} · ${name(i?'y2':'y')}`:String(i+1);dot.append(label);this.overlay.append(dot);i++;
 }if(!this.freeze)this.status.textContent=this.points.size===2?'XY 1 + XY 2 / PINCH + TWIST':this.points.size?'XY / hold still to freeze':'';
 }
 up(e,cancelled=false){if(!this.points.has(e.pointerId))return;e.preventDefault();this.points.delete(e.pointerId);clearTimeout(this.timer);
  if(this.freeze){this.freeze=false;this.onFreeze(false);}
  if(!this.points.size){if(!cancelled&&!this.moved&&performance.now()-this.startTime<250)this.onStutter();this.restore();this.targets=null;this.pair=null;}
  this.draw();
 }
 restore(){if(!this.base.size)return;for(const f of this.effects())if(f.touch.spring&&this.base.has(f.id)){const base=this.base.get(f.id);f.values=[...base.values];f.intensity=base.intensity;}this.onChange();this.base.clear();}
 cancel(){clearTimeout(this.timer);this.onFreeze(false);this.freeze=false;this.restore();this.points.clear();this.targets=null;this.pair=null;this.draw();}
}
// XY pad is also keyboard-operable; its visible axes use the same mapping as finger 1.
export function bindXY(pad,effect,onChange){
 const draw=(x,y)=>{pad.style.setProperty('--pad-x',(clamp(x)*100)+'%');pad.style.setProperty('--pad-y',((1-clamp(y))*100)+'%');};draw(mappedValue(effect,effect.touch.x),mappedValue(effect,effect.touch.y));
 const update=(x,y)=>{draw(x,y);setMappedValue(effect,effect.touch.x,x);setMappedValue(effect,effect.touch.y,y);pad.textContent=`X ${Math.round(clamp(x)*100)} / Y ${Math.round(clamp(y)*100)}`;pad.setAttribute('aria-valuetext',pad.textContent);onChange();};let base=null;
 pad.addEventListener('pointerdown',e=>{e.preventDefault();base={values:[...effect.values],intensity:effect.intensity};pad.setPointerCapture(e.pointerId);const r=pad.getBoundingClientRect();update((e.clientX-r.left)/r.width,1-(e.clientY-r.top)/r.height);});
 pad.addEventListener('pointermove',e=>{if(!pad.hasPointerCapture(e.pointerId))return;e.preventDefault();const r=pad.getBoundingClientRect();update((e.clientX-r.left)/r.width,1-(e.clientY-r.top)/r.height);});
 const release=()=>{if(base&&effect.touch.spring){effect.values=base.values;effect.intensity=base.intensity;draw(mappedValue(effect,effect.touch.x),mappedValue(effect,effect.touch.y));onChange();}base=null;};pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);pad.addEventListener('lostpointercapture',release);
 pad.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();update(mappedValue(effect,effect.touch.x)+(e.key==='ArrowLeft'?-.025:e.key==='ArrowRight'?.025:0),mappedValue(effect,effect.touch.y)+(e.key==='ArrowDown'?-.025:e.key==='ArrowUp'?.025:0));});
}
