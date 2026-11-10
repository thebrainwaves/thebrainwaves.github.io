import {EFFECTS,clamp} from './core.js';
import {body} from './shaders.js';
const IDENTITY=[1,1],EMPTY=[],DEFINITIONS=new Map(EFFECTS.map(e=>[e.id,e]));
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
  for(let mode=0;mode<=18;mode++){
   const fs=compile(gl.FRAGMENT_SHADER,prefix+body.replace('uniform int uMode;',`const int uMode=${mode};`)),program=gl.createProgram();
   gl.attachShader(program,vs);gl.attachShader(program,fs);gl.bindAttribLocation(program,0,'aPosition');gl.linkProgram(program);gl.deleteShader(fs);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('GPU link: '+gl.getProgramInfoLog(program));
   gl.useProgram(program);
   const u=Object.fromEntries(['Frame','History','Previous','Ring0','Ring1','Ring2','Ring3','Resolution','Cover','Param','Extra','Intensity','Beat','Phase','Time','Mode'].map(n=>[n,gl.getUniformLocation(program,'u'+n)]));
   gl.uniform1i(u.Frame,0);gl.uniform1i(u.History,1);gl.uniform1i(u.Previous,2);for(let i=0;i<4;i++)gl.uniform1i(u['Ring'+i],3+i);
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
 draw(texture,target,mode,values,time,cover=IDENTITY,intensity=1,beat=0,phase=0){
  const gl=this.gl,compiled=this.programs.get(mode);if(this.program!==compiled.program){this.program=compiled.program;this.u=compiled.u;gl.useProgram(this.program);}gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,target?.width||this.canvas.width,target?.height||this.canvas.height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mode?this.targets[2].texture:texture);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,mode?this.ring[(this.ringIndex+2)%4].texture:texture);
  for(let i=0;i<4;i++){gl.activeTexture(gl.TEXTURE3+i);gl.bindTexture(gl.TEXTURE_2D,mode?this.ring[(this.ringIndex+3-i+4)%4].texture:texture);}
  gl.uniform1i(this.u.Mode,mode);gl.uniform3f(this.u.Param,values[0]||0,values[1]||0,values[2]||0);gl.uniform3f(this.u.Extra,values[3]||0,values[4]||0,values[5]||0);gl.uniform1f(this.u.Intensity,intensity);gl.uniform1f(this.u.Beat,beat);gl.uniform1f(this.u.Phase,phase);
  gl.uniform2f(this.u.Resolution,this.canvas.width,this.canvas.height);gl.uniform2f(this.u.Cover,cover[0],cover[1]);gl.uniform1f(this.u.Time,time);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }
 render(source,stack,time,compare=false,{audio=0,animation=0,beat=0,phase=0}={}){
  const gl=this.gl;if(gl.isContextLost())return;if((this.freeze||performance.now()<this.stutterUntil)&&this.lastOutput){gl.useProgram(this.program);this.draw(this.lastOutput,null,0,EMPTY,time);return;}
  const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  const ratio=(this.canvas.width/this.canvas.height)/(sw/sh),cover=this.cover;cover[0]=ratio<1?ratio:1;cover[1]=ratio<1?1:1/ratio;
  this.draw(this.source,this.targets[0],0,EMPTY,time,cover);
  let needsFeedback=false,needsRing=false,hold=false;if(!compare)for(const e of stack){if(!e.enabled||e.intensity===0)continue;if(e.id==='smear'||e.id==='trails')needsFeedback=true;if(e.id==='smear'||e.id==='slit'||e.id==='beat')needsRing=true;if(e.hold)hold=true;}
  if(needsFeedback&&this.feedbackFresh){this.draw(this.targets[0].texture,this.targets[2],0,EMPTY,time);this.feedbackFresh=false;}
  if(needsRing){if(this.ringFresh){for(const frame of this.ring)this.draw(this.targets[0].texture,frame,0,EMPTY,time);this.ringFresh=false;}
   if(time-this.lastHistory>=1/12||time<this.lastHistory){this.draw(this.targets[0].texture,this.ring[this.ringIndex],0,EMPTY,time);this.ringIndex=(this.ringIndex+1)%4;this.lastHistory=time;}
  }else this.ringFresh=true;

  let current=0;
  if(!compare)for(const effect of stack){if(!effect.enabled||effect.intensity===0)continue;const def=DEFINITIONS.get(effect.id);if(!def)continue;
   const values=this.values;for(let i=0;i<6;i++)values[i]=effect.values[i]||0;values[0]=clamp(values[0]+animation*.13);
   const target=effect.reactiveParam||0;if(effect.reactive)values[target]=clamp(values[target]+audio*.55);
   const next=1-current;this.draw(this.targets[current].texture,this.targets[next],def.mode,values,time,IDENTITY,effect.intensity??1,beat,phase);current=next;
  }
  this.lastOutput=this.targets[current].texture;this.draw(this.lastOutput,null,0,EMPTY,time);
  if(needsFeedback){if(!hold)this.draw(this.targets[current].texture,this.targets[2],0,EMPTY,time);}else this.feedbackFresh=true;

  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 pixels(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);const out=new Uint8Array(this.canvas.width*this.canvas.height*4);gl.readPixels(0,0,this.canvas.width,this.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
 destroy(){const gl=this.gl;for(const t of [...this.targets,...this.ring]){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}gl.deleteTexture(this.source);gl.deleteBuffer(this.buffer);for(const {program}of this.programs.values())gl.deleteProgram(program);this.programs.clear();}
}
