// Versioned app-shell cache only. Never caches user media or remote requests.
const CACHE='pixelpusher-v1.6.5';
// Remove only old app-shell caches, including the pre-rename namespace. No media was cached.
const ASSETS=['./','./index.html','./studio.css','./manifest.webmanifest','./js/v16/studio.js','./js/v16/history.js','./js/v16/modulation.js','./js/v16/frames-store.js','./js/v16/zip.js','./js/v16/share.js','./js/v16/fx-presets.js','./js/v16/fx-paint.js','./js/v16/gen-sources.js','./js/v16/generator.js','./js/v16/perform.js','./js/touch.js','./js/core.js','./js/effects.js','./js/console-state.js','./js/effect-catalog.js','./js/shader-state.js','./js/gpu.js','./js/shaders.js','./js/audio.js','./js/recorder.js','./js/photo-source.js','./js/drawing-state.js','./js/drawing-layer.js','./js/storage.js','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('pixelpusher-')||k.startsWith('brainhertz-glitch-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const allowed=ASSETS.some(path=>new URL(path,self.registration.scope).href===url.href);
 if(!allowed)return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const hit=await cache.match(event.request);if(hit)return hit;
  // A retired launcher can clear origin caches while this worker remains active.
  // Rehydrate the full bounded shell on a navigation miss, then backfill assets.
  if(event.request.mode==='navigate')try{await cache.addAll(ASSETS);const restored=await cache.match(event.request);if(restored)return restored;}catch{/* Online fallback below; never cache errors. */}
  const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;
 }));
});
