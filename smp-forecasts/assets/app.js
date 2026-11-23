(async()=>{'use strict';
const $=id=>document.getElementById(id), colors=['#2474b5','#458ec0','#6c9ec4','#807fad','#966699','#ac5081','#be4163','#cb3543','#a91828'];
let data;try{const r=await fetch('/smp-forecasts/assets/data.json');if(!r.ok)throw Error(r.status);data=await r.json()}catch(e){$('chart-note').textContent='Chart data could not load. Reload the page or use the CSV download below.';return}
const hidden=new Set();let inspect=null,selectedQuarter=null;
const all=data.series.CPI.forecasts;all.forEach(f=>{const o=document.createElement('option');o.value=f.date;o.textContent=f.vintage;$('vintage').append(o)});
const qnum=q=>Number(q.slice(0,4))*4+Number(q.slice(-1))-1, label=q=>['Mar','Jun','Sep','Dec'][Number(q.slice(-1))-1]+' '+q.slice(0,4), fmt=x=>x==null?'—':x.toFixed(2), signed=x=>x==null?'—':(x>0?'+':'')+x.toFixed(2);
function render(){const s=data.series[$('measure').value],fs=s.forecasts.filter(f=>$('vintage').value==='all'||f.date===$('vintage').value),actual=new Map(s.actuals.map(p=>[p.quarter,p.value])),last=s.actuals.at(-1).quarter,start=Math.min(...fs.map(f=>qnum(f.anchor.quarter))),end=$('future').checked?Math.max(...fs.flatMap(f=>f.points.map(p=>qnum(p.quarter)))):Math.max(start+1,qnum(last)),ps=fs.flatMap(f=>f.points.filter(p=>qnum(p.quarter)<=end)),vals=[...s.actuals.map(p=>p.value),...ps.map(p=>p.value)];
$('chart-title').textContent=s.name;$('chart-note').textContent=s.unit+' · Actuals through '+label(last)+'. Older actuals use the September 2026 data snapshot.';
$('tooltip').hidden=true;
const width=Math.max(320,$('chart').clientWidth),height=width<600?340:420,L=48,R=18,T=22,B=48,min=Math.floor((Math.min(...vals)-.2)*2)/2,max=Math.ceil((Math.max(...vals)+.2)*2)/2,x=q=>L+(qnum(q)-start)/(end-start)*(width-L-R),y=v=>height-B-(v-min)/(max-min)*(height-T-B);
let svg=`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`;
for(let i=0;i<=5;i++){const v=min+(max-min)*i/5;svg+=`<line x1="${L}" x2="${width-R}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e7e2"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end" fill="#526358" font-size="12">${v.toFixed(1)}</text>`}
const stride=width<600?4:2;for(let n=start;n<=end;n++){if((n-start)%stride&&n!==end)continue;const q=`${Math.floor(n/4)}-Q${n%4+1}`;svg+=`<text x="${x(q)}" y="${height-18}" text-anchor="${n===start?'start':n===end?'end':'middle'}" fill="#526358" font-size="12">${label(q)}</text>`}
function line(points,color,dashed,title,id){if(!points.length)return '';return `<g data-line="${id}"${hidden.has(id)?' style="display:none"':''}><polyline points="${points.map(p=>`${x(p.quarter)},${y(p.value)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${dashed?2:3.5}" ${dashed?'stroke-dasharray="6 4"':''}/>`+points.map(p=>`<circle cx="${x(p.quarter)}" cy="${y(p.value)}" r="${dashed?3:4}" fill="${color}"><title>${title}: ${label(p.quarter)}, ${fmt(p.value)}%</title></circle>`).join('')+'</g>'}
fs.forEach(f=>svg+=line([f.anchor,...f.points].filter(p=>qnum(p.quarter)<=end),colors[all.findIndex(a=>a.date===f.date)],true,f.vintage,f.date));
svg+=line(s.actuals.filter(p=>qnum(p.quarter)>=start),'#172d25',false,'Actual','actual');
svg+=`<line id="crosshair" x1="0" x2="0" y1="${T}" y2="${height-B}" stroke="#526358" stroke-dasharray="3 3" visibility="hidden"/></svg>`;$('chart').innerHTML=svg;
const legend=[{date:'actual',vintage:'Actual'},...fs];
$('legend').innerHTML=legend.map(f=>`<button type="button" data-toggle="${f.date}" aria-pressed="${!hidden.has(f.date)}"><i class="smp-swatch" style="${f.date==='actual'?'border-top-style:solid;':''}color:${f.date==='actual'?'#172d25':colors[all.findIndex(a=>a.date===f.date)]}"></i>${f.vintage}</button>`).join('');
$('legend').querySelectorAll('button').forEach(button=>{
 const id=button.dataset.toggle;
 button.addEventListener('click',()=>{hidden.has(id)?hidden.delete(id):hidden.add(id);render();$('legend').querySelector(`[data-toggle="${id}"]`).focus()});
 const highlight=()=>{$('chart').querySelectorAll('[data-line]').forEach(g=>g.style.opacity=g.dataset.line===id?'1':'.16')};
 const restore=()=>{$('chart').querySelectorAll('[data-line]').forEach(g=>g.style.opacity='1')};
 button.addEventListener('pointerenter',highlight);button.addEventListener('pointerleave',restore);button.addEventListener('focus',highlight);button.addEventListener('blur',restore);
});
inspect=(n)=>{
 n=Math.max(start,Math.min(end,n));selectedQuarter=n;const q=`${Math.floor(n/4)}-Q${n%4+1}`;
 const entries=[];if(actual.has(q)&&!hidden.has('actual'))entries.push(['Actual',actual.get(q),false]);
 fs.filter(f=>!hidden.has(f.date)).forEach(f=>{const p=f.points.find(p=>p.quarter===q);if(p)entries.push([f.vintage,p.value,false]);else if(f.anchor.quarter===q)entries.push([f.vintage+' starting actual',f.anchor.value,true])});
 $('tooltip').innerHTML=`<strong>${label(q)}</strong>`+(entries.length?entries.map(([name,v,anchor])=>`<span>${name}: <b>${fmt(v)}%</b>${name!=='Actual'&&!anchor&&actual.has(q)?` · error ${signed(actual.get(q)-v)} pp`:''}</span>`).join(''):'<span>No published points in this quarter. Lines between dots are visual guides.</span>');
 $('tooltip').hidden=false;const cross=$('crosshair');cross.setAttribute('x1',x(q));cross.setAttribute('x2',x(q));cross.setAttribute('visibility','visible');
};
$('chart').onpointermove=$('chart').onpointerdown=event=>{const rect=$('chart').getBoundingClientRect();inspect(Math.round(start+(((event.clientX-rect.left)*width/rect.width-L)/(width-L-R))*(end-start)))};
$('chart').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();inspect(event.key==='Home'?start:event.key==='End'?end:(selectedQuarter??start)+(event.key==='ArrowRight'?1:-1))}if(event.key==='Escape'){$('tooltip').hidden=true;$('crosshair').setAttribute('visibility','hidden')}};
const rows=fs.flatMap(f=>f.points.map(p=>({f,p,a:actual.get(p.quarter)}))),errors=rows.filter(r=>r.a!=null).map(r=>r.a-r.p.value),n=errors.length,mean=n?errors.reduce((a,b)=>a+b,0)/n:null,mae=n?errors.reduce((a,b)=>a+Math.abs(b),0)/n:null;
$('scores').innerHTML=`<div><strong>${n}</strong><span>Observed forecast points</span></div><div><strong>${signed(mean)}</strong><span>Average error (pp)</span></div><div><strong>${fmt(mae)}</strong><span>Mean absolute error (pp)</span></div>`;
$('table-caption').textContent=s.name+' · all target dates for selected releases';$('values').innerHTML=rows.map(r=>`<tr><td>${r.f.vintage}</td><td>${label(r.p.quarter)}</td><td>${fmt(r.p.value)}</td><td>${fmt(r.a)}</td><td>${signed(r.a==null?null:r.a-r.p.value)}</td></tr>`).join('');
}
$('reset-lines').addEventListener('click',()=>{hidden.clear();render()});
['measure','vintage','future'].forEach(id=>$(id).addEventListener('change',render));new ResizeObserver(render).observe($('chart'));render();
})();
