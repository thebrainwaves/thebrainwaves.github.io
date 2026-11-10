// Legacy launcher handoff only; no source media or settings are changed.
if('serviceWorker' in navigator)navigator.serviceWorker.getRegistration().then(registration=>registration?.update()).catch(()=>{});
location.replace('/pixelpusher-4296c16701/');
