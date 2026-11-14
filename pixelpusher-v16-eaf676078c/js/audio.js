// A single graph; only clip audio reaches speakers. Microphone is never monitored.
export class AudioEngine{
 constructor(video){this.video=video;this.mode='none';this.mic=null;this.monitor=true;this.bandLevels={low:0,mid:0,high:0};}
 async ensure(){
  if(!this.ctx){
   const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Web Audio is unavailable. Silent export is still available.');
   this.ctx=new Audio();this.bus=this.ctx.createGain();this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=256;this.analyser.smoothingTimeConstant=.75;
   this.data=new Uint8Array(this.analyser.frequencyBinCount);this.dest=this.ctx.createMediaStreamDestination();this.bus.connect(this.analyser);this.analyser.connect(this.dest);
   this.clipGain=this.ctx.createGain();this.clipGain.gain.value=0;this.clipGain.connect(this.bus);
   this.monitorGain=this.ctx.createGain();this.monitorGain.gain.value=.75;this.clipGain.connect(this.monitorGain);this.monitorGain.connect(this.ctx.destination);
   this.micGain=this.ctx.createGain();this.micGain.gain.value=0;this.micGain.connect(this.bus);
   this.clip=this.ctx.createMediaElementSource(this.video);this.clip.connect(this.clipGain);
  }
  await this.ctx.resume();
 }
 async configure(mode){
  if(mode==='none'&&!this.ctx){this.mode=mode;return;}
  await this.ensure();
  if((mode==='mic'||mode==='mix')&&!this.mic){
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone needs HTTPS and browser permission.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
   if(document.hidden){stream.getTracks().forEach(t=>t.stop());throw new Error('Microphone request cancelled because the app is hidden.');}
   this.mic=stream;this.micNode=this.ctx.createMediaStreamSource(stream);this.micNode.connect(this.micGain);
  }
  this.mode=mode;const clip=mode==='video'||mode==='mix',mic=mode==='mic'||mode==='mix';
  this.clipGain.gain.value=clip?(mode==='mix'?.7:1):0;this.micGain.gain.value=mic?(mode==='mix'?.7:1):0;
  this.video.muted=!clip;
  if(!mic)this.stopMic();
 }
 stopMic(){if(this.mic){this.mic.getTracks().forEach(t=>t.stop());this.micNode?.disconnect();this.mic=null;}if(this.micGain)this.micGain.gain.value=0;}
 monitorClip(on){this.monitor=on;if(this.monitorGain)this.monitorGain.gain.value=on?.75:0;}
 level(sensitivity=1.5){if(!this.analyser||this.ctx.state!=='running'||this.mode==='none')return 0;this.analyser.getByteFrequencyData(this.data);let sum=0;for(let i=1;i<64;i++)sum+=this.data[i];return Math.min(1,sum/(63*255)*sensitivity);}
 bands(sensitivity=1.5){const out=this.bandLevels;if(!this.analyser||this.ctx.state!=='running'||this.mode==='none'){out.low=out.mid=out.high=0;return out;}const hz=this.ctx.sampleRate/this.analyser.fftSize;for(const [name,lo,hi]of [['low',30,250],['mid',250,2500],['high',2500,12000]]){let total=0,count=0;for(let i=Math.max(1,Math.ceil(lo/hz));i<Math.min(this.data.length,Math.ceil(hi/hz));i++){total+=this.data[i];count++;}out[name]=Math.min(1,total/Math.max(1,count)/255*sensitivity);}return out;}
 tracks(){return this.mode==='none'?[]:this.dest?.stream.getAudioTracks()||[];}
}
