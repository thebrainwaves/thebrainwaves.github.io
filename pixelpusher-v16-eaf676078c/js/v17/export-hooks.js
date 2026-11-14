// Reserved export hook points (not implemented yet). A later build can register e.g. 'sendToNiche', which will
// receive {clip: Blob, sidecar: object} (a rendered clip plus a JSON sidecar with the venue/mapping and look).
// Until a hook is registered, no button is shown and nothing leaves the device.
export const EXPORT_HOOKS=Object.seal({sendToNiche:null});
export function registerExportHook(name,fn){if(!(name in EXPORT_HOOKS))throw new Error('Unknown export hook: '+name);EXPORT_HOOKS[name]=typeof fn==='function'?fn:null;}
export const hasExportHook=name=>typeof EXPORT_HOOKS[name]==='function';
