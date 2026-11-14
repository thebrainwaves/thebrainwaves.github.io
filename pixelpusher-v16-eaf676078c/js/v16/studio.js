// Pixel Pusher 1.6 studio shell. Original Brainhertz Productions code; on-device only.
import {EFFECTS,PRESETS,defaultStack,sanitizeStack,moveEffect,randomizeStack,QualityController,BeatClock,normalizePreset} from '../core.js';
import {formatParam} from '../effects.js';
import {Renderer} from '../gpu.js';
import {AudioEngine} from '../audio.js';
import {Capture,recordingMime} from '../recorder.js';
import {decodePhoto,fileKind} from '../photo-source.js';
import {DrawingLayer} from '../drawing-layer.js';
import {readPresets} from '../storage.js';
import {SnapshotHistory} from './history.js';
import {SOURCES,SHAPES,DIVISION_LABELS,MAX_MODS,normalizeMods,applyMods} from './modulation.js';
import {FrameStore,moveFrame} from './frames-store.js';
import {buildZip} from './zip.js';
import {saveBlob,stamp} from './share.js';
import {builtinFx,readFx,writeFx} from './fx-presets.js';

export const VERSION='1.6';
const $=id=>document.getElementById(id);
const DEFS=new Map(EFFECTS.map(e=>[e.id,e]));
const SESSION_KEY='brainhertz.pixelpusher.session.v16',LOOKS_KEY='brainhertz.pixelpusher.looks.v16';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const icon=name=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#i-'+name);s.append(u);s.setAttribute('aria-hidden','true');return s;};
const store=(()=>{try{localStorage.setItem('pp.t','1');localStorage.removeItem('pp.t');return localStorage;}catch{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}})();

// ---------- State ----------
const canvas=$('output'),video=$('media'),app=$('app');
const audio=new AudioEngine(video),beatClock=new BeatClock(),quality=new QualityController();
const drawing=new DrawingLayer({brush:'pen',size:10,color:'#ff2b3d',opacity:1});
const frames=new FrameStore(),history=new SnapshotHistory(60);
let renderer,thumbRenderer=null,stack=[],tab='effects',selectedFx=null,drawerOpen=false,selectedFrame=null,selectedLook=null,drawerMode=null;
let source=null,sourceKind='demo',sourceURL=null,camera=null,facing='environment',frozen=false,compare=false,sensitivity=1.5,audioMode='none';
let renderStack=[],frameList=[],thumbURLs=new Map(),fxStore=readFx(store,EFFECTS),userLooks=[],legacyLooks=[],capture=null,lastThumbs=0,beatOrigin=0,animFps=8,animLoops=2;
const thumbCanvases=new Map();

// Original procedural demo input (no external asset).
const demo=document.createElement('canvas');demo.width=720;demo.height=960;
function drawDemo(t){
 const c=demo.getContext('2d'),W=720,H=960;const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0d1640');g.addColorStop(.55,'#1c0c3a');g.addColorStop(1,'#04060f');c.fillStyle=g;c.fillRect(0,0,W,H);
 c.save();c.translate(W/2,H*.46);c.rotate(Math.sin(t*.25)*.08);
 for(let i=14;i>0;i--){const w=40+i*30,h=30+i*38;c.strokeStyle=['#ff2b3d','#2f6cff','#8c3dff'][i%3];c.lineWidth=i%4===0?7:2;c.strokeRect(-w/2+Math.sin(i*.7+t*.6)*16,-h/2,w,h);}
 c.restore();
 c.fillStyle='#27e889';c.fillRect(70,H*.78,W-140,3);c.fillStyle='#ff2b3d';c.fillRect(110,H*.2,W-220,4);
 c.font='600 22px ui-monospace,monospace';c.fillStyle='#8f9be0';c.fillText('BRAINHERTZ / PIXEL PUSHER',70,H*.86);
 c.font='14px ui-monospace,monospace';c.fillStyle='#5f6aa8';c.fillText('ORIGINAL GENERATIVE INPUT  ·  TAP SOURCE',70,H*.89);
}

// ---------- Toast ----------
let toastTimer;
function note(msg,error=false){const t=$('toast');t.textContent=msg;t.classList.toggle('error',error);t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,error?6000:2600);}
const safe=fn=>async(...a)=>{try{return await fn(...a);}catch(e){note(e?.message||'That did not work. Try again.',true);}};

// ---------- Stack, history, session ----------
function withMods(list,raw){const byId=new Map((Array.isArray(raw)?raw:[]).filter(x=>x&&typeof x==='object').map(x=>[x.id,x]));return list.map(e=>({...e,mods:normalizeMods(byId.get(e.id)?.mods,DEFS.get(e.id).params.length)}));}
function setStack(raw){stack=withMods(sanitizeStack(raw),raw);renderStack=stack.map(e=>({id:e.id,enabled:false,intensity:1,values:new Array(6).fill(0),hold:false,reactive:false,reactiveParam:0}));}
const signature=()=>JSON.stringify(stack.map(e=>[e.id,e.enabled,e.intensity,e.values,e.mods]))+'|'+drawing.model.strokes.map(s=>s.seed).join(',');
function snapshot(){return {stack:structuredClone(stack),strokes:drawing.model.strokes.slice()};}
function commit(){if(history.push(snapshot(),signature()))saveSession();syncUndo();}
function restore(entry){if(!entry)return;stack=structuredClone(entry.stack);drawing.model.current=null;drawing.model.strokes=entry.strokes.slice();drawing.model.revision++;drawing.baseKey='';renderer?.clearHistory();saveSession();refreshUI();syncUndo();}
function syncUndo(){$('btn-undo').disabled=!history.canUndo;$('btn-redo').disabled=!history.canRedo;}
let sessionTimer;
function saveSession(){clearTimeout(sessionTimer);sessionTimer=setTimeout(()=>{try{store.setItem(SESSION_KEY,JSON.stringify({v:VERSION,stack,drawing:drawing.model.settings,sensitivity}));}catch{/* storage full: session continuity only */}},300);}
function loadSession(){try{const raw=store.getItem(SESSION_KEY);if(!raw||raw.length>1e6)return null;return JSON.parse(raw);}catch{return null;}}
function loadLooks(){try{const raw=store.getItem(LOOKS_KEY);const list=raw&&raw.length<4e6?JSON.parse(raw):[];userLooks=(Array.isArray(list)?list:[]).slice(0,60).map(v=>{const p=normalizePreset(v);return p?{name:p.name,stack:withMods(p.stack,v.stack)}:null;}).filter(Boolean);}catch{userLooks=[];}
 try{legacyLooks=readPresets(store).presets.map(p=>({name:p.name,stack:p.stack,legacy:true}));}catch{legacyLooks=[];}}
