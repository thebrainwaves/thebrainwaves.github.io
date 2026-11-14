// Projection mapping model (pure, no DOM): surfaces with corner pins (homography), mesh warp offsets,
// polygon masks, per-surface source/colour/opacity/brightness/gamma, venues and an exit-gesture detector.
// Coordinates: output space is 0..1 with y down; surface UV is 0..1 (0,0 = top-left corner pin). Original Brainhertz code.
export const MAX_SURFACES=8,MESH_SIZES=[0,3,4,5,6],MAX_MASK_POINTS=48,ROTATIONS=[0,90,180,270];
export const ASPECTS=[['16:9',16/9],['16:10',16/10],['4:3',4/3],['1:1',1],['9:16',9/16],['screen',0]];
export const SOURCE_KINDS=[['main','Main output'],['clip','Clip'],['gen','Generative'],['color','Solid colour']];
// Brainhertz projection colours (no pink).
export const MAP_COLORS=[['#ff2b3d','Red'],['#2f6cff','Blue'],['#6e3bff','Violet'],['#27e889','Green'],['#e8ecff','White'],['#000000','Black']];
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const num=(v,d,a,b)=>{v=Number(v);return Number.isFinite(v)?clamp(v,a,b):d;};
const isHex=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
// ---------- Homography (unit square -> quad), inverse, apply ----------
// corners: [[x,y] TL, TR, BR, BL]. Returns 3x3 row-major [a,b,c,d,e,f,g,h,1] with (u,v)->((a u+b v+c)/(g u+h v+1), (d u+e v+f)/(...)).
export function squareToQuad(q){
 const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=q,dx1=x1-x2,dx2=x3-x2,dy1=y1-y2,dy2=y3-y2,sx=x0-x1+x2-x3,sy=y0-y1+y2-y3;
 let g=0,h=0;const den=dx1*dy2-dx2*dy1;
 if(Math.abs(sx)>1e-12||Math.abs(sy)>1e-12){if(Math.abs(den)<1e-12)return null;g=(sx*dy2-dx2*sy)/den;h=(dx1*sy-sx*dy1)/den;}
 return [x1-x0+g*x1,x3-x0+h*x3,x0,y1-y0+g*y1,y3-y0+h*y3,y0,g,h,1];
}
export function applyH(H,u,v){const w=H[6]*u+H[7]*v+H[8];return [(H[0]*u+H[1]*v+H[2])/w,(H[3]*u+H[4]*v+H[5])/w,w];}
export function invert3(m){const [a,b,c,d,e,f,g,h,i]=m,A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-14)return null;const k=1/det;
 return [A*k,-(b*i-c*h)*k,(b*f-c*e)*k,B*k,(a*i-c*g)*k,-(a*f-c*d)*k,C*k,-(a*h-b*g)*k,(a*e-b*d)*k];}
// Output point -> surface UV through the corner pin (ignores mesh offsets). null when the quad is degenerate.
export function outputToUV(s,x,y){const H=squareToQuad(s.corners);if(!H)return null;const I=invert3(H);if(!I)return null;const w=I[6]*x+I[7]*y+I[8];return [(I[0]*x+I[1]*y+I[2])/w,(I[3]*x+I[4]*y+I[5])/w];}
// Convex, non-degenerate quad (corner pins must not cross).
export function quadOK(q){let sign=0;for(let i=0;i<4;i++){const [ax,ay]=q[i],[bx,by]=q[(i+1)%4],[cx,cy]=q[(i+2)%4],z=(bx-ax)*(cy-by)-(by-ay)*(cx-bx);if(Math.abs(z)<1e-9)return false;const s=Math.sign(z);if(sign&&s!==sign)return false;sign=s;}return true;}
// ---------- Mesh warp: n x n offsets (output units) added on top of the corner pin, smooth (Catmull-Rom) between points ----------
export const meshOffsets=n=>Array.from({length:n*n},()=>[0,0]);
function cr(p0,p1,p2,p3,t){const t2=t*t,t3=t2*t;return .5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t2+(-p0+3*p1-3*p2+p3)*t3);}
export function meshOffsetAt(mesh,u,v){const n=mesh?.n||0;if(n<2)return [0,0];const P=mesh.pts,at=(i,j)=>P[clamp(j,0,n-1)*n+clamp(i,0,n-1)];
 const fx=clamp(u)*(n-1),fy=clamp(v)*(n-1),i=Math.min(n-2,Math.floor(fx)),j=Math.min(n-2,Math.floor(fy)),tx=fx-i,ty=fy-j,out=[0,0];
 for(let k=0;k<2;k++){const row=r=>cr(at(i-1,r)[k],at(i,r)[k],at(i+1,r)[k],at(i+2,r)[k],tx);out[k]=cr(row(j-1),row(j),row(j+1),row(j+2),ty);}return out;}
