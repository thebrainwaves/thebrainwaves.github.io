import {validatePreset,evaluate} from './core.js';import {GroveScene} from './scene.js';
const canvas=document.getElementById('output'),notice=document.getElementById('output-status'),scene=new GroveScene(canvas);let state=null,time=0,bands={},held=false,last=performance.now(),received=0;
const session=new URLSearchParams(location.search).get('session');
if(session&&/^[a-zA-Z0-9-]{8,80}$/.test(session)&&globalThis.BroadcastChannel){
 const channel=new BroadcastChannel('haunted-grove-'+session);channel.onmessage=e=>{
  const m=e.data;if(!m||typeof m!=='object')return;
  if(m.kind==='closed'){state=null;notice.classList.remove('connected');notice.textContent='Instrument closed. Return to Haunted Grove to reconnect.';return;}
  if(m.kind==='state'){try{state=validatePreset(m.state);time=Number.isFinite(m.time)?Math.max(0,m.time):0;bands={};for(const k of ['bass','mid','treble','beat'])bands[k]=Number.isFinite(m.audio?.[k])?Math.max(0,Math.min(1,m.audio[k])):0;held=m.held===true;received=performance.now();notice.classList.add('connected');scene.summons=Array.isArray(m.summons)?m.summons.filter(s=>s&&Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.time)&&['mossling','lantern','mushroom','shadow','eyes'].includes(s.monster)).slice(0,12):[];}catch{notice.textContent='Invalid instrument state ignored.';}}
  if(m.kind==='trigger'&&['summon','scare','eyes','lightning','fog'].includes(m.trigger)&&Number.isFinite(m.time)&&Number.isFinite(m.x)&&Number.isFinite(m.y))scene.trigger(m.trigger,m.time,m.x,m.y,m.monster);
 };window.addEventListener('pagehide',()=>channel.close());
}else notice.textContent='Open this output from the Haunted Grove instrument.';
function resize(){scene.resize(innerWidth,innerHeight,.85);}window.addEventListener('resize',resize);resize();
function frame(now){const dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;if(state){if(!held)time+=dt;scene.render(state,evaluate(state,time,bands),time,bands);if(now-received>3000){notice.classList.remove('connected');notice.textContent='Instrument paused or disconnected.';}}requestAnimationFrame(frame);}requestAnimationFrame(frame);
