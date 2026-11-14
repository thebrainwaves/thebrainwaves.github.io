// Per-effect presets: built-in strengths plus owner-saved settings in local storage.
export const FX_PRESET_KEY='brainhertz.pixelpusher.fxpresets.v1';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a));
export function builtinFx(def){
 const base=def.params.map(p=>p.value);
 const toward=(t,k)=>base.map((v,i)=>def.params[i].options?v:clamp(v+(t-v)*k));
 return [
  {name:'Default',intensity:1,values:base},
  {name:'Subtle',intensity:.4,values:toward(.15,.5)},
  {name:'Heavy',intensity:1,values:toward(.85,.6)},
  {name:'Extreme',intensity:1,values:toward(1,.9)}
 ];
}
export function normalizeFxStore(raw,defs){
 const out={};if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
 for(const def of defs){const list=raw[def.id];if(!Array.isArray(list))continue;
  out[def.id]=list.slice(0,12).filter(p=>p&&typeof p.name==='string').map(p=>({name:p.name.trim().slice(0,24)||'Saved',intensity:clamp(p.intensity??1),values:def.params.map((q,i)=>clamp(p.values?.[i]??q.value))}));}
 return out;
}
export function readFx(storage,defs){try{const raw=storage.getItem(FX_PRESET_KEY);if(!raw||raw.length>262144)return {};return normalizeFxStore(JSON.parse(raw),defs);}catch{return {};}}
export function writeFx(storage,store){storage.setItem(FX_PRESET_KEY,JSON.stringify(store));}
