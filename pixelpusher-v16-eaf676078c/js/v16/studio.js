// Pixel Pusher 1.7.2 studio shell. Original Brainhertz Productions code; on-device only.
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
import {saveBlob,saveToPhotos,stamp} from './share.js';
import {builtinFx,readFx,writeFx} from './fx-presets.js';
import {FxPaint} from './fx-paint.js';
import {FingerPerformer,TOUCH_KEYS} from './perform.js';
import {bindXY} from '../touch.js';
import {SOURCES as GEN_SOURCES,SOURCE_BY_ID as GEN_BY_ID,genParams,defaultGen,normalizeGen,cleanText,speedFactor,MAX_TEXT,MAX_TEXT_LINES,TEXT_FONTS,TEXT_ALIGNS,TEXT_STYLES,STYLE_LABELS,textSpec} from './gen-sources.js';
import {FPS,DURATIONS,MAX_KEYS,EASES,defaultTimeline,clampRange,normalizeTimeline,stepTime,fmtTC,normalizeKeys,setKey,removeKey,keyAt,hasKeys,keyValue,applyKeys,adoptKeys,moveKey,trackOf,keyedParams,nextKeyTime} from '../v17/timeline.js';
import {analyzeBlob,LiveOnsets,envAt,recordMarker} from '../v17/beats.js';
import {ClipStore} from '../v17/clips-store.js';
import {Generator} from './generator.js';
import {createMapUI} from '../v17/map-ui.js';

export const VERSION='1.7.2';
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
let touchAll=false,momentary=false,touchFreeze=false,performer=null,mapUI=null;
const FEEDBACK=['smear','trails','slit','beat','mosh'];
// 1.7 timeline, beat tracks, keyframes, review + clips
let tl=defaultTimeline(),tlTouched=false,mediaBlob=null,clipSource=null,rendering=null,renderCache=null,clipList=[],selectedClip=null,prevT=0;
const clips=new ClipStore();
const beatData={status:'none',peaks:null,kicks:[],hits:[],liveKicks:[],liveHits:[],livePeaks:new Float32Array(600),sensitivity:1,token:0};
const liveKick=new LiveOnsets(.22),liveHit=new LiveOnsets(.09);let lastLK=-9,lastLH=-9;
const review={open:false,mode:'live',clip:null,url:null,in:0,out:0,dur:0,ready:null,wasLoop:true};

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
function withMods(list,raw){const byId=new Map((Array.isArray(raw)?raw:[]).filter(x=>x&&typeof x==='object').map(x=>[x.id,x]));return list.map(e=>({...e,mods:normalizeMods(byId.get(e.id)?.mods,DEFS.get(e.id).params.length),keys:normalizeKeys(byId.get(e.id)?.keys,DEFS.get(e.id).params.length)}));}
function normGen(raw){const g=normalizeGen(raw,normalizeMods);if(g)g.keys=normalizeKeys(raw?.keys,6).filter(k=>k.p!==3&&k.p>=0);return g;}
function setStack(raw){stack=withMods(sanitizeStack(raw),raw);renderStack=stack.map(e=>({id:e.id,enabled:false,intensity:1,values:new Array(6).fill(0),hold:false,reactive:false,reactiveParam:0}));}
const signature=()=>JSON.stringify(stack.map(e=>[e.id,e.enabled,e.intensity,e.values,e.mods,e.touch,e.keys]))+'|'+JSON.stringify(gen)+'|'+drawing.model.strokes.map(s=>s.seed).join(',')+'|'+fxPaint.strokes.map(s=>s.id).join(',')+'|'+JSON.stringify([lfos,drawOwner.mods,fxbOwner.mods]);
function snapshot(){return {stack:structuredClone(stack),strokes:drawing.model.strokes.slice(),fxStrokes:fxPaint.strokes.slice(),gen:structuredClone(gen),lfos:structuredClone(lfos),drawMods:structuredClone(drawOwner.mods),fxbMods:structuredClone(fxbOwner.mods)};}
function commit(){if(history.push(snapshot(),signature()))saveSession();syncUndo();}
function restore(entry){if(!entry)return;stack=structuredClone(entry.stack);drawing.model.current=null;drawing.model.strokes=entry.strokes.slice();drawing.model.revision++;drawing.baseKey='';fxPaint.set(entry.fxStrokes||[]);if(entry.gen){const before=gen.id;gen=structuredClone(entry.gen);if(!gen.keys)gen.keys=[];if(sourceKind==='gen'&&before!==gen.id)renderer?.clearHistory();}if(entry.lfos)lfos=structuredClone(entry.lfos);if(entry.drawMods)drawOwner.mods=structuredClone(entry.drawMods);if(entry.fxbMods)fxbOwner.mods=structuredClone(entry.fxbMods);renderer?.clearHistory();saveSession();refreshUI();syncUndo();}
function syncUndo(){$('btn-undo').disabled=!history.canUndo;$('btn-redo').disabled=!history.canRedo;}
let sessionTimer;
function saveSession(){clearTimeout(sessionTimer);sessionTimer=setTimeout(()=>{try{store.setItem(SESSION_KEY,JSON.stringify({v:VERSION,stack,drawing:drawing.model.settings,sensitivity,gen,genActive:sourceKind==='gen',lfos,drawMods:drawOwner.mods,fxbMods:fxbOwner.mods,timeline:{duration:tl.duration,in:tl.in,out:tl.out,loop:tl.loop}}));}catch{/* storage full: session continuity only */}},300);}
function loadSession(){try{const raw=store.getItem(SESSION_KEY);if(!raw||raw.length>1e6)return null;return JSON.parse(raw);}catch{return null;}}
function loadLooks(){try{const raw=store.getItem(LOOKS_KEY);const list=raw&&raw.length<4e6?JSON.parse(raw):[];userLooks=(Array.isArray(list)?list:[]).slice(0,60).map(v=>{const p=normalizePreset(v);const g=v&&v.gen?normGen(v.gen):null;return p?{name:p.name,stack:withMods(p.stack,v.stack),...(g?{gen:g}:{}),...(Array.isArray(v.lfos)?{lfos:normalizeLfos(v.lfos)}:{})}:null;}).filter(Boolean);}catch{userLooks=[];}
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
// 1.7.2: the loop always reschedules first and a failing frame never stops it; repeated failures trigger recovery.
function loop(now){
 requestAnimationFrame(loop);
 try{syncGenEdit();frame(now);}catch(e){loopError(e);}
}
let dragKt=0,loopErrs=0,loopErrAt=0,blackRun=0,probeAt=0,glLostAt=0,errNoteAt=0;const perf={avg:0,n:0,max:0},drawSig={};
function loopError(e){const now=performance.now();if(now-loopErrAt>3000)loopErrs=0;loopErrAt=now;loopErrs++;
 if(loopErrs===1)console.warn('frame error',e);
 if(loopErrs===1||loopErrs===30){friendly('The preview hit a problem and is recovering. Your work is saved.');}
 if(loopErrs===30)renderer?.clearHistory?.();
 if(loopErrs===90){rebuildRenderer('frame errors');loopErrs=0;}}
function friendly(msg){const now=performance.now();if(now-errNoteAt<4000)return;errNoteAt=now;note(msg,true);}
function grabKeys(list){for(const o of list||[])adoptKeys(o,tl.t);}
function perfStat(ms){if(!Number.isFinite(ms))return;perf.n++;perf.avg+=(ms-perf.avg)/Math.min(perf.n,120);if(ms>perf.max)perf.max=ms;}
// Rebuilds the main WebGL renderer (after a lost context or a stuck state). Keeps the canvas, stack, keys and source.
function rebuildRenderer(reason){try{try{renderer?.destroy?.();}catch{}renderer=new Renderer(canvas);const t=targetSize();if(t)renderer.resize(t[0],t[1]);renderer.clearHistory();thumbRenderer=null;glLostAt=0;
  if(sourceKind==='gen'&&!generator){generator=null;useGen(gen.id,gen,false);}fitCanvas();setTimeout(()=>updateThumbs(),60);note('Graphics restored');return true;}
 catch(e){console.warn('rebuild failed',reason,e);note('Graphics could not restart. Close and reopen the app; your work is saved.',true);return false;}}
// Watchdog: about once a second, compare 5 pixels of the incoming picture with the final picture. If a live picture comes out
// fully black for about 4 s, the feedback memory is cleared; if it stays black 4 s more, the effect responsible is turned off (undoable).
function watchdog(now){if(now-probeAt<renderer.probeEvery||compare||renderer.freeze||touchFreeze||frozen)return;probeAt=now;
 // Only while a feedback effect is on (the chains that can lock up); costs one tiny async readback every 2 s.
 if(!stack.some(e=>e.enabled&&FEEDBACK.includes(e.id))&&!fxPaint.hasPaint){blackRun=0;return;}const r=renderer.probe();if(!r)return;
 if(r.input>60&&r.output<=6){blackRun++;}else{blackRun=0;return;}
 if(blackRun===2){renderer.clearHistory();note('The picture went black, so the effect memory was cleared.');}
 if(blackRun>=4){blackRun=0;const on=stack.filter(e=>e.enabled&&e.intensity>0),bad=on.filter(e=>FEEDBACK.includes(e.id)).at(-1)||on.find(e=>e.id===renderer.lastEffect)||on.at(-1);
  if(bad){bad.enabled=false;renderer.clearHistory();commit();renderStrip();if(drawerOpen)renderDrawer();note((DEFS.get(bad.id)?.name||'An effect')+' kept the picture black, so it was turned off. Undo brings it back.',true);}}}
function frame(now){
 if(!renderer||document.hidden)return;
 if(renderer.gl.isContextLost()){if(!glLostAt)glLostAt=now;else if(now-glLostAt>4000){glLostAt=now;try{renderer.gl.getExtension('WEBGL_lose_context')?.restoreContext();}catch{}}return;}
 const t0=performance.now(),time=now/1000;
 const dt=genLast?Math.min(.1,Math.max(0,time-genLast)):0;genLast=time;stepLfos(lfos,lfoAcc,dt,signals);
 stepTimeline(dt);const T=tl.t;syncTime();drawTimeline();if(review.open)drawTrim();
 if(sourceKind==='demo')drawDemo(T+1);
 signals.kick=Math.max(envAt(beatData.kicks,T),envAt(beatData.liveKicks,T),Math.exp(-(time-lastLK)/.12));signals.hits=Math.max(envAt(beatData.hits,T,.08),envAt(beatData.liveHits,T,.08),Math.exp(-(time-lastLH)/.08));
 if(sourceKind==='gen'&&generator){applyMods(gen,genOut,time,signals);applyKeys(gen,genOut,T);genTime+=(tl.playing?dt:0)*speedFactor(genOut.values[0]);const [gw,gh]=genSize();generator.resize(gw,gh);generator.render(gen.id,genOut.values,genTime,signals,null,gen.id==='text'?textSpec(gen):null);}
 if((sourceKind==='camera'||sourceKind==='video')&&video.readyState<2)return;
 if(!ensureSize())return;
 const level=audio.level(sensitivity),bands=audio.bands(sensitivity);
 signals.level=level;signals.low=bands.low;signals.mid=bands.mid;signals.high=bands.high;signals.beat=beatClock.update(level,now);liveBeats(time,T,level,bands);
 signals.beats=Math.max(0,now-beatOrigin)/60000*beatClock.bpm;signals.phase=signals.beats%1;
 for(let i=0;i<stack.length;i++){const e=stack[i],r=renderStack[i]||(renderStack[i]={values:new Array(6).fill(0)});r.id=e.id;r.enabled=e.enabled;r.hold=e.hold===true;r.reactive=false;if(e.enabled){applyMods(e,r,time,signals);applyKeys(e,r,T);}}
 renderStack.length=stack.length;
 renderer.freeze=frozen||touchFreeze;
 const fxMasks=fxPaint.hasPaint?fxPaint.masks(canvas.width,canvas.height).map(m=>{const i=stack.findIndex(e=>e.id===m.id),e=stack[i];m.values=e?.enabled?renderStack[i].values:(e?.values||[]);return m;}):undefined;
 const w=canvas.width,h=canvas.height,ink=drawing.frame(w,h,time,Object.assign(drawSig,bands,{beat:signals.beat,phase:signals.phase}));
 if(ink&&drawOwner.mods.some(m=>m.target===0)){syncDrawOwners();applyMods(drawOwner,modTmp,time,signals);drawing.opacity=Math.min(1,Math.max(0,drawing.opacity*modTmp.values[0]/Math.max(.05,drawOwner.values[0])));}
 const under=ink&&drawing.model.settings.placement==='under';
 renderer.render(under?drawing.composite(source,w,h):source,renderStack,time,compare,{beat:signals.beat,phase:signals.phase,ink:under?null:ink,inkOpacity:drawing.opacity,fxMasks});
 watchdog(now);
 if(review.open&&review.mode==='live')mirrorReview();
 if(mapUI?.active())mapUI.frame(now,signals);
 if(rendering?.started)renderTick();
 if(drawerOpen&&liveSliders.length)updateLiveSliders(time);if(drawerOpen&&drawerMode==='keys')syncKeysDrawer();if(drawerOpen&&drawerMode==='lfo')drawLfoScopes();
 perfStat(performance.now()-t0);if(quality.update(performance.now()-t0,!!capture?.active||!!rendering))ensureSize();
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
 const sr=$('strip').getBoundingClientRect();
 for(const e of stack){if(only&&e.id!==only)continue;const target=thumbCanvases.get(e.id);if(!target)continue;
  if(!only){const r=target.getBoundingClientRect();if(!target.isConnected||r.right<sr.left-40||r.left>sr.right+40||!r.width)continue;}
  const one=[{id:e.id,enabled:true,intensity:Math.max(.6,e.intensity),values:e.values.slice(),hold:false,reactive:false}];
  thumbRenderer.clearHistory();const passes=['smear','trails','slit','beat','mosh'].includes(e.id)?4:1;for(let i=0;i<passes;i++)thumbRenderer.render(thumbSrc,one,1+i*.3);
  target.getContext('2d').drawImage(mini,0,0);
 }
}

// ---------- Sources ----------
function stopCamera(){if(camera){camera.getTracks().forEach(t=>t.stop());camera=null;}video.srcObject=null;}
function releaseSource(){stopCamera();if(sourceURL){URL.revokeObjectURL(sourceURL);sourceURL=null;}video.removeAttribute('src');video.load?.();clipSource=null;mediaBlob=null;resetBeats();}
function sourceChanged(){if(sourceKind!=='video'&&!DURATIONS.includes(tl.duration)){tl.duration=8;tl.in=0;tl.out=8;tlTouched=false;}if(sourceKind==='video')tlTouched=false;clampRange(tl,mediaDuration());renderCache=null;syncTransport();quality.reset();renderer.clearHistory();ensureSize();fitCanvas();setTimeout(()=>updateThumbs(),120);}
const useDemo=()=>{releaseSource();source=demo;sourceKind='demo';sourceChanged();};
function genSize(){const r=$('stage').getBoundingClientRect(),land=r.width>r.height*1.05,long=Math.round(1280*quality.scale/2)*2,short=Math.round(720*quality.scale/2)*2;return land?[long,short]:[short,long];}
function ensureGenerator(){if(generator)return true;try{generator=new Generator();const gc=generator.canvas;gc?.addEventListener?.('webglcontextlost',e=>{e.preventDefault();});gc?.addEventListener?.('webglcontextrestored',()=>{generator=null;if(sourceKind==='gen')useGen(gen.id,gen,false);});return true;}catch(e){note(e.message,true);generator=false;return false;}}
function useGen(id,state=null,record=true){if(!ensureGenerator())return;const src=GEN_BY_ID.get(id);if(!src)return;
 if(state)gen=normGen(state)||defaultGen(id);else if(gen.id!==id){const keep=gen.values[3],k={text:gen.text,font:gen.font,align:gen.align,style:gen.style};gen=defaultGen(id);gen.values[3]=keep;Object.assign(gen,k);}if(!gen.keys)gen.keys=[];
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
 await loadVideo(file,null);note('Video loaded');
});
// Video file or saved clip onto the timeline. MediaRecorder WebM has no duration header, so it is probed once.
async function loadVideo(blob,clip){
 releaseSource();tlTouched=false;tl.in=0;sourceURL=URL.createObjectURL(blob);video.src=sourceURL;video.loop=tl.loop;video.muted=!(audioMode==='video'||audioMode==='mix');
 await new Promise((ok,bad)=>{video.onloadeddata=ok;video.onerror=()=>bad(new Error('This video could not be opened on this device.'));});
 if(!Number.isFinite(video.duration)){await new Promise(ok=>{const fin=()=>{video.removeEventListener('durationchange',fin);ok();};video.addEventListener('durationchange',fin);try{video.currentTime=1e7;}catch{ok();}setTimeout(fin,1500);});try{video.currentTime=0;}catch{}}
 clipSource=clip?{id:clip.id,name:clip.name,duration:clip.duration}:null;mediaBlob=blob;
 await video.play().catch(()=>{});source=video;sourceKind='video';tl.in=0;tl.out=mediaDuration();sourceChanged();analyzeMedia(blob);
}
const useClip=safe(async clip=>{await loadVideo(clip.blob,clip);note('On the timeline: '+clip.name);renderStrip();});
const useBlob=safe(async blob=>{const out=await decodePhoto(blob,2048);releaseSource();source=out.source;sourceKind='image';sourceChanged();note('Frame is now the source');});

