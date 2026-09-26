import {DEFAULTS,validate,evaluate} from './policy-engine.mjs?v=2';
import {MARKET_URL,METHODS,METHOD_NAMES,normalizeMarket,rateDecisions,moveLabel,bpLabel,transitionRates,withNairu} from './policy-display.mjs?v=6';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let data,settings={...DEFAULTS},baseline,results,worker,job=0,animation,progress=0,paused=false,raf,charts={},domains={},market,marketRefresh=0,lastDraw=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const f=(x,n=2)=>Number(x).toFixed(n),parts=['inflation','unemployment','smoothing'];
const names={CR:'Cash rate',TMI:'Trimmed mean inflation',UR:'Unemployment',LOSS:'Quarterly loss'};
const units={CR:'%',TMI:'Year-ended %',UR:'%',LOSS:'Weighted squared percentage points'};
function settingValues(){const v={...DEFAULTS};$$('[data-number]').forEach(e=>{if(!e.validity.valid)throw Error(`${e.getAttribute('aria-label')} must be between ${e.min} and ${e.max}, in steps of ${e.step}.`);v[e.dataset.number]=Number(e.value);});$$('[data-option]').forEach(e=>v[e.dataset.option]=e.value===''?NaN:Number(e.value));validate(v);const input=$('#nairu-setting');if(!input.validity.valid)throw Error('Enter a target unemployment rate between 0% and 10%.');const updated=withNairu(data,input.value===''?NaN:Number(input.value));data=updated;$('#nairu-value').textContent=f(data.targets.nairu)+'%';return v;}
function stop(){cancelAnimationFrame(raf);animation=null;paused=false;}
function cancelJob(){job++;worker?.terminate();worker=null;$('#optimize').textContent='Optimise';$('#optimize').disabled=!data;$('.policy-controls').removeAttribute('aria-busy');}
function error(message){$('#policy-error').textContent=message||'';$('#policy-error').hidden=!message;}
function niceBounds(values,old,nonnegative=false){
  if(old&&Math.min(...values)>=old[0]&&Math.max(...values)<=old[1])return old;
  let lo=Math.min(...values),hi=Math.max(...values);const pad=(hi-lo||1)*.08;lo-=pad;hi+=pad;
  if(old){lo=Math.min(lo,old[0]);hi=Math.max(hi,old[1]);}
  const rough=(hi-lo)/4,unit=10**Math.floor(Math.log10(rough)),step=[1,2,2.5,5,10].find(v=>v*unit>=rough)*unit;
  return [nonnegative?0:Math.floor(lo/step)*step,Math.ceil(hi/step)*step,step];
}
function chartValues(k,r){return k==='LOSS'?[null,...r.loss]:r[k];}
// March observations represent the January–March quarter; label its calendar year.
function xTicks(x,T,h,H){return data.quarters.map((q,t)=>{
  const firstQuarter=q.startsWith('Mar ');
  return `<line class="tick ${firstQuarter?'major':'minor'}" data-quarter="${t}" x1="${x(t)}" x2="${x(t)}" y1="${T+h}" y2="${T+h+(firstQuarter?7:3)}"/>`+(firstQuarter?`<text x="${x(t)}" y="${H-8}" text-anchor="middle">${q.split(' ')[1]}</text>`:'');
}).join('');}
function buildCharts(target=null){
  const first=!Object.keys(domains).length;$('#policy-charts').innerHTML='';charts={};
  for(const k of Object.keys(names)){
    const values=[...chartValues(k,baseline),...METHODS.flatMap(m=>target?chartValues(k,target[m]):[])].filter(Number.isFinite);
    if(k==='CR'&&market)values.push(...market.points.map(p=>p.value));
    if(k==='TMI')values.push(2,3);if(k==='UR')values.push(data.targets.nairu);if(k==='LOSS')values.push(0);
    if(first){if(k==='CR')values.push(3.5,5.5);if(k==='TMI')values.push(2,4);if(k==='UR')values.push(4,5.5);}
    const [lo,hi,step]=niceBounds(values,domains[k],k==='LOSS');domains[k]=[lo,hi,step];
    const W=360,H=228,L=43,R=13,T=13,B=32,w=W-L-R,h=H-T-B;
    const x=t=>L+t/(data.quarters.length-1)*w,y=v=>T+(hi-v)/(hi-lo)*h;
    let axes='';
    // Cash-rate grids/ticks every 25 bp; labels remain spaced at readable round values.
    const gridStep=k==='CR'?.25:step,gridStart=Math.ceil((lo-1e-9)/gridStep)*gridStep;
    for(let v=gridStart;v<=hi+gridStep*.01;v+=gridStep){
      axes+=`<line class="grid ${k==='CR'?'quarter-point-grid':''}" data-value="${v.toFixed(4)}" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><line class="tick y-tick" x1="${L-3}" x2="${L}" y1="${y(v)}" y2="${y(v)}"/>`;
      if(k!=='CR'||Math.abs(v/step-Math.round(v/step))<1e-6)axes+=`<text x="${L-8}" y="${y(v)+4}" text-anchor="end">${Math.abs(v)<1e-10?'0':+v.toFixed(3)}</text>`;
    }
    axes+=xTicks(x,T,h,H);let ref='',note='';
    if(k==='TMI'){ref=`<rect class="band" x="${L}" y="${y(3)}" width="${w}" height="${y(2)-y(3)}"/><line class="target" x1="${L}" x2="${W-R}" y1="${y(2.5)}" y2="${y(2.5)}"/>`;note='Target: 2.5% · band: 2–3%';}
    if(k==='UR'){ref=`<line class="nairu" x1="${L}" x2="${W-R}" y1="${y(data.targets.nairu)}" y2="${y(data.targets.nairu)}"/>`;note=`Target: ${f(data.targets.nairu)}%`;}
    if(k==='LOSS')note='Lower is better';
    const article=document.createElement('article');article.className='policy-chart';article.dataset.variable=k;
    const markers=(m)=>`<g class="${m}-points" ${m==='base'?'':'hidden'}>${data.quarters.map((q,t)=>k==='LOSS'&&t===0?'':`<circle class="point ${m}-point" data-quarter="${t}" cx="${x(t)}" cy="${y(0)}" r="${m==='base'?2:2.5}"><title>${q}</title></circle>`).join('')}</g>`;
    article.innerHTML=`<h3>${names[k]}</h3><p class="unit">${units[k]}</p><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${names[k]} forecast chart"><title>${names[k]}: baseline forecast, policy under commitment and systematic policy</title>${ref}${axes}<path class="base"/>${k==='CR'?'<path class="market-line"/>':''}${METHODS.map(m=>`<path class="optimized ${m}-line" hidden/>`).join('')}${markers('base')}${METHODS.map(markers).join('')}<circle class="decision-cursor" r="5" hidden/><rect class="frame" x="${L}" y="${T}" width="${w}" height="${h}"/></svg><p class="chart-ref">${note}</p>`;
    $('#policy-charts').append(article);
    const path=vals=>{let d='',connected=false;vals.forEach((v,t)=>{if(v===null){connected=false;return;}d+=`${connected?'L':'M'}${x(t).toFixed(2)},${y(v).toFixed(2)} `;connected=true;});return d;};
    charts[k]={article,path,x,y,points:Object.fromEntries(['base',...METHODS].map(m=>[m,[...article.querySelectorAll(`.${m}-points circle`)]]))};
    article.querySelector('.base').setAttribute('d',path(chartValues(k,baseline)));
    setPoints(charts[k],'base',chartValues(k,baseline),true,k);
    if(k==='CR'&&market){
      let line='',last=null;for(const p of market.points){line+=`${last!==null&&p.serial-last===1?'L':'M'}${x(p.t)},${y(p.value)} `;last=p.serial;}
      article.querySelector('.market-line').setAttribute('d',line);
    }
  }
  buildBars(target);buildDecisionChart(target);
}
function setPoints(c,m,values,show,k){
  c.article.querySelector(`.${m}-points`).toggleAttribute('hidden',!show);
  for(const point of c.points[m]){const t=+point.dataset.quarter;point.setAttribute('cy',c.y(values[t]));point.querySelector('title').textContent=`${data.quarters[t]} · ${m==='base'?'Baseline forecast':METHOD_NAMES[m]} ${f(values[t],3)}${k==='LOSS'?'':'%'}`;}
}
function buildBars(target){
  const max=Math.max(baseline.total,...METHODS.map(m=>target?.[m].total||0),1e-8)*1.07;
  $('#loss-bars').innerHTML=['baseline',...METHODS].map(id=>`<div class="loss-bar-row"><span>${id==='baseline'?'Baseline':METHOD_NAMES[id]}</span><div class="loss-bar-track" id="${id}-bar">${parts.map(k=>`<span class="loss-${k}" data-part="${k}"></span>`).join('')}</div><span class="loss-bar-value" id="${id}-loss-value"></span></div>`).join('');
  charts.barMax=max;updateBar('baseline',baseline);METHODS.forEach(m=>updateBar(m,target?baseline:null));
}
function updateBar(id,r){$$(`#${id}-bar span`).forEach(e=>{const v=r?.parts[e.dataset.part]||0;e.style.width=100*v/charts.barMax+'%';e.title=`${e.dataset.part}: ${f(v,3)}`;});$(`#${id}-loss-value`).textContent=r?f(r.total,3):'—';}
function buildDecisionChart(target){
  const W=720,H=195,L=43,R=16,T=20,B=32,w=W-L-R,h=H-T-B;
  // Allow room for intermediate visual transitions as adjacent points reveal.
  let peak=Math.max(settings.maxMove*100,...rateDecisions(baseline.CR).slice(1).map(v=>Math.abs(v.bp)));
  if(target)for(const m of METHODS)for(let t=1;t<data.quarters.length;t++)for(const a of [baseline.CR[t],target[m].CR[t]])for(const b of [baseline.CR[t-1],target[m].CR[t-1]])peak=Math.max(peak,Math.abs(a-b)*100);
  const limit=Math.max(25,Math.ceil(peak/25)*25),x=t=>L+18+t/(data.quarters.length-1)*(w-36),y=v=>T+(limit-v)/(limit*2)*h;
  let axes='';const step=limit<=100?25:50;
  for(let bp=-limit;bp<=limit;bp+=step)axes+=`<line class="${bp===0?'zero':'grid'}" x1="${L}" x2="${W-R}" y1="${y(bp)}" y2="${y(bp)}"/><text x="${L-7}" y="${y(bp)+4}" text-anchor="end">${bp>0?'+':''}${bp}</text>`;
  axes+=xTicks(x,T,h,H);
  $('#decision-chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Quarterly cash-rate changes in basis points">${axes}<g id="decision-bars"></g><rect class="frame" x="${L}" y="${T}" width="${w}" height="${h}"/></svg>`;
  charts.decisions={x,y};
}
const decisionName=m=>m==='baseline'?'Baseline forecast':METHOD_NAMES[m];
function decisionTable(r){
  $('#decision-table').innerHTML='<thead><tr><th scope="col">Decision</th>'+data.quarters.slice(1).map(q=>`<th scope="col">${q}</th>`).join('')+'</tr></thead><tbody>'+['baseline',...METHODS].map(m=>{
    const rates=m==='baseline'?baseline.CR:r?.[m].CR;
    const moves=rates?rateDecisions(rates).slice(1):data.quarters.slice(1).map(()=>null);
    return `<tr class="${m}-decisions"><th scope="row">${decisionName(m)} · bp</th>`+moves.map(v=>`<td>${bpLabel(v?.bp)}</td>`).join('')+`</tr><tr class="equivalent-row ${m}-decisions"><th scope="row">25 bp equivalents</th>`+moves.map(v=>`<td>${moveLabel(v?.bp)}</td>`).join('')+'</tr>';
  }).join('')+'</tbody>';
}
function drawDecisions(r,show){
  const {x,y}=charts.decisions;
  $('#decision-bars').innerHTML=['baseline',...(show?METHODS:[])].map((m,mi)=>rateDecisions(m==='baseline'?baseline.CR:r[m].CR).slice(1).map((v,t)=>`<rect class="${m}-bar" data-quarter="${t+1}" x="${x(t+1)-15+mi*11}" y="${Math.min(y(0),y(v.bp))}" width="9" height="${Math.max(.7,Math.abs(y(v.bp)-y(0)))}"><title>${data.quarters[t+1]} · ${decisionName(m)}: ${bpLabel(v.bp)} bp · ${moveLabel(v.bp)}</title></rect>`).join('')).join('');
  decisionTable(show?r:null);
}
function draw(r,show=true,phase=1){
  lastDraw={r,show,phase};
  for(const k of Object.keys(names)){
    const c=charts[k];for(const m of METHODS){const vals=chartValues(k,r[m]),line=c.article.querySelector(`.${m}-line`);line.toggleAttribute('hidden',!show);line.setAttribute('d',c.path(vals));setPoints(c,m,vals,show,k);}
    const cursor=c.article.querySelector('.decision-cursor'),t=Math.min(data.quarters.length-1,Math.floor(phase*(data.quarters.length-1))+1);
    cursor.toggleAttribute('hidden',!show||phase>=1||k!=='CR');cursor.setAttribute('cx',c.x(t));cursor.setAttribute('cy',c.y(r.path.CR[t]));
  }
  METHODS.forEach(m=>updateBar(m,show?r[m]:null));
  $('#loss-change').innerHTML=!show?'Baseline':METHODS.map(m=>{const change=baseline.total-r[m].total,pct=baseline.total>1e-10?100*change/baseline.total:null;return `<span class="${change>1e-10?'improved':''}">${METHOD_NAMES[m]}: ${pct===null?`Δ ${f(-change,3)}`:Math.abs(pct)<.005?'unchanged':`${f(Math.abs(pct),1)}% ${change>=0?'lower':'higher'}`}</span>`;}).join('');
  drawDecisions(r,show);
}
function table(r){
  const head=['Quarter','Baseline cash rate','Market path','Policy under commitment','Systematic policy','Baseline inflation','Policy under commitment','Systematic policy','Baseline unemployment','Policy under commitment','Systematic policy','Baseline loss','Commitment loss','Systematic policy loss'];
  $('#policy-table').innerHTML='<thead><tr>'+head.map(x=>`<th scope="col">${x}</th>`).join('')+'</tr></thead><tbody>'+data.quarters.map((q,t)=>'<tr><th scope="row">'+q+'</th>'+[baseline.CR[t],market?.quarterly[t]??null,r?.path.CR[t],r?.rule.CR[t],baseline.TMI[t],r?.path.TMI[t],r?.rule.TMI[t],baseline.UR[t],r?.path.UR[t],r?.rule.UR[t],t?baseline.loss[t-1]:null,t?r?.path.loss[t-1]:null,t?r?.rule.loss[t-1]:null].map(v=>`<td>${v==null?'—':f(v,3)}</td>`).join('')+'</tr>').join('')+'</tbody>';
}
function changed(){
  stop();cancelJob();results=null;$('#replay-policy').hidden=true;$('#finish-policy').hidden=true;$('#rule-results').hidden=true;
  try{settings=settingValues();error('');baseline=evaluate(data,data.baseline.CR.slice(1),settings);$('#formula-pi').textContent=settings.inflation;$('#formula-u').textContent=settings.unemployment;$('#formula-i').textContent=settings.smoothing;buildCharts();draw({path:baseline,rule:baseline},false);table(null);$('#policy-status').textContent='Select Optimise.';}
  catch(e){error(e.message);$('#optimize').disabled=true;$('#policy-status').textContent='Check settings.';}
}
function finish(){
  stop();progress=1;draw(results);$('#replay-policy').textContent='Replay';$('#replay-policy').hidden=false;$('#finish-policy').hidden=true;
  const higher=METHODS.filter(m=>results[m].total>baseline.total+1e-7);
  $('#policy-status').textContent=higher.length?higher.map(m=>METHOD_NAMES[m]).join(' and ')+' has higher loss than baseline.':'';
  $('#loss-note').textContent='Sum over ten quarters.';
}
function animate(){
  stop();progress=0;let last=null;paused=false;animation=true;
  $('#policy-status').textContent='Commitment: sequential · systematic: together';$('#loss-note').textContent='Animation: loss may temporarily rise.';
  $('#replay-policy').textContent='Pause';$('#replay-policy').hidden=false;$('#finish-policy').hidden=false;
  const tick=now=>{if(!animation)return;if(last!==null&&!paused)progress=Math.min(1,progress+(now-last)/6000);last=now;
    const r=Object.fromEntries(METHODS.map(m=>[m,evaluate(data,transitionRates(data.baseline.CR.slice(1),results[m].rates,progress,m),settings)]));draw(r,true,progress);
    if(progress>=1){finish();return;}raf=requestAnimationFrame(tick);
  };
  if(reduced.matches){finish();return;}raf=requestAnimationFrame(tick);
}
function solved(answer){
  cancelJob();results=answer;error('');buildCharts(results);table(results);
  const coeff=results.rule.coefficients;$('#rule-results').hidden=false;
  $('#rule-coefficients').innerHTML=['Inertia ρ','Inflation φπ','Unemployment φu','Momentum φd'].map((x,i)=>`<span>${x}<b>${f(coeff[i],3)}</b></span>`).join('');
  $('#rule-search-note').textContent='Best rule found. Coefficients: 0–5; inertia: 0–1.'+(coeff.some((v,i)=>v>=(i?5:1)-.001)?' Search bound reached.':'');
  if(matchMedia('(max-width: 900px)').matches)$('.policy-results').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});animate();
}
function optimize(event){
  event.preventDefault();if(!$('#policy-form').reportValidity())return;
  try{settings=settingValues();error('');}catch(e){error(e.message);return;}
  stop();cancelJob();const id=++job;$('#optimize').disabled=true;$('#optimize').textContent='Optimising…';$('.policy-controls').setAttribute('aria-busy','true');$('#policy-status').textContent='Calculating…';$('#finish-policy').hidden=true;$('#replay-policy').hidden=true;
  try{worker=new Worker(new URL('./policy-worker.mjs?v=3',import.meta.url),{type:'module'});}catch{cancelJob();error('Optimiser unavailable. Reload to retry.');return;}
  worker.onmessage=({data:message})=>{if(message.id!==job)return;if(message.error){cancelJob();error(message.error);$('#policy-status').textContent='Optimisation failed.';}else solved(message.result);};
  worker.onerror=()=>{if(id!==job)return;cancelJob();error('Optimiser unavailable. Reload to retry.');$('#policy-status').textContent='Optimiser unavailable.';};
  worker.postMessage({id,data,settings});
}
async function refreshMarket(){
  if(!data)return;marketRefresh=Date.now();let feed,cached=false;
  try{const response=await fetch(MARKET_URL,{cache:'no-cache',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Market unavailable');feed=await response.json();normalizeMarket(feed,data.quarters);try{localStorage.setItem('optimal-policy-market-v1',JSON.stringify(feed));}catch{}}
  catch{cached=true;try{feed=JSON.parse(localStorage.getItem('optimal-policy-market-v1'));}catch{}}
  try{
    market=normalizeMarket(feed,data.quarters);const date=new Date(market.quoteDate+'T00:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    const last=new Date(market.lastMonth+'-01T00:00:00Z').toLocaleDateString('en-AU',{month:'short',year:'numeric',timeZone:'UTC'});
    $('#market-status').textContent=`Market path: ${date}${cached?' · saved copy; live feed unavailable':''} · contracts through ${last}${market.points.length?'':' · outside this forecast horizon'}`;
    $('#market-legend').hidden=!market.points.length;
  }catch{market=null;$('#market-status').textContent='Market unavailable. Optimisers ready.';$('#market-legend').hidden=true;}
  const frame=lastDraw;buildCharts(results);draw(frame?.r||{path:baseline,rule:baseline},frame?.show||false,frame?.phase??1);table(results);
}
async function init(){
  try{
    const response=await fetch(new URL('./policy-data.json?v=1',import.meta.url),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Forecast data could not load.');data=await response.json();
    $('#nairu-setting').defaultValue=f(data.targets.nairu);settings=settingValues();baseline=evaluate(data,data.baseline.CR.slice(1),settings);$('#nairu-value').textContent=f(data.targets.nairu)+'%';$('#nairu-source').href=data.sources.nairu;
    $('#policy-loading').hidden=true;$('#policy-app').hidden=false;$('#optimize').disabled=false;buildCharts();draw({path:baseline,rule:baseline},false);table(null);
    $$('[data-setting]').forEach(e=>e.addEventListener('input',()=>{$(`[data-number="${e.dataset.setting}"]`).value=e.value;changed();}));
    $$('[data-number]').forEach(e=>e.addEventListener('input',()=>{$(`[data-setting="${e.dataset.number}"]`).value=e.value;changed();}));
    $$('[data-option]').forEach(e=>e.addEventListener('input',changed));$('#nairu-setting').addEventListener('input',changed);$('#policy-form').addEventListener('submit',optimize);
    $('#reset-policy').addEventListener('click',()=>{$('#policy-form').reset();domains={};changed();});$('#finish-policy').addEventListener('click',finish);
    $('#replay-policy').addEventListener('click',()=>{if(animation){paused=!paused;$('#replay-policy').textContent=paused?'Continue':'Pause';}else animate();});
    reduced.addEventListener('change',()=>{if(reduced.matches&&animation)finish();});
    refreshMarket();setInterval(()=>{if(!document.hidden)refreshMarket();},3600000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-marketRefresh>=3600000)refreshMarket();});
  }catch{$('#policy-loading').textContent='The policy page could not load. ';const a=document.createElement('a');a.href='?reload='+Date.now();a.textContent='Try again';$('#policy-loading').append(a);}
}
init();
