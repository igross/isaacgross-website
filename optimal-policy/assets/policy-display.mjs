// Display transformations are kept independent of the monetary-policy solver.
export const MARKET_URL='https://raw.githubusercontent.com/igross/cash-rate-forecasts/main/docs/data/cash-rate-latest.json';
export const METHODS=['path','rule'];
export const METHOD_NAMES={path:'Quarterly path',rule:'Policy rule'};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const serialQuarter=q=>{const [m,y]=q.split(' ');if(!months.includes(m)||!/^\d{4}$/.test(y))throw Error('Invalid forecast date');return +y*12+months.indexOf(m);};
export function normalizeMarket(feed,quarters,now=Date.now()){
  if(feed?.schemaVersion!==1||!Array.isArray(feed.points)||feed.points.length<2||!/^\d{4}-\d{2}-\d{2}$/.test(feed.quoteDate)||!Number.isFinite(Date.parse(feed.scrapedAt))||!Number.isFinite(Date.parse(feed.quoteDate)))throw Error('Invalid market feed');
  if(Date.parse(feed.quoteDate)>now+86400000||Date.parse(feed.scrapedAt)>now+86400000)throw Error('Future-dated market feed');
  const origin=serialQuarter(quarters[0]),end=serialQuarter(quarters.at(-1)),seen=new Set();
  const points=feed.points.map(p=>{
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month)||!Number.isFinite(p.ratePct)||p.ratePct< -5||p.ratePct>25||seen.has(p.month))throw Error('Invalid market observations');
    seen.add(p.month);const [year,month]=p.month.split('-').map(Number),serial=year*12+month-1;
    return {month:p.month,value:p.ratePct,t:(serial-origin)/3,serial};
  }).sort((a,b)=>a.serial-b.serial);
  return {quoteDate:feed.quoteDate,scrapedAt:feed.scrapedAt,points:points.filter(p=>p.serial>=origin&&p.serial<=end),
    quarterly:quarters.map(q=>points.find(p=>p.serial===serialQuarter(q))?.value??null),
    firstMonth:points[0].month,lastMonth:points.at(-1).month,source:MARKET_URL};
}
export function rateDecisions(path){return path.map((r,t)=>t?{bp:100*(r-path[t-1]),moves:(r-path[t-1])/.25}:null);}
export function moveLabel(bp){
  if(!Number.isFinite(bp))return '—';
  if(Math.abs(bp)<1e-8)return 'Hold';
  const n=Math.abs(bp)/25,direction=bp>0?'hikes':'cuts';
  return `${n<.005?'<0.01':n.toFixed(2)} ${direction}`;
}
export function bpLabel(bp){
  if(!Number.isFinite(bp))return '—';if(Math.abs(bp)<1e-8)return '0';
  return (bp>0?'+':'−')+(Math.abs(bp)<.05?'<0.1':Math.abs(bp).toFixed(1));
}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function transitionRates(baseline,solution,progress,method){
  const n=solution.length;return solution.map((v,t)=>baseline[t]+(v-baseline[t])*smooth(method==='path'?progress*n-t:progress));
}
export function comparisonCSV(data,results,settings,market){
  const baselineLoss=data.quarters.slice(1).map((_,t)=>settings.inflation*(data.baseline.TMI[t+1]-data.targets.inflation)**2+settings.unemployment*(data.baseline.UR[t+1]-data.targets.nairu)**2+settings.smoothing*(data.baseline.CR[t+1]-data.baseline.CR[t])**2);
  const rows=[['Forecast vintage',data.vintage],['Baseline total loss',baselineLoss.reduce((a,b)=>a+b,0)],['Quarterly-path total loss',results.path.total],['Rule total loss',results.rule.total],...Object.entries(settings),['Inflation target',data.targets.inflation],['NAIRU',data.targets.nairu],
    ['Market quote date',market?.quoteDate??'Unavailable'],['Market source',MARKET_URL],['Market definition','Monthly futures-implied average, not extrapolated'],
    ['Move definition','Continuous rate changes divided by 0.25pp; equivalents, not counts of discrete decisions'],
    ['Rule coefficients: inertia, inflation, unemployment, momentum',...results.rule.coefficients],
    ['Quarter','RBA cash rate (%)','Market (%)','Quarterly-path cash rate (%)','Rule cash rate (%)','Quarterly-path change (bp)','Rule change (bp)','Quarterly-path 25bp equivalents','Rule 25bp equivalents',
    'RBA trimmed mean (%)','Quarterly-path trimmed mean (%)','Rule trimmed mean (%)','RBA unemployment (%)','Quarterly-path unemployment (%)','Rule unemployment (%)','Baseline loss','Quarterly-path loss','Rule loss']];
  const pathMoves=rateDecisions(results.path.CR),ruleMoves=rateDecisions(results.rule.CR);
  data.quarters.forEach((q,t)=>rows.push([q,data.baseline.CR[t],market?.quarterly[t]??null,results.path.CR[t],results.rule.CR[t],pathMoves[t]?.bp,ruleMoves[t]?.bp,pathMoves[t]?.moves,ruleMoves[t]?.moves,
    data.baseline.TMI[t],results.path.TMI[t],results.rule.TMI[t],data.baseline.UR[t],results.path.UR[t],results.rule.UR[t],t?baselineLoss[t-1]:null,t?results.path.loss[t-1]:null,t?results.rule.loss[t-1]:null]));
  return rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
}
