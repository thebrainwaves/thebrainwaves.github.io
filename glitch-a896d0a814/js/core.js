// Original Brainhertz Productions implementation. All state values are normalized.
const p = (name,value) => ({name,value});
export const EFFECTS = [
  {id:'rgb',name:'RGB split',tag:'CHROMA',mode:1,params:[p('Distance',.25),p('Angle',.1)]},
  {id:'smear',name:'Block smear',tag:'MEMORY',mode:2,params:[p('Smear',.4),p('Block size',.35),p('Drift',.3)]},
  {id:'sort',name:'Pixel drift',tag:'SORT APPROX.',mode:3,params:[p('Span',.35),p('Threshold',.45),p('Mix',.65)]},
  {id:'vhs',name:'Tape scan',tag:'SIGNAL',mode:4,params:[p('Scanlines',.35),p('Tracking',.3),p('Noise',.2)]},
  {id:'wave',name:'Displacement',tag:'WAVE',mode:5,params:[p('Depth',.3),p('Frequency',.35),p('Speed',.3)]},
  {id:'trails',name:'Feedback trails',tag:'MEMORY',mode:6,params:[p('Persistence',.65),p('Zoom',.25),p('Rotation',.53)]},
  {id:'crush',name:'Bit crush',tag:'TONE',mode:7,params:[p('Color steps',.35),p('Pixel size',.12)]},
  {id:'lattice',name:'Lattice shear',tag:'ORIGINAL / 01',mode:8,params:[p('Shear',.3),p('Cell density',.4),p('Pulse',.4)]},
  {id:'fold',name:'Signal fold',tag:'ORIGINAL / 02',mode:9,params:[p('Fold',.4),p('Bands',.35),p('Phase',.4)]}
];
export const clamp=(n,min=0,max=1)=>Math.min(max,Math.max(min,n));
export function defaultStack(){return EFFECTS.map(e=>({id:e.id,enabled:e.id==='rgb'||e.id==='vhs',reactive:false,reactiveParam:0,values:e.params.map(p=>p.value)}));}
export function sanitizeStack(input){
  const entries=Array.isArray(input)?input.slice(0,32):[];
  const seen=new Set(),out=[];
  for(const item of [...entries,...defaultStack()]){
    const def=EFFECTS.find(e=>e.id===item?.id);
    if(!def||seen.has(def.id))continue;
    seen.add(def.id);
    out.push({id:def.id,enabled:item.enabled===true,reactive:item.reactive===true,reactiveParam:Number.isInteger(item.reactiveParam)&&item.reactiveParam>=0&&item.reactiveParam<def.params.length?item.reactiveParam:0,values:def.params.map((p,i)=>Number.isFinite(item.values?.[i])?clamp(item.values[i]):p.value)});
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
export function normalizePreset(value){if(!value||typeof value.name!=='string'||!Array.isArray(value.stack))return null;return {name:value.name.trim().slice(0,40)||'Untitled',stack:sanitizeStack(value.stack)};}
export function recordingLimit(seconds,bytes,limit){if(bytes>=256*1024*1024)return 'memory';if(seconds>=limit)return 'duration';return null;}
const preset=(name,config)=>({name,stack:defaultStack().map(e=>({...e,enabled:!!config[e.id],values:config[e.id]||e.values}))});
export const PRESETS=[
  preset('Red shift',{rgb:[.28,.08],vhs:[.28,.14,.08]}),
  preset('Afterimage',{rgb:[.1,.6],trails:[.84,.35,.54],lattice:[.18,.6,.35]}),
  preset('Broken rhythm',{smear:[.62,.5,.54],sort:[.4,.4,.55],crush:[.45,.18]}),
  preset('Fold space',{wave:[.16,.5,.3],fold:[.5,.3,.5],vhs:[.2,.16,.08]})
];