function saveLooks(){try{store.setItem(LOOKS_KEY,JSON.stringify(userLooks));}catch{note('Local storage is full. Delete a look first.',true);}}

// ---------- Rendering ----------
function sourceSize(s){return [s.videoWidth||s.naturalWidth||s.width||0,s.videoHeight||s.naturalHeight||s.height||0];}
function targetSize(){const [sw,sh]=sourceSize(source);if(!sw||!sh)return null;const long=Math.round(Math.min(1440,Math.max(sw,sh))*quality.scale),k=long/Math.max(sw,sh);return [Math.max(2,Math.round(sw*k/2)*2),Math.max(2,Math.round(sh*k/2)*2)];}
function fitCanvas(){const stage=$('stage'),r=stage.getBoundingClientRect(),pad=14,aw=Math.max(40,r.width-pad),ah=Math.max(40,r.height-pad),k=Math.min(aw/canvas.width,ah/canvas.height);canvas.style.width=Math.floor(canvas.width*k)+'px';canvas.style.height=Math.floor(canvas.height*k)+'px';}
function ensureSize(){const t=targetSize();if(!t)return false;if(t[0]!==canvas.width||t[1]!==canvas.height){renderer.resize(t[0],t[1]);fitCanvas();}return true;}
const signals={level:0,low:0,mid:0,high:0,beat:0,beats:0,phase:0};
function loop(now){
 requestAnimationFrame(loop);
 if(!renderer||document.hidden)return;
 const t0=performance.now(),time=now/1000;
 if(sourceKind==='demo')drawDemo(time);
 if((sourceKind==='camera'||sourceKind==='video')&&video.readyState<2)return;
 if(!ensureSize())return;
 const level=audio.level(sensitivity),bands=audio.bands(sensitivity);
 signals.level=level;signals.low=bands.low;signals.mid=bands.mid;signals.high=bands.high;signals.beat=beatClock.update(level,now);
 signals.beats=Math.max(0,now-beatOrigin)/60000*beatClock.bpm;signals.phase=signals.beats%1;
 for(let i=0;i<stack.length;i++){const e=stack[i],r=renderStack[i]||(renderStack[i]={values:new Array(6).fill(0)});r.id=e.id;r.enabled=e.enabled;r.hold=false;r.reactive=false;if(e.enabled)applyMods(e,r,time,signals);}
 renderStack.length=stack.length;
 renderer.freeze=frozen;
 const w=canvas.width,h=canvas.height,ink=drawing.frame(w,h,time,{...bands,beat:signals.beat,phase:signals.phase});
 const under=ink&&drawing.model.settings.placement==='under';
 renderer.render(under?drawing.composite(source,w,h):source,renderStack,time,compare,{beat:signals.beat,phase:signals.phase,ink:under?null:ink,inkOpacity:drawing.opacity});
 if(quality.update(performance.now()-t0,!!capture?.active))ensureSize();
 if((sourceKind==='camera'||sourceKind==='video')&&tab==='effects'&&now-lastThumbs>4000)updateThumbs();
}

// ---------- Effect thumbnails (second small GL context, refreshed on change) ----------
const mini=document.createElement('canvas');mini.width=96;mini.height=114;
const thumbSrc=document.createElement('canvas');thumbSrc.width=96;thumbSrc.height=114;
function prepThumbSource(){
 if(thumbRenderer===false||!source)return false;
 try{if(!thumbRenderer){thumbRenderer=new Renderer(mini);thumbRenderer.resize(96,114);}}catch{thumbRenderer=false;return false;}
 const [sw,sh]=sourceSize(source);if(!sw||!sh)return false;const c=thumbSrc.getContext('2d'),k=Math.max(96/sw,114/sh);c.fillStyle='#000';c.fillRect(0,0,96,114);c.drawImage(source,(96-sw*k)/2,(114-sh*k)/2,sw*k,sh*k);return true;
}
function lookThumb(look){const c=document.createElement('canvas');c.width=96;c.height=114;try{if(prepThumbSource()){const list=sanitizeStack(look.stack).map(e=>({...e,hold:false,reactive:false}));thumbRenderer.clearHistory();for(let i=0;i<3;i++)thumbRenderer.render(thumbSrc,list,1+i*.3);c.getContext('2d').drawImage(mini,0,0);}}catch{/* icon-less fallback: dark tile */}return c;}
function updateThumbs(only){
 lastThumbs=performance.now();
 if(!prepThumbSource())return;
 for(const e of stack){if(only&&e.id!==only)continue;const target=thumbCanvases.get(e.id);if(!target)continue;
  const one=[{id:e.id,enabled:true,intensity:Math.max(.6,e.intensity),values:e.values.slice(),hold:false,reactive:false}];
  thumbRenderer.clearHistory();const passes=['smear','trails','slit','beat','mosh'].includes(e.id)?4:1;for(let i=0;i<passes;i++)thumbRenderer.render(thumbSrc,one,1+i*.3);
  target.getContext('2d').drawImage(mini,0,0);
 }
}