// ---------- 1.7 Timeline: playhead, play/pause, reset, timecode, trim, waveform / KICK / HITS / KEYS tracks ----------
let scrubbing=false;
const finiteDur=()=>{const d=video.duration;return Number.isFinite(d)&&d>0?d:(clipSource?.duration||0);};
function mediaDuration(){return sourceKind==='video'?(finiteDur()||8):tl.duration;}
function stepTimeline(dt){
 prevT=tl.t;
 if(sourceKind==='video'){
  const d=mediaDuration();if(Math.abs(tl.duration-d)>.01){tl.duration=d;if(!tlTouched){tl.in=0;tl.out=d;}clampRange(tl,d);}
  tl.t=Math.min(d,video.currentTime||0);tl.playing=!video.paused&&!video.ended;
  if(scrubbing)return;
  if(rendering?.started)return;
  if(tl.playing&&tl.t>=tl.out-.5/FPS&&tl.out<d-.05){if(tl.loop)seek(tl.in);else video.pause();}
  else if(video.ended&&tl.loop){seek(tl.in);video.play().catch(()=>{});}
  else if(tl.playing&&tl.t<tl.in-.05)seek(tl.in);
  return;}
 if(stepTime(tl,dt))genTime=tl.t*speedFactor(gen.values[0]);
}
function seek(t){t=Math.min(Math.max(0,t),mediaDuration());if(!Number.isFinite(t))t=0;const jump=Math.abs(t-tl.t)>.25;tl.t=t;if(jump)renderer?.clearHistory?.();if(sourceKind==='video'){try{video.currentTime=t;}catch{}}else genTime=t*speedFactor(gen.values[0]);syncTime();}
function seekAsync(t){return new Promise(ok=>{if(sourceKind!=='video'){seek(t);return ok();}let done=false;const fin=()=>{if(done)return;done=true;video.removeEventListener('seeked',fin);ok();};video.addEventListener('seeked',fin);seek(t);setTimeout(fin,1500);});}
function setPlaying(on){if(sourceKind==='video'){if(on)video.play().catch(e=>note(e.message||'Video could not play.',true));else video.pause();}else{if(on&&tl.t>=tl.out-1e-3)seek(tl.in);tl.playing=on;}syncTransport();}
function syncTransport(){
 const playing=sourceKind==='video'?!video.paused&&!video.ended:tl.playing,b=$('vt-play');b.classList.toggle('playing',playing);b.setAttribute('aria-label',playing?'Pause':'Play');b.querySelector('use').setAttribute('href',playing?'#i-pause':'#i-play');
 if(sourceKind==='video')video.loop=tl.loop&&!rendering;$('vt-loop').setAttribute('aria-pressed',String(tl.loop));syncTime();}
let lastTC='';
function syncTime(){const tc=fmtTC(tl.t),sub='/ '+fmtTC(tl.duration)+(tl.in>0||tl.out<tl.duration-1e-3?' · '+(tl.out-tl.in).toFixed(2)+'s':'');if(tc+sub!==lastTC){lastTC=tc+sub;$('vt-time').textContent=tc;$('vt-sub').textContent=sub;}
 if(!scrubbing)$('vt-scrub').value=String(tl.duration>0?Math.round(tl.t/tl.duration*1000):0);}
