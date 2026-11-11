/* Haunted Grove — original normalized instrument state. No DOM or devices. */
export const VERSION='0.1.0';
export const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(v)?v:min));
const finite=(v,fallback)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
export const PARAMS={
 creep:{label:'Creep',value:.46,section:'body'},cute:{label:'Cute',value:.72,section:'body'},density:{label:'Density',value:.65,section:'forest'},glow:{label:'Glow',value:.65,section:'forest'},chaos:{label:'Chaos',value:.18,section:'body'},
 fog:{label:'Fog depth',value:.48,section:'forest'},wind:{label:'Wind',value:.35,section:'forest'},sway:{label:'Tree sway',value:.32,section:'forest'},spores:{label:'Spores',value:.62,section:'forest'},moon:{label:'Moonlight',value:.7,section:'forest'},
 drift:{label:'Camera drift',value:.35,section:'camera'},zoom:{label:'Push / zoom',value:.25,section:'camera'},panX:{label:'Pan X',value:.5,section:'camera'},panY:{label:'Pan Y',value:.5,section:'camera'},
 speed:{label:'Life speed',value:.38,section:'body'},gaze:{label:'Eyes awake',value:.7,section:'body'},size:{label:'Creature scale',value:.55,section:'body'},
 feedback:{label:'Trail memory',value:.28,section:'feedback'},grain:{label:'Film grain',value:.12,section:'feedback'},aberration:{label:'Chromatic drift',value:.12,section:'feedback'},morph:{label:'Look morph',value:0,section:'perform'}
};
export const BANKS={base:['creep','cute','density','glow','chaos'],shift:['fog','wind','sway','spores','moon'],alt:['drift','zoom','panX','panY','speed']};
const rgb=h=>[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
const look=(id,name,tag,colors,style='normal')=>({id,name,tag,style,colors:Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,rgb(v)]))});
export const LOOKS=[
 look('moonlit','Moonlit','01 / NOCTURNE',{sky:'080c23',haze:'243966',far:'172b47',mid:'123340',near:'071e26',accent:'6977ec',glow:'64bfc0',moon:'94a6dd',moss:'245b51',cap:'513390'}),
 look('toxic','Neon Toxic','02 / BIOLUMEN',{sky:'070e16',haze:'193d30',far:'123c34',mid:'12372f',near:'071c22',accent:'79b92c',glow:'9ee45c',moon:'5372b0',moss:'326f3d',cap:'3c59bb'}),
 look('bloodmoon','Bloodmoon','03 / OMEN',{sky:'180919',haze:'612234',far:'3e2037',mid:'2b1b37',near:'130f22',accent:'d03a3b',glow:'f46840',moon:'d34838',moss:'354951',cap:'8e2936'}),
 look('ultraviolet','Ultraviolet Spirit','04 / PHANTOM',{sky:'100a29',haze:'35215e',far:'2d1c50',mid:'251940',near:'120e29',accent:'783beb',glow:'9675fa',moon:'777bdd',moss:'3d3374',cap:'652dba'}),
 look('spectral','Spectral Blue','05 / AFTERLIFE',{sky:'030f24',haze:'153c66',far:'143653',mid:'102c42',near:'07172d',accent:'3268dd',glow:'45bad6',moon:'688adb',moss:'195461',cap:'2856a6'}),
 look('vhs','VHS Nightmare','06 / LOST SIGNAL',{sky:'100f22',haze:'3b2e56',far:'282946',mid:'252237',near:'101526',accent:'745ce0',glow:'d54848',moon:'657ab6',moss:'2c5555',cap:'493a7b'},'vhs'),
 look('wire','Wireframe','07 / UNDERGROWTH',{sky:'070d20',haze:'102841',far:'18374d',mid:'0a1b32',near:'070e20',accent:'375db8',glow:'348eb4',moon:'304f91',moss:'183847',cap:'263c79'},'wire'),
 look('ink','Ink / Silhouette','08 / BLACKTHORN',{sky:'0b1020',haze:'303f5d',far:'1c293f',mid:'111b30',near:'070c19',accent:'505e86',glow:'7489b4',moon:'65769d',moss:'132037',cap:'243354'},'ink')
];
const getLook=id=>LOOKS.find(l=>l.id===id)||LOOKS[0];
export function blendLooks(a,b,t){a=getLook(a);b=getLook(b);t=clamp(t);return Object.fromEntries(Object.keys(a.colors).map(k=>[k,a.colors[k].map((v,i)=>v+(b.colors[k][i]-v)*t)]));}
export function lfoValue(lfo,time,bpm=120){
 const depth=clamp(finite(lfo.depth,1));
 const rate=lfo.sync?clamp(bpm,40,240)/60/clamp(finite(lfo.division,4),.25,16):clamp(finite(lfo.rate,.15),.01,10);
 const cycle=Math.max(0,finite(time,0))*rate;const p=cycle%1;let value;
 switch(lfo.shape){case 'triangle':value=1-4*Math.abs(p-.25);if(value< -1)value=-2-value;break;case 'square':value=p<.5?1:-1;break;case 'saw':value=2*p-1;break;case 'random':value=(Math.sin(Math.floor(cycle)*127.1+311.7)*43758.5453)%1;value=(value<0?value+1:value)*2-1;break;default:value=Math.sin(p*Math.PI*2);}
 return clamp(value,-1,1)*depth;
}
export function createState(){return {
 version:1,name:'Untitled grove',lookA:'moonlit',lookB:'ultraviolet',params:Object.fromEntries(Object.entries(PARAMS).map(([k,p])=>[k,p.value])),
 routes:{creep:{source:'x',depth:.3},cute:{source:'y',depth:.25},fog:{source:'lfo1',depth:.09},sway:{source:'lfo2',depth:.12},glow:{source:'bass',depth:.2}},
 lfos:[{shape:'sine',rate:.12,depth:.7,sync:false,division:8},{shape:'triangle',rate:.23,depth:.5,sync:true,division:4}],
 xy:{x:.5,y:.5},bpm:100,bank:'base',flags:{feedback:true,mirror:false,invert:false,quiet:false,hold:false},midiValues:{},mappings:[],followClock:false,quality:'auto',monster:'mossling'
 };}