// ---------- Sources ----------
function stopCamera(){if(camera){camera.getTracks().forEach(t=>t.stop());camera=null;}video.srcObject=null;}
function releaseSource(){stopCamera();if(sourceURL){URL.revokeObjectURL(sourceURL);sourceURL=null;}video.removeAttribute('src');video.load?.();}
function sourceChanged(){quality.reset();renderer.clearHistory();ensureSize();fitCanvas();setTimeout(()=>updateThumbs(),120);}
const useDemo=()=>{releaseSource();source=demo;sourceKind='demo';sourceChanged();};
const useCamera=safe(async()=>{
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera needs HTTPS and permission.');
 const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},audio:false});
 releaseSource();camera=stream;video.srcObject=stream;video.muted=true;await video.play();source=video;sourceKind='camera';sourceChanged();note(facing==='user'?'Front camera':'Back camera');
});
const useFile=safe(async file=>{
 const kind=fileKind(file);if(!kind)throw new Error('Choose a photo or video.');
 if(kind==='image'){const gl=renderer.gl,max=gl.getParameter(gl.MAX_TEXTURE_SIZE);const out=await decodePhoto(file,max);releaseSource();source=out.source;sourceKind='image';sourceChanged();note('Photo loaded');return;}
 releaseSource();sourceURL=URL.createObjectURL(file);video.src=sourceURL;video.loop=true;video.muted=!(audioMode==='video'||audioMode==='mix');
 await new Promise((ok,bad)=>{video.onloadeddata=ok;video.onerror=()=>bad(new Error('This video could not be opened on this device.'));});
 await video.play().catch(()=>{});source=video;sourceKind='video';sourceChanged();note('Video loaded');
});
const useBlob=safe(async blob=>{const out=await decodePhoto(blob,2048);releaseSource();source=out.source;sourceKind='image';sourceChanged();note('Frame is now the source');});