function bindTransport(){
 $('vt-play').addEventListener('click',()=>{const playing=sourceKind==='video'?!video.paused&&!video.ended:tl.playing;setPlaying(!playing);});
 $('vt-stop').addEventListener('click',()=>{setPlaying(false);seek(tl.in);renderer?.clearHistory();syncTransport();});
 $('vt-loop').addEventListener('click',()=>{tl.loop=!tl.loop;note(tl.loop?'Loop on':'Loop off · plays once');syncTransport();saveSession();});
 $('tl-key').addEventListener('click',()=>{drawerOpen&&drawerMode==='keys'?closeDrawer():openDrawer('keys');});
 $('tl-more').addEventListener('click',()=>{drawerOpen&&drawerMode==='timeline'?closeDrawer():openDrawer('timeline');});
 const scrub=$('vt-scrub');scrub.addEventListener('input',()=>{scrubbing=true;seek(Number(scrub.value)/1000*mediaDuration());});
 scrub.addEventListener('change',()=>{scrubbing=false;renderer?.clearHistory();syncTime();});
 for(const t of ['play','pause','ended','loadedmetadata','durationchange'])video.addEventListener(t,syncTransport);video.addEventListener('timeupdate',syncTime);
 bindTimelineCanvas();
}
// Track canvas layout (CSS px)
const TL={label:44,ruler:[0,15],wave:[15,31],kick:[32,42],hits:[43,53],keys:[53,64]};
const tlX=(t,w)=>TL.label+t/Math.max(1e-6,tl.duration)*w,tlT=(x,w)=>Math.min(tl.duration,Math.max(0,(x-TL.label)/w*tl.duration));
function keysOwner(){if(drawerOpen&&drawerMode==='gen'&&sourceKind==='gen')return gen;const e=stack.find(x=>x.id===selectedFx);if(e&&(drawerOpen&&drawerMode==='fx'||e.keys?.length))return e;if(sourceKind==='gen'&&gen.keys?.length)return gen;return e||null;}
const ownerName=o=>o===gen?(GEN_BY_ID.get(gen.id)?.name||'Source'):(DEFS.get(o.id)?.name||o.id);
const paramName=(o,p)=>p===-1?'Intensity':o===gen?(genParamLabels()[p]||('Param '+(p+1))):(DEFS.get(o.id)?.params[p]?.name||('Param '+(p+1)));
function keyOwners(){return [...stack.filter(e=>e.keys?.length),...(gen.keys?.length?[gen]:[])];}
function drawTimeline(){
 const c=$('tl-canvas');if(!c||!c.offsetParent)return;const dpr=Math.min(2,devicePixelRatio||1),W=c.clientWidth,H=c.clientHeight;if(!W||!H)return;
 if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}
 const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);const w=W-TL.label-8,D=tl.duration,X=t=>tlX(t,w);
 g.fillStyle='#04050b';g.fillRect(0,0,W,H);
 // lanes
 const lanes=[['wave','WAVE','#7a81b4'],['kick','KICK','#ff3b4b'],['hits','HITS','#5b8cff'],['keys','KEYS','#27e889']];
 g.fillStyle='#0a0c19';g.fillRect(0,0,TL.label-4,H);g.strokeStyle='#262c55';g.lineWidth=1;g.beginPath();g.moveTo(TL.label-3.5,0);g.lineTo(TL.label-3.5,H);g.stroke();
 g.font='700 8px ui-monospace,"SF Mono",Menlo,Consolas,monospace';g.textBaseline='middle';
 for(const [k,name,col]of lanes){const [y0,y1]=TL[k];g.fillStyle='rgba(38,44,85,.35)';g.fillRect(TL.label,y0+.5,w,y1-y0-1);g.fillStyle=col;g.fillText(name,5,(y0+y1)/2+.5);}
 g.fillStyle='#7a81b4';g.fillText(fmtTC(tl.t).slice(3),3,7.5);
 // ruler: frame markers + seconds
 const pps=w/Math.max(1e-6,D),ppf=pps/FPS,steps=[1,2,3,5,10,15,30,60,150,300,900];let fs=steps.find(s=>s*ppf>=4)||900;
 g.strokeStyle='rgba(122,129,180,.45)';g.beginPath();const nf=Math.floor(D*FPS);for(let f=0;f<=nf;f+=fs){const x=Math.round(X(f/FPS))+.5,major=f%FPS===0;g.moveTo(x,major?2:9);g.lineTo(x,TL.ruler[1]-1);}g.stroke();
 const secStep=[1,2,5,10,15,30].find(s=>s*pps>=34)||30;g.fillStyle='#9aa1d6';g.font='600 8px ui-monospace,"SF Mono",Menlo,Consolas,monospace';
 for(let sec=secStep;sec<D;sec+=secStep){g.fillText(sec+'s',X(sec)+3,6);}
 // waveform
 const peaks=beatData.peaks||(beatData.livePeaks.some(v=>v>0)?beatData.livePeaks:null),[wy0,wy1]=TL.wave,mid=(wy0+wy1)/2,amp=(wy1-wy0)/2-1.5;
 if(peaks){g.fillStyle='#2f6cff';const n=peaks.length;for(let x=0;x<w;x+=2){const v=peaks[Math.min(n-1,Math.floor(x/w*n))];if(v>0)g.fillRect(TL.label+x,mid-v*amp,1.4,Math.max(1,v*amp*2));}}
 else{g.fillStyle='#4b5288';g.fillText(beatData.status==='analyzing'?'ANALYZING AUDIO…':audioMode==='mic'||audioMode==='mix'?'MIC · PLAY TO RECORD':'NO AUDIO · MOTION → MIC OR A VIDEO WITH SOUND',TL.label+6,mid+.5);}
 // beat markers
 const marks=(list,[y0,y1],col)=>{g.fillStyle=col;for(const t of list){if(t>D)break;const x=X(t);g.fillRect(x-1,y0+1.5,2.2,y1-y0-3);}};
 g.shadowColor='#ff2b3d';g.shadowBlur=4;marks(beatData.kicks,TL.kick,'#ff2b3d');marks(beatData.liveKicks,TL.kick,'#ff5a66');g.shadowColor='#2f6cff';marks(beatData.hits,TL.hits,'#3d7bff');marks(beatData.liveHits,TL.hits,'#6f9bff');g.shadowBlur=0;
 // keyframe diamonds: selected owner bright, others dim
 const sel=keysOwner(),[ky0,ky1]=TL.keys,ky=(ky0+ky1)/2;
 const dia=(x,r,fill,stroke)=>{g.beginPath();g.moveTo(x,ky-r);g.lineTo(x+r,ky);g.lineTo(x,ky+r);g.lineTo(x-r,ky);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.stroke();}};
 for(const o of keyOwners())if(o!==sel)for(const k of o.keys)dia(X(k.t),3,'#3a2a8a',null);
 if(sel?.keys)for(const k of sel.keys){const at=Math.abs(k.t-tl.t)<.5/FPS;dia(X(k.t),at?5:4.2,at?'#ffffff':'#27e889','#06160d');}
 // trim: dim outside, IN/OUT brackets
 g.fillStyle='rgba(0,0,0,.58)';const xi=X(tl.in),xo=X(tl.out);g.fillRect(TL.label,0,xi-TL.label,H);g.fillRect(xo,0,TL.label+w-xo,H);
 g.strokeStyle='#27e889';g.lineWidth=2;g.beginPath();g.moveTo(xi+4,1);g.lineTo(xi,1);g.lineTo(xi,H-1);g.lineTo(xi+4,H-1);g.moveTo(xo-4,1);g.lineTo(xo,1);g.lineTo(xo,H-1);g.lineTo(xo-4,H-1);g.stroke();
 // playhead
 const px=Math.round(X(tl.t))+.5;g.strokeStyle='#ff2b3d';g.lineWidth=2;g.shadowColor='#ff2b3d';g.shadowBlur=8;g.beginPath();g.moveTo(px,4);g.lineTo(px,H);g.stroke();g.shadowBlur=0;
 g.fillStyle='#ff2b3d';g.beginPath();g.moveTo(px-5,0);g.lineTo(px+5,0);g.lineTo(px,6);g.closePath();g.fill();
 if(rendering){g.fillStyle='rgba(255,43,61,.16)';g.fillRect(xi,0,(xo-xi)*(rendering.p||0),H);}
}
function bindTimelineCanvas(){
 const c=$('tl-canvas');let mode=null,key=null,moved=false,owner=null;
 const pos=e=>{const r=c.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top,r.width-TL.label-8];};
 c.addEventListener('pointerdown',e=>{const [x,y,w]=pos(e);try{c.setPointerCapture?.(e.pointerId);}catch{}moved=false;
  if(x<TL.label-2){mode=null;if(y>=TL.keys[0])openDrawer('keys');else if(y>=TL.wave[0])openDrawer('beat');else openDrawer('timeline');return;}
  if(y<TL.ruler[1]+2){const xi=tlX(tl.in,w),xo=tlX(tl.out,w);if(Math.abs(x-xi)<12&&Math.abs(x-xi)<=Math.abs(x-xo)){mode='in';return;}if(Math.abs(x-xo)<12){mode='out';return;}}
  if(y>=TL.keys[0]-2){owner=keysOwner();key=owner?.keys?.reduce((best,k)=>{const d=Math.abs(tlX(k.t,w)-x);return d<10&&(!best||d<best.d)?{k,d}:best;},null)?.k||null;if(key){mode='key';seek(key.t);return;}}
  mode='scrub';scrubbing=true;seek(tlT(x,w));});
 c.addEventListener('pointermove',e=>{if(!mode)return;const [x,,w]=pos(e),t=tlT(x,w);moved=true;
  if(mode==='scrub')seek(t);else if(mode==='in'){tl.in=t;tlTouched=true;clampRange(tl,mediaDuration());}else if(mode==='out'){tl.out=t;tlTouched=true;clampRange(tl,mediaDuration());}
  else if(mode==='key'&&key){moveKey(owner.keys,key,t);seek(key.t);}});
 const up=()=>{if(!mode)return;const m=mode;mode=null;scrubbing=false;if(m==='scrub')renderer?.clearHistory();if(m==='in'||m==='out'){saveSession();syncTime();}if(m==='key'&&moved){commit();if(drawerOpen)renderDrawer();}key=null;};
 c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
}
// Live mic beat detection writes KICK/HITS markers onto the timeline while it plays (overwrite as you play).
function liveBeats(time,T,level,bands){
 if(audioMode!=='mic'&&audioMode!=='mix')return;const k=liveKick.feed(bands.low,time),h=liveHit.feed(bands.high,time);if(k)lastLK=time;if(h)lastLH=time;
 if(tl.playing&&!rendering){recordMarker(beatData.liveKicks,prevT,T,k);recordMarker(beatData.liveHits,prevT,T,h);const n=beatData.livePeaks.length,i=Math.min(n-1,Math.floor(T/Math.max(.1,tl.duration)*n));beatData.livePeaks[i]=Math.max(beatData.livePeaks[i]*.6,Math.min(1,level*1.4));}
}
function resetBeats(){beatData.token++;beatData.status='none';beatData.peaks=null;beatData.kicks=[];beatData.hits=[];beatData.liveKicks=[];beatData.liveHits=[];beatData.livePeaks.fill(0);}
async function analyzeMedia(blob){resetBeats();if(!blob)return;const token=beatData.token;beatData.status='analyzing';
 try{const r=await analyzeBlob(blob,{sensitivity:beatData.sensitivity});if(token!==beatData.token)return;if(!r){beatData.status='noaudio';}else{beatData.status='ready';beatData.peaks=r.peaks;beatData.kicks=r.kicks;beatData.hits=r.hits;}}
 catch{if(token===beatData.token)beatData.status='noaudio';}
 if(drawerOpen&&drawerMode==='beat')renderDrawer();}

