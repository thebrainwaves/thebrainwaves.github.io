import {DrawingLayer} from './drawing-layer.js';
import {DrawingUI,loadDrawing} from './drawing-ui.js';
import {lowMaterialQuality,PreviewGauges} from './ui-material.js';
import {EditorController} from './editor-ui.js';
import {formatParam} from './effects.js';
import {fileKind,decodePhoto} from './photo-source.js';
import {PerformanceConsole} from './performance-console.js';
import {ShaderUI} from './shader-ui.js';
import {EFFECTS,PRESETS,defaultStack,sanitizeStack,moveEffect,normalizePreset,normalizeLimit,randomizeStack,QualityController,BeatClock} from './core.js';
import {readPresets,PRESET_KEY,serializePresets} from './storage.js';
import {PictureController,bindXY} from './touch.js';
import {RecordView} from './record-view.js';
import {Renderer} from './gpu.js';
import {AudioEngine} from './audio.js';
import {Capture,recordingMime} from './recorder.js';
const $=id=>document.getElementById(id);
const canvas=$('output'),video=$('media'),audio=new AudioEngine(video);
let performanceUI=null,consoleMutation=false,editor=null,drawingUI=null,previewGauges=null;
const drawing=new DrawingLayer(loadDrawing()),inkSources=new WeakMap();
let renderer,stack=defaultStack(),selected='rgb',sourceKind='demo',sourceURL=null,camera=null,facing='environment',sourceBusy=false;
let source,compare=false,reactive=false,sensitivity=1.5,lastFrame=0,loopStart=null,loopLength=6,recordKind='video',wakeLock=null,renderFailed=false;
const quality=new QualityController(),beatClock=new BeatClock();let frameAverage=16,lastMeasured=0,lastRenderMs=16;
const exports=[],KEY=PRESET_KEY;
let toastTimer;
const note=(message,error=false)=>{$('notice').textContent=message;$('notice').classList.toggle('error',error);const toast=$('performance-toast');if(toast){clearTimeout(toastTimer);toast.hidden=!error;if(error){toast.textContent=message;toastTimer=setTimeout(()=>toast.hidden=true,6500);}}};
const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){note(e.message||'This operation could not complete.',true);}};
const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
const demo=document.createElement('canvas');demo.width=720;demo.height=1280;
// Original procedural source: a red/blue architectural signal, not an external asset.
function drawDemo(t){
 const c=demo.getContext('2d');c.fillStyle='#080e20';c.fillRect(0,0,720,1280);
 const gradient=c.createLinearGradient(0,0,720,1280);gradient.addColorStop(0,'#152454');gradient.addColorStop(.5,'#231144');gradient.addColorStop(1,'#050917');c.fillStyle=gradient;c.fillRect(0,0,720,1280);
 c.save();c.translate(360,630);c.rotate(.14+Math.sin(t*.2)*.07);
 for(let i=17;i>0;i--){const w=54+i*24,h=30+i*40;c.strokeStyle=i%3===0?'#dd2638':i%3===1?'#3156c4':'#623bc4';c.lineWidth=i%4===0?6:2;c.strokeRect(-w/2+Math.sin(i*.8+t*.3)*14,-h/2,w,h);}
 c.restore();c.fillStyle='#e22a38';c.fillRect(75,860,570,4);c.fillStyle='#345ee4';c.fillRect(146,388,430,2);
 c.strokeStyle='#4365b8';c.lineWidth=1;for(let i=0;i<8;i++){c.beginPath();c.moveTo(60+i*86,1010);c.lineTo(360+(i-4)*25,765);c.stroke();}
 c.font='20px monospace';c.fillStyle='#6a85cb';c.fillText('BHZ / SIGNAL STUDY 001',70,1110);
 c.font='13px monospace';c.fillStyle='#596eaa';c.fillText('ORIGINAL GENERATIVE INPUT',70,1140);
}
drawDemo(0);source=demo;
let userPresets=[];
try{const saved=readPresets(localStorage);userPresets=saved.presets;if(saved.warning)note('Some local preset storage is unavailable. Existing saved looks are preserved.');else if(saved.migrated)note('Saved looks migrated to Pixel Pusher. Originals preserved.');}catch{note('Local preset storage is unavailable. Exports still work.');}
function updatePresets(){
 const s=$('preset');s.replaceChildren();
 const custom=node('option',null,'Custom look');custom.value='custom';s.append(custom);
 for(const [i,p]of PRESETS.entries()){const o=node('option',null,p.name);o.value='built:'+i;s.append(o);}
 for(const [i,p]of userPresets.entries()){const o=node('option',null,p.name+' / saved');o.value='user:'+i;s.append(o);}
 s.value='custom';
}
function renderStack(){
 const wrap=$('stack');wrap.replaceChildren();
 stack.forEach((effect,i)=>{
  const def=EFFECTS.find(e=>e.id===effect.id),card=node('article','effect'+(effect.enabled?' on':'')+(selected===effect.id?' selected':''));card.dataset.effect=effect.id;
  const head=node('div','effect-head'),toggle=node('button','effect-toggle',effect.enabled?'ON':'OFF');toggle.setAttribute('aria-label','Enable '+def.name);toggle.setAttribute('aria-pressed',String(effect.enabled));
  toggle.addEventListener('click',()=>{effect.enabled=!effect.enabled;performanceUI?.externalChange();$('preset').value='custom';renderStack();});
  const title=node('button','effect-title',def.name);title.append(node('small',null,def.tag));title.setAttribute('aria-expanded',String(selected===effect.id));title.addEventListener('click',()=>{selected=selected===effect.id?null:effect.id;renderStack();});
  const up=node('button','move','↑'),down=node('button','move','↓');up.setAttribute('aria-label','Move '+def.name+' up');down.setAttribute('aria-label','Move '+def.name+' down');up.disabled=i===0;down.disabled=i===stack.length-1;
  up.addEventListener('click',()=>{stack=moveEffect(stack,i,-1);$('preset').value='custom';renderer.clearHistory();renderStack();});down.addEventListener('click',()=>{stack=moveEffect(stack,i,1);$('preset').value='custom';renderer.clearHistory();renderStack();});const lock=node('button','lock-effect',effect.locked?'LOCK':'FREE');lock.setAttribute('aria-label','Lock '+def.name+' for shuffle');lock.setAttribute('aria-pressed',String(effect.locked));lock.addEventListener('click',()=>{effect.locked=!effect.locked;renderStack();});head.append(toggle,title,lock,up,down);card.append(head);
  if(selected===effect.id){
   const controls=node('div','effect-controls');
   const intensityLabel=node('label','slider-label','Intensity'),intensityOut=node('output',null,Math.round(effect.intensity*100)+'%'),intensity=node('input');intensityLabel.htmlFor=effect.id+'-intensity';intensityLabel.append(intensityOut);intensity.id=effect.id+'-intensity';intensity.type='range';intensity.min=0;intensity.max=1;intensity.step=.01;intensity.value=effect.intensity;intensity.addEventListener('input',()=>{effect.intensity=Number(intensity.value);intensityOut.textContent=Math.round(effect.intensity*100)+'%';$('preset').value='custom';});controls.append(intensityLabel,intensity);
   const pad=node('div','xy-pad','XY / touch or arrow keys');pad.tabIndex=0;pad.setAttribute('role','group');pad.setAttribute('aria-label',def.name+' XY touch pad');bindXY(pad,effect,syncTouchInputs);controls.append(pad);
   const mapping=node('details','touch-mapping'),summary=node('summary',null,'Touch / picture mappings'),grid=node('div','mapping-grid');mapping.append(summary,grid);
   for(const [key,name]of [['x','Finger 1 X'],['y','Finger 1 Y'],['x2','Finger 2 X'],['y2','Finger 2 Y'],['pinch','Pinch'],['twist','Twist']]){const label=node('label','field',name),select=node('select','touch-map-'+key);select.setAttribute('aria-label',def.name+' '+name);for(const [v,label]of [[-2,'Unassigned'],[-1,'Intensity']]){const o=node('option',null,label);o.value=v;select.append(o);}def.params.forEach((p,i)=>{const o=node('option',null,p.name);o.value=i;select.append(o);});select.value=effect.touch[key];select.addEventListener('change',()=>{effect.touch[key]=Number(select.value);$('preset').value='custom';});label.append(select);grid.append(label);}
   const springLabel=node('label','toggle-line'),spring=node('input','touch-spring');spring.type='checkbox';spring.checked=effect.touch.spring;spring.addEventListener('change',()=>{effect.touch.spring=spring.checked;});springLabel.append(spring,document.createTextNode('Spring back on release'));mapping.append(springLabel);controls.append(mapping);
   if(effect.id==='smear'||effect.id==='trails'){const hold=node('button','hold-memory',effect.hold?'Release memory':'Hold memory');hold.setAttribute('aria-pressed',String(effect.hold));hold.addEventListener('click',()=>{effect.hold=!effect.hold;hold.textContent=effect.hold?'Release memory':'Hold memory';hold.setAttribute('aria-pressed',String(effect.hold));});controls.append(hold);}
   if(effect.id==='beat')controls.append(node('p','hint','Flashing light warning. Opt-in only. Audio onset or Tap tempo drives pulse timing.'));

   def.params.forEach((param,j)=>{const id=effect.id+'-'+j,label=node('label','slider-label',param.name);label.htmlFor=id;const out=node('output',null,formatParam(param,effect.values[j]));label.append(out);const input=node('input');input.type='range';input.id=id;input.min=0;input.max=param.max||1;input.step=param.step||(param.max===360?1:.01);input.value=effect.values[j]*(param.max||1);input.addEventListener('input',()=>{effect.values[j]=Number(input.value)/(param.max||1);out.textContent=formatParam(param,effect.values[j]);$('preset').value='custom';});controls.append(label,input);});
   const label=node('label','toggle-line'),input=node('input');input.type='checkbox';input.checked=effect.reactive;input.addEventListener('change',()=>{effect.reactive=input.checked;$('preset').value='custom';});label.append(input,document.createTextNode('Audio drive'));controls.append(label);
   const targetLabel=node('label','field','Audio target'),target=node('select');target.setAttribute('aria-label',def.name+' audio target');def.params.forEach((param,j)=>{const option=node('option',null,param.name);option.value=String(j);target.append(option);});target.value=String(effect.reactiveParam||0);target.addEventListener('change',()=>{effect.reactiveParam=Number(target.value);$('preset').value='custom';});targetLabel.append(target);controls.append(targetLabel);card.append(controls);
  }
  wrap.append(card);
 });
 recordView.renderQuick();performanceUI?.sync(true);editor?.refresh();
}
function syncTouchInputs(){editor?.observe('picture');performanceUI?.sync(true);performanceUI?.schedule();recordView.sync();shaderUI.sync();for(const effect of stack){const intensity=$(effect.id+'-intensity');if(intensity){intensity.value=effect.intensity;intensity.previousElementSibling.querySelector('output').textContent=Math.round(effect.intensity*100)+'%';}effect.values.forEach((v,j)=>{const input=$(effect.id+'-'+j);if(input){const param=EFFECTS.find(e=>e.id===effect.id).params[j];input.value=v*(param.max||1);const out=input.previousElementSibling?.querySelector('output');if(out)out.textContent=formatParam(param,v);}});}$('preset').value='custom';}
const picture=new PictureController(canvas,$('touch-overlay'),{getEffects:()=>[...stack,shaderUI.state,...(performanceUI?.groups||[])].filter(e=>$('touch-multi').checked?e.enabled:e.id===selected),onChange:syncTouchInputs,onFreeze:value=>{if(renderer)renderer.freeze=value;},onStutter:()=>{if(renderer)renderer.stutterUntil=performance.now()+160;},status:$('touch-status')});
const recordView=new RecordView(()=>[...stack,shaderUI.state,...(performanceUI?.groups||[])],syncTouchInputs);
const shaderUI=new ShaderUI($('panel-shader'),{onChange:()=>{editor?.observe();$('preset').value='custom';recordView.renderQuick();if(!consoleMutation)performanceUI?.externalChange();},onTarget:()=>{selected='shader';renderStack();}});
performanceUI=new PerformanceConsole($('performance-dock'),{getModel:()=>({stack,shader:shaderUI.state}),getTarget:()=>selected,setShader:s=>{consoleMutation=true;try{shaderUI.setState(s);}finally{consoleMutation=false;}},onChange:reason=>{editor?.observe();shaderUI.sync();if(selected?.startsWith('group:')&&!performanceUI.groups.some(g=>g.id===selected))selected=stack.find(e=>e.enabled)?.id||'rgb';if(['toggle','structure','scene'].includes(reason))renderStack();else syncTouchInputs();$('preset').value='custom';},onTarget:(id,render=true)=>{selected=id;if(render)renderStack();},onStudio:tab=>{editor?.setPro(true);document.body.classList.add('studio-open');$('studio-toggle').setAttribute('aria-pressed','true');if(recordView.recording&&recordView.view==='full')recordView.open(true);showTab(tab);},note,cancelPicture:()=>picture.cancel()});
$('studio-toggle').addEventListener('click',()=>{const open=!document.body.classList.contains('studio-open');document.body.classList.toggle('studio-open',open);$('studio-toggle').setAttribute('aria-pressed',String(open));});
const shaderBands={low:0,mid:0,high:0,beat:0,bpm:120,phase:0};
function showTab(tab){if(tab==='shader'){selected='shader';renderStack();}else if(tab==='stack'&&selected==='shader'){selected=stack.find(e=>e.enabled)?.id||'rgb';renderStack();}document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));for(const name of ['stack','shader','audio','export'])$('panel-'+name).hidden=name!==tab;}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
function setCompare(value){compare=value;$('compare').setAttribute('aria-pressed',String(value));$('live-label').textContent=value?'ORIGINAL / BYPASS':'LIVE PROCESSING';}
$('compare').addEventListener('pointerdown',e=>{e.preventDefault();$('compare').setPointerCapture(e.pointerId);setCompare(true);});for(const e of ['pointerup','pointercancel','lostpointercapture'])$('compare').addEventListener(e,()=>setCompare(false));
$('compare').addEventListener('contextmenu',e=>e.preventDefault());$('compare').addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();setCompare(true);}});$('compare').addEventListener('keyup',()=>setCompare(false));$('compare').addEventListener('blur',()=>setCompare(false));window.addEventListener('blur',()=>setCompare(false));
$('preset').addEventListener('change',()=>{const selection=$('preset').value,[type,index]=selection.split(':');const preset=type==='built'?PRESETS[Number(index)]:userPresets[Number(index)];if(preset){picture.cancel();stack=sanitizeStack(preset.stack);shaderUI.setState(preset.shader);performanceUI.loadPreset(preset.console);renderer.clearHistory();renderStack();$('preset').value=selection;note(preset.name+' loaded.');}});
$('randomize').addEventListener('click',()=>{performanceUI.externalChange();stack=randomizeStack(stack);renderer.clearHistory();$('preset').value='custom';renderStack();note('New signal chain generated.');});
$('reset').addEventListener('click',()=>{picture.cancel();performanceUI.reset();stack=defaultStack().map(e=>({...e,enabled:false,reactive:false}));shaderUI.setState();renderer.clearHistory();$('preset').value='custom';renderStack();note('All effects bypassed. Your source is unchanged.');});
$('save-preset').addEventListener('click',safe(()=>{if(userPresets.length>=20)throw new Error('20 saved looks reached. Existing looks are preserved.');const name=$('preset-name').value.trim();if(!name)throw new Error('Give this look a name first.');const preset=normalizePreset({name,stack,shader:shaderUI.state,console:performanceUI.getPresetState()});const next=[...userPresets,preset];localStorage.setItem(KEY,serializePresets(next));userPresets=next;updatePresets();$('preset').value='user:'+(userPresets.length-1);$('preset-name').value='';note('Look saved on this device.');}));
function stopCamera(){if(camera){camera.getTracks().forEach(t=>t.stop());camera=null;}$('flip').disabled=true;$('camera').textContent='Camera';}
function releaseSource(){stopCamera();video.pause();video.srcObject=null;video.removeAttribute('src');video.load();if(sourceURL){URL.revokeObjectURL(sourceURL);sourceURL=null;}$('play').hidden=true;}
function sourceLabel(text){$('source-name').textContent=text;renderer.clearHistory();}
function syncSourceButtons(){const busy=capture.active||sourceBusy;$('file').disabled=busy;$('photo').disabled=busy;$('camera').disabled=busy;$('flip').disabled=busy||!camera;$('photo-loop').disabled=busy||sourceKind==='video'||sourceKind==='camera';$('play').disabled=capture.active;}
async function importMedia(input){
 const file=input.files[0];if(!file)return;if(capture.active||sourceBusy)return;
 if(file.size>1024*1024*1024)throw new Error('Choose a source smaller than 1 GB for mobile safety.');
 const kind=fileKind(file);if(!kind)throw new Error('Choose a photo or video supported by this browser.');
 sourceBusy=true;syncSourceButtons();
 let url=null,photo=null;
 try{
  if(kind==='image'){
   photo=await decodePhoto(file,renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE));
   releaseSource();source=photo.source;sourceKind='image';
   if(audio.mode==='video'||audio.mode==='mix'){await audio.configure(audio.mode==='mix'?'mic':'none');$('audio-source').value=audio.mode;}
  }else{
   url=URL.createObjectURL(file);releaseSource();sourceKind='video';sourceURL=url;video.src=url;video.muted=!(audio.mode==='video'||audio.mode==='mix');
   await new Promise((resolve,reject)=>{const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error('Video codec not supported. Try an H.264 MP4.'));},timer=setTimeout(()=>{cleanup();reject(new Error('Video loading timed out. Choose a smaller clip.'));},15000);function cleanup(){clearTimeout(timer);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);}video.addEventListener('loadeddata',ok,{once:true});video.addEventListener('error',bad,{once:true});});
   if(video.videoWidth>8192||video.videoHeight>8192)throw new Error('Video resolution is too high. Use a smaller clip.');
   source=video;await video.play();$('play').hidden=false;$('play').textContent='Pause clip';
  }
  sourceLabel(file.name);note('Local '+(sourceKind==='image'?'photo':'video')+' loaded.'+(photo&&(photo.originalWidth!==photo.width||photo.originalHeight!==photo.height)?' Resized to '+photo.width+' × '+photo.height+' for mobile safety.':'')+' Nothing was uploaded.');
 }catch(error){if(url)URL.revokeObjectURL(url);releaseSource();source=demo;sourceKind='demo';sourceLabel('Demo signal');throw error;}
 finally{sourceBusy=false;input.value='';syncSourceButtons();editor?.reset();}
}
for(const id of ['file','photo'])$(id).addEventListener('change',safe(()=>importMedia($(id))));
async function openCamera(){
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera needs HTTPS (or localhost) and browser permission.');
 sourceBusy=true;syncSourceButtons();
 try{
  stopCamera();const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});
  if(document.hidden){stream.getTracks().forEach(t=>t.stop());throw new Error('Camera request cancelled because the app is hidden.');}
  releaseSource();camera=stream;sourceKind='camera';video.srcObject=stream;video.muted=true;await video.play();source=video;
  if(audio.mode==='video'||audio.mode==='mix'){await audio.configure(audio.mode==='mix'?'mic':'none');$('audio-source').value=audio.mode;}
  $('camera').textContent='Stop cam';sourceLabel('CAMERA / '+(facing==='user'?'FRONT':'REAR'));note('Camera active on this device only. Select microphone separately if wanted.');
 }catch(error){releaseSource();source=demo;sourceKind='demo';sourceLabel('Demo signal');throw error;}
 finally{sourceBusy=false;syncSourceButtons();editor?.reset();}
}
$('camera').addEventListener('click',safe(async()=>{if(camera){releaseSource();source=demo;sourceKind='demo';sourceLabel('Demo signal');syncSourceButtons();editor?.reset();note('Camera stopped.');}else await openCamera();}));
$('flip').addEventListener('click',safe(async()=>{facing=facing==='environment'?'user':'environment';await openCamera();}));
$('play').addEventListener('click',safe(async()=>{if(video.paused){await video.play();$('play').textContent='Pause clip';}else{video.pause();$('play').textContent='Play clip';}}));
$('audio-source').addEventListener('change',safe(async()=>{
 const select=$('audio-source'),mode=select.value;
 select.disabled=true;
 try{if((mode==='video'||mode==='mix')&&sourceKind!=='video')throw new Error('Import a video before selecting its audio.');await audio.configure(mode);$('audio-status').textContent=mode==='none'?'Audio off. Microphone stopped.':mode==='mic'||mode==='mix'?'Microphone active. On-device only.':'Clip audio selected. Silent source clips remain silent.';note('Audio routing: '+select.selectedOptions[0].textContent+'.');}
 catch(e){await audio.configure('none');select.value='none';throw e;}
 finally{select.disabled=false;}
}));
$('reactive').addEventListener('change',()=>{reactive=$('reactive').checked;if(reactive&&!stack.some(e=>e.reactive)){const first=stack.find(e=>e.enabled)||stack[0];first.reactive=true;renderStack();}note(reactive?'Audio drive enabled. Mark layers in the stack; select mic or clip audio to feed them.':'Audio-driven motion off. Recording audio routing is unchanged.');});
$('sensitivity').addEventListener('input',()=>{sensitivity=Number($('sensitivity').value);$('sensitivity-value').textContent=sensitivity.toFixed(2)+'×';});
$('mute-monitor').addEventListener('click',()=>{audio.monitorClip(!audio.monitor);$('mute-monitor').textContent='Clip monitor: '+(audio.monitor?'on':'off');});
function resize(reset=true){if(reset)quality.reset();const short=Math.max(216,Math.round(Number($('quality').value)*quality.scale)),aspect=$('aspect').value;const [w,h]=aspect==='portrait'?[short,Math.round(short*16/9)]:aspect==='landscape'?[Math.round(short*16/9),short]:[short,short];renderer.resize(w,h);$('dimensions').textContent=w+' × '+h;}
for(const id of ['quality','aspect'])$(id).addEventListener('change',safe(()=>resize()));
function recordingUI(active){
 picture.cancel();recordView.setActive(active);
 $('record').classList.toggle('active',active);$('record-text').textContent=active?'Stop recording':'Record video';$('record-badge').hidden=!active;
 for(const id of ['quality','aspect','limit','loop-duration','audio-source','auto-quality'])$(id).disabled=active;
 syncSourceButtons();editor?.refresh();
}
async function keepAwake(){try{wakeLock=await navigator.wakeLock?.request('screen');}catch{/* Optional; visibility handling still stops safely. */}}
function releaseWake(){wakeLock?.release().catch(()=>{});wakeLock=null;}
function timeLabel(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(Math.floor(seconds%60)).padStart(2,'0');}
function addExport(blob,kind,description){
 const ext=kind==='png'?'png':blob.type.includes('mp4')?'mp4':'webm',name='pixelpusher-'+new Date().toISOString().replace(/[-:]/g,'').replace('T','-').replace(/\.\d+Z$/,'Z')+'.'+ext,url=URL.createObjectURL(blob);
 const item=node('div','export-item'),info=node('p',null,description+' · '+(blob.size/1048576).toFixed(2)+' MB'),link=node('a',null,'Save '+ext.toUpperCase());link.href=url;link.download=name;link.target='_blank';link.rel='noopener';
 item.append(info,link);const file=new File([blob],name,{type:blob.type});
 if(navigator.canShare?.({files:[file]})){const share=node('button',null,'Save / share');share.addEventListener('click',safe(async()=>{try{await navigator.share({files:[file],title:'Pixel Pusher export'});}catch(e){if(e.name!=='AbortError')throw e;}}));item.append(share);}
 $('no-exports')?.remove();$('exports').prepend(item);exports.push({url,blob,file,name,description});editor?.exportReady();
 note(description+' ready in Output. Save it before closing.');
}
const capture=new Capture(canvas,{
 onTick:(seconds)=>{$('elapsed').textContent=timeLabel(seconds);$('touch-timer').textContent=timeLabel(seconds);$('recordbar-timer').textContent=timeLabel(seconds);},
 onFinish:({blob,duration,reason})=>{loopStart=null;releaseWake();recordingUI(false);addExport(blob,'video',(recordKind==='loop'?'Photo loop':'Video')+' / '+duration.toFixed(1)+'s / '+reason);showTab('export');},
 onError:error=>{loopStart=null;releaseWake();recordingUI(false);note(error.message,true);}
});
async function startRecording(kind='video'){
 if(exports.length>=8)throw new Error('8 exports are held in memory. Save them and reload before making more.');
 if(sourceBusy)throw new Error('Wait for your source to finish loading.');
 if(audio.mode!=='none')await audio.ensure();
 if(sourceKind==='video'){if(video.ended)video.currentTime=0;await video.play();}
 recordKind=kind;const seconds=kind==='loop'?Number($('loop-duration').value):normalizeLimit($('limit').value);$('limit').value=normalizeLimit($('limit').value);
 if(kind==='loop'){loopLength=seconds;loopStart=performance.now();}
 try{const mime=capture.start({audioTracks:audio.tracks(),seconds});$('format').textContent=mime.split(';')[0].toUpperCase();$('elapsed').textContent='00:00';$('touch-timer').textContent='00:00';$('recordbar-timer').textContent='00:00';recordingUI(true);keepAwake();note('Recording on-device. Keep this app visible; '+seconds+'s limit.');}
 catch(error){loopStart=null;throw error;}
}
$('stop-touch').addEventListener('click',()=>capture.stop());
$('record').addEventListener('click',safe(async()=>{if(capture.active)capture.stop();else await startRecording();}));
$('photo-loop').addEventListener('click',safe(async()=>{if(sourceKind==='video'||sourceKind==='camera')throw new Error('Import a still photo first.');if(!shaderUI.state.enabled&&!stack.some(e=>e.enabled))throw new Error('Enable an effect or choose a look first.');await startRecording('loop');}));
$('snapshot').addEventListener('click',safe(async()=>{if(exports.length>=8)throw new Error('Save existing exports and reload before adding more.');const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Snapshot failed. Try a lower output size.');addExport(blob,'png','PNG / '+canvas.width+' × '+canvas.height);showTab('export');}));
document.addEventListener('visibilitychange',()=>{if(document.hidden){capture.stop('app hidden');setCompare(false);if(camera){releaseSource();source=demo;sourceKind='demo';sourceLabel('Demo signal');syncSourceButtons();editor?.reset();}audio.stopMic();if(audio.mode==='mic'||audio.mode==='mix'){audio.configure('none').catch(()=>{});$('audio-source').value='none';$('audio-status').textContent='Microphone stopped while app was hidden. Select it again to resume.';}}});
window.addEventListener('pagehide',()=>{capture.stop('page closed');stopCamera();audio.stopMic();releaseWake();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();capture.stop('GPU interrupted');renderFailed=true;note('Graphics context lost. Waiting for recovery; try a lower output size.',true);});
canvas.addEventListener('webglcontextrestored',safe(()=>{renderer=new Renderer(canvas);resize();renderFailed=false;note('Graphics recovered. Previous take was stopped safely.');}));
$('privacy').addEventListener('click',()=>$('privacy-dialog').showModal());$('close-privacy').addEventListener('click',()=>$('privacy-dialog').close());
$('tap-tempo').addEventListener('click',()=>{beatClock.tap(performance.now());$('bpm').textContent=Math.round(beatClock.bpm)+' BPM / tap';});
$('auto-tempo').addEventListener('click',()=>{beatClock.manual=false;$('bpm').textContent='Audio onset / auto';});
$('auto-quality').addEventListener('change',()=>{quality.reset();resize(false);});
function frame(now){
 requestAnimationFrame(frame);if(renderFailed||document.hidden)return;const interval=lastFrame?now-lastFrame:16;lastFrame=now;
 const level=audio.level(sensitivity);$('meter').value=level;const pulse=beatClock.update(level,now);
 let time=now/1000,animation=0;
 if(loopStart!==null){const phase=Math.min(1,(now-loopStart)/(loopLength*1000));time=phase*Math.PI*2;animation=Math.sin(phase*Math.PI*2);}
 if(sourceKind==='demo')drawDemo(time);
 try{if($('auto-quality').checked&&quality.update(Math.max(lastRenderMs,interval),capture.active||picture.points.size>0||drawing.active!==null||sourceBusy))resize(false);const start=performance.now();Object.assign(shaderBands,audio.bands(sensitivity),{beat:pulse,bpm:beatClock.bpm,phase:beatClock.phase});const composed=performanceUI.engine.compose({stack,shader:shaderUI.state},time,shaderBands,now);performanceUI.sync(false,now);const ink=compare?null:drawing.frame(canvas.width,canvas.height,now/1000,shaderBands);drawingUI?.sync(false,now);previewGauges?.sync(now);let layered=compare||renderer.freeze?source:shaderUI.layer.render(source,composed.shader,time,{width:canvas.width,height:canvas.height,bands:shaderBands,frameMs:frameAverage});if(ink&&drawing.model.settings.placement==='under')layered=drawing.composite(layered,canvas.width,canvas.height);renderer.render(layered,composed.stack,time,compare,{audio:reactive?level:0,animation,beat:pulse,phase:beatClock.phase,ink:ink&&drawing.model.settings.placement==='top'?ink:null,inkOpacity:drawing.opacity});const duration=performance.now()-start;lastRenderMs=duration;frameAverage=frameAverage*.94+Math.max(duration,interval)*.06;if(now-lastMeasured>1000){lastMeasured=now;document.body.classList.toggle('low-ui-quality',lowMaterialQuality(document.body.classList.contains('low-ui-quality'),frameAverage,quality.scale));shaderUI.status();$('perf-status').textContent=Math.round(frameAverage)+' ms / '+Math.round(quality.scale*100)+'% resolution'+(capture.active?' · capture locked':' · adaptive preview');}}catch(error){renderFailed=true;capture.stop('render interrupted');note('Rendering stopped: '+error.message,true);}
}
try{renderer=new Renderer(canvas);$('engine').textContent='WEBGL '+renderer.version;updatePresets();renderStack();requestAnimationFrame(frame);try{$('format').textContent=recordingMime().split(';')[0].toUpperCase();}catch{$('format').textContent='PNG ONLY';}}
catch(error){renderFailed=true;note(error.message,true);$('record').disabled=true;$('snapshot').disabled=true;}
document.querySelector('.editor-kicker').insertBefore($('pro-toggle'),$('studio-settings'));
$('source-name').textContent='Demo signal';$('live-label').textContent='Preview';
previewGauges=new PreviewGauges($('preview-gauges'),()=>{const e=selected==='shader'?shaderUI.state:performanceUI.reference(selected),def=EFFECTS.find(d=>d.id===selected),g=performanceUI.groups.find(d=>d.id===selected);if(!e)return null;const index=g||selected==='mirror'?1:0;return {name:g?.name||def?.name||'Shader',enabled:e.enabled,intensity:g?e.values[0]:e.intensity,value:e.values?.[index]??.5,param:g?'Axis X':def?.params[index]?.name||e.params?.[index]?.name||'Geometry'};});
document.addEventListener('drawing-change',()=>editor?.refresh());
drawingUI=new DrawingUI(drawing,canvas,{cancelPicture:()=>picture.cancel(),closeParameters:()=>performanceUI.closePanel(),note});
editor=new EditorController({canvas,console:performanceUI,note,recording:()=>capture.active,loading:()=>sourceBusy,
 read:()=>({data:{stack,shader:shaderUI.state,console:performanceUI.getPresetState()},source,sourceKind,label:$('source-name').textContent}),
 restore:s=>{picture.cancel();if(source!==s.source){inkSources.set(source,drawing.snapshot());drawing.restore(inkSources.get(s.source)||{strokes:[],settings:drawing.model.settings});}source=s.source;sourceKind=s.sourceKind;stack=sanitizeStack(s.data.stack);shaderUI.setState(s.data.shader);performanceUI.loadPreset(s.data.console);selected=stack.find(e=>e.enabled)?.id||'rgb';sourceLabel(s.label);renderStack();syncSourceButtons();drawingUI?.sync(true);},
 canBake:()=>sourceKind==='image'&&!sourceBusy&&!capture.active&&(drawing.model.hasInk||shaderUI.state.enabled||stack.some(e=>e.enabled)),
 bake:async()=>{if(sourceKind!=='image')throw new Error('Import a photo to Apply / bake. Use Record for video.');if(capture.active||sourceBusy)throw new Error('Stop recording or wait for loading before baking a photo.');drawing.finish();inkSources.set(source,drawing.snapshot());sourceBusy=true;syncSourceButtons();try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const baked=document.createElement('canvas');baked.width=canvas.width;baked.height=canvas.height;const c=baked.getContext('2d');if(!c)throw new Error('Photo memory is unavailable. Try a smaller output size.');c.drawImage(canvas,0,0);source=baked;drawing.restore({strokes:[],settings:drawing.model.settings});inkSources.set(baked,drawing.snapshot());stack=stack.map(e=>({...e,enabled:false,hold:false}));shaderUI.setState({...shaderUI.state,enabled:false});performanceUI.reset();sourceLabel('BAKED / '+$('source-name').textContent.replace(/^BAKED \/ /,''));renderStack();drawingUI?.sync(true);note('Photo baked at '+baked.width+' × '+baked.height+'. Undo restores the original and its effects.');}finally{sourceBusy=false;syncSourceButtons();}},
 reorder:(index,delta)=>{picture.cancel();performanceUI.externalChange();stack=moveEffect(stack,index,delta);renderer.clearHistory();renderStack();editor.observe();},getExports:()=>exports});
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(async registration=>{await navigator.serviceWorker.ready;$('offline-status').textContent='Offline shell ready · no media stored';registration.addEventListener('updatefound',()=>{$('offline-status').textContent='App update available on next launch';});}).catch(()=>{$('offline-status').textContent='Offline cache unavailable · app still works online';});}else $('offline-status').textContent='Offline install unavailable in this browser';