// ---------- UI: tabs, strip, drawer ----------
function setTab(next){tab=next;app.dataset.tab=tab;for(const b of document.querySelectorAll('.tab'))b.setAttribute('aria-selected',String(b.dataset.tab===tab));closeDrawer(false);renderStrip();if(tab==='effects')setTimeout(()=>updateThumbs(),30);if(tab==='frames')refreshFrames();}
function tile({label,iconName,thumb,on,selected,action,color,onTap,aria,badge,mods}){
 const b=el('button','tile'+(on?' on':'')+(selected?' selected':'')+(action?' action':'')+(color?' '+color:''));b.type='button';b.setAttribute('aria-label',aria||label);if(on!==undefined)b.setAttribute('aria-pressed',String(!!on));
 const t=el('div','thumb');if(thumb)t.append(thumb);else if(iconName)t.append(icon(iconName));if(badge)t.append(el('span','badge',badge));if(mods)t.append(el('span','mods-dot'));b.append(t,el('span','label',label));b.addEventListener('click',onTap);return b;
}
function renderStrip(){
 const strip=$('strip'),keep=strip.scrollLeft;strip.replaceChildren();
 ({effects:stripEffects,draw:stripDraw,frames:stripFrames,looks:stripLooks,motion:stripMotion})[tab](strip);
 strip.scrollLeft=keep;
}
function refreshUI(){renderStrip();if(drawerOpen)renderDrawer();}
function openDrawer(mode){drawerMode=mode;drawerOpen=true;renderDrawer();}
function closeDrawer(rerender=true){drawerOpen=false;drawerMode=null;$('drawer').hidden=true;$('drawer').replaceChildren();requestAnimationFrame(fitCanvas);if(rerender)renderStrip();}
function renderDrawer(){
 const d=$('drawer');d.replaceChildren();d.hidden=false;
 const builders={fx:drawerFx,brush:drawerBrush,frame:drawerFrame,anim:drawerAnim,look:drawerLook,motion:drawerMotion};
 (builders[drawerMode]||(()=>closeDrawer()))(d);requestAnimationFrame(fitCanvas);
}
function head(d,title,tag,extra=[]){const h=el('div','d-head'),t=el('div','d-title');t.append(el('b',null,title));if(tag)t.append(el('small',null,tag));const close=el('button','tb-btn icon');close.type='button';close.setAttribute('aria-label','Close controls');close.append(icon('close'));close.addEventListener('click',()=>closeDrawer());h.append(t,...extra,close);d.append(h);return h;}
function slider({label,value,min=0,max=1,step=.01,format=v=>Math.round(v*100)+'%',onInput,onChange,id}){
 const w=el('div','slider'),l=el('label',null,label),o=el('output',null,format(value)),i=el('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=value;i.id=id||('s'+Math.random().toString(36).slice(2,8));l.htmlFor=i.id;
 i.addEventListener('input',()=>{const v=Number(i.value);o.textContent=format(v);onInput?.(v);});i.addEventListener('change',()=>onChange?.(Number(i.value)));w.append(l,o,i);return w;
}
function select({label,options,value,onChange}){const w=el('div','slider'),l=el('label',null,label),s=el('select');s.id='q'+Math.random().toString(36).slice(2,8);l.htmlFor=s.id;for(const [v,t]of options){const o=el('option',null,t);o.value=String(v);s.append(o);}s.value=String(value);s.addEventListener('change',()=>onChange(s.value));w.append(l,el('output'),s);return w;}
function button(label,iconName,onTap,cls=''){const b=el('button','tb-btn '+cls);b.type='button';if(iconName)b.append(icon(iconName));b.append(el('span',null,label));b.addEventListener('click',onTap);return b;}
function chip(label,onTap,on=false){const b=el('button','chip'+(on?' on':''),label);b.type='button';b.addEventListener('click',onTap);return b;}
function label(text,right){const l=el('div','section-label');l.append(el('span',null,text));if(right)l.append(right);return l;}

// Effects
function stripEffects(strip){
 for(const e of stack){const def=DEFS.get(e.id);let c=thumbCanvases.get(e.id);if(!c){c=document.createElement('canvas');c.width=96;c.height=114;thumbCanvases.set(e.id,c);}
  strip.append(tile({label:def.name,thumb:c,on:e.enabled,selected:selectedFx===e.id,mods:e.mods?.length>0,aria:def.name+(e.enabled?' on':' off'),onTap:()=>tapEffect(e.id)}));}
}
function tapEffect(id){
 const e=stack.find(x=>x.id===id);
 if(selectedFx!==id){selectedFx=id;if(!e.enabled){e.enabled=true;renderer.clearHistory();commit();}openDrawer('fx');renderStrip();return;}
 if(drawerOpen&&drawerMode==='fx')closeDrawer();else{openDrawer('fx');renderStrip();}
}
function drawerFx(d){
 const e=stack.find(x=>x.id===selectedFx);if(!e)return closeDrawer();const def=DEFS.get(e.id),index=stack.indexOf(e);
 const power=el('button','switch',e.enabled?'ON':'OFF');power.type='button';power.setAttribute('aria-pressed',String(e.enabled));power.setAttribute('aria-label','Effect on or off');
 power.addEventListener('click',()=>{e.enabled=!e.enabled;renderer.clearHistory();commit();renderStrip();renderDrawer();});
 const reset=el('button','tb-btn icon');reset.type='button';reset.setAttribute('aria-label','Reset effect');reset.append(icon('reset'));
 reset.addEventListener('click',()=>{e.intensity=1;e.values=def.params.map(p=>p.value);e.mods=[];commit();updateThumbs(e.id);renderStrip();renderDrawer();note(def.name+' reset');});
 head(d,def.name,def.tag,[reset,power]);
 const live=()=>{saveSession();};
 d.append(slider({label:'Intensity',value:e.intensity,onInput:v=>{e.intensity=v;live();},onChange:()=>{commit();updateThumbs(e.id);}}));
 def.params.forEach((p,i)=>{
  if(p.options)d.append(select({label:p.name,options:p.options.map((o,n)=>[n,o]),value:Math.round(e.values[i]*(p.max||1)),onChange:v=>{e.values[i]=Number(v)/(p.max||1);commit();updateThumbs(e.id);}}));
  else d.append(slider({label:p.name,value:e.values[i],format:v=>formatParam(p,v),onInput:v=>{e.values[i]=v;live();},onChange:()=>{commit();updateThumbs(e.id);}}));
 });
 // Presets
 const presetRow=el('div','row');
 const apply=p=>{e.intensity=p.intensity;e.values=p.values.slice();e.enabled=true;commit();updateThumbs(e.id);renderStrip();renderDrawer();};
 for(const p of builtinFx(def))presetRow.append(chip(p.name,()=>apply(p)));
 for(const [n,p]of (fxStore[e.id]||[]).entries()){const c=chip('★ '+p.name,()=>apply(p));presetRow.append(c);}
 const savePreset=chip('+ Save',()=>{const list=fxStore[e.id]||(fxStore[e.id]=[]);if(list.length>=12){note('12 saved presets max for this effect. Clear some first.',true);return;}list.push({name:'Mine '+(list.length+1),intensity:e.intensity,values:e.values.slice()});try{writeFx(store,fxStore);note('Preset saved');}catch{note('Storage is full.',true);}renderDrawer();});
 presetRow.append(savePreset);
 if(fxStore[e.id]?.length)presetRow.append(chip('Clear saved',()=>{delete fxStore[e.id];try{writeFx(store,fxStore);}catch{}renderDrawer();}));
 d.append(label('Presets'),presetRow);
 // Modulation
 const add=chip('+ Add',()=>{if(e.mods.length>=MAX_MODS)return note('Up to '+MAX_MODS+' motions per effect.',true);e.mods.push(normalizeMods([{target:def.params[0]?.options?-1:0,source:audioMode==='none'?'lfo':'level'}],def.params.length)[0]);commit();renderStrip();renderDrawer();});
 d.append(label('Motion (LFO · tempo · audio)',add));
 const targets=[[-1,'Intensity'],...def.params.map((p,i)=>[i,p.name])];
 e.mods.forEach((m,mi)=>{
  const box=el('div','mod'),grid=el('div','mod-grid');
  grid.append(select({label:'Moves',options:targets,value:m.target,onChange:v=>{m.target=Number(v);commit();}}));
  grid.append(select({label:'Driven by',options:SOURCES,value:m.source,onChange:v=>{m.source=v;commit();renderDrawer();}}));
  if(m.source==='lfo'||m.source==='bpm')grid.append(select({label:'Shape',options:SHAPES,value:m.shape,onChange:v=>{m.shape=v;commit();}}));
  if(m.source==='bpm')grid.append(select({label:'Rate',options:DIVISION_LABELS.map((t,i)=>[i,t]),value:m.division,onChange:v=>{m.division=Number(v);commit();}}));
  if(m.source==='lfo')grid.append(slider({label:'Speed',value:m.rate,format:v=>(.05*Math.pow(160,v)).toFixed(2)+' Hz',onInput:v=>{m.rate=v;},onChange:commit}));
  grid.append(slider({label:'Depth',value:m.depth,onInput:v=>{m.depth=v;},onChange:commit}));
  const rm=chip('Remove',()=>{e.mods.splice(mi,1);commit();renderStrip();renderDrawer();});
  box.append(grid,rm);d.append(box);
 });
 if(e.mods.some(m=>['level','low','mid','high','beat'].includes(m.source))&&audioMode==='none')d.append(el('p','section-label','Audio motion needs a sound source: Motion tab → Mic or Clip.'));
 // Order
 const order=el('div','row');
 order.append(chip('◀ Earlier',()=>{if(index>0){stack=moveEffect(stack,index,-1);renderer.clearHistory();commit();renderStrip();renderDrawer();}}),chip('Later ▶',()=>{if(index<stack.length-1){stack=moveEffect(stack,index,1);renderer.clearHistory();commit();renderStrip();renderDrawer();}}),el('span','section-label','Chain position '+(index+1)+' / '+stack.length));
 d.append(label('Order'),order);
}

// Draw
const BRUSHES=[['pen','Brush','pen'],['neon','Neon','neon'],['marker','Marker','marker'],['spray','Spray','spray'],['eraser','Eraser','eraser']];
const SWATCHES=['#ff2b3d','#2f6cff','#8c3dff','#27e889','#ff7a1a','#00d5ff','#ffffff','#000000'];
function stripDraw(strip){
 const s=drawing.model.settings;
 for(const [id,name,ic]of BRUSHES)strip.append(tile({label:name,iconName:ic,selected:s.brush===id,on:s.brush===id,onTap:()=>{if(s.brush===id){drawerOpen&&drawerMode==='brush'?closeDrawer():openDrawer('brush');}else{s.brush=id;saveSession();renderStrip();if(drawerOpen)renderDrawer();}}}));
 strip.append(tile({label:'Settings',iconName:'sliders',action:true,onTap:()=>drawerOpen&&drawerMode==='brush'?closeDrawer():openDrawer('brush')}));
 strip.append(el('span','divider'));
 const colors=[...new Set([...SWATCHES,...s.colors])];
 for(const c of colors){const sw=el('span','swatch');sw.style.background=c;strip.append(tile({label:c===s.color?'Color':'',thumb:sw,selected:c===s.color,aria:'Color '+c,onTap:()=>{s.color=c;if(s.brush==='eraser')s.brush='pen';saveSession();renderStrip();}}));}
 strip.append(tile({label:'Custom',iconName:'plus',action:true,onTap:()=>openDrawer('brush')}));
 strip.append(el('span','divider'));
 strip.append(tile({label:'Clear ink',iconName:'trash',action:true,color:'red',onTap:()=>{if(!drawing.model.strokes.length)return note('No ink to clear');drawing.model.strokes=[];drawing.model.current=null;drawing.model.revision++;drawing.baseKey='';commit();note('Ink cleared · Undo to restore');}}));
}
function drawerBrush(d){
 const s=drawing.model.settings,name=BRUSHES.find(b=>b[0]===s.brush)?.[1]||'Brush';
 head(d,name,'DRAW ON THE PREVIEW');
 d.append(slider({label:'Size',value:s.size,min:1,max:80,step:1,format:v=>Math.round(v)+' px',onInput:v=>{s.size=v;},onChange:saveSession}));
 d.append(slider({label:'Opacity',value:s.opacity,onInput:v=>{s.opacity=v;},onChange:saveSession}));
 const colorRow=el('div','row'),ci=el('input');ci.type='color';ci.value=s.color;ci.setAttribute('aria-label','Pick any color');
 ci.addEventListener('input',()=>{s.color=ci.value.toLowerCase();});ci.addEventListener('change',()=>{s.color=ci.value.toLowerCase();if(!s.colors.includes(s.color)&&!SWATCHES.includes(s.color)){s.colors=[s.color,...s.colors].slice(0,12);}saveSession();renderStrip();});
 colorRow.append(ci,el('span','section-label','Tap to pick any color'));d.append(label('Color'),colorRow);
 const layer=el('div','row');for(const [v,t]of [['top','Over effects'],['under','Under effects']])layer.append(chip(t,()=>{s.placement=v;saveSession();renderDrawer();},s.placement===v));
 d.append(label('Ink layer'),layer);
 const fade=el('div','row');for(const [v,t]of [['off','Stays'],['fade','Fades'],['trail','Trails']])fade.append(chip(t,()=>{s.fadeMode=v;drawing.resetFade();saveSession();renderDrawer();},s.fadeMode===v));
 d.append(label('Ink life'),fade);
 if(s.fadeMode!=='off')d.append(slider({label:'Fade time',value:s.fadeSeconds,min:.5,max:30,step:.5,format:v=>v.toFixed(1)+' s',onInput:v=>{s.fadeSeconds=v;},onChange:saveSession}));
 d.append(slider({label:'Pulse with sound',value:s.pulse,onInput:v=>{s.pulse=v;},onChange:saveSession}));
}

// Frames
async function refreshFrames(){try{frameList=await frames.list();}catch{frameList=[];}for(const [id,url]of thumbURLs)if(!frameList.some(f=>f.id===id)){URL.revokeObjectURL(url);thumbURLs.delete(id);}if(tab==='frames')renderStrip();if(drawerOpen&&(drawerMode==='frame'))renderDrawer();}
const frameURL=f=>{let u=thumbURLs.get(f.id);if(!u){u=URL.createObjectURL(f.blob);thumbURLs.set(f.id,u);}return u;};
function canvasBlob(){return new Promise((ok,bad)=>canvas.toBlob(b=>b?ok(b):bad(new Error('Could not read the frame. Try again.')),'image/png'));}
const captureFrame=safe(async()=>{const blob=await canvasBlob();await frames.add({blob,width:canvas.width,height:canvas.height});await refreshFrames();note('Frame '+frameList.length+' saved'+(frames.persistent?'':' (this session only)'));const strip=$('strip');if(tab==='frames')strip.scrollLeft=strip.scrollWidth;});
function stripFrames(strip){
 strip.append(tile({label:'Capture',iconName:'plus',action:true,color:'red',onTap:captureFrame,aria:'Capture current frame'}));
 strip.append(tile({label:'Share all',iconName:'share',action:true,color:'blue',onTap:shareAll}));
 strip.append(tile({label:'ZIP',iconName:'zip',action:true,color:'blue',onTap:exportZip}));
 strip.append(tile({label:'Animate',iconName:'film',action:true,color:'blue',onTap:()=>openDrawer('anim')}));
 strip.append(el('span','divider'));
 if(!frameList.length)strip.append(el('span','empty','No frames yet. Tap Capture.'));
 frameList.forEach((f,i)=>{const img=el('img');img.alt='';img.src=frameURL(f);img.decoding='async';strip.append(tile({label:'#'+(i+1),thumb:img,selected:selectedFrame===f.id,aria:'Frame '+(i+1),onTap:()=>{if(selectedFrame===f.id&&drawerOpen)closeDrawer();else{selectedFrame=f.id;openDrawer('frame');renderStrip();}}}));});
 if(frameList.length)strip.append(tile({label:'Delete all',iconName:'trash',action:true,color:'red',onTap:()=>openSheet('Delete all frames?',b=>{b.append(el('p',null,frameList.length+' frames will be removed from this device. This cannot be undone.'),button('Delete all frames','trash',safe(async()=>{await frames.clear();selectedFrame=null;closeSheet();closeDrawer(false);await refreshFrames();note('Frames deleted');}),'danger'),button('Keep them','close',closeSheet));})}));
}
function drawerFrame(d){
 const i=frameList.findIndex(f=>f.id===selectedFrame),f=frameList[i];if(!f)return closeDrawer();
 head(d,'Frame '+(i+1)+' of '+frameList.length,f.width+' × '+f.height+' PNG');
 const panel=el('div','frame-panel'),img=el('img','preview-img');img.alt='Captured frame '+(i+1);img.src=frameURL(f);
 const row=el('div','frame-actions'),mv=async delta=>{const next=moveFrame(frameList,f.id,delta);await frames.saveOrder(next);await refreshFrames();};
 row.append(button('Share','share',safe(()=>saveBlob(f.blob,'pixelpusher-frame-'+String(i+1).padStart(3,'0')+'.png')),'accent'));
 row.append(button('Use as source','image',()=>useBlob(f.blob),'blue'));
 const earlier=button('Earlier','left',safe(()=>mv(-1))),later=button('Later','right',safe(()=>mv(1)));earlier.disabled=i===0;later.disabled=i===frameList.length-1;row.append(earlier,later);
 row.append(button('Delete','trash',safe(async()=>{await frames.remove(f.id);selectedFrame=null;closeDrawer(false);await refreshFrames();note('Frame deleted');}),'danger'));
 panel.append(img,row);d.append(panel);
}
const filesFor=()=>frameList.map((f,i)=>({name:'pixelpusher-frame-'+String(i+1).padStart(3,'0')+'.png',blob:f.blob}));
const shareAll=safe(async()=>{
 if(!frameList.length)return note('Capture some frames first.');
 const files=filesFor().map(x=>new File([x.blob],x.name,{type:'image/png'}));
 if(navigator.canShare?.({files})){try{await navigator.share({files,title:'Pixel Pusher frames'});return;}catch(e){if(e?.name==='AbortError')return;}}
 await exportZip();
});
const exportZip=safe(async()=>{
 if(!frameList.length)return note('Capture some frames first.');
 note('Packing '+frameList.length+' frames…');
 const entries=[];for(const x of filesFor())entries.push({name:x.name,bytes:new Uint8Array(await x.blob.arrayBuffer())});
 const blob=new Blob([buildZip(entries)],{type:'application/zip'}),name='pixelpusher-frames-'+stamp()+'.zip';
 readyToSave(blob,name,'ZIP ready',(blob.size/1048576).toFixed(1)+' MB · '+entries.length+' PNG frames');
});
function drawerAnim(d){
 head(d,'Animate frames','VIDEO FROM YOUR FRAME LIST');
 d.append(slider({label:'Speed',value:animFps,min:1,max:30,step:1,format:v=>Math.round(v)+' fps',onInput:v=>{animFps=v;}}));
 d.append(slider({label:'Loops',value:animLoops,min:1,max:6,step:1,format:v=>Math.round(v)+'×',onInput:v=>{animLoops=v;}}));
 d.append(el('p','section-label',frameList.length+' frames · about '+(frameList.length*animLoops/animFps).toFixed(1)+' s'));
 d.append(button('Build video','film',buildAnimation,'accent'));
}
const buildAnimation=safe(async()=>{
 if(frameList.length<2)return note('Capture at least 2 frames to animate.',true);
 if(typeof MediaRecorder==='undefined')throw new Error('Video export is not available in this browser. Use ZIP instead.');
 const mime=recordingMime(),first=frameList[0],k=Math.min(1,1280/Math.max(first.width,first.height));
 const c=document.createElement('canvas');c.width=Math.round(first.width*k/2)*2;c.height=Math.round(first.height*k/2)*2;const x=c.getContext('2d');
 const bitmaps=[];for(const f of frameList)bitmaps.push(await createImageBitmap(f.blob));
 const draw=b=>{const s=Math.min(c.width/b.width,c.height/b.height);x.fillStyle='#000';x.fillRect(0,0,c.width,c.height);x.drawImage(b,(c.width-b.width*s)/2,(c.height-b.height*s)/2,b.width*s,b.height*s);};
 draw(bitmaps[0]);const stream=c.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6e6});
 rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise(ok=>rec.onstop=ok);
 note('Building video…');rec.start(500);const step=1000/animFps;
 // Redraw at ~30 fps so every player sees a constant-rate stream, not only frame changes.
 for(let l=0;l<animLoops;l++)for(const b of bitmaps){const until=performance.now()+step;do{draw(b);await new Promise(r=>setTimeout(r,Math.min(33,Math.max(1,until-performance.now()))));}while(performance.now()<until-1);}
 rec.stop();await done;stream.getTracks().forEach(t=>t.stop());bitmaps.forEach(b=>b.close?.());
 const blob=new Blob(chunks,{type:rec.mimeType||mime});if(!blob.size)throw new Error('No video was produced. Keep the app open while it builds.');
 readyToSave(blob,'pixelpusher-animation-'+stamp()+(blob.type.includes('mp4')?'.mp4':'.webm'),'Video ready',(blob.size/1048576).toFixed(1)+' MB');
});

