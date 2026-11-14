// Original clean-room GLSL. Visual flow/sort are deliberately bounded approximations.
export const body=`
precision highp float;
VARYING vec2 vUV;
uniform sampler2D uFrame;
uniform sampler2D uInk;
uniform float uInkMix;
uniform sampler2D uHistory;
uniform sampler2D uPrevious;
uniform sampler2D uRing0;
uniform sampler2D uRing1;
uniform sampler2D uRing2;
uniform sampler2D uRing3;
uniform vec2 uResolution;
uniform vec2 uCover;
uniform vec3 uParam;
uniform vec3 uExtra;
uniform float uIntensity;
uniform float uBeat;
uniform float uPhase;
uniform float uTime;
uniform int uMode;
float hash(vec2 v){return fract(sin(dot(v,vec2(41.13,289.7)))*43758.5453);}
vec2 safe(vec2 v){return clamp(v,vec2(.001),vec2(.999));}
vec3 sampleAt(vec2 p){return TEX(uFrame,safe(p)).rgb;}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 memoryAt(vec2 p,float age){
 p=safe(p);if(age<.5)return TEX(uRing0,p).rgb;
 if(age<1.5)return TEX(uRing1,p).rgb;
 if(age<2.5)return TEX(uRing2,p).rgb;return TEX(uRing3,p).rgb;
}
vec3 palette(float v){
 if(v<.25)return vec3(.08,.24,1.);
 if(v<.5)return vec3(.32,.1,.88);
 if(v<.75)return vec3(1.,.045,.07);
 return vec3(.08,.9,.32);
}
void main(){
 vec2 uv=(vUV-.5)*uCover+.5;
 vec3 original=sampleAt(uv),c=original;
 float a=uParam.x,b=uParam.y,d=uParam.z,t=uTime;
 if(uMode==1){
   vec2 shift=vec2(cos(b*6.28318),sin(b*6.28318))*a*.045;
   c=vec3(sampleAt(uv+shift).r,c.g,sampleAt(uv-shift).b);
 }else if(uMode==2){
   // Block-centred brightness-constancy flow: temporal difference / spatial gradient.
   // Central differences are regularized, capped and blended with neighbouring flow.
   float cells=12.+(1.-b)*56.;vec2 center=(floor(uv*cells)+.5)/cells;
   vec2 px=vec2(1./cells*.5,0.);vec2 py=px.yx;
   float old=lum(TEX(uPrevious,safe(center)).rgb);
   float gx=lum(sampleAt(center+px))-lum(sampleAt(center-px));
   float gy=lum(sampleAt(center+py))-lum(sampleAt(center-py));
   float dt=lum(sampleAt(center))-old;
   vec2 flow=-dt*vec2(gx,gy)/(gx*gx+gy*gy+.035)/cells;
   flow=clamp(flow,vec2(-.045),vec2(.045));
   vec2 drift=flow*(.3+d*4.)+vec2(sin(center.y*14.+t*.3),cos(center.x*9.+t*.2))*d*.001;
   vec3 previous=TEX(uHistory,safe(uv-drift)).rgb;
   c=mix(c,previous,a*.97);
 }else if(uMode==3){
   float low=min(b,d),high=max(b,d),light=lum(c);
   vec2 direction=vec2(cos(uExtra.x*6.28318),sin(uExtra.x*6.28318));
   vec3 winner=c;float best=light;float span=a*.22;
   // Twelve bounded rank candidates; no unbounded per-pixel sort on mobile.
   for(int i=0;i<12;i++){
     float f=float(i)/11.;vec3 candidate=sampleAt(uv+direction*f*span);
     float l=lum(candidate);if(l>best&&l>=low&&l<=high){winner=candidate;best=l;}
   }
   c=mix(c,winner,step(low,light)*step(light,high));
 }else if(uMode==4){
   float frame=floor(t*30.),track=fract(t*.13);
   float band=exp(-abs(uv.y-track)*95.);
   float bottom=smoothstep(.89,.999,1.-uv.y);
   float wobble=sin(uv.y*19.+t*2.1)*.003+sin(uv.y*131.+t*8.)*.0015;
   float tear=(hash(vec2(floor(uv.y*140.),frame))-.5)*(band*.11+bottom*.045)*b;
   vec2 p=uv+vec2(wobble*b*3.+tear,0.);
   c=sampleAt(p);float bleed=uExtra.x*.019;
   c.r=(sampleAt(p+vec2(bleed,0.)).r+sampleAt(p+vec2(bleed*.45,0.)).r)*.5;
   c.b=(sampleAt(p-vec2(bleed,0.)).b+sampleAt(p-vec2(bleed*.4,0.)).b)*.5;
   c*=1.-a*.3*(.5+.5*sin(gl_FragCoord.y*3.14159));
   c+=(hash(gl_FragCoord.xy+frame)-.5)*d*(.13+band*.7+bottom*.5);
 }else if(uMode==5){
   vec2 off=vec2(sin(uv.y*(8.+b*100.)+t*(.3+d*5.)),cos(uv.x*(8.+b*60.)-t*(.3+d*5.)))*a*.045;
   c=sampleAt(uv+off);
 }else if(uMode==6){
   float angle=(d-.5)*.16;mat2 rot=mat2(cos(angle),-sin(angle),sin(angle),cos(angle));
   vec2 h=rot*(uv-.5)*(1.-(b-.3)*.16)+.5;
   c=mix(c,TEX(uHistory,safe(h)).rgb,a*.96);
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
 }else if(uMode==10){
   float axis=dot(uv-.5,vec2(cos(b*6.28318),sin(b*6.28318)))+.5;
   float age=fract(axis+t*d*.15)*3.*a;
   vec3 old=memoryAt(uv,floor(age));vec3 next=memoryAt(uv,min(3.,floor(age)+1.));
   c=mix(old,next,fract(age));
 }else if(uMode==11){
   vec2 p=uv-.5;p.x*=uResolution.x/uResolution.y;
   float n=2.+floor(a*14.),sector=6.28318/n,angle=atan(p.y,p.x)+b*6.28318;
   angle=abs(mod(angle+sector*.5,sector)-sector*.5);
   vec2 q=vec2(cos(angle),sin(angle))*length(p)*( .7+d*.8 );q.x*=uResolution.y/uResolution.x;
   c=sampleAt(q+.5);
 }else if(uMode==12){
   float grid=4.+floor(b*34.);vec2 block=floor(uv*grid);float tick=floor(t*(1.+d*13.));
   vec2 rand=vec2(hash(block+tick),hash(block.yx+tick+19.));
   vec2 p=uv+(floor(rand*grid)-block)/grid*step(1.-a,hash(block+tick+5.));
   c=sampleAt(p);
 }else if(uMode==13){
   float cell=4.+floor(a*20.);vec2 xy=uv*uResolution,block=floor(xy/cell),local=fract(xy/cell);
   vec3 tone=sampleAt((block+.5)*cell/uResolution);float l=clamp((lum(tone)-.5)*( .5+d*2.5 )+.5,0.,1.);
   float ink=0.;
   // Analytic original 3x5 glyph strokes (dot, colon, cross, grid), no font texture.
   float vertical=1.-step(.13,abs(local.x-.5));float horizontal=1.-step(.1,abs(local.y-.5));
   float dotMask=(1.-step(.16,length(local-.5)));
   float grid= max(vertical,horizontal)*step(.12,local.x)*step(.12,local.y)*step(local.x,.88)*step(local.y,.88);
   ink=l<.2?dotMask:l<.45?vertical:l<.7?grid:max(grid,(1.-step(.08,abs(local.x-local.y))));
   float threshold=(mod(floor(xy.x),2.)*2.+mod(floor(xy.y),2.)+.5)/4.;
   c=b<.5?tone*ink*(.7+l):tone*step(threshold,l)*1.3;
 }else if(uMode==14){
   float f=6.+b*80.;vec2 off=vec2(sin(uv.y*f+t*(.5+d*4.)),cos(uv.x*f*.7-t))*.035*a;
   c=vec3(sampleAt(uv+off).r,sampleAt(uv+off*.25).g,sampleAt(uv-off).b);
 }else if(uMode==15){
   float line=floor(uv.y*(40.+b*650.));float tick=floor(t*(3.+d*35.));
   float shift=(hash(vec2(line,tick))-.5)*a*.16*step(.6,hash(vec2(line+3.,tick)));
   c=sampleAt(uv+vec2(shift,0.));
 }else if(uMode==16){
   vec2 px=vec2(2./uResolution.x,0.),py=vec2(0.,2./uResolution.y);
   float gx=lum(sampleAt(uv+px))-lum(sampleAt(uv-px));float gy=lum(sampleAt(uv+py))-lum(sampleAt(uv-py));
   float edge=smoothstep(.015,.2,length(vec2(gx,gy)))*b;
   float levels=2.+floor(a*7.);float light=floor(lum(c)*levels)/levels;
   vec3 neon=palette(fract(light+d*.07+floor(uParam.z*3.)*.25));
   c=mix(c*.8+palette(fract(light+uParam.z))*.7*light,neon,edge);
 }else if(uMode==17){
   float division=1.+floor(d*3.);float gate=step(fract(uPhase*division),.05+b*.5)*step(.12,uBeat);
   vec3 held=memoryAt(uv,3.);c=a<.5?mix(c,held,gate):c*(1.-gate);
 }else if(uMode==18){
   // Original piecewise hue wheel. Keep each pixel's saturation/value unchanged.
   float high=max(c.r,max(c.g,c.b)),low=min(c.r,min(c.g,c.b)),span=high-low,hue=0.;
   if(span>.00001){if(c.r>=c.g&&c.r>=c.b)hue=(c.g-c.b)/span;else if(c.g>=c.b)hue=2.+(c.b-c.r)/span;else hue=4.+(c.r-c.g)/span;}
   float phase=fract(hue/6.+a+t*b)*6.,f=fract(phase);vec3 rotated;
   if(phase<1.)rotated=vec3(span,span*f,0.);
   else if(phase<2.)rotated=vec3(span*(1.-f),span,0.);
   else if(phase<3.)rotated=vec3(0.,span,span*f);
   else if(phase<4.)rotated=vec3(0.,span*(1.-f),span);
   else if(phase<5.)rotated=vec3(span*f,0.,span);
   else rotated=vec3(span,0.,span*(1.-f));
   c=mix(original,rotated+vec3(low),d);
 }
 if(uMode==19){
   float mode=floor(a*4.+.5);vec2 p=uv;float line=b,vertical=1.-b;
   if(mode<.5||mode>3.5){if(p.x>line)p.x=2.*line-p.x;}
   else if(mode<1.5){if(p.x<line)p.x=2.*line-p.x;}
   if((mode>1.5&&mode<2.5)||mode>3.5){if(p.y<vertical)p.y=2.*vertical-p.y;}
   else if(mode>2.5&&mode<3.5){if(p.y>vertical)p.y=2.*vertical-p.y;}
   c=mix(original,sampleAt(p),d);
 }
 if(uMode==20){
   // Original scanline raster: density, opacity, bidirectional roll, line thickness.
   float lines=60.+a*600.;float y=uv.y*lines+t*(d-.5)*lines*.2;
   float w=.12+uExtra.x*.76;float s=smoothstep(w-.1,w+.1,abs(fract(y)-.5)*2.);
   c*=1.-b*s;
 }else if(uMode==21){
   // Hash grain: amount, grain size, colour vs mono, flicker rate.
   float px=1.+floor(b*7.);vec2 cell=floor(gl_FragCoord.xy/px);float f=floor(t*(4.+uExtra.x*26.));
   vec3 n=vec3(hash(cell+f),hash(cell+f+17.3),hash(cell+f+41.9))-.5;
   c+=mix(vec3(n.r),n,d)*a*.7;
 }else if(uMode==22){
   // Block mosh approximation: stale blocks persist and drift where motion is detected.
   float cells=6.+(1.-b)*66.;vec2 blk=floor(uv*cells);vec2 center=(blk+.5)/cells;
   float diff=abs(lum(sampleAt(center))-lum(TEX(uPrevious,safe(center)).rgb));
   vec2 dir=(vec2(hash(blk),hash(blk+3.1))-.5)*uExtra.x*.03*(.2+diff*6.);
   vec3 stale=TEX(uHistory,safe(uv-dir)).rgb;
   float fresh=step(a*.97+.02,hash(blk+floor(t*8.)))*(1.-step(d*.3+.01,diff));
   c=mix(stale,c,fresh);
 }
 if(uMode==0&&uInkMix>0.){vec4 ink=TEX(uInk,safe(uv));c=mix(c,ink.rgb,ink.a*uInkMix);}
 COLOR=vec4(clamp(mix(original,c,uMode==0?1.:uIntensity),0.,1.),1.);
}`;
