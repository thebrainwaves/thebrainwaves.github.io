// Pixel Pusher 1.8 audio mixer (clean-room). Three channels -> master -> brickwall limiter.
// Input (mic / audio interface) only after an explicit tap, never in the background, never heard unless "Hear input" is on.
// The limited master feeds the analyser (Motion audio + live KICK/HITS) and a MediaStream for recording. Speakers get a monitor
// mix: video + app sounds, plus the input only when "Hear input" is on (headphones; avoids feedback).
export const CHANNELS=[['input','Input'],['video','Video audio'],['app','App sounds']];
export const GAIN_MAX=2;           // +6 dB
export const CEILING=0.966;        // -0.3 dBFS brickwall
export const DB_FLOOR=-90;
const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.min(b,Math.max(a,+v)):d;
export const toDb=x=>x>0?Math.max(DB_FLOOR,20*Math.log10(x)):DB_FLOOR;
export const fromDb=db=>db<=DB_FLOOR?0:10**(db/20);
export const fmtGain=g=>g<=0.0005?'−∞ dB':((v)=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1)+' dB')(toDb(g));
export const fmtPan=p=>Math.abs(p)<.02?'C':(p<0?'L ':'R ')+Math.round(Math.abs(p)*100);
const defCh=(gain,mute)=>({gain,mute,solo:false,pan:0});
export function defaultMix(){return {v:1,master:{gain:1},ch:{input:{...defCh(1,false),monitor:false,device:''},video:defCh(1,true),app:defCh(.5,true)},app:{tone:false,click:false},sink:''};}
export function normalizeMix(raw){
 const d=defaultMix();if(!raw||typeof raw!=='object')return d;
 d.master.gain=clamp(raw.master?.gain,0,GAIN_MAX,1);
 for(const [id] of CHANNELS){const r=raw.ch?.[id];if(!r||typeof r!=='object')continue;const c=d.ch[id];
  c.gain=clamp(r.gain,0,GAIN_MAX,c.gain);c.pan=clamp(r.pan,-1,1,0);c.mute=!!r.mute;c.solo=!!r.solo;
  if(id==='input'){c.monitor=!!r.monitor;c.device=typeof r.device==='string'&&r.device.length<=256?r.device:'';}}
 d.app.tone=!!raw.app?.tone;d.app.click=!!raw.app?.click;
 d.sink=typeof raw.sink==='string'&&raw.sink.length<=256?raw.sink:'';
 return d;
}
// Linear gain each channel contributes to the master after mute / solo / on-air. Solo wins over mute on other channels.
export function effectiveGains(mix,armed){
 const anySolo=CHANNELS.some(([id])=>mix.ch[id].solo),out={};
 for(const [id] of CHANNELS){const c=mix.ch[id];let g=c.mute?0:c.gain;if(anySolo&&!c.solo)g=0;if(id==='input'&&!armed)g=0;out[id]=g;}
 return out;
}
// Studio-wide audio mode, derived from what is actually audible in the mix (keeps 1.7 Motion / Beat logic working).
export function modeOf(mix,armed){const g=effectiveGains(mix,armed),mic=g.input>0,other=g.video>0||(g.app>0&&(mix.app.tone||mix.app.click));return mic&&other?'mix':mic?'mic':other?'video':'none';}
// Peak + RMS of a time-domain block (linear 0..1+).
export function measure(buf){let peak=0,sum=0;for(let i=0;i<buf.length;i++){const v=buf[i],a=v<0?-v:v;if(a>peak)peak=a;sum+=v*v;}return {peak,rms:buf.length?Math.sqrt(sum/buf.length):0};}
// Meter ballistics in dB: instant attack, peak falls 24 dB/s, peak-hold 1.2 s.
export function ballistics(st,m,dt){const p=toDb(m.peak),r=toDb(m.rms);st.peak=Math.max(p,(st.peak??DB_FLOOR)-24*dt);st.rms=Math.max(r,(st.rms??DB_FLOOR)-30*dt);
 if(p>=(st.hold??DB_FLOOR)){st.hold=p;st.holdT=0;}else{st.holdT=(st.holdT||0)+dt;if(st.holdT>1.2)st.hold=Math.max(st.peak,(st.hold??DB_FLOOR)-24*dt);}st.clip=m.peak>=CEILING?1.5:Math.max(0,(st.clip||0)-dt);return st;}