// Change mesh density, resampling the existing warp so the surface keeps its shape.
export function resizeMesh(mesh,n){if(!n)return {n:0,pts:[]};const pts=[];for(let j=0;j<n;j++)for(let i=0;i<n;i++)pts.push(mesh?.n?meshOffsetAt(mesh,i/(n-1),j/(n-1)):[0,0]);return {n,pts};}
// Mesh handle position in output space.
export function meshPoint(s,i,j){const n=s.mesh.n,u=i/(n-1),v=j/(n-1),H=squareToQuad(s.corners),[x,y]=H?applyH(H,u,v):[u,v],o=s.mesh.pts[j*n+i];return [x+o[0],y+o[1]];}
// Tessellated surface: per vertex [x, y, u/w, v/w, 1/w] so the fragment shader divides for perspective-correct texturing.
export function buildGeometry(s,tess){const H=squareToQuad(s.corners)||[1,0,0,0,1,0,0,0,1],T=Math.max(1,tess|0),warp=s.mesh?.n>=2,verts=new Float32Array((T+1)*(T+1)*5);let k=0;
 for(let j=0;j<=T;j++)for(let i=0;i<=T;i++){const u=i/T,v=j/T,[x,y,w]=applyH(H,u,v),o=warp?meshOffsetAt(s.mesh,u,v):[0,0];verts[k++]=x+o[0];verts[k++]=y+o[1];verts[k++]=u/w;verts[k++]=v/w;verts[k++]=1/w;}
 const idx=new Uint16Array(T*T*6);k=0;for(let j=0;j<T;j++)for(let i=0;i<T;i++){const a=j*(T+1)+i,b=a+1,c=a+T+1,d=c+1;idx.set([a,b,c,b,d,c],k);k+=6;}return {verts,idx,count:idx.length};}
// ---------- Masks: polygon in surface UV, rasterized + feathered by the UI (box blur here keeps it testable) ----------
export function boxBlur(a,w,h,r,passes=3){r=Math.max(0,Math.round(r));if(!r)return a;let src=Float32Array.from(a),tmp=new Float32Array(a.length);const n=2*r+1;
 for(let p=0;p<passes;p++){for(let y=0;y<h;y++){let s=0;for(let x=-r;x<=r;x++)s+=src[y*w+clamp(x,0,w-1)];for(let x=0;x<w;x++){tmp[y*w+x]=s/n;s+=src[y*w+Math.min(w-1,x+r+1)]-src[y*w+Math.max(0,x-r)];}}
  for(let x=0;x<w;x++){let s=0;for(let y=-r;y<=r;y++)s+=tmp[clamp(y,0,h-1)*w+x];for(let y=0;y<h;y++){src[y*w+x]=s/n;s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];}}}
 const out=new Uint8ClampedArray(a.length);for(let i=0;i<out.length;i++)out[i]=src[i];return out;}
