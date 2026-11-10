import {normalizePreset} from './core.js';
export const PRESET_KEY='brainhertz.pixelpusher.presets.v1';
// Legacy identifiers only: read and preserve existing owner looks during the rename.
const LEGACY_KEYS=['brainhertz.glitch.presets.v1'];
export function readPresets(storage){
 const presets=[],seen=new Set();let migrated=false,warning=false;
 for(const key of [PRESET_KEY,...LEGACY_KEYS]){
  let values;try{const raw=storage.getItem(key);if(!raw||raw.length>524288)continue;values=JSON.parse(raw);}catch{warning=true;continue;}
  if(!Array.isArray(values))continue;
  for(const value of values.slice(0,40)){
   const preset=normalizePreset(value);if(!preset)continue;const identity=JSON.stringify(preset);if(seen.has(identity))continue;seen.add(identity);presets.push(preset);if(key!==PRESET_KEY)migrated=true;
  }
 }
 // Two bounded stores can contain up to 80 unique looks; never silently drop them.
 if(migrated)try{storage.setItem(PRESET_KEY,JSON.stringify(presets));}catch{warning=true;}
 return {presets,migrated,warning};
}
