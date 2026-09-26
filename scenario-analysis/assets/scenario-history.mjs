// Keep the frozen SMP forecast and model response timing intact from September.
export function withHistory(source,history){
  if(source.quarters[0]!==history.quarters[1])throw Error('History and forecast quarters do not align.');
  const data=structuredClone(source);
  data.quarters=[history.quarters[0],...source.quarters];
  data.published=[true,...source.published];data.shockStart=source.shockStart+1;
  for(const [key,b] of Object.entries(data.baseline)){
    const h=history.series[key],march=h?.values[0]??null,june=h?.values[1]??null;
    b.values=[march,june??b.values[0],...b.values.slice(1)];
    b.observations=[march!==null?'Actual':'Unavailable',june!==null?'Actual':b.juneHistorical?'Actual':'RBA forecast',...source.quarters.slice(1).map((_,i)=>source.published[i+1]?'RBA forecast':'Interpolated forecast')];
    b.historySource=h?.source;b.historyMissing=march===null||june===null;
  }
  return data;
}