// Looks
const NEW_LOOKS=[['Night broadcast',{scan:[.5,.55,.55,.35],grain:[.35,.2,.3,.6],rgb:[.12,.1]}],['Mosh bloom',{mosh:[.82,.4,.25,.6],rgb:[.18,.3]}],['Cold signal',{vhs:[.3,.4,.2,.5],scan:[.3,.35,.5,.3],hue:[.6,0,.6]}]];
const builtins=()=>[...PRESETS.filter(p=>!p.shader),...NEW_LOOKS.map(([name,cfg])=>({name,stack:defaultStack().map(e=>({...e,enabled:!!cfg[e.id],values:e.values.map((v,i)=>cfg[e.id]?.[i]??v)}))}))];
function loadLook(p){setStack(p.stack);renderer.clearHistory();commit();setTimeout(()=>updateThumbs(),30);note(p.name);}
function stripLooks(strip){
 strip.append(tile({label:'Save look',iconName:'plus',action:true,color:'red',onTap:()=>{if(userLooks.length>=60)return note('60 looks max. Delete one first.',true);userLooks.push({name:'Look '+(userLooks.length+1),stack:structuredClone(stack)});saveLooks();renderStrip();note('Look saved');}}));
 strip.append(tile({label:'Shuffle',iconName:'shuffle',action:true,color:'blue',onTap:()=>{setStack(randomizeStack(stack).map((e,i)=>({...e,mods:stack[i]?.mods||[]})));renderer.clearHistory();commit();updateThumbs();renderStrip();}}));
 strip.append(tile({label:'All off',iconName:'power',action:true,onTap:()=>{for(const e of stack)e.enabled=false;commit();renderStrip();}}));
 strip.append(el('span','divider'));
 userLooks.forEach((p,i)=>strip.append(tile({label:p.name,thumb:lookThumb(p),on:selectedLook===i,badge:'★',onTap:()=>{if(selectedLook===i){openDrawer('look');}else{selectedLook=i;loadLook(p);renderStrip();}}})));
 for(const p of builtins())strip.append(tile({label:p.name,thumb:lookThumb(p),onTap:()=>{selectedLook=null;loadLook(p);renderStrip();}}));
 for(const p of legacyLooks)strip.append(tile({label:p.name,thumb:lookThumb(p),badge:'1.5',onTap:()=>{selectedLook=null;loadLook(p);}}));
}
function drawerLook(d){
 const p=userLooks[selectedLook];if(!p)return closeDrawer();head(d,p.name,'SAVED LOOK');
 const w=el('div','slider'),l=el('label',null,'Name'),i=el('input');i.type='text';i.maxLength=40;i.value=p.name;i.id='look-name';l.htmlFor=i.id;i.addEventListener('change',()=>{p.name=i.value.trim().slice(0,40)||p.name;saveLooks();renderStrip();renderDrawer();});w.append(l,el('output'),i);d.append(w);
 const row=el('div','row');row.append(button('Update with current','check',()=>{p.stack=structuredClone(stack);saveLooks();note('Look updated');},'blue'),button('Delete','trash',()=>{userLooks.splice(selectedLook,1);selectedLook=null;saveLooks();closeDrawer();},'danger'));d.append(row);
}

