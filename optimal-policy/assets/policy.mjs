import {DEFAULTS,validate,evaluate,policyCSV} from './policy-engine.mjs?v=1';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let data,settings={...DEFAULTS},baseline,result,worker,job=0,animation,progress=0,paused=false,raf,charts={},domains={};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const f=(x,n=2)=>Number(x).toFixed(n),parts=['inflation','unemployment','smoothing'];
const names={CR:'Cash rate',TMI:'Trimmed mean inflation',UR:'Unemployment',LOSS:'Quarterly loss'};
const units={CR:'%',TMI:'Year-ended %',UR:'%',LOSS:'Weighted squared percentage points'};
function settingValues(){
  const values={...DEFAULTS};$$('[data-number]').forEach(e=>values[e.dataset.number]=e.value===''?NaN:Number(e.value));
  $$('[data-option]').forEach(e=>values[e.dataset.option]=e.value===''?NaN:Number(e.value));validate(values);return values;
}
function stop(){cancelAnimationFrame(raf);animation=null;paused=false;}
function cancelJob(){job++;worker?.terminate();worker=null;$('#optimize').textContent='Optimize';$('#optimize').disabled=!data;$('.policy-controls').removeAttribute('aria-busy');}
function error(message){$('#policy-error').textContent=message||'';$('#policy-error').hidden=!message;}
function niceBounds(values,old,nonnegative=false){
  if(old && Math.min(...values)>=old[0] && Math.max(...values)<=old[1]) return old;
  let lo=Math.min(...values),hi=Math.max(...values);const pad=(hi-lo||1)*.08;lo-=pad;hi+=pad;
  if(old){lo=Math.min(lo,old[0]);hi=Math.max(hi,old[1]);}
  const rough=(hi-lo)/4,unit=10**Math.floor(Math.log10(rough)),step=[1,2,2.5,5,10].find(v=>v*unit>=rough)*unit;
  return [nonnegative?0:Math.floor(lo/step)*step,Math.ceil(hi/step)*step,step];
}
function chartValues(k,r){return k==='LOSS'?[null,...r.loss]:r[k];}
function buildCharts(target=null){
  const first=!Object.keys(domains).length;
  $('#policy-charts').innerHTML='';charts={};
  for(const k of Object.keys(names)){
    const values=[...chartValues(k,baseline),...(target?chartValues(k,target):[])].filter(Number.isFinite);
    if(k==='TMI')values.push(2,3);if(k==='UR')values.push(data.targets.nairu);
    if(first){if(k==='CR')values.push(3.5,5.5);if(k==='TMI')values.push(2,4);if(k==='UR')values.push(4,5.5);}
    if(k==='LOSS')values.push(0);
    const [lo,hi,step]=niceBounds(values,domains[k],k==='LOSS');domains[k]=[lo,hi,step];
    const W=360,H=228,L=43,R=13,T=13,B=32,w=W-L-R,h=H-T-B;
    const x=t=>L+t/(data.quarters.length-1)*w,y=v=>T+(hi-v)/(hi-lo)*h;
    let axes='';
    for(let v=lo;v<=hi+step*.01;v+=step)axes+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${Math.abs(v)<1e-10?'0':+v.toFixed(3)}</text>`;
    data.quarters.forEach((q,t)=>{const major=t%4===0;axes+=`<line class="tick" x1="${x(t)}" x2="${x(t)}" y1="${T+h}" y2="${T+h+(major?7:3)}"/>`;if(major)axes+=`<text x="${x(t)}" y="${H-8}" text-anchor="middle">${q}</text>`;});
    let ref='',note='';
    if(k==='TMI'){ref=`<rect class="band" x="${L}" y="${y(3)}" width="${w}" height="${y(2)-y(3)}"/><line class="target" x1="${L}" x2="${W-R}" y1="${y(2.5)}" y2="${y(2.5)}"/>`;note='Target: 2.5% · band: 2–3%';}
    if(k==='UR'){ref=`<line class="nairu" x1="${L}" x2="${W-R}" y1="${y(data.targets.nairu)}" y2="${y(data.targets.nairu)}"/>`;note=`NAIRU: ${f(data.targets.nairu)}%`;}
    if(k==='LOSS')note='Lower is better';
    const article=document.createElement('article');article.className='policy-chart';
    article.innerHTML=`<h3>${names[k]}</h3><p class="unit">${units[k]}</p><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${names[k]} forecast chart"><title>${names[k]}: baseline and policy path</title>${ref}${axes}<path class="base"/><path class="optimized" hidden/><g class="points"></g><rect class="frame" x="${L}" y="${T}" width="${w}" height="${h}"/></svg><p class="chart-ref">${note||'September 2026–December 2028'}</p>`;
    $('#policy-charts').append(article);
    const path=vals=>{let d='',connected=false;vals.forEach((v,t)=>{if(v===null){connected=false;return;}d+=`${connected?'L':'M'}${x(t).toFixed(2)},${y(v).toFixed(2)} `;connected=true;});return d;};
    article.querySelector('.base').setAttribute('d',path(chartValues(k,baseline)));
    charts[k]={article,path,x,y};
  }
  bars(target);
}
function bars(target){
  const max=Math.max(baseline.total,target?.total||0,1e-8)*1.07;
  $('#loss-bars').innerHTML=['baseline','policy'].map((id,i)=>`<div class="loss-bar-row"><span>${i?'Policy':'Baseline'}</span><div class="loss-bar-track" id="${id}-bar">${parts.map(k=>`<span class="loss-${k}" data-part="${k}"></span>`).join('')}</div><span class="loss-bar-value" id="${id}-loss-value"></span></div>`).join('');
  charts.barMax=max;
  updateBar('baseline',baseline);updateBar('policy',target?baseline:null);
}
function updateBar(id,r){
  $$(`#${id}-bar span`).forEach(e=>{const v=r?.parts[e.dataset.part]||0;e.style.width=100*v/charts.barMax+'%';e.title=`${e.dataset.part}: ${f(v,3)}`;});
  $(`#${id}-loss-value`).textContent=r?f(r.total,3):'—';
}
function draw(r,show=true){
  for(const [k,c] of Object.entries(charts)){
    if(k==='barMax')continue;
    const line=c.article.querySelector('.optimized');line.hidden=!show;line.toggleAttribute('hidden',!show);line.setAttribute('d',c.path(chartValues(k,r)));
  }
  updateBar('policy',show?r:null);
  const change=baseline.total-r.total,pct=baseline.total>1e-10?100*change/baseline.total:null;
  $('#loss-change').textContent=!show?'Baseline':pct===null?`Change: ${f(-change,3)}`:Math.abs(pct)<.005?'Unchanged':`${f(Math.abs(pct),1)}% ${change>=0?'lower':'higher'}`;
  $('#loss-change').classList.toggle('improved',show&&change>1e-10);
}
function tooltips(r){
  for(const [k,c] of Object.entries(charts))if(k!=='barMax'){
    const b=chartValues(k,baseline),v=chartValues(k,r);
    c.article.querySelector('.points').innerHTML=v.map((z,t)=>z===null?'':`<circle cx="${c.x(t)}" cy="${c.y(z)}" r="7" fill="transparent" tabindex="0"><title>${data.quarters[t]} · Baseline ${f(b[t],3)} · Policy ${f(z,3)}${k==='LOSS'?'':'%'}</title></circle>`).join('');
  }
}
function table(r){
  const header=['Quarter','Cash rate: baseline','Policy','Inflation: baseline','Policy','Unemployment: baseline','Policy','Loss: baseline','Policy'];
  $('#policy-table').innerHTML='<thead><tr>'+header.map(x=>`<th scope="col">${x}</th>`).join('')+'</tr></thead><tbody>'+data.quarters.map((q,t)=>'<tr><th scope="row">'+q+'</th>'+[baseline.CR[t],r.CR[t],baseline.TMI[t],r.TMI[t],baseline.UR[t],r.UR[t],t?baseline.loss[t-1]:null,t?r.loss[t-1]:null].map(v=>`<td>${v===null?'—':f(v,3)}</td>`).join('')+'</tr>').join('')+'</tbody>';
}
function changed(){
  stop();cancelJob();result=null;$('#download-policy').disabled=true;$('#replay-policy').hidden=true;$('#finish-policy').hidden=true;$('#rule-results').hidden=true;
  $('#neutral-setting').hidden=$('input[name=method]:checked').value!=='rule';
  try{
    settings=settingValues();error('');baseline=evaluate(data,data.baseline.CR.slice(1),settings);
    $('#formula-pi').textContent=settings.inflation;$('#formula-u').textContent=settings.unemployment;$('#formula-i').textContent=settings.smoothing;
    buildCharts();draw(baseline,false);table(baseline);$('#policy-status').textContent='Settings ready. Select Optimize.';
  }catch(e){error(e.message);$('#optimize').disabled=true;$('#policy-status').textContent='Check the settings before optimizing.';}
}
function finish(){
  stop();progress=1;draw(result);tooltips(result);$('#replay-policy').textContent='Replay';$('#replay-policy').hidden=false;$('#finish-policy').hidden=true;
  const gain=baseline.total-result.total;
  $('#policy-status').textContent=(result.method==='path'?'Quarter-by-quarter path solved.':'Best simple rule found.')+(gain < -1e-7?(result.method==='rule'?' This rule has higher loss than the baseline.':' These limits yield higher loss than the baseline.'):'');
  $('#loss-note').textContent='Sum of quarterly losses, in weighted squared percentage points.';
}
function animate(){
  stop();progress=0;let last=null;paused=false;animation=true;
  $('#policy-status').textContent='Moving from the baseline to the solved policy…';$('#loss-note').textContent='Loss recalculated from the paths shown above.';
  $('#replay-policy').textContent='Pause';$('#replay-policy').hidden=false;$('#finish-policy').hidden=false;
  const tick=now=>{
    if(!animation)return;
    if(last!==null&&!paused)progress=Math.min(1,progress+(now-last)/4200);last=now;
    const a=progress*progress*(3-2*progress);
    const rates=data.baseline.CR.slice(1).map((v,t)=>v+a*(result.rates[t]-v));draw(evaluate(data,rates,settings));
    if(progress>=1){finish();return;}raf=requestAnimationFrame(tick);
  };
  if(reduced.matches){finish();return;}raf=requestAnimationFrame(tick);
}
function solved(answer){
  cancelJob();result=answer;error('');$('#download-policy').disabled=false;
  buildCharts(result);table(result);
  const coeff=result.coefficients;$('#rule-results').hidden=!coeff;
  if(coeff){$('#rule-coefficients').innerHTML=['Inertia ρ','Inflation φπ','Unemployment φu','Momentum φd'].map((x,i)=>`<span>${x}<b>${f(coeff[i],3)}</b></span>`).join('');
    $('#rule-search-note').textContent='Best rule found using multiple starting points. Coefficients on inflation, unemployment and momentum are bounded at 5; inertia at 1.'+(coeff.some((v,i)=>v>=(i?5:1)-.001)?' At least one coefficient reaches its search bound.':'');}
  if(matchMedia('(max-width: 900px)').matches) $('.policy-results').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
  animate();
}
async function optimize(event){
  event.preventDefault();if(!$('#policy-form').reportValidity())return;
  try {settings=settingValues();error('');}catch(e){error(e.message);return;}
  stop();cancelJob();const id=++job,method=$('input[name=method]:checked').value;
  $('#optimize').disabled=true;$('#optimize').textContent='Optimizing…';$('.policy-controls').setAttribute('aria-busy','true');$('#policy-status').textContent='Solving the policy over all ten forecast quarters…';$('#finish-policy').hidden=true;$('#replay-policy').hidden=true;$('#download-policy').disabled=true;
  try {worker=new Worker(new URL('./policy-worker.mjs?v=1',import.meta.url),{type:'module'});} catch {cancelJob();error('The optimizer could not start. Reload this page and try again.');return;}
  worker.onmessage=({data:message})=>{if(message.id!==job)return;if(message.error){cancelJob();error(message.error);$('#policy-status').textContent='Optimization could not finish.';}else solved(message.result);};
  worker.onerror=()=>{if(id!==job)return;cancelJob();error('The optimizer could not load. Reload this page and try again.');$('#policy-status').textContent='Optimizer unavailable.';};
  worker.postMessage({id,data,settings,method});
}
async function init(){
  try{
    const response=await fetch(new URL('./policy-data.json?v=1',import.meta.url),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Forecast data could not load.');data=await response.json();
    baseline=evaluate(data,data.baseline.CR.slice(1),settings);$('#nairu-value').textContent=f(data.targets.nairu)+'%';$('#nairu-source').href=data.sources.nairu;
    $('#policy-loading').hidden=true;$('#policy-app').hidden=false;$('#optimize').disabled=false;buildCharts();draw(baseline,false);table(baseline);
    $$('[data-setting]').forEach(e=>e.addEventListener('input',()=>{$(`[data-number="${e.dataset.setting}"]`).value=e.value;changed();}));
    $$('[data-number]').forEach(e=>e.addEventListener('input',()=>{$(`[data-setting="${e.dataset.number}"]`).value=e.value;changed();}));
    $$('[data-option],input[name=method]').forEach(e=>e.addEventListener('input',changed));
    $('#policy-form').addEventListener('submit',optimize);
    $('#reset-policy').addEventListener('click',()=>{$('#policy-form').reset();domains={};changed();});
    $('#finish-policy').addEventListener('click',finish);
    $('#replay-policy').addEventListener('click',()=>{if(animation){paused=!paused;$('#replay-policy').textContent=paused?'Continue':'Pause';}else animate();});
    $('#download-policy').addEventListener('click',()=>{if(!result)return;const url=URL.createObjectURL(new Blob([policyCSV(data,result,settings)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`optimal-policy-${result.method}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    reduced.addEventListener('change',()=>{if(reduced.matches&&animation)finish();});
  }catch(e){$('#policy-loading').textContent='The policy page could not load. ';const a=document.createElement('a');a.href='?reload='+Date.now();a.textContent='Try again';$('#policy-loading').append(a);}
}
init();
