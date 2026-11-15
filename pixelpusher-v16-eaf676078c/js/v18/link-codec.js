// Pixel Pusher Link signaling codec: stripped SDP -> deflate-raw -> base64url inside a URL fragment (never sent to a server).
// Also the 6-digit match code from both DTLS fingerprints. Never log what passes through here: SDP holds the ICE password.
export const OFFER_TTL_MS=10*60*1000;
export const MAX_PAYLOAD=4000;
export function stripSdp(sdp){
 const lines=sdp.split(/\r?\n/).filter(Boolean),out=[];let sec=null,opus=null;
 // find the Opus payload type of the audio section
 for(const l of lines){const m=/^a=rtpmap:(\d+) opus\/48000\/2/i.exec(l);if(m){opus=m[1];break;}}
 for(const l of lines){
  if(l.startsWith('m=')){sec=l.slice(2,l.indexOf(' '));if(sec==='audio'&&opus){const p=l.split(' ');out.push(p.slice(0,3).join(' ')+' '+opus);continue;}out.push(l);continue;}
  if(sec==='audio'){
   if(/^a=(extmap|extmap-allow-mixed|rtcp-fb|ssrc|ssrc-group)[:\s]/.test(l)||l==='a=extmap-allow-mixed')continue;
   const pt=/^a=(rtpmap|fmtp|rtcp-fb):(\d+)/.exec(l);if(pt&&pt[2]!==opus)continue;
   if(pt&&pt[1]==='fmtp'){const kv=new Map(l.slice(l.indexOf(' ')+1).split(';').filter(Boolean).map(s=>s.trim().split('=')));for(const [k,v]of [['minptime','10'],['useinbandfec','1'],['stereo','1'],['sprop-stereo','1'],['maxaveragebitrate','256000']])kv.set(k,v);out.push('a=fmtp:'+opus+' '+[...kv].map(([k,v])=>k+'='+v).join(';'));continue;}
  }
  if(l.startsWith('a=candidate:')){if(!/ udp /i.test(l)||!/ typ host/.test(l))continue;}
  out.push(l);
 }
 if(opus&&!out.some(l=>l.startsWith('a=fmtp:'+opus+' '))){const i=out.findIndex(l=>l.startsWith('a=rtpmap:'+opus+' '));if(i>=0)out.splice(i+1,0,'a=fmtp:'+opus+' minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=256000');}
 return out.join('\r\n')+'\r\n';
}
const b64u={enc:u8=>{let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode(...u8.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
 dec:s=>{const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}};
const hasCS=()=>typeof CompressionStream!=='undefined'&&typeof DecompressionStream!=='undefined';
async function pipe(u8,stream){const r=new Blob([u8]).stream().pipeThrough(stream);return new Uint8Array(await new Response(r).arrayBuffer());}
// kind: 'o' offer | 'a' answer. Payload: kind '.' ('z' deflate | 'u' plain) base64url( "v1|<ms>|<sdp>" )
export async function encodeSignal(kind,sdp,now=Date.now(),{compress=hasCS()}={}){
 if(kind!=='o'&&kind!=='a')throw new Error('bad kind');const raw=new TextEncoder().encode('v1|'+now+'|'+sdp);
 const body=compress?await pipe(raw,new CompressionStream('deflate-raw')):raw;return kind+'.'+(compress?'z':'u')+b64u.enc(body);
}
export async function decodeSignal(payload,{now=Date.now(),ttl=OFFER_TTL_MS}={}){
 if(typeof payload!=='string'||payload.length>MAX_PAYLOAD)throw new Error('Link code is too long or empty.');
 const m=/^([oa])\.([zu])([A-Za-z0-9_-]{20,})$/.exec(payload.trim());if(!m)throw new Error('That is not a Pixel Pusher link code.');
 let u8;try{u8=b64u.dec(m[3]);if(m[2]==='z'){if(!hasCS())throw new Error('This browser cannot read compressed link codes.');u8=await pipe(u8,new DecompressionStream('deflate-raw'));}}catch(e){throw new Error(e.message?.startsWith('This browser')?e.message:'Link code is damaged. Scan or paste it again.');}
 if(u8.length>16000)throw new Error('Link code is too large.');
 const text=new TextDecoder().decode(u8),p=/^v1\|(\d{10,16})\|([\s\S]+)$/.exec(text);if(!p)throw new Error('Link code version is not supported.');
 const at=+p[1],sdp=p[2];if(!/^v=0\r?\n/.test(sdp)||!/\r?\nm=audio /.test(sdp))throw new Error('Link code has no audio session.');
 if(m[1]==='o'&&(now-at>ttl||at-now>5*60*1000))throw new Error('This link has expired. Ask the host for a new QR code.');
 return {kind:m[1],at,sdp};
}
export function fingerprint(sdp){const m=/a=fingerprint:sha-256 ([0-9A-F:]{95})/i.exec(sdp);return m?m[1].toUpperCase():'';}
export async function matchCode(offerSdp,answerSdp){
 const a=fingerprint(offerSdp),b=fingerprint(answerSdp);if(!a||!b)throw new Error('Missing encryption fingerprint.');
 const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('PPLINK1|'+a+'|'+b)));
 const n=((h[0]<<16)|(h[1]<<8)|h[2])%1000000;const s=String(n).padStart(6,'0');return s.slice(0,3)+' '+s.slice(3);
}
export function linkUrl(payload,loc=location){return loc.origin+loc.pathname+loc.search+'#ppl='+payload;}
export function readHash(hash){const m=/^#ppl=([oa]\.[zu][A-Za-z0-9_-]{20,4000})$/.exec(hash||'');return m?m[1]:null;}
