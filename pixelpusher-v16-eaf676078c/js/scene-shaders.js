// All visual equations below are original Brainhertz Productions implementations.
export const HEADER = `precision highp float;
varying vec2 vUv;
varying float vHeight;
uniform float u_time,u_low,u_mid,u_high,u_beat,u_bpm,u_steps;
uniform vec2 u_resolution;
uniform sampler2D u_source;
uniform float u_speed,u_scale,u_detail,u_glow,u_warp,u_palette,u_rotation;
vec3 ppPalette(float n){float i=mod(floor(n)+floor(u_palette*3.99),4.);if(i<.5)return vec3(1.,.055,.08);if(i<1.5)return vec3(.1,.3,1.);if(i<2.5)return vec3(.38,.12,.95);return vec3(.06,.75,.26);}
`;
export const QUAD_VERTEX = `varying vec2 vUv;varying float vHeight;void main(){vUv=uv;vHeight=0.;gl_Position=vec4(position.xy,0.,1.);}`;
export const SURFACE_VERTEX = `varying vec2 vUv;varying float vHeight;uniform float u_time,u_speed,u_warp,u_low;void main(){vUv=uv;vec3 p=position;float t=u_time*(.15+u_speed*1.8);float wave=sin(p.x*3.+t)*cos(p.y*2.8-t*.7);p+=normal*wave*(u_warp*.28+u_low*.22);vHeight=wave;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
export const PARTICLE_VERTEX = `varying vec2 vUv;varying float vHeight;uniform float u_time,u_speed,u_glow,u_warp,u_low;void main(){vec3 p=position;float t=u_time*(.1+u_speed);p.x+=sin(p.z*2.+t)*u_warp*.3;p.z=mod(p.z+t,7.)-3.5;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+u_glow*5.+u_low*4.)/max(.5,-mv.z*.35),1.,14.);vHeight=position.z;vUv=position.xy;}`;
export const FRAGMENTS = {
  tunnel:
    HEADER +
    `void main(){vec2 p=(vUv-.5)*vec2(u_resolution.x/u_resolution.y,1.);float angle=atan(p.y,p.x)+u_rotation*6.283;float z=1./max(.035,length(p))*(.4+u_scale);float t=u_time*(.2+u_speed*2.);float bands=pow(.5+.5*cos(z*(2.+u_detail*9.)-t*3.),18.);float rails=pow(.5+.5*cos(angle*(4.+floor(u_detail*12.))+sin(z+t)*u_warp),25.);float fade=smoothstep(.02,.18,length(p));vec3 c=ppPalette(floor(z*.2))*bands*.5+ppPalette(1.)*rails*.45;gl_FragColor=vec4((vec3(.004,.007,.018)+c*(.25+u_glow)*fade),1.);}`,
  particles:
    HEADER +
    `void main(){float d=length(gl_PointCoord-.5);float glow=exp(-d*d*24.)*(1.-smoothstep(.3,.5,d));gl_FragColor=vec4(ppPalette(floor(vHeight))*glow*(.45+u_glow),glow);}`,
  mesh:
    HEADER +
    `void main(){vec2 g=abs(fract(vUv*(12.+u_detail*32.))-.5);float grid=1.-smoothstep(.018,.055,min(g.x,g.y));vec3 base=ppPalette(floor(vHeight*1.5+1.5));gl_FragColor=vec4(base*(.035+grid*(.3+u_glow*.7))*(.7+vHeight*.2),1.);}`,
  fractal:
    HEADER +
    `float field(vec3 p){float scale=1.;for(int j=0;j<4;j++){p=abs(p).yzx*1.8-vec3(.85,.65,.75);scale*=1.8;}return (length(p)-.9)/scale;}void main(){vec2 p=(vUv-.5)*vec2(u_resolution.x/u_resolution.y,1.);vec3 ro=vec3(0.,0.,-3.5),rd=normalize(vec3(p*(.8+u_scale),1.));float t=u_time*(.07+u_speed*.2)+u_rotation*6.283;mat2 rot=mat2(cos(t),-sin(t),sin(t),cos(t));float travel=0.,glow=0.,hit=0.;for(int i=0;i<64;i++){if(float(i)>=u_steps)break;vec3 q=(ro+rd*travel)*(.8+u_detail*.5);q.xy=rot*q.xy;q.xz+=sin(q.zy*2.+t)*u_warp*.12;float d=abs(field(q));glow+=exp(-d*75.)*.018;if(d<.002){hit=1.;break;}travel+=max(.018,d*.7);if(travel>7.)break;}vec3 c=ppPalette(floor(travel))*glow*(.3+u_glow)+ppPalette(1.)*hit*(.15+u_glow*.5);gl_FragColor=vec4(vec3(.003,.005,.012)+c,1.);}`,
  wireframe:
    HEADER +
    `void main(){vec3 c=ppPalette(floor(vHeight*2.+vUv.x*3.));gl_FragColor=vec4(c*(.25+u_glow*.8+u_high*.3),1.);}`,
  media:
    HEADER +
    `void main(){vec2 p=vUv;vec3 c=texture2D(u_source,p).rgb;float edge=pow(.5+.5*sin(vUv.x*(10.+u_detail*50.)+u_time*(.2+u_speed*2.)),18.)*u_glow*.12;gl_FragColor=vec4(c+ppPalette(1.)*edge,1.);}`,
};
