// Bloom text style: procedural vines, leaves and flowers that grow out of the letter edges.
// Rasterized without antialiasing into a data texture: R = vine birth (0..1), G = flower birth, B = flower colour id.
// Colour ids map to red / blue / violet petals and a green centre in the shader (no pink). Original Brainhertz code.
export const BLOOM_IDS=[60,130,200];export const BLOOM_CENTER=255;
function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
export function hashText(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
// mask: Uint8 alpha-ish (0..255) of the text, w x h. Returns {data:Uint8ClampedArray(w*h*4), vines, flowers}.
export function growBloom(mask,w,h,seed=1,{maxVines=60}={}){
 const R=rng(seed),data=new Uint8ClampedArray(w*h*4),on=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[(y|0)*w+(x|0)]>127;
 for(let i=3;i<data.length;i+=4)data[i]=255;
 const cand=[];const st=6;
 for(let y=st;y<h-st;y+=st)for(let x=st;x<w-st;x+=st){if(!on(x,y))continue;for(const [dx,dy]of [[0,-1],[1,0],[-1,0],[0,1]])if(!on(x+dx*st,y+dy*st)){cand.push([x,y,dx,dy]);break;}}
 for(let i=cand.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[cand[i],cand[j]]=[cand[j],cand[i]];}
 const seeds=[];for(const c of cand){if(seeds.length>=maxVines)break;if(seeds.every(s=>Math.hypot(s[0]-c[0],s[1]-c[1])>26))seeds.push(c);}
 const stamp=(cx,cy,r,ch,val,id)=>{const r2=r*r;for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r));y++)for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r));x++){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy>r2)continue;const o=(y*w+x)*4;
  if(ch===0){if(data[o+1])continue;const cur=data[o];if(!cur||val<cur)data[o]=val;}else{data[o]=0;data[o+1]=val;data[o+2]=id;}}};
 const flower=(cx,cy,rad,birth,id)=>{const petals=5+Math.floor(R()*2),rot=R()*Math.PI*2,val=Math.max(1,Math.round(1+254*birth));
  for(let y=Math.max(0,Math.floor(cy-rad));y<=Math.min(h-1,Math.ceil(cy+rad));y++)for(let x=Math.max(0,Math.floor(cx-rad));x<=Math.min(w-1,Math.ceil(cx+rad));x++){const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx)+rot;
   const edge=rad*(.5+.5*Math.abs(Math.cos(a*petals/2)));if(d>edge)continue;const o=(y*w+x)*4;data[o]=0;data[o+1]=val;data[o+2]=d<rad*.3?BLOOM_CENTER:id;}};
 const vines=[],flowers=[];
 for(const [sx,sy,dx,dy]of seeds){let x=sx,y=sy,ang=Math.atan2(dy,dx)+(R()-.5)*1.1;const len=22+Math.floor(R()*58),start=R()*.32,span=.38+R()*.25,curl=(R()<.5?-1:1)*(.6+R()*1.2),freq=.08+R()*.12,ph=R()*6.3;const pts=[];
  for(let k=0;k<len;k++){const u=k/len;ang+=Math.sin(k*freq+ph)*.09+curl*u*u*.16;x+=Math.cos(ang)*2.6;y+=Math.sin(ang)*2.6;if(x<4||y<4||x>w-5||y>h-5)break;const b=Math.min(.9,start+u*span);pts.push([x,y,b]);
   stamp(x,y,3.8-1.9*u,0,Math.max(1,Math.round(1+254*b)));
   if(k>6&&k%13===0){const side=(k/13)%2?1:-1,la=ang+side*1.2;for(let s=1;s<=6;s++)stamp(x+Math.cos(la)*s*2.2,y+Math.sin(la)*s*2.2,3-s*.32,0,Math.max(1,Math.round(1+254*b)));}
   if(k>10&&R()<.025){const bud=Math.min(.95,b+.05);flowers.push([x,y,5+R()*4,bud]);}}
  if(pts.length>4){const [ex,ey,eb]=pts.at(-1);flowers.push([ex,ey,10+R()*11,Math.min(.97,eb+.04)]);vines.push(pts.length);}}
 for(const [x,y,r,b]of flowers)flower(x,y,r,b,BLOOM_IDS[Math.floor(R()*BLOOM_IDS.length)]);
 return {data,vines:vines.length,flowers:flowers.length};}