// ---------- UI: tabs, strip, drawer ----------
function setTab(next){if(next!=='source')genGrid=false;tab=next;app.dataset.tab=tab;updatePill();if(tab==='perform')hudFlash('Finger FX: drag 1–2 fingers · pinch · twist · hold = freeze · tap = stutter');for(const b of document.querySelectorAll('.tab'))b.setAttribute('aria-selected',String(b.dataset.tab===tab));closeDrawer(false);renderStrip();if(tab==='effects')setTimeout(()=>updateThumbs(),30);if(tab==='frames')refreshFrames();if(tab==='motion')openDrawer('lfo');if(tab==='map')mapUI?.enter();else mapUI?.leave();}
function tile({label,iconName,thumb,on,selected,action,color,onTap,aria,badge,mods}){
 const b=el('button','tile'+(on?' on':'')+(selected?' selected':'')+(action?' action':'')+(color?' '+color:''));b.type='button';b.setAttribute('aria-label',aria||label);if(on!==undefined)b.setAttribute('aria-pressed',String(!!on));
 const t=el('div','thumb');if(thumb)t.append(thumb);else if(iconName)t.append(icon(iconName));if(badge)t.append(el('span','badge',badge));if(mods)t.append(el('span','mods-dot'));b.append(t,el('span','label',label));b.addEventListener('click',onTap);return b;
}
function renderStrip(){
 syncGenEdit();
 const strip=$('strip'),keep=strip.scrollLeft;strip.replaceChildren();
 ({perform:stripPerform,source:stripSource,effects:stripEffects,draw:stripDraw,frames:stripFrames,looks:stripLooks,motion:stripMotion,map:s=>mapUI?.strip(s)})[tab](strip);
 strip.scrollLeft=keep;
}
function refreshUI(){renderStrip();if(drawerOpen)renderDrawer();}
function openDrawer(mode){drawerMode=mode;drawerOpen=true;renderDrawer();}
function closeDrawer(rerender=true){$('drawer').dataset.mode='';liveSliders.length=0;lfoScopes.length=0;drawerOpen=false;drawerMode=null;$('drawer').hidden=true;$('drawer').replaceChildren();syncGenEdit();requestAnimationFrame(fitCanvas);if(rerender)renderStrip();}
function renderDrawer(){
 const d=$('drawer'),keep=d.dataset.mode===drawerMode+'|'+selectedFx&&!d.hidden?d.scrollTop:0;d.replaceChildren();d.hidden=false;d.dataset.mode=drawerMode+'|'+selectedFx;liveSliders.length=0;lfoScopes.length=0;
 const builders={map:d=>mapUI.drawer(d,'map'),venues:d=>mapUI.drawer(d,'venues'),keys:drawerKeys,beat:drawerBeat,timeline:drawerTimeline,clips:drawerClips,clip:drawerClip,lfo:drawerLfo,genlib:drawerGenLib,gen:drawerGen,perform:drawerPerform,fxbrush:drawerFxBrush,fx:drawerFx,brush:drawerBrush,frame:drawerFrame,anim:drawerAnim,look:drawerLook,motion:drawerMotion};
 (builders[drawerMode]||(()=>closeDrawer()))(d);if(keep)d.scrollTop=keep;requestAnimationFrame(fitCanvas);
}
function head(d,title,tag,extra=[]){const h=el('div','d-head'),t=el('div','d-title');t.append(el('b',null,title));if(tag)t.append(el('small',null,tag));const close=el('button','tb-btn icon');close.type='button';close.setAttribute('aria-label','Close controls');close.append(icon('close'));close.addEventListener('click',()=>closeDrawer());h.append(t,...extra,close);d.append(h);return h;}
function slider({label,value,min=0,max=1,step=.01,format=v=>Math.round(v*100)+'%',onInput,onChange,id,lfo}){
 const w=el('div','slider'),l=el('label',null,label),o=el('output',null,format(value)),i=el('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=value;i.id=id||('s'+Math.random().toString(36).slice(2,8));l.htmlFor=i.id;
 i._fmt=format;i.addEventListener('input',()=>{const v=Number(i.value);o.textContent=format(v);onInput?.(v);});i.addEventListener('change',()=>onChange?.(Number(i.value)));w.append(l,o,i);if(lfo)withLfo(w,label,lfo);return w;
}
function select({label,options,value,onChange,lfo}){const w=el('div','slider'),l=el('label',null,label),s=el('select');s.id='q'+Math.random().toString(36).slice(2,8);l.htmlFor=s.id;for(const [v,t]of options){const o=el('option',null,t);o.value=String(v);s.append(o);}s.value=String(value);s.addEventListener('change',()=>onChange(s.value));w.append(l,el('output'),s);if(lfo)withLfo(w,label,lfo,false);return w;}
// One-tap LFO button beside a control + a moving indicator while the parameter is modulated.
const lfoModOf=(owner,index)=>owner.mods?.find(m=>m.target===index&&isGlobalLfo(m.source));
function toggleLfo(owner,index){const m=lfoModOf(owner,index);if(m){owner.mods.splice(owner.mods.indexOf(m),1);return false;}
 if(owner.mods.length>=MAX_MODS){note('Up to '+MAX_MODS+' motions here. Remove one first.',true);return null;}owner.mods.push({target:index,source:'lfo'+(activeLfo+1),shape:'sine',rate:.4,depth:.5,division:2});return true;}
const beatModOf=(owner,index)=>owner.mods?.find(m=>m.target===index&&(m.source==='kick'||m.source==='hits'));
function cycleBeat(owner,index){const m=beatModOf(owner,index);if(m){if(m.source==='kick'){m.source='hits';return 'hits';}owner.mods.splice(owner.mods.indexOf(m),1);return null;}
 if(owner.mods.length>=MAX_MODS){note('Up to '+MAX_MODS+' motions here. Remove one first.',true);return false;}owner.mods.push({target:index,source:'kick',shape:'sine',rate:.4,depth:.6,division:2});return 'kick';}
function toggleKeyHere(owner,index,label){
 if(keyAt(owner.keys,index,tl.t)){removeKey(owner.keys,index,tl.t);note('Key removed · '+label+' @ '+fmtTC(tl.t));}
 else{const first=!hasKeys(owner.keys,index),v=index<0?owner.intensity:owner.values[index];if(!setKey(owner.keys,index,tl.t,v))return note('Up to '+MAX_KEYS+' keyframes here. Remove some first.',true);
  if(stack.includes(owner)&&!owner.enabled){owner.enabled=true;renderer?.clearHistory();}
  note('◆ '+label+' @ '+fmtTC(tl.t)+(first?' · move the playhead, then the slider, for the next key':''));}
 commit();renderStrip();renderDrawer();}
// LFO · BEAT · ◆ buttons beside a control, a moving indicator while it is modulated, and keyframe follow/auto-key.
function withLfo(w,label,{owner,index,after},indicator=true){
 w.classList.add('has-lfo');const mb=el('div','mb'),b=el('button','lfo-btn');b.type='button';const m=lfoModOf(owner,index);b.textContent=m?'LFO '+m.source.slice(3):'LFO';b.classList.toggle('on',!!m);b.setAttribute('aria-pressed',String(!!m));b.setAttribute('aria-label','LFO on '+label);
 b.addEventListener('click',()=>{const r=toggleLfo(owner,index);if(r===null)return;if(owner.id&&stack.includes(owner)&&r&&!owner.enabled){owner.enabled=true;renderer?.clearHistory();}commit();note(r?label+' → LFO '+(activeLfo+1):'LFO off: '+label);renderStrip();after?after():renderDrawer();});
 const bm=beatModOf(owner,index),bb=el('button','beat-btn'+(bm?' on '+bm.source:''),bm?bm.source.toUpperCase():'BEAT');bb.type='button';bb.setAttribute('aria-pressed',String(!!bm));bb.setAttribute('aria-label','Beat track on '+label);
 bb.addEventListener('click',()=>{const r=cycleBeat(owner,index);if(r===false)return;if(r&&stack.includes(owner)&&!owner.enabled){owner.enabled=true;renderer?.clearHistory();}commit();note(r?label+' ← '+r.toUpperCase()+' track':'Beat off: '+label);if(r&&beatData.status!=='ready'&&audioMode!=='mic'&&audioMode!=='mix')setTimeout(()=>note('Beat tracks need a video with sound or the Mic (Motion tab).'),1400);renderStrip();after?after():renderDrawer();});
 mb.append(b,bb);
 const keyable=Array.isArray(owner.keys)&&(owner===gen||stack.includes(owner));let kb=null;
 if(keyable){kb=el('button','key-btn');kb.type='button';kb.append(el('span','dia'));kb.setAttribute('aria-label','Keyframe '+label);kb.classList.toggle('track',hasKeys(owner.keys,index));kb.classList.toggle('on',!!keyAt(owner.keys,index,tl.t));kb.addEventListener('click',()=>toggleKeyHere(owner,index,label));mb.append(kb);}
 w.append(mb);const ctl=w.querySelector('input[type=range],select');
 if(keyable&&ctl){ctl.addEventListener(ctl.tagName==='SELECT'?'change':'input',()=>{if(hasKeys(owner.keys,index)){const kt=ctl._kt??tl.t;if(setKey(owner.keys,index,kt,index<0?owner.intensity:owner.values[index]))kb.classList.add('on');else friendly('Up to '+MAX_KEYS+' keyframes here. Remove some first.');}});
  // One key per drag: the key goes where the playhead was when the finger touched the slider (no key trail while playing).
  ctl.addEventListener('pointerdown',()=>{ctl._drag=true;ctl._kt=tl.t;});for(const t of ['pointerup','pointercancel','change','blur'])ctl.addEventListener(t,()=>{ctl._drag=false;ctl._kt=null;});}
 if(bm){const amt=el('div','beat-amt'),l=el('label',null,bm.source.toUpperCase()+' intensity'),o=el('output',null,Math.round(bm.depth*100)+'%'),i=el('input');i.type='range';i.min=0;i.max=1;i.step=.01;i.value=bm.depth;i.id='ba'+Math.random().toString(36).slice(2,8);l.htmlFor=i.id;i.setAttribute('aria-label',bm.source+' intensity for '+label);
  i.addEventListener('input',()=>{bm.depth=Number(i.value);o.textContent=Math.round(bm.depth*100)+'%';});i.addEventListener('change',commit);amt.append(l,o,i);w.append(amt);}
 if(!indicator)return;const ind=el('span','lfo-ind'),dot=el('i');ind.append(dot);ind.hidden=true;w.append(ind);liveSliders.push({owner,index,ind,dot,kb,ctl,out:w.querySelector('output'),last:null});
}
function syncDrawOwners(){const s=drawing.model.settings;drawOwner.values[0]=s.opacity;drawOwner.values[1]=(s.size-1)/79;fxbOwner.values[0]=(fxBrush.size-6)/194;fxbOwner.values[1]=fxBrush.strength;}
function updateLiveSliders(time){const seen=new Map();syncDrawOwners();
 for(const s of liveSliders){const mods=s.owner.mods||[];const on=mods.some(m=>m.target===s.index);if(s.ind.hidden===on)s.ind.hidden=!on;if(!on)continue;
  let out=seen.get(s.owner);if(!out){out={values:new Array(8).fill(0),intensity:1};applyMods(s.owner,out,time,signals);applyKeys(s.owner,out,tl.t);seen.set(s.owner,out);}
  const v=s.index<0?out.intensity:out.values[s.index];s.dot.style.left=(Math.min(1,Math.max(0,v))*100).toFixed(1)+'%';}
 for(const s of liveSliders){if(!s.kb||!s.owner.keys)continue;const keyed=hasKeys(s.owner.keys,s.index),at=keyed&&!!keyAt(s.owner.keys,s.index,tl.t);if(s.kb.classList.contains('track')!==keyed)s.kb.classList.toggle('track',keyed);if(s.kb.classList.contains('on')!==at)s.kb.classList.toggle('on',at);
  if(!keyed||!s.ctl||s.ctl._drag)continue;const kv=keyValue(s.owner.keys,s.index,tl.t);if(kv===null||kv===s.last)continue;s.last=kv;
  if(s.ctl.tagName==='SELECT'){const n=s.ctl.options.length-1;s.ctl.value=String(Math.round(kv*n));}else{s.ctl.value=String(kv);if(s.out&&s.ctl._fmt)s.out.textContent=s.ctl._fmt(kv);}}}
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
 reset.addEventListener('click',()=>{const had=(e.keys?.length||0)+(e.mods?.length||0);e.intensity=1;e.values=def.params.map(p=>p.value);e.mods=[];e.keys=[];e.hold=false;renderer.clearHistory();commit();updateThumbs(e.id);renderStrip();renderDrawer();note(def.name+' reset'+(had?' · keys and motions cleared (Undo brings them back)':''));});
 const hasLfo=e.mods.some(m=>isGlobalLfo(m.source)),lfoq=el('button','switch lfo-switch'+(hasLfo?' on':''),'LFO');lfoq.type='button';lfoq.setAttribute('aria-pressed',String(hasLfo));lfoq.setAttribute('aria-label','LFO on this effect');
 lfoq.addEventListener('click',()=>{if(e.mods.some(m=>isGlobalLfo(m.source))){e.mods=e.mods.filter(m=>!isGlobalLfo(m.source));note(def.name+': LFO off');}else{const t=def.params.findIndex(p=>!p.options);toggleLfo(e,t>=0?t:-1);if(!e.enabled){e.enabled=true;renderer.clearHistory();}note(def.name+' → LFO '+(activeLfo+1));}commit();renderStrip();renderDrawer();});
 head(d,def.name,def.tag,[reset,lfoq,power]);
 if(e.hold&&FEEDBACK.includes(e.id)){const r=el('div','row');r.append(chip('Memory frozen · release',()=>{e.hold=false;renderer.clearHistory();commit();renderDrawer();},true));d.append(r);}
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
  grid.append(slider({label:m.source==='kick'||m.source==='hits'?'Intensity':'Depth',value:m.depth,onInput:v=>{m.depth=v;},onChange:commit}));
  const rm=chip('Remove',()=>{e.mods.splice(mi,1);commit();renderStrip();renderDrawer();});
  box.append(grid,rm);d.append(box);
 });
 if(e.mods.some(m=>m.source==='kick'||m.source==='hits')&&beatData.status!=='ready'&&audioMode!=='mic'&&audioMode!=='mix')d.append(el('p','section-label','KICK / HITS tracks need a video with sound or the Mic (Motion tab).'));
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
  t.addEventListener('pointerdown',ev=>{if(!momentary)return;ev.preventDefault();try{t.setPointerCapture?.(ev.pointerId);}catch{}prior=e.enabled;e.enabled=true;selectedFx=e.id;updatePill();t.classList.add('on','selected');});
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
 if(FEEDBACK.includes(e.id))row.append(chip(e.hold?'Memory frozen · release':'Freeze memory',()=>{e.hold=!e.hold;renderer?.clearHistory();commit();renderDrawer();renderStrip();},e.hold===true));
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
 strip.append(tile({label:'Make clip',iconName:'clips',action:true,color:'red',aria:'Make clip from the timeline range',onTap:()=>openReview()}));
 strip.append(tile({label:'Clips',iconName:'clips',action:true,color:'purple',badge:clipList.length?String(clipList.length):undefined,aria:'Clips library',onTap:()=>drawerOpen&&(drawerMode==='clips'||drawerMode==='clip')?closeDrawer():openDrawer('clips')}));
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
 const styles=el('div','row style-row');for(const [k,name] of TEXT_STYLES)styles.append(chip(name,()=>{gen.style=k;commit();renderDrawer();note('Text style: '+name);},(gen.style||'glitch')===k));
 box.append(label('Animated style'),styles,label('Font'),fonts,label('Align'),aligns);d.append(box);
}
function editGenText(){if(sourceKind!=='gen'||gen.id!=='text'){useGen('text');renderStrip();}if(sourceKind!=='gen'||gen.id!=='text')return;if(tab!=='source')setTab('source');openDrawer('gen');const t=$('gen-text');if(t){t.focus();const n=t.value.length;t.setSelectionRange?.(n,n);t.scrollIntoView?.({block:'nearest'});}}
function drawerGen(d){
 if(sourceKind!=='gen')return closeDrawer();const src=GEN_BY_ID.get(gen.id),params=genParams(src),labels=genParamLabels();if(!gen.keys)gen.keys=[];
 const reset=el('button','tb-btn icon');reset.type='button';reset.setAttribute('aria-label','Reset source');reset.append(icon('reset'));reset.addEventListener('click',()=>{const keep={text:gen.text,font:gen.font,align:gen.align,style:gen.style};gen=defaultGen(gen.id);Object.assign(gen,keep);commit();renderDrawer();note(src.name+' reset');});
 head(d,src.name,'GENERATIVE SOURCE',[reset]);
 if(gen.id==='text')textEditor(d);
 params.forEach((p,i)=>{if(p.options){const row=el('div','row');p.options.forEach((name,n)=>row.append(chip(name,()=>{gen.values[i]=n/p.max;commit();renderDrawer();},Math.round(gen.values[i]*p.max)===n)));d.append(label('Palette'),row);}
  else d.append(slider({label:labels[i],value:gen.values[i],onInput:v=>{gen.values[i]=v;saveSession();},onChange:()=>commit(),lfo:{owner:gen,index:i}}));});
 const add=chip('+ Add',()=>{if(gen.mods.length>=MAX_MODS)return note('Up to '+MAX_MODS+' motions.',true);gen.mods.push(normalizeMods([{target:4,source:audioMode==='none'?'lfo':'level'}],6)[0]);commit();renderDrawer();});
 d.append(label('Motion (LFO · tempo · audio)',add));
 const targets=params.map((p,i)=>[i,labels[i]]).filter(([i])=>i!==3);
 gen.mods.forEach((m,mi)=>{const box=el('div','mod'),grid=el('div','mod-grid');
  grid.append(select({label:'Moves',options:targets,value:m.target<0?0:m.target,onChange:v=>{m.target=Number(v);commit();}}),select({label:'Driven by',options:SOURCES,value:m.source,onChange:v=>{m.source=v;commit();renderDrawer();}}));
  if(m.source==='lfo'||m.source==='bpm')grid.append(select({label:'Shape',options:SHAPES,value:m.shape,onChange:v=>{m.shape=v;commit();}}));
  if(m.source==='bpm')grid.append(select({label:'Rate',options:DIVISION_LABELS.map((t,i)=>[i,t]),value:m.division,onChange:v=>{m.division=Number(v);commit();}}));
  if(m.source==='lfo')grid.append(slider({label:'Speed',value:m.rate,format:v=>(.05*Math.pow(160,v)).toFixed(2)+' Hz',onInput:v=>{m.rate=v;},onChange:commit}));
  grid.append(slider({label:m.source==='kick'||m.source==='hits'?'Intensity':'Depth',value:m.depth,onInput:v=>{m.depth=v;},onChange:commit}));box.append(grid,chip('Remove',()=>{gen.mods.splice(mi,1);commit();renderDrawer();}));d.append(box);});
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
 strip.append(tile({label:'Clips',iconName:'clips',action:true,color:'purple',badge:clipList.length?String(clipList.length):undefined,aria:'Clips library',onTap:()=>drawerOpen&&(drawerMode==='clips'||drawerMode==='clip')?closeDrawer():openDrawer('clips')}));
 strip.append(tile({label:'Last frame',iconName:'frame',action:true,aria:'Use last captured frame as source',onTap:()=>{const f=frameList.at(-1);if(!f)return note('Capture a frame first (Frames tab).');useBlob(f.blob).then(()=>renderStrip());}}));
}

