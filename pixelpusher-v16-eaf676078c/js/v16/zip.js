// Original minimal ZIP writer (stored entries, no compression). PNGs are already compressed.
const TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function safeName(name){const clean=String(name).replace(/[^A-Za-z0-9._-]/g,'_').replace(/^\.+/,'').slice(0,80);return clean||'file';}
// entries: [{name, bytes:Uint8Array}] -> Uint8Array zip
export function buildZip(entries,date=new Date()){
 const enc=new TextEncoder(),local=[],central=[];let offset=0;
 const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),dosDate=((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
 const used=new Set();
 for(const entry of entries){
  let name=safeName(entry.name);while(used.has(name))name='_'+name;used.add(name);
  const nameBytes=enc.encode(name),data=entry.bytes,crc=crc32(data);
  const head=new DataView(new ArrayBuffer(30));
  head.setUint32(0,0x04034b50,true);head.setUint16(4,20,true);head.setUint16(6,0x0800,true);head.setUint16(8,0,true);head.setUint16(10,dosTime,true);head.setUint16(12,dosDate,true);head.setUint32(14,crc,true);head.setUint32(18,data.length,true);head.setUint32(22,data.length,true);head.setUint16(26,nameBytes.length,true);head.setUint16(28,0,true);
  local.push(new Uint8Array(head.buffer),nameBytes,data);
  const dir=new DataView(new ArrayBuffer(46));
  dir.setUint32(0,0x02014b50,true);dir.setUint16(4,20,true);dir.setUint16(6,20,true);dir.setUint16(8,0x0800,true);dir.setUint16(10,0,true);dir.setUint16(12,dosTime,true);dir.setUint16(14,dosDate,true);dir.setUint32(16,crc,true);dir.setUint32(20,data.length,true);dir.setUint32(24,data.length,true);dir.setUint16(28,nameBytes.length,true);dir.setUint32(42,offset,true);
  central.push(new Uint8Array(dir.buffer),nameBytes);
  offset+=30+nameBytes.length+data.length;
 }
 const centralSize=central.reduce((a,b)=>a+b.length,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,offset,true);
 const parts=[...local,...central,new Uint8Array(end.buffer)],out=new Uint8Array(parts.reduce((a,b)=>a+b.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}
 return out;
}
