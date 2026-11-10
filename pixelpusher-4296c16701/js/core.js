import {normalizeShaderState} from './shader-state.js';
// Original Brainhertz Productions implementation. All state values are normalized.
const p = (name,value) => ({name,value});
export const EFFECTS = [
  {id:'rgb',name:'RGB split',tag:'CHROMA',mode:1,params:[p('Distance',.25),p('Angle',.1)]},
  {id:'smear',name:'Block smear',tag:'FLOW MEMORY',mode:2,params:[p('Persistence',.7),p('Block size',.35),p('Flow',.65)]},
  {id:'sort',name:'Pixel drift',tag:'SORT APPROX.',mode:3,params:[p('Length',.45),p('Threshold low',.15),p('Threshold high',.85),p('Direction / angle',0)]},
  {id:'vhs',name:'Tape scan',tag:'SIGNAL',mode:4,params:[p('Scanlines',.35),p('Tracking / wobble',.3),p('Noise',.2),p('Chroma bleed',.4)]},
  {id:'wave',name:'Displacement',tag:'WAVE',mode:5,params:[p('Depth',.3),p('Frequency',.35),p('Speed',.3)]},
  {id:'trails',name:'Feedback trails',tag:'ZOOM / ROTATE',mode:6,params:[p('Persistence',.65),p('Zoom',.35),p('Rotation',.53)]},
  {id:'crush',name:'Bit crush',tag:'TONE',mode:7,params:[p('Color steps',.35),p('Pixel size',.12)]},
  {id:'lattice',name:'Lattice shear',tag:'ORIGINAL / 01',mode:8,params:[p('Shear',.3),p('Cell density',.4),p('Pulse',.4)]},
  {id:'fold',name:'Signal fold',tag:'ORIGINAL / 02',mode:9,params:[p('Fold',.4),p('Bands',.35),p('Phase',.4)]},
  {id:'slit',name:'Time ribbon',tag:'SLIT SCAN',mode:10,params:[p('Time depth',.85),p('Direction',.25),p('Sweep',.2)]},
  {id:'kaleido',name:'Mirror chamber',tag:'KALEIDOSCOPE',mode:11,params:[p('Segments',.3),p('Rotation',.1),p('Mirror / radius',.6)]},
  {id:'shuffle',name:'Block exchange',tag:'SHUFFLE',mode:12,params:[p('Disorder',.5),p('Grid',.4),p('Rate',.3)]},
  {id:'glyph',name:'Signal glyph',tag:'ASCII / DITHER',mode:13,params:[p('Cell size',.4),p('ASCII ↔ dither',.25),p('Contrast',.5)]},
  {id:'chroma',name:'Spectral wave',tag:'CHROMATIC WARP',mode:14,params:[p('Amplitude',.45),p('Frequency',.4),p('Speed',.4)]},
  {id:'jitter',name:'Line rupture',tag:'SCANLINE JITTER',mode:15,params:[p('Offset',.4),p('Line width',.25),p('Rate',.4)]},
  {id:'neon',name:'Neon contour',tag:'POSTER / EDGE',mode:16,params:[p('Poster levels',.35),p('Edge glow',.65),p('Palette',.3)]},
  {id:'beat',name:'Pulse gate',tag:'STROBE / STUTTER',mode:17,params:[p('Stutter ↔ strobe',.15),p('Pulse width',.35),p('Division',.3)]}
];
export const clamp=(n,min=0,max=1)=>Math.min(max,Math.max(min,n));
export function defaultTouch(def){return {x:0,y:1,x2:def.params.length>2?2:-2,y2:def.params.length>3?3:-1,pinch:0,twist:1,spring:false};}
export function defaultStack(){return EFFECTS.map(e=>({id:e.id,enabled:e.id==='rgb'||e.id==='vhs',intensity:1,locked:false,hold:false,touch:defaultTouch(e),reactive:false,reactiveParam:0,values:e.params.map(p=>p.value)}));}
export function sanitizeStack(input){
  const entries=Array.isArray(input)?input.slice(0,32):[];
  const seen=new Set(),out=[];
  for(const item of [...entries,...defaultStack()]){
    const def=EFFECTS.find(e=>e.id===item?.id);
    if(!def||seen.has(def.id))continue;
    seen.add(def.id);
    const touch=defaultTouch(def);for(const key of ['x','y','x2','y2','pinch','twist']){const n=item.touch?.[key];if(Number.isInteger(n)&&n>=-2&&n<def.params.length)touch[key]=n;}touch.spring=item.touch?.spring===true;
    out.push({id:def.id,intensity:Number.isFinite(item.intensity)?clamp(item.intensity):1,locked:item.locked===true,hold:false,touch,enabled:item.enabled===true,reactive:item.reactive===true,reactiveParam:Number.isInteger(item.reactiveParam)&&item.reactiveParam>=0&&item.reactiveParam<def.params.length?item.reactiveParam:0,values:def.params.map((p,i)=>Number.isFinite(item.values?.[i])?clamp(item.values[i]):p.value)});
  }
  return out;
}
export function moveEffect(stack,index,delta){const out=[...stack],to=index+delta;if(index<0||index>=out.length||to<0||to>=out.length)return out;[out[index],out[to]]=[out[to],out[index]];return out;}
export function chooseMime(supported,{preferMp4=true}={}){
  const mp4=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'];
  const webm=['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
  const type=(preferMp4?[...mp4,...webm]:[...webm,...mp4]).find(supported);
  if(!type)throw new Error('No supported video recording format on this browser. PNG export is available.');
  return type;
}
export function normalizeLimit(value){const n=Number(value);return Number.isFinite(n)?clamp(n,3,300):60;}
export function normalizePreset(value){if(!value||typeof value.name!=='string'||!Array.isArray(value.stack))return null;return {name:value.name.trim().slice(0,40)||'Untitled',stack:sanitizeStack(value.stack),...(value.shader?{shader:normalizeShaderState(value.shader)}:{})};}
export function recordingLimit(seconds,bytes,limit){if(bytes>=256*1024*1024)return 'memory';if(seconds>=limit)return 'duration';return null;}
const preset=(name,config)=>({name,stack:defaultStack().map(e=>({...e,enabled:!!config[e.id],values:e.values.map((v,i)=>config[e.id]?.[i]??v)}))});
export const PRESETS=[
  preset('Red shift',{rgb:[.28,.08],vhs:[.28,.14,.08]}),
  preset('Afterimage',{rgb:[.1,.6],trails:[.84,.35,.54],lattice:[.18,.6,.35]}),
  preset('Broken rhythm',{smear:[.62,.5,.54],sort:[.4,.4,.55],crush:[.45,.18]}),
  preset('Fold space',{wave:[.16,.5,.3],fold:[.5,.3,.5],vhs:[.2,.16,.08]})
];

// Randomization never enables flashing; existing locked state survives untouched.
export function randomizeStack(stack,random=Math.random){return sanitizeStack(stack).map((e,i)=>stack[i]?.locked?structuredClone(stack[i]):({...e,hold:false,enabled:e.id!=='beat'&&random()>.55,intensity:.35+random()*.6,values:e.values.map(()=>.08+random()*.78)}));}
export class QualityController{
 constructor(){this.scale=1;this.average=20;this.frames=0;this.cooldown=0;}
 reset(){this.scale=1;this.average=20;this.frames=0;this.cooldown=0;}
 update(ms,capturing=false){if(capturing)return false;this.average=this.average*.94+Math.min(200,ms)*.06;if(this.cooldown>0){this.cooldown--;return false;}this.frames++;if(this.frames<45)return false;this.frames=0;const before=this.scale;if(this.average>38)this.scale=Math.max(.4,this.scale*.8);else if(this.average<24)this.scale=Math.min(1,this.scale/.8);if(before!==this.scale){this.cooldown=120;return true;}return false;}
}
export class BeatClock{
 constructor(){this.average=.1;this.previous=0;this.lastOnset=-1000;this.lastTime=0;this.pulse=0;this.phase=0;this.bpm=120;this.taps=[];this.manual=false;}
 tap(now){if(this.taps.length&&now-this.taps.at(-1)>2000)this.taps=[];this.taps.push(now);this.taps=this.taps.slice(-5);if(this.taps.length>1){const interval=(this.taps.at(-1)-this.taps[0])/(this.taps.length-1);this.bpm=clamp(60000/interval,40,240);}this.manual=true;this.lastOnset=now;this.pulse=1;}
 update(energy,now){const delta=Math.max(0,now-this.lastTime);this.lastTime=now;this.pulse*=Math.exp(-delta/110);const onset=energy>.08&&energy>this.average*1.65&&energy-this.previous>.07&&now-this.lastOnset>230;this.average=this.average*.95+energy*.05;this.previous=energy;const period=60000/this.bpm;if(!this.manual&&onset){this.lastOnset=now;this.pulse=1;}if(this.manual&&now-this.lastOnset>=period){this.lastOnset+=Math.floor((now-this.lastOnset)/period)*period;this.pulse=Math.exp(-(now-this.lastOnset)/110);}this.phase=((now-this.lastOnset)/period)%1;return this.pulse;}
}
PRESETS.push(
 preset('Temporal architecture',{slit:[.9,.1,.35],kaleido:[.25,.12,.62],rgb:[.12,.65]}),
 preset('Cobalt circuit',{neon:[.3,.72,.3],trails:[.65,.4,.53],chroma:[.2,.3,.35]}),
 preset('Lost transmission',{vhs:[.4,.65,.4,.6],smear:[.65,.3,.7],jitter:[.2,.3,.45]}),
 preset('Signal typography',{glyph:[.35,.1,.55],shuffle:[.25,.4,.2],rgb:[.08,.1]})
);

export const mappedValue=(effect,index)=>index===-1?effect.intensity:index===-2?.5:effect.values[index];
export function setMappedValue(effect,index,value){if(index===-2)return;if(index===-1)effect.intensity=clamp(value);else effect.values[index]=clamp(value);}

for(const [name,scene,mode]of [['Cobalt tunnel','tunnel','background'],['Signal constellation','particles','composite'],['Audio topography','mesh','background'],['Recursive chamber','fractal','background'],['Wire architecture','wireframe','background']])PRESETS.push({name,stack:defaultStack().map(e=>({...e,enabled:e.id==='rgb',values:e.values.map((v,i)=>i===0?.08:v)})),shader:normalizeShaderState({enabled:true,scene,mode,opacity:1})});