// Motion
async function setAudio(mode){try{await audio.configure(mode);audioMode=mode;note(mode==='none'?'Audio off':mode==='mic'?'Mic listening (never recorded unless you record)':mode==='video'?'Clip audio':'Mic + clip');}catch(e){note(e.message||'Audio unavailable.',true);}renderStrip();}
function stripMotion(strip){
 const links=stack.reduce((n,e)=>n+e.mods.filter(m=>isGlobalLfo(m.source)).length,0)+[gen,drawOwner,fxbOwner].reduce((n,o)=>n+o.mods.filter(m=>isGlobalLfo(m.source)).length,0);
 strip.append(tile({label:'LFOs',iconName:'lfo',action:true,color:'purple',badge:String(links||LFO_COUNT),selected:drawerOpen&&drawerMode==='lfo',aria:'LFO panel',onTap:()=>drawerOpen&&drawerMode==='lfo'?closeDrawer():openDrawer('lfo')}));
 strip.append(tile({label:'Random LFOs',iconName:'shuffle',action:true,color:'blue',aria:'Randomize LFOs on active effects',onTap:randomizeLfos}));
 strip.append(tile({label:'Beat tracks',iconName:'beat',action:true,color:'red',badge:beatData.kicks.length+beatData.liveKicks.length?String(beatData.kicks.length+beatData.liveKicks.length):undefined,aria:'Beat tracks: kick and hits',onTap:()=>drawerOpen&&drawerMode==='beat'?closeDrawer():openDrawer('beat')}));
 strip.append(tile({label:'Keyframes',iconName:'key',action:true,color:'green',aria:'Keyframes',onTap:()=>drawerOpen&&drawerMode==='keys'?closeDrawer():openDrawer('keys')}));
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

function genParamLabels(){const src=GEN_BY_ID.get(gen.id);const ps=src?genParams(src).map(p=>p.name):[];if(gen.id==='text'){const l=STYLE_LABELS[gen.style||'glitch']||STYLE_LABELS.glitch;ps[4]=l[0];ps[5]=l[1];}return ps;}
// Keyframes drawer: every keyed track, prev/next key, ease per track, delete / clear.
let keysSig='';
function syncKeysDrawer(){const sig=fmtTC(tl.t)+JSON.stringify(keyOwners().map(o=>o.keys));if(sig!==keysSig){keysSig=sig;const y=$('drawer').scrollTop;renderDrawer();$('drawer').scrollTop=y;}}
function drawerKeys(d){
 keysSig=fmtTC(tl.t)+JSON.stringify(keyOwners().map(o=>o.keys));
 head(d,'Keyframes','SET A VALUE · MOVE THE PLAYHEAD · SET ANOTHER');
 const owners=keyOwners(),nav=el('div','row');
 const go=dir=>()=>{const t=nextKeyTime(owners,tl.t,dir);if(t===null)return note(dir>0?'No later keys':'No earlier keys');setPlaying(false);seek(t);};
 nav.append(button('Prev key','left',go(-1)),button('Next key','right',go(1)),button('Delete at '+fmtTC(tl.t),'trash',()=>{let n=0;for(const o of owners)for(const p of keyedParams(o.keys))if(removeKey(o.keys,p,tl.t))n++;if(!n)return note('No keys at the playhead');commit();renderDrawer();note(n+' key'+(n>1?'s':'')+' deleted · Undo to restore');},'danger'));d.append(nav);
 d.append(el('p','hint','Tap ◆ beside any effect or generative slider to key it at the playhead. With keys on, moving the slider writes a key at the playhead. Drag diamonds on the KEYS track to retime.'));
 if(!owners.length){d.append(el('p','empty-note','No keyframes yet.'));return;}
 const past=owners.reduce((n,o)=>n+o.keys.filter(k=>k.t>tl.duration+1e-6).length,0);if(past)d.append(el('p','hint warn',past+' key'+(past>1?'s are':' is')+' past the end of this source ('+fmtTC(tl.duration)+'); they hold their value. Load a longer source or delete them.'));
 for(const o of owners){d.append(label(ownerName(o)+' · '+o.keys.length+' KEY'+(o.keys.length>1?'S':'')+(o.enabled===false?' · EFFECT OFF (keys wait)':'')));
  for(const p of keyedParams(o.keys)){const tr=trackOf(o.keys,p),row=el('div','key-track'),top=el('div','kt-top');
   top.append(el('b',null,paramName(o,p)),el('span','kt-val',Math.round((keyValue(o.keys,p,tl.t)??0)*100)+'%'));
   const lane=el('div','kt-lane');for(const k of tr){const dm=el('button','kt-dia'+(Math.abs(k.t-tl.t)<.5/FPS?' at':''));dm.type='button';dm.style.left=(Math.min(1,k.t/Math.max(1e-6,tl.duration))*100).toFixed(2)+'%';if(k.t>tl.duration+1e-6)dm.classList.add('past');dm.setAttribute('aria-label',paramName(o,p)+' key at '+fmtTC(k.t));dm.title=fmtTC(k.t);dm.addEventListener('click',()=>{setPlaying(false);seek(k.t);});lane.append(dm);}
   const ph=el('i','kt-ph');ph.style.left=(tl.t/Math.max(1e-6,tl.duration)*100).toFixed(2)+'%';lane.append(ph);
   const eases=el('div','row');const cur=tr.every(k=>k.e==='ease')?'ease':tr.every(k=>k.e==='linear')?'linear':null;for(const [k,name]of EASES)eases.append(chip(name,()=>{for(const x of tr)x.e=k;commit();renderDrawer();},cur===k));
   eases.append(chip('Clear track',()=>{o.keys=o.keys.filter(k=>k.p!==p);commit();renderDrawer();note('Track cleared · Undo to restore');}));
   row.append(top,lane,el('div','kt-times',tr.map(k=>fmtTC(k.t)).join('  ◆  ')),eases);d.append(row);}}
}
// Beat tracks drawer: KICK / HITS from clip audio or mic, sensitivity, links with intensity sliders.
function beatLinks(){const out=[];for(const e of stack)for(const m of e.mods)if(m.source==='kick'||m.source==='hits')out.push([e,m]);for(const o of [gen,drawOwner,fxbOwner])for(const m of o.mods)if(m.source==='kick'||m.source==='hits')out.push([o,m]);return out;}
function linkName(o,m){if(o===drawOwner)return 'Draw · '+(m.target===0?'Opacity':'Size');if(o===fxbOwner)return 'FX Brush · '+(m.target===0?'Size':'Strength');return ownerName(o)+' · '+paramName(o,m.target);}
function drawerBeat(d){
 head(d,'Beat tracks','KICK · HITS · FROM CLIP AUDIO OR MIC');
 const mic=audioMode==='mic'||audioMode==='mix',st=beatData.status;
 const status=st==='ready'?'Clip audio: '+beatData.kicks.length+' kicks · '+beatData.hits.length+' hits':st==='analyzing'?'Analyzing clip audio…':st==='noaudio'?'This clip has no audio track.':sourceKind==='video'?'Clip audio not analyzed.':'No clip audio on this source.';
 d.append(el('p','beat-status',status+(mic?' · Mic live: '+beatData.liveKicks.length+' kicks · '+beatData.liveHits.length+' hits recorded':'')));
 const row=el('div','row');
 if(mediaBlob)row.append(button('Analyze again','beat',()=>analyzeMedia(mediaBlob).then(()=>renderDrawer()),'blue'));
 row.append(button(mic?'Mic off':'Mic on','mic',()=>setAudio(mic?'none':'mic').then(()=>renderDrawer()),mic?'on':''));
 if(beatData.liveKicks.length||beatData.liveHits.length)row.append(button('Clear mic markers','trash',()=>{beatData.liveKicks=[];beatData.liveHits=[];beatData.livePeaks.fill(0);renderDrawer();}));
 d.append(row);
 if(mediaBlob)d.append(slider({label:'Sensitivity',value:beatData.sensitivity,min:.5,max:2,step:.05,format:v=>v.toFixed(2)+'×',onInput:v=>{beatData.sensitivity=v;},onChange:()=>analyzeMedia(mediaBlob).then(()=>renderDrawer())}));
 const sel=stack.find(e=>e.id===selectedFx),quick=el('div','row');
 if(sel){for(const src of ['kick','hits'])quick.append(chip(src.toUpperCase()+' → '+DEFS.get(sel.id).name,()=>{if(sel.mods.length>=MAX_MODS)return note('Up to '+MAX_MODS+' motions per effect.',true);sel.mods.push({target:-1,source:src,shape:'sine',rate:.4,depth:.6,division:2});if(!sel.enabled){sel.enabled=true;renderer.clearHistory();}commit();renderStrip();renderDrawer();}));d.append(label('Quick link (selected effect intensity)'),quick);}
 const links=beatLinks();d.append(label('Linked parameters · '+links.length));
 if(!links.length)d.append(el('p','hint','Tap BEAT beside any slider: once = KICK, twice = HITS, three times = off.'));
 for(const [o,m]of links){const box=el('div','mod beat-link'),src=el('div','row');
  for(const k of ['kick','hits'])src.append(chip(k.toUpperCase(),()=>{m.source=k;commit();renderDrawer();},m.source===k));src.append(chip('Remove',()=>{o.mods.splice(o.mods.indexOf(m),1);commit();renderStrip();renderDrawer();}));
  box.append(el('b','bl-name',linkName(o,m)),slider({label:'Intensity',value:m.depth,onInput:v=>{m.depth=v;},onChange:commit}),src);d.append(box);}
}
// Timeline settings: length, trim in/out, review / make clip.
function drawerTimeline(d){
 head(d,'Timeline',sourceKind==='video'?'CLIP LENGTH '+fmtTC(tl.duration):'LENGTH · TRIM · OUTPUT');
 if(sourceKind!=='video'){const row=el('div','row');for(const v of DURATIONS)row.append(chip(v+' s',()=>{tl.duration=v;if(!tlTouched){tl.in=0;tl.out=v;}clampRange(tl,v);saveSession();renderDrawer();},tl.duration===v));d.append(label('Length'),row);}
 const tr=el('div','row');tr.append(button('Set IN','left',()=>{tl.in=Math.min(tl.t,tl.out-.2);tlTouched=true;clampRange(tl,mediaDuration());saveSession();renderDrawer();}),button('Set OUT','right',()=>{tl.out=Math.max(tl.t,tl.in+.2);tlTouched=true;clampRange(tl,mediaDuration());saveSession();renderDrawer();}),button('Full range','reset',()=>{tl.in=0;tl.out=mediaDuration();tlTouched=false;saveSession();renderDrawer();}));
 d.append(label('Trim',el('span','tc-inline','IN '+fmtTC(tl.in)+' · OUT '+fmtTC(tl.out))),tr,el('p','hint','Or drag the green IN / OUT brackets on the timeline ruler.'));
 const out=el('div','row');out.append(button('Review','film',()=>openReview(),'accent'),button('Make clip','clips',makeClip,'blue'),button('Clips library','clips',()=>{openDrawer('clips');}));d.append(label('Output'),out);
}
// Clips library (IndexedDB): thumbnails, rename, delete with confirm, use as source, review/export.
async function refreshClips(){try{clipList=await clips.list();}catch{clipList=[];}for(const [id,u]of clipThumbs)if(!clipList.some(c=>c.id===id)){URL.revokeObjectURL(u);clipThumbs.delete(id);}if(drawerOpen&&(drawerMode==='clips'||drawerMode==='clip'))renderDrawer();if(tab==='frames'||tab==='source')renderStrip();}
const clipThumbs=new Map();const clipThumb=c=>{if(!c.thumb)return null;let u=clipThumbs.get(c.id);if(!u){u=URL.createObjectURL(c.thumb);clipThumbs.set(c.id,u);}return u;};
function clipTile(c,onTap){const img=el('img');img.alt='';const u=clipThumb(c);if(u)img.src=u;return tile({label:c.name,thumb:u?img:null,iconName:u?null:'clips',badge:c.duration.toFixed(1)+'s',selected:selectedClip===c.id,aria:'Clip '+c.name,onTap});}
function drawerClips(d){
 head(d,'Clips library',clipList.length+' CLIP'+(clipList.length===1?'':'S')+' · ON THIS DEVICE'+(clips.persistent?'':' (SESSION ONLY)'));
 const row=el('div','row');row.append(button('Make clip from timeline','clips',makeClip,'accent'));d.append(row);
 if(!clipList.length){d.append(el('p','empty-note','No clips yet. Set IN / OUT on the timeline, then Make clip: effects, keyframes, beat motion and text are baked in.'));return;}
 const grid=el('div','gen-grid clip-grid');for(const c of clipList)grid.append(clipTile(c,()=>{selectedClip=c.id;openDrawer('clip');}));d.append(grid);
}
function drawerClip(d){
 const c=clipList.find(x=>x.id===selectedClip);if(!c)return openDrawer('clips');
 const back=el('button','tb-btn icon');back.type='button';back.setAttribute('aria-label','Back to clips');back.append(icon('left'));back.addEventListener('click',()=>openDrawer('clips'));
 head(d,c.name,'CLIP · '+fmtTC(c.duration)+' · '+c.width+'×'+c.height,[back]);
 const panel=el('div','frame-panel'),img=el('img','preview-img');img.alt='Clip '+c.name;const u=clipThumb(c);if(u)img.src=u;
 const acts=el('div','frame-actions');
 acts.append(button('Use as source','image',()=>{useClip(c);},'blue'),button('Review & export','film',()=>openReview({clip:c}),'accent'),button('Delete','trash',()=>openSheet('Delete clip?',b=>{b.append(el('p',null,'“'+c.name+'” will be removed from this device. This cannot be undone.'),button('Delete clip','trash',safe(async()=>{await clips.remove(c.id);selectedClip=null;closeSheet();await refreshClips();openDrawer('clips');note('Clip deleted');}),'danger'),button('Keep it','close',closeSheet));}),'danger'));
 panel.append(img,acts);d.append(panel);
 const w=el('div','slider'),l=el('label',null,'Name'),i=el('input');i.type='text';i.maxLength=40;i.value=c.name;i.id='clip-name';l.htmlFor=i.id;
 i.addEventListener('change',safe(async()=>{await clips.rename(c.id,i.value);await refreshClips();note('Clip renamed');}));w.append(l,el('output'),i);d.append(w);
 d.append(el('p','hint',(c.blob.size/1048576).toFixed(1)+' MB · '+(c.type.includes('mp4')?'MP4':'WebM')+' · saved '+new Date(c.created).toLocaleString()));
}

// ---------- Sheets (source, save, ready-to-save) ----------
function openSheet(title,build){$('sheet-title').textContent=title;const b=$('sheet-body');b.replaceChildren();build(b);$('sheet').hidden=false;}
function closeSheet(){$('sheet').hidden=true;$('sheet-body').replaceChildren();}
function readyToSave(blob,name,title,detail){openSheet(title,b=>{b.append(el('p',null,name+' · '+detail),button('Save / Share','share',safe(async()=>{const r=await saveBlob(blob,name);if(r!=='cancelled')closeSheet();}),'accent'),button('Close','close',closeSheet));});}
function toggleRecord(){
 if(capture?.active){capture.stop('user');return;}
 capture=new Capture(canvas,{onTick:s=>{$('rec-badge').textContent='REC '+Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');},onFinish:({blob,duration})=>{$('rec-badge').hidden=true;readyToSave(blob,'pixelpusher-'+stamp()+(blob.type.includes('mp4')?'.mp4':'.webm'),'Recording ready',duration.toFixed(1)+' s · '+(blob.size/1048576).toFixed(1)+' MB');},onError:e=>{$('rec-badge').hidden=true;note(e.message,true);}});
 try{capture.start({audioTracks:audio.tracks(),seconds:180});$('rec-badge').hidden=false;$('rec-badge').textContent='REC 0:00';}catch(e){note(e.message,true);}
}

// ---------- 1.7 Review: full-size looped preview of IN→OUT, trim, Back to edit, Save to Photos / Share, Make clip ----------
const rvState=()=>review.mode==='clip'?review:tl;
function openReview(opts={}){
 if(rendering)return;const r=$('review');review.open=true;review.ready=null;review.mode=opts.clip?'clip':'live';review.clip=opts.clip||null;
 const v=$('rv-video'),view=$('rv-view');
 if(review.clip){review.url=URL.createObjectURL(review.clip.blob);v.src=review.url;v.hidden=false;view.hidden=true;review.dur=review.clip.duration||1;review.in=0;review.out=review.dur;v.muted=false;v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});}
 else{v.hidden=true;view.hidden=false;review.wasLoop=tl.loop;tl.loop=true;syncTransport();seek(tl.in);setPlaying(true);}
 $('rv-title').textContent=review.clip?review.clip.name.toUpperCase():'REVIEW';$('rv-sub').textContent=review.clip?'CLIP · LOOPING IN → OUT':'LOOPING IN → OUT · EFFECTS, KEYS, BEAT, TEXT';
 for(const id of ['rv-png','rv-frames','rv-record'])$(id).hidden=!!review.clip;$('rv-clip').querySelector('span').textContent=review.clip?'Save trim as clip':'Make clip';$('rv-use').hidden=!review.clip;
 syncReviewButtons();r.hidden=false;
}
function closeReview(){if(rendering)return note('Rendering… keep the app open.');review.open=false;$('review').hidden=true;const v=$('rv-video');v.pause();v.removeAttribute('src');v.load?.();if(review.url){URL.revokeObjectURL(review.url);review.url=null;}
 if(review.mode==='live'){tl.loop=review.wasLoop;syncTransport();}review.clip=null;review.mode='live';}
function syncReviewButtons(){const p=$('rv-photos').querySelector('span'),sh=$('rv-share').querySelector('span');p.textContent=review.ready==='photos'?'Tap to save video':'Save to Photos';sh.textContent=review.ready==='share'?'Tap to share video':'Share';$('rv-photos').classList.toggle('ready',review.ready==='photos');$('rv-share').classList.toggle('ready',review.ready==='share');}
function mirrorReview(){const v=$('rv-view');if(v.width!==canvas.width||v.height!==canvas.height){v.width=canvas.width;v.height=canvas.height;}v.getContext('2d').drawImage(canvas,0,0);}
function drawTrim(){
 const c=$('rv-trim');if(!c.offsetParent)return;const dpr=Math.min(2,devicePixelRatio||1),W=c.clientWidth,H=c.clientHeight;if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}
 const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);const st=rvState(),D=review.mode==='clip'?review.dur:tl.duration,pad=16,w=W-pad*2,X=t=>pad+t/Math.max(1e-6,D)*w;
 const t=review.mode==='clip'?$('rv-video').currentTime||0:tl.t;
 if(review.mode==='clip'){const v=$('rv-video');if(!v.paused&&(t>=review.out-.03||t<review.in-.05)){try{v.currentTime=review.in;}catch{}}}
 g.fillStyle='#05060c';g.fillRect(0,0,W,H);g.fillStyle='#10132a';g.fillRect(pad,10,w,H-20);
 if(review.mode==='live'){const pk=beatData.peaks;if(pk){g.fillStyle='rgba(47,108,255,.55)';for(let x=0;x<w;x+=3){const v=pk[Math.floor(x/w*pk.length)];g.fillRect(pad+x,H/2-v*(H/2-14),2,Math.max(1,v*(H-28)));}}
  g.fillStyle='#ff2b3d';for(const k of beatData.kicks)if(k<=D)g.fillRect(X(k)-1,H-16,2,5);}
 const xi=X(st.in),xo=X(st.out);g.fillStyle='rgba(0,0,0,.6)';g.fillRect(pad,10,xi-pad,H-20);g.fillRect(xo,10,pad+w-xo,H-20);
 g.strokeStyle='#27e889';g.lineWidth=2;g.strokeRect(xi,9,xo-xi,H-18);
 for(const [x,lab] of [[xi,'IN'],[xo,'OUT']]){g.fillStyle='#27e889';g.fillRect(x-6,4,12,H-8);g.fillStyle='#04130b';g.fillRect(x-1,H/2-8,2,16);g.fillStyle='#27e889';g.font='800 8px ui-monospace,Menlo,monospace';g.fillText(lab,Math.min(W-22,Math.max(2,x-8)),H-0.5);}
 const px=X(Math.min(D,t));g.strokeStyle='#ff2b3d';g.lineWidth=2;g.beginPath();g.moveTo(px,2);g.lineTo(px,H-2);g.stroke();
 if(rendering){g.fillStyle='rgba(255,43,61,.25)';g.fillRect(xi,10,(xo-xi)*(rendering.p||0),H-20);}
 const tc=fmtTC(t),a=fmtTC(st.in),b=fmtTC(st.out),len=(st.out-st.in).toFixed(2)+' s';if($('rv-tc').textContent!==tc)$('rv-tc').textContent=tc;if($('rv-in').textContent!==a)$('rv-in').textContent=a;if($('rv-out').textContent!==b)$('rv-out').textContent=b;if($('rv-len').textContent!==len)$('rv-len').textContent=len;
}
function bindReview(){
 $('rv-back').addEventListener('click',closeReview);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&review.open)closeReview();});
 const c=$('rv-trim');let mode=null;
 const tAt=e=>{const r=c.getBoundingClientRect(),D=review.mode==='clip'?review.dur:tl.duration;return Math.min(D,Math.max(0,(e.clientX-r.left-16)/(r.width-32)*D));};
 c.addEventListener('pointerdown',e=>{if(rendering)return;try{c.setPointerCapture?.(e.pointerId);}catch{}const st=rvState(),t=tAt(e),D=review.mode==='clip'?review.dur:tl.duration,tol=D*14/Math.max(1,c.clientWidth-32);
  mode=Math.abs(t-st.in)<tol&&Math.abs(t-st.in)<=Math.abs(t-st.out)?'in':Math.abs(t-st.out)<tol?'out':'seek';move(e);});
 const move=e=>{if(!mode)return;const st=rvState(),t=tAt(e),D=review.mode==='clip'?review.dur:tl.duration;
  if(mode==='seek'){if(review.mode==='clip'){try{$('rv-video').currentTime=Math.min(Math.max(t,st.in),st.out);}catch{}}else seek(Math.min(Math.max(t,st.in),st.out));return;}
  if(mode==='in')st.in=Math.min(t,st.out-.2);else st.out=Math.max(t,st.in+.2);if(review.mode==='live'){tlTouched=true;clampRange(tl,mediaDuration());}else{st.in=Math.max(0,st.in);st.out=Math.min(D,st.out);}review.ready=null;syncReviewButtons();};
 c.addEventListener('pointermove',move);const up=()=>{if(mode&&mode!=='seek'){if(review.mode==='live'){saveSession();seek(tl.in);}else{try{$('rv-video').currentTime=review.in;}catch{}}}mode=null;};c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
 const exportAs=kind=>safe(async()=>{if(rendering)return;
  if(review.ready===kind&&review.result){const r=review.result,name=r.name;review.ready=null;syncReviewButtons();const res=kind==='photos'?await saveToPhotos(r.blob,name):await saveBlob(r.blob,name);if(res!=='cancelled')note(res==='photos'?'Saved to Photos':res==='downloaded'?'Video downloaded':'Shared');return;}
  const t0=performance.now();const r=review.mode==='clip'?await exportClip():await renderRange();const name='pixelpusher-'+(review.mode==='clip'?review.clip.name.replace(/[^\w-]+/g,'_')+'-':'')+stamp()+(r.blob.type.includes('mp4')?'.mp4':'.webm');review.result={blob:r.blob,name};
  if(performance.now()-t0<400){const res=kind==='photos'?await saveToPhotos(r.blob,name):await saveBlob(r.blob,name);if(res!=='cancelled')note(res==='photos'?'Saved to Photos':res==='downloaded'?'Video downloaded':'Shared');return;}
  review.ready=kind;syncReviewButtons();note('Video ready · tap '+(kind==='photos'?'Save':'Share')+' again');});
 $('rv-photos').addEventListener('click',exportAs('photos'));$('rv-share').addEventListener('click',exportAs('share'));
 $('rv-clip').addEventListener('click',makeClip);
 $('rv-use').addEventListener('click',()=>{const c=review.clip;closeReview();if(c)useClip(c);});
 $('rv-png').addEventListener('click',safe(async()=>{const blob=await canvasBlob();const r=await saveBlob(blob,'pixelpusher-'+stamp()+'.png');if(r!=='cancelled')note(r==='downloaded'?'PNG downloaded':'Saved');}));
 $('rv-frames').addEventListener('click',safe(async()=>{const blob=await canvasBlob();await frames.add({blob,width:canvas.width,height:canvas.height});await refreshFrames();note('Added to frames ('+frameList.length+')');}));
 $('rv-record').addEventListener('click',()=>{closeReview();toggleRecord();});
}
function progress(p,text){const box=$('rv-progress');box.hidden=p===null;if(p===null)return;$('rv-pbar').style.width=(Math.min(1,Math.max(0,p))*100).toFixed(1)+'%';$('rv-ptext').textContent=text;}
const renderKey=()=>signature()+'|'+sourceKind+'|'+(sourceKind==='gen'?gen.id+JSON.stringify(gen):'')+'|'+(clipSource?.id||sourceURL||'')+'|'+tl.in.toFixed(3)+'-'+tl.out.toFixed(3)+'|'+audioMode+'|'+canvas.width+'x'+canvas.height;
// Renders IN→OUT in real time through the full pipeline (effects, keyframes, beat motion, text, ink) into a video.
async function renderRange(){
 const key=renderKey();if(renderCache?.key===key)return renderCache;if(rendering)throw new Error('Already rendering.');
 if(typeof MediaRecorder==='undefined'||!canvas.captureStream)throw new Error('Video export is not available in this browser. Use PNG frame.');
 const a=tl.in,b=tl.out,wasLoop=tl.loop;rendering={a,b,p:0,started:false,thumb:null};progress(0,'RENDERING '+fmtTC(0)+' / '+fmtTC(b-a));
 try{tl.loop=false;syncTransport();setPlaying(false);await seekAsync(a);renderer.clearHistory();}catch(e){rendering=null;tl.loop=wasLoop;progress(null);throw e;}
 return await new Promise((resolve,reject)=>{
  const done=()=>{tl.loop=wasLoop;rendering=null;progress(null);syncTransport();if(review.open&&review.mode==='live'){seek(tl.in);setPlaying(true);}};
  const cap=new Capture(canvas,{onFinish:async({blob})=>{const thumb=await (rendering?.thumb||null);done();renderCache={key,blob,thumb,duration:b-a,width:canvas.width,height:canvas.height};resolve(renderCache);},onError:e=>{done();reject(e);}});
  rendering.stop=()=>cap.stop('done');
  try{cap.start({audioTracks:audio.tracks(),seconds:Math.min(300,Math.ceil(b-a)+5)});}catch(e){done();reject(e);return;}
  rendering.started=true;setPlaying(true);});
}
function renderTick(){const r=rendering,t=tl.t;r.p=(t-r.a)/Math.max(1e-6,r.b-r.a);progress(r.p,'RENDERING '+fmtTC(Math.max(0,t-r.a))+' / '+fmtTC(r.b-r.a));
 if(!r.thumb&&t>=(r.a+r.b)/2)r.thumb=thumbBlob();
 if(t>=r.b-.5/FPS||(sourceKind==='video'&&video.ended)||(sourceKind!=='video'&&!tl.playing)){r.started=false;if(!r.thumb)r.thumb=thumbBlob();setPlaying(false);r.stop();}}
