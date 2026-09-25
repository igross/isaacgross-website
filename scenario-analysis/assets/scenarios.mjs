import {scenario,csv} from './scenario-engine.mjs?v=3';
import {fixedScales,axisTicks} from './scenario-scales.mjs?v=3';
import {comparison} from './model-comparison.mjs';
const $=id=>document.getElementById(id);
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,d=2)=>v===null?'Unavailable':(Math.abs(v)<.5*10**(-d)?0:v).toLocaleString('en-AU',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=v=>(v>0?'+':'')+number(v);
let references,scales,plotId=0,data,model,amounts={},result,peer,peerResult,notice='',selected=new Set(['RGDP','GDPPC','TMI','UR','CR','RHFCE','RDI']);
const rawCache={};let explorerVersion=0;

function plot(base,path,labels,published,title,{native=false,domain=null,historical=false,variable=null,otherPath=null}={}){
  const columns=innerWidth<=540?1:2;
  const cardWidth=($('chart-grid').clientWidth-(columns-1)*(innerWidth<=1100?12:18))/columns;
  const width=native?600:Math.max(210,cardWidth-(innerWidth<=540?38:innerWidth<=1100?26:34));
  const height=224,left=43,right=12,top=18,bottom=38;
  const vals=[...base,...path].filter(Number.isFinite);
  let lo=Math.min(...vals),hi=Math.max(...vals);
  const margin=Math.max((hi-lo)*.18,native?1e-7:.12);lo-=margin;hi+=margin;
  if(domain)[lo,hi]=domain;
  const clipId=`plot-clip-${++plotId}`;
  const x=i=>left+i*(width-left-right)/(labels.length-1);
  const y=v=>top+(hi-v)/(hi-lo)*(height-top-bottom);
  const pathD=a=>a.map((v,i)=>Number.isFinite(v)?`${i===0||!Number.isFinite(a[i-1])?'M':'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`:'').join(' ');
  const tick=v=>Math.abs(v)<.001&&v!==0?v.toExponential(1):v.toLocaleString('en-AU',{maximumFractionDigits:6});
  let content='';
  if(variable==='TMI'){
    const t=references.inflationTarget;
    content+=`<rect class="target-band" x="${left}" y="${y(t.upper)}" width="${width-left-right}" height="${y(t.lower)-y(t.upper)}"><title>Inflation target range: 2–3%</title></rect><line class="target-midpoint" x1="${left}" x2="${width-right}" y1="${y(t.midpoint)}" y2="${y(t.midpoint)}"><title>Target midpoint: 2.5%</title></line>`;
  }
  for(const v of axisTicks(lo,hi)){content+=`<line class="grid" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end">${tick(v)}</text>`;}
  const ticks=[0,Math.floor((labels.length-1)/2),labels.length-1];
  ticks.forEach(i=>{content+=`<text x="${x(i)}" y="${height-11}" text-anchor="${i===0?'start':i===labels.length-1?'end':'middle'}">${safe(labels[i])}</text>`;});
  content+=`<defs><clipPath id="${clipId}"><rect x="${left}" y="${top}" width="${width-left-right}" height="${height-top-bottom}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
  if(!otherPath&&path.every(Number.isFinite))content+=`<path class="area" d="${pathD(path)} ${base.map((v,j)=>{const i=base.length-1-j;return `L${x(i)},${y(base[i])}`;}).join(' ')} Z"/>`;
  const changed=native||path.some((v,i)=>Number.isFinite(v)&&Math.abs(v-base[i])>1e-10);
  content+=`<path class="baseline ${native?'zero-reference':''}" d="${pathD(base)}"/>`;
  if(changed)content+=`<path class="scenario model-${model.id}" d="${pathD(path)}"><title>${model.id==='martin'?'MARTIN':'DINGO'}</title></path>`;
  if(otherPath)content+=`<path class="scenario model-${peer.model.id}" d="${pathD(otherPath)}"><title>${peer.model.id==='martin'?'MARTIN':'DINGO'}</title></path>`;
  labels.forEach((label,i)=>{if(!published[i])return;
    const actual=!native&&i===0&&historical;
    content+=`<circle class="baseline-dot ${actual?'actual-dot':''}" cx="${x(i)}" cy="${y(base[i])}" r="3"><title>${safe(label)}: ${actual?'actual':native?'zero reference':'RBA forecast'} ${number(base[i],3)}</title></circle>`;
    if(changed&&Number.isFinite(path[i])&&(native||i>=data.shockStart))content+=`<circle tabindex="0" role="img" aria-label="${safe(title)}, ${safe(label)}: ${number(path[i],3)}; baseline ${number(base[i],3)}" class="scenario-dot model-${model.id}" cx="${x(i)}" cy="${y(path[i])}" r="3.7"><title>${safe(label)}: scenario ${number(path[i],3)}; baseline ${number(base[i],3)}</title></circle>`;
  });
  if(variable==='UR'){
    const value=references.nairu.values.at(-1);
    content+=`<line class="nairu-line" x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"><title>Baseline NAIRU: ${number(value,2)}%</title></line>`;
  }
  content+='</g>';
  return `<svg data-y-min="${lo}" data-y-max="${hi}" class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safe(title)}"><title>${safe(title)}</title>${content}</svg>`;
}

