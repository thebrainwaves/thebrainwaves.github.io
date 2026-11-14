// Original Brainhertz Productions generative sources (clean-room GLSL ES 1.00).
// Shared params: speed, scale, complexity, palette, plus two source-specific params A and B.
export const PALETTES=[['Brainhertz',['#ff2b3d','#8c3dff','#2f6cff']],['Ultraviolet',['#5a1cff','#b04dff','#16084f']],['Ice',['#2f6cff','#00d5ff','#0a1946']],['Toxic',['#27e889','#0d5c34','#8c3dff']],['Infrared',['#ff2b3d','#ff7a1a','#52070f']],['Steel',['#aab3e6','#3d4577','#0b0e20']]];
export const COMMON=[['Speed',.35],['Scale',.29],['Complexity',.5]];
export const MAX_TEXT=24;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a));
const S=(id,name,a,b,body)=>({id,name,a,b,body});
export const SOURCES=[
S('tunnel','Neon tunnel',['Twist',.3],['Glow',.4],`float r=length(p),a=atan(p.y,p.x);float z=.35/max(r,.02)+t*.8;float rings=6.+floor(uCx*18.);float w=a/TAU*rings+z*uA*2.;
float g=smoothstep(.42,.5,abs(fract(z*1.5)-.5))+smoothstep(.40,.5,abs(fract(w)-.5))*(.4+uCx);
vec3 c=pal(z*.1+a/TAU)*g*(1.+uB*2.)*smoothstep(0.,.35,r);c+=pal(z*.05)*.05/max(r,.05)*uB;return c*(1.+uAudio.y*.8);`),
S('plasma','Plasma',['Warp',.35],['Contrast',.4],`float v=sin(p.x*3.+t)+sin(p.y*2.7-t*1.3)+sin((p.x+p.y)*2.+t*.7)+sin(length(p*(2.+uCx*6.))-t*1.7);
v+=uA*2.*fbm(p*2.+t*.2);float k=v*.2+.5;k=mix(k,smoothstep(.3,.7,k),uB);return pal(k+t*.05)*(.3+.9*k)*(1.+uAudio.x*.5);`),
S('particles','Particles',['Size',.3],['Drift',.3],`vec3 c=vec3(0.);for(int l=0;l<4;l++){float fl=float(l);float sc=4.+fl*3.+uCx*10.;vec2 q=p*sc+vec2(0.,t*(.3+fl*.15)*(1.+uB*3.));
vec2 id=floor(q),f=fract(q)-.5;vec2 o=(h22(id+fl*13.)-.5)*.7+.15*vec2(sin(t+id.y*3.),cos(t*1.3+id.x*2.));float d=length(f-o);float s=(.03+uA*.1)*(1.+uAudio.x*2.);
c+=pal(h21(id)+fl*.2)*smoothstep(s,0.,d)*(1.-fl*.18)+pal(h21(id))*.01/(d+.02)*(.4+uB);}return c;`),
S('fractal','Fractal',['Morph',.4],['Colour shift',0],`vec2 z=p*.9;vec2 cc=vec2(-.75+.2*cos(t*.3),.12+.15*sin(t*.23+uA*3.));float maxIt=24.+uCx*40.;float it=0.;float esc=0.;
for(int i=0;i<64;i++){if(float(i)>=maxIt)break;z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+cc;if(dot(z,z)>16.){esc=1.;break;}it+=1.;}
float k=it/maxIt;return esc*pal(k*2.+uB+t*.02)*sqrt(k)*1.4;`),
S('terrain','Wire terrain',['Mountains',.5],['Sun glow',.5],`vec2 q=uv-vec2(.5,.48);vec3 c=vec3(0.);if(q.y<0.){float z=1./(-q.y+.002);float x=q.x*z;float zz=z+t*3.;
float hgt=fbm(vec2(x*.25,zz*.25))*uA;vec2 gq=vec2(x,zz-hgt*6.)*(.4+uCx*.8);vec2 g=abs(fract(gq)-.5);float line=smoothstep(.06,0.,min(g.x,g.y)*(1.+z*.02));
c=pal(.15+hgt*.5)*line*exp(-z*.035)*1.6;}else{float r=length(q-vec2(0.,.14));float sun=smoothstep(.2,.19,r)*(q.y<.14?step(.45,fract(q.y*40.-t*.5)):1.);
c=mix(uC0,uC1,clamp(q.y*3.,0.,1.))*sun+pal(.6)*(.12+uB*.3)*exp(-r*4.)+vec3(.01,.0,.03);}return c;`),
S('sines','Sine lines',['Frequency',.35],['Amplitude',.4],`vec3 c=vec3(0.);float n=4.+floor(uCx*20.);for(int i=0;i<24;i++){float fi=float(i);if(fi>=n)break;float y=(fi/n-.5)*1.8+.9/n;
float w=sin(p.x*(2.+uA*8.)+t*(1.+fi*.1)+fi)*(.05+uAudio.y*.3)*(1.+uB*4.);float d=abs(p.y-y-w);c+=pal(fi/n+t*.05)*(.004/(d+.004));}return c*.7;`),
S('lissajous','Lissajous',['Ratio X',.2],['Ratio Y',.35],`float a=1.+floor(uA*6.),b=2.+floor(uB*6.);float m=1e3;vec3 col=vec3(0.);for(int i=0;i<160;i++){float s=float(i)/160.*TAU;
vec2 q=vec2(sin(a*s+t),sin(b*s+t*.7))*.8;float d=length(p-q);if(d<m){m=d;col=pal(float(i)/160.+t*.1);}}float w=.006+uCx*.02;return col*(w/(m+w))*1.4+col*smoothstep(w,0.,m);`),
S('voronoi','Voronoi',['Edge',.3],['Cell motion',.4],`vec2 q=p*(2.+uCx*6.);vec2 i=floor(q),f=fract(q);float d1=8.,d2=8.;vec2 bid=vec2(0.);
for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=h22(i+g);o=.5+.5*sin(t*(.4+uB*2.)+TAU*o);float d=length(g+o-f);if(d<d1){d2=d1;d1=d;bid=i+g;}else if(d<d2)d2=d;}
float e=smoothstep(0.,.02+uA*.15,d2-d1);return pal(h21(bid)+t*.03)*(.2+.6*(1.-d1))*e+pal(.5)*(1.-e)*1.2;`),
S('metaballs','Metaballs',['Blob size',.4],['Soft edge',.2],`float v=0.;float n=3.+floor(uCx*7.);for(int i=0;i<10;i++){float fi=float(i);if(fi>=n)break;
vec2 c=vec2(sin(t*(.5+fi*.13)+fi*2.),cos(t*(.4+fi*.17)+fi*1.3))*(.5+.3*sin(fi));float r=.16+uA*.22+uAudio.y*.2;v+=r*r/max(dot(p-c,p-c),1e-4);}
float edge=smoothstep(1.,1.05+uB*.4,v);return pal(v*.12+t*.05)*edge+pal(.8)*smoothstep(.6,1.,v)*(1.-edge)*.6;`),
S('starfield','Warp starfield',['Warp speed',.4],['Streak',.4],`float a=atan(p.y,p.x),r=length(p);vec3 c=vec3(0.);for(int l=0;l<3;l++){float fl=float(l);float rays=60.+fl*50.+uCx*120.;
float id=floor(a/TAU*rays);float z=fract(h11(id+fl*7.)+t*(1.+uA*5.)*(1.+fl*.5)*.12);float rr=z*z*1.7;float len=.02+uB*.3*z;float ang=abs(fract(a/TAU*rays)-.5);
c+=pal(h11(id)+fl*.3)*smoothstep(len,0.,abs(r-rr))*smoothstep(.35,0.,ang)*z*1.6;}return c;`),
S('kaleido','Kaleidoscope',['Segments',.4],['Ripple',.4],`float seg=3.+floor(uA*9.);float a=atan(p.y,p.x),r=length(p);a=mod(a,TAU/seg);a=abs(a-PI/seg);vec2 q=vec2(cos(a),sin(a))*r;q=rot(t*.1)*q;
float v=fbm(q*(2.+uCx*4.)+t*.3)+.3*sin(r*10.*(.5+uB)-t*2.);return pal(v+r*.3+t*.04)*(.25+v);`),
S('flow','Flow field',['Curl',.4],['Streaks',.5],`vec2 q=p*(1.5+uCx*3.);for(int i=0;i<4;i++){float n=fbm(q+t*.15);q+=vec2(cos(n*TAU*(1.+uA)),sin(n*TAU*(1.+uA)))*.15;}
float v=fbm(q*2.);float s=sin((q.x+q.y)*20.*(.3+uB))*.5+.5;return pal(v+t*.03)*(v*.8+s*.5*v)*1.2;`),
S('text','Glitch text',['Glitch',.25],['RGB split',.3],`vec2 q=uv;float rows=8.+uCx*40.;float row=floor(q.y*rows);float g=step(1.-uA*.7,h21(vec2(row,floor(t*8.))));q.x+=(h21(vec2(row,floor(t*16.)))-.5)*.3*g;
q=(q-.5)*vec2(1.,uRes.y/uRes.x*2.)/uScale+.5;float sh=.003+uB*.018;float tr=texture2D(uText,q+vec2(sh,0.)).r,tg=texture2D(uText,q).r,tb=texture2D(uText,q-vec2(sh,0.)).r;
vec3 c=uC0*tr+uC2*tb+pal(t*.1+q.y)*tg*.5;c*=.8+.2*sin(gl_FragCoord.y*1.6);return c+pal(.5)*.03;`),
S('opart','Op-art',['Drift',.4],['Petals',.3],`vec2 o=vec2(sin(t*.3),cos(t*.27))*.3*(.2+uA);float r1=length(p-o),r2=length(p+o);float f=20.+uCx*60.;
float v=mod(step(.5,fract(r1*f*.25))+step(.5,fract(r2*f*.25)),2.);float tw=sin(atan(p.y,p.x)*(4.+floor(uB*12.))+t)*.5+.5;return mix(vec3(.02),pal(r1*.3+t*.05),v*(.55+.45*tw));`),
S('rings','Pulse rings',['Rate',.3],['Width',.3],`float r=length(p);vec3 c=vec3(0.);float n=3.+floor(uCx*8.);for(int i=0;i<12;i++){float fi=float(i);if(fi>=n)break;
float rr=fract(t*.25*(1.+uA*2.)+fi/n)*1.6;float w=.01+uB*.05+uBeat*.03;c+=pal(fi/n+t*.05)*smoothstep(w,0.,abs(r-rr))*(1.-rr/1.6)*1.6;}return c+pal(.1)*uBeat*.25*smoothstep(.6,0.,r);`),
S('bars','Scanline bars',['Scroll',.6],['Bar gap',.2],`float n=4.+floor(uCx*28.);float y=uv.y+t*.1*(uA*2.-1.);float id=floor(y*n);float f=fract(y*n);vec3 c=pal(id/n*.7+h11(id)*.3);
c*=smoothstep(0.,.05+uB*.3,f)*smoothstep(1.,.95-uB*.3,f);c*=.75+.25*sin(gl_FragCoord.y*2.);c+=(h21(gl_FragCoord.xy+fract(t))-.5)*.08;return c;`),
S('liquid','Liquid gradient',['Viscosity',.4],['Hue drift',0],`vec2 q=p;q+=.3*vec2(sin(q.y*2.+t),cos(q.x*2.-t*.8))*(1.+uA);q+=.2*vec2(sin(q.y*3.7-t*.6),cos(q.x*3.1+t*.5))*uCx*2.;
float v=.5+.5*sin(q.x*1.3+q.y*1.7+t*.4);return pal(v*.8+t*.02+uB)*(.45+.6*v);`),
S('testcard','Test pattern',['Sweep speed',.3],['Bar colour',0],`vec3 c=vec3(.02);vec2 g=abs(fract(p*(2.+uCx*6.))-.5);c+=pal(.6)*.3*smoothstep(.03,0.,min(g.x,g.y));float r=length(p);
c=mix(c,pal(floor((p.x+1.)*4.)/8.+uB),step(r,.6)*step(abs(p.y),.18));c+=vec3(.8)*smoothstep(.012,0.,abs(r-.6));
float sw=fract(atan(p.y,p.x)/TAU-t*.15*(.2+uA));c+=pal(0.)*smoothstep(.04,0.,sw)*step(r,.6)*.8;c+=vec3(.6)*smoothstep(.006,0.,abs(p.x))*step(.18,abs(p.y))*step(r,.6);return c;`),
S('solid','3D torus / cube',['Torus → cube',0],['Glow',.4],`vec3 ro=vec3(0.,0.,3.),rd=normalize(vec3(p*.6,-1.5));float tt=0.;float hit=0.;vec3 q=ro;
for(int i=0;i<64;i++){q=ro+rd*tt;q.xz=rot(t*.7)*q.xz;q.xy=rot(t*.5)*q.xy;vec2 tq=vec2(length(q.xz)-.8,q.y);float dt=length(tq)-.3;vec3 bq=abs(q)-vec3(.65);
float db=length(max(bq,0.))+min(max(bq.x,max(bq.y,bq.z)),0.);float d=mix(dt,db,uA);if(d<.002){hit=1.;break;}tt+=d;if(tt>8.)break;}
float stripes=.6+.4*step(.5,fract((q.x+q.y+q.z)*(2.+uCx*12.)));vec3 c=hit*pal(length(q)*.4+t*.05)*stripes*(1.4-tt*.25);return c+pal(.6)*(1.-hit)*uB*.15/(.2+length(p));`),
S('audiobars','Audio bars',['React only',0],['Gain',.5],`float n=8.+floor(uCx*40.);float id=floor(uv.x*n);float f=fract(uv.x*n);float band=id/n;float lv=band<.33?uAudio.y:band<.66?uAudio.z:uAudio.w;
float idle=.25+.2*sin(t*2.+id*.7)+.15*sin(t*3.3+id*1.9);float hgt=clamp(max(lv*(.6+.6*h11(id+floor(t*12.))),idle*(1.-uA))*(.6+uB),0.,1.);
float bar=step(uv.y,hgt)*smoothstep(0.,.15,f)*smoothstep(1.,.85,f);float seg=step(.25,fract(uv.y*40.));return pal(band*.8+uv.y*.3)*bar*seg+pal(band)*.04;`),
S('hexgrid','Hex lattice',['Pulse',.4],['Line weight',.3],`vec2 q=p*(2.+uCx*8.);vec2 r=vec2(1.,1.732);vec2 h=r*.5;vec2 a=mod(q,r)-h,b=mod(q-h,r)-h;vec2 gv=dot(a,a)<dot(b,b)?a:b;vec2 id=q-gv;
float e=.5-max(abs(gv.x),dot(abs(gv),normalize(r)));float pulse=.5+.5*sin(t*2.*(.3+uA)-length(id)*.6);float line=smoothstep(.02+uB*.08,0.,e);return pal(h21(id)*.3+length(id)*.05+t*.04)*(line*1.2+pulse*.25*smoothstep(.0,.3,e));`),
S('ribbons','Light ribbons',['Twist',.4],['Width',.3],`vec3 c=vec3(0.);float n=3.+floor(uCx*6.);for(int i=0;i<9;i++){float fi=float(i);if(fi>=n)break;float y=sin(p.x*(1.+uA*3.)+t*(.6+fi*.15)+fi*1.7)*.6*cos(p.x*.7-t*.3+fi);
float w=.02+uB*.12;float d=abs(p.y-y);c+=pal(fi/n+p.x*.1+t*.04)*(smoothstep(w,0.,d)*.8+w*.06/(d+.01));}return c;`)
];
export const SOURCE_BY_ID=new Map(SOURCES.map(s=>[s.id,s]));
export const genParams=src=>[...COMMON.map(([name,value])=>({name,value})),{name:'Palette',value:0,max:PALETTES.length-1,step:1,options:PALETTES.map(p=>p[0])},{name:src.a[0],value:src.a[1]},{name:src.b[0],value:src.b[1]}];
export const DEFAULT_GEN_TOUCH={x:4,y:5,x2:2,y2:0,pinch:1,twist:-2,spring:false};
export function defaultGen(id='tunnel'){const src=SOURCE_BY_ID.get(id)||SOURCES[0];return {id:src.id,intensity:1,values:genParams(src).map(p=>p.value),mods:[],touch:{...DEFAULT_GEN_TOUCH},text:'BRAINHERTZ'};}
export function normalizeGen(raw,normalizeMods){
 const src=SOURCE_BY_ID.get(raw?.id);if(!src)return null;const out=defaultGen(src.id);
 if(Array.isArray(raw.values))out.values=out.values.map((v,i)=>Number.isFinite(raw.values[i])?clamp(raw.values[i]):v);
 out.values[3]=Math.round(out.values[3]*(PALETTES.length-1))/(PALETTES.length-1);
 if(normalizeMods)out.mods=normalizeMods(raw.mods,6);
 for(const k of Object.keys(DEFAULT_GEN_TOUCH)){const n=raw.touch?.[k];if(k==='spring')out.touch.spring=n===true;else if(Number.isInteger(n)&&n>=-2&&n<6)out.touch[k]=n;}
 if(typeof raw.text==='string')out.text=cleanText(raw.text);return out;
}
export function cleanText(s){return String(s).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,MAX_TEXT)||' ';}
export const speedFactor=v=>clamp(v)*2.857;
export const scaleFactor=v=>.4+clamp(v)*2.1;
export const HEADER=`precision highp float;
varying vec2 vUV;
uniform vec2 uRes;uniform float uTime,uScale,uCx,uA,uB,uBeat;uniform vec4 uAudio;uniform vec3 uC0,uC1,uC2;uniform sampler2D uText;
#define PI 3.14159265
#define TAU 6.2831853
float h11(float n){return fract(sin(n*127.1)*43758.5453);}
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 h22(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec3 pal(float t){t=fract(t);return t<.3333?mix(uC0,uC1,t*3.):t<.6667?mix(uC1,uC2,(t-.3333)*3.):mix(uC2,uC0,(t-.6667)*3.);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
`;
export function fragmentFor(src){return HEADER+'vec3 gen(vec2 uv,vec2 p,float t){'+src.body+'}\nvoid main(){vec2 uv=vUV;vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.)*2./uScale;gl_FragColor=vec4(clamp(gen(uv,p,uTime),0.,1.),1.);}';}
export const hexToRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