// Motion
async function setAudio(mode){try{await audio.configure(mode);audioMode=mode;note(mode==='none'?'Audio off':mode==='mic'?'Mic listening (never recorded unless you record)':mode==='video'?'Clip audio':'Mic + clip');}catch(e){note(e.message||'Audio unavailable.',true);}renderStrip();}
function stripMotion(strip){
 for(const [m,t,ic]of [['none','Audio off','mute'],['mic','Mic','mic'],['video','Clip audio','clip'],['mix','Mic + clip','wave']])strip.append(tile({label:t,iconName:ic,on:audioMode===m,selected:audioMode===m,onTap:()=>setAudio(m)}));
 strip.append(el('span','divider'));
 strip.append(tile({label:'Tap tempo',iconName:'tap',badge:Math.round(beatClock.bpm)+'',action:true,color:'blue',onTap:()=>{const now=performance.now();beatClock.tap(now);beatOrigin=now;renderStrip();}}));
 strip.append(tile({label:frozen?'Frozen':'Freeze',iconName:'freeze',on:frozen,onTap:()=>{frozen=!frozen;renderStrip();}}));
 strip.append(tile({label:'Settings',iconName:'sliders',action:true,onTap:()=>drawerOpen?closeDrawer():openDrawer('motion')}));
}
function drawerMotion(d){
 head(d,'Motion settings','AUDIO · TEMPO · QUALITY');
 d.append(slider({label:'Audio sensitivity',value:sensitivity,min:.5,max:4,step:.1,format:v=>v.toFixed(1)+'×',onInput:v=>{sensitivity=v;},onChange:saveSession}));
 d.append(slider({label:'Tempo',value:beatClock.bpm,min:40,max:240,step:1,format:v=>Math.round(v)+' BPM',onInput:v=>{beatClock.bpm=v;beatClock.manual=true;},onChange:()=>renderStrip()}));
 const q=el('div','row');q.append(el('span','section-label','Render scale '+Math.round(quality.scale*100)+'% (auto adjusts to keep it smooth)'));d.append(q);
 const cam=el('div','row');cam.append(button('Flip camera','flip',()=>{facing=facing==='user'?'environment':'user';if(sourceKind==='camera')useCamera();else note('Camera not active');}));d.append(cam);
}

