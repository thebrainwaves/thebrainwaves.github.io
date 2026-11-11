import {clamp,parseMidi} from './core.js';
export function analyzeBands(data,sampleRate,fftSize,gain){
 const avg=(lo,hi)=>{const start=Math.max(1,Math.floor(lo*fftSize/sampleRate)),end=Math.min(data.length,Math.ceil(hi*fftSize/sampleRate));if(end<=start)return 0;let total=0;for(let i=start;i<end;i++)total+=data[i];return clamp(total/(end-start)/255*gain);};
 return {bass:avg(35,250),mid:avg(250,2200),treble:avg(2200,10000)};
}
export class MidiClock{
 constructor(){this.last=null;this.intervals=[];this.bpm=100;}
 tick(now){if(this.last!==null){const dt=now-this.last;if(dt>4&&dt<100){this.intervals.push(dt);if(this.intervals.length>48)this.intervals.shift();if(this.intervals.length>=12)this.bpm=clamp(60000/(this.intervals.reduce((a,b)=>a+b)/this.intervals.length*24),40,240);}else this.intervals=[];}this.last=now;return this.bpm;}
}
export class LocalAudio{
 constructor(){this.context=null;this.stream=null;this.analyser=null;this.pending=false;this.generation=0;this.gain=1.5;this.lastBass=0;this.envelope=0;}
 async enable(){
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context||!navigator.mediaDevices?.getUserMedia)throw new Error('Mic analysis needs HTTPS and a browser with Web Audio.');
  if(this.pending||this.stream)return;this.pending=true;const generation=++this.generation;
  let stream,context;try{
   // Resume within the explicit gesture, before the permission promise resolves.
   context=new Context();await context.resume();if(generation!==this.generation){await context.close();return;}stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());await context.close();return;}
   this.context=context;this.stream=stream;this.analyser=context.createAnalyser();this.analyser.fftSize=1024;this.analyser.smoothingTimeConstant=.7;this.data=new Uint8Array(this.analyser.frequencyBinCount);this.source=context.createMediaStreamSource(stream);this.source.connect(this.analyser);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());if(context&&context.state!=='closed')await context.close();throw e;}finally{this.pending=false;}
 }
 sample(dt){if(!this.analyser||!this.stream)return {bass:0,mid:0,treble:0,beat:0};this.analyser.getByteFrequencyData(this.data);const bands=analyzeBands(this.data,this.context.sampleRate,this.analyser.fftSize,this.gain);this.envelope*=Math.exp(-dt*5);if(bands.bass>.3&&bands.bass-this.lastBass>.045)this.envelope=1;this.lastBass=this.lastBass*.8+bands.bass*.2;return {...bands,beat:this.envelope};}
 stop(){this.generation++;this.stream?.getTracks().forEach(t=>t.stop());this.source?.disconnect();this.context?.close().catch(()=>{});this.context=null;this.stream=null;this.analyser=null;}
}
export class LocalMidi{
 constructor(onEvent,onInputs){this.access=null;this.input=null;this.onEvent=onEvent;this.onInputs=onInputs;this.clock=new MidiClock();this.generation=0;}
 async enable(){if(!navigator.requestMIDIAccess)throw new Error('Web MIDI is not supported in this browser.');const generation=++this.generation;const access=await navigator.requestMIDIAccess({sysex:false});if(generation!==this.generation)return;this.access=access;this.access.onstatechange=()=>this.rescan();this.rescan();}
 rescan(){if(!this.access)return [];const inputs=[...this.access.inputs.values()].filter(i=>i.state==='connected');if(this.input&&!inputs.some(i=>i.id===this.input.id))this.select('');this.onInputs(inputs);return inputs;}
 select(id){if(this.input){this.input.onmidimessage=null;this.input.close()?.catch(()=>{});}this.input=this.access?.inputs.get(id)||null;if(this.input){this.input.open()?.catch(()=>{});this.input.onmidimessage=e=>{const event=parseMidi(e.data);if(event){if(event.kind==='clock')event.bpm=this.clock.tick(e.timeStamp);this.onEvent(event);}};}}
 disconnect(){this.generation++;this.select('');if(this.access)this.access.onstatechange=null;this.access=null;this.onInputs([]);}
}
