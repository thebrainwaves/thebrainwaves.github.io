import {formatParam} from './effects.js';
import {EFFECTS} from './core.js';
const $=id=>document.getElementById(id),KEY='brainhertz.pixelpusher.recordView.v1';
export class RecordView{
 constructor(getStack,onChange){this.getStack=getStack;this.onChange=onChange;this.recording=false;this.slots=[];this.view='box';try{if(localStorage.getItem(KEY)==='full')this.view='full';}catch{/* Default remains in-box if storage is unavailable. */}
  for(const view of ['box','full'])$('view-'+view).addEventListener('click',()=>this.setView(view));let start=0,swiped=false;
  $('drawer-toggle').addEventListener('pointerdown',e=>{start=e.clientY;swiped=false;});$('drawer-toggle').addEventListener('pointerup',e=>{if(Math.abs(e.clientY-start)>24){swiped=true;this.open(e.clientY<start);}});$('drawer-toggle').addEventListener('click',()=>{if(!swiped)this.open($('record-drawer').dataset.open!=='true');swiped=false;});this.setView(this.view,false);
 }
 setView(view,persist=true){this.view=view==='full'?'full':'box';for(const name of ['box','full'])$('view-'+name).setAttribute('aria-pressed',String(this.view===name));if(persist)try{localStorage.setItem(KEY,this.view);}catch{/* Choice still works for this launch. */}this.layout();}
 setActive(value){this.recording=value;document.body.classList.toggle('recording-mode',value);$('recordbar-timer').hidden=!value;this.layout();}
 layout(){const full=this.recording&&this.view==='full';document.documentElement.classList.toggle('recording-in-box',this.recording&&!full);document.body.classList.toggle('recording-fullscreen',full);$('stop-touch').hidden=!full;$('record-drawer').hidden=!full;
  if(full&&!this.slots.length){for(const selector of ['.presetbar','.tabs','#panel-stack','#panel-shader','#panel-audio','#panel-export','#notice']){const node=document.querySelector(selector),placeholder=document.createComment('record controls home');node.replaceWith(placeholder);this.slots.push({node,placeholder});$('record-controls').append(node);}this.open(true);this.renderQuick();}
  if(!full&&this.slots.length){for(const {node,placeholder}of this.slots)placeholder.replaceWith(node);this.slots=[];}
 }
 open(value){$('record-drawer').dataset.open=String(value);$('drawer-toggle').setAttribute('aria-expanded',String(value));$('drawer-toggle').textContent=value?'Controls · pull down':'Controls · pull up';}
 renderQuick(){
  const wrap=$('record-quick');wrap.replaceChildren();
  for(const effect of this.getStack().filter(e=>e.enabled)){
   const def=effect.params?{name:effect.kind==='group'?effect.name:'Shader layer',params:effect.params}:EFFECTS.find(d=>d.id===effect.id);if(!def)continue;
   const index=effect.id==='mirror'?1:0,param=def.params[index],scale=param.max||1;
   const label=document.createElement('label'),span=document.createElement('span'),input=document.createElement('input');
   span.textContent=def.name+' / '+param.name;input.type='range';input.min=0;input.max=scale;input.step=param.step||(scale===360?1:.01);input.value=effect.values[index]*scale;input.id='quick-'+effect.id+'-'+index;input.setAttribute('aria-label',def.name+' quick '+param.name);
   input.addEventListener('input',()=>{effect.values[index]=Number(input.value)/scale;if(effect.id==='hue'||effect.id==='mirror')span.textContent=def.name+' / '+param.name+' · '+formatParam(param,effect.values[index]);this.onChange();});label.append(span,input);wrap.append(label);
  }
  if(!wrap.childElementCount){const text=document.createElement('p');text.textContent='Enable layers in Stack for quick controls.';wrap.append(text);}
 }
 sync(){for(const e of this.getStack()){const index=e.id==='mirror'?1:0,input=$('quick-'+e.id+'-'+index),param=e.params?.[index]||EFFECTS.find(d=>d.id===e.id)?.params[index];if(input)input.value=e.values[index]*(param?.max||1);}}
}
