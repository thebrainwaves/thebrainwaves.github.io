// Versioned app-shell cache only. Never caches user media or remote requests.
const CACHE='brainhertz-glitch-v1.0.0';
const ASSETS=['./','./index.html','./style.css','./manifest.webmanifest','./js/core.js','./js/gpu.js','./js/audio.js','./js/recorder.js','./js/app.js','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('brainhertz-glitch-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const allowed=ASSETS.some(path=>new URL(path,self.registration.scope).href===url.href);
 if(!allowed)return;
 event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
