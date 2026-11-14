// Save/share adapter. Order: optional native bridge (for a future app wrapper), Web Share with files, download link.
export async function saveBlob(blob,filename,{title='Pixel Pusher'}={}){
 const bridge=globalThis.PixelPusherNative;
 if(bridge&&typeof bridge.saveFile==='function'){await bridge.saveFile(blob,filename);return 'native';}
 if(typeof File==='function'&&navigator.canShare){
  const file=new File([blob],filename,{type:blob.type});
  if(navigator.canShare({files:[file]})){
   try{await navigator.share({files:[file],title});return 'shared';}
   catch(e){if(e&&e.name==='AbortError')return 'cancelled';/* fall through to download */}
  }
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);return 'downloaded';
}
export const stamp=(d=new Date())=>d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'-'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');
