// UI-only materials. No canvas drawing, network, or animation loop.
export function lowMaterialQuality(previousLow, frameMs, scale) {
  if (frameMs > 34 || scale < 0.85) return true;
  return !!previousLow && (frameMs > 24 || scale < 0.95);
}
let gaugeId = 0;
export function valueGauge(label) {
  const ns = 'http://www.w3.org/2000/svg';
  const make = (name, attrs = {}) => {
    const n = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const node = document.createElement('span');
  node.className = 'value-gauge';
  node.setAttribute('role', 'img');
  const svg = make('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
  const defs = make('defs'), id = 'pp-value-' + ++gaugeId;
  const gradient = make('linearGradient', {id, x1:'0%', y1:'0%', x2:'100%', y2:'100%'});
  for (const [offset,color] of [['0%','#8658e9'],['58%','#703879'],['100%','#ef4b52']])
    gradient.append(make('stop', {offset,'stop-color':color}));
  defs.append(gradient);
  const track = make('circle', {cx:32,cy:32,r:25,class:'gauge-track'});
  const arc = make('circle', {cx:32,cy:32,r:25,class:'gauge-arc',pathLength:100,stroke:'url(#'+id+')',transform:'rotate(-90 32 32)'});
  svg.append(defs,track,arc);
  const number = document.createElement('span');
  number.className = 'gauge-number';
  node.append(svg,number);
  let previous = -1;
  return {node, update(value) {
    const n = Math.round(Math.max(0,Math.min(1,Number.isFinite(value)?value:0))*100);
    if(n===previous)return;
    previous=n;
    arc.setAttribute('stroke-dasharray', n+' 100');
    arc.setAttribute('opacity', n===0?'0':'1');
    number.textContent=String(n);
    node.setAttribute('aria-label',label+' '+n+'%');
    node.title=label+' '+n+'%';
  }};
}