// Equal-power pan for browsers without StereoPannerNode.
export const panGains=p=>{const a=(clamp(p,-1,1,0)+1)*Math.PI/4;return [Math.cos(a),Math.sin(a)];};
export const sinkSupported=()=>{const A=globalThis.AudioContext;return !!(A&&'setSinkId' in A.prototype);};

export class Mixer{
 constructor(video){this.video=video;this.mix=defaultMix();this.armed=false;this.mic=null;this.mode='none';this.bandLevels={low:0,mid:0,high:0};this.listeners=new Set();this.meter={};this.lastMeter=0;this.notice='';this.clickNext=0;}
 on(fn){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 emit(why){this.mode=modeOf(this.mix,this.armed);for(const f of this.listeners){try{f(why);}catch(e){console.warn(e);}}}
 get state(){return this.ctx?this.ctx.state:'off';}
 load(raw){this.mix=normalizeMix(raw);this.mix.app.tone=this.mix.app.click=false; // never start a tone or click by surprise after reload
  this.apply();this.emit('load');}
 snapshot(){return structuredClone(this.mix);}
 async ensure(){
  if(!this.ctx){
   const A=window.AudioContext||window.webkitAudioContext;if(!A)throw new Error('Web Audio is unavailable. Silent export is still available.');
   const c=this.ctx=new A();this.nodes={};
   const master=this.masterIn=c.createGain();
   const lim=this.limiter=c.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.001;lim.release.value=.08;
   const clip=c.createWaveShaper();const n=2049,curve=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1)*2-1;curve[i]=Math.max(-CEILING,Math.min(CEILING,x*1.0));}clip.curve=curve;clip.oversample='2x';
   // WaveShaper input outside -1..1 maps to the curve ends (= ceiling), so this is a true brickwall after the compressor.
   const pre=c.createGain();pre.gain.value=1;master.connect(lim);lim.connect(pre);pre.connect(clip);this.clipper=clip;
   this.analyser=c.createAnalyser();this.analyser.fftSize=256;this.analyser.smoothingTimeConstant=.75;this.data=new Uint8Array(this.analyser.frequencyBinCount);
   this.masterMeter=c.createAnalyser();this.masterMeter.fftSize=1024;
   this.dest=c.createMediaStreamDestination();clip.connect(this.analyser);clip.connect(this.masterMeter);clip.connect(this.dest);
   const mon=this.monBus=c.createGain();const monLim=c.createDynamicsCompressor();monLim.threshold.value=-6;monLim.knee.value=0;monLim.ratio.value=20;monLim.attack.value=.001;monLim.release.value=.08;
   mon.connect(monLim);monLim.connect(c.destination);
   for(const [id] of CHANNELS){const n={};n.in=c.createGain();n.fader=c.createGain();n.gate=c.createGain();n.gate.gain.value=0;n.mon=c.createGain();n.mon.gain.value=0;
    n.meter=c.createAnalyser();n.meter.fftSize=1024;n.in.connect(n.fader);
    if(c.createStereoPanner){n.pan=c.createStereoPanner();n.fader.connect(n.pan);n.pan.connect(n.gate);}else{n.fader.connect(n.gate);}
    n.gate.connect(n.meter);n.gate.connect(master);n.gate.connect(n.mon);n.mon.connect(mon);this.nodes[id]=n;}
   try{this.videoNode=c.createMediaElementSource(this.video);this.videoNode.connect(this.nodes.video.in);}catch(e){console.warn('video audio unavailable',e);}
   this.buf=new Float32Array(1024);
   c.onstatechange=()=>this.emit('state');
   if(this.mix.sink&&sinkSupported())c.setSinkId(this.mix.sink).catch(()=>{this.mix.sink='';});
   this.apply();
  }
  if(this.ctx.state!=='running'&&!document.hidden)await this.ctx.resume();
 }
 // iOS: an AudioContext only starts inside a tap. Called from a global pointerdown; also resumes after interruptions (calls, Siri, other apps).
 unlock(){if(!this.ctx){if(modeOf(this.mix,false)!=='none'&&!document.hidden)this.ensure().then(()=>this.emit('state')).catch(()=>{});return;}if(this.ctx&&this.ctx.state!=='running'&&this.ctx.state!=='closed'&&!document.hidden)this.ctx.resume().then(()=>this.emit('state')).catch(()=>{});}
 apply(){
  const m=this.mix,g=effectiveGains(m,this.armed);
  if(this.video)this.video.muted=!this.ctx||!(g.video>0);
  if(!this.ctx)return;const t=this.ctx.currentTime,set=(p,v)=>{try{p.setTargetAtTime(v,t,.015);}catch{p.value=v;}};
  set(this.masterIn.gain,m.master.gain);set(this.monBus.gain,m.master.gain);
  for(const [id] of CHANNELS){const n=this.nodes[id],c=m.ch[id];set(n.fader.gain,c.gain);if(n.pan)set(n.pan.pan,c.pan);
   const open=c.mute||(CHANNELS.some(([k])=>m.ch[k].solo)&&!c.solo)||(id==='input'&&!this.armed)?0:1;set(n.gate.gain,open);
   set(n.mon.gain,id==='input'?(c.monitor?1:0):1);}
  this.syncApp();
 }
 set(path,value){const [a,b,k]=path.split('.');if(a==='master')this.mix.master[b]=value;else if(a==='ch')this.mix.ch[b][k]=value;else if(a==='app')this.mix.app[b]=value;this.mix=normalizeMix(this.mix);this.apply();this.emit('set');}
 toggle(path){const [a,b,k]=path.split('.');const cur=a==='ch'?this.mix.ch[b][k]:a==='app'?this.mix.app[b]:false;this.set(path,!cur);}
 // ---- Input (mic / interface): explicit tap only ----
 async arm(device=this.mix.ch.input.device){
  await this.ensure();
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Input needs HTTPS and microphone permission.');
  if(document.hidden)throw new Error('Input can only start while the app is on screen.');
  this.disarm(false);
  const audio={echoCancellation:false,noiseSuppression:false,autoGainControl:false};if(device)audio.deviceId={exact:device};
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio,video:false});}catch(e){if(device&&e?.name==='OverconstrainedError'){this.mix.ch.input.device='';return this.arm('');}throw e;}
  if(document.hidden){stream.getTracks().forEach(t=>t.stop());throw new Error('Input cancelled because the app went to the background.');}
  this.mic=stream;this.micNode=this.ctx.createMediaStreamSource(stream);this.micNode.connect(this.nodes.input.in);this.armed=true;
  for(const t of stream.getAudioTracks())t.addEventListener('ended',()=>{if(this.mic===stream){this.disarm(false);this.notice='Input ended (device unplugged or permission changed).';this.emit('ended');}});
  this.apply();this.emit('arm');
 }
 disarm(emit=true){if(this.mic){this.mic.getTracks().forEach(t=>t.stop());try{this.micNode?.disconnect();}catch{}this.mic=null;this.micNode=null;}const was=this.armed;this.armed=false;this.apply();if(emit&&was)this.emit('disarm');}
 stopMic(){this.disarm();}
 inputLabel(){return this.mic?.getAudioTracks()[0]?.label||'';}
 async inputs(){try{return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');}catch{return [];}}
 async outputs(){if(!sinkSupported())return [];try{return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audiooutput');}catch{return [];}}
 async setSink(id){if(!sinkSupported())return false;await this.ensure();await this.ctx.setSinkId(id||'');this.mix.sink=id||'';this.emit('sink');return true;}
 // Page hidden: input stops for good (privacy), app sounds stop, the graph suspends. Nothing restarts until a tap.
 pageHidden(){const was=this.armed;this.disarm(false);if(was)this.notice='Input stopped when the app left the screen. Tap Go on air to start it again.';this.stopApp();if(this.ctx&&this.ctx.state==='running')this.ctx.suspend().catch(()=>{});this.emit('hidden');}
 // ---- App sounds: test tone + tempo click ----
 syncApp(){if(!this.ctx)return;const a=this.mix.app;
  if(a.tone&&!this.tone){const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=440;g.gain.value=.25;o.connect(g);g.connect(this.nodes.app.in);o.start();this.tone={o,g};}
  else if(!a.tone&&this.tone){try{this.tone.o.stop();this.tone.g.disconnect();}catch{}this.tone=null;}
  if(a.click&&!this.clickTimer){this.clickNext=0;this.clickTimer=setInterval(()=>this.tickClick(),25);}else if(!a.click&&this.clickTimer){clearInterval(this.clickTimer);this.clickTimer=null;}}
 stopApp(){if(this.tone){try{this.tone.o.stop();this.tone.g.disconnect();}catch{}this.tone=null;}if(this.clickTimer){clearInterval(this.clickTimer);this.clickTimer=null;}}
 tickClick(){const c=this.ctx;if(!c||c.state!=='running')return;const bpm=clamp(this.bpm?.()??120,40,240,120),step=60/bpm;if(this.clickNext<c.currentTime)this.clickNext=c.currentTime+.05;
  while(this.clickNext<c.currentTime+.12){const t=this.clickNext,o=c.createOscillator(),g=c.createGain();o.frequency.value=1000;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.5,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+.05);o.connect(g);g.connect(this.nodes.app.in);o.start(t);o.stop(t+.06);this.clickNext+=step;}}
 resume(){if(this.ctx&&!document.hidden){this.ctx.resume().catch(()=>{});this.syncApp();}}
 // ---- Meters + analysis (same API as the 1.5 AudioEngine) ----
 readMeter(an){if(an.getFloatTimeDomainData){an.getFloatTimeDomainData(this.buf);return measure(this.buf);}const b=new Uint8Array(an.fftSize);an.getByteTimeDomainData(b);const f=new Float32Array(b.length);for(let i=0;i<b.length;i++)f[i]=(b[i]-128)/128;return measure(f);}
 meters(now=performance.now()){const dt=Math.min(.1,Math.max(0,(now-(this.lastMeter||now))/1000));this.lastMeter=now;const out=this.meter;
  if(!this.ctx||this.ctx.state!=='running'){for(const id of ['input','video','app','master'])out[id]=ballistics(out[id]||{},{peak:0,rms:0},dt);out.gr=0;return out;}
  for(const [id] of CHANNELS)out[id]=ballistics(out[id]||{},this.readMeter(this.nodes[id].meter),dt);
  out.master=ballistics(out.master||{},this.readMeter(this.masterMeter),dt);out.gr=typeof this.limiter.reduction==='number'?this.limiter.reduction:this.limiter.reduction?.value||0;return out;}
 level(sensitivity=1.5){if(!this.analyser||this.ctx.state!=='running'||this.mode==='none')return 0;this.analyser.getByteFrequencyData(this.data);let sum=0;for(let i=1;i<64;i++)sum+=this.data[i];return Math.min(1,sum/(63*255)*sensitivity);}
 bands(sensitivity=1.5){const out=this.bandLevels;if(!this.analyser||this.ctx.state!=='running'||this.mode==='none'){out.low=out.mid=out.high=0;return out;}const hz=this.ctx.sampleRate/this.analyser.fftSize;for(const [name,lo,hi]of [['low',30,250],['mid',250,2500],['high',2500,12000]]){let total=0,count=0;for(let i=Math.max(1,Math.ceil(lo/hz));i<Math.min(this.data.length,Math.ceil(hi/hz));i++){total+=this.data[i];count++;}out[name]=Math.min(1,total/Math.max(1,count)/255*sensitivity);}return out;}
 tracks(){return this.mode==='none'?[]:this.dest?.stream.getAudioTracks()||[];}
 // 1.7 Motion tiles (Audio off / Mic / Clip audio / Mic + clip) are shortcuts onto the mixer.
 async configure(mode){
  if(mode==='none'&&!this.ctx){this.mix.ch.video.mute=true;this.mix.app.tone=this.mix.app.click=false;this.emit('mode');return;}
  await this.ensure();const mic=mode==='mic'||mode==='mix',clip=mode==='video'||mode==='mix';
  this.mix.ch.video.mute=!clip;if(clip)this.mix.ch.video.solo=false;if(mode==='none'){this.mix.app.tone=this.mix.app.click=false;}
  if(mic&&!this.armed){this.mix.ch.input.mute=false;await this.arm();}else if(!mic)this.disarm(false);
  this.apply();this.emit('mode');
 }
 monitorClip(on){this.set('ch.video.mute',!on);}
}
