// Projection mapping renderer: one small WebGL1 context draws every surface (perspective-correct corner pin,
// mesh warp, masks, edge feather, brightness/gamma, opacity, flip/rotate) over black. Original Brainhertz code.
import {buildGeometry,boxBlur,MAX_SURFACES} from './map.js';
const VS=`attribute vec2 aP;attribute vec3 aQ;varying vec3 vQ;void main(){vQ=aQ;gl_Position=vec4(aP.x*2.-1.,1.-aP.y*2.,0.,1.);}`;
const FS=`precision mediump float;varying vec3 vQ;uniform sampler2D uSrc,uMask;uniform vec3 uColor;uniform vec4 uCrop;
uniform float uKind,uOpacity,uBright,uGamma,uFeather,uMaskOn,uRot;uniform vec2 uFlip;
void main(){vec2 uv=vQ.xy/vQ.z;float e=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));if(e<-.001)discard;
 float a=uOpacity*(uFeather>0.?smoothstep(0.,uFeather,e):1.);if(uMaskOn>.5)a*=texture2D(uMask,uv).r;
 vec2 s=clamp(uv,0.,1.);if(uFlip.x>.5)s.x=1.-s.x;if(uFlip.y>.5)s.y=1.-s.y;
 if(uRot>2.5)s=vec2(1.-s.y,s.x);else if(uRot>1.5)s=1.-s;else if(uRot>.5)s=vec2(s.y,1.-s.x);
 s=uCrop.xy+s*uCrop.zw;vec3 c=uKind>.5?uColor:texture2D(uSrc,s).rgb;
 c=pow(clamp(c*uBright,0.,1.),vec3(uGamma));gl_FragColor=vec4(c*a,a);}`;