function update(){
  result=scenario(data,model,amounts);
  peer=comparison(data,model,amounts);peerResult=peer?scenario(data,peer.model,peer.amounts):null;
  const active=Object.values(amounts).filter(v=>v!==0).length;
  $('scenario-status').textContent=notice||(active?`${active} ${active===1?'shock':'shocks'} applied from September 2026.`:'RBA baseline · no shocks');
  if(peer)$('scenario-status').textContent='MARTIN + DINGO · matched shock sizes';
  $('empty-shocks').hidden=Object.keys(amounts).length>0;
  $('variable-count').textContent=`(${selected.size} selected)`;
  $('chart-grid').innerHTML=[...selected].map(key=>[key,data.baseline[key]]).map(([key,b])=>{
    const s=result[key],other=peerResult?.[key];
    if(!s.covered&&!other?.covered)return `<article class="chart-card unmodeled" data-variable="${key}"><h3>${safe(b.name)} <span>(variable not modeled)</span></h3></article>`;
    return `<article class="chart-card" data-variable="${key}"><h3>${safe(b.name)}</h3><p class="chart-unit">${safe(b.unit)}</p>${plot(b.values,s.values,data.quarters,data.published,b.name,{domain:scales[key],historical:b.juneHistorical,variable:key,otherPath:other?.covered?other.values:null})}${[...s.values,...(other?.values||[])].some(v=>Number.isFinite(v)&&(v<scales[key][0]||v>scales[key][1]))?'<p class="coverage">Beyond chart range · see table for values.</p>':''}${peer&&(!s.covered||!other?.covered)?`<p class="coverage">${!s.covered?model.id==='dsge'?'DINGO':'MARTIN':peer.model.id==='dsge'?'DINGO':'MARTIN'}: variable not modeled.</p>`:''}${key==='UR'?'<p class="reference-key"><i class="nairu-swatch"></i>Baseline NAIRU · <a href="'+references.nairu.source+'">Isaac Gross</a><br>4.89% · latest estimate held constant.</p>':key==='TMI'?'<p class="reference-key"><i class="target-swatch"></i>Inflation target 2–3% · midpoint 2.5%</p>':''}${model.mappingNotes[key]?`<details class="mapping-note"><summary>Model note</summary><p>${safe(model.mappingNotes[key])}${peer?.model.mappingNotes[key]?'<br>'+safe(peer.model.mappingNotes[key]):''}</p></details>`:''}</article>`;
  }).join('');
  const outputs=[{model,result},...(peer?[{model:peer.model,result:peerResult}]:[])];
  $('scenario-table').innerHTML='<thead><tr><th>Model</th><th>Variable</th><th>Quarter</th><th>Baseline</th><th>Scenario</th><th>Difference</th><th>Endpoint</th></tr></thead><tbody>'+outputs.flatMap(o=>Object.entries(o.result).filter(([key])=>selected.has(key)).flatMap(([key,s])=>data.quarters.map((q,t)=>`<tr><td>${o.model.id==='martin'?'MARTIN':'DINGO'}</td><td>${safe(data.baseline[key].name)}</td><td>${safe(q)}</td><td>${number(s.baseline[t])}</td><td>${number(s.values[t])}</td><td>${s.delta[t]===null?'Unavailable':signed(s.delta[t])}</td><td>${data.baseline[key].derived?'Derived':data.published[t]?'Published':'Interpolated'}</td></tr>`))).join('')+'</tbody>';

}

function shockLimit(s){
  if(model.id==='martin'&&['tdlla','tdllhpp','tdllpop','ty'].includes(s.id))return 2.5;
  if(model.id==='dsge'&&['eps_mu','eps_infl_star','eps_r_star'].includes(s.id))return 2.5;
  return s.unit==='percentage points'?10:50;
}
function example(p){
  const s=model.shocks.find(s=>s.id===p.shock),limit=shockLimit(s);
  const amount=Math.max(-limit,Math.min(limit,p.amount*s.displayFactor))/s.displayFactor;
  return {...p,amount,name:p.name.replace('10%','5%')};
}

