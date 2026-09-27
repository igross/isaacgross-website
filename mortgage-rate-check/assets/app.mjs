import {REFERENCE,COEFFICIENTS,TYPES,PURPOSES,estimate,compare} from './model.mjs?v=2';
const $=id=>document.getElementById(id);
const example={...REFERENCE,amount:750000,income:180000,lvr:70,months:12,broker:true};
const fields=[
 {key:'type',label:'Loan type',wide:true,options:[['owner_pi','Owner-occupier · principal & interest'],['owner_io','Owner-occupier · interest only'],['investor_pi','Investor · principal & interest'],['investor_io','Investor · interest only']]},
 {key:'amount',label:'Original loan amount ($)',min:10000,max:1650000,step:1000,help:'Amount approved, before repayments.'},
 {key:'income',label:'Annual gross income ($)',min:1000,max:10000000,step:1000,help:'Combined borrower income at approval.'},
 {key:'lvr',label:'Original LVR (%)',min:1,max:100,step:0.1,help:'Loan ÷ property value at approval × 100.'},
 {key:'months',label:'Loan age (months)',min:0,max:600,step:1,help:'Since this loan was originated or refinanced.'},
 {key:'purpose',label:'Purpose at approval',options:[['existing','Buy an existing home'],['refinance','Refinance'],['new','Buy a new home'],['construction','Construction'],['other','Other']]},
 {key:'lmi',label:'Lenders’ mortgage insurance',bool:true,options:[[false,'No'],[true,'Yes']]},
 {key:'apartment',label:'Property type',bool:true,options:[[false,'House / other'],[true,'Apartment']]},
 {key:'broker',label:'Arranged through a broker?',bool:true,options:[[false,'No'],[true,'Yes']]},
 {key:'fullDoc',label:'Income documentation',bool:true,options:[[true,'Full documentation'],[false,'Low / alternative documentation']]},
 {key:'nonMetro',label:'Property location',bool:true,options:[[false,'Metro'],[true,'Non-metro']]},
 {key:'notPayg',label:'Employment at approval',bool:true,options:[[false,'PAYG employee'],[true,'Other / self-employed']]}
];
function renderFields(target,list,prefix,values){
 $(target).classList.add('mortgage-fields');
 $(target).innerHTML=list.map(f=>`<div class="mortgage-field ${f.wide?'wide':''}"><label for="${prefix}${f.key}">${f.label}</label>${f.options?`<select id="${prefix}${f.key}" name="${f.key}"><option value="">${prefix==='loan-'?'Not sure — use reference':'Use default assumption'}</option>${f.options.map(([v,label])=>`<option value="${v}" ${values[f.key]===v?'selected':''}>${label}</option>`).join('')}</select>`:`<input id="${prefix}${f.key}" name="${f.key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" inputmode="decimal" value="${values[f.key]??''}" placeholder="Optional" aria-describedby="${prefix}${f.key}-help">`}${f.help?`<small id="${prefix}${f.key}-help">${f.help}</small>`:''}</div>`).join('');
}
renderFields('primary-fields',fields.slice(0,5),'loan-',{type:'owner_pi'});
renderFields('extra-fields',fields.slice(5),'loan-',{});
renderFields('reference-fields',fields.filter(f=>f.key!=='type'),'ref-',REFERENCE);
function read(prefix){const result={type:REFERENCE.type};for(const f of fields){const el=$(prefix+f.key);if(!el)continue; result[f.key]=el.validity.badInput?NaN:el.value.trim()===''?null:f.options?(f.bool?el.value==='true':el.value):Number(el.value);}return result;}
function reset(prefix,values){for(const f of fields){const el=$(prefix+f.key);if(el)el.value=values[f.key]===undefined?'':String(values[f.key]);}update();}
const signed=v=>`${v>0?'+':v<0?'−':''}${Math.abs(v).toFixed(1)}`;
const pct=v=>`${v.toFixed(2)}%`;
let market,result;
const coeffRows=[['Intercept',COEFFICIENTS.intercept],['Age, per month',COEFFICIENTS.months],['Owner-occupier IO',TYPES.owner_io],['Investor P&I',TYPES.investor_pi],['Investor IO',TYPES.investor_io],['Loan amount, $100,000 units',COEFFICIENTS.amount],['Loan amount squared, same units',COEFFICIENTS.amountSquared],['LVR, percentage points',COEFFICIENTS.lvr],['LVR × indicator(LVR > 80)',COEFFICIENTS.lvrOver80],['Mortgage insurance',COEFFICIENTS.lmi],['Income, $10,000 units',COEFFICIENTS.income],['Loan-to-income ratio',COEFFICIENTS.lti],['Apartment',COEFFICIENTS.apartment],['Broker',COEFFICIENTS.broker],['Full documentation',COEFFICIENTS.fullDoc],['Refinance',PURPOSES.refinance],['New dwelling',PURPOSES.new],['Construction',PURPOSES.construction],['Other purpose',PURPOSES.other],['Non-metro',COEFFICIENTS.nonMetro],['Not PAYG',COEFFICIENTS.notPayg]];
$('coefficient-rows').innerHTML=coeffRows.map(([label,v])=>`<tr><td>${label}</td><td>${v}</td></tr>`).join('');
function update(){
 if(!market)return;
 const p=read('loan-'),ref=read('ref-');
 for(const prefix of ['loan-','ref-'])for(const f of fields.filter(f=>!f.options)){const el=$(prefix+f.key);if(el)el.setAttribute('aria-invalid',String(el.validity.badInput||(el.value.trim()!==''&&(!Number.isFinite(Number(el.value))||Number(el.value)<f.min||Number(el.value)>f.max))));}
 result=estimate(p,market,ref);
 $('form-error').hidden=!result.errors.length;
 if(result.errors.length){
  $('assumptions').hidden=true;
  $('form-error').textContent='Check your loan and reference inputs. '+[...new Set(result.errors)].join(' ');
  $('expected-rate').textContent='—';$('estimate-detail').textContent='Complete valid inputs to calculate a benchmark.';
  $('comparison-result').textContent='Complete valid loan and reference inputs first.';
  $('comparison-result').className='';$('waterfall').replaceChildren();$('waterfall').setAttribute('aria-label','Chart unavailable until inputs are valid.');$('breakdown-rows').replaceChildren();$('age-note').hidden=true;return;
 }
 const describe=key=>{const f=fields.find(f=>f.key===key),value=result.profile[key];return `${f.label}: ${f.options?f.options.find(([v])=>v===value)?.[1]:value.toLocaleString('en-AU')}`;};
 $('assumptions').hidden=result.assumed.length===0&&result.referenceDefaults.length===0;
 $('assumptions-summary').textContent=result.assumed.length?`${result.assumed.length} unanswered ${result.assumed.length===1?'field uses':'fields use'} reference assumptions`:'Default reference assumptions used';
 $('assumptions-list').replaceChildren(...result.assumed.map(key=>{const li=document.createElement('li');li.textContent=describe(key);return li;}));
 $('reference-defaults').textContent=result.referenceDefaults.length?`Blank reference fields use the site's original defaults: ${result.referenceDefaults.map(key=>fields.find(f=>f.key===key).label).join(', ')}.`:'';
 $('personalisation-note').textContent=fields.filter(f=>f.key!=='type').every(f=>result.assumed.includes(f.key))?'With no borrower details, this is the loan-type average. Add details to personalise it.':result.assumed.length?'Blank fields use the reference values shown below. More completed details make this estimate more specific to you.':'All borrower details are supplied; no missing-value assumptions are needed.';
 $('expected-rate').innerHTML=`${pct(result.rate)}<small>p.a.</small>`;
 $('estimate-detail').textContent=`${pct(result.baseline)} loan-type average ${result.adjustmentBp<0?'−':'+'} ${(Math.abs(result.adjustmentBp)/100).toFixed(2)} percentage points for your profile.`;
 $('age-note').hidden=!result.ageCapped;
 const actual=$('actual-rate').value.trim(),comparison=actual===''?null:compare(Number(actual),result.rate);
 $('actual-rate').setAttribute('aria-invalid',String(actual!==''&&!comparison));
 const box=$('comparison-result');box.className=comparison?.direction||'';
 if(!comparison){box.textContent=actual===''?'Enter your rate to see the difference.':'Enter an interest rate greater than 0% and no more than 30%.';}
 else if(comparison.direction==='close'){box.innerHTML='<strong>Close to the benchmark</strong>Your rate is within 0.5 basis points of this illustrative estimate.';}
 else {box.innerHTML=`<strong>${Math.abs(comparison.gapBp).toFixed(1)} bp ${comparison.direction} the benchmark</strong>That is ${(Math.abs(comparison.gapBp)/100).toFixed(2)} percentage points ${comparison.direction==='below'?'lower':'higher'} than the estimate for your profile. This is not a percentile ranking.`;}
 draw(comparison?Number(actual):null);
}
function draw(actual=null){
 if(!result||result.errors.length)return;
 const container=$('waterfall'),width=Math.max(260,container.clientWidth),compact=width<580;
 const left=compact?8:207,right=compact?8:95,plot=width-left-right,rowHeight=compact?54:39,top=42;
 let running=result.baseline;
 const rows=[{label:`RBA loan-type average${result.assumed.includes('type')?' *':''}`,start:result.baseline,end:result.baseline,total:true,value:pct(result.baseline)}];
 for(const item of result.adjustments){const end=running+item.bp/100;rows.push({label:item.label+(item.assumed?' *':''),start:running,end,bp:item.bp,value:`${signed(item.bp)} bp`});running=end;}
 rows.push({label:'Your estimated benchmark',start:running,end:running,total:true,value:pct(running)});
 if(actual!==null)rows.push({label:'Your actual rate',start:actual,end:actual,total:true,actual:true,value:pct(actual)});
 const values=rows.flatMap(r=>[r.start,r.end]),lo=Math.floor((Math.min(...values)-.08)*10)/10,hi=Math.ceil((Math.max(...values)+.08)*10)/10;
 const x=v=>left+(v-lo)/(hi-lo)*plot,height=top+rows.length*rowHeight+12;
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">`;
 for(let i=0;i<=4;i++){const value=lo+(hi-lo)*i/4,xx=x(value);svg+=`<line x1="${xx}" x2="${xx}" y1="28" y2="${height-12}" stroke="#e3e9ed"/><text x="${xx}" y="17" text-anchor="${i===0?'start':i===4?'end':'middle'}" font-size="11" fill="#5a6d7b">${value.toFixed(2)}%</text>`;}
 rows.forEach((r,i)=>{
  const y=top+i*rowHeight,barY=compact?y+20:y+4,barH=compact?15:21,color=r.actual?'#667c8d':r.total?'#153a49':r.bp<-.00001?'#267965':r.bp>.00001?'#bc633e':'#8396a4';
  const labelY=compact?y+10:y+19;
  svg+=`<text x="${compact?left:0}" y="${labelY}" font-size="${compact?11:12}" font-weight="${r.total?600:400}" fill="#193a4d">${r.label}</text>`;
  svg+=`<text x="${width-(compact?right:0)}" y="${compact?labelY:y+19}" text-anchor="end" font-size="${compact?11:12}" fill="${color}" font-weight="600">${r.value}</text>`;
  if(i>0&&!r.total)svg+=`<line x1="${x(r.start)}" x2="${x(r.start)}" y1="${barY-rowHeight+barH}" y2="${barY+barH}" stroke="#a5b3bc" stroke-dasharray="2 2"/>`;
  const start=r.total?left:x(Math.min(r.start,r.end)),end=x(Math.max(r.start,r.end));
  svg+=`<rect x="${start}" y="${barY}" width="${Math.max(1.5,end-start)}" height="${barH}" rx="2" fill="${color}"/>`;
  if(!r.total)svg+=`<line x1="${x(r.end)}" x2="${x(r.end)}" y1="${barY-3}" y2="${barY+barH+3}" stroke="#526d7b"/>`;
 });
 container.innerHTML=svg+'</svg>';
 container.setAttribute('aria-label',`Rate breakdown: starting average ${pct(result.baseline)}, ${result.adjustments.map(r=>`${r.label} ${signed(r.bp)} basis points`).join(', ')}. Estimated benchmark ${pct(result.rate)}.${actual===null?'':` Your actual rate ${pct(actual)}.`} The same data is available in the table below.`);
 $('breakdown-rows').innerHTML=rows.map(r=>`<tr><th scope="row">${r.label}</th><td>${r.total?'—':signed(r.bp)}</td><td>${pct(r.end)}</td></tr>`).join('');
}
for(const id of ['loan-form','reference-form']){$(id).addEventListener('input',update);$(id).addEventListener('submit',e=>e.preventDefault());}
$('actual-rate').addEventListener('input',update);
$('reset').addEventListener('click',()=>{reset('loan-',example);$('actual-rate').value='';update();});
$('clear').addEventListener('click',()=>reset('loan-',{}));
$('reset-reference').addEventListener('click',()=>reset('ref-',REFERENCE));
new ResizeObserver(()=>{if(result&&!result.errors.length){const a=$('actual-rate').value.trim();draw(a!==''&&compare(Number(a),result.rate)?Number(a):null);}}).observe($('waterfall'));
try{
 const response=await fetch(new URL('./market.json',import.meta.url));if(!response.ok)throw Error('Source unavailable');market=await response.json();
 $('market-date').textContent=`RBA benchmark: ${market.observationLabel}`;
 $('source-vintage').textContent=`Benchmark observations: ${market.observationLabel}. Workbook publication: ${market.publicationDate}. Source checked: ${market.retrievedDate}. Series: ${Object.values(market.rates).map(r=>r.seriesId).join(', ')}. Coefficients: March 2018 publication.`;
 update();
}catch(error){$('market-date').textContent='RBA benchmark unavailable';$('estimate-detail').textContent='The benchmark could not be loaded. Please reload the page.';$('form-error').hidden=false;$('form-error').textContent='No estimate is shown because the source data is unavailable.';console.error(error);}
