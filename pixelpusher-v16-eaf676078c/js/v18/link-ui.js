// Pixel Pusher 1.8.1 Link panel: host QR -> guest answer QR -> 6-digit match -> host approves. Touch-first, LAN only.
import {encodeQR,drawQR} from './qr.js';
import {SEND_SOURCES} from './mixer.js';
import {drawMeter} from './mixer-ui.js';
import {handoffAnswer} from './link.js';
const fmtMs=v=>v==null||!Number.isFinite(v)?'—':Math.round(v)+' ms';
export function createLinkUI(x){
 const {link,mixer,el,button,chip,head,note}=x;let raf=0,meters=[],statEl=null,handoff=null;
 const canScan=()=>typeof BarcodeDetector!=='undefined';
 function qrBlock(url,label){const w=el('div','lk-qr');const cv=el('canvas');cv.setAttribute('role','img');cv.setAttribute('aria-label',label);
  try{const q=encodeQR(url);const px=Math.max(2,Math.floor(Math.min(300,(x.width?.()||330)-40)/(q.size+8)));drawQR(cv,q,px);w.dataset.version=String(q.version);}catch(e){w.append(el('p','mx-sub warn',e.message));}
  w.prepend(cv);return w;}
 function shareRow(url){const r=el('div','mx-row');
  if(navigator.share)r.append(button('Share link','share',()=>navigator.share({title:'Pixel Pusher Link',url}).catch(()=>{})));
  r.append(button('Copy','check',async()=>{try{await navigator.clipboard.writeText(url);note('Copied. Paste it on the other device.');}catch{note('Copy is blocked here. Use Share instead.',true);}}));return r;}
 function pasteBox(placeholder,act,label){const w=el('div','lk-paste');const t=el('textarea','lk-text');t.rows=2;t.placeholder=placeholder;t.setAttribute('aria-label',placeholder);t.autocapitalize='off';t.spellcheck=false;
  const go=button(label,'check',async()=>{const v=t.value.trim();const m=/#ppl=([^\s]+)/.exec(v);try{await act(m?m[1]:v);}catch(e){note(e.message||'That code did not work.',true);}},'blue');
  w.append(t,go);if(canScan())w.append(button('Scan QR','frame',()=>scan(act)));return w;}
 async function scan(act){ // only where BarcodeDetector exists (not iOS Safari); camera stream stops right after one read
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});const v=document.createElement('video');v.srcObject=stream;v.muted=true;v.playsInline=true;await v.play();
   const det=new BarcodeDetector({formats:['qr_code']}),t0=Date.now();while(Date.now()-t0<20000){const r=await det.detect(v).catch(()=>[]);const raw=r[0]?.rawValue;if(raw){const m=/#ppl=([^\s]+)/.exec(raw);await act(m?m[1]:raw);return;}await new Promise(r=>setTimeout(r,250));}note('No QR found. Try again or paste the link.',true);}
  catch(e){note(e.message||'Camera unavailable.',true);}finally{stream?.getTracks().forEach(t=>t.stop());}}
 function meterRow(id,label){const w=el('div','mx-meter lk-meter');w.append(el('small','mx-db lk-ml',label));const cv=el('canvas');cv.setAttribute('aria-label',label+' meter');cv.dataset.meter=id;w.append(cv);meters.push({id,cv});return w;}
 function loop(now){raf=0;meters=meters.filter(m=>m.cv.isConnected);if(!meters.length)return;const r=mixer.meters(now);for(const m of meters)if(r[m.id])drawMeter(m.cv,r[m.id]);raf=requestAnimationFrame(loop);}
 function statsText(){const s=link.stats;return 'Latency ≈ '+fmtMs(s.latency)+' · RTT '+fmtMs(s.rtt)+' · buffer '+fmtMs(s.buffer)+' · loss '+(s.loss??0).toFixed(1)+'%';}
 function updateStats(){if(statEl?.isConnected){const t=statsText();if(statEl.textContent!==t)statEl.textContent=t;}}
 const codeBox=code=>{const c=el('div','lk-code');c.setAttribute('aria-label','Match code '+code);c.textContent=code||'— — —';return c;};
 function drawer(d){meters=[];statEl=null;const s=link.state;
  head(d,'Link','ENCRYPTED WI-FI AUDIO · LAN ONLY');
  const body=el('div','lk-body');body.dataset.state=s;d.append(body);
  if(link.error)body.append(el('p','mx-sub warn lk-err',link.error));
  if(handoff){body.append(el('p','lk-big',handoff==='sent'?'Sent to your Pixel Pusher tab.':'No Pixel Pusher host is waiting in this browser.'));
   body.append(el('p','mx-sub',handoff==='sent'?'Switch back to that tab and check the 6-digit code. You can close this tab.':'Copy the link and paste it on the host device (Link › paste).'));
   if(handoff!=='sent'&&x.pendingAnswer)body.append(shareRow(x.pendingAnswer));body.append(button('Done','check',()=>{handoff=null;x.refresh();}));return;}
  if(s==='idle'&&link.pendingOffer){body.append(el('p','lk-big','Join the link from the host?'));body.append(el('p','mx-sub','Audio stays on your Wi-Fi, encrypted end to end. Nothing is uploaded.'));
   const r=el('div','mx-row');r.append(button('Join','check',async()=>{const p=link.pendingOffer;link.pendingOffer=null;try{await link.join(p);}catch(e){link.error=e.message;x.refresh();}},'blue lk-main'),button('Cancel','close',()=>{link.pendingOffer=null;x.refresh();}));body.append(r);return;}
  if(s==='idle'||s==='lost'){
   body.append(el('p','mx-sub','Send this device’s mix (or one channel) to another Pixel Pusher on the same Wi-Fi, and hear its audio as the Link channel. Encrypted (DTLS-SRTP), no cloud, no uploads.'));
   const r=el('div','mx-row');r.append(button(s==='lost'?'Pair again: host':'Host: show QR','projector',()=>link.host().catch(e=>{link.error=e.message;x.refresh();}),'blue lk-main'));body.append(r);
   body.append(el('b',null,'Join'));body.append(el('p','mx-sub','Scan the host’s QR with this iPhone’s Camera app, or paste the host link:'));
   body.append(pasteBox('Paste the host link',p=>link.join(p),'Join'));return;}
  if(s==='preparing'||s==='connecting'){body.append(el('p','lk-big',s==='preparing'?'Preparing…':'Connecting…'));body.append(button('Cancel','close',()=>link.disconnect()));return;}
  if(s==='hosting'){body.append(el('p','lk-step','1 · On the other device, scan this with the Camera app'));body.append(qrBlock(link.offerUrl,'Host QR code'));body.append(shareRow(link.offerUrl));
   body.append(el('p','lk-step','2 · Then scan the guest’s QR with this device’s Camera, or paste it'));body.append(pasteBox('Paste the guest answer',p=>link.receiveAnswer(p),'Use answer'));
   body.append(button('Cancel','close',()=>link.disconnect()));return;}
  if(s==='approve'){body.append(el('p','lk-step','Does the other screen show this code?'));body.append(codeBox(link.code));
   const r=el('div','mx-row');r.append(button('Approve','check',()=>link.approve(),'lk-ok lk-main'),button('Reject','close',()=>link.reject(),'lk-no'));body.append(r);
   body.append(el('p','mx-sub','Only approve if both codes match: a different code means a different device answered.'));return;}
  if(s==='waiting'){body.append(el('p','lk-step','Show this to the host: scan with its Camera, or share the link'));body.append(qrBlock(link.answerUrl,'Guest answer QR code'));body.append(shareRow(link.answerUrl));
   body.append(el('p','lk-step','Match code (must be the same on the host)'));body.append(codeBox(link.code));body.append(el('p','mx-sub','Waiting for the host to approve…'));body.append(button('Cancel','close',()=>link.disconnect()));return;}
  if(s==='connected'||s==='reconnecting'){
   body.append(el('p','lk-status'+(s==='reconnecting'?' warn':''),s==='connected'?'● Linked · encrypted (DTLS-SRTP) · '+(link.role==='host'?'you are host':'you joined'):'Reconnecting… (Wi-Fi blip). Gives up after '+Math.round(link.lostMs/1000)+' s.'));
   body.append(el('b',null,'Send'));const cr=el('div','mx-row lk-src');for(const [id,lab]of SEND_SOURCES){const c=chip(lab,()=>link.setSource(id),link.source===id);c.dataset.src=id;c.setAttribute('aria-pressed',String(link.source===id));cr.append(c);}body.append(cr);
   body.append(meterRow('send','SEND'));body.append(meterRow('link','RECEIVE'));statEl=el('p','mx-db lk-stats',statsText());body.append(statEl);
   body.append(el('p','mx-sub','Received audio is the Link channel in the Mixer. It is never sent back (no loops).'));
   body.append(button('Disconnect','close',()=>{link.disconnect();note('Link disconnected');},'lk-no lk-main'));if(!raf)raf=requestAnimationFrame(loop);return;}
 }
 async function handoffFromUrl(payload){x.pendingAnswer=x.linkUrl(payload);const ok=await handoffAnswer(payload);handoff=ok?'sent':'none';x.refresh();}
 return {drawer,updateStats,handoffFromUrl,get handoff(){return handoff;}};
}