function renderShocks(){
  $('download').disabled=false;
  $('shock-list').innerHTML=Object.keys(amounts).map(id=>{const s=model.shocks.find(s=>s.id===id),limit=shockLimit(s);return `<div class="shock" data-shock="${id}"><div class="shock-head"><label for="amount-${id}">${safe(s.name)}</label><button class="quiet remove-shock" data-remove="${id}" aria-label="Remove ${safe(s.name)}">×</button></div><div class="shock-unit">${safe(s.unit)}</div><details class="shock-size-note"><summary>${s.sizeDescription?.includes('quarterly')?'Quarterly change · details':'Size definition'}</summary><p>${safe(s.sizeDescription||'')}</p></details><div class="shock-fields"><input aria-label="${safe(s.name)} slider" type="range" min="${-limit}" max="${limit}" step="${limit<1?.01:.05}" value="${amounts[id]*(s.displayFactor||1)}" data-range="${id}"><input id="amount-${id}" aria-label="${safe(s.name)} amount in ${safe(s.unit)}" type="number" min="${-limit}" max="${limit}" step="any" value="${Number((amounts[id]*(s.displayFactor||1)).toFixed(4))}" data-number="${id}"></div></div>`;}).join('');
  $('shock-list').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{delete amounts[b.dataset.remove];notice='';renderShocks();update();}));
  $('shock-list').querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{
    const id=input.dataset.range||input.dataset.number,value=Number(input.value),limit=shockLimit(model.shocks.find(s=>s.id===id));
    if(input.value===''||!Number.isFinite(value)||Math.abs(value)>limit){input.setCustomValidity(`Enter a number between −${limit} and ${limit}.`);$('download').disabled=true;$('scenario-status').textContent=`Enter a shock size between −${limit} and ${limit}. Charts retain the last valid amounts.`;input.reportValidity();return;}
    input.setCustomValidity('');amounts[id]=value/(model.shocks.find(s=>s.id===id).displayFactor||1);notice='';
    const other=$('shock-list').querySelector(input.dataset.range?`[data-number="${id}"]`:`[data-range="${id}"]`);other.value=value;
    other.setCustomValidity('');$('download').disabled=[...$('shock-list').querySelectorAll('input')].some(el=>!el.validity.valid);
    update();
  }));
}

function chooseModel(id){
  if(id===model.id)return;
  model=data.models.find(m=>m.id===id);amounts={};notice='Model changed · shocks reset.';
  modelUI();variableUI();renderShocks();update();
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    $('chart-grid').animate([{opacity:.25,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'ease-out'});
  }
  if($('explorer').open)loadExplorer();
}
function modelUI(){
  const host=$('model-buttons');
  if(!host.children.length){
    host.innerHTML='<span class="model-glider" aria-hidden="true"></span>'+data.models.map(m=>`<button data-model="${m.id}" aria-pressed="false"><strong>${m.id==='martin'?'MARTIN':'DINGO'}</strong></button>`).join('');
    let swiped=false;
    host.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(swiped){swiped=false;return;}chooseModel(b.dataset.model);}));
    host.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const i=['ArrowLeft','Home'].includes(e.key)?0:1;
      chooseModel(data.models[i].id);host.querySelectorAll('button')[i].focus();
    });
    let startX;
    host.addEventListener('pointerdown',e=>{startX=e.clientX;swiped=false;});
    host.addEventListener('pointerup',e=>{if(startX!==undefined&&Math.abs(e.clientX-startX)>35){swiped=true;chooseModel(data.models[e.clientX>startX?1:0].id);}startX=undefined;});
    host.addEventListener('pointercancel',()=>{startX=undefined;});
  }
  host.dataset.model=model.id;
  document.documentElement.dataset.model=model.id;
  host.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===model.id)));
  $('model-description').textContent=model.description;
  const ranked=['ncr','cash_rate_4q','rc','gc','gi','ph','wpcom','wpoil','rtwi','ptm','eps_r','eps_p_star_z','eps_psi','eps_g','eps_xi_c','eps_mu','eps_upsilon_h'];
  const shocks=[...model.shocks].sort((a,b)=>(ranked.includes(a.id)?ranked.indexOf(a.id):100)-(ranked.includes(b.id)?ranked.indexOf(b.id):100));
  $('shock-select').innerHTML=shocks.map(s=>`<option value="${s.id}" ${s.active?'':'disabled'}>${safe(s.name)}${s.active?'':' — inactive'}</option>`).join('');
  $('presets').innerHTML=model.presets.map((p,i)=>p.shock==='cash_rate_4q'?'':`<button data-preset="${i}">${safe(example(p).name)}</button>`).join('');
  $('presets').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    const p=example(model.presets[Number(b.dataset.preset)]);amounts={[p.shock]:p.amount};notice=`Example: ${p.name.toLowerCase()}. `;renderShocks();update();
  }));
}

