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
 open(value){$('record-drawer').dataset.open=String(value);$('drawer-toggle').setAttribute('aria-expanded',String(value));$('drawer-toggle').textContent=value?'⌄  Controls / pull down':'⌃  Controls / pull up';}
 renderQuick(){const wrap=$('record-quick');wrap.replaceChildren();for(const effect of this.getStack().filter(e=>e.enabled)){const def=effect.params?{name:'Shader layer',params:effect.params}:EFFECTS.find(d=>d.id===effect.id);if(!def)continue;const label=document.createElement('label'),span=document.createElement('span'),input=document.createElement('input');span.textContent=def.name+' / '+def.params[0].name;input.type='range';input.min=0;input.max=1;input.step=.01;input.value=effect.values[0];input.id='quick-'+effect.id+'-0';input.setAttribute('aria-label',def.name+' quick '+def.params[0].name);input.addEventListener('input',()=>{effect.values[0]=Number(input.value);this.onChange();});label.append(span,input);wrap.append(label);}if(!wrap.childElementCount){const text=document.createElement('p');text.textContent='Enable layers in Stack for quick controls.';wrap.append(text);}}
 sync(){for(const e of this.getStack()){const input=$('quick-'+e.id+'-0');if(input)input.value=e.values[0];}}
}
