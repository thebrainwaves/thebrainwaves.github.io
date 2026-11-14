// Original modulation engine: LFO, tempo-locked and audio sources drive effect parameters.
export const SOURCES=[['lfo','LFO'],['bpm','Tempo'],['level','Audio level'],['low','Bass'],['mid','Mids'],['high','Highs'],['beat','Beat hit']];
export const SHAPES=[['sine','Sine'],['triangle','Triangle'],['square','Square'],['saw','Ramp'],['random','Random step']];
export const DIVISIONS=[4,2,1,.5,.25];
export const DIVISION_LABELS=['1 bar','1/2','1/4','1/8','1/16'];
export const MAX_MODS=4;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a));
export function lfoRate(rate){return .05*Math.pow(160,clamp(rate));} // .05 Hz to 8 Hz
export function normalizeMods(raw,paramCount){
 if(!Array.isArray(raw))return [];
 const sources=SOURCES.map(s=>s[0]),shapes=SHAPES.map(s=>s[0]);
 return raw.slice(0,32).filter(m=>m&&typeof m==='object').slice(0,MAX_MODS).map(m=>({
  target:Number.isInteger(m.target)&&m.target>=-1&&m.target<paramCount?m.target:-1,
  source:sources.includes(m.source)?m.source:'lfo',
  shape:shapes.includes(m.shape)?m.shape:'sine',
  rate:clamp(m.rate??.4),depth:clamp(m.depth??.5),
  division:Number.isInteger(m.division)&&m.division>=0&&m.division<DIVISIONS.length?m.division:2
 }));
}
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export function wave(shape,phase){
 const p=phase-Math.floor(phase);
 switch(shape){
  case 'triangle':return 1-Math.abs(p*2-1);
  case 'square':return p<.5?1:0;
  case 'saw':return p;
  case 'random':return hash(Math.floor(phase));
  default:return .5-.5*Math.cos(p*Math.PI*2);
 }
}
// Returns a 0..1 source value. Periodic sources are centred (bipolar); audio adds only.
export function sourceValue(mod,time,signals){
 if(mod.source==='lfo')return {v:wave(mod.shape,time*lfoRate(mod.rate)),bipolar:true};
 if(mod.source==='bpm'){const beats=(signals.beats||0)/DIVISIONS[mod.division];return {v:wave(mod.shape,beats),bipolar:true};}
 if(mod.source==='beat')return {v:clamp(signals.beat),bipolar:false};
 return {v:clamp(signals[mod.source]),bipolar:false};
}
export function applyMods(effect,out,time,signals){
 out.intensity=effect.intensity;for(let i=0;i<effect.values.length;i++)out.values[i]=effect.values[i];
 if(!effect.mods)return out;
 for(const m of effect.mods){
  const {v,bipolar}=sourceValue(m,time,signals),delta=bipolar?(v-.5)*m.depth:v*m.depth;
  if(m.target===-1)out.intensity=clamp(out.intensity+delta);else out.values[m.target]=clamp(out.values[m.target]+delta);
 }
 return out;
}
