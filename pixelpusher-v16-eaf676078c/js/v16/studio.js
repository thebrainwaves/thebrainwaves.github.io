// Pixel Pusher 1.6.5 studio shell. Original Brainhertz Productions code; on-device only.
import {EFFECTS,PRESETS,defaultStack,sanitizeStack,moveEffect,randomizeStack,QualityController,BeatClock,normalizePreset} from '../core.js';
import {formatParam} from '../effects.js';
import {Renderer} from '../gpu.js';
import {AudioEngine} from '../audio.js';
import {Capture,recordingMime} from '../recorder.js';
import {decodePhoto,fileKind} from '../photo-source.js';
import {DrawingLayer} from '../drawing-layer.js';
import {readPresets} from '../storage.js';
import {SnapshotHistory} from './history.js';
import {SOURCES,SHAPES,DIVISION_LABELS,MAX_MODS,normalizeMods,applyMods,LFO_COUNT,LFO_DIV_LABELS,defaultLfos,normalizeLfos,stepLfos,lfoLabel,isGlobalLfo,wave,lfoRate} from './modulation.js';
import {FrameStore,moveFrame} from './frames-store.js';
import {buildZip} from './zip.js';
import {saveBlob,stamp} from './share.js';
import {builtinFx,readFx,writeFx} from './fx-presets.js';
import {FxPaint} from './fx-paint.js';
import {FingerPerformer,TOUCH_KEYS} from './perform.js';
import {bindXY} from '../touch.js';
import {SOURCES as GEN_SOURCES,SOURCE_BY_ID as GEN_BY_ID,genParams,defaultGen,normalizeGen,cleanText,speedFactor,MAX_TEXT,MAX_TEXT_LINES,TEXT_FONTS,TEXT_ALIGNS,textSpec} from './gen-sources.js';
import {Generator} from './generator.js';

export const VERSION='1.6.5';
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
const fxPaint=new FxPaint(),fxBrush={on:false,erase:false,effect:'rgb',size:48,strength:1};
let generator=null,gen=defaultGen('tunnel'),genOut={values:new Array(6).fill(0)},genTime=0,genLast=0,genGrid=false,performSource=false,genThumbAt=0,genThumbIndex=0;const genThumbs=new Map(),libThumbs=new Map();
// Global LFOs (1.6.4): 4 shared LFOs any slider can be assigned to in one tap.
let lfos=defaultLfos(),activeLfo=0;const lfoAcc=[],liveSliders=[],modTmp={values:new Array(8).fill(0)};
const drawOwner={id:'draw',intensity:1,values:[1,0,0],mods:[]},fxbOwner={id:'fxbrush',intensity:1,values:[0,0],mods:[]};
let touchAll=false,momentary=false,touchFreeze=false,performer=null;
const FEEDBACK=['smear','trails','slit','beat','mosh'];

