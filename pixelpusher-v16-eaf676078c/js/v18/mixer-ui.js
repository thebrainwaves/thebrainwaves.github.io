// Pixel Pusher 1.8 Audio tab: channel strips with live meters, master + limiter, output routing note / picker.
import {CHANNELS,GAIN_MAX,fmtGain,fmtPan,sinkSupported,DB_FLOOR,NA,HAS_INTERNAL} from './mixer.js';
const LO=-60;const pos=db=>Math.max(0,Math.min(1,(db-LO)/-LO));
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export function drawMeter(cv,m){
 const dpr=Math.min(2,devicePixelRatio||1),w=Math.max(40,Math.round(cv.clientWidth*dpr)),h=Math.max(8,Math.round(cv.clientHeight*dpr));if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
 const g=cv.getContext('2d');g.fillStyle='#070914';g.fillRect(0,0,w,h);const led=Math.round(h*1.1),W=w-led-4;
 // zones: green to -12 dB, electric blue to -3 dB, red above
 const zone=(a,b,c)=>{const x0=pos(a)*W,x1=Math.min(pos(b),pos(m.rms??DB_FLOOR))*W;if(x1>x0){g.fillStyle=c;g.fillRect(x0,h*.18,x1-x0,h*.64);}};
 g.globalAlpha=.22;for(const [a,b,c]of [[LO,-12,'#27e889'],[-12,-3,'#2f6cff'],[-3,0,'#ff2b3d']]){g.fillStyle=c;g.fillRect(pos(a)*W,h*.18,(pos(b)-pos(a))*W,h*.64);}g.globalAlpha=1;
 zone(LO,-12,'#27e889');zone(-12,-3,'#2f6cff');zone(-3,0,'#ff2b3d');
 const px=pos(m.peak??DB_FLOOR)*W;if(px>1){g.fillStyle='#cfd3ef';g.fillRect(px-1,0,2,h);}
 const hx=pos(m.hold??DB_FLOOR)*W;if(hx>1){g.fillStyle=(m.hold??-99)>-3?'#ff2b3d':'#6e3bff';g.fillRect(hx-1.5,0,3,h);}
 g.fillStyle='#262c55';for(const db of [-48,-36,-24,-12,-6,-3])g.fillRect(pos(db)*W,h*.82,1,h*.18);
 g.fillStyle=m.clip>0?'#ff2b3d':'#1a1f3d';g.beginPath();g.arc(w-led/2,h/2,led*.36,0,7);g.fill();
}
export function createMixerUI(x){
 const {mixer,el,icon,tile,chip,button,slider,head,note}=x;let meters=[],raf=0,grEl=null,routeEl=null;
 const fmtDb=v=>v<=DB_FLOOR+1?'−∞':v.toFixed(1);
 function loop(now){raf=0;meters=meters.filter(m=>m.cv.isConnected);if(!meters.length)return;const r=mixer.meters(now);
  for(const m of meters){const v=r[m.id];if(!v)continue;drawMeter(m.cv,v);if(m.txt){const t='PK '+fmtDb(v.peak)+' · RMS '+fmtDb(v.rms);if(m.txt.textContent!==t)m.txt.textContent=t;}m.cv.parentElement.classList.toggle('hot',v.peak>-60);}
  if(grEl){const t='LIMIT '+(r.gr<-.05?r.gr.toFixed(1):'0.0')+' dB';if(grEl.textContent!==t)grEl.textContent=t;grEl.classList.toggle('on',r.gr<-.5);}
  raf=requestAnimationFrame(loop);}
 const watch=()=>{if(!raf)raf=requestAnimationFrame(loop);};
 function meter(id,label){const w=el('div','mx-meter');const cv=el('canvas');cv.setAttribute('aria-label',label+' level meter');cv.dataset.meter=id;const txt=el('small','mx-db','PK −∞ · RMS −∞');w.append(cv,txt);meters.push({id,cv,txt});return w;}
 async function goOnAir(){try{await mixer.arm();note('On air: '+(mixer.inputLabel()||'input')+'. Only you hear it if Hear input is on.');}catch(e){note(e?.name==='NotAllowedError'?'Input permission was declined. Allow the microphone in Settings › Safari, then tap Go on air.':(e.message||'Input unavailable.'),true);}x.refresh();}
 function stopAir(){mixer.disarm();note('Input off');x.refresh();}
 // Native app only: Internal audio = other apps' sound via the system broadcast (ReplayKit). Honest copy, red while live.
 async function startInternal(){try{await mixer.startInternal();await NA.showInternalPicker();note('Pick “Pixel Pusher Internal Audio”, then Start Broadcast.');}catch(e){note(e.message||'Internal audio unavailable.',true);}x.refresh();}
 function stopInternal(){mixer.stopInternal();note('Internal audio off. If the red status pill is still on, tap it to end the broadcast.');x.refresh();}
 function nativeInputs(card){const c=mixer.mix.ch.input;
  NA.inputs().then(r=>{if(!card.isConnected)return;const list=r?.inputs||[];
   if(list.length>1){const s=el('select','mx-select');s.setAttribute('aria-label','Input');const d=el('option',null,'System default');d.value='';s.append(d);
    for(const p of list){const o=el('option',null,String(p.name||'Input').slice(0,60));o.value=p.uid;s.append(o);}s.value=c.device||'';
    s.addEventListener('change',()=>{mixer.mix.ch.input.device=s.value;mixer.mix.ch.input.nch=null;mixer.set('ch.input.gain',c.gain);if(mixer.armed)goOnAir();else NA.setInput(s.value).catch(()=>{});x.refresh();});card.append(s);}
   const max=r?.maxChannels|0;if(max>2){const s=el('select','mx-select');s.setAttribute('aria-label','Interface channels');const d=el('option',null,'Channels: system (1+2)');d.value='';s.append(d);
    for(let i=0;i+1<max;i+=2){const o=el('option',null,'Channels '+(i+1)+'+'+(i+2));o.value=i+','+(i+1);s.append(o);}for(let i=0;i<max;i++){const o=el('option',null,'Channel '+(i+1)+' (mono)');o.value=i+','+i;s.append(o);}
    s.value=c.nch?c.nch.join(','):'';s.addEventListener('change',()=>{mixer.mix.ch.input.nch=s.value?s.value.split(',').map(Number):null;mixer.set('ch.input.gain',c.gain);if(mixer.armed)goOnAir();x.refresh();});card.append(s);}
  }).catch(()=>{});}
 const tap=async fn=>{try{await mixer.ensure();}catch(e){return note(e.message,true);}fn();};
 function strip(s){const m=mixer.mix;
  s.append(tile({label:'Mixer',iconName:'mixer',action:true,color:'purple',selected:x.drawerIs('mixer'),aria:'Audio mixer',onTap:()=>x.drawerIs('mixer')?x.closeDrawer():x.openDrawer('mixer')}));
  s.append(tile({label:mixer.armed?'On air':'Go on air',iconName:'mic',on:mixer.armed,color:mixer.armed?'red':undefined,aria:mixer.armed?'Input on air: tap to stop':'Go on air: start the input',onTap:()=>mixer.armed?stopAir():goOnAir()}));
  s.append(tile({label:'Video audio',iconName:'clip',on:!m.ch.video.mute,aria:'Video audio channel',onTap:()=>tap(()=>mixer.toggle('ch.video.mute'))}));
  s.append(tile({label:'Test tone',iconName:'wave',on:m.app.tone&&!m.ch.app.mute,aria:'Test tone (440 Hz)',onTap:()=>tap(()=>{const on=!(m.app.tone&&!m.ch.app.mute);mixer.set('app.tone',on);if(on)mixer.set('ch.app.mute',false);})}));
  s.append(tile({label:'Click',iconName:'tap',on:m.app.click&&!m.ch.app.mute,aria:'Tempo click',onTap:()=>tap(()=>{const on=!(m.app.click&&!m.ch.app.mute);mixer.set('app.click',on);if(on)mixer.set('ch.app.mute',false);})}));
  if(HAS_INTERNAL)s.append(tile({label:mixer.internalLive?'Internal live':'Internal',iconName:'wave',on:!!mixer.internalOn,color:mixer.internalLive?'red':undefined,aria:'Internal audio from other apps',onTap:()=>mixer.internalOn?stopInternal():startInternal()}));
  s.append(el('span','divider'));
  s.append(tile({label:'Mute all',iconName:'mute',action:true,aria:'Mute every channel',onTap:()=>{for(const [id]of CHANNELS)mixer.mix.ch[id].mute=true;mixer.set('master.gain',mixer.mix.master.gain);note('All channels muted');}}));
 }
 function chStrip(d,id,label){const c=mixer.mix.ch[id],card=el('section','mx-ch'+(id==='input'?' input':id==='internal'?' internal'+(mixer.internalLive?' live':''):''));card.dataset.ch=id;
  const top=el('div','mx-top');top.append(el('b',null,label));
  const mute=chip('M',()=>tap(()=>mixer.toggle('ch.'+id+'.mute')),c.mute);mute.classList.add('mx-m');mute.setAttribute('aria-label','Mute '+label);mute.setAttribute('aria-pressed',String(c.mute));
  const solo=chip('S',()=>tap(()=>mixer.toggle('ch.'+id+'.solo')),c.solo);solo.classList.add('mx-s');solo.setAttribute('aria-label','Solo '+label);solo.setAttribute('aria-pressed',String(c.solo));
  top.append(mute,solo);card.append(top);
  if(id==='input'){const row=el('div','mx-row');
   const air=button(mixer.armed?'On air · Stop':'Go on air','mic',()=>mixer.armed?stopAir():goOnAir(),mixer.armed?'mx-air on':'mx-air');air.setAttribute('aria-pressed',String(mixer.armed));row.append(air);
   const hear=chip('Hear input',()=>{const on=!c.monitor;mixer.set('ch.input.monitor',on);if(on)note('Use headphones: speakers + mic will feed back.',true);x.refresh();},c.monitor);hear.setAttribute('aria-pressed',String(c.monitor));row.append(hear);card.append(row);
   if(mixer.armed){const lab=mixer.inputLabel();card.append(el('small','mx-sub','● '+(lab?lab.slice(0,60):'Input')+' · stops when you leave the app'));
    if(NA)nativeInputs(card);else mixer.inputs().then(list=>{if(list.length<2||!card.isConnected)return;const s=el('select','mx-select');s.setAttribute('aria-label','Input device');for(const dv of list){const o=el('option',null,(dv.label||'Input').slice(0,60));o.value=dv.deviceId;s.append(o);}const cur=mixer.mic?.getAudioTracks()[0]?.getSettings?.().deviceId;if(cur)s.value=cur;s.addEventListener('change',()=>{mixer.mix.ch.input.device=s.value;goOnAir();});card.append(s);});}
   else if(mixer.notice){card.append(el('small','mx-sub warn',mixer.notice));}
   else card.append(el('small','mx-sub','Mic or audio interface. Starts only when you tap, stops when the app is hidden.'));
   if(NA&&!mixer.armed)nativeInputs(card);}
  if(id==='internal'){const row=el('div','mx-row');
   const b=button(mixer.internalOn?(mixer.internalLive?'Live · Stop':'Waiting · Stop'):'Start internal audio','wave',()=>mixer.internalOn?stopInternal():startInternal(),mixer.internalLive?'mx-air on':'mx-air');b.setAttribute('aria-pressed',String(!!mixer.internalOn));row.append(b);
   const hear=chip('Hear',()=>{mixer.set('ch.internal.monitor',!c.monitor);x.refresh();},c.monitor);hear.setAttribute('aria-pressed',String(c.monitor));row.append(hear);card.append(row);
   if(mixer.internalLive)card.append(el('small','mx-sub live','● LIVE · capturing other apps’ sound. The red status pill shows while it runs.'));
   else if(mixer.internalOn)card.append(el('small','mx-sub','Waiting for the broadcast. In the sheet pick “Pixel Pusher Internal Audio” and tap Start Broadcast.'));
   else if(mixer.internalNotice)card.append(el('small','mx-sub warn',mixer.internalNotice));
   card.append(el('small','mx-sub','Sound from music and video apps on this iPhone. Protected audio (Apple Music, Netflix and most streaming video, calls) plays silent here: that is iOS, not a fault. Pixel Pusher’s own sound is included too. Video and mic are never captured; nothing leaves the phone unless you share a recording or Link.'));}
  if(id==='app'){const row=el('div','mx-row');const a=mixer.mix.app;row.append(chip('Test tone',()=>tap(()=>mixer.toggle('app.tone')),a.tone),chip('Click',()=>tap(()=>mixer.toggle('app.click')),a.click));card.append(row);}
  card.append(meter(id,label));
  card.append(slider({label:'Gain',value:c.gain,min:0,max:GAIN_MAX,step:.01,format:fmtGain,onInput:v=>{mixer.mix.ch[id].gain=v;mixer.apply();},onChange:v=>mixer.set('ch.'+id+'.gain',v)}));
  card.append(slider({label:'Pan',value:c.pan,min:-1,max:1,step:.02,format:fmtPan,onInput:v=>{mixer.mix.ch[id].pan=v;mixer.apply();},onChange:v=>mixer.set('ch.'+id+'.pan',Math.abs(v)<.04?0:v)}));
  d.append(card);}
 function drawer(d){meters=[];
  head(d,'Audio mixer',HAS_INTERNAL?'INPUT · VIDEO · APP · INTERNAL → MASTER':'INPUT · VIDEO · APP → MASTER');
  const st=mixer.state;if(st!=='running'&&st!=='off')d.append(el('p','mx-paused','Audio is paused by the system. Tap anywhere to resume.'));
  const grid=el('div','mx-grid');for(const [id,label]of CHANNELS){if(id==='link'&&!mixer.linkOn)continue;chStrip(grid,id,label);}
  const ms=el('section','mx-ch master');const top=el('div','mx-top');top.append(el('b',null,'Master'));grEl=el('span','mx-gr','LIMIT 0.0 dB');top.append(grEl);ms.append(top);
  ms.append(el('small','mx-sub','Brickwall limiter, −0.3 dB ceiling. Feeds KICK/HITS, Motion audio and Make clip / REC.'));
  ms.append(meter('master','Master'));
  ms.append(slider({label:'Master',value:mixer.mix.master.gain,min:0,max:GAIN_MAX,step:.01,format:fmtGain,onInput:v=>{mixer.mix.master.gain=v;mixer.apply();},onChange:v=>mixer.set('master.gain',v)}));
  grid.append(ms);d.append(grid);
  routeEl=el('section','mx-route');routeEl.append(el('b',null,'Output'));
  if(NA){const row=el('div','mx-row');
   if(NA.showRoutePicker)row.append(button('Audio output','link',()=>NA.showRoutePicker().catch(e=>note(e.message||'Output picker unavailable',true)),'mx-route-btn'));
   if(NA.midi)row.append(button('Bluetooth MIDI','tap',()=>NA.midi.showBluetoothPicker().catch(e=>note(e.message||'Bluetooth MIDI unavailable',true)),'mx-route-btn'));
   routeEl.append(row);const outs=(mixer.route?.outputs||[]).map(o=>o.name).filter(Boolean).join(', ');
   routeEl.append(el('small','mx-sub','AirPods, Bluetooth, USB interface, speaker or AirPlay.'+(outs?' Now: '+outs.slice(0,80)+'.':'')+(NA.midi?' Bluetooth MIDI connects a wireless controller (MIDI mapping comes in a later update).':'')));
   if(NA.route&&!mixer.route)NA.route().then(r=>{mixer.route=r;}).catch(()=>{});}
  else if(sinkSupported()){const s=el('select','mx-select');s.setAttribute('aria-label','Audio output device');const def=el('option',null,'System default');def.value='';s.append(def);s.value=mixer.mix.sink||'';
   mixer.outputs().then(list=>{for(const dv of list){if(dv.deviceId==='default'||dv.deviceId==='')continue;const o=el('option',null,(dv.label||'Output').slice(0,60));o.value=dv.deviceId;s.append(o);}s.value=mixer.mix.sink||'';});
   s.addEventListener('change',()=>mixer.setSink(s.value).then(()=>note('Output: '+s.selectedOptions[0].textContent)).catch(e=>note(e.message||'Output change failed',true)));routeEl.append(s);
   routeEl.append(el('small','mx-sub','This browser can send audio to a chosen device.'));}
  else routeEl.append(el('small','mx-sub',(isIOS()?'On iPhone / iPad: ':'')+'choose AirPods, speaker or AirPlay in Control Center (swipe down from the top-right, tap the AirPlay icon on the audio card). Safari can’t pick outputs from inside a web app.'));
  d.append(routeEl);watch();}
 return {strip,drawer,meterCount:()=>meters.length};
}
