// Retirement worker. Deploy ONLY in the old launcher folder, never at origin root.
const DESTINATION='/pixelpusher-4296c16701/';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Remove only the retired pre-rename app-shell caches; never touch the new app's cache.
 await Promise.all((await caches.keys()).filter(key=>key.startsWith('brainhertz-glitch-')).map(key=>caches.delete(key)));
 await self.clients.claim();
 const windows=await self.clients.matchAll({type:'window'});
 await self.registration.unregister();
 await Promise.all(windows.map(client=>client.navigate(DESTINATION)));
})()));