// Original procedural demo input (no external asset).
const demo=document.createElement('canvas');demo.width=720;demo.height=960;
function drawDemo(t){
 const c=demo.getContext('2d'),W=720,H=960;const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0a1238');g.addColorStop(.55,'#0a0a24');g.addColorStop(1,'#04060f');c.fillStyle=g;c.fillRect(0,0,W,H);
 c.save();c.translate(W/2,H*.46);c.rotate(Math.sin(t*.25)*.08);
 for(let i=14;i>0;i--){const w=40+i*30,h=30+i*38;c.strokeStyle=['#ff2b3d','#2f6cff','#6e3bff'][i%3];c.lineWidth=i%4===0?7:2;c.strokeRect(-w/2+Math.sin(i*.7+t*.6)*16,-h/2,w,h);}
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
const signature=()=>JSON.stringify(stack.map(e=>[e.id,e.enabled,e.intensity,e.values,e.mods,e.touch]))+'|'+JSON.stringify(gen)+'|'+drawing.model.strokes.map(s=>s.seed).join(',')+'|'+fxPaint.strokes.map(s=>s.id).join(',')+'|'+JSON.stringify([lfos,drawOwner.mods,fxbOwner.mods]);
function snapshot(){return {stack:structuredClone(stack),strokes:drawing.model.strokes.slice(),fxStrokes:fxPaint.strokes.slice(),gen:structuredClone(gen),lfos:structuredClone(lfos),drawMods:structuredClone(drawOwner.mods),fxbMods:structuredClone(fxbOwner.mods)};}
function commit(){if(history.push(snapshot(),signature()))saveSession();syncUndo();}
function restore(entry){if(!entry)return;stack=structuredClone(entry.stack);drawing.model.current=null;drawing.model.strokes=entry.strokes.slice();drawing.model.revision++;drawing.baseKey='';fxPaint.set(entry.fxStrokes||[]);if(entry.gen){const before=gen.id;gen=structuredClone(entry.gen);if(sourceKind==='gen'&&before!==gen.id)renderer?.clearHistory();}if(entry.lfos)lfos=structuredClone(entry.lfos);if(entry.drawMods)drawOwner.mods=structuredClone(entry.drawMods);if(entry.fxbMods)fxbOwner.mods=structuredClone(entry.fxbMods);renderer?.clearHistory();saveSession();refreshUI();syncUndo();}
function syncUndo(){$('btn-undo').disabled=!history.canUndo;$('btn-redo').disabled=!history.canRedo;}
let sessionTimer;
function saveSession(){clearTimeout(sessionTimer);sessionTimer=setTimeout(()=>{try{store.setItem(SESSION_KEY,JSON.stringify({v:VERSION,stack,drawing:drawing.model.settings,sensitivity,gen,genActive:sourceKind==='gen',lfos,drawMods:drawOwner.mods,fxbMods:fxbOwner.mods}));}catch{/* storage full: session continuity only */}},300);}
function loadSession(){try{const raw=store.getItem(SESSION_KEY);if(!raw||raw.length>1e6)return null;return JSON.parse(raw);}catch{return null;}}
function loadLooks(){try{const raw=store.getItem(LOOKS_KEY);const list=raw&&raw.length<4e6?JSON.parse(raw):[];userLooks=(Array.isArray(list)?list:[]).slice(0,60).map(v=>{const p=normalizePreset(v);const g=v&&v.gen?normalizeGen(v.gen,normalizeMods):null;return p?{name:p.name,stack:withMods(p.stack,v.stack),...(g?{gen:g}:{}),...(Array.isArray(v.lfos)?{lfos:normalizeLfos(v.lfos)}:{})}:null;}).filter(Boolean);}catch{userLooks=[];}
 try{legacyLooks=readPresets(store).presets.map(p=>({name:p.name,stack:p.stack,legacy:true}));}catch{legacyLooks=[];}}
function saveLooks(){try{store.setItem(LOOKS_KEY,JSON.stringify(userLooks));}catch{note('Local storage is full. Delete a look first.',true);}}

// ---------- Rendering ----------
function sourceSize(s){return [s.videoWidth||s.naturalWidth||s.width||0,s.videoHeight||s.naturalHeight||s.height||0];}
function targetSize(){const [sw,sh]=sourceSize(source);if(!sw||!sh)return null;const long=Math.round(Math.min(1440,Math.max(sw,sh))*quality.scale),k=long/Math.max(sw,sh);return [Math.max(2,Math.round(sw*k/2)*2),Math.max(2,Math.round(sh*k/2)*2)];}
function fitCanvas(){const stage=$('stage'),r=stage.getBoundingClientRect(),pad=14,aw=Math.max(40,r.width-pad),ah=Math.max(40,r.height-pad),k=Math.min(aw/canvas.width,ah/canvas.height);canvas.style.width=Math.floor(canvas.width*k)+'px';canvas.style.height=Math.floor(canvas.height*k)+'px';}
function ensureSize(){const t=targetSize();if(!t)return false;if(t[0]!==canvas.width||t[1]!==canvas.height){renderer.resize(t[0],t[1]);fitCanvas();}return true;}
const signals={level:0,low:0,mid:0,high:0,beat:0,beats:0,phase:0};
let genEditShown=null;
function syncGenEdit(){const show=sourceKind==='gen'&&gen.id==='text'&&!(drawerOpen&&drawerMode==='gen');if(show!==genEditShown){genEditShown=show;$('gen-edit').hidden=!show;}}
function loop(now){
 syncGenEdit();
 requestAnimationFrame(loop);
 if(!renderer||document.hidden)return;
 const t0=performance.now(),time=now/1000;
 if(sourceKind==='demo')drawDemo(time);
 const dt=genLast?Math.min(.1,Math.max(0,time-genLast)):0;genLast=time;stepLfos(lfos,lfoAcc,dt,signals);
 if(sourceKind==='gen'&&generator){applyMods(gen,genOut,time,signals);genTime+=dt*speedFactor(genOut.values[0]);const [gw,gh]=genSize();generator.resize(gw,gh);generator.render(gen.id,genOut.values,genTime,signals,null,gen.id==='text'?textSpec(gen):null);}
 if((sourceKind==='camera'||sourceKind==='video')&&video.readyState<2)return;
 if(!ensureSize())return;
 const level=audio.level(sensitivity),bands=audio.bands(sensitivity);
 signals.level=level;signals.low=bands.low;signals.mid=bands.mid;signals.high=bands.high;signals.beat=beatClock.update(level,now);
 signals.beats=Math.max(0,now-beatOrigin)/60000*beatClock.bpm;signals.phase=signals.beats%1;
 for(let i=0;i<stack.length;i++){const e=stack[i],r=renderStack[i]||(renderStack[i]={values:new Array(6).fill(0)});r.id=e.id;r.enabled=e.enabled;r.hold=e.hold===true;r.reactive=false;if(e.enabled)applyMods(e,r,time,signals);}
 renderStack.length=stack.length;
 renderer.freeze=frozen||touchFreeze;
 const fxMasks=fxPaint.hasPaint?fxPaint.masks(canvas.width,canvas.height).map(m=>{const i=stack.findIndex(e=>e.id===m.id),e=stack[i];m.values=e?.enabled?renderStack[i].values:(e?.values||[]);return m;}):undefined;
 const w=canvas.width,h=canvas.height,ink=drawing.frame(w,h,time,{...bands,beat:signals.beat,phase:signals.phase});
 if(ink&&drawOwner.mods.some(m=>m.target===0)){syncDrawOwners();applyMods(drawOwner,modTmp,time,signals);drawing.opacity=Math.min(1,Math.max(0,drawing.opacity*modTmp.values[0]/Math.max(.05,drawOwner.values[0])));}
 const under=ink&&drawing.model.settings.placement==='under';
 renderer.render(under?drawing.composite(source,w,h):source,renderStack,time,compare,{beat:signals.beat,phase:signals.phase,ink:under?null:ink,inkOpacity:drawing.opacity,fxMasks});
 if(drawerOpen&&liveSliders.length)updateLiveSliders(time);if(drawerOpen&&drawerMode==='lfo')drawLfoScopes();
 if(quality.update(performance.now()-t0,!!capture?.active))ensureSize();
 if((sourceKind==='camera'||sourceKind==='video'||sourceKind==='gen')&&tab==='effects'&&now-lastThumbs>4000)updateThumbs();
 if(genGrid&&tab==='source'&&generator&&now-genThumbAt>90){genThumbAt=now;renderGenThumbs(3,time);if(sourceKind==='gen'){generator.resize(...genSize());generator.render(gen.id,genOut.values,genTime,signals,null,gen.id==='text'?textSpec(gen):null);}}
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
function sourceChanged(){syncTransport();quality.reset();renderer.clearHistory();ensureSize();fitCanvas();setTimeout(()=>updateThumbs(),120);}
const useDemo=()=>{releaseSource();source=demo;sourceKind='demo';sourceChanged();};
function genSize(){const r=$('stage').getBoundingClientRect(),land=r.width>r.height*1.05,long=Math.round(1280*quality.scale/2)*2,short=Math.round(720*quality.scale/2)*2;return land?[long,short]:[short,long];}
function ensureGenerator(){if(generator)return true;try{generator=new Generator();return true;}catch(e){note(e.message,true);generator=false;return false;}}
function useGen(id,state=null,record=true){if(!ensureGenerator())return;const src=GEN_BY_ID.get(id);if(!src)return;
 if(state)gen=normalizeGen(state,normalizeMods)||defaultGen(id);else if(gen.id!==id){const keep=gen.values[3];gen=defaultGen(id);gen.values[3]=keep;}
 if(!generator.program(id)){note('This source could not start on this device.',true);return;}
 if(sourceKind!=='gen'){releaseSource();}const [gw,gh]=genSize();generator.resize(gw,gh);generator.render(gen.id,gen.values,genTime,signals,null,gen.id==='text'?textSpec(gen):null);source=generator.canvas;sourceKind='gen';sourceChanged();if(record)commit();}
function renderGenThumbs(count,time){for(let n=0;n<count;n++){const s=GEN_SOURCES[genThumbIndex%GEN_SOURCES.length];genThumbIndex++;const outs=[genThumbs.get(s.id),libThumbs.get(s.id)].filter(c=>c&&c.isConnected);if(!outs.length)continue;
 const g=generator.canvas;if(g.width<96||g.height<114)generator.resize(Math.max(96,g.width),Math.max(114,g.height));const v=gen.id===s.id?gen.values:defaultGen(s.id).values.map((x,i)=>i===3?gen.values[3]:x);
 if(generator.render(s.id,v,time,signals,[0,0,96,114],s.id==='text'?textSpec(gen):null))for(const c of outs)c.getContext('2d').drawImage(generator.canvas,0,generator.canvas.height-114,96,114,0,0,96,114);}
 // restore the live frame so the main source never shows a thumbnail corner
 if(sourceKind==='gen')generator.render(gen.id,genOut.values,genTime,signals,null,null);}
const useCamera=safe(async()=>{
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera needs HTTPS and permission.');
 const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},audio:false});
 releaseSource();camera=stream;video.srcObject=stream;video.muted=true;await video.play();source=video;sourceKind='camera';sourceChanged();note(facing==='user'?'Front camera':'Back camera');
});
const useFile=safe(async file=>{setTimeout(()=>tab==='source'&&renderStrip(),900);
 const kind=fileKind(file);if(!kind)throw new Error('Choose a photo or video.');
 if(kind==='image'){const gl=renderer.gl,max=gl.getParameter(gl.MAX_TEXTURE_SIZE);const out=await decodePhoto(file,max);releaseSource();source=out.source;sourceKind='image';sourceChanged();note('Photo loaded');return;}
 releaseSource();sourceURL=URL.createObjectURL(file);video.src=sourceURL;video.loop=true;video.muted=!(audioMode==='video'||audioMode==='mix');
 await new Promise((ok,bad)=>{video.onloadeddata=ok;video.onerror=()=>bad(new Error('This video could not be opened on this device.'));});
 await video.play().catch(()=>{});source=video;sourceKind='video';sourceChanged();note('Video loaded');
});
const useBlob=safe(async blob=>{const out=await decodePhoto(blob,2048);releaseSource();source=out.source;sourceKind='image';sourceChanged();note('Frame is now the source');});

