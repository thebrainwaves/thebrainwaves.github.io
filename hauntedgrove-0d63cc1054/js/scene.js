/* All geometry and characters are original procedural drawings, generated locally. */
import {blendLooks,LOOKS,clamp} from './core.js';
const TAU=Math.PI*2;
export function seeded(seed=43){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const css=(c,a=1)=>`rgba(${c.map(Math.round).join(',')},${clamp(a)})`;
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU);c.fillStyle=color;c.fill();}
function line(c,x,y,x2,y2,color,width=1){c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function glow(c,x,y,r,color,alpha=.3){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,css(color,alpha));g.addColorStop(.35,css(color,alpha*.38));g.addColorStop(1,css(color,0));c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
function tree(rnd,x,y,height,width,layer){
 const branches=[];const lean=(rnd()-.5)*170;const path=new Path2D();
 path.moveTo(x-width*1.7,y+16);path.bezierCurveTo(x-width*.6,y-height*.2,x-width*.35+lean*.2,y-height*.65,x+lean-width*.18,y-height);path.quadraticCurveTo(x+lean,y-height-14,x+lean+width*.2,y-height);path.bezierCurveTo(x+width*.7+lean*.2,y-height*.5,x+width*.3,y-height*.15,x+width*2,y+12);path.quadraticCurveTo(x+width*.8,y+5,x,y-4);path.closePath();
 function branch(bx,by,len,angle,w,depth){if(depth===0||len<12)return;const ex=bx+Math.cos(angle)*len,ey=by+Math.sin(angle)*len;const curve=(rnd()-.5)*len*.6;branches.push({bx,by,ex,ey,cx:(bx+ex)/2+curve,cy:(by+ey)/2,w});branch(ex,ey,len*(.58+rnd()*.12),angle+(rnd()-.5)*.8,w*.57,depth-1);if(depth>1)branch(ex,ey,len*.48,angle+(rnd()>.5?.8:-.8),w*.45,depth-1);}
 for(let i=0;i<5;i++){const h=.3+i*.13;const bx=x+lean*h*.5,by=y-height*h;branch(bx,by,height*(.18+rnd()*.11),(i%2?-.7:-2.4)+(rnd()-.5)*.5,width*(1-h)*.45,3);}
 return {path,branches,x,y,height,width,lean,layer,phase:rnd()*TAU};
}
export class GroveScene{
 constructor(canvas){
  this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
  if(!this.ctx)throw new Error('Canvas 2D is not available.');
  this.history=document.createElement('canvas');this.historyCtx=this.history.getContext('2d',{alpha:false});
  this.mirrorBuffer=document.createElement('canvas');this.mirrorCtx=this.mirrorBuffer.getContext('2d',{alpha:false});
  this.events=[];this.summons=[];this.lastFlash=-10;this.quality=1;this.fps=60;this.frames=0;this.measureTime=0;this.last=0;this.historyReady=false;
  const rnd=seeded();this.trees=[];this.stars=[];this.spore=[];this.grass=[];this.rocks=[];
  for(let layer=0;layer<4;layer++)for(let i=0;i<(layer===3?6:17);i++){
   const count=layer===3?6:17;let x=layer===3?[-90,60,200,1450,1570,1710][i]:i/(count-1)*1800-100+(rnd()-.5)*100;
   if(layer===2&&x>450&&x<1160)x+=x<800?-330:360;
   if(layer===1&&x>730&&x<1030)x+=x<880?-190:190;
   const h=layer===0?420+rnd()*200:layer===1?500+rnd()*180:layer===2?650+rnd()*220:1080+rnd()*160;
   this.trees.push(tree(rnd,x,layer===0?610:layer===1?690:layer===2?825:1020,h,(layer+1)*(11+rnd()*10),layer));
  }
  for(let i=0;i<150;i++)this.stars.push({x:rnd()*1600,y:rnd()*650,r:rnd()*1.3+.3,p:rnd()*TAU});
  for(let i=0;i<150;i++)this.spore.push({x:rnd()*1600,y:250+rnd()*700,r:1+rnd()*2.4,p:rnd()*TAU,s:.25+rnd()});
  for(let i=0;i<120;i++)this.grass.push({x:rnd()*1600,y:820+rnd()*230,h:10+rnd()*65,p:rnd()*TAU});
  for(let i=0;i<18;i++)this.rocks.push({x:rnd()*1600,y:800+rnd()*200,r:12+rnd()*30,p:rnd()*TAU});
 }
 resize(width,height,quality=1){
  const cap=quality===.6?1000:1920;const scale=Math.min(quality*(devicePixelRatio||1),1.4,cap/Math.max(width,height));
  const w=Math.max(16,Math.round(width*scale)),h=Math.max(16,Math.round(height*scale));
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.history.width=w;this.history.height=h;this.mirrorBuffer.width=w;this.mirrorBuffer.height=h;this.historyReady=false;}
 }
 trigger(kind,time,x=.5,y=.75,monster='mossling'){
  if(kind==='lightning'&&time-this.lastFlash<1.2)return false;
  if(kind==='lightning')this.lastFlash=time;
  this.events.push({kind,time});if(this.events.length>20)this.events.shift();
  if(kind==='summon'){this.summons.push({time,x:clamp(x)*1600,y:clamp(y,.4,.96)*1000,monster,seed:this.summons.length});if(this.summons.length>12)this.summons.shift();}
  return true;
 }
 event(kind,t,duration){let amount=0;for(const e of this.events){const dt=t-e.time;if(e.kind===kind&&dt>=0&&dt<duration)amount=Math.max(amount,1-dt/duration);}return amount;}
 drawTree(c,tr,p,t,v,wire,alpha=1){
  c.save();c.globalAlpha=alpha;const s=Math.sin(t*.5+tr.phase)*v.sway*(tr.layer===3?2:5);c.translate(s,0);
  const col=tr.layer===0?p.far:tr.layer===1?mix(p.far,p.mid,.7):tr.layer===2?p.mid:p.near;
  c.fillStyle=css(col,1-wire*.9);c.strokeStyle=css(mix(mix(col,p.accent,.15),p.glow,wire),.3+wire*.3);c.lineWidth=.8+wire*.4;c.fill(tr.path);c.stroke(tr.path);
  c.lineCap='round';for(const b of tr.branches){c.beginPath();c.moveTo(b.bx,b.by);c.quadraticCurveTo(b.cx,b.cy,b.ex+s,b.ey);c.strokeStyle=css(mix(col,p.glow,wire),1-wire*.4);c.lineWidth=b.w*(1-wire)+1.2*wire;c.stroke();}
  if(tr.layer>1){
   // Narrow bark ridges and long root fingers, never external textures.
   for(let k=0;k<4;k++){const ox=(k-1.5)*tr.width*.22;c.beginPath();c.moveTo(tr.x+ox,tr.y-10);c.bezierCurveTo(tr.x+ox+15,tr.y-tr.height*.2,tr.x+ox-9+tr.lean*.3,tr.y-tr.height*.45,tr.x+ox+tr.lean*.65,tr.y-tr.height*.78);c.strokeStyle=css(mix(col,p.accent,.28),.34);c.lineWidth=1.3;c.stroke();}
   for(let k=-2;k<=2;k++){c.beginPath();c.moveTo(tr.x,tr.y-12);c.bezierCurveTo(tr.x+k*20,tr.y+8,tr.x+k*45,tr.y-2,tr.x+k*65,tr.y+15);c.strokeStyle=css(col);c.lineWidth=tr.width*.16;c.stroke();}
  }
  c.restore();
 }
 eyes(c,x,y,s,p,t,v,a=1,pair=true){
  const open=this.event('eyes',t,1.8)>.1?1:Math.pow(Math.max(0,Math.sin(t*(.63+v.chaos*.3)+x)),60)>.62?.08:1;
  const gazeX=(v.panX-.5)*s*.23,gazeY=(v.panY-.5)*s*.18;
  const count=pair?2:1;for(let i=0;i<count;i++){
   const ex=x+(pair?(i-.5)*s*1.34:0);glow(c,ex,y,s*2,p.glow,.19*v.glow*a);
   ellipse(c,ex,y,s*.59,s*(.7+v.cute*.2)*open,css(mix(p.glow,[155,173,181],.45),a));
   if(open>.2){ellipse(c,ex+gazeX,y+gazeY,s*.31,s*.5,css(p.sky));ellipse(c,ex+gazeX-s*.1,y+gazeY-s*.21,s*.11,s*.15,css(p.moon,.8));}
  }
 }
 mossling(c,x,y,s,p,t,v){
  c.save();c.translate(x,y+Math.sin(t*2)*5);c.rotate(Math.sin(t*1.6)*.035*(1+v.chaos));c.scale(s*this.aspect,s);
  glow(c,0,-45,150,p.glow,.12*v.glow);
  ellipse(c,0,12,80,15,css(p.sky,.7));
  // Leaf antennae / ears.
  for(const side of [-1,1]){c.save();c.translate(side*42,-117);c.rotate(side*(.4+Math.sin(t+side)*.1));c.beginPath();c.moveTo(0,30);c.bezierCurveTo(-22,-15,side*20,-38,7,-60);c.bezierCurveTo(34,-22,30,14,0,30);c.fillStyle=css(mix(p.moss,p.glow,.22));c.fill();line(c,1,18,7,-43,css(p.glow,.28),1);c.restore();}
  const g=c.createLinearGradient(-65,-135,60,10);g.addColorStop(0,css(mix(p.moss,p.glow,.32)));g.addColorStop(.5,css(p.moss));g.addColorStop(1,css(mix(p.moss,p.near,.7)));
  c.beginPath();c.moveTo(-79,-4);c.bezierCurveTo(-102,-48,-75,-125,-31,-135);c.bezierCurveTo(9,-158,77,-128,84,-70);c.bezierCurveTo(114,-15,61,27,36,9);c.quadraticCurveTo(7,32,-14,14);c.quadraticCurveTo(-51,37,-79,-4);c.fillStyle=g;c.fill();c.strokeStyle=css(p.glow,.24);c.lineWidth=1.5;c.stroke();
  for(let i=0;i<34;i++){const a=i*2.399,r=24+(i%5)*9;ellipse(c,Math.cos(a)*r,Math.sin(a)*r-60,2+(i%3),1.7,css(mix(p.moss,p.glow,.6),.22));}
  this.eyes(c,0,-77,24+v.cute*8,p,t,v);c.beginPath();c.moveTo(-12,-33);c.quadraticCurveTo(0,-20-v.cute*7,12,-33);c.strokeStyle=css(p.near);c.lineWidth=3;c.stroke();
  if(v.creep>.5){c.beginPath();c.moveTo(-5,-31);c.lineTo(-2,-23);c.lineTo(2,-31);c.fillStyle=css(p.moon,.5);c.fill();}
  ellipse(c,-52,-46,9,4,css(p.accent,.28));ellipse(c,52,-46,9,4,css(p.accent,.28));
  for(const side of [-1,1]){c.beginPath();c.moveTo(side*73,-56);c.quadraticCurveTo(side*112,-60+Math.sin(t*2+side)*12,side*105,-25);c.strokeStyle=css(p.moss);c.lineWidth=14;c.lineCap='round';c.stroke();}
  c.restore();
 }
 lantern(c,x,y,s,p,t,v){
  c.save();c.translate(x,y);c.scale(s*this.aspect,s);const wob=Math.sin(t*1.2)*9*(1+v.chaos);ellipse(c,0,5,44,10,css(p.sky,.65));
  c.lineCap='round';c.strokeStyle=css(mix(p.near,p.moss,.75));
  for(const side of [-1,1]){c.beginPath();c.moveTo(side*14,-85);c.quadraticCurveTo(side*23+wob,-42,side*21+Math.sin(t*2+side)*9,0);c.lineWidth=8;c.stroke();}
  c.beginPath();c.moveTo(-27,-123);c.quadraticCurveTo(-21,-67,0,-64);c.quadraticCurveTo(29,-73,23,-125);c.closePath();c.fillStyle=css(p.mid);c.fill();
  for(const side of [-1,1]){c.beginPath();c.moveTo(side*22,-116);c.quadraticCurveTo(side*54,-87,side*51+wob,-142);c.lineWidth=6;c.stroke();}
  c.translate(wob*.4,-160);c.rotate(wob*.006);glow(c,0,0,125,p.glow,.22*v.glow);glow(c,0,0,45,p.accent,.2);
  const g=c.createLinearGradient(-30,-34,35,37);g.addColorStop(0,css(mix(p.glow,p.accent,.5)));g.addColorStop(.5,css(p.glow,.87));g.addColorStop(1,css(p.accent));
  c.beginPath();c.moveTo(-25,-38);c.quadraticCurveTo(0,-52,28,-35);c.lineTo(35,26);c.quadraticCurveTo(0,50,-34,24);c.closePath();c.fillStyle=g;c.fill();c.strokeStyle=css(p.near);c.lineWidth=5;c.stroke();
  for(const x1 of [-19,19])line(c,x1,-32,x1*1.2,29,css(p.near,.55),3);
  c.beginPath();c.moveTo(-35,-35);c.lineTo(0,-59);c.lineTo(36,-34);c.closePath();c.fillStyle=css(p.near);c.fill();
  this.eyes(c,0,-1,12+v.cute*3,p,t,v);line(c,-5,20,6,19,css(p.near),2);c.restore();
 }
 mushroom(c,x,y,s,p,t,v){
  c.save();c.translate(x,y+Math.sin(t*2.1+x)*4);c.rotate(Math.sin(t*1.7+x)*.08);c.scale(s*this.aspect,s);ellipse(c,0,4,32,8,css(p.sky,.65));
  const stem=c.createLinearGradient(-15,-70,24,4);stem.addColorStop(0,css(mix(p.moon,p.mid,.55)));stem.addColorStop(1,css(p.mid));
  c.beginPath();c.moveTo(-18,-48);c.quadraticCurveTo(-20,-5,-13,0);c.quadraticCurveTo(1,9,17,0);c.quadraticCurveTo(12,-27,19,-50);c.fillStyle=stem;c.fill();
  c.beginPath();c.moveTo(-48,-45);c.bezierCurveTo(-42,-104,34,-111,49,-46);c.quadraticCurveTo(1,-28,-48,-45);const g=c.createLinearGradient(0,-100,0,-35);g.addColorStop(0,css(mix(p.cap,p.accent,.5)));g.addColorStop(1,css(p.cap));c.fillStyle=g;c.fill();c.strokeStyle=css(p.glow,.28);c.lineWidth=1.3;c.stroke();
  ellipse(c,0,-46,44,8,css(p.near,.45));for(let i=0;i<6;i++)ellipse(c,Math.sin(i*5)*30,-61-(i%3)*10,4+(i%2)*3,2.5,css(p.glow,.45));
  this.eyes(c,0,-24,6+v.cute*2,p,t,v);c.beginPath();c.arc(0,-10,4,0,Math.PI);c.strokeStyle=css(p.near);c.lineWidth=1.5;c.stroke();c.restore();
 }
 shadow(c,x,y,s,p,t,v){
  c.save();c.translate(x,y);c.scale(s*this.aspect,s);const breath=Math.sin(t*.8)*7;glow(c,0,-120,120,p.accent,.1);
  c.beginPath();c.moveTo(-47,5);c.bezierCurveTo(-62,-90,-29,-172,-35,-215);c.bezierCurveTo(-70,-250,-13,-290,15,-259);c.bezierCurveTo(44,-242,22,-208,26,-186);c.bezierCurveTo(71,-135,38,-50,54,7);c.quadraticCurveTo(5,-25,-47,5);c.fillStyle=css(p.near,.94);c.fill();
  for(const side of [-1,1]){c.beginPath();c.moveTo(side*22,-171);c.quadraticCurveTo(side*80+breath,-95,side*61,-52);c.strokeStyle=css(p.near);c.lineWidth=12;c.lineCap='round';c.stroke();}
  this.eyes(c,-4,-232,9+v.cute*4,p,t,v,.8);c.restore();
 }
 creature(c,kind,x,y,scale,p,t,v){const fn={mossling:this.mossling,lantern:this.lantern,mushroom:this.mushroom,shadow:this.shadow};if(kind==='eyes')this.eyes(c,x,y,18*scale,p,t,v);else (fn[kind]||this.mossling).call(this,c,x,y,scale,p,t,v);}
 render(state,v,time,audio={}){
  const c=this.ctx,w=this.canvas.width,h=this.canvas.height;const compact=w/h<1.3;this.aspect=1.6*h/w;
  const quiet=state.flags.quiet;const t=quiet?time*.08:time;const life=t*(.35+v.speed*1.9);
  const p=blendLooks(state.lookA,state.lookB,v.morph);const a=LOOKS.find(l=>l.id===state.lookA)||LOOKS[0],b=LOOKS.find(l=>l.id===state.lookB)||a;
  const styleWeight=style=>(a.style===style?1-v.morph:0)+(b.style===style?v.morph:0);const wire=styleWeight('wire'),ink=styleWeight('ink'),vhs=styleWeight('vhs');
  c.setTransform(w/1600,0,0,h/1000,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
  const sky=c.createLinearGradient(0,0,0,1000);sky.addColorStop(0,css(p.sky));sky.addColorStop(.5,css(p.haze));sky.addColorStop(1,css(p.near));c.fillStyle=sky;c.fillRect(0,0,1600,1000);
  const pan=Math.sin(t*.13)*v.drift*28+(v.panX-.5)*90;const py=Math.cos(t*.17)*v.drift*12+(v.panY-.5)*50;
  c.save();c.translate(800,500);const zoom=1+v.zoom*.16;c.scale(zoom,zoom);c.translate(-800+pan,-500+py);
  for(const s of this.stars)ellipse(c,s.x,s.y,s.r,s.r,css(p.moon,(.22+.19*Math.sin(t*.3+s.p))*v.moon));
  const mx=870,my=218;glow(c,mx,my,440,p.accent,.11*v.moon);glow(c,mx,my,210,p.moon,.19*v.moon);
  ellipse(c,mx,my,71*this.aspect,71,css(p.moon,.76*v.moon));
  // Moon's darker crater face; coherent in every interpolated palette.
  ellipse(c,mx+12*this.aspect,my-8,62*this.aspect,62,css(mix(p.moon,p.haze,.35),.55*v.moon));
  ellipse(c,mx-22*this.aspect,my+14,13*this.aspect,16,css(p.haze,.16));ellipse(c,mx+26*this.aspect,my-27,9*this.aspect,7,css(p.haze,.14));
  c.beginPath();c.ellipse(mx,my,84*this.aspect,84,0,0,TAU);c.strokeStyle=css(p.accent,.12*v.moon);c.lineWidth=1;c.stroke();
  // Distant ridgeline and light shafts.
  c.beginPath();c.moveTo(-100,660);c.bezierCurveTo(200,470,390,665,700,570);c.bezierCurveTo(1100,490,1270,650,1700,520);c.lineTo(1700,1000);c.lineTo(-100,1000);c.closePath();c.fillStyle=css(p.far,.55);c.fill();
  c.save();c.globalCompositeOperation='screen';for(let i=0;i<5;i++){const x=570+i*116;const beam=c.createLinearGradient(x,250,x,900);beam.addColorStop(0,css(p.moon,.015*v.moon));beam.addColorStop(.5,css(p.moon,.033*v.moon));beam.addColorStop(1,css(p.moon,0));c.fillStyle=beam;c.beginPath();c.moveTo(x,150);c.lineTo(x+18,150);c.lineTo(x+190,930);c.lineTo(x+40,930);c.fill();}c.restore();
  const density=7+Math.round(v.density*10);
  for(const layer of [0,1]){c.save();c.translate(pan*(layer===0?-.5:-.25),0);let count=0;for(const tr of this.trees)if(tr.layer===layer){if(count++<=density)this.drawTree(c,tr,p,life,v,wire,layer===0?.6:.9);}c.restore();
   this.mist(c,p,t,layer===0?600:720,layer===0?.11:.17,v.fog,layer+1);
  }
  // Forest floor and luminous winding path.
  c.save();if(compact)c.translate(0,-235);const ground=c.createLinearGradient(0,680,0,1000);ground.addColorStop(0,css(p.mid));ground.addColorStop(1,css(p.near));c.fillStyle=ground;c.beginPath();c.moveTo(-100,790);c.bezierCurveTo(380,660,650,805,950,738);c.bezierCurveTo(1280,675,1410,810,1710,726);c.lineTo(1710,1100);c.lineTo(-100,1100);c.fill();
  c.beginPath();c.moveTo(850,675);c.bezierCurveTo(500,775,1120,816,760,1000);c.lineTo(1110,1050);c.bezierCurveTo(1330,850,710,755,863,675);c.fillStyle=css(mix(p.mid,p.haze,.5),.45);c.fill();
  for(let i=0;i<12;i++){const y=760+i*20;ellipse(c,900+Math.sin(i*.9)*90,y,12+i*2,1,css(p.glow,.035*v.glow));}
  c.restore();const scale=.82+v.size*.55;const pulse=1+(audio.beat||0)*.08;
  this.shadow(c,1230,compact?590:753,scale*(.86+v.creep*.25),p,life,v);
  for(const tr of this.trees)if(tr.layer===2)this.drawTree(c,tr,p,life,v,wire,.96);
  // Eyes appear from bark, slightly concealed by a trunk edge.
  if(v.gaze>.15){this.eyes(c,260,481,10,p,life,v,v.gaze);this.eyes(c,1334,425,8,p,life+2,v,v.gaze);this.eyes(c,414,596,6,p,life+4,v,v.gaze);}
  const scare=this.event('scare',time,1.4);const peek=(Math.sin(life*.4)+1)*.5;
  this.mossling(c,compact?990:760,(compact?550:820)-scare*30,scale*pulse*(1+scare*.2),p,life,v);
  this.lantern(c,compact?1270:1050,(compact?565:820)+Math.sin(life)*3,scale*.93,p,life,v);
  this.mushroom(c,compact?710:940,compact?590:875,scale*.85,p,life,v);this.mushroom(c,compact?800:1000,compact?600:888,scale*.54,p,life+2,v);
  if(v.density>.35)this.mushroom(c,344,(compact?630:815)+peek*18,scale*.65,p,life+3,v);
  if(v.density>.7)this.mossling(c,1290,861,scale*.47,p,life+5,v);
  for(const s of this.summons){const age=time-s.time;if(age<0||age>24)continue;c.save();c.globalAlpha=clamp(Math.min(age*3,(24-age)/3));this.creature(c,s.monster,s.x,s.y,scale*(.6+Math.sin(age*2)*.03),p,life+age,v);c.restore();}
  // Rocks, ferns and surface roots foreground.
  for(const r of this.rocks){c.save();c.translate(r.x,r.y);c.rotate(Math.sin(r.p)*.2);c.beginPath();c.moveTo(-r.r,0);c.quadraticCurveTo(-r.r*.7,-r.r*.7,0,-r.r*.55);c.quadraticCurveTo(r.r*.7,-r.r,r.r,0);c.closePath();c.fillStyle=css(mix(p.near,p.mid,.32));c.fill();line(c,-r.r*.6,-r.r*.2,0,-r.r*.5,css(p.moss,.5),2);c.restore();}
  for(const tr of this.trees)if(tr.layer===3)this.drawTree(c,tr,p,life,v,wire);
  for(const g of this.grass){const sw=Math.sin(life+g.p)*v.wind*15;c.strokeStyle=css(mix(p.near,p.moss,.3+g.p*.025));c.lineWidth=2;c.beginPath();c.moveTo(g.x,g.y);c.quadraticCurveTo(g.x+sw,g.y-g.h*.7,g.x+sw+12,g.y-g.h);c.stroke();for(let j=1;j<5;j++){const y=g.y-g.h*j/6;line(c,g.x+sw*j/5,y,g.x+sw*j/5-12+j*1.8,y-6,css(p.moss,.33),1.5);line(c,g.x+sw*j/5,y,g.x+sw*j/5+13-j,y-6,css(p.moss,.33),1.5);}}
  // Tiny uninhabited glowing caps, grouped on roots.
  for(let i=0;i<21;i++){const x=100+(i*217)%1400,y=910+Math.sin(i*9)*55;line(c,x,y,x+2,y-12,css(p.moss,.7),2);ellipse(c,x+2,y-13,5,2.5,css(p.glow,.5));if(i%4===0)glow(c,x,y-14,20,p.glow,.06*v.glow);}
  this.mist(c,p,t,895,.23,v.fog+this.event('fog',time,5)*.7,3);
  const particleCount=Math.round((25+v.spores*125)*(this.quality<.8?.55:1));
  c.save();c.globalCompositeOperation='screen';for(let i=0;i<particleCount;i++){const s=this.spore[i];const x=(s.x+Math.sin(t*.13+s.p)*35+t*v.wind*s.s*9)%1640-20,y=s.y+Math.sin(t*.3+s.p)*22;const alpha=(.2+.65*Math.pow((Math.sin(t*s.s+s.p)+1)/2,2))*v.glow;glow(c,x,y,s.r*7,p.glow,alpha*.1);ellipse(c,x,y,s.r*.55,s.r*.55,css(p.glow,alpha));}c.restore();
  if(wire>.01){c.save();c.globalAlpha=wire*.24;c.strokeStyle=css(p.glow);c.lineWidth=.8;for(let i=0;i<24;i++){c.beginPath();c.moveTo(800+(i-12)*10,690);c.lineTo(800+(i-12)*130,1050);c.stroke();}for(let i=0;i<14;i++){const y=700+(i*i)*2;c.beginPath();c.ellipse(800,y,80+i*60,5+i*2,0,0,Math.PI);c.stroke();}c.restore();}
  c.restore();
  // Post: restrained feedback trails. History is updated only after final compositing.
  c.setTransform(1,0,0,1,0,0);
  if(state.flags.feedback&&this.historyReady){c.globalAlpha=Math.min(.72,v.feedback*.76);c.drawImage(this.history,0,0,w,h);c.globalAlpha=1;}
  if(state.flags.mirror){this.mirrorCtx.drawImage(this.canvas,0,0);c.save();c.beginPath();c.rect(w/2,0,w/2,h);c.clip();c.translate(w,0);c.scale(-1,1);c.drawImage(this.mirrorBuffer,0,0,w,h);c.restore();}
  if(vhs>.01||v.grain>.01){c.fillStyle=css(p.sky,.12*vhs+.035*v.grain);const gap=Math.max(3,Math.floor(h/200));for(let y=0;y<h;y+=gap)c.fillRect(0,y,w,1);if(vhs>.2){c.fillStyle=css(p.glow,.06*vhs);const y=((time*24)%h);c.fillRect(0,y,w,3);}}
  if(v.aberration>.4||vhs>.3){c.save();c.globalCompositeOperation='screen';c.globalAlpha=(v.aberration*.04+vhs*.025);c.drawImage(this.canvas,3+Math.sin(time)*3,0);c.restore();}
  if(ink>.01){c.fillStyle=css(p.near,ink*.1);c.fillRect(0,0,w,h);}
  const vig=c.createRadialGradient(w*.5,h*.44,h*.15,w*.5,h*.5,Math.max(w,h)*.63);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(2,5,15,.65)');c.fillStyle=vig;c.fillRect(0,0,w,h);
  const flash=this.event('lightning',time,.65);if(flash){c.fillStyle=css(p.moon,flash*.2);c.fillRect(0,0,w,h);}
  if(state.flags.invert){c.save();c.globalCompositeOperation='difference';c.fillStyle='rgb(114,131,164)';c.fillRect(0,0,w,h);c.restore();}
  this.historyCtx.drawImage(this.canvas,0,0);this.historyReady=true;
 }
 mist(c,p,t,y,alpha,fog,layer){
  const amount=clamp(fog,0,1.5);if(amount<.01)return;
  for(let i=0;i<4;i++){const cx=180+i*440+Math.sin(t*.08+layer+i)*120,cy=y+Math.sin(t*.12+i)*15;c.save();c.translate(cx,cy);c.scale(1,.17);const g=c.createRadialGradient(0,0,5,0,0,430);g.addColorStop(0,css(p.haze,alpha*amount));g.addColorStop(.5,css(p.haze,alpha*amount*.5));g.addColorStop(1,css(p.haze,0));c.fillStyle=g;c.fillRect(-430,-430,860,860);c.restore();}
 }
}
