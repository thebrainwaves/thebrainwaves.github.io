// Pixel Pusher Link session: one WebRTC peer connection (DTLS-SRTP audio + a negotiated control data channel), LAN only.
// No STUN/TURN (iceServers: []). Signaling = QR / link codes (link-codec.js). Nothing here is logged or stored.
import {stripSdp,encodeSignal,decodeSignal,matchCode,linkUrl,OFFER_TTL_MS} from './link-codec.js';
export const LOST_MS=15000;
const waitIce=(pc,ms=4000)=>new Promise(res=>{if(pc.iceGatheringState==='complete')return res();const t=setTimeout(done,ms);function done(){clearTimeout(t);pc.removeEventListener('icegatheringstatechange',chk);res();}function chk(){if(pc.iceGatheringState==='complete')done();}pc.addEventListener('icegatheringstatechange',chk);});
export class LinkSession{
 constructor(mixer){this.mixer=mixer;this.state='idle';this.role=null;this.listeners=new Set();this.source='master';this.stats={};this.lostMs=LOST_MS;this.error='';this.bc=null;}
 on(f){this.listeners.add(f);return ()=>this.listeners.delete(f);}
 set(state,extra={}){Object.assign(this,extra);this.state=state;this.notify();}
 notify(kind){for(const f of this.listeners){try{f(this.state,kind);}catch(e){console.warn(e);}}}
 get active(){return ['connected','reconnecting'].includes(this.state);}
 newPc(){const pc=new RTCPeerConnection({iceServers:[],bundlePolicy:'max-bundle',rtcpMuxPolicy:'require'});this.pc=pc;
  this.dc=pc.createDataChannel('pp',{negotiated:true,id:0});this.dc.onmessage=e=>this.onMsg(e.data);this.dc.onopen=()=>this.startPing();
  pc.ontrack=e=>{const st=e.streams[0]||new MediaStream([e.track]);this.mixer.attachLink(st).catch(()=>{});};
  pc.onconnectionstatechange=()=>this.onConn();pc.oniceconnectionstatechange=()=>this.onConn();return pc;}
 async host(){
  this.close();await this.mixer.ensure();const pc=this.newPc();this.role='host';this.error='';this.set('preparing');
  const tr=pc.addTransceiver('audio',{direction:'sendrecv'});this.sender=tr.sender;await this.applySource();
  await pc.setLocalDescription(await pc.createOffer());await waitIce(pc);if(this.pc!==pc)return;
  this.offerSdp=stripSdp(pc.localDescription.sdp);this.offerAt=Date.now();this.offerPayload=await encodeSignal('o',this.offerSdp,this.offerAt);this.offerUrl=linkUrl(this.offerPayload);
  this.listenAnswers();this.set('hosting');clearTimeout(this.expT);this.expT=setTimeout(()=>{if(this.state==='hosting'||this.state==='approve'){this.close();this.set('idle',{error:'The QR code expired (10 minutes). Tap Host to make a new one.'});}},OFFER_TTL_MS);
 }
 // Answers from a Camera-app tab arrive over BroadcastChannel (same browser + origin only, never leaves the device).
 listenAnswers(){if(this.bc||typeof BroadcastChannel==='undefined')return;this.bc=new BroadcastChannel('pp-link');
  this.bc.onmessage=e=>{const m=e.data;if(m?.t==='answer'&&typeof m.p==='string'&&this.role==='host'&&this.state==='hosting'){this.bc.postMessage({t:'ack'});this.receiveAnswer(m.p).catch(err=>this.set('hosting',{error:err.message}));}};}
 async receiveAnswer(payload){
  if(this.role!=='host'||this.state!=='hosting')throw new Error('Not waiting for an answer. Tap Host first.');
  if(Date.now()-this.offerAt>OFFER_TTL_MS)throw new Error('The QR code expired. Tap Host again.');
  const sig=await decodeSignal(payload,{ttl:Infinity});if(sig.kind!=='a')throw new Error('That is a host QR, not the guest’s answer.');
  this.pendingAnswer=stripSdp(sig.sdp);this.code=await matchCode(this.offerSdp,this.pendingAnswer);this.set('approve',{error:''});
 }
 async approve(){if(this.state!=='approve'||!this.pendingAnswer)return;const sdp=this.pendingAnswer;this.pendingAnswer=null;this.set('connecting');
  try{await this.pc.setRemoteDescription({type:'answer',sdp});}catch{this.close();this.set('idle',{error:'Could not connect with that answer. Tap Host again.'});}}
 reject(){if(this.state!=='approve')return;this.pendingAnswer=null;this.code='';this.set('hosting',{error:'Rejected. Waiting for the right device to answer.'});}
 async join(payload){
  const sig=await decodeSignal(payload);if(sig.kind!=='o')throw new Error('That is a guest answer. Scan the host’s QR instead.');
  this.close();await this.mixer.ensure();const pc=this.newPc();this.role='guest';this.error='';this.set('preparing');
  const offer=stripSdp(sig.sdp);await pc.setRemoteDescription({type:'offer',sdp:offer});
  const tr=pc.getTransceivers().find(t=>t.receiver.track?.kind==='audio');if(tr){tr.direction='sendrecv';this.sender=tr.sender;}await this.applySource();
  await pc.setLocalDescription(await pc.createAnswer());await waitIce(pc);if(this.pc!==pc)return;
  const ans=stripSdp(pc.localDescription.sdp);this.answerPayload=await encodeSignal('a',ans);this.answerUrl=linkUrl(this.answerPayload);this.code=await matchCode(offer,ans);
  this.set('waiting');clearTimeout(this.expT);this.expT=setTimeout(()=>{if(this.state==='waiting'){this.close();this.set('idle',{error:'The host did not approve in time. Scan a new host QR.'});}},OFFER_TTL_MS);
 }
 onConn(){const pc=this.pc;if(!pc)return;const s=pc.connectionState,ice=pc.iceConnectionState;
  if((s==='connected'||ice==='connected'||ice==='completed')&&s!=='failed'&&this.state!=='connected'&&ice!=='disconnected'){clearTimeout(this.lostT);clearTimeout(this.expT);this.bc?.close();this.bc=null;this.code='';this.set('connected',{error:''});this.startStats();}
  else if((ice==='disconnected'||s==='disconnected')&&this.state==='connected'){this.set('reconnecting');clearTimeout(this.lostT);this.lostT=setTimeout(()=>{if(this.state==='reconnecting')this.lost();},this.lostMs);}
  else if((s==='failed'||ice==='failed')&&(this.active||this.state==='connecting'))this.lost();}
 lost(){this.close();this.set('lost',{error:'Link lost (Wi-Fi dropped or the other device left). Tap Pair again.'});}
 onMsg(d){if(typeof d!=='string'||d.length>256)return;let m;try{m=JSON.parse(d);}catch{return;}if(m?.t==='bye'){this.close();this.set('idle',{error:'The other device disconnected.'});}
  else if(m?.t==='ping'&&typeof m.ts==='number')this.send({t:'pong',ts:m.ts});else if(m?.t==='pong'&&typeof m.ts==='number')this.stats.appRtt=performance.now()-m.ts;}
 send(m){try{if(this.dc?.readyState==='open')this.dc.send(JSON.stringify(m));}catch{}}
 startPing(){clearInterval(this.pingT);this.pingT=setInterval(()=>this.send({t:'ping',ts:performance.now()}),2000);}
 async setSource(id){this.source=id;await this.applySource();this.notify('source');}
 async applySource(){if(!this.sender)return;const tr=this.paused?null:this.mixer.sendTrack(this.source);if(!tr)this.mixer.stopSend();try{await this.sender.replaceTrack(tr);const p=this.sender.getParameters();if(p.encodings?.length){p.encodings[0].maxBitrate=256000;await this.sender.setParameters(p).catch(()=>{});}}catch{}}
 pause(on){if(this.paused===on)return;this.paused=on;this.applySource();}
 startStats(){clearInterval(this.statT);this.statT=setInterval(()=>this.poll(),1000);this.poll();}
 async poll(){const pc=this.pc;if(!pc||pc.connectionState==='closed')return;try{const r=await pc.getStats();let pair,inb;r.forEach(s=>{if(s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded')pair=s;if(s.type==='inbound-rtp'&&s.kind==='audio')inb=s;});
  const st=this.stats;st.rtt=pair?.currentRoundTripTime!=null?pair.currentRoundTripTime*1000:st.appRtt??null;
  st.buffer=inb&&inb.jitterBufferEmittedCount?inb.jitterBufferDelay/inb.jitterBufferEmittedCount*1000:null;
  const tot=inb?(inb.packetsReceived||0)+Math.max(0,inb.packetsLost||0):0;st.loss=tot?Math.max(0,inb.packetsLost||0)/tot*100:0;st.receiving=!!inb&&inb.packetsReceived>0;
  st.latency=st.rtt!=null?st.rtt/2+(st.buffer??40)+20:null;this.notify('stats');}catch{}}
 disconnect(){if(this.state==='idle'&&!this.pc)return;this.send({t:'bye'});const pc=this.pc;this.pc=null;this.close();setTimeout(()=>{try{pc?.close();}catch{}},150);this.set('idle',{error:''});}
 close(){clearInterval(this.pingT);clearInterval(this.statT);clearTimeout(this.lostT);clearTimeout(this.expT);
  const pc=this.pc;this.pc=null;this.dc=null;if(pc){try{pc.close();}catch{}}
  this.sender=null;this.offerSdp=this.pendingAnswer=this.offerPayload=this.answerPayload=this.offerUrl=this.answerUrl=null;this.code='';this.stats={};
  this.bc?.close();this.bc=null;this.mixer.stopSend();this.mixer.detachLink();}
}
// A tab opened by the iPhone Camera with an answer link hands it to the waiting host tab. Resolves true when a host acknowledged.
export function handoffAnswer(payload,ms=1500){return new Promise(res=>{if(typeof BroadcastChannel==='undefined')return res(false);const bc=new BroadcastChannel('pp-link');const t=setTimeout(()=>{bc.close();res(false);},ms);bc.onmessage=e=>{if(e.data?.t==='ack'){clearTimeout(t);bc.close();res(true);}};bc.postMessage({t:'answer',p:payload});});}