// ---------- Video transport: Play/Pause, Stop (pause + rewind), scrub, loop ----------
const fmtTime=t=>{t=Number.isFinite(t)?Math.max(0,t):0;return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');};
let scrubbing=false;
function syncTransport(){
 const show=sourceKind==='video';$('transport').hidden=!show;$('stage').classList.toggle('has-transport',show);if(!show)return;
 const playing=!video.paused&&!video.ended,b=$('vt-play');b.classList.toggle('playing',playing);b.setAttribute('aria-label',playing?'Pause video':'Play video');b.querySelector('use').setAttribute('href',playing?'#i-pause':'#i-play');
 $('vt-loop').setAttribute('aria-pressed',String(video.loop));syncTime();
}
function syncTime(){if(sourceKind!=='video')return;const d=video.duration;if(!scrubbing)$('vt-scrub').value=String(d>0?Math.round(video.currentTime/d*1000):0);$('vt-time').textContent=fmtTime(video.currentTime)+' / '+fmtTime(d);}
function bindTransport(){
 $('vt-play').addEventListener('click',()=>{if(video.paused||video.ended)video.play().catch(e=>note(e.message||'Video could not play.',true));else{video.pause();syncTransport();}});
 $('vt-stop').addEventListener('click',()=>{video.pause();video.currentTime=0;renderer?.clearHistory();syncTransport();});
 $('vt-loop').addEventListener('click',()=>{video.loop=!video.loop;note(video.loop?'Loop on':'Loop off · plays once');syncTransport();});
 const scrub=$('vt-scrub');scrub.addEventListener('input',()=>{scrubbing=true;const d=video.duration;if(d>0){video.currentTime=Number(scrub.value)/1000*d;$('vt-time').textContent=fmtTime(video.currentTime)+' / '+fmtTime(d);}});
 scrub.addEventListener('change',()=>{scrubbing=false;renderer?.clearHistory();syncTime();});
 for(const t of ['play','pause','ended','loadedmetadata','durationchange'])video.addEventListener(t,syncTransport);video.addEventListener('timeupdate',syncTime);
}

// ---------- UI: tabs, strip, drawer ----------
function setTab(next){if(next!=='source')genGrid=false;tab=next;app.dataset.tab=tab;updatePill();if(tab==='perform')hudFlash('Finger FX: drag 1–2 fingers · pinch · twist · hold = freeze · tap = stutter');for(const b of document.querySelectorAll('.tab'))b.setAttribute('aria-selected',String(b.dataset.tab===tab));closeDrawer(false);renderStrip();if(tab==='effects')setTimeout(()=>updateThumbs(),30);if(tab==='frames')refreshFrames();if(tab==='motion')openDrawer('lfo');}
function tile({label,iconName,thumb,on,selected,action,color,onTap,aria,badge,mods}){
 const b=el('button','tile'+(on?' on':'')+(selected?' selected':'')+(action?' action':'')+(color?' '+color:''));b.type='button';b.setAttribute('aria-label',aria||label);if(on!==undefined)b.setAttribute('aria-pressed',String(!!on));
 const t=el('div','thumb');if(thumb)t.append(thumb);else if(iconName)t.append(icon(iconName));if(badge)t.append(el('span','badge',badge));if(mods)t.append(el('span','mods-dot'));b.append(t,el('span','label',label));b.addEventListener('click',onTap);return b;
}
function renderStrip(){
 syncGenEdit();
 const strip=$('strip'),keep=strip.scrollLeft;strip.replaceChildren();
 ({perform:stripPerform,source:stripSource,effects:stripEffects,draw:stripDraw,frames:stripFrames,looks:stripLooks,motion:stripMotion})[tab](strip);
 strip.scrollLeft=keep;
}
function refreshUI(){renderStrip();if(drawerOpen)renderDrawer();}
function openDrawer(mode){drawerMode=mode;drawerOpen=true;renderDrawer();}
function closeDrawer(rerender=true){$('drawer').dataset.mode='';liveSliders.length=0;lfoScopes.length=0;drawerOpen=false;drawerMode=null;$('drawer').hidden=true;$('drawer').replaceChildren();syncGenEdit();requestAnimationFrame(fitCanvas);if(rerender)renderStrip();}
function renderDrawer(){
 const d=$('drawer'),keep=d.dataset.mode===drawerMode+'|'+selectedFx&&!d.hidden?d.scrollTop:0;d.replaceChildren();d.hidden=false;d.dataset.mode=drawerMode+'|'+selectedFx;liveSliders.length=0;lfoScopes.length=0;
 const builders={lfo:drawerLfo,genlib:drawerGenLib,gen:drawerGen,perform:drawerPerform,fxbrush:drawerFxBrush,fx:drawerFx,brush:drawerBrush,frame:drawerFrame,anim:drawerAnim,look:drawerLook,motion:drawerMotion};
 (builders[drawerMode]||(()=>closeDrawer()))(d);if(keep)d.scrollTop=keep;requestAnimationFrame(fitCanvas);
}
function head(d,title,tag,extra=[]){const h=el('div','d-head'),t=el('div','d-title');t.append(el('b',null,title));if(tag)t.append(el('small',null,tag));const close=el('button','tb-btn icon');close.type='button';close.setAttribute('aria-label','Close controls');close.append(icon('close'));close.addEventListener('click',()=>closeDrawer());h.append(t,...extra,close);d.append(h);return h;}
function slider({label,value,min=0,max=1,step=.01,format=v=>Math.round(v*100)+'%',onInput,onChange,id,lfo}){
 const w=el('div','slider'),l=el('label',null,label),o=el('output',null,format(value)),i=el('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=value;i.id=id||('s'+Math.random().toString(36).slice(2,8));l.htmlFor=i.id;
 i.addEventListener('input',()=>{const v=Number(i.value);o.textContent=format(v);onInput?.(v);});i.addEventListener('change',()=>onChange?.(Number(i.value)));w.append(l,o,i);if(lfo)withLfo(w,label,lfo);return w;
}
function select({label,options,value,onChange,lfo}){const w=el('div','slider'),l=el('label',null,label),s=el('select');s.id='q'+Math.random().toString(36).slice(2,8);l.htmlFor=s.id;for(const [v,t]of options){const o=el('option',null,t);o.value=String(v);s.append(o);}s.value=String(value);s.addEventListener('change',()=>onChange(s.value));w.append(l,el('output'),s);if(lfo)withLfo(w,label,lfo,false);return w;}
// One-tap LFO button beside a control + a moving indicator while the parameter is modulated.
const lfoModOf=(owner,index)=>owner.mods?.find(m=>m.target===index&&isGlobalLfo(m.source));
function toggleLfo(owner,index){const m=lfoModOf(owner,index);if(m){owner.mods.splice(owner.mods.indexOf(m),1);return false;}
 if(owner.mods.length>=MAX_MODS){note('Up to '+MAX_MODS+' motions here. Remove one first.',true);return null;}owner.mods.push({target:index,source:'lfo'+(activeLfo+1),shape:'sine',rate:.4,depth:.5,division:2});return true;}
function withLfo(w,label,{owner,index,after},indicator=true){
 w.classList.add('has-lfo');const b=el('button','lfo-btn');b.type='button';const m=lfoModOf(owner,index);b.textContent=m?'LFO '+m.source.slice(3):'LFO';b.classList.toggle('on',!!m);b.setAttribute('aria-pressed',String(!!m));b.setAttribute('aria-label','LFO on '+label);
 b.addEventListener('click',()=>{const r=toggleLfo(owner,index);if(r===null)return;if(owner.id&&stack.includes(owner)&&r&&!owner.enabled){owner.enabled=true;renderer?.clearHistory();}commit();note(r?label+' → LFO '+(activeLfo+1):'LFO off: '+label);renderStrip();after?after():renderDrawer();});
 w.append(b);if(!indicator)return;const ind=el('span','lfo-ind'),dot=el('i');ind.append(dot);ind.hidden=true;w.append(ind);liveSliders.push({owner,index,ind,dot});
}
function syncDrawOwners(){const s=drawing.model.settings;drawOwner.values[0]=s.opacity;drawOwner.values[1]=(s.size-1)/79;fxbOwner.values[0]=(fxBrush.size-6)/194;fxbOwner.values[1]=fxBrush.strength;}
function updateLiveSliders(time){const seen=new Map();syncDrawOwners();
 for(const s of liveSliders){const mods=s.owner.mods||[];const on=mods.some(m=>m.target===s.index);if(s.ind.hidden===on)s.ind.hidden=!on;if(!on)continue;
  let out=seen.get(s.owner);if(!out){out={values:new Array(8).fill(0),intensity:1};applyMods(s.owner,out,time,signals);seen.set(s.owner,out);}
  const v=s.index<0?out.intensity:out.values[s.index];s.dot.style.left=(Math.min(1,Math.max(0,v))*100).toFixed(1)+'%';}}
// Random LFO assignments across the active effects.
function randomizeLfos(){const on=stack.filter(e=>e.enabled);if(!on.length){note('Turn on an effect first.',true);return;}
 for(const e of on){const def=DEFS.get(e.id);e.mods=e.mods.filter(m=>!isGlobalLfo(m.source));const targets=[-1,...def.params.map((p,i)=>p.options?null:i).filter(i=>i!==null)];
  const n=Math.min(targets.length,1+Math.floor(Math.random()*2));for(let k=0;k<n&&e.mods.length<MAX_MODS;k++){const t=targets.splice(Math.floor(Math.random()*targets.length),1)[0];e.mods.push({target:t,source:'lfo'+(1+Math.floor(Math.random()*LFO_COUNT)),shape:'sine',rate:.4,depth:+(.25+Math.random()*.45).toFixed(2),division:2});}}
 renderer.clearHistory();commit();renderStrip();if(drawerOpen)renderDrawer();note('LFOs randomized on '+on.length+' effect'+(on.length>1?'s':''));}
function lfoUsers(i){const src='lfo'+(i+1),names=[];for(const e of stack)if(e.mods.some(m=>m.source===src))names.push(DEFS.get(e.id).name);if(gen.mods.some(m=>m.source===src))names.push(GEN_BY_ID.get(gen.id)?.name||'Source');if(drawOwner.mods.some(m=>m.source===src))names.push('Draw');if(fxbOwner.mods.some(m=>m.source===src))names.push('FX Brush');return names;}
const LFO_COLORS=['#ff2b3d','#2f6cff','#6e3bff','#27e889'];const lfoScopes=[];
function drawLfoScopes(){for(const {i,c} of lfoScopes){const g=c.getContext('2d'),W=c.width,H=c.height,l=lfos[i],col=LFO_COLORS[i];g.fillStyle='#06070d';g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(80,90,160,.35)';g.lineWidth=1;g.beginPath();g.moveTo(0,H/2);g.lineTo(W,H/2);g.stroke();
  const ph=signals.lfoPhase?.[i]||0,cyc=Math.floor(ph),y=v=>H-6-(.5+(v-.5)*l.depth)*(H-12);
  g.strokeStyle=col;g.lineWidth=2.5;g.shadowColor=col;g.shadowBlur=8;g.beginPath();for(let x=0;x<=W;x+=2){const p=cyc+x/W*2-1+(ph-cyc);const v=wave(l.shape,l.shape==='random'?Math.floor(p):p);x?g.lineTo(x,y(v)):g.moveTo(x,y(v));}g.stroke();
  const v=signals.lfo?.[i]??.5;g.fillStyle='#fff';g.shadowBlur=14;g.beginPath();g.arc(W/2,H-6-v*(H-12),5,0,Math.PI*2);g.fill();g.shadowBlur=0;}}
function drawerLfo(d){
 head(d,'LFOs','4 GLOBAL LFOS · TAP “LFO” ON ANY SLIDER');
 const top=el('div','row');top.append(button('Randomize LFOs','shuffle',randomizeLfos,'blue'),button('Clear LFO links','trash',()=>{for(const e of stack)e.mods=e.mods.filter(m=>!isGlobalLfo(m.source));for(const o of [gen,drawOwner,fxbOwner])o.mods=o.mods.filter(m=>!isGlobalLfo(m.source));commit();renderStrip();renderDrawer();note('LFO links cleared · Undo to restore');}));d.append(top);
 lfos.forEach((l,i)=>{const card=el('div','lfo-card'),h=el('div','lfo-head'),name=el('b',null,'LFO '+(i+1)),rate=el('span','lfo-rate',lfoLabel(l));name.style.color=LFO_COLORS[i];
  const users=lfoUsers(i),use=chip(activeLfo===i?'● New links':'Use for new links',()=>{activeLfo=i;renderDrawer();},activeLfo===i);use.setAttribute('aria-label','Use LFO '+(i+1)+' for new LFO buttons');
  h.append(name,rate,use);const c=document.createElement('canvas');c.width=320;c.height=64;c.className='lfo-scope';c.setAttribute('aria-label','LFO '+(i+1)+' waveform');lfoScopes.push({i,c});
  card.append(h,c,el('p','lfo-users',users.length?'Moving: '+users.join(' · '):'Not linked yet — tap LFO beside any slider'));
  const shapes=el('div','row');for(const [k,t] of SHAPES)shapes.append(chip(t,()=>{l.shape=k;commit();renderDrawer();},l.shape===k));card.append(shapes);
  const mode=el('div','row');mode.append(chip('Free (Hz)',()=>{l.sync=false;commit();renderDrawer();},!l.sync),chip('Tempo sync',()=>{l.sync=true;commit();renderDrawer();},l.sync));card.append(mode);
  if(l.sync){const divs=el('div','row');LFO_DIV_LABELS.forEach((t,n)=>divs.append(chip(t,()=>{l.div=n;commit();renderDrawer();},l.div===n)));card.append(divs);}
  else card.append(slider({label:'Rate',value:l.rate,format:v=>lfoRate(v).toFixed(2)+' Hz',onInput:v=>{l.rate=v;rate.textContent=lfoLabel(l);},onChange:commit}));
  card.append(slider({label:'Depth',value:l.depth,onInput:v=>{l.depth=v;},onChange:commit}),slider({label:'Phase',value:l.phase,format:v=>Math.round(v*360)+'°',onInput:v=>{l.phase=v;},onChange:commit}));
  d.append(card);});
}
function button(label,iconName,onTap,cls=''){const b=el('button','tb-btn '+cls);b.type='button';if(iconName)b.append(icon(iconName));b.append(el('span',null,label));b.addEventListener('click',onTap);return b;}
function chip(label,onTap,on=false){const b=el('button','chip'+(on?' on':''),label);b.type='button';b.addEventListener('click',onTap);return b;}
function label(text,right){const l=el('div','section-label');l.append(el('span',null,text));if(right)l.append(right);return l;}

// Effects
function stripEffects(strip){
 for(const e of stack){const def=DEFS.get(e.id);let c=thumbCanvases.get(e.id);if(!c){c=document.createElement('canvas');c.width=96;c.height=114;thumbCanvases.set(e.id,c);}
  strip.append(tile({label:def.name,thumb:c,on:e.enabled,selected:selectedFx===e.id,mods:e.mods?.length>0,aria:def.name+(e.enabled?' on':' off'),onTap:()=>tapEffect(e.id)}));}
 strip.append(el('span','divider'));
 strip.append(tile({label:'LFOs',iconName:'lfo',action:true,color:'purple',aria:'Open LFO panel',onTap:()=>{setTab('motion');openDrawer('lfo');}}));
 strip.append(tile({label:'Random LFOs',iconName:'shuffle',action:true,color:'blue',aria:'Randomize LFOs on active effects (effects tab)',onTap:randomizeLfos}));
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
 const hasLfo=e.mods.some(m=>isGlobalLfo(m.source)),lfoq=el('button','switch lfo-switch'+(hasLfo?' on':''),'LFO');lfoq.type='button';lfoq.setAttribute('aria-pressed',String(hasLfo));lfoq.setAttribute('aria-label','LFO on this effect');
 lfoq.addEventListener('click',()=>{if(e.mods.some(m=>isGlobalLfo(m.source))){e.mods=e.mods.filter(m=>!isGlobalLfo(m.source));note(def.name+': LFO off');}else{const t=def.params.findIndex(p=>!p.options);toggleLfo(e,t>=0?t:-1);if(!e.enabled){e.enabled=true;renderer.clearHistory();}note(def.name+' → LFO '+(activeLfo+1));}commit();renderStrip();renderDrawer();});
 head(d,def.name,def.tag,[reset,lfoq,power]);
 const live=()=>{saveSession();};
 d.append(slider({label:'Intensity',value:e.intensity,onInput:v=>{e.intensity=v;live();},onChange:()=>{commit();updateThumbs(e.id);},lfo:{owner:e,index:-1}}));
 def.params.forEach((p,i)=>{
  if(p.options)d.append(select({label:p.name,options:p.options.map((o,n)=>[n,o]),value:Math.round(e.values[i]*(p.max||1)),onChange:v=>{e.values[i]=Number(v)/(p.max||1);commit();updateThumbs(e.id);},lfo:{owner:e,index:i}}));
  else d.append(slider({label:p.name,value:e.values[i],format:v=>formatParam(p,v),onInput:v=>{e.values[i]=v;live();},onChange:()=>{commit();updateThumbs(e.id);},lfo:{owner:e,index:i}}));
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
const SWATCHES=['#ff2b3d','#2f6cff','#6e3bff','#27e889','#ff7a1a','#00d5ff','#ffffff','#000000'];
function stripDraw(strip){
 const s=drawing.model.settings;
 strip.append(tile({label:'FX Brush',iconName:'fxbrush',selected:fxBrush.on&&!fxBrush.erase,on:fxBrush.on&&!fxBrush.erase,aria:'FX Brush: paint an effect with your finger',onTap:()=>{if(fxBrush.on&&!fxBrush.erase){drawerOpen&&drawerMode==='fxbrush'?closeDrawer():openDrawer('fxbrush');return;}fxBrush.on=true;fxBrush.erase=false;updatePill();openDrawer('fxbrush');renderStrip();}}));
 strip.append(tile({label:'FX Erase',iconName:'eraser',selected:fxBrush.on&&fxBrush.erase,on:fxBrush.on&&fxBrush.erase,aria:'Erase painted effects',onTap:()=>{fxBrush.on=true;fxBrush.erase=true;updatePill();if(drawerOpen)openDrawer('fxbrush');renderStrip();}}));
 strip.append(tile({label:'Clear FX',iconName:'trash',action:true,color:'red',onTap:()=>{if(!fxPaint.strokes.length)return note('No FX paint to clear');fxPaint.clear();commit();note('FX paint cleared · Undo to restore');}}));
 strip.append(el('span','divider'));
 for(const [id,name,ic]of BRUSHES)strip.append(tile({label:name,iconName:ic,selected:!fxBrush.on&&s.brush===id,on:!fxBrush.on&&s.brush===id,onTap:()=>{if(fxBrush.on){fxBrush.on=false;s.brush=id;updatePill();saveSession();if(drawerOpen)openDrawer('brush');renderStrip();return;}if(s.brush===id){drawerOpen&&drawerMode==='brush'?closeDrawer():openDrawer('brush');}else{s.brush=id;saveSession();renderStrip();if(drawerOpen)renderDrawer();}}}));
 strip.append(tile({label:'Settings',iconName:'sliders',action:true,onTap:()=>drawerOpen&&drawerMode==='brush'?closeDrawer():openDrawer('brush')}));
 strip.append(el('span','divider'));
 const colors=[...new Set([...SWATCHES,...s.colors])];
 for(const c of colors){const sw=el('span','swatch');sw.style.background=c;strip.append(tile({label:c===s.color?'Color':'',thumb:sw,selected:c===s.color,aria:'Color '+c,onTap:()=>{s.color=c;if(s.brush==='eraser')s.brush='pen';fxBrush.on=false;updatePill();saveSession();renderStrip();}}));}
 strip.append(tile({label:'Custom',iconName:'plus',action:true,onTap:()=>openDrawer('brush')}));
 strip.append(el('span','divider'));
 strip.append(tile({label:'Clear ink',iconName:'trash',action:true,color:'red',onTap:()=>{if(!drawing.model.strokes.length)return note('No ink to clear');drawing.model.strokes=[];drawing.model.current=null;drawing.model.revision++;drawing.baseKey='';commit();note('Ink cleared · Undo to restore');}}));
}
function drawerBrush(d){
 const s=drawing.model.settings,name=BRUSHES.find(b=>b[0]===s.brush)?.[1]||'Brush';
 head(d,name,'DRAW ON THE PREVIEW');
 d.append(slider({label:'Size',value:s.size,min:1,max:80,step:1,format:v=>Math.round(v)+' px',onInput:v=>{s.size=v;},onChange:saveSession,lfo:{owner:drawOwner,index:1}}));
 d.append(slider({label:'Opacity',value:s.opacity,onInput:v=>{s.opacity=v;},onChange:saveSession,lfo:{owner:drawOwner,index:0}}));
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

function drawerFxBrush(d){
 head(d,fxBrush.erase?'FX Erase':'FX Brush',fxBrush.erase?'WIPE PAINTED EFFECTS':'PAINT AN EFFECT WITH YOUR FINGER');
 if(!fxBrush.erase){const row=el('div','row');for(const def of EFFECTS)if(def.id!=='beat')row.append(chip(def.name,()=>{fxBrush.effect=def.id;if(fxPaint.effects().length>=6&&!fxPaint.effects().includes(def.id))note('Up to 6 painted effects at once; this one will not show until one is cleared.',true);renderDrawer();updatePill();},fxBrush.effect===def.id));d.append(label('Effect to paint'),row);}
 d.append(slider({label:'Size',value:fxBrush.size,min:6,max:200,step:1,format:v=>Math.round(v)+' px',onInput:v=>{fxBrush.size=v;},lfo:{owner:fxbOwner,index:0}}));
 if(!fxBrush.erase)d.append(slider({label:'Strength',value:fxBrush.strength,onInput:v=>{fxBrush.strength=v;},lfo:{owner:fxbOwner,index:1}}));
 const row=el('div','row');row.append(chip(fxBrush.erase?'Switch to paint':'Switch to erase',()=>{fxBrush.erase=!fxBrush.erase;renderStrip();renderDrawer();updatePill();}),chip('Tune '+(DEFS.get(fxBrush.effect)?.name||'effect'),()=>{selectedFx=fxBrush.effect;setTab('effects');openDrawer('fx');renderStrip();}));d.append(row);
 d.append(el('p','section-label','Painted areas use that effect\'s Effects-tab settings and motions. Undo removes strokes.'));
}

// Perform: finger control restored from v1.5 (picture touch, XY pad, mappings, spring, hold memory, momentary)
function performTargets(){if(performSource&&sourceKind==='gen')return touchAll?[gen,...stack.filter(e=>e.enabled)]:[gen];if(touchAll)return stack.filter(e=>e.enabled);const e=stack.find(x=>x.id===selectedFx);if(e){if(!e.enabled){e.enabled=true;renderer.clearHistory();renderStrip();}return [e];}const on=stack.filter(x=>x.enabled);return on.length?on:[];}
function stripPerform(strip){
 const sel=stack.find(e=>e.id===selectedFx);
 strip.append(tile({label:touchAll?'All active':'Selected only',iconName:'finger',action:true,color:touchAll?'blue':'',aria:'Fingers control '+(touchAll?'all active effects':'the selected effect'),onTap:()=>{touchAll=!touchAll;note(touchAll?'Fingers drive every active effect':'Fingers drive the selected effect');renderStrip();updatePill();}}));
 if(sourceKind==='gen')strip.append(tile({label:'Source',iconName:'grid',on:performSource,selected:performSource,aria:'Fingers drive the generative source',onTap:()=>{performSource=!performSource;note(performSource?'Fingers drive '+GEN_BY_ID.get(gen.id).name:'Fingers drive effects');renderStrip();updatePill();}}));
 strip.append(tile({label:'XY pad',iconName:'grid',action:true,color:'blue',onTap:()=>{if(!sel)return note('Pick an effect below first.');drawerOpen&&drawerMode==='perform'?closeDrawer():openDrawer('perform');}}));
 const springOn=sel?.touch?.spring===true;
 strip.append(tile({label:'Spring back',iconName:'reset',on:springOn,aria:'Spring back on release',onTap:()=>{const list=touchAll?stack.filter(e=>e.enabled):sel?[sel]:[];if(!list.length)return note('Pick an effect first.');const v=!springOn;for(const e of list)e.touch.spring=v;commit();renderStrip();}}));
 strip.append(tile({label:'Momentary',iconName:'tap',on:momentary,aria:'Momentary: hold an effect tile to apply it',onTap:()=>{momentary=!momentary;note(momentary?'Momentary: hold an effect to play it, release to stop':'Momentary off: tap toggles');renderStrip();}}));
 strip.append(tile({label:'FX Brush',iconName:'fxbrush',action:true,onTap:()=>{fxBrush.on=true;fxBrush.erase=false;setTab('draw');openDrawer('fxbrush');renderStrip();}}));
 strip.append(el('span','divider'));
 for(const e of stack){const def=DEFS.get(e.id);let c=thumbCanvases.get(e.id);if(!c){c=document.createElement('canvas');c.width=96;c.height=114;thumbCanvases.set(e.id,c);}
  const t=tile({label:def.name,thumb:c,on:e.enabled,selected:selectedFx===e.id,aria:def.name+(e.enabled?' on':' off'),onTap:()=>{if(momentary)return;if(selectedFx!==e.id){selectedFx=e.id;updatePill();if(!e.enabled){e.enabled=true;renderer.clearHistory();commit();}renderStrip();if(drawerOpen)renderDrawer();return;}drawerOpen&&drawerMode==='perform'?closeDrawer():openDrawer('perform');}});
  let prior=null;
  t.addEventListener('pointerdown',ev=>{if(!momentary)return;ev.preventDefault();t.setPointerCapture?.(ev.pointerId);prior=e.enabled;e.enabled=true;selectedFx=e.id;updatePill();t.classList.add('on','selected');});
  const release=()=>{if(prior===null)return;e.enabled=prior;prior=null;renderer.clearHistory();renderStrip();};
  t.addEventListener('pointerup',release);t.addEventListener('pointercancel',release);t.addEventListener('lostpointercapture',release);
  strip.append(t);}
}
function drawerPerform(d){
 const e=stack.find(x=>x.id===selectedFx);if(!e)return closeDrawer();const def=DEFS.get(e.id);
 const power=el('button','switch',e.enabled?'ON':'OFF');power.type='button';power.setAttribute('aria-pressed',String(e.enabled));power.addEventListener('click',()=>{e.enabled=!e.enabled;renderer.clearHistory();commit();renderStrip();renderDrawer();});
 head(d,def.name,'FINGER CONTROL',[power]);
 const pad=el('div','xy-pad','XY');pad.tabIndex=0;pad.setAttribute('role','group');pad.setAttribute('aria-label',def.name+' XY pad');bindXY(pad,e,()=>saveSession());pad.addEventListener('pointerup',()=>commit());d.append(pad);
 const names=[[-2,'Nothing'],[-1,'Intensity'],...def.params.map((p,i)=>[i,p.name])];
 const grid=el('div','map-grid');for(const [k,t]of TOUCH_KEYS)grid.append(select({label:t,options:names,value:e.touch[k],onChange:v=>{e.touch[k]=Number(v);commit();}}));
 d.append(label('What each finger move controls'),grid);
 const row=el('div','row');row.append(chip('Spring back',()=>{e.touch.spring=!e.touch.spring;commit();renderDrawer();renderStrip();},e.touch.spring));
 if(FEEDBACK.includes(e.id))row.append(chip(e.hold?'Release memory':'Hold memory',()=>{e.hold=!e.hold;renderDrawer();},e.hold===true));
 d.append(row,el('p','section-label','On the preview: 1 finger = XY · 2nd finger = XY 2 · pinch · twist · hold still = freeze · quick tap = stutter'));
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
function loadLook(p){setStack(p.stack);if(p.lfos)lfos=structuredClone(p.lfos);if(p.gen)useGen(p.gen.id,p.gen,false);renderer.clearHistory();commit();setTimeout(()=>updateThumbs(),30);note(p.name);}
function stripLooks(strip){
 strip.append(tile({label:'Save look',iconName:'plus',action:true,color:'red',onTap:()=>{if(userLooks.length>=60)return note('60 looks max. Delete one first.',true);userLooks.push({name:'Look '+(userLooks.length+1),stack:structuredClone(stack),lfos:structuredClone(lfos),...(sourceKind==='gen'?{gen:structuredClone(gen)}:{})});saveLooks();renderStrip();note('Look saved');}}));
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
 const row=el('div','row');row.append(button('Update with current','check',()=>{p.stack=structuredClone(stack);p.lfos=structuredClone(lfos);if(sourceKind==='gen')p.gen=structuredClone(gen);else delete p.gen;saveLooks();note('Look updated');},'blue'),button('Delete','trash',()=>{userLooks.splice(selectedLook,1);selectedLook=null;saveLooks();closeDrawer();},'danger'));d.append(row);
}

// Source (same tab menu as everything else)
function pickFile(accept){const f=$('file');f.accept=accept;f.click();}
const cameraTap=side=>()=>{facing=side;useCamera().then(()=>renderStrip());};
function stripGen(strip){
 strip.append(tile({label:'Sources',iconName:'left',action:true,aria:'Back to sources',onTap:()=>{genGrid=false;renderStrip();}}));
 strip.append(tile({label:'Tune',iconName:'sliders',action:true,color:'blue',aria:'Tune generative source',onTap:()=>{if(sourceKind!=='gen')useGen(gen.id);drawerOpen&&drawerMode==='gen'?closeDrawer():openDrawer('gen');}}));
 strip.append(tile({label:'Library',iconName:'grid',action:true,color:'purple',aria:'Generative library grid',onTap:()=>{drawerOpen&&drawerMode==='genlib'?closeDrawer():openDrawer('genlib');}}));
 if(sourceKind==='gen'&&gen.id==='text')strip.append(tile({label:'Edit text',iconName:'pen',action:true,color:'purple',aria:'Edit glitch text',onTap:editGenText}));
 strip.append(el('span','divider'));
 const study=demo;strip.append(tile({label:'Signal study',thumb:(()=>{const c=document.createElement('canvas');c.width=96;c.height=114;c.getContext('2d').drawImage(study,0,0,720,960,0,0,96,128);return c;})(),on:sourceKind==='demo',selected:sourceKind==='demo',aria:'Generative demo input',onTap:()=>{useDemo();renderStrip();}}));
 for(const s of GEN_SOURCES){let c=genThumbs.get(s.id);if(!c){c=document.createElement('canvas');c.width=96;c.height=114;genThumbs.set(s.id,c);}const active=sourceKind==='gen'&&gen.id===s.id;
  strip.append(tile({label:s.name,thumb:c,on:active,selected:active,aria:'Generative: '+s.name,mods:active&&gen.mods.length>0,onTap:()=>{if(active){drawerOpen&&drawerMode==='gen'?closeDrawer():openDrawer('gen');return;}useGen(s.id);renderStrip();if(drawerOpen&&drawerMode==='gen')renderDrawer();}}));}
 if(generator)renderGenThumbs(GEN_SOURCES.length,performance.now()/1000);
}
function drawerGenLib(d){
 head(d,'Generative library',GEN_SOURCES.length+' GPU SOURCES · TAP TO PLAY');const grid=el('div','gen-grid');
 const pick=fn=>()=>{const y=d.scrollTop;fn();renderStrip();renderDrawer();d.scrollTop=y;};
 const sc=document.createElement('canvas');sc.width=96;sc.height=114;sc.getContext('2d').drawImage(demo,0,0,720,960,0,0,96,128);
 grid.append(tile({label:'Signal study',thumb:sc,on:sourceKind==='demo',selected:sourceKind==='demo',aria:'Library: Signal study',onTap:pick(()=>useDemo())}));
 for(const s of GEN_SOURCES){let c=libThumbs.get(s.id);if(!c){c=document.createElement('canvas');c.width=96;c.height=114;libThumbs.set(s.id,c);}const active=sourceKind==='gen'&&gen.id===s.id;
  grid.append(tile({label:s.name,thumb:c,on:active,selected:active,aria:'Library: '+s.name,onTap:pick(()=>{if(!active)useGen(s.id);})}));}
 d.append(grid);if(generator)renderGenThumbs(GEN_SOURCES.length,performance.now()/1000);
}
// Glitch text editor: big multi-line field (opens the keyboard), Done, counter, font + alignment.
function textEditor(d){
 const box=el('div','text-edit'),top=el('div','text-edit-top'),l=el('label',null,'Type your text'),count=el('output','text-count'),t=el('textarea'),done=el('button','tb-btn blue text-done','Done');
 t.id='gen-text';t.rows=3;t.maxLength=MAX_TEXT;t.value=gen.text===' '?'':gen.text;t.placeholder='Type anything — Return for a new line';t.autocomplete='off';t.spellcheck=false;t.setAttribute('autocapitalize','characters');t.setAttribute('enterkeyhint','enter');l.htmlFor=t.id;
 const sync=()=>{gen.text=cleanText(t.value);count.textContent=t.value.length+'/'+MAX_TEXT;};sync();
 t.addEventListener('input',()=>{const lines=t.value.split('\n');if(lines.length>MAX_TEXT_LINES)t.value=lines.slice(0,MAX_TEXT_LINES).join('\n');sync();saveSession();});
 t.addEventListener('change',()=>{sync();commit();});
 done.type='button';done.setAttribute('aria-label','Done editing text');done.addEventListener('click',()=>{sync();t.blur();commit();note('Text set');});
 top.append(l,count,done);box.append(top,t);
 const fonts=el('div','row');for(const [k,name] of TEXT_FONTS)fonts.append(chip(name,()=>{gen.font=k;commit();renderDrawer();},(gen.font||'sans')===k));
 const aligns=el('div','row');for(const [k,name] of TEXT_ALIGNS)aligns.append(chip(name,()=>{gen.align=k;commit();renderDrawer();},(gen.align||'center')===k));
 box.append(label('Font'),fonts,label('Align'),aligns);d.append(box);
}
function editGenText(){if(sourceKind!=='gen'||gen.id!=='text'){useGen('text');renderStrip();}if(sourceKind!=='gen'||gen.id!=='text')return;if(tab!=='source')setTab('source');openDrawer('gen');const t=$('gen-text');if(t){t.focus();const n=t.value.length;t.setSelectionRange?.(n,n);t.scrollIntoView?.({block:'nearest'});}}
function drawerGen(d){
 if(sourceKind!=='gen')return closeDrawer();const src=GEN_BY_ID.get(gen.id),params=genParams(src);
 const reset=el('button','tb-btn icon');reset.type='button';reset.setAttribute('aria-label','Reset source');reset.append(icon('reset'));reset.addEventListener('click',()=>{const keep={text:gen.text,font:gen.font,align:gen.align};gen=defaultGen(gen.id);Object.assign(gen,keep);commit();renderDrawer();note(src.name+' reset');});
 head(d,src.name,'GENERATIVE SOURCE',[reset]);
 if(gen.id==='text')textEditor(d);
 params.forEach((p,i)=>{if(p.options){const row=el('div','row');p.options.forEach((name,n)=>row.append(chip(name,()=>{gen.values[i]=n/p.max;commit();renderDrawer();},Math.round(gen.values[i]*p.max)===n)));d.append(label('Palette'),row);}
  else d.append(slider({label:p.name,value:gen.values[i],onInput:v=>{gen.values[i]=v;saveSession();},onChange:()=>commit(),lfo:{owner:gen,index:i}}));});
 const add=chip('+ Add',()=>{if(gen.mods.length>=MAX_MODS)return note('Up to '+MAX_MODS+' motions.',true);gen.mods.push(normalizeMods([{target:4,source:audioMode==='none'?'lfo':'level'}],6)[0]);commit();renderDrawer();});
 d.append(label('Motion (LFO · tempo · audio)',add));
 const targets=params.map((p,i)=>[i,p.name]).filter(([i])=>i!==3);
 gen.mods.forEach((m,mi)=>{const box=el('div','mod'),grid=el('div','mod-grid');
  grid.append(select({label:'Moves',options:targets,value:m.target<0?0:m.target,onChange:v=>{m.target=Number(v);commit();}}),select({label:'Driven by',options:SOURCES,value:m.source,onChange:v=>{m.source=v;commit();renderDrawer();}}));
  if(m.source==='lfo'||m.source==='bpm')grid.append(select({label:'Shape',options:SHAPES,value:m.shape,onChange:v=>{m.shape=v;commit();}}));
  if(m.source==='bpm')grid.append(select({label:'Rate',options:DIVISION_LABELS.map((t,i)=>[i,t]),value:m.division,onChange:v=>{m.division=Number(v);commit();}}));
  if(m.source==='lfo')grid.append(slider({label:'Speed',value:m.rate,format:v=>(.05*Math.pow(160,v)).toFixed(2)+' Hz',onInput:v=>{m.rate=v;},onChange:commit}));
  grid.append(slider({label:'Depth',value:m.depth,onInput:v=>{m.depth=v;},onChange:commit}));box.append(grid,chip('Remove',()=>{gen.mods.splice(mi,1);commit();renderDrawer();}));d.append(box);});
 const names=[[-2,'Nothing'],...params.map((p,i)=>[i,p.name]).filter(([i])=>i!==3)];const mg=el('div','map-grid');
 for(const [k,t]of TOUCH_KEYS)mg.append(select({label:t,options:names,value:gen.touch[k],onChange:v=>{gen.touch[k]=Number(v);commit();}}));
 const fr=el('div','row');fr.append(chip(performSource?'Fingers drive source ✓':'Fingers drive source',()=>{performSource=!performSource;renderDrawer();updatePill();},performSource),chip('Spring back',()=>{gen.touch.spring=!gen.touch.spring;commit();renderDrawer();},gen.touch.spring));
 d.append(label('Perform fingers'),fr,mg);
}
function stripSource(strip){
 if(genGrid)return stripGen(strip);
 const live=sourceKind==='camera';
 strip.append(tile({label:'Rear cam',aria:'Back camera',iconName:'source',on:live&&facing==='environment',selected:live&&facing==='environment',onTap:cameraTap('environment')}));
 strip.append(tile({label:'Selfie cam',aria:'Front camera',iconName:'source',on:live&&facing==='user',selected:live&&facing==='user',onTap:cameraTap('user')}));
 strip.append(tile({label:'Flip camera',iconName:'flip',action:true,onTap:()=>cameraTap(facing==='user'?'environment':'user')()}));
 strip.append(el('span','divider'));
 strip.append(tile({label:'Photo',iconName:'image',on:sourceKind==='image',selected:sourceKind==='image',onTap:()=>pickFile('image/*')}));
 strip.append(tile({label:'Video',iconName:'film',on:sourceKind==='video',selected:sourceKind==='video',onTap:()=>pickFile('video/*')}));
 strip.append(tile({label:'Generative',iconName:'grid',on:sourceKind==='gen'||sourceKind==='demo',selected:sourceKind==='gen'||sourceKind==='demo',badge:String(GEN_SOURCES.length+1),aria:'Generative sources',onTap:()=>{ensureGenerator();genGrid=true;renderStrip();openDrawer('genlib');$('strip').scrollLeft=0;}}));
 strip.append(tile({label:'Last frame',iconName:'frame',action:true,aria:'Use last captured frame as source',onTap:()=>{const f=frameList.at(-1);if(!f)return note('Capture a frame first (Frames tab).');useBlob(f.blob).then(()=>renderStrip());}}));
}

// Motion
async function setAudio(mode){try{await audio.configure(mode);audioMode=mode;note(mode==='none'?'Audio off':mode==='mic'?'Mic listening (never recorded unless you record)':mode==='video'?'Clip audio':'Mic + clip');}catch(e){note(e.message||'Audio unavailable.',true);}renderStrip();}
function stripMotion(strip){
 const links=stack.reduce((n,e)=>n+e.mods.filter(m=>isGlobalLfo(m.source)).length,0)+[gen,drawOwner,fxbOwner].reduce((n,o)=>n+o.mods.filter(m=>isGlobalLfo(m.source)).length,0);
 strip.append(tile({label:'LFOs',iconName:'lfo',action:true,color:'purple',badge:String(links||LFO_COUNT),selected:drawerOpen&&drawerMode==='lfo',aria:'LFO panel',onTap:()=>drawerOpen&&drawerMode==='lfo'?closeDrawer():openDrawer('lfo')}));
 strip.append(tile({label:'Random LFOs',iconName:'shuffle',action:true,color:'blue',aria:'Randomize LFOs on active effects',onTap:randomizeLfos}));
 strip.append(el('span','divider'));
 for(const [m,t,ic]of [['none','Audio off','mute'],['mic','Mic','mic'],['video','Clip audio','clip'],['mix','Mic + clip','wave']])strip.append(tile({label:t,iconName:ic,on:audioMode===m,selected:audioMode===m,onTap:()=>setAudio(m)}));
 strip.append(el('span','divider'));
 strip.append(tile({label:'Tap tempo',iconName:'tap',badge:Math.round(beatClock.bpm)+'',action:true,color:'blue',onTap:()=>{const now=performance.now();beatClock.tap(now);beatOrigin=now;renderStrip();}}));
 strip.append(tile({label:frozen?'Frozen':'Freeze',iconName:'freeze',on:frozen,onTap:()=>{frozen=!frozen;renderStrip();}}));
 strip.append(tile({label:'Settings',iconName:'sliders',action:true,onTap:()=>drawerOpen&&drawerMode==='motion'?closeDrawer():openDrawer('motion')}));
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
  if(tab==='perform')return;
  if(pointer!==null)return;pointer=e.pointerId;canvas.setPointerCapture?.(e.pointerId);const [x,y]=norm(e);
  if(tab==='perform')return; // FingerPerformer owns the preview in Perform
  if(tab==='draw'&&fxBrush.on){let size=fxBrush.size,strength=fxBrush.strength;if(fxbOwner.mods.length){syncDrawOwners();applyMods(fxbOwner,modTmp,performance.now()/1000,signals);size=6+modTmp.values[0]*194;strength=modTmp.values[1];}fxPaint.begin(fxBrush.effect,x,y,{size,strength,erase:fxBrush.erase});return;}
  if(tab==='draw'){const s=drawing.model.settings,keep=s.size;if(drawOwner.mods.some(m=>m.target===1)){syncDrawOwners();applyMods(drawOwner,modTmp,performance.now()/1000,signals);s.size=Math.max(1,Math.round(1+modTmp.values[1]*79));}drawing.model.begin(x,y,pressure(e),performance.now()/1000);s.size=keep;return;}
  start=[e.clientX,e.clientY];const fx=stack.find(s=>s.id===selectedFx&&s.enabled);base=fx?[fx.values[0],fx.values[1]]:null;
  holdTimer=setTimeout(()=>{compare=true;hud('Original');},260);
 });
 canvas.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  if(tab==='draw'&&fxPaint.current){const list=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const p of list.length?list:[e]){const [x,y]=norm(p);fxPaint.point(x,y);}return;}
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
  if(fxPaint.current){fxPaint.end();commit();return;}
  if(tab==='draw'){drawing.model.end();commit();return;}
  if(compare){compare=false;}
  const fx=stack.find(s=>s._dragged);if(fx){delete fx._dragged;commit();if(drawerOpen&&drawerMode==='fx')renderDrawer();updateThumbs(fx.id);}
  start=null;hud(null);
 };
 canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
}
function updatePill(){const p=$('mode-pill');if(tab==='perform'){p.hidden=false;p.className='mode-pill';p.textContent='FINGER FX · '+(performSource&&sourceKind==='gen'?GEN_BY_ID.get(gen.id).name.toUpperCase()+(touchAll?' + FX':''):touchAll?'ALL ACTIVE':(DEFS.get(selectedFx)?.name||'ACTIVE').toUpperCase());}else if(tab==='draw'&&fxBrush.on){p.hidden=false;p.className='mode-pill fx';p.textContent=fxBrush.erase?'FX ERASE':'FX BRUSH · '+(DEFS.get(fxBrush.effect)?.name||'').toUpperCase();}else p.hidden=true;}
function hudFlash(text){hud(text);clearTimeout(hudFlash.t);hudFlash.t=setTimeout(()=>hud(null),3200);}
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
 if(saved?.gen){const g=normalizeGen(saved.gen,normalizeMods);if(g)gen=g;}
 if(saved){lfos=normalizeLfos(saved.lfos);drawOwner.mods=normalizeMods(saved.drawMods,3);fxbOwner.mods=normalizeMods(saved.fxbMods,2);}
 try{renderer=new Renderer(canvas);}catch(e){note(e.message||'WebGL is unavailable on this device.',true);return;}
 if(saved?.genActive){useGen(gen.id,gen,false);}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();note('Graphics paused by the system. Reopen the app if the preview stays black.',true);});
 history.reset({...snapshot(),signature:signature()});syncUndo();
 $('gen-edit').addEventListener('click',editGenText);$('btn-undo').addEventListener('click',()=>restore(history.undo()));
 $('btn-redo').addEventListener('click',()=>restore(history.redo()));
 $('btn-save').addEventListener('click',saveSheet);
 $('rec-badge').addEventListener('click',()=>capture?.stop('user'));
 $('sheet-close').addEventListener('click',closeSheet);
 $('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))closeSheet();});
 $('file').addEventListener('change',()=>{const f=$('file').files?.[0];$('file').value='';if(f)useFile(f);});
 for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>setTab(b.dataset.tab));
 new ResizeObserver(()=>fitCanvas()).observe($('stage'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&capture?.active)capture.stop('app hidden');});
 bindStage();nativeFeel();bindTransport();
 performer=new FingerPerformer(canvas,$('touch-overlay'),{enabled:()=>tab==='perform',getEffects:performTargets,onChange:()=>{saveSession();},onFreeze:v=>{touchFreeze=v;},onStutter:()=>{renderer.stutterUntil=performance.now()+160;},onRelease:moved=>{if(moved){commit();if(drawerOpen&&drawerMode==='perform')renderDrawer();updateThumbs();}},status:t=>{if(t)hud(t);else hud(null);}});
 await frames.init();refreshFrames();
 ensureSize();fitCanvas();renderStrip();requestAnimationFrame(loop);setTimeout(()=>updateThumbs(),200);
 try{if(!store.getItem('brainhertz.pixelpusher.tip16')){store.setItem('brainhertz.pixelpusher.tip16','1');hud('Hold preview = original  ·  drag = tweak effect');setTimeout(()=>hud(null),3800);}}catch{}
 if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
 globalThis.__pp={get stack(){return stack;},get lfos(){return lfos;},drawOwner,fxbOwner,get signals(){return signals;},get gen(){return gen;},useGen,get generator(){return generator;},GEN_SOURCES,get sourceKind(){return sourceKind;},video,fxPaint,fxBrush,get tab(){return tab;},history,drawing,frames,get frameList(){return frameList;},setTab,tapEffect,captureFrame,refreshFrames,buildZip,version:VERSION};
}
boot();