// ---------- Sheets (source, save, ready-to-save) ----------
function openSheet(title,build){$('sheet-title').textContent=title;const b=$('sheet-body');b.replaceChildren();build(b);$('sheet').hidden=false;}
function closeSheet(){$('sheet').hidden=true;$('sheet-body').replaceChildren();}
function readyToSave(blob,name,title,detail){openSheet(title,b=>{b.append(el('p',null,name+' · '+detail),button('Save / Share','share',safe(async()=>{const r=await saveBlob(blob,name);if(r!=='cancelled')closeSheet();}),'accent'),button('Close','close',closeSheet));});}
function sourceSheet(){openSheet('Source',b=>{
 b.append(button('Camera','source',()=>{closeSheet();useCamera();},'blue'),button('Flip camera','flip',()=>{facing=facing==='user'?'environment':'user';closeSheet();useCamera();}),button('Photo or video','image',()=>{closeSheet();$('file').click();}),button('Demo pattern','grid',()=>{closeSheet();useDemo();}));
 b.append(el('p',null,'Everything stays on this device. Nothing is uploaded.'));
});}
let pendingPNG=null;
function saveSheet(){
 const prep=canvasBlob().then(b=>pendingPNG=b).catch(()=>pendingPNG=null);
 openSheet('Save',b=>{
  const img=el('img','preview-img');img.alt='Current frame';prep.then(()=>{if(pendingPNG)img.src=URL.createObjectURL(pendingPNG);});img.addEventListener('load',()=>setTimeout(()=>URL.revokeObjectURL(img.src),1000),{once:true});b.append(img);
  b.append(button('Save / Share PNG','share',safe(async()=>{await prep;if(!pendingPNG)throw new Error('Frame not ready. Try again.');const r=await saveBlob(pendingPNG,'pixelpusher-'+stamp()+'.png');if(r!=='cancelled'){closeSheet();note(r==='downloaded'?'PNG downloaded':'Saved');}}),'accent'));
  b.append(button('Add to frames','frame',safe(async()=>{await prep;if(!pendingPNG)return;await frames.add({blob:pendingPNG,width:canvas.width,height:canvas.height});await refreshFrames();closeSheet();note('Added to frames ('+frameList.length+')');}),'blue'));
  b.append(button(capture?.active?'Stop recording':'Record video','record',()=>{closeSheet();toggleRecord();}));
  b.append(el('p',null,canvas.width+' × '+canvas.height+' · drawn ink and all active effects included.'));
 });
}
function toggleRecord(){
 if(capture?.active){capture.stop('user');return;}
 capture=new Capture(canvas,{onTick:s=>{$('rec-badge').textContent='REC '+Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');},onFinish:({blob,duration})=>{$('rec-badge').hidden=true;readyToSave(blob,'pixelpusher-'+stamp()+(blob.type.includes('mp4')?'.mp4':'.webm'),'Recording ready',duration.toFixed(1)+' s · '+(blob.size/1048576).toFixed(1)+' MB');},onError:e=>{$('rec-badge').hidden=true;note(e.message,true);}});
 try{capture.start({audioTracks:audio.tracks(),seconds:180});$('rec-badge').hidden=false;$('rec-badge').textContent='REC 0:00';}catch(e){note(e.message,true);}
}

// ---------- Preview gestures: draw, hold-to-compare, drag-to-adjust ----------
function bindStage(){
 let pointer=null,holdTimer=0,start=null,base=null;
 const norm=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
 const pressure=e=>e.pointerType==='pen'||e.pressure&&e.pressure!==.5?e.pressure:.6;
 canvas.addEventListener('pointerdown',e=>{
  if(pointer!==null)return;pointer=e.pointerId;canvas.setPointerCapture?.(e.pointerId);const [x,y]=norm(e);
  if(tab==='draw'){drawing.model.begin(x,y,pressure(e),performance.now()/1000);return;}
  start=[e.clientX,e.clientY];const fx=stack.find(s=>s.id===selectedFx&&s.enabled);base=fx?[fx.values[0],fx.values[1]]:null;
  holdTimer=setTimeout(()=>{compare=true;hud('Original');},260);
 });
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  if(tab==='draw'){const list=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const p of list.length?list:[e]){const [x,y]=norm(p);drawing.model.point(x,y,pressure(p),performance.now()/1000);}return;}
  if(!start)return;const dx=e.clientX-start[0],dy=e.clientY-start[1];
  if(!compare&&Math.hypot(dx,dy)>10){clearTimeout(holdTimer);const fx=stack.find(s=>s.id===selectedFx&&s.enabled);if(!fx||!base)return;const def=DEFS.get(fx.id),r=canvas.getBoundingClientRect();
   const p0=def.params[0],p1=def.params[1];const parts=[];
   if(p0&&!p0.options){fx.values[0]=Math.min(1,Math.max(0,base[0]+dx/r.width));parts.push(p0.name+' '+formatParam(p0,fx.values[0]));}
   if(p1&&!p1.options){fx.values[1]=Math.min(1,Math.max(0,base[1]-dy/r.height));parts.push(p1.name+' '+formatParam(p1,fx.values[1]));}
   hud(parts.join('  ·  '));fx._dragged=true;}
 });
 const up=e=>{
  if(e.pointerId!==pointer)return;pointer=null;clearTimeout(holdTimer);
  if(tab==='draw'){drawing.model.end();commit();return;}
  if(compare){compare=false;}
  const fx=stack.find(s=>s._dragged);if(fx){delete fx._dragged;commit();if(drawerOpen&&drawerMode==='fx')renderDrawer();updateThumbs(fx.id);}
  start=null;hud(null);
 };
 canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
}
let hudTimer;function hud(text){const h=$('hud');clearTimeout(hudTimer);if(!text){hudTimer=setTimeout(()=>h.hidden=true,500);return;}h.textContent=text;h.hidden=false;}

