// Finger performance (restored from v1.5 picture touch): finger 1/2 XY, pinch, twist,
// hold-still freeze, quick-tap stutter and spring-back, mapped per effect.
import {clamp,mappedValue,setMappedValue} from '../core.js';
export const TOUCH_KEYS=[['x','Finger 1 ↔'],['y','Finger 1 ↕'],['x2','Finger 2 ↔'],['y2','Finger 2 ↕'],['pinch','Pinch'],['twist','Twist']];
// points: [{x,y,px,py}] with y up (0 bottom). pair: {distance,angle,base:Map(id->{values,intensity})}
export function applyTouch(effect,points,pair){
 const m=effect.touch;if(!m||!points.length)return;
 setMappedValue(effect,m.x,points[0].x);setMappedValue(effect,m.y,points[0].y);
 if(points[1]&&pair){setMappedValue(effect,m.x2,points[1].x);setMappedValue(effect,m.y2,points[1].y);
  const [a,b]=points,base=pair.base.get(effect.id)||effect,ratio=Math.hypot(b.px-a.px,b.py-a.py)/Math.max(2,pair.distance);
  let angle=Math.atan2(a.py-b.py,b.px-a.px)-pair.angle;angle=Math.atan2(Math.sin(angle),Math.cos(angle));
  setMappedValue(effect,m.pinch,mappedValue(base,m.pinch)+Math.log(Math.max(.05,ratio))*.45);setMappedValue(effect,m.twist,mappedValue(base,m.twist)+angle/(Math.PI*2));
 }
}
export class FingerPerformer{
 constructor(canvas,overlay,{enabled,getEffects,onChange,onFreeze,onStutter,onRelease,status}){
  Object.assign(this,{canvas,overlay,enabled,getEffects,onChange,onFreeze,onStutter,onRelease,status});this.points=new Map();this.base=new Map();this.targets=null;this.pair=null;this.freeze=false;this.moved=false;
  canvas.addEventListener('pointerdown',e=>{if(this.enabled())this.down(e);});canvas.addEventListener('pointermove',e=>this.move(e));
  for(const t of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(t,e=>this.up(e,t!=='pointerup'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
 }
 point(e){const r=this.canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp(1-(e.clientY-r.top)/r.height),px:e.clientX,py:e.clientY};}
 snapshot(list){return new Map(list.map(f=>[f.id,{id:f.id,values:[...f.values],intensity:f.intensity,touch:f.touch}]));}
 down(e){e.preventDefault();if(this.points.size>=2)return;this.canvas.setPointerCapture?.(e.pointerId);const p=this.point(e);this.points.set(e.pointerId,{...p,sx:p.px,sy:p.py});
  if(this.points.size===1){this.targets=this.getEffects();this.base=this.snapshot(this.targets);this.start=performance.now();this.moved=false;clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.moved&&this.points.size===1){this.freeze=true;this.onFreeze(true);}this.draw();},480);}
  if(this.points.size===2){clearTimeout(this.timer);this.moved=true;const [a,b]=[...this.points.values()];this.pair={distance:Math.hypot(b.px-a.px,b.py-a.py),angle:Math.atan2(a.py-b.py,b.px-a.px),base:this.snapshot(this.targets||[])};}
  this.apply();
 }
 move(e){if(!this.points.has(e.pointerId))return;e.preventDefault();const old=this.points.get(e.pointerId),p={...old,...this.point(e)};this.points.set(e.pointerId,p);if(Math.hypot(p.px-old.sx,p.py-old.sy)>9){this.moved=true;clearTimeout(this.timer);}if(!this.freeze)this.apply();else this.draw();}
 apply(){const pts=[...this.points.values()];if(!pts.length)return;for(const f of this.targets||[])applyTouch(f,pts,this.pair);if(this.targets?.length)this.onChange();this.draw();}
 up(e,cancelled){if(!this.points.has(e.pointerId))return;this.points.delete(e.pointerId);clearTimeout(this.timer);
  if(this.freeze){this.freeze=false;this.onFreeze(false);}
  if(!this.points.size){if(!cancelled&&!this.moved&&performance.now()-this.start<250)this.onStutter();let sprung=false;for(const f of this.targets||[]){const b=this.base.get(f.id);if(f.touch?.spring&&b){f.values=[...b.values];f.intensity=b.intensity;sprung=true;}}if(sprung)this.onChange();this.onRelease(this.moved);this.targets=null;this.pair=null;this.base.clear();}
  else if(this.points.size===1)this.pair=null;
  this.draw();
 }
 cancel(){clearTimeout(this.timer);if(this.freeze){this.freeze=false;this.onFreeze(false);}this.points.clear();this.targets=null;this.pair=null;this.draw();}
 // Indicators are DOM siblings of the canvas, so they never enter recordings or PNGs.
 draw(){this.overlay.replaceChildren();let i=0;const r=this.canvas.getBoundingClientRect(),o=this.overlay.getBoundingClientRect();
  for(const p of this.points.values()){const d=document.createElement('div');d.className='touch-dot touch-'+i;d.style.left=(p.px-o.left)+'px';d.style.top=(p.py-o.top)+'px';d.append(document.createElement('span'));d.firstChild.textContent=String(i+1);this.overlay.append(d);i++;}
  this.status(this.freeze?'FREEZE · release to resume':this.points.size===2?'Finger 1 + 2 · pinch · twist':this.points.size?'Drag · add a 2nd finger · hold still = freeze':null);
  void r;}
}
