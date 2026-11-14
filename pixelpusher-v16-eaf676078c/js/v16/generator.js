// One small WebGL context renders the selected generative source (and grid thumbnails).
import {SOURCE_BY_ID,PALETTES,fragmentFor,hexToRgb,scaleFactor} from './gen-sources.js';
export class Generator{
 constructor(){
  this.canvas=document.createElement('canvas');this.canvas.width=720;this.canvas.height=1280;
  const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});if(!gl)throw new Error('WebGL unavailable for generative sources.');
  this.gl=gl;this.programs=new Map();this.failed=new Set();
  const vs=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vs,'attribute vec2 aP;varying vec2 vUV;void main(){vUV=aP*.5+.5;gl_Position=vec4(aP,0.,1.);}');gl.compileShader(vs);this.vs=vs;
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  this.text=document.createElement('canvas');this.text.width=1024;this.text.height=512;this.textValue=null;
  this.textTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.textTex);for(const [k,v]of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  this.setText('BRAINHERTZ');
 }
 program(id){
  if(this.programs.has(id))return this.programs.get(id);if(this.failed.has(id))return null;
  const gl=this.gl,src=SOURCE_BY_ID.get(id);if(!src)return null;const fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fs,fragmentFor(src));gl.compileShader(fs);
  if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS)){this.error=id+': '+gl.getShaderInfoLog(fs);this.failed.add(id);gl.deleteShader(fs);return null;}
  const p=gl.createProgram();gl.attachShader(p,this.vs);gl.attachShader(p,fs);gl.bindAttribLocation(p,0,'aP');gl.linkProgram(p);gl.deleteShader(fs);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){this.error=id+': '+gl.getProgramInfoLog(p);this.failed.add(id);return null;}
  const u={};for(const n of ['Res','Time','Scale','Cx','A','B','Beat','Audio','C0','C1','C2','Text'])u[n]=gl.getUniformLocation(p,'u'+n);
  const prog={p,u};this.programs.set(id,prog);return prog;
 }
 setText(value){if(value===this.textValue)return;this.textValue=value;const c=this.text.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,1024,512);c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';
  let size=220;c.font=`900 ${size}px system-ui,-apple-system,sans-serif`;while(size>40&&c.measureText(value).width>960){size-=10;c.font=`900 ${size}px system-ui,-apple-system,sans-serif`;}c.fillText(value,512,262);
  const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.textTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.text);}
 resize(w,h){if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
 // values: [speed, scale, complexity, palette, A, B]; region: optional [x,y,w,h] viewport (thumbnails)
 render(id,values,time,signals={},region=null,text=null){
  const prog=this.program(id);if(!prog)return false;const gl=this.gl,u=prog.u;if(text!==null)this.setText(text);
  const [x,y,w,h]=region||[0,0,this.canvas.width,this.canvas.height];gl.viewport(x,y,w,h);gl.useProgram(prog.p);
  const pal=PALETTES[Math.round((values[3]||0)*(PALETTES.length-1))]||PALETTES[0],[c0,c1,c2]=pal[1].map(hexToRgb);
  gl.uniform2f(u.Res,w,h);gl.uniform1f(u.Time,time);gl.uniform1f(u.Scale,scaleFactor(values[1]));gl.uniform1f(u.Cx,values[2]);gl.uniform1f(u.A,values[4]);gl.uniform1f(u.B,values[5]);
  gl.uniform1f(u.Beat,signals.beat||0);gl.uniform4f(u.Audio,signals.level||0,signals.low||0,signals.mid||0,signals.high||0);gl.uniform3fv(u.C0,c0);gl.uniform3fv(u.C1,c1);gl.uniform3fv(u.C2,c2);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textTex);gl.uniform1i(u.Text,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true;
 }
}
