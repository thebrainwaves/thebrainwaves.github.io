// Beat tracks: offline kick/hit onset detection from decoded clip audio, live detection for the mic,
// and decaying envelopes that drive the modulation system. Original Brainhertz code.
const HOP_S=.01;
function onePole(fc,sr){return Math.exp(-2*Math.PI*fc/sr);}
// Picks onsets from an energy envelope (one value per 10 ms hop) with an adaptive threshold.
export function pickOnsets(env,{minGap=.2,sensitivity=1,win=40}={}){
 const n=env.length,odf=new Float32Array(n);let maxE=0,maxO=0;for(let i=0;i<n;i++)maxE=Math.max(maxE,env[i]);
 for(let i=0;i<n;i++){const prev=Math.max(i>0?env[i-1]:0,i>1?env[i-2]:0);odf[i]=Math.max(0,env[i]-prev);maxO=Math.max(maxO,odf[i]);}
 if(maxE<=1e-5||maxO<=1e-6)return [];
 const k=1.6/Math.max(.25,sensitivity),floor=.12*maxO/Math.max(.25,sensitivity),gate=.06*maxE;const out=[];let last=-1e9;
 const pre=new Float64Array(n+1);for(let i=0;i<n;i++)pre[i+1]=pre[i]+odf[i];
 for(let i=0;i<n;i++){const a=Math.max(0,i-win),b=Math.min(n,i+win+1),mean=(pre[b]-pre[a])/(b-a);
  if(odf[i]<=mean*k+floor||env[i]<gate)continue;let peak=true;for(let j=Math.max(0,i-3);j<=Math.min(n-1,i+3);j++)if(odf[j]>odf[i]||(odf[j]===odf[i]&&j<i)){peak=false;break;}
  if(!peak)continue;const t=i*HOP_S;if(t-last<minGap)continue;out.push(+t.toFixed(3));last=t;}
 return out;}
// samples: mono Float32Array. Returns waveform peaks (0..1) plus KICK (low band) and HITS (high band) onset times in seconds.
export function analyzeAudio(samples,sr,{buckets=800,sensitivity=1}={}){
 const hop=Math.max(1,Math.round(sr*HOP_S)),frames=Math.floor(samples.length/hop),low=new Float32Array(frames),high=new Float32Array(frames);
 const aL=onePole(150,sr),aH=onePole(3000,sr);let l1=0,l2=0,h1=0;
 for(let f=0;f<frames;f++){let el=0,eh=0;const o=f*hop;for(let i=0;i<hop;i++){const x=samples[o+i];l1=(1-aL)*x+aL*l1;l2=(1-aL)*l1+aL*l2;h1=(1-aH)*x+aH*h1;const h=x-h1;el+=l2*l2;eh+=h*h;}low[f]=Math.sqrt(el/hop);high[f]=Math.sqrt(eh/hop);}
 const peaks=new Float32Array(buckets),per=samples.length/buckets;let mx=0;
 for(let b=0;b<buckets;b++){let m=0;const s=Math.floor(b*per),e=Math.min(samples.length,Math.floor((b+1)*per));for(let i=s;i<e;i+=2){const v=Math.abs(samples[i]);if(v>m)m=v;}peaks[b]=m;if(m>mx)mx=m;}
 if(mx>0)for(let b=0;b<buckets;b++)peaks[b]/=mx;
 return {duration:samples.length/sr,peaks,kicks:pickOnsets(low,{minGap:.2,sensitivity}),hits:pickOnsets(high,{minGap:.09,sensitivity}),sensitivity};}
// Decodes a media blob's audio (if any) and analyzes it. Resolves null when there is no audio track.
export async function analyzeBlob(blob,opts){
 const AC=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!AC||!blob)return null;
 const buf=await blob.arrayBuffer();const ctx=new AC(1,2,44100);
 let audio;try{audio=await new Promise((ok,bad)=>{const p=ctx.decodeAudioData(buf,ok,bad);if(p&&p.then)p.then(ok,bad);});}catch{return null;}
 if(!audio||!audio.length)return null;const n=audio.length,mono=new Float32Array(n);
 for(let c=0;c<audio.numberOfChannels;c++){const d=audio.getChannelData(c);for(let i=0;i<n;i++)mono[i]+=d[i]/audio.numberOfChannels;}
 let any=0;for(let i=0;i<n;i+=97)any=Math.max(any,Math.abs(mono[i]));if(any<1e-4)return null;
 return analyzeAudio(mono,audio.sampleRate,opts);}
// Live onset detector (mic): adaptive average, rise and refractory gap.
export class LiveOnsets{
 constructor(minGap=.2,ratio=1.45){this.minGap=minGap;this.ratio=ratio;this.avg=.05;this.prev=0;this.last=-1e9;}
 feed(v,now){const on=v>.06&&v>this.avg*this.ratio+.03&&v-this.prev>.04&&now-this.last>this.minGap;this.avg=this.avg*.96+v*.04;this.prev=v;if(on)this.last=now;return on;}
}
// Decaying envelope from the most recent onset at or before t (binary search over sorted times).
export function envAt(times,t,decay=.12){if(!times||!times.length)return 0;let lo=0,hi=times.length-1,f=-1;while(lo<=hi){const m=(lo+hi)>>1;if(times[m]<=t+1e-6){f=m;lo=m+1;}else hi=m-1;}
 if(f<0)return 0;const d=t-times[f];return d>decay*8?0:Math.exp(-d/decay);}
// Live markers: overwrite-as-you-play between the previous and current playhead.
export function recordMarker(list,prevT,t,hit){if(t>=prevT){for(let i=list.length-1;i>=0;i--)if(list[i]>prevT&&list[i]<=t)list.splice(i,1);}
 if(hit){list.push(+t.toFixed(3));list.sort((a,b)=>a-b);if(list.length>4000)list.splice(0,list.length-4000);}return list;}