export function pointInPoly(pts,x,y){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [xi,yi]=pts[i],[xj,yj]=pts[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
// ---------- Model ----------
let seq=0;const newId=()=>'s'+Date.now().toString(36)+(seq++).toString(36);
export function defaultCorners(index=0){const cols=2,w=.42,h=.42,c=index%4,x=.06+(c%cols)*.5,y=.06+Math.floor(c/cols)*.5,o=Math.floor(index/4)*.04;return [[x+o,y+o],[x+w+o,y+o],[x+w+o,y+h+o],[x+o,y+h+o]];}
export function defaultSurface(index=0,kind='main'){return {id:newId(),name:'Surface '+(index+1),corners:index===0?[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]:defaultCorners(index),mesh:{n:0,pts:[]},
 source:{kind,clipId:null,genId:'tunnel',color:'#2f6cff'},fit:'crop',opacity:1,brightness:1,gamma:1,feather:0,rotate:0,flipX:false,flipY:false,visible:true,
 mask:{points:[],closed:false,on:false,invert:false,feather:.02}};}
export function defaultMapping(){return {version:1,aspect:'16:9',test:false,blackout:false,perform:true,surfaces:[defaultSurface(0)]};}
const pt=(p,d=[.5,.5])=>Array.isArray(p)&&p.length>=2?[num(p[0],d[0],-1,2),num(p[1],d[1],-1,2)]:d;
export function normalizeSurface(raw,index=0){const d=defaultSurface(index);if(!raw||typeof raw!=='object')return d;
 const s={...d,id:typeof raw.id==='string'&&/^[\w-]{1,40}$/.test(raw.id)?raw.id:d.id,name:typeof raw.name==='string'&&raw.name.trim()?raw.name.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,32):d.name};
 s.corners=Array.isArray(raw.corners)&&raw.corners.length===4?raw.corners.map((p,i)=>pt(p,d.corners[i])):d.corners;
 const n=MESH_SIZES.includes(raw.mesh?.n)?raw.mesh.n:0;s.mesh=n&&Array.isArray(raw.mesh.pts)&&raw.mesh.pts.length===n*n?{n,pts:raw.mesh.pts.map(p=>pt(p,[0,0]).map(v=>clamp(v,-1,1)))}:resizeMesh(null,n);
 const src=raw.source||{};s.source={kind:SOURCE_KINDS.some(([k])=>k===src.kind)?src.kind:'main',clipId:typeof src.clipId==='string'&&src.clipId.length<80?src.clipId:null,genId:typeof src.genId==='string'&&/^[\w-]{1,24}$/.test(src.genId)?src.genId:'tunnel',color:isHex(src.color)?src.color.toLowerCase():d.source.color};
 s.fit=raw.fit==='stretch'?'stretch':'crop';s.opacity=num(raw.opacity,1,0,1);s.brightness=num(raw.brightness,1,0,2);s.gamma=num(raw.gamma,1,.4,2.5);s.feather=num(raw.feather,0,0,.25);
 s.rotate=ROTATIONS.includes(raw.rotate)?raw.rotate:0;s.flipX=raw.flipX===true;s.flipY=raw.flipY===true;s.visible=raw.visible!==false;
 const m=raw.mask||{};s.mask={points:Array.isArray(m.points)?m.points.slice(0,MAX_MASK_POINTS).map(p=>pt(p).map(v=>clamp(v,-.5,1.5))):[],closed:m.closed===true,on:m.on===true,invert:m.invert===true,feather:num(m.feather,.02,0,.2)};
 if(s.mask.points.length<3){s.mask.closed=false;s.mask.on=false;}return s;}
export function normalizeMapping(raw){const d=defaultMapping();if(!raw||typeof raw!=='object')return d;
 const list=Array.isArray(raw.surfaces)?raw.surfaces.slice(0,MAX_SURFACES).map(normalizeSurface):[];const ids=new Set();for(const s of list){if(ids.has(s.id))s.id=newId();ids.add(s.id);}
 return {version:1,aspect:ASPECTS.some(([k])=>k===raw.aspect)?raw.aspect:'16:9',test:raw.test===true,blackout:raw.blackout===true,perform:raw.perform!==false,surfaces:list.length?list:d.surfaces};}
export function aspectRatio(m,screenW=16,screenH=9){const a=ASPECTS.find(([k])=>k===m.aspect);return a&&a[1]?a[1]:screenW/Math.max(1,screenH);}
// Largest box of the given aspect centred in W x H (CSS px).
export function fitBox(W,H,ar){let w=W,h=W/ar;if(h>H){h=H;w=H*ar;}return {x:(W-w)/2,y:(H-h)/2,w,h};}
// Corner edits: move one corner, the whole surface, or nudge; reject crossing pins.
export function moveCorner(s,i,x,y){const c=s.corners.map(p=>p.slice());c[i]=[clamp(x,-.5,1.5),clamp(y,-.5,1.5)];if(!quadOK(c))return false;s.corners=c;return true;}
export function moveSurface(s,dx,dy){s.corners=s.corners.map(([x,y])=>[clamp(x+dx,-.5,1.5),clamp(y+dy,-.5,1.5)]);}
export function moveMeshPoint(s,i,j,x,y){const n=s.mesh.n,H=squareToQuad(s.corners);if(!H||n<2)return false;const [bx,by]=applyH(H,i/(n-1),j/(n-1));s.mesh.pts[j*n+i]=[clamp(x-bx,-1,1),clamp(y-by,-1,1)];return true;}
export function resetCorners(s,index=0){s.corners=index===0?[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]:defaultCorners(index);}
// ---------- Venues (saved setups) ----------
export const VENUE_FILE_KIND='brainhertz-pixelpusher-venue';
export function venueToJSON(name,mapping){return JSON.stringify({kind:VENUE_FILE_KIND,version:1,name:cleanVenueName(name),saved:new Date().toISOString(),mapping:normalizeMapping(mapping)},null,1);}
export function venueFromJSON(text){let raw;try{raw=JSON.parse(text);}catch{throw new Error('That file is not a venue (not JSON).');}
 if(!raw||raw.kind!==VENUE_FILE_KIND||typeof raw.mapping!=='object')throw new Error('That file is not a Pixel Pusher venue.');return {name:cleanVenueName(raw.name),mapping:normalizeMapping(raw.mapping)};}
export const cleanVenueName=s=>String(s??'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,40)||'Venue';
// ---------- Exit gestures for the clean output: triple-tap anywhere, or long-press (in the top-left corner while fingers perform) ----------
export class ExitGesture{
 constructor({longMs=1000,tapMs=280,tripleMs=700,slop=24,corner=.18}={}){Object.assign(this,{longMs,tapMs,tripleMs,slop,corner});this.taps=[];this.down=null;}
 // x,y normalized 0..1 in the output; returns 'triple' | null on up, and arms a long-press checked by poll().
 start(x,y,t,id=0,count=1){if(count>1){this.down=null;return null;}this.down={x,y,t,id,moved:false};return null;}
 move(x,y,id=0){const d=this.down;if(d&&d.id===id&&Math.hypot(x-d.x,y-d.y)>this.slop/400)d.moved=true;}
 end(x,y,t,id=0){const d=this.down;this.down=null;if(!d||d.id!==id||d.moved||t-d.t>this.tapMs)return null;this.taps=this.taps.filter(p=>t-p.t<this.tripleMs&&Math.hypot(p.x-x,p.y-y)<.15);this.taps.push({x,y,t});if(this.taps.length>=3){this.taps=[];return 'triple';}return null;}
 cancel(){this.down=null;}
 poll(t,performing=false){const d=this.down;if(!d||d.moved||t-d.t<this.longMs)return null;if(performing&&!(d.x<this.corner&&d.y<this.corner))return null;this.down=null;return 'long';}
}
