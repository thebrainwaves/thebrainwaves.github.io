import {EFFECTS,clamp} from './core.js';
// All shader math is original. Sort and smear are visual approximations.
const body=`
precision highp float;
VARYING vec2 vUV;
uniform sampler2D uFrame;
uniform sampler2D uHistory;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform vec3 uParam;
uniform float uTime;
uniform int uMode;
float hash(vec2 v){return fract(sin(dot(v,vec2(41.13,289.7)))*43758.5453);}
vec2 safe(vec2 v){return clamp(v,vec2(.001),vec2(.999));}
vec3 sampleAt(vec2 p){return TEX(uFrame,safe(p)).rgb;}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
 vec2 uv=(vUV-.5)*uCover+.5;
 vec3 c=sampleAt(uv);
 float a=uParam.x,b=uParam.y,d=uParam.z,t=uTime;
 if(uMode==1){
   vec2 shift=vec2(cos(b*6.28318),sin(b*6.28318))*a*.045;
   c=vec3(sampleAt(uv+shift).r,c.g,sampleAt(uv-shift).b);
 }else if(uMode==2){
   float cells=6.+b*60.;vec2 block=floor(uv*cells);float h=hash(block+floor(t*3.));
   vec2 off=vec2((h-.5)*d*.18,sin(h*25.+t)*d*.025);
   vec3 previous=TEX(uHistory,safe(uv+off)).rgb;
   c=mix(c,previous,a*.88*step(.25,h));
 }else if(uMode==3){
   vec3 winner=c;float best=lum(c);float span=a*.18;
   for(int i=0;i<8;i++){
     float f=float(i)/7.;vec3 candidate=sampleAt(uv+vec2(f*span,0.));
     float l=lum(candidate);if(l>best&&l>b){winner=candidate;best=l;}
   }
   c=mix(c,winner,d);
 }else if(uMode==4){
   float band=sin(uv.y*36.+t*2.4);float wobble=sin(uv.y*193.+t*9.)*.002+pow(max(0.,band),22.)*.045;
   vec2 p=uv+vec2(wobble*b,0.);c=sampleAt(p);c.r=sampleAt(p+vec2(b*.009,0.)).r;
   c*=1.-a*.33*(.5+.5*sin(gl_FragCoord.y*3.14159));
   c+=(hash(gl_FragCoord.xy+floor(t*30.))-.5)*d*.25;
 }else if(uMode==5){
   vec2 off=vec2(sin(uv.y*(8.+b*100.)+t*(.3+d*5.)),cos(uv.x*(8.+b*60.)-t*(.3+d*5.)))*a*.045;
   c=sampleAt(uv+off);
 }else if(uMode==6){
   float angle=(d-.5)*.09;mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
   vec2 h=rot*(uv-.5)*(1.-b*.06)+.5;
   c=mix(c,TEX(uHistory,safe(h)).rgb,a*.94);
 }else if(uMode==7){
   float grid=700./(1.+b*50.);vec2 pixel=(floor(uv*grid)+.5)/grid;
   float steps=2.+floor(a*30.);c=floor(sampleAt(pixel)*steps+.5)/steps;
 }else if(uMode==8){
   float cells=4.+b*40.;vec2 tile=floor(uv*cells);float parity=mod(tile.x+tile.y,2.)*2.-1.;
   float pulse=sin(t*(.4+d*4.)+tile.x*.7+tile.y*.4);
   vec2 p=uv+vec2(parity,pulse)*a*.06*vec2(pulse,1.);
   c=sampleAt(p);float edge=step(.96,fract(uv.x*cells));c=mix(c,c.brg,edge*a);
 }else if(uMode==9){
   float bands=2.+floor(b*16.);float lane=floor(uv.y*bands);float phase=sin(t*.6+lane*1.7+d*6.28);
   float x=abs(fract((uv.x-.5)*(1.+a*3.)+.5+phase*a*.18)*2.-1.);
   c=sampleAt(vec2(mix(uv.x,x,a),uv.y));c=mix(c,c.gbr,a*.15*step(0.,phase));
 }
 COLOR=vec4(clamp(c,0.,1.),1.);
}`;
export class Renderer{
 constructor(canvas,{forceWebGL1=false}={}){
  this.canvas=canvas;
  const opts={alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'};
  this.gl=(!forceWebGL1&&canvas.getContext('webgl2',opts))||canvas.getContext('webgl',opts);
  if(!this.gl)throw new Error('WebGL is unavailable. Enable graphics acceleration or try another browser.');
  this.version=typeof WebGL2RenderingContext!=='undefined'&&this.gl instanceof WebGL2RenderingContext?2:1;
  const gl=this.gl,v2=this.version===2;
  const vertex=(v2?'#version 300 es\n':'')+`${v2?'in':'attribute'} vec2 aPosition; ${v2?'out':'varying'} vec2 vUV; void main(){vUV=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
  const fragment=(v2?'#version 300 es\n#define VARYING in\n#define TEX texture\n#define COLOR fragColor\nout highp vec4 fragColor;\n':'#define VARYING varying\n#define TEX texture2D\n#define COLOR gl_FragColor\n')+body;
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('GPU shader: '+gl.getShaderInfoLog(shader));return shader;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
  this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('GPU link: '+gl.getProgramInfoLog(this.program));
  gl.useProgram(this.program);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(this.program,'aPosition');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  this.u=Object.fromEntries(['Frame','History','Resolution','Cover','Param','Time','Mode'].map(n=>[n,gl.getUniformLocation(this.program,'u'+n)]));
  gl.uniform1i(this.u.Frame,0);gl.uniform1i(this.u.History,1);
  this.source=this.texture();this.targets=[];this.resize(540,960);
 }
 texture(){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 resize(width,height){
  const gl=this.gl;this.canvas.width=width;this.canvas.height=height;
  for(const t of this.targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}
  this.targets=Array.from({length:3},()=>{const texture=this.texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('GPU frame allocation failed. Try lower quality.');gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);return {texture,fbo};});
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.fresh=true;
 }
 clearHistory(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[2].fbo);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.fresh=true;}
 draw(texture,target,mode,values,time,cover=[1,1]){
  const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,target?.fbo||null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mode?this.targets[2].texture:texture);
  gl.uniform1i(this.u.Mode,mode);gl.uniform3f(this.u.Param,values[0]||0,values[1]||0,values[2]||0);gl.uniform2f(this.u.Resolution,this.canvas.width,this.canvas.height);gl.uniform2f(this.u.Cover,cover[0],cover[1]);gl.uniform1f(this.u.Time,time);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
 }
 render(source,stack,time,compare=false,{audio=0,animation=0}={}){
  const gl=this.gl;if(gl.isContextLost())return;
  const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  const ratio=(this.canvas.width/this.canvas.height)/(sw/sh),cover=ratio<1?[ratio,1]:[1,1/ratio];
  this.draw(this.source,this.targets[0],0,[],time,cover);
  if(this.fresh){this.draw(this.targets[0].texture,this.targets[2],0,[],time);this.fresh=false;}
  let current=0;
  if(!compare)for(const effect of stack){if(!effect.enabled)continue;const def=EFFECTS.find(e=>e.id===effect.id);if(!def)continue;
   const values=[...effect.values];values[0]=clamp(values[0]+animation*.13);
   const target=effect.reactiveParam||0;if(effect.reactive)values[target]=clamp(values[target]+audio*.55);
   const next=1-current;this.draw(this.targets[current].texture,this.targets[next],def.mode,values,time);current=next;
  }
  this.draw(this.targets[current].texture,null,0,[],time);
  this.draw(this.targets[current].texture,this.targets[2],0,[],time);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 pixels(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,null);const out=new Uint8Array(this.canvas.width*this.canvas.height*4);gl.readPixels(0,0,this.canvas.width,this.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
 destroy(){const gl=this.gl;for(const t of this.targets){gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.fbo);}gl.deleteTexture(this.source);gl.deleteBuffer(this.buffer);gl.deleteProgram(this.program);}
}