export class MapRenderer{
 constructor(canvas){
  this.canvas=canvas;const gl=canvas.getContext('webgl',{alpha:false,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL unavailable for Map mode.');
  this.gl=gl;const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error('Map shader: '+gl.getShaderInfoLog(x));return x;};
  const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,VS));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,FS));gl.bindAttribLocation(p,0,'aP');gl.bindAttribLocation(p,1,'aQ');gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Map shader link failed.');this.p=p;this.u={};
  for(const n of ['Src','Mask','Color','Crop','Kind','Opacity','Bright','Gamma','Feather','MaskOn','Rot','Flip'])this.u[n]=gl.getUniformLocation(p,'u'+n);
  this.vb=gl.createBuffer();this.ib=gl.createBuffer();this.tex=new Map();this.masks=new Map();this.geo=new Map();this.white=this.makeTex();
  gl.bindTexture(gl.TEXTURE_2D,this.white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
  this.maskCanvas=document.createElement('canvas');this.maskCanvas.width=this.maskCanvas.height=256;this.frames=0;
 }
 makeTex(){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const [k,v]of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return t;}
 resize(w,h){w=Math.max(2,Math.round(w));h=Math.max(2,Math.round(h));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
 // Upload an image/canvas/video once per frame per key (only sources that are on screen are uploaded).
 upload(key,img){if(!img)return null;const gl=this.gl;let t=this.tex.get(key);if(!t){t=this.makeTex();this.tex.set(key,t);}
  if(t._frame===this.frames)return t;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);t._frame=this.frames;t._w=img.videoWidth||img.width;t._h=img.videoHeight||img.height;}catch{return null;}return t;}
 forget(key){const t=this.tex.get(key);if(t){this.gl.deleteTexture(t);this.tex.delete(key);}}
 // Mask texture: polygon in surface UV, inverted if asked, feathered with a box blur. Rebuilt only when the mask changes.
 mask(s){const m=s.mask,sig=JSON.stringify(m);let e=this.masks.get(s.id);if(e&&e.sig===sig)return e.t;const gl=this.gl;if(!e){e={t:this.makeTex()};this.masks.set(s.id,e);}e.sig=sig;
  const c=this.maskCanvas,g=c.getContext('2d',{willReadFrequently:true}),N=256;g.setTransform(1,0,0,1,0,0);g.fillStyle=m.invert?'#fff':'#000';g.fillRect(0,0,N,N);
  g.fillStyle=m.invert?'#000':'#fff';g.beginPath();m.points.forEach(([u,v],i)=>i?g.lineTo(u*N,v*N):g.moveTo(u*N,v*N));g.closePath();g.fill();
  const img=g.getImageData(0,0,N,N),a=new Uint8ClampedArray(N*N);for(let i=0;i<a.length;i++)a[i]=img.data[i*4];const b=boxBlur(a,N,N,m.feather*N/1.6),px=new Uint8Array(N*N*4);
  for(let i=0;i<a.length;i++){px[i*4]=px[i*4+1]=px[i*4+2]=b[i];px[i*4+3]=255;}gl.bindTexture(gl.TEXTURE_2D,e.t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,px);return e.t;}
 geometry(s){const tess=s.mesh?.n>=2?28:1,sig=tess+JSON.stringify(s.corners)+(tess>1?JSON.stringify(s.mesh.pts):'');let g=this.geo.get(s.id);if(!g||g.sig!==sig){g={sig,...buildGeometry(s,tess)};this.geo.set(s.id,g);}return g;}
 // surfaces: normalized mapping surfaces; getSource(s) -> {img,key} | {color:[r,g,b]} | null. box: output rect in canvas px.
 draw(mapping,getSource,box,{pattern=null,patternFor=null}={}){
  const gl=this.gl,W=this.canvas.width,H=this.canvas.height;this.frames++;gl.viewport(0,0,W,H);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
  if(mapping.blackout)return;
  gl.enable(gl.SCISSOR_TEST);gl.scissor(Math.round(box.x),Math.round(H-box.y-box.h),Math.round(box.w),Math.round(box.h));gl.viewport(Math.round(box.x),Math.round(H-box.y-box.h),Math.round(box.w),Math.round(box.h));
  gl.useProgram(this.p);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);const u=this.u;gl.uniform1i(u.Src,0);gl.uniform1i(u.Mask,1);
  const full={id:'__bg',corners:[[0,0],[1,0],[1,1],[0,1]],mesh:{n:0},mask:{on:false},opacity:1,brightness:1,gamma:1,feather:0,rotate:0,flipX:false,flipY:false,fit:'stretch'};
  if(mapping.test&&pattern)this.surface(full,{img:pattern,key:pattern._key||'__pattern',static:true});
  mapping.surfaces.slice(0,MAX_SURFACES).forEach((s,i)=>{if(!s.visible||s.opacity<=0)return;const src=mapping.test&&patternFor?{img:patternFor(s,i),key:'__pat_'+i+'_'+s.name,static:true}:getSource(s);if(src)this.surface(s,src,box);});
  gl.disable(gl.BLEND);gl.disable(gl.SCISSOR_TEST);
 }
 surface(s,src,box){const gl=this.gl,u=this.u;let tex=null;
  if(src.img){tex=src.static?(this.tex.get(src.key)||this.upload(src.key,src.img)):this.upload(src.key,src.img);if(!tex)return;}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex||this.white);gl.uniform1f(u.Kind,src.color?1:0);if(src.color)gl.uniform3fv(u.Color,src.color);
  // Crop (cover) keeps the source aspect inside the surface; stretch fills it.
  let crop=[0,0,1,1];if(s.fit==='crop'&&tex&&tex._w&&box){const [a,b,c,d]=s.corners,qw=(Math.hypot(b[0]-a[0],(b[1]-a[1])*box.h/box.w)+Math.hypot(c[0]-d[0],(c[1]-d[1])*box.h/box.w))/2*box.w,qh=(Math.hypot((d[0]-a[0])*box.w/box.h,d[1]-a[1])+Math.hypot((c[0]-b[0])*box.w/box.h,c[1]-b[1]))/2*box.h;
   let qa=qw/Math.max(1,qh);if(s.rotate===90||s.rotate===270)qa=1/qa;const sa=tex._w/tex._h;if(sa>qa){const k=qa/sa;crop=[(1-k)/2,0,k,1];}else{const k=sa/qa;crop=[0,(1-k)/2,1,k];}}
  gl.uniform4fv(u.Crop,crop);gl.uniform1f(u.Opacity,s.opacity);gl.uniform1f(u.Bright,s.brightness);gl.uniform1f(u.Gamma,1/Math.max(.05,s.gamma));gl.uniform1f(u.Feather,s.feather);gl.uniform1f(u.Rot,(s.rotate||0)/90);gl.uniform2f(u.Flip,s.flipX?1:0,s.flipY?1:0);
  const maskOn=s.mask?.on&&s.mask.closed&&s.mask.points.length>=3;gl.uniform1f(u.MaskOn,maskOn?1:0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskOn?this.mask(s):this.white);gl.activeTexture(gl.TEXTURE0);
  const g=this.geometry(s);gl.bindBuffer(gl.ARRAY_BUFFER,this.vb);gl.bufferData(gl.ARRAY_BUFFER,g.verts,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,g.idx,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,20,8);gl.drawElements(gl.TRIANGLES,g.count,gl.UNSIGNED_SHORT,0);}
 drop(ids){for(const m of [this.masks,this.geo])for(const k of [...m.keys()])if(!ids.has(k)&&k!=='__bg'){if(m===this.masks)this.gl.deleteTexture(m.get(k).t);m.delete(k);}}
}
// Calibration patterns (2D canvas, Brainhertz colours, no pink): output-wide grid and per-surface grid + crosshair + corner numbers.
const RED='#ff2b3d',BLUE='#2f6cff',VIOLET='#6e3bff',GREEN='#27e889',WHITE='#e8ecff';
export function drawOutputPattern(c,w,h){c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,w,h);const step=Math.round(Math.min(w,h)/12);
 g.lineWidth=1;for(let x=0;x<=w;x+=step){g.strokeStyle=(x/step)%4===0?'rgba(47,108,255,.85)':'rgba(47,108,255,.35)';g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,h);g.stroke();}
 for(let y=0;y<=h;y+=step){g.strokeStyle=(y/step)%4===0?'rgba(47,108,255,.85)':'rgba(47,108,255,.35)';g.beginPath();g.moveTo(0,y+.5);g.lineTo(w,y+.5);g.stroke();}
 g.strokeStyle=RED;g.lineWidth=3;g.strokeRect(1.5,1.5,w-3,h-3);g.strokeStyle=GREEN;g.lineWidth=2;g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.moveTo(0,h/2);g.lineTo(w,h/2);g.stroke();
 g.beginPath();g.arc(w/2,h/2,Math.min(w,h)*.42,0,Math.PI*2);g.strokeStyle=VIOLET;g.stroke();return c;}