function thumbBlob(){const c=document.createElement('canvas');c.width=192;c.height=228;const g=c.getContext('2d'),k=Math.max(192/canvas.width,228/canvas.height);g.fillStyle='#000';g.fillRect(0,0,192,228);g.drawImage(canvas,(192-canvas.width*k)/2,(228-canvas.height*k)/2,canvas.width*k,canvas.height*k);return new Promise(ok=>c.toBlob(b=>ok(b),'image/jpeg',.82));}
// Clip export: the saved file as is, or the trimmed IN→OUT re-encoded (picture; clip audio where the browser can capture it).
async function exportClip(){const c=review.clip;if(review.in<.05&&review.out>review.dur-.05)return {blob:c.blob};
 const v=$('rv-video'),cv=document.createElement('canvas');cv.width=c.width||v.videoWidth||720;cv.height=c.height||v.videoHeight||1280;const g=cv.getContext('2d');
 rendering={a:review.in,b:review.out,p:0,started:false};v.pause();await new Promise(ok=>{const f=()=>{v.removeEventListener('seeked',f);ok();};v.addEventListener('seeked',f);v.currentTime=review.in;setTimeout(f,1500);});
 const tracks=[...cv.captureStream(30).getVideoTracks()];try{const s=v.captureStream?.();if(s)tracks.push(...s.getAudioTracks());}catch{}
 const rec=new MediaRecorder(new MediaStream(tracks),{mimeType:recordingMime(),videoBitsPerSecond:6e6}),chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(ok=>rec.onstop=ok);
 rec.start(500);await v.play().catch(()=>{});
 await new Promise(ok=>{const step=()=>{g.drawImage(v,0,0,cv.width,cv.height);const t=v.currentTime;rendering.p=(t-review.in)/(review.out-review.in);progress(rendering.p,'TRIMMING '+fmtTC(t-review.in)+' / '+fmtTC(review.out-review.in));if(t>=review.out-.02||v.ended)return ok();requestAnimationFrame(step);};step();});
 rec.stop();v.pause();await stopped;tracks.forEach(t=>t.stop());rendering=null;progress(null);v.currentTime=review.in;v.play().catch(()=>{});
 const blob=new Blob(chunks,{type:rec.mimeType||recordingMime()});if(!blob.size)throw new Error('No video was produced. Keep the app open while it trims.');return {blob};}