export function evaluate(state,time,audio={}){
 const out={};const sources={lfo1:lfoValue(state.lfos[0],time,state.bpm),lfo2:lfoValue(state.lfos[1],time,state.bpm),x:state.xy.x*2-1,y:state.xy.y*2-1,bass:clamp(audio.bass),mid:clamp(audio.mid),treble:clamp(audio.treble),beat:clamp(audio.beat)};
 for(const [key,p]of Object.entries(PARAMS)){const r=state.routes[key];const source=r?.source==='midi'?finite(state.midiValues[key],.5)*2-1:finite(sources[r?.source],0);out[key]=clamp(finite(state.params[key],p.value)+source*clamp(r?.depth));}return out;
}
const SOURCES=['lfo1','lfo2','x','y','bass','mid','treble','beat','midi'];
export function validatePreset(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw new Error('Not a Haunted Grove v1 preset.');
 const s=createState();s.name=typeof value.name==='string'?value.name.slice(0,48):s.name;
 for(const k of Object.keys(PARAMS))s.params[k]=clamp(finite(value.params?.[k],s.params[k]));
 s.lookA=getLook(value.lookA).id;s.lookB=getLook(value.lookB||s.lookB).id;s.bpm=clamp(finite(value.bpm,s.bpm),40,240);
 s.routes={};for(const k of Object.keys(PARAMS)){const r=value.routes?.[k];if(r&&SOURCES.includes(r.source))s.routes[k]={source:r.source,depth:clamp(finite(r.depth,0))};}
 for(let i=0;i<2;i++){const l=value.lfos?.[i];if(!l)continue;s.lfos[i]={shape:['sine','triangle','square','saw','random'].includes(l.shape)?l.shape:'sine',rate:clamp(finite(l.rate,.12),.01,10),depth:clamp(finite(l.depth,.5)),sync:l.sync===true,division:clamp(finite(l.division,4),.25,16)};}
 for(const k of ['x','y'])s.xy[k]=clamp(finite(value.xy?.[k],.5));
 for(const k of Object.keys(s.flags))s.flags[k]=value.flags?.[k]===true;
 s.flags.hold=false;s.bank=Object.hasOwn(BANKS,value.bank)?value.bank:'base';s.followClock=value.followClock===true;
 s.quality=['auto','high','low'].includes(value.quality)?value.quality:'auto';
 s.monster=['mossling','lantern','mushroom','shadow','eyes'].includes(value.monster)?value.monster:'mossling';
 s.mappings=Array.isArray(value.mappings)?value.mappings.slice(0,128).filter(m=>m&&['cc','note'].includes(m.kind)&&Number.isInteger(m.channel)&&m.channel>=1&&m.channel<=16&&Number.isInteger(m.number)&&m.number>=0&&m.number<=127&&(Object.hasOwn(PARAMS,m.param)||['summon','scare','eyes','lightning','fog'].includes(m.param))).map(m=>({kind:m.kind,channel:m.channel,number:m.number,param:m.param,bank:Object.hasOwn(BANKS,m.bank)?m.bank:'base'})):[];
 return s;
}
export function serializePreset(s,name=s.name){const safe=validatePreset({...s,name});delete safe.midiValues;return JSON.stringify(safe,null,2);}
export function tapTempo(times){if(times.length<2)return null;const last=times.slice(-7);const intervals=last.slice(1).map((v,i)=>v-last[i]);if(intervals.some(v=>v<250||v>1500))return null;return Math.round(clamp(60000/(intervals.reduce((a,b)=>a+b)/intervals.length),40,240));}
export function parseMidi(data){
 if(!data?.length)return null;const status=data[0];if(!Number.isInteger(status)||status<128||status>255)return null;
 if([248,250,251,252].includes(status))return {kind:({248:'clock',250:'start',251:'continue',252:'stop'})[status]};
 const type=status&240,channel=(status&15)+1;if(![128,144,176,192].includes(type))return null;
 if(!Number.isInteger(data[1])||data[1]<0||data[1]>127)return null;
 if(type===192)return {kind:'program',channel,number:data[1]};
 if(!Number.isInteger(data[2])||data[2]<0||data[2]>127)return null;
 return {kind:type===176?'cc':type===128||data[2]===0?'release':'note',channel,number:data[1],value:data[2]/127};
}
export function applyMidi(s,event){if(!event)return false;let applied=false;for(const m of s.mappings){if(m.bank===s.bank&&m.kind===event.kind&&m.channel===event.channel&&m.number===event.number&&Object.hasOwn(PARAMS,m.param)){s.params[m.param]=event.value;s.midiValues[m.param]=event.value;applied=true;}}return applied;}
