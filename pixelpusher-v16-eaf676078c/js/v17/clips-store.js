// In-app Clips library: rendered timeline clips persist on this device only (IndexedDB). Memory fallback.
export const MAX_CLIPS=60;
const DB='brainhertz.pixelpusher.clips',STORE='clips';
function open(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('no idb'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const tx=(db,mode,fn)=>new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);const out=fn(s);t.oncomplete=()=>resolve(out?.result??out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Storage aborted'));});
export const cleanName=(s,fallback='Clip')=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40)||fallback;
export function nextClipName(list){let n=list.length+1;const names=new Set(list.map(c=>c.name));while(names.has('Clip '+n))n++;return 'Clip '+n;}
export class ClipStore{
 constructor(){this.memory=new Map();this.db=null;this.persistent=false;}
 async init(){try{this.db=await open();this.persistent=true;}catch{this.db=null;this.persistent=false;}return this.persistent;}
 async list(){const all=this.db?(await tx(this.db,'readonly',s=>s.getAll()))||[]:[...this.memory.values()];return all.sort((a,b)=>b.created-a.created);}
 async get(id){if(!this.db)return this.memory.get(id)||null;return (await tx(this.db,'readonly',s=>s.get(id)))||null;}
 async add({blob,thumb,duration,width,height,name}){
  const all=await this.list();if(all.length>=MAX_CLIPS)throw new Error('Clips library is full ('+MAX_CLIPS+'). Delete some clips first.');
  if(!blob||!blob.size)throw new Error('The clip is empty. Try again.');
  const clip={id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),created:Date.now(),name:cleanName(name,nextClipName(all)),blob,thumb:thumb||null,duration:Number(duration)||0,width:width|0,height:height|0,type:blob.type||'video/webm'};
  if(this.db)await tx(this.db,'readwrite',s=>s.put(clip));else this.memory.set(clip.id,clip);return clip;}
 async rename(id,name){const c=await this.get(id);if(!c)return null;c.name=cleanName(name,c.name);if(this.db)await tx(this.db,'readwrite',s=>s.put(c));else this.memory.set(id,c);return c;}
 async remove(id){if(this.db)await tx(this.db,'readwrite',s=>s.delete(id));else this.memory.delete(id);}
}
