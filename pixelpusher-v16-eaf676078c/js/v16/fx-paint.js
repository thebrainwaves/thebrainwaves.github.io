// FX Brush: finger-painted effect regions. Strokes are normalized vectors; masks are alpha canvases.
export const MAX_FX_STROKES=200,MAX_FX_POINTS=512,MAX_FX_EFFECTS=6;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(n)?n:a));
export class FxPaint{
 constructor(){this.strokes=[];this.current=null;this.revision=0;this.cache=new Map();this.size=[0,0];this.rendered=-1;}
 begin(fx,x,y,{size=40,strength=1,erase=false}={}){this.end();this.seq=(this.seq||0)+1;this.current={id:this.seq,fx:erase?'*':String(fx),size:clamp(size,4,200),strength:clamp(strength),points:[[clamp(x),clamp(y)]]};this.revision++;}
 point(x,y){const c=this.current;if(!c)return;if(c.points.length>=MAX_FX_POINTS)c.points=c.points.filter((_,i)=>i%2===0);c.points.push([clamp(x),clamp(y)]);this.revision++;}
 end(){if(!this.current)return false;this.strokes.push(this.current);if(this.strokes.length>MAX_FX_STROKES)this.strokes.shift();this.current=null;this.revision++;return true;}
 set(strokes){this.current=null;this.strokes=strokes.slice();this.revision++;}
 clear(){this.current=null;this.strokes=[];this.revision++;}
 // Distinct painted effects in first-use order (erase strokes excluded), capped.
 effects(){const ids=[];for(const s of [...this.strokes,...(this.current?[this.current]:[])])if(s.fx!=='*'&&!ids.includes(s.fx))ids.push(s.fx);return ids.slice(0,MAX_FX_EFFECTS);}
 get hasPaint(){return this.effects().length>0;}
 masks(w,h){
  const ids=this.effects();if(!ids.length)return [];
  const mw=Math.max(2,Math.round(w/2)),mh=Math.max(2,Math.round(h/2)),resized=mw!==this.size[0]||mh!==this.size[1];
  if(resized||this.rendered!==this.revision){this.size=[mw,mh];
   const all=[...this.strokes,...(this.current?[this.current]:[])],unit=Math.min(mw,mh)/360;
   for(const id of ids){let c=this.cache.get(id);if(!c){c=document.createElement('canvas');this.cache.set(id,c);}if(c.width!==mw||c.height!==mh){c.width=mw;c.height=mh;}
    const x=c.getContext('2d');x.clearRect(0,0,mw,mh);x.lineCap='round';x.lineJoin='round';
    for(const s of all){if(s.fx!==id&&s.fx!=='*')continue;x.globalCompositeOperation=s.fx==='*'?'destination-out':'source-over';x.globalAlpha=s.fx==='*'?1:s.strength;x.strokeStyle=x.fillStyle='#fff';x.shadowColor='#fff';x.shadowBlur=s.size*unit*.35;x.lineWidth=s.size*unit;
     x.beginPath();const [p0x,p0y]=s.points[0];x.moveTo(p0x*mw,p0y*mh);if(s.points.length===1)x.lineTo(p0x*mw+.1,p0y*mh);for(let i=1;i<s.points.length;i++)x.lineTo(s.points[i][0]*mw,s.points[i][1]*mh);x.stroke();}
    c.fxRevision=this.revision;}
   for(const id of [...this.cache.keys()])if(!ids.includes(id))this.cache.delete(id);
   this.rendered=this.revision;}
  return ids.map(id=>({id,canvas:this.cache.get(id),revision:this.revision}));
 }
}