export function drawSurfacePattern(c,index,name){const N=512;c.width=c.height=N;const g=c.getContext('2d'),col=[RED,BLUE,VIOLET,GREEN][index%4];g.fillStyle='#05060b';g.fillRect(0,0,N,N);
 g.strokeStyle='rgba(232,236,255,.28)';g.lineWidth=2;for(let i=1;i<8;i++){g.beginPath();g.moveTo(i*64,0);g.lineTo(i*64,N);g.moveTo(0,i*64);g.lineTo(N,i*64);g.stroke();}
 g.strokeStyle=col;g.lineWidth=10;g.strokeRect(5,5,N-10,N-10);g.lineWidth=4;g.strokeStyle=WHITE;g.beginPath();g.moveTo(N/2,N/2-70);g.lineTo(N/2,N/2+70);g.moveTo(N/2-70,N/2);g.lineTo(N/2+70,N/2);g.stroke();
 g.beginPath();g.arc(N/2,N/2,120,0,Math.PI*2);g.strokeStyle=col;g.lineWidth=5;g.stroke();g.beginPath();g.moveTo(0,0);g.lineTo(N,N);g.moveTo(N,0);g.lineTo(0,N);g.strokeStyle='rgba(232,236,255,.18)';g.lineWidth=2;g.stroke();
 g.font='900 64px system-ui,-apple-system,Arial,sans-serif';g.textAlign='center';g.textBaseline='middle';[[60,62],[N-60,62],[N-60,N-60],[60,N-60]].forEach(([x,y],i)=>{g.fillStyle=col;g.beginPath();g.arc(x,y,42,0,Math.PI*2);g.fill();g.fillStyle='#05060b';g.fillText(String(i+1),x,y+3);});
 g.fillStyle=WHITE;g.font='800 30px ui-monospace,Menlo,monospace';g.fillText(String(name||'SURFACE').toUpperCase().slice(0,16),N/2,N/2+170);g.fillStyle=col;g.font='900 96px system-ui,Arial,sans-serif';g.fillText(String(index+1),N/2,N/2-170);return c;}
