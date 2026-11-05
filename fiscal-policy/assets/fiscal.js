(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const colours = {gc: '#b3443f', gi: '#175da0'};
  let data;
  const fmt = (x, digits=3) => (Math.abs(x)<.5*10**-digits ? 0 : x).toFixed(digits);
  const inflationKey = () => $('fiscal-inflation').value;
  const amount = () => Number($('fiscal-size').value);
  const outcomes = () => [[inflationKey(),`${inflationKey()==='inflation'?'Trimmed mean':'Headline CPI'} inflation`,'Year-ended inflation · percentage-point change'],['cash','Cash rate','Percentage-point change'],['gdp','Real GDP','Per cent deviation from baseline'],['spending','Extra government spending','Per cent of baseline GDP']];
  function chart(key, title, unit) {
    const section = document.createElement('section');
    section.className = 'fiscal-chart';
    section.innerHTML = `<h3>${title}</h3><p>${unit}</p>`;
    const W = Math.max(260, Math.round(($('fiscal-charts').clientWidth-(innerWidth>700?26:0))/(innerWidth>700?2:1)));
    const H=270, l=51, r=12, top=18, bottom=42, pw=W-l-r, ph=H-top-bottom;
    const values=data.scenarios.flatMap(s=>s[key].map(v=>v*amount()));
    let lo=Math.min(0,...values), hi=Math.max(0,...values);
    const pad=Math.max((hi-lo)*.12,.005);
    lo-=pad; hi+=pad;
    const target=(hi-lo)/4, power=10**Math.floor(Math.log10(target));
    const step=[1,2,2.5,5,10].map(v=>v*power).find(v=>v>=target);
    lo=Math.floor(lo/step)*step; hi=Math.ceil(hi/step)*step;
    const y=v=>top+(hi-v)/(hi-lo)*ph, x=q=>l+q/40*pw;
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}: four spending scenarios over ten years; exact values available in CSV"><title>${title}</title>`;
    for(let i=0;i<=Math.round((hi-lo)/step);i++){
      const v=lo+i*step;
      svg+=`<line x1="${l}" x2="${W-r}" y1="${y(v)}" y2="${y(v)}" stroke="#d4dfe5" stroke-width=".7"/><text x="${l-7}" y="${y(v)+4}" text-anchor="end" fill="#536575" font-family="Arial" font-size="11">${fmt(v,step<.01?3:2)}</text>`;
    }
    svg+=`<rect x="${l}" y="${top}" width="${pw}" height="${ph}" fill="none" stroke="#c0cdd6"/><line x1="${l}" x2="${W-r}" y1="${y(0)}" y2="${y(0)}" stroke="#788b99" stroke-width="1"/>`;
    for(let q=0;q<=40;q+=8) svg+=`<text x="${x(q)}" y="${H-21}" text-anchor="middle" fill="#536575" font-family="Arial" font-size="11">${q/4}</text>`;
    svg+=`<text x="${l+pw/2}" y="${H-3}" text-anchor="middle" fill="#536575" font-family="Arial" font-size="11">Years after the shock</text>`;
    // Solid paths underneath dashed paths keeps the common first year legible.
    for(const s of [...data.scenarios].sort((a,b)=>Number(a.duration==='temporary')-Number(b.duration==='temporary'))){
      const points=[0,...s[key].map(v=>v*amount())];
      let path=`M${x(0)},${y(0)}`;
      for(let q=1;q<points.length;q++) path+=key==='spending'?`H${x(q-1)}V${y(points[q])}H${x(q)}`:`L${x(q)},${y(points[q])}`;
      svg+=`<path data-scenario="${s.id}" d="${path}" fill="none" stroke="${colours[s.component]}" stroke-width="2.3" ${s.duration==='temporary'?'stroke-dasharray="6 4"':''}><title>${s.label}</title></path>`;
    }
    section.innerHTML+=svg+'</svg>';
    return section;
  }
  function render(){
    const a=amount();
    $('fiscal-size-value').textContent=`${a>0?'+':''}${a.toFixed(2)}%`;
    $('fiscal-charts').replaceChildren(...outcomes().map(v=>chart(...v)));
    $('fiscal-peaks').innerHTML=data.scenarios.map(s=>`<tr><th>${s.label}</th>${[inflationKey(),'cash','gdp'].map(k=>{
      const vals=s[k].map(v=>v*a); const i=vals.reduce((best,v,j)=>Math.abs(v)>Math.abs(vals[best])?j:best,0);
      return `<td>${fmt(vals[i])}${a===0?'':` <small>(Q${i+1})</small>`}</td>`;
    }).join('')}</tr>`).join('');
  }
  function download(){
    const rows=[['scenario','quarter','extra_spending_percent_baseline_gdp','extra_spending_percent_component','trimmed_mean_inflation_pp','headline_cpi_inflation_pp','cash_rate_pp','real_gdp_percent']];
    for(const s of data.scenarios) for(let t=0;t<40;t++) rows.push([s.id,t+1,...['spending','componentPercent','inflation','headline','cash','gdp'].map(k=>s[k][t]*amount())]);
    const url=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='martin-government-spending.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  fetch('/fiscal-policy/assets/responses.json?v=1').then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(result=>{
    data=result;
    $('fiscal-legend').innerHTML=data.scenarios.map(s=>`<span><i class="${s.duration}" style="--series:${colours[s.component]}"></i>${s.label}</span>`).join('');
    $('fiscal-status').textContent='';
    $('fiscal-size').addEventListener('input',render);$('fiscal-inflation').addEventListener('change',render);
    $('fiscal-download').disabled=false;$('fiscal-download').addEventListener('click',download);
    let timer;addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(render,100);});render();
  }).catch(()=>{$('fiscal-status').textContent='Model responses could not load. Please reload the page to try again.';});
})();
