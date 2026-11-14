// MAP mode UI: projector-style editor (corner pins, mesh warp, masks, multiple surfaces), clean fullscreen output
// with wake lock and a safe exit, calibration pattern, venues (local + JSON file). Original Brainhertz code.
import {MAX_SURFACES,MESH_SIZES,MAX_MASK_POINTS,ROTATIONS,ASPECTS,SOURCE_KINDS,MAP_COLORS,defaultSurface,defaultMapping,normalizeMapping,normalizeSurface,aspectRatio,fitBox,
 squareToQuad,applyH,outputToUV,meshOffsetAt,meshPoint,resizeMesh,moveCorner,moveSurface,moveMeshPoint,resetCorners,venueToJSON,venueFromJSON,cleanVenueName,ExitGesture} from './map.js';
import {MapRenderer,drawOutputPattern,drawSurfacePattern} from './map-gl.js';
import {EXPORT_HOOKS,hasExportHook} from './export-hooks.js';
const MAP_KEY='brainhertz.pixelpusher.map.v171',VENUES_KEY='brainhertz.pixelpusher.venues.v171',MAX_VENUES=30;
const COLORS=['#ff2b3d','#2f6cff','#6e3bff','#27e889'];
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
export function createMapUI(ctx){
 const {el,tile,chip,button,label,slider,head,note,store}=ctx,$=id=>document.getElementById(id);
 let wasFull=false,venueName='',mapping=load(),sel=0,mode='corners',fine=false,handle=null,renderer=null,failed=false,output=false,wake=null,barTimer=0,saveTimer=0,mapGen=null,performer=null;
 const clipVideos=new Map(),genTimes=new Map(),patterns=new Map(),gesture=new ExitGesture(),outPattern=document.createElement('canvas');
 const view=$('map-view'),canvas=$('map-canvas'),overlay=$('map-ui'),out=$('map-out');let box={x:0,y:0,w:1,h:1},dpr=1,lastFrame=0;
 function load(){try{return normalizeMapping(JSON.parse(store.getItem(MAP_KEY)||'null'));}catch{return defaultMapping();}}
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{store.setItem(MAP_KEY,JSON.stringify(mapping));}catch{}},250);}
 const cur=()=>mapping.surfaces[Math.min(sel,mapping.surfaces.length-1)];
 function changed(redrawDrawer=false){save();if(redrawDrawer)ctx.renderDrawer();}
 function ensure(){if(renderer||failed)return !!renderer;try{renderer=new MapRenderer(canvas);}catch(e){failed=true;note(e.message,true);return false;}
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();});performer=new ctx.FingerPerformer(canvas,$('map-touch'),ctx.performerOptions(()=>output&&mapping.perform));return true;}
 // ---------- Sources (only what is on screen is rendered/uploaded) ----------
 function clipVideo(id){let v=clipVideos.get(id);if(v)return v;const c=ctx.clipList().find(x=>x.id===id);if(!c)return null;v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.setAttribute('playsinline','');
  v._url=URL.createObjectURL(c.blob);v.src=v._url;v.addEventListener('ended',()=>{try{v.currentTime=0;v.play().catch(()=>{});}catch{}});v.play().catch(()=>{});clipVideos.set(id,v);return v;}
 // A decoder that stalls (time stops moving while playing) gets a gentle nudge: step forward and play again.
 function nudgeClip(v){const now=performance.now();if(v.currentTime!==v._lt){v._lt=v.currentTime;v._lm=now;return;}if(!v._lm){v._lm=now;return;}if(now-v._lm<1500)return;v._lm=now;try{const d=Number.isFinite(v.duration)&&v.duration>0?v.duration:1;v.currentTime=(v.currentTime+.25)%d;v.play().catch(()=>{});}catch{}}
 function pruneClips(){const used=new Set(mapping.surfaces.filter(s=>s.source.kind==='clip').map(s=>s.source.clipId));for(const [id,v]of clipVideos)if(!used.has(id)){v.pause();v.removeAttribute('src');v.load?.();URL.revokeObjectURL(v._url);clipVideos.delete(id);renderer?.forget('clip:'+id);}}
 function prepareGens(dt,signals){const ids=new Set(mapping.test?[]:mapping.surfaces.filter(s=>s.visible&&s.source.kind==='gen').map(s=>s.source.genId));if(!ids.size)return;
  if(!mapGen){try{mapGen=new ctx.Generator();}catch(e){note(e.message,true);mapGen=false;}}if(!mapGen)return;mapGen.resize(512,512);
  for(const id of ids){const g=ctx.defaultGen(id);const t=(genTimes.get(id)||0)+dt*ctx.speedFactor(g.values[0]);genTimes.set(id,t);const main=ctx.gen();
   if(mapGen.render(id,g.values,t,signals,null,id==='text'?ctx.textSpec(main.id==='text'?main:g):null))renderer.upload('gen:'+id,mapGen.canvas);}}
 function source(s){const k=s.source.kind;
  if(k==='color')return {color:hex(s.source.color)};
  if(k==='gen')return renderer.tex.has('gen:'+s.source.genId)?{img:mapGen.canvas,key:'gen:'+s.source.genId,static:true}:null;
  if(k==='clip'){const v=s.source.clipId&&clipVideo(s.source.clipId);if(!v)return null;nudgeClip(v);if(v.readyState<2)return null;const key='clip:'+s.source.clipId,t=renderer.tex.get(key);if(t&&t._vt===v.currentTime&&renderer.frames-t._frame<30)return {img:v,key,static:true};// same frame: reuse; refresh now and then in case a decode came late
   const r=renderer.upload(key,v);if(r)r._vt=v.currentTime;return r?{img:v,key,static:true}:null;}
  return {img:ctx.mainCanvas,key:'main'};}
 function patternFor(s,i){const k=i+'|'+s.name;let c=patterns.get(k);if(!c){c=drawSurfacePattern(document.createElement('canvas'),i,s.name);patterns.set(k,c);}return c;}
 // ---------- Frame ----------
 function layout(){const host=output?out:view,r=host.getBoundingClientRect();if(!r.width||!r.height)return false;const base=Math.min(2,devicePixelRatio||1);dpr=base;let W=r.width*dpr,H=r.height*dpr;const cap=output?2560:1800,k=Math.min(1,cap/Math.max(W,H));W*=k;H*=k;dpr*=k;
  renderer.resize(W,H);if(!output){const ow=Math.round(r.width*base),oh=Math.round(r.height*base);if(overlay.width!==ow||overlay.height!==oh){overlay.width=ow;overlay.height=oh;}}
  box=fitBox(r.width,r.height,aspectRatio(mapping,r.width,r.height));return true;}
 function frame(now,signals){if(!ensure())return;const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):0;lastFrame=now;if(!layout())return;
  prepareGens(dt,signals);const k=dpr,b={x:box.x*k,y:box.y*k,w:box.w*k,h:box.h*k};
  if(mapping.test){const pw=Math.round(Math.min(1280,b.w)),ph=Math.round(pw*b.h/b.w),key='pat'+pw+'x'+ph;if(outPattern._key!==key){drawOutputPattern(outPattern,pw,ph);renderer.forget(outPattern._key);outPattern._key=key;}}
  renderer.draw(mapping,source,b,{pattern:mapping.test?outPattern:null,patternFor});
  if(output){const g=gesture.poll(performance.now(),false);if(g==='long')exitOutput();}else drawOverlay();}
 // ---------- Editor overlay: outlines, big handles, mesh, mask ----------
 const toPx=([x,y])=>[box.x+x*box.w,box.y+y*box.h];
 const uvToOut=(s,u,v)=>{const H=squareToQuad(s.corners);if(!H)return [u,v];const [x,y]=applyH(H,u,v),o=s.mesh.n>=2?meshOffsetAt(s.mesh,u,v):[0,0];return [x+o[0],y+o[1]];};
 function edgePath(g,s){g.beginPath();const N=s.mesh.n>=2?16:1,pts=[];for(let i=0;i<N;i++)pts.push([i/N,0]);for(let i=0;i<N;i++)pts.push([1,i/N]);for(let i=N;i>0;i--)pts.push([i/N,1]);for(let i=N;i>0;i--)pts.push([0,i/N]);
  pts.forEach(([u,v],i)=>{const [x,y]=toPx(uvToOut(s,u,v));i?g.lineTo(x,y):g.moveTo(x,y);});g.closePath();}
 function drawOverlay(){const g=overlay.getContext('2d'),r=overlay.width/Math.max(1,view.clientWidth);g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,overlay.width,overlay.height);g.setTransform(r,0,0,r,0,0);
  g.lineWidth=1.5;g.setLineDash([6,5]);g.strokeStyle='rgba(47,108,255,.7)';g.strokeRect(box.x+.5,box.y+.5,box.w-1,box.h-1);g.setLineDash([]);
  mapping.surfaces.forEach((s,i)=>{const col=COLORS[i%4],on=i===sel;g.globalAlpha=s.visible?1:.4;edgePath(g,s);g.strokeStyle=col;g.lineWidth=on?2.5:1.5;g.stroke();
   const [lx,ly]=toPx(uvToOut(s,.5,.5));g.font='800 11px ui-monospace,Menlo,monospace';g.textAlign='center';g.textBaseline='middle';const t=(i+1)+' · '+s.name.toUpperCase(),w=g.measureText(t).width+12;
   g.fillStyle='rgba(5,6,12,.78)';g.fillRect(lx-w/2,ly-9,w,18);g.fillStyle=col;g.fillText(t,lx,ly);g.globalAlpha=1;});
  const s=cur();if(!s)return;const col=COLORS[sel%4];
  if(mode==='mesh'&&s.mesh.n>=2){const n=s.mesh.n;g.strokeStyle='rgba(39,232,137,.55)';g.lineWidth=1;
   for(let j=0;j<n;j++){g.beginPath();for(let q=0;q<=24;q++){const [x,y]=toPx(uvToOut(s,q/24,j/(n-1)));q?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
   for(let i=0;i<n;i++){g.beginPath();for(let q=0;q<=24;q++){const [x,y]=toPx(uvToOut(s,i/(n-1),q/24));q?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
   for(let j=0;j<n;j++)for(let i=0;i<n;i++){const [x,y]=toPx(meshPoint(s,i,j)),hot=handle?.type==='mesh'&&handle.i===i&&handle.j===j;dot(g,x,y,12,hot?'#27e889':'#0b0e1c',hot?'#27e889':'#e8ecff');}}
  else if(mode==='mask'){const m=s.mask;if(m.points.length){g.beginPath();m.points.forEach(([u,v],k)=>{const [x,y]=toPx(uvToOut(s,u,v));k?g.lineTo(x,y):g.moveTo(x,y);});if(m.closed)g.closePath();g.setLineDash(m.closed?[]:[7,5]);g.strokeStyle='#27e889';g.lineWidth=2;g.stroke();g.setLineDash([]);
    m.points.forEach(([u,v],k)=>{const [x,y]=toPx(uvToOut(s,u,v)),hot=handle?.type==='mask'&&handle.k===k;dot(g,x,y,k===0&&!m.closed?14:11,hot?'#27e889':'#0b0e1c',k===0?'#27e889':'#e8ecff');});}
   g.font='700 11px ui-monospace,Menlo,monospace';g.fillStyle='#27e889';g.textAlign='left';g.textBaseline='middle';g.fillText(m.closed?'MASK · DRAG POINTS':'MASK · TAP TO ADD · TAP POINT 1 TO CLOSE',box.x+8,box.y+14);}
  else s.corners.forEach((p,i)=>{const [x,y]=toPx(p),hot=handle?.type==='corner'&&handle.i===i;dot(g,x,y,19,hot?col:'rgba(5,6,12,.85)',col,String(i+1),hot?'#05060b':col);});
  if(fine){g.font='800 11px ui-monospace,Menlo,monospace';g.fillStyle='#27e889';g.textAlign='right';g.textBaseline='middle';g.fillText('FINE ×¼',box.x+box.w-8,box.y+14);}}
 function dot(g,x,y,r,fill,stroke,text,tc){g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle=fill;g.fill();g.lineWidth=2.5;g.strokeStyle=stroke;g.stroke();g.beginPath();g.arc(x,y,2,0,Math.PI*2);g.fillStyle=stroke;g.fill();
  if(text){g.font='900 13px system-ui,Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle=tc||stroke;g.fillText(text,x,y+.5);}}
 // ---------- Editor gestures ----------
 function bindEditor(){let drag=null;
  const pos=e=>{const r=overlay.getBoundingClientRect();return {px:e.clientX-r.left,py:e.clientY-r.top,x:(e.clientX-r.left-box.x)/box.w,y:(e.clientY-r.top-box.y)/box.h};};
  const near=(p,q,R=30)=>Math.hypot(p.px-q[0],p.py-q[1])<R;
  overlay.addEventListener('pointerdown',e=>{if(drag)return;e.preventDefault();try{overlay.setPointerCapture?.(e.pointerId);}catch{}const p=pos(e),s=cur();let hit=null;
   if(s&&mode==='corners')s.corners.forEach((c,i)=>{if(!hit&&near(p,toPx(c)))hit={type:'corner',i,start:c.slice()};});
   if(s&&mode==='mesh'&&s.mesh.n>=2)for(let j=0;j<s.mesh.n&&!hit;j++)for(let i=0;i<s.mesh.n&&!hit;i++){const q=meshPoint(s,i,j);if(near(p,toPx(q),24))hit={type:'mesh',i,j,start:q};}
   if(s&&mode==='mask'){const m=s.mask;m.points.forEach(([u,v],k)=>{if(!hit&&near(p,toPx(uvToOut(s,u,v)),24))hit={type:'mask',k,start:uvToOut(s,u,v)};});
    if(hit&&hit.k===0&&!m.closed&&m.points.length>=3){m.closed=true;m.on=true;handle=null;changed(true);note('Mask closed · drag points to refine');return;}
    if(!hit&&!m.closed){const uv=outputToUV(s,p.x,p.y);if(uv&&m.points.length<MAX_MASK_POINTS){m.points.push(uv);changed(true);}return;}}
   if(!hit){for(let i=mapping.surfaces.length-1;i>=0;i--){const t=mapping.surfaces[i],uv=outputToUV(t,p.x,p.y);if(uv&&uv[0]>=0&&uv[0]<=1&&uv[1]>=0&&uv[1]<=1){if(i!==sel){sel=i;handle=null;ctx.renderStrip();ctx.renderDrawer();}if(mode==='corners')hit={type:'surface',start:mapping.surfaces[i].corners.map(c=>c.slice())};break;}}}
   handle=hit;drag=hit?{id:e.pointerId,p0:p,hit}:null;});
  overlay.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=pos(e),f=fine?.25:1,dx=(p.x-drag.p0.x)*f,dy=(p.y-drag.p0.y)*f,h=drag.hit,s=cur();
   if(h.type==='corner')moveCorner(s,h.i,h.start[0]+dx,h.start[1]+dy);else if(h.type==='surface'){s.corners=h.start.map(c=>c.slice());moveSurface(s,dx,dy);}
   else if(h.type==='mesh')moveMeshPoint(s,h.i,h.j,h.start[0]+dx,h.start[1]+dy);else if(h.type==='mask'){const uv=outputToUV(s,h.start[0]+dx,h.start[1]+dy);if(uv)s.mask.points[h.k]=[Math.min(1.5,Math.max(-.5,uv[0])),Math.min(1.5,Math.max(-.5,uv[1]))];}});
  const up=e=>{if(drag&&drag.id===e.pointerId){drag=null;changed();if(ctx.drawerIs('map'))ctx.renderDrawer();}};overlay.addEventListener('pointerup',up);overlay.addEventListener('pointercancel',up);}
 function nudge(dx,dy){const s=cur();if(!s)return;const st=fine?.00025:.001;dx*=st;dy*=st;const h=handle;
  if(h?.type==='corner'){const c=s.corners[h.i];moveCorner(s,h.i,c[0]+dx,c[1]+dy);}else if(h?.type==='mesh'){const q=meshPoint(s,h.i,h.j);moveMeshPoint(s,h.i,h.j,q[0]+dx,q[1]+dy);}
  else if(h?.type==='mask'){const q=s.mask.points[h.k];s.mask.points[h.k]=[q[0]+dx,q[1]+dy];}else moveSurface(s,dx,dy);changed();}
 // ---------- Clean output ----------
 async function lock(){try{wake=await navigator.wakeLock?.request('screen');}catch{wake=null;}}
 let resetPtrs=()=>{};
 function enterOutput(){if(!ensure())return;output=true;resetPtrs();handle=null;out.hidden=false;out.prepend(canvas);document.body.classList.add('map-output');showBar(false);
  ctx.pushLayer?.('map-output',exitOutput);showCorner(true);
  const hint=$('map-hint');hint.textContent='TAP: SHOW EXIT · BACK, 2-FINGER TAP OR HOLD 1 S: EXIT · TRIPLE-TAP: CONTROLS';hint.hidden=false;clearTimeout(hint._t);hint._t=setTimeout(()=>{hint.hidden=true;},3500);
  try{const f=out.requestFullscreen||out.webkitRequestFullscreen;const r=f?.call(out);r?.catch?.(()=>{});}catch{}lock();}
 // Mesh / Mask edit modes are a back-navigation layer: Back (swipe, button, Escape) returns to Corners.
 function setMode(k){mode=k;if(k==='corners')ctx.dropLayer?.('map-mode');else ctx.pushLayer?.('map-mode',()=>{mode='corners';handle=null;ctx.renderDrawer();});}
 function exitOutput(){if(!output)return;output=false;resetPtrs();ctx.dropLayer?.('map-output');gesture.cancel();performer?.cancel();showBar(false);showCorner(false);$('map-hint').hidden=true;out.hidden=true;view.prepend(canvas);document.body.classList.remove('map-output');
  try{if(document.fullscreenElement||document.webkitFullscreenElement){const r=(document.exitFullscreen||document.webkitExitFullscreen).call(document);r?.catch?.(()=>{});}}catch{}const w=wake;wake=null;w?.release?.()?.catch?.(()=>{});ctx.renderStrip();}
 // Corner Exit (1.7.3): always reachable. Shown on entry and on ANY single tap, fades after 3 s (and is not tappable while faded).
 let cornerTimer=0;function showCorner(on){const c=$('mo-corner');if(!c)return;clearTimeout(cornerTimer);c.classList.toggle('on',!!on);if(on)cornerTimer=setTimeout(()=>c.classList.remove('on'),3000);}
 function showBar(on){const b=$('map-out-bar');b.hidden=!on;clearTimeout(barTimer);if(on){syncBar();barTimer=setTimeout(()=>showBar(false),6000);}}
 function syncBar(){$('mo-test').setAttribute('aria-pressed',String(mapping.test));$('mo-black').setAttribute('aria-pressed',String(mapping.blackout));$('mo-perform').setAttribute('aria-pressed',String(mapping.perform));}
 function bindOutput(){const rel=e=>{const r=out.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};const ids=new Set();let barGuard=0;
  for(const id of ['map-out-bar','mo-corner'])$(id).addEventListener('click',e=>{if(performance.now()<barGuard){e.stopPropagation();e.preventDefault();}},true);
  // Two-finger tap = exit: both fingers down close together, lifted quickly, no drag.
  let two=null;resetPtrs=()=>{ids.clear();two=null;};
  out.addEventListener('pointerdown',e=>{if(e.target.closest('.mo-ui'))return;ids.add(e.pointerId);const now=performance.now(),[x,y]=rel(e);gesture.start(x,y,now,e.pointerId,ids.size);
   if(ids.size===1)two={t:now,n:1,moved:false,pts:{[e.pointerId]:[x,y]}};else if(two&&ids.size===2&&now-two.t<300){two.n=2;two.pts[e.pointerId]=[x,y];}else two=null;});
  out.addEventListener('pointermove',e=>{const [x,y]=rel(e);gesture.move(x,y,e.pointerId);const p0=two?.pts[e.pointerId];if(p0&&Math.hypot(x-p0[0],y-p0[1])>.04)two.moved=true;});
  const end=e=>{if(!ids.has(e.pointerId))return;ids.delete(e.pointerId);const now=performance.now(),[x,y]=rel(e);
   if(two&&two.n===2&&!ids.size){const ok=!two.moved&&now-two.t<650;two=null;if(ok){exitOutput();return;}}
   const g=gesture.end(x,y,now,e.pointerId);barGuard=now+400;if(g==='triple'){showBar($('map-out-bar').hidden);showCorner(true);}else if(gesture.lastTap&&!ids.size)showCorner(true);};
  out.addEventListener('pointerup',end);out.addEventListener('pointercancel',e=>{ids.delete(e.pointerId);gesture.cancel();});out.addEventListener('lostpointercapture',e=>{if(!output)ids.delete(e.pointerId);});
  $('mo-exit').addEventListener('click',exitOutput);$('mo-x').addEventListener('click',exitOutput);$('mo-more').addEventListener('click',()=>{showBar($('map-out-bar').hidden);showCorner(true);});
  // System fullscreen exit (iPad swipe / Esc in fullscreen) leaves the output too.
  for(const ev of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(ev,()=>{if(output&&wasFull&&!(document.fullscreenElement||document.webkitFullscreenElement))exitOutput();wasFull=!!(document.fullscreenElement||document.webkitFullscreenElement);});$('mo-test').addEventListener('click',()=>{mapping.test=!mapping.test;changed();syncBar();showBar(true);});
  $('mo-black').addEventListener('click',()=>{mapping.blackout=!mapping.blackout;changed();syncBar();showBar(true);});$('mo-perform').addEventListener('click',()=>{mapping.perform=!mapping.perform;changed();syncBar();showBar(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&output)lock();});}
 // ---------- Strip ----------
 function strip(s){
  s.append(tile({label:'Output',iconName:'projector',action:true,color:'red',aria:'Clean output: fullscreen projector view',onTap:enterOutput}));
  s.append(tile({label:'Test pattern',iconName:'grid',action:true,color:'green',on:mapping.test,aria:'Calibration test pattern',onTap:()=>{mapping.test=!mapping.test;changed();ctx.renderStrip();}}));
  s.append(tile({label:'Venues',iconName:'save',action:true,color:'blue',selected:ctx.drawerIs('venues'),aria:'Venues: save, load, export, import',onTap:()=>ctx.drawerIs('venues')?ctx.closeDrawer():ctx.openDrawer('venues')}));
  s.append(el('span','strip-sep'));
  mapping.surfaces.forEach((x,i)=>{const t=tile({label:x.name,iconName:'layers',selected:i===sel,badge:String(i+1),aria:'Surface '+(i+1)+': '+x.name,onTap:()=>{sel=i;handle=null;ctx.openDrawer('map');ctx.renderStrip();}});t.classList.add('surf-'+(i%4));if(!x.visible)t.classList.add('dim');s.append(t);});
  if(mapping.surfaces.length<MAX_SURFACES)s.append(tile({label:'Add surface',iconName:'plus',action:true,color:'purple',aria:'Add surface',onTap:addSurface}));}
 function addSurface(){if(mapping.surfaces.length>=MAX_SURFACES)return note('Up to '+MAX_SURFACES+' surfaces.',true);const i=mapping.surfaces.length,kinds=['main','gen','color','clip'],k=kinds[i%4]==='clip'&&!ctx.clipList().length?'gen':kinds[i%4];
  const s=defaultSurface(i,k);s.fit='stretch';if(k==='clip')s.source.clipId=ctx.clipList()[0].id;s.source.genId=['tunnel','plasma','voronoi','rings','ribbons'][i%5];s.source.color=COLORS[i%4];
  mapping.surfaces.push(s);sel=i;handle=null;mode='corners';changed();ctx.openDrawer('map');ctx.renderStrip();note('Surface '+(i+1)+' added · drag its corners');}
 // ---------- Drawers ----------
 function drawer(d,which){if(which==='venues')return drawerVenues(d);const s=cur();if(!s)return;
  head(d,s.name,'MAP · SURFACE '+(sel+1)+' OF '+mapping.surfaces.length);
  const modes=el('div','row seg');for(const [k,t] of [['corners','Corners'],['mesh','Mesh warp'],['mask','Mask']])modes.append(chip(t,()=>{setMode(k);handle=null;if(k==='mesh'&&!s.mesh.n){s.mesh=resizeMesh(s.mesh,4);changed();}ctx.renderDrawer();},mode===k));d.append(label('Edit'),modes);
  const pad=el('div','nudge'),arrow=(t,a,dx,dy)=>{const b=button('',a,()=>nudge(dx,dy),'icon');b.setAttribute('aria-label','Nudge '+t);return b;};
  pad.append(arrow('left','left',-1,0),arrow('up','up',0,-1),arrow('down','down',0,1),arrow('right','right',1,0));const fb=chip(fine?'Fine ×¼ on':'Fine',()=>{fine=!fine;ctx.renderDrawer();},fine);fb.setAttribute('aria-label','Fine mode');pad.append(fb);
  d.append(label('Nudge',el('span','tc-inline',handle?.type==='corner'?'CORNER '+(handle.i+1):handle?.type==='mesh'?'POINT '+(handle.i+1)+','+(handle.j+1):handle?.type==='mask'?'MASK POINT '+(handle.k+1):'WHOLE SURFACE')),pad);
  if(mode==='corners'){const r=el('div','row');r.append(button('Reset corners','reset',()=>{resetCorners(s,sel);changed();}),button('Full frame','grid',()=>{s.corners=[[0,0],[1,0],[1,1],[0,1]];changed();}));d.append(r);}
  if(mode==='mesh'){const r=el('div','row');for(const n of MESH_SIZES.slice(1))r.append(chip(n+'×'+n,()=>{s.mesh=resizeMesh(s.mesh,n);changed(true);},s.mesh.n===n));r.append(chip('Off',()=>{s.mesh=resizeMesh(s.mesh,0);setMode('corners');changed(true);},!s.mesh.n));
   d.append(label('Mesh points'),r,el('p','hint','Drag the points to bend the image onto curved surfaces. Corner pins still move the whole mesh.'));const rr=el('div','row');rr.append(button('Flatten mesh','reset',()=>{s.mesh=resizeMesh(null,s.mesh.n);changed();}));d.append(rr);}
  if(mode==='mask'){const m=s.mask,r=el('div','row');r.append(chip(m.on?'Mask on':'Mask off',()=>{if(m.points.length<3)return note('Tap 3 or more points first.',true);m.on=!m.on;changed(true);},m.on),chip('Invert',()=>{m.invert=!m.invert;changed(true);},m.invert));
   if(!m.closed&&m.points.length>=3)r.append(chip('Close shape',()=>{m.closed=true;m.on=true;changed(true);}));r.append(button('Clear mask','trash',()=>{s.mask={points:[],closed:false,on:false,invert:false,feather:m.feather};handle=null;changed(true);},'danger'));
   d.append(label('Mask',el('span','tc-inline',m.points.length+' POINTS')),r,slider({label:'Mask feather',value:m.feather,min:0,max:.2,step:.005,format:v=>Math.round(v*500)+'%',onInput:v=>{m.feather=v;},onChange:()=>changed()}));}
  const src=el('div','row');for(const [k,t] of SOURCE_KINDS)src.append(chip(t,()=>{if(k==='clip'&&!ctx.clipList().length)return note('No clips yet. Make one from the timeline (Frames → Make clip).',true);s.source.kind=k;if(k==='clip'&&!ctx.clipList().some(c=>c.id===s.source.clipId))s.source.clipId=ctx.clipList()[0].id;pruneClips();changed(true);},s.source.kind===k));
  d.append(label('Source'),src);
  if(s.source.kind==='main')d.append(el('p','hint','The live studio output: every effect, keyframe, beat track, LFO and finger move shows here.'));
  if(s.source.kind==='clip'){const r=el('div','row');for(const c of ctx.clipList())r.append(chip(c.name,()=>{s.source.clipId=c.id;pruneClips();changed(true);},s.source.clipId===c.id));d.append(r);}
  if(s.source.kind==='gen'){const r=el('div','row');for(const g of ctx.GEN_SOURCES)r.append(chip(g.name,()=>{s.source.genId=g.id;changed(true);},s.source.genId===g.id));d.append(r);}
  if(s.source.kind==='color'){const r=el('div','row');for(const [h,t] of MAP_COLORS){const c=chip(t,()=>{s.source.color=h;changed(true);},s.source.color===h);c.classList.add('swatch');c.style.setProperty('--sw',h);r.append(c);}d.append(r);}
  if(s.source.kind!=='color'){const r=el('div','row');r.append(chip('Crop to fit',()=>{s.fit='crop';changed(true);},s.fit==='crop'),chip('Stretch',()=>{s.fit='stretch';changed(true);},s.fit==='stretch'));d.append(r);}
  d.append(label('Look'));for(const [k,t,mn,mx,st,f] of [['opacity','Opacity',0,1,.01,v=>Math.round(v*100)+'%'],['brightness','Brightness',0,2,.01,v=>Math.round(v*100)+'%'],['gamma','Gamma',.4,2.5,.01,v=>v.toFixed(2)],['feather','Edge feather',0,.25,.005,v=>Math.round(v*400)+'%']])
   d.append(slider({label:t,value:s[k],min:mn,max:mx,step:st,format:f,onInput:v=>{s[k]=v;},onChange:()=>changed()}));
  const tr=el('div','row');for(const r of ROTATIONS)tr.append(chip(r+'°',()=>{s.rotate=r;changed(true);},s.rotate===r));tr.append(chip('Flip ↔',()=>{s.flipX=!s.flipX;changed(true);},s.flipX),chip('Flip ↕',()=>{s.flipY=!s.flipY;changed(true);},s.flipY));d.append(label('Rotate / flip'),tr);
  const nm=el('div','slider'),l=el('label',null,'Name'),inp=el('input');inp.type='text';inp.maxLength=32;inp.value=s.name;inp.id='map-name';l.htmlFor=inp.id;inp.addEventListener('change',()=>{s.name=normalizeSurface({...s,name:inp.value}).name;changed();ctx.renderStrip();ctx.renderDrawer();});nm.append(l,el('output'),inp);d.append(nm);
  const ar=el('div','row');ar.append(chip(s.visible?'Visible':'Hidden',()=>{s.visible=!s.visible;changed(true);ctx.renderStrip();},s.visible),button('Up','up',()=>order(1)),button('Down','down',()=>order(-1)),button('Duplicate','plus',()=>{if(mapping.surfaces.length>=MAX_SURFACES)return note('Up to '+MAX_SURFACES+' surfaces.',true);const c=normalizeSurface(JSON.parse(JSON.stringify({...s,id:undefined,name:s.name+' copy'})),mapping.surfaces.length);moveSurface(c,.03,.03);mapping.surfaces.push(c);sel=mapping.surfaces.length-1;changed(true);ctx.renderStrip();}));
  ar.append(button('Delete','trash',()=>ctx.openSheet('Delete surface?',b=>{b.append(el('p',null,'“'+s.name+'” and its mask will be removed from this mapping.'),button('Delete surface','trash',()=>{mapping.surfaces.splice(sel,1);if(!mapping.surfaces.length)mapping.surfaces.push(defaultSurface(0));sel=Math.max(0,sel-1);handle=null;renderer?.drop(new Set(mapping.surfaces.map(x=>x.id)));pruneClips();changed();ctx.closeSheet();ctx.renderStrip();ctx.renderDrawer();note('Surface deleted');},'danger'),button('Keep it','close',ctx.closeSheet));}),'danger'));
  d.append(label('Surface'),ar);}
 function order(dir){const i=sel,j=i+dir;if(j<0||j>=mapping.surfaces.length)return;const a=mapping.surfaces;[a[i],a[j]]=[a[j],a[i]];sel=j;changed(true);ctx.renderStrip();note(dir>0?'Moved up (drawn later, on top)':'Moved down');}
 function venues(){try{const v=JSON.parse(store.getItem(VENUES_KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.name==='string').slice(0,MAX_VENUES):[];}catch{return [];}}
 function writeVenues(v){try{store.setItem(VENUES_KEY,JSON.stringify(v.slice(0,MAX_VENUES)));return true;}catch{note('Storage is full. Delete a venue first.',true);return false;}}
 function useMapping(m,name){venueName=name;mapping=normalizeMapping(m);sel=0;handle=null;setMode('corners');renderer?.drop(new Set(mapping.surfaces.map(s=>s.id)));pruneClips();changed();ctx.renderStrip();ctx.renderDrawer();
  const missing=mapping.surfaces.filter(s=>s.source.kind==='clip'&&!ctx.clipList().some(c=>c.id===s.source.clipId)).length;note('Venue loaded: '+name+(missing?' · '+missing+' clip source'+(missing>1?'s':'')+' not on this device':''),!!missing);}
 function drawerVenues(d){head(d,'Venues','MAPPING SETUPS · ON THIS DEVICE');
  const asp=el('div','row');for(const [k] of ASPECTS)asp.append(chip(k==='screen'?'This screen':k,()=>{mapping.aspect=k;changed(true);},mapping.aspect===k));d.append(label('Output shape'),asp);
  d.append(el('p','hint','Projector or TV: connect an HDMI adapter or turn on AirPlay Screen Mirroring, turn the device sideways, then tap Output. The mirrored screen shows only the mapped surfaces on black.'));
  const w=el('div','slider'),l=el('label',null,'Venue name'),inp=el('input');inp.type='text';inp.maxLength=40;inp.id='venue-name';inp.placeholder='e.g. Warehouse stage';inp.value=venueName;inp.addEventListener('input',()=>{venueName=inp.value;});l.htmlFor=inp.id;w.append(l,el('output'),inp);d.append(w);
  const r=el('div','row');r.append(button('Save venue','save',()=>{const name=cleanVenueName(inp.value||'Venue '+(venues().length+1));venueName=name;const v=venues().filter(x=>x.name!==name);v.unshift({name,saved:Date.now(),mapping});if(writeVenues(v)){note('Venue saved: '+name);ctx.renderDrawer();}},'accent'),
   button('Export JSON','share',ctx.safe(async()=>{const name=cleanVenueName(inp.value||'venue');const blob=new Blob([venueToJSON(name,mapping)],{type:'application/json'});await ctx.saveBlob(blob,'pixelpusher-venue-'+name.replace(/[^\w-]+/g,'_')+'.json');}),'blue'),
   button('Import JSON','plus',()=>$('venue-file').click()));d.append(r);
  // Reserved hook point: a later build registers 'sendToNiche' (clip + JSON sidecar). Hidden until then.
  if(hasExportHook('sendToNiche')){const n=el('div','row');n.append(button('Send to Niche','share',ctx.safe(async()=>EXPORT_HOOKS.sendToNiche({sidecar:JSON.parse(venueToJSON(inp.value||'venue',mapping))}))));d.append(n);}
  const list=venues();d.append(label('Saved · '+list.length));if(!list.length)d.append(el('p','empty-note','No venues yet. Map your surfaces, name the venue, Save.'));
  for(const v of list){const row=el('div','venue');row.append(el('b',null,v.name),el('small',null,new Date(v.saved).toLocaleDateString()+' · '+(v.mapping?.surfaces?.length||0)+' surfaces'));
   const a=el('div','row');a.append(button('Load','left',()=>useMapping(v.mapping,v.name),'blue'),button('Delete','trash',()=>ctx.openSheet('Delete venue?',b=>{b.append(el('p',null,'“'+v.name+'” will be removed from this device.'),button('Delete venue','trash',()=>{writeVenues(venues().filter(x=>x.name!==v.name));ctx.closeSheet();ctx.renderDrawer();note('Venue deleted');},'danger'),button('Keep it','close',ctx.closeSheet));}),'danger'));row.append(a);d.append(row);}}
 function bindImport(){$('venue-file').addEventListener('change',ctx.safe(async()=>{const f=$('venue-file').files?.[0];$('venue-file').value='';if(!f)return;if(f.size>2e6)throw new Error('That file is too large to be a venue.');const v=venueFromJSON(await f.text());useMapping(v.mapping,v.name);}));}
 bindEditor();bindOutput();bindImport();
 return {strip,drawer,frame,enterOutput,exitOutput,addSurface,
  active:()=>ctx.tab()==='map'||output,enter(){ensure();ctx.openDrawer('map');},leave(){handle=null;if(mode!=='corners')setMode('corners');},
  api:{get mapping(){return mapping;},set mapping(m){mapping=normalizeMapping(m);sel=0;changed();},get sel(){return sel;},set sel(i){sel=i;},get mode(){return mode;},set mode(m){mode=m;},get output(){return output;},get fine(){return fine;},
   get box(){return box;},get renderer(){return renderer;},get clipVideos(){return clipVideos;},nudge,addSurface,enterOutput,exitOutput,useMapping,venues,save:()=>{try{store.setItem(MAP_KEY,JSON.stringify(mapping));}catch{}}}};
}