const makeClip=safe(async()=>{
 if(review.open&&review.mode==='clip'){const r=await exportClip();const c=await clips.add({blob:r.blob,thumb:review.clip.thumb,duration:review.out-review.in,width:review.clip.width,height:review.clip.height,name:review.clip.name+' trim'});await refreshClips();note('Saved to Clips: '+c.name);return;}
 const r=await renderRange();const c=await clips.add({blob:r.blob,thumb:r.thumb,duration:r.duration,width:r.width,height:r.height});selectedClip=c.id;await refreshClips();note('Saved to Clips: '+c.name+' · Source → Clips');
});

// ---------- Preview gestures: draw, hold-to-compare, drag-to-adjust ----------
function bindStage(){
 let pointer=null,holdTimer=0,start=null,base=null;
 const norm=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
 const pressure=e=>e.pointerType==='pen'||e.pressure&&e.pressure!==.5?e.pressure:.6;
 canvas.addEventListener('pointerdown',e=>{
  if(tab==='perform')return;
  if(pointer!==null)return;pointer=e.pointerId;try{canvas.setPointerCapture?.(e.pointerId);}catch{}const [x,y]=norm(e);
  if(tab==='perform')return; // FingerPerformer owns the preview in Perform
  if(tab==='draw'&&fxBrush.on){let size=fxBrush.size,strength=fxBrush.strength;if(fxbOwner.mods.length){syncDrawOwners();applyMods(fxbOwner,modTmp,performance.now()/1000,signals);size=6+modTmp.values[0]*194;strength=modTmp.values[1];}fxPaint.begin(fxBrush.effect,x,y,{size,strength,erase:fxBrush.erase});return;}
  if(tab==='draw'){const s=drawing.model.settings,keep=s.size;if(drawOwner.mods.some(m=>m.target===1)){syncDrawOwners();applyMods(drawOwner,modTmp,performance.now()/1000,signals);s.size=Math.max(1,Math.round(1+modTmp.values[1]*79));}drawing.model.begin(x,y,pressure(e),performance.now()/1000);s.size=keep;return;}
  start=[e.clientX,e.clientY];const fx=stack.find(s=>s.id===selectedFx&&s.enabled);dragKt=tl.t;base=fx?[0,1].map(i=>keyValue(fx.keys||[],i,dragKt)??fx.values[i]):null;
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
   // Keyed params: the drag edits the key at the playhead (like the slider) instead of a base value the keys would hide.
   let keyed=false;for(const i of [0,1])if(def.params[i]&&!def.params[i].options&&hasKeys(fx.keys,i)){setKey(fx.keys,i,dragKt,fx.values[i]);keyed=true;}
   hud(parts.join('  ·  ')+(keyed?'  ·  ◆ '+fmtTC(dragKt):''));fx._dragged=true;}
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
 if(saved?.gen){const g=normGen(saved.gen);if(g)gen=g;}if(!gen.keys)gen.keys=[];
 if(saved?.timeline)tl=normalizeTimeline(saved.timeline);
 if(saved){lfos=normalizeLfos(saved.lfos);drawOwner.mods=normalizeMods(saved.drawMods,3);fxbOwner.mods=normalizeMods(saved.fxbMods,2);}
 try{renderer=new Renderer(canvas);}catch(e){note(e.message||'WebGL is unavailable on this device.',true);return;}
 if(saved?.genActive){useGen(gen.id,gen,false);}
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();glLostAt=performance.now();note('Graphics paused by the system. Restoring…',true);});
 canvas.addEventListener('webglcontextrestored',()=>rebuildRenderer('context restored'));
 mini.addEventListener('webglcontextlost',e=>{e.preventDefault();});mini.addEventListener('webglcontextrestored',()=>{thumbRenderer=null;setTimeout(()=>updateThumbs(),60);});
 addEventListener('error',e=>{if(/ResizeObserver/.test(e.message||''))return;friendly('Something went wrong, but your work is saved. If the preview looks stuck, tap Reset.');});
 addEventListener('unhandledrejection',e=>{const m=String(e.reason?.message||e.reason||'');if(!m||/AbortError|NotAllowedError/.test(m))return;friendly('Something went wrong: '+m.slice(0,90));});
 history.reset({...snapshot(),signature:signature()});syncUndo();
 $('gen-edit').addEventListener('click',editGenText);$('btn-undo').addEventListener('click',()=>restore(history.undo()));
 $('btn-redo').addEventListener('click',()=>restore(history.redo()));
 $('btn-save').addEventListener('click',()=>openReview());
 $('rec-badge').addEventListener('click',()=>capture?.stop('user'));
 $('sheet-close').addEventListener('click',closeSheet);
 $('sheet').addEventListener('click',e=>{if(e.target===$('sheet'))closeSheet();});
 $('file').addEventListener('change',()=>{const f=$('file').files?.[0];$('file').value='';if(f)useFile(f);});
 for(const b of document.querySelectorAll('.tab'))b.addEventListener('click',()=>setTab(b.dataset.tab));
 new ResizeObserver(()=>fitCanvas()).observe($('stage'));
 {let st=0;$('strip').addEventListener('scroll',()=>{clearTimeout(st);st=setTimeout(()=>{if(tab==='effects')updateThumbs();},160);},{passive:true});}
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&capture?.active)capture.stop('app hidden');if(document.hidden&&rendering?.stop){rendering.started=false;rendering.stop();}});
 bindStage();nativeFeel();bindTransport();bindReview();
 performer=new FingerPerformer(canvas,$('touch-overlay'),{enabled:()=>tab==='perform',getEffects:performTargets,onChange:()=>{saveSession();},onFreeze:v=>{touchFreeze=v;},onStutter:()=>{renderer.stutterUntil=performance.now()+160;},onRelease:moved=>{if(moved){commit();if(drawerOpen&&drawerMode==='perform')renderDrawer();updateThumbs();}},status:t=>{if(t)hud(t);else hud(null);},onGrab:grabKeys});
 const performerOptions=enabled=>({enabled,getEffects:performTargets,onChange:()=>{saveSession();},onFreeze:v=>{touchFreeze=v;},onStutter:()=>{renderer.stutterUntil=performance.now()+160;},onRelease:moved=>{if(moved){commit();updateThumbs();}},status:()=>{},onGrab:grabKeys});
 mapUI=createMapUI({el,icon,tile,chip,button,label,slider,head,note,store,safe,saveBlob,openSheet,closeSheet,Generator,GEN_SOURCES,defaultGen,textSpec,speedFactor,FingerPerformer,performerOptions,mainCanvas:canvas,
  gen:()=>gen,tab:()=>tab,clipList:()=>clipList,renderStrip,renderDrawer:()=>{if(drawerOpen)renderDrawer();},openDrawer,closeDrawer:()=>closeDrawer(),drawerIs:m=>drawerOpen&&drawerMode===m});
 await frames.init();refreshFrames();await clips.init();refreshClips();
 ensureSize();fitCanvas();renderStrip();requestAnimationFrame(loop);setTimeout(()=>updateThumbs(),200);
 try{if(!store.getItem('brainhertz.pixelpusher.tip16')){store.setItem('brainhertz.pixelpusher.tip16','1');hud('Hold preview = original  ·  drag = tweak effect');setTimeout(()=>hud(null),3800);}}catch{}
 if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{});
 globalThis.__pp={get map(){return mapUI?.api;},get renderer(){return renderer;},perf,rebuildRenderer,get blackRun(){return blackRun;},get tl(){return tl;},beatData,clips,get clipList(){return clipList;},refreshClips,openReview,closeReview,get review(){return review;},renderRange,makeClip,useClip,seek,setPlaying,get rendering(){return rendering;},analyzeMedia,get stack(){return stack;},get lfos(){return lfos;},drawOwner,fxbOwner,get signals(){return signals;},get gen(){return gen;},useGen,get generator(){return generator;},GEN_SOURCES,get sourceKind(){return sourceKind;},video,fxPaint,fxBrush,get tab(){return tab;},history,drawing,frames,get frameList(){return frameList;},setTab,tapEffect,captureFrame,refreshFrames,buildZip,version:VERSION};
}
boot();