// ---------- Native-like behaviour: no pinch zoom, no double-tap zoom, no bounce ----------
function nativeFeel(){
 for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
 // Double-tap zoom is disabled by touch-action:manipulation, so quick repeated taps still register.
 document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();else if(!e.target.closest('.strip,.drawer,.sheet,input[type=range]'))e.preventDefault();},{passive:false});
 document.addEventListener('contextmenu',e=>{if(e.target===canvas)e.preventDefault();});
}

// ---------- Boot ----------
async function boot(){
 drawDemo(0);source=demo;
 const saved=loadSession();setStack(saved?.stack||defaultStack());
 if(saved?.drawing){drawing.model.restore({strokes:[],settings:saved.drawing});}
 if(Number.isFinite(saved?.sensitivity))sensitivity=Math.min(4,Math.max(.5,saved.sensitivity));
 loadLooks();
 try{renderer=new Renderer(canvas);}catch(e){note(e.message||'WebGL is unavailable on this device.',true);return;}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();note('Graphics paused by the system. Reopen the app if the preview stays black.',true);});
 history.reset({...snapshot(),signature:signature()});syncUndo();
 $('btn-undo').addEventListener('click',()=>restore(history.undo()));
 $('btn-redo').addEventListener('click',()=>restore(history.redo()));
 $('btn-save').addEventListener('click',saveSheet);
 $('btn-source').addEventListener('click',sourceSheet);
 $('rec-badge').addEventListener('click',()=>capture?.stop('user'));
 $('sheet-close').addEventListener('click',closeSheet);
 $('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))closeSheet();});
 $('file').addEventListener('change',()=>{const f=$('file').files?.[0];$('file').value='';if(f)useFile(f);});
 for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>setTab(b.dataset.tab));
 new ResizeObserver(()=>fitCanvas()).observe($('stage'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&capture?.active)capture.stop('app hidden');});
 bindStage();nativeFeel();
 await frames.init();refreshFrames();
 ensureSize();fitCanvas();renderStrip();requestAnimationFrame(loop);setTimeout(()=>updateThumbs(),200);
 try{if(!store.getItem('brainhertz.pixelpusher.tip16')){store.setItem('brainhertz.pixelpusher.tip16','1');hud('Hold preview = original  ·  drag = tweak effect');setTimeout(()=>hud(null),3800);}}catch{}
 if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
 globalThis.__pp={get stack(){return stack;},history,drawing,frames,get frameList(){return frameList;},setTab,tapEffect,captureFrame,refreshFrames,buildZip,version:VERSION};
}
boot();
