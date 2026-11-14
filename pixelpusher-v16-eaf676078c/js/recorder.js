import {chooseMime,normalizeLimit,recordingLimit} from './core.js';
// Apple WebKit uses its supported MP4 recorder; other browsers prefer interoperable WebM.
export const recordingMime=()=>chooseMime(t=>MediaRecorder.isTypeSupported(t),{preferMp4:/Apple/.test(navigator.vendor)});
export class Capture{
 constructor(canvas,{onTick=()=>{},onFinish=()=>{},onError=()=>{}}={}){this.canvas=canvas;this.onTick=onTick;this.onFinish=onFinish;this.onError=onError;this.recorder=null;this.reason='user';}
 get active(){return !!this.recorder;}
 start({audioTracks=[],seconds=60}={}){
  if(this.active)throw new Error('Recording is already running.');
  if(typeof MediaRecorder==='undefined'||!this.canvas.captureStream)throw new Error('Video recording is unavailable in this browser. Use PNG export.');
  const mime=recordingMime();this.limit=normalizeLimit(seconds);
  const canvasStream=this.canvas.captureStream(30);
  this.stream=new MediaStream([...canvasStream.getVideoTracks(),...audioTracks.map(t=>t.clone())]);
  let recorder;
  try{recorder=new MediaRecorder(this.stream,{mimeType:mime,videoBitsPerSecond:Math.min(10000000,Math.max(2000000,this.canvas.width*this.canvas.height*5)),audioBitsPerSecond:128000});}
  catch(error){this.stream.getTracks().forEach(t=>t.stop());throw error;}
  this.recorder=recorder;this.chunks=[];this.bytes=0;this.started=performance.now();this.reason='user';
  recorder.ondataavailable=e=>{if(e.data.size){this.chunks.push(e.data);this.bytes+=e.data.size;if(recordingLimit(0,this.bytes,this.limit))this.stop('memory');}};
  recorder.onerror=e=>{this.reason='encoder error';this.onError(e.error||new Error('Encoder failed. Try a lower output size.'));this.stop(this.reason);};
  recorder.onstop=()=>{
   clearInterval(this.timer);const duration=(performance.now()-this.started)/1000;
   const blob=new Blob(this.chunks,{type:recorder.mimeType||mime});this.chunks=[];this.stream.getTracks().forEach(t=>t.stop());this.recorder=null;
   if(blob.size)this.onFinish({blob,duration,reason:this.reason});else this.onError(new Error('No video frames were captured. Keep the app visible and try a lower size.'));
  };
  try{recorder.start(1000);}catch(error){this.recorder=null;this.stream.getTracks().forEach(t=>t.stop());throw error;}
  this.timer=setInterval(()=>{const elapsed=(performance.now()-this.started)/1000;this.onTick(elapsed,this.bytes);const reason=recordingLimit(elapsed,this.bytes,this.limit);if(reason)this.stop(reason);},100);
  for(const track of this.stream.getTracks())track.addEventListener('ended',()=>this.stop('track ended'),{once:true});
  return mime;
 }
 stop(reason='user'){if(this.recorder?.state==='recording'){this.reason=reason;this.recorder.stop();}}
}
