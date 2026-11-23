(async()=>{'use strict';const $=id=>document.getElementById(id);let rows;
try{const r=await fetch('/rba-minutes/assets/data.json');if(!r.ok)throw Error(r.status);rows=(await r.json()).meetings}catch(e){$('count-summary').textContent='The chart could not load. Please use the CSV download below.';return}
const date=d=>new Date(d+'T00:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}),num=n=>n.toLocaleString('en-AU');let selected=rows.length-1;
$('minutes-rows').innerHTML=rows.map(r=>`<tr><td>${date(r.date)}</td><td>${num(r.words)}</td><td>${num(r.policy_words)}</td><td><a href="${r.source}">RBA minutes</a></td></tr>`).join('');
function render(){const key=$('count-mode').value,w=Math.max(320,$('minutes-chart').clientWidth),h=380,L=55,R=20,T=20,B=45,max=Math.ceil(Math.max(...rows.map(r=>r[key]))/1000)*1000,t0=Date.parse(rows[0].date),t1=Date.parse(rows.at(-1).date),x=r=>L+(Date.parse(r.date)-t0)/(t1-t0)*(w-L-R),y=v=>h-B-v/max*(h-T-B);
const first=rows[0][key],last=rows.at(-1)[key],change=(last/first-1)*100;
$('count-title').textContent=key==='words'?'Full minutes: words per meeting':'Policy deliberations and decision: words per meeting';$('count-summary').textContent=`Latest: ${num(last)} words · ${change>=0?'+':''}${change.toFixed(1)}% since ${date(rows[0].date)} · Average: ${num(Math.round(rows.reduce((s,r)=>s+r[key],0)/rows.length))} words`;
let svg=`<svg viewBox="0 0 ${w} ${h}" style="display:block;width:100%;height:auto;touch-action:pan-y" aria-hidden="true">`;
for(let i=0;i<=5;i++){let v=max*i/5;svg+=`<line x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}" stroke="#dce5df"/><text x="${L-8}" y="${y(v)+4}" font-size="12" text-anchor="end" fill="#526358">${num(v)}</text>`}
const ticks=w<600?[0,8,16]:[0,4,8,12,16];for(const i of ticks){svg+=`<text x="${x(rows[i])}" y="${h-15}" font-size="12" text-anchor="${i===0?'start':i===16?'end':'middle'}" fill="#526358">${date(rows[i].date).replace(/^\d+ /,'')}</text>`}
svg+=`<polyline points="${rows.map(r=>x(r)+','+y(r[key])).join(' ')}" fill="none" stroke="#27664c" stroke-width="2.5"/>`;
svg+=rows.map((r,i)=>`<circle cx="${x(r)}" cy="${y(r[key])}" r="${selected===i?6:4}" fill="${selected===i?'#a34829':'#27664c'}"><title>${date(r.date)}: ${num(r[key])} words</title></circle>`).join('')+'</svg>';$('minutes-chart').innerHTML=svg;
const chosen=rows[selected];$('minutes-readout').innerHTML=`<strong>${date(chosen.date)}: ${num(chosen[key])} words</strong> · <a href="${chosen.source}">Read these minutes</a>`;
$('minutes-chart').onpointermove=$('minutes-chart').onpointerdown=e=>{const b=$('minutes-chart').getBoundingClientRect(),px=(e.clientX-b.left)*w/b.width;let best=0;rows.forEach((r,i)=>{if(Math.abs(x(r)-px)<Math.abs(x(rows[best])-px))best=i});if(best!==selected){selected=best;render()}};
$('minutes-chart').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();selected=e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,selected+(e.key==='ArrowRight'?1:-1)));render()};
}
$('count-mode').addEventListener('change',render);new ResizeObserver(render).observe($('minutes-chart'));render();})();