function variableUI(){
  $('variable-options').innerHTML=Object.entries(data.baseline).map(([key,b])=>`<label><input type="checkbox" value="${key}" ${selected.has(key)?'checked':''}>${safe(b.name)}</label>`).join('');
  $('variable-options').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{input.checked?selected.add(input.value):selected.delete(input.value);update();}));
}

async function loadExplorer(){
  const id=model.id,version=++explorerVersion;
  $('explorer-chart').textContent='Loading the full response matrix…';
  try{
    if(!rawCache[id]){const r=await fetch(`assets/${id}-all-irfs.json`);if(!r.ok)throw new Error('Response matrix could not be loaded.');rawCache[id]=await r.json();}
    if(version!==explorerVersion)return;
    const raw=rawCache[id];$('explorer-units').textContent=raw.units;
    $('explorer-shock').innerHTML=raw.shocks.map(s=>`<option value="${s.id}">${safe(s.name)} (${s.id})${s.active?'':' — inactive'}</option>`).join('');
    $('explorer-variable').innerHTML=raw.variables.map(v=>`<option value="${v}">${v}</option>`).join('');
    $('explorer-shock').value=id==='martin'?'ncr':'eps_r';$('explorer-variable').value=id==='martin'?'y':'y_va';
    explorerPlot();
  }catch(e){$('explorer-chart').textContent=e.message;}
}
function explorerPlot(){
  const raw=rawCache[model.id];if(!raw)return;
  const s=$('explorer-shock').value,v=$('explorer-variable').value,a=raw.responses[s]?.[v];if(!a)return;
  const labels=a.map((_,i)=>i===0?'Impact':`Quarter ${i+1}`);
  $('explorer-chart').innerHTML=`<h3>${safe(v)} · ${safe(s)}</h3>`+plot(a.map(()=>0),a,labels,a.map((_,i)=>i%4===0||i===a.length-1),`${v} response to ${s}`,{native:true})+`<p>Impact: ${number(a[0],6)}. Final quarter: ${number(a.at(-1),6)}. Native model units.</p>`;
}

try{
  const r=await fetch('assets/scenarios.json?v=per-capita');if(!r.ok)throw new Error('Could not load scenario data.');data=await r.json();const ref=await fetch('assets/chart-references.json');if(!ref.ok)throw new Error('Could not load chart references.');references=await ref.json();scales=fixedScales(data);
  scales.UR=[Math.min(scales.UR[0],Math.floor(Math.min(...references.nairu.values)*2)/2),Math.max(scales.UR[1],Math.ceil(Math.max(...references.nairu.values)*2)/2)];
  scales.TMI=[Math.min(scales.TMI[0],2),Math.max(scales.TMI[1],3)];model=data.models[0];
  $('loading').hidden=true;$('application').hidden=false;modelUI();variableUI();renderShocks();update();
  $('reset').addEventListener('click',()=>{amounts={};notice='';renderShocks();update();});
  $('add-shock').addEventListener('click',()=>{const id=$('shock-select').value;if(id in amounts){$(`amount-${id}`).focus();return;}const s=model.shocks.find(s=>s.id===id);amounts[id]=(shockLimit(s)<1?.1:s.unit==='percentage points'?.25:1)/(s.displayFactor||1);notice='';renderShocks();update();$(`amount-${id}`).focus();});
  $('all-variables').addEventListener('click',()=>{selected=new Set(Object.keys(data.baseline));variableUI();update();});
  $('download').addEventListener('click',()=>{const blob=new Blob([csv(data,model,result,amounts)+(peer?'\r\n\r\n'+csv(data,peer.model,peerResult,peer.amounts):'')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`australian-scenario-${model.id}-aug2026.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('explorer').addEventListener('toggle',()=>{if($('explorer').open)loadExplorer();});
  $('explorer-shock').addEventListener('change',explorerPlot);$('explorer-variable').addEventListener('change',explorerPlot);
  let resizeFrame;
  window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{update();if($('explorer').open)explorerPlot();});});
}catch(e){$('loading').textContent=`Unable to load the preview: ${e.message} Please open it through the local preview server.`;}
