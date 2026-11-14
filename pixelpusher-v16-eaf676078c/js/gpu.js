import {EFFECTS,clamp} from './core.js';
import {body} from './shaders.js';
export const MAX_MODE=22;
const IDENTITY=[1,1],EMPTY=[],DEFINITIONS=new Map(EFFECTS.map(e=>[e.id,e]));
// 1.7.2: shader time wraps so long sessions keep full float precision on phone GPUs (hash/sin with huge arguments
// went constant on some GPUs and froze Datamosh after a while). Values that are not finite numbers never reach the GPU.
export const TIME_WRAP=600;
const fin=(v,d=0)=>Number.isFinite(v)?v:d;
// Option (list) params are discrete: keys/LFOs between two options snap to the nearest one instead of a half-way mode.
const DISCRETE=new Map(EFFECTS.map(e=>[e.id,e.params.map((p,i)=>p.options?[i,p.max||p.options.length-1]:null).filter(Boolean)]));
// Uniform values for one effect pass: finite, 0..1, options snapped. Shared by the renderer and the unit tests.
export function passValues(id,src,out=new Float32Array(6)){for(let i=0;i<6;i++)out[i]=clamp(fin(src?.[i]));for(const [i,n] of DISCRETE.get(id)||EMPTY)out[i]=Math.round(out[i]*n)/n;return out;}
export const passIntensity=v=>clamp(fin(v,1));
export class Renderer{
 constructor(canvas,{forceWebGL1=false}={}){
  this.canvas=canvas;
  const opts={alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'};
  this.gl=(!forceWebGL1&&canvas.getContext('webgl2',opts))||canvas.getContext('webgl',opts);
  if(!this.gl)throw new Error('WebGL is unavailable. Enable graphics acceleration or try another browser.');
  this.version=typeof WebGL2RenderingContext!=='undefined'&&this.gl instanceof WebGL2RenderingContext?2:1;
  const gl=this.gl,v2=this.version===2;
  const vertex=(v2?'#version 300 es\n':'')+`${v2?'in':'attribute'} vec2 aPosition; ${v2?'out':'varying'} vec2 vUV; void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
  const prefix=v2?'#version 300 es\n#define VARYING in\n#define TEX texture\n#define COLOR fragColor\nout highp vec4 fragColor;\n':'#define VARYING varying\n#define TEX texture2D\n#define COLOR gl_FragColor\n';
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('GPU shader: '+gl.getShaderInfoLog(shader));return shader;};
  const vs=compile(gl.VERTEX_SHADER,vertex);this.programs=new Map();
  // Compile constant modes before playback. Dead branches and unused samplers disappear
  // on mobile drivers; no shader compile is triggered by enabling a layer mid-take.
  for(let mode=0;mode<=MAX_MODE;mode++){
   const fs=compile(gl.FRAGMENT_SHADER,prefix+body.replace('uniform int uMode;',`const int uMode=${mode};`)),program=gl.createProgram();
   gl.attachShader(program,vs);gl.attachShader(program,fs);gl.bindAttribLocation(program,0,'aPosition');gl.linkProgram(program);gl.deleteShader(fs);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('GPU link: '+gl.getProgramInfoLog(program));
   gl.useProgram(program);
   const u=Object.fromEntries(['Frame','Ink','InkMix','History','Previous','Ring0','Ring1','Ring2','Ring3','Resolution','Cover','Param','Extra','Intensity','Beat','Phase','Time','Mode'].map(n=>[n,gl.getUniformLocation(program,'u'+n)]));
   gl.uniform1i(u.Frame,0);gl.uniform1i(u.Ink,7);gl.uniform1i(u.History,1);gl.uniform1i(u.Previous,2);for(let i=0;i<4;i++)gl.uniform1i(u['Ring'+i],3+i);
   this.programs.set(mode,{program,u});
  }
  gl.deleteShader(vs);this.program=this.programs.get(0).program;this.u=this.programs.get(0).u;gl.useProgram(this.program);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.values=new Float32Array(6);this.cover=new Float32Array(2);this.source=this.texture();this.targets=[];this.ring=[];this.ringIndex=0;this.lastHistory=-1;this.freeze=false;this.stutterUntil=0;this.resize(540,960);
 }
 texture(){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 resize(width,height){
  const gl=this.gl;this.canvas.width=width;this.canvas.height=height;
  for(const t of [...this.targets,...this.ring]){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
  const allocate=(w,h)=>{const texture=this.texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('GPU frame allocation failed. Try lower quality.');gl.viewport(0,0,w,h);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);return {texture,fbo,width:w,height:h};};
  this.targets=Array.from({length:3},()=>allocate(width,height));
  const scale=Math.min(1,192/Math.min(width,height));
  this.ring=Array.from({length:4},()=>allocate(Math.round(width*scale),Math.round(height*scale)));
  this.historyBytes=this.ring[0].width*this.ring[0].height*4*4;
  this.ringIndex=0;this.lastHistory=-1;this.lastOutput=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.feedbackFresh=true;this.ringFresh=true;
 }
 clearHistory(){const gl=this.gl;for(const t of [this.targets[2],...this.ring]){gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.feedbackFresh=true;this.ringFresh=true;this.lastHistory=-1;}
 draw(texture,target,mode,values,time,cover=IDENTITY,intensity=1,beat=0,phase=0,inkMix=0,mask=null){
  const gl=this.gl,compiled=this.programs.get(mode);if(this.program!==compiled.program){this.program=compiled.program;this.u=compiled.u;gl.useProgram(this.program);}gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.width||this.canvas.width,target?.height||this.canvas.height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mode?this.targets[2].texture:texture);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,mode?this.ring[(this.ringIndex+2)%4].texture:texture);
  for(let i=0;i<4;i++){gl.activeTexture(gl.TEXTURE3+i);gl.bindTexture(gl.TEXTURE_2D,mode?this.ring[(this.ringIndex+3-i+4)%4].texture:texture);}
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,mask||(inkMix?this.inkTexture:texture));gl.uniform1f(this.u.InkMix,inkMix);
  gl.uniform1i(this.u.Mode,mode);gl.uniform3f(this.u.Param,values[0]||0,values[1]||0,values[2]||0);gl.uniform3f(this.u.Extra,values[3]||0,values[4]||0,values[5]||0);gl.uniform1f(this.u.Intensity,clamp(fin(intensity,1)));gl.uniform1f(this.u.Beat,fin(beat));gl.uniform1f(this.u.Phase,fin(phase));
  gl.uniform2f(this.u.Resolution,this.canvas.width,this.canvas.height);gl.uniform2f(this.u.Cover,cover[0],cover[1]);gl.uniform1f(this.u.Time,fin(time)%TIME_WRAP);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }
 render(source,stack,time,compare=false,{audio=0,animation=0,beat=0,phase=0,ink=null,inkOpacity=1,fxMasks=EMPTY}={}){
  const gl=this.gl;if(gl.isContextLost())return;if((this.freeze||performance.now()<this.stutterUntil)&&this.lastOutput){gl.useProgram(this.program);this.draw(this.lastOutput,null,0,EMPTY,time);return;}
  const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  const ratio=(this.canvas.width/this.canvas.height)/(sw/sh),cover=this.cover;cover[0]=ratio<1?ratio:1;cover[1]=ratio<1?1:1/ratio;
  this.draw(this.source,this.targets[0],0,EMPTY,time,cover);
  let needsFeedback=false,needsRing=false,hold=false;if(!compare)for(const e of stack){if(!e.enabled||!(e.intensity>0))continue;if(e.id==='smear'||e.id==='trails'||e.id==='mosh')needsFeedback=true;if(e.id==='smear'||e.id==='slit'||e.id==='beat'||e.id==='mosh')needsRing=true;if(e.hold)hold=true;}if(!compare)for(const m of fxMasks){if(m.id==='smear'||m.id==='trails'||m.id==='mosh')needsFeedback=true;if(m.id==='smear'||m.id==='slit'||m.id==='beat'||m.id==='mosh')needsRing=true;}
  if(needsFeedback&&this.feedbackFresh){this.draw(this.targets[0].texture,this.targets[2],0,EMPTY,time);this.feedbackFresh=false;}
  if(needsRing){if(this.ringFresh){for(const frame of this.ring)this.draw(this.targets[0].texture,frame,0,EMPTY,time);this.ringFresh=false;}
   if(time-this.lastHistory>=1/12||time<this.lastHistory){this.draw(this.targets[0].texture,this.ring[this.ringIndex],0,EMPTY,time);this.ringIndex=(this.ringIndex+1)%4;this.lastHistory=time;}
  }else this.ringFresh=true;

  let current=0;
  if(!compare)for(const effect of stack){if(!effect.enabled||!(fin(effect.intensity,1)>0))continue;const def=DEFINITIONS.get(effect.id);if(!def)continue;
   const values=passValues(effect.id,effect.values,this.values);if(effect.id==='mirror')values[1]=clamp(values[1]+animation*.13);else values[0]=clamp(values[0]+animation*.13);
   const target=effect.reactiveParam||0;if(effect.reactive)values[target]=clamp(values[target]+audio*.55);
   const next=1-current;this.draw(this.targets[current].texture,this.targets[next],def.mode,values,time,IDENTITY,fin(effect.intensity,1),beat,phase);current=next;this.lastEffect=effect.id;
  }
  // FX Brush passes: each painted effect is applied only where its mask has alpha.
  if(!compare)for(const m of fxMasks){const def=DEFINITIONS.get(m.id);if(!def||!m.canvas)continue;if(!this.masks)this.masks=new Map();let t=this.masks.get(m.id);
   if(!t){t={texture:this.texture(),revision:-1};this.masks.set(m.id,t);}
   if(t.revision!==m.revision){gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,m.canvas);t.revision=m.revision;}
   const values=this.values;for(let i=0;i<6;i++)values[i]=clamp(fin(m.values[i]));const next=1-current;this.draw(this.targets[current].texture,this.targets[next],def.mode,values,time,IDENTITY,1,beat,phase,1,t.texture);current=next;}
  if(needsFeedback){if(!hold)this.draw(this.targets[current].texture,this.targets[2],0,EMPTY,time);}else this.feedbackFresh=true;
  if(ink&&!compare&&inkOpacity>0){
   if(this.inkSource!==ink||this.inkRevision!==ink.inkRevision||ink.inkRevision===undefined){gl.activeTexture(gl.TEXTURE7);if(!this.inkTexture)this.inkTexture=this.texture();gl.bindTexture(gl.TEXTURE_2D,this.inkTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,ink);this.inkSource=ink;this.inkRevision=ink.inkRevision;}
   const next=1-current;this.draw(this.targets[current].texture,this.targets[next],0,EMPTY,time,IDENTITY,1,0,0,clamp(inkOpacity));current=next;
  }
  this.lastOutput=this.targets[current].texture;this.lastTarget=this.targets[current];this.draw(this.lastOutput,null,0,EMPTY,time);

  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 // Watchdog probe (1.7.2): the source pass and the final pass are downsampled to 4×4 and read back. On WebGL2 the read goes into a
 // pixel buffer behind a fence and is collected on a later call, so the CPU never waits for the GPU (no frame stall).
 // Returns {input,output} brightness (sum of RGB over 5 average pixels, 0..3825) or null while nothing is ready yet.
 probe(){const gl=this.gl;if(gl.isContextLost()||!this.lastTarget)return null;
  if(!this.pt){const mk=()=>{const texture=this.texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,4,4,0,gl.RGBA,gl.UNSIGNED_BYTE,null);const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);return {texture,fbo,width:4,height:4};};this.pt=[mk(),mk()];this.probeData=new Uint8Array(128);}
  const sums=d=>{let a=0,b=0;for(let i=0;i<64;i+=4){a+=d[i]+d[i+1]+d[i+2];b+=d[64+i]+d[65+i]+d[66+i];}return {input:a*5/16,output:b*5/16};};let result=null;
  if(this.version===2){if(this.pending){if(gl.clientWaitSync(this.pending,0,0)===gl.TIMEOUT_EXPIRED)return null;gl.deleteSync(this.pending);this.pending=null;gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,this.probeData);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);result=sums(this.probeData);}}
  this.draw(this.targets[0].texture,this.pt[0],0,EMPTY,0);this.draw(this.lastTarget.texture,this.pt[1],0,EMPTY,0);
  if(this.version===2){if(!this.pbo){this.pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.pbo);gl.bufferData(gl.PIXEL_PACK_BUFFER,128,gl.STREAM_READ);}else gl.bindBuffer(gl.PIXEL_PACK_BUFFER,this.pbo);
   for(let k=0;k<2;k++){gl.bindFramebuffer(gl.FRAMEBUFFER,this.pt[k].fbo);gl.readPixels(0,0,4,4,gl.RGBA,gl.UNSIGNED_BYTE,k*64);}gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);this.pending=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);}
  else{const d=this.probeData;for(let k=0;k<2;k++){gl.bindFramebuffer(gl.FRAMEBUFFER,this.pt[k].fbo);gl.readPixels(0,0,4,4,gl.RGBA,gl.UNSIGNED_BYTE,d.subarray(k*64,k*64+64));}result=sums(d);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);return result;}
 get probeEvery(){return this.version===2?2000:4000;}
 pixels(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);const out=new Uint8Array(this.canvas.width*this.canvas.height*4);gl.readPixels(0,0,this.canvas.width,this.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
 destroy(){const gl=this.gl;for(const t of [...this.targets,...this.ring]){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}gl.deleteTexture(this.source);if(this.inkTexture)gl.deleteTexture(this.inkTexture);if(this.masks)for(const t of this.masks.values())gl.deleteTexture(t.texture);gl.deleteBuffer(this.buffer);if(this.pt)for(const t of this.pt){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}if(this.pbo)gl.deleteBuffer(this.pbo);if(this.pending)gl.deleteSync(this.pending);for(const {program}of this.programs.values())gl.deleteProgram(program);this.programs.clear();}
}
