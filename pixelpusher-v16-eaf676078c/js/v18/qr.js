// QR code encoder (ISO/IEC 18004 model 2), byte mode, EC level L or M, versions 1-40. Clean-room Brainhertz code from the published spec tables.
const ECC={L:[0,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 M:[0,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28]};
const BLOCKS={L:[0,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
 M:[0,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49]};
const FORMAT_ECL={L:1,M:0};
export function rawModules(v){let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36;}return r;}
export const dataCodewords=(v,ecl)=>Math.floor(rawModules(v)/8)-ECC[ecl][v]*BLOCKS[ecl][v];
export const byteCapacity=(v,ecl)=>Math.floor((dataCodewords(v,ecl)*8-4-(v<10?8:16))/8);
export function alignPositions(v){if(v===1)return [];const n=Math.floor(v/7)+2,size=v*4+17,step=v===32?26:Math.ceil((v*4+4)/(n*2-2))*2,out=[];for(let p=size-7;out.length<n-1;p-=step)out.unshift(p);out.unshift(6);return out;}
// GF(256) with x^8+x^4+x^3+x^2+1
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11d;}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];}
export const gmul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
export function rsGenerator(deg){let g=[1];for(let i=0;i<deg;i++){const n=new Array(g.length+1).fill(0);for(let j=0;j<g.length;j++){n[j]^=g[j];n[j+1]^=gmul(g[j],EXP[i]);}g=n;}return g;} // highest power first
export function rsRemainder(data,deg){const g=rsGenerator(deg),r=new Array(deg).fill(0);for(const b of data){const f=b^r.shift();r.push(0);for(let i=0;i<deg;i++)r[i]^=gmul(g[i+1],f);}return r;}
function codewords(bytes,v,ecl){
 const cap=dataCodewords(v,ecl),bits=[];const put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1);};
 put(4,4);put(bytes.length,v<10?8:16);for(const b of bytes)put(b,8);put(0,Math.min(4,cap*8-bits.length));while(bits.length%8)bits.push(0);
 const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];data.push(b);}for(let p=0;data.length<cap;p++)data.push(p%2?0x11:0xec);
 const nb=BLOCKS[ecl][v],ecLen=ECC[ecl][v],raw=Math.floor(rawModules(v)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb)-ecLen,blocks=[],ecs=[];
 for(let i=0,k=0;i<nb;i++){const len=shortLen+(i<nShort?0:1),blk=data.slice(k,k+len);k+=len;blocks.push(blk);ecs.push(rsRemainder(blk,ecLen));}
 const out=[];for(let i=0;i<=shortLen;i++)for(const b of blocks)if(i<b.length)out.push(b[i]);for(let i=0;i<ecLen;i++)for(const e of ecs)out.push(e[i]);return out;
}
const MASKS=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
export function formatBits(ecl,mask){const d=FORMAT_ECL[ecl]<<3|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);return ((d<<10)|r)^0x5412;}
export function versionBits(v){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1f25);return v<<12|r;}
function build(v,ecl,cw,mask){
 const n=v*4+17,m=Array.from({length:n},()=>new Uint8Array(n)),fn=Array.from({length:n},()=>new Uint8Array(n));const set=(x,y,d)=>{m[y][x]=d?1:0;fn[y][x]=1;};
 for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(const [cx,cy]of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=n||y>=n)continue;const d=Math.max(Math.abs(dx),Math.abs(dy));set(x,y,d!==2&&d!==4);}
 const al=alignPositions(v),L=al.length;for(let i=0;i<L;i++)for(let j=0;j<L;j++){if((i===0&&j===0)||(i===0&&j===L-1)||(i===L-1&&j===0))continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(al[i]+dx,al[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
 const fb=formatBits(ecl,mask),bit=(b,i)=>(b>>>i)&1;
 for(let i=0;i<=5;i++)set(8,i,bit(fb,i));set(8,7,bit(fb,6));set(8,8,bit(fb,7));set(7,8,bit(fb,8));for(let i=9;i<15;i++)set(14-i,8,bit(fb,i));
 for(let i=0;i<8;i++)set(n-1-i,8,bit(fb,i));for(let i=8;i<15;i++)set(8,n-15+i,bit(fb,i));set(8,n-8,1);
 if(v>=7){const vb=versionBits(v);for(let i=0;i<18;i++){const a=n-11+i%3,b=Math.floor(i/3),d=bit(vb,i);set(a,b,d);set(b,a,d);}}
 let k=0;const total=cw.length*8;
 for(let right=n-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<n;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?n-1-vert:vert;if(fn[y][x])continue;let d=0;if(k<total){d=(cw[k>>>3]>>>(7-(k&7)))&1;k++;}if(MASKS[mask](x,y))d^=1;m[y][x]=d;}}
 return m;
}
export function penalty(m){const n=m.length;let p=0,dark=0;
 const line=get=>{let run=1,s=0;for(let i=1;i<n;i++){if(get(i)===get(i-1)){run++;if(run===5)s+=3;else if(run>5)s++;}else run=1;}
  for(let i=0;i+10<n;i++){let a=true,b=true;const P=[1,0,1,1,1,0,1,0,0,0,0];for(let j=0;j<11;j++){if(get(i+j)!==P[j])a=false;if(get(i+j)!==P[10-j])b=false;}if(a)s+=40;if(b)s+=40;}return s;};
 for(let y=0;y<n;y++){p+=line(i=>m[y][i]);p+=line(i=>m[i][y]);}
 for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])p+=3;}
 for(const r of m)for(const c of r)dark+=c;p+=10*Math.floor(Math.abs(dark*20-n*n*10)/(n*n));return p;}
// Returns {version, ecl, mask, size, modules} or throws when the data is larger than version 40 holds.
export function encodeQR(input,{ecl='L',minVersion=1}={}){
 const bytes=typeof input==='string'?new TextEncoder().encode(input):input;let v=minVersion;while(v<=40&&byteCapacity(v,ecl)<bytes.length)v++;if(v>40)throw new Error('Too much data for a QR code.');
 if(ecl==='L'&&byteCapacity(v,'M')>=bytes.length)ecl='M'; // free upgrade to M at the same size
 const cw=codewords(bytes,v,ecl);let best=null;for(let mask=0;mask<8;mask++){const m=build(v,ecl,cw,mask),s=penalty(m);if(!best||s<best.s)best={m,s,mask};}
 return {version:v,ecl,mask:best.mask,size:v*4+17,modules:best.m};
}
// Draws black-on-white with a 4-module quiet zone (cameras need the light border). Returns the canvas.
export function drawQR(canvas,qr,px){const q=4,n=qr.size+2*q,s=Math.max(1,px||Math.floor(Math.min(canvas.width||512,canvas.height||512)/n));canvas.width=canvas.height=n*s;const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,n*s,n*s);g.fillStyle='#000';for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.modules[y][x])g.fillRect((x+q)*s,(y+q)*s,s,s);return canvas;}
