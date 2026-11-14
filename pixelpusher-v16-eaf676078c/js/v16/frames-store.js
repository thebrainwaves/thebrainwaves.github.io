// Captured frames persist on this device only (IndexedDB). Memory fallback if storage is blocked.
export const MAX_FRAMES=200;
const DB='brainhertz.pixelpusher.frames',STORE='frames';
function open(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('no idb'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
const tx=(db,mode,fn)=>new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);const out=fn(s);t.oncomplete=()=>resolve(out?.result??out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Storage aborted'));});
export function orderFrames(list){return [...list].sort((a,b)=>a.order-b.order||a.created-b.created);}
export function moveFrame(list,id,delta){const a=orderFrames(list),i=a.findIndex(f=>f.id===id),j=i+delta;if(i<0||j<0||j>=a.length)return a;[a[i],a[j]]=[a[j],a[i]];return a.map((f,n)=>({...f,order:n}));}
export class FrameStore{
 constructor(){this.memory=new Map();this.db=null;this.persistent=false;}
 async init(){try{this.db=await open();this.persistent=true;}catch{this.db=null;this.persistent=false;}return this.persistent;}
 async list(){if(!this.db)return orderFrames([...this.memory.values()]);const req=await tx(this.db,'readonly',s=>s.getAll());return orderFrames(req||[]);}
 async add({blob,width,height}){
  const all=await this.list();if(all.length>=MAX_FRAMES)throw new Error('Frame list is full ('+MAX_FRAMES+'). Export and delete some frames first.');
  const frame={id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),created:Date.now(),order:(all.at(-1)?.order??-1)+1,blob,width,height};
  if(this.db)await tx(this.db,'readwrite',s=>s.put(frame));else this.memory.set(frame.id,frame);return frame;
 }
 async remove(id){if(this.db)await tx(this.db,'readwrite',s=>s.delete(id));else this.memory.delete(id);}
 async clear(){if(this.db)await tx(this.db,'readwrite',s=>s.clear());else this.memory.clear();}
 async saveOrder(list){if(this.db)await tx(this.db,'readwrite',s=>{for(const f of list)s.put(f);});else for(const f of list)this.memory.set(f.id,f);}
}
