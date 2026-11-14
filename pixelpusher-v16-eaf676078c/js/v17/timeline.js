// Pixel Pusher 1.7 timeline model: playhead, trim in/out, keyframes (linear + ease). Original Brainhertz code.
export const FPS=30,DURATIONS=[4,8,15,30,60],MAX_KEYS=96,MIN_RANGE=.2;
export const EASES=[['linear','Linear'],['ease','Ease']];
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a));
export function defaultTimeline(){return {duration:8,t:0,playing:true,loop:true,in:0,out:8};}
// Keeps in/out inside the duration with a minimum range; playhead inside the duration.
export function clampRange(tl,duration=tl.duration){
 const d=Number.isFinite(duration)&&duration>0?duration:8;tl.duration=d;
 tl.in=clamp(tl.in,0,Math.max(0,d-MIN_RANGE));tl.out=clamp(tl.out,tl.in+MIN_RANGE,d);if(tl.out-tl.in<MIN_RANGE)tl.in=Math.max(0,tl.out-MIN_RANGE);
 tl.t=clamp(tl.t,0,d);return tl;
}
export function normalizeTimeline(raw){const tl=defaultTimeline();if(!raw||typeof raw!=='object')return tl;
 if(DURATIONS.includes(raw.duration))tl.duration=raw.duration;tl.in=Number.isFinite(raw.in)?raw.in:0;tl.out=Number.isFinite(raw.out)?raw.out:tl.duration;if(typeof raw.loop==='boolean')tl.loop=raw.loop;return clampRange(tl);}
// Virtual clock (non-video sources): advances while playing and wraps inside the trim range (or stops at OUT).
export function stepTime(tl,dt){if(!tl.playing)return false;let t=tl.t+dt,wrapped=false;
 if(t<tl.in-1e-6){t=tl.in;wrapped=true;}
 if(t>=tl.out){if(tl.loop){t=tl.in+((t-tl.out)%Math.max(MIN_RANGE,tl.out-tl.in));wrapped=true;}else{t=tl.out;tl.playing=false;}}
 tl.t=t;return wrapped;}
// Timecode MM:SS:FF (30 fps frames)
export function fmtTC(t){t=Number.isFinite(t)?Math.max(0,t):0;const f=Math.floor(t*FPS+1e-6),fr=f%FPS,s=Math.floor(f/FPS);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+':'+String(fr).padStart(2,'0');}
export const snapFrame=t=>Math.round(t*FPS)/FPS;
// ---- Keyframes: owner.keys = [{p,t,v,e}] where p=-1 is intensity, 0..n params; e = segment ease to the next key.
export function normalizeKeys(raw,paramCount){if(!Array.isArray(raw))return [];const ok=new Set(EASES.map(e=>e[0]));
 const out=raw.slice(0,MAX_KEYS*2).filter(k=>k&&typeof k==='object'&&Number.isInteger(k.p)&&k.p>=-1&&k.p<paramCount&&Number.isFinite(k.t)&&k.t>=0&&k.t<=3600&&Number.isFinite(k.v))
  .map(k=>({p:k.p,t:snapFrame(k.t),v:clamp(k.v),e:ok.has(k.e)?k.e:'linear'}));
 const seen=new Set(),dedup=[];for(const k of out){const id=k.p+'@'+k.t;if(seen.has(id))continue;seen.add(id);dedup.push(k);}
 return sortKeys(dedup).slice(0,MAX_KEYS);}
export const sortKeys=keys=>keys.sort((a,b)=>a.p-b.p||a.t-b.t);
const near=(a,b)=>Math.abs(a-b)<.5/FPS;
export const trackOf=(keys,p)=>(keys||[]).filter(k=>k.p===p);
export const hasKeys=(keys,p)=>!!keys&&keys.some(k=>k.p===p);
export const keyAt=(keys,p,t)=>(keys||[]).find(k=>k.p===p&&near(k.t,t))||null;
export function keyedParams(keys){return [...new Set((keys||[]).map(k=>k.p))];}
// Insert or update a key at time t (snapped to a frame). Returns the key, or null when the owner is full.
export function setKey(keys,p,t,v,ease){t=snapFrame(Math.max(0,t));const k=keyAt(keys,p,t);if(k){k.v=clamp(v);if(ease)k.e=ease;return k;}
 if(keys.length>=MAX_KEYS)return null;const n={p,t,v:clamp(v),e:ease||(trackOf(keys,p).at(-1)?.e)||'linear'};keys.push(n);sortKeys(keys);return n;}
export function removeKey(keys,p,t){const i=keys.findIndex(k=>k.p===p&&near(k.t,t));if(i<0)return false;keys.splice(i,1);return true;}
export function moveKey(keys,key,t){t=snapFrame(Math.max(0,t));if(keys.some(k=>k!==key&&k.p===key.p&&near(k.t,t)))return false;key.t=t;sortKeys(keys);return true;}
export const ease=u=>u*u*(3-2*u);
// Value of a keyed parameter at time t: holds before the first / after the last key, interpolates between.
export function keyValue(keys,p,t){let a=null,b=null;for(const k of keys){if(k.p!==p)continue;if(k.t<=t+1e-9)a=k;else{b=k;break;}}
 if(!a&&!b)return null;if(!a)return b.v;if(!b)return a.v;const u=(t-a.t)/Math.max(1e-6,b.t-a.t);return a.v+(b.v-a.v)*(a.e==='ease'?ease(u):u);}
// Replaces the base value of keyed params in a modulated output, keeping the modulation offset.
// 1.7.2: while a finger performs on an owner (owner._touch), the live values win over its keys; keys resume on release.
export function applyKeys(owner,out,t){const keys=owner.keys;if(!keys||!keys.length||owner._touch)return out;
 for(const p of keyedParams(keys)){const kv=keyValue(keys,p,t);if(kv===null)continue;
  if(p===-1)out.intensity=clamp(out.intensity-owner.intensity+kv);else if(p<out.values.length)out.values[p]=clamp(out.values[p]-(owner.values[p]??0)+kv);}
 return out;}
// Copies the keyed values at t into the owner's base values so a performance starts exactly where the keys are (no jump).
export function adoptKeys(owner,t){const keys=owner?.keys;if(!keys||!keys.length)return owner;for(const p of keyedParams(keys)){const v=keyValue(keys,p,t);if(v===null)continue;if(p===-1)owner.intensity=v;else if(Array.isArray(owner.values)&&p<owner.values.length)owner.values[p]=v;}return owner;}
export function nextKeyTime(owners,t,dir){let best=null;for(const o of owners)for(const k of o.keys||[]){if(dir>0?k.t>t+.5/FPS:k.t<t-.5/FPS){if(best===null||(dir>0?k.t<best:k.t>best))best=k.t;}}return best;}
