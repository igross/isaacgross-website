// Percentage-point units throughout. Forecast index 0 is the unchanged anchor.
export const DEFAULTS = Object.freeze({inflation:1, unemployment:1, smoothing:.5,
  minRate:0, maxRate:8, maxMove:1, neutral:1});
export const RULE_BOUNDS = [[0,1],[0,5],[0,5],[0,5]]; // inertia, inflation, unemployment, momentum
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function validate(o) {
  for(const k of Object.keys(DEFAULTS)) if(!Number.isFinite(o[k])) throw Error('Enter a valid number for every setting.');
  if(['inflation','unemployment','smoothing'].some(k=>o[k]<0||o[k]>10)) throw Error('Loss weights must be between 0 and 10.');
  if(o.inflation+o.unemployment+o.smoothing===0) throw Error('Give at least one loss component a positive weight.');
  if(o.minRate<0||o.maxRate>10||o.minRate>=o.maxRate) throw Error('Rate bounds must lie between 0% and 10%, with the minimum below the maximum.');
  if(o.maxMove<.05||o.maxMove>2) throw Error('The maximum quarterly move must be between 0.05 and 2 percentage points.');
  if(o.neutral<0||o.neutral>4) throw Error('The neutral real rate must be between 0% and 4%.');
}
export function evaluate(data,rates,o) {
  const n=data.quarters.length-1, b=data.baseline;
  if(rates.length!==n||!rates.every(Number.isFinite)) throw Error('Invalid cash-rate path.');
  const delta=rates.map((v,t)=>v-b.CR[t+1]);
  const result={CR:[b.CR[0],...rates]};
  for(const k of ['TMI','UR']) result[k]=[b[k][0],...data.responses[k].map((row,t)=>b[k][t+1]+dot(row,delta))];
  const terms={inflation:[],unemployment:[],smoothing:[]};
  for(let t=1;t<=n;t++){
    terms.inflation.push(o.inflation*(result.TMI[t]-data.targets.inflation)**2);
    terms.unemployment.push(o.unemployment*(result.UR[t]-data.targets.nairu)**2);
    terms.smoothing.push(o.smoothing*(result.CR[t]-result.CR[t-1])**2);
  }
  result.loss=terms.inflation.map((v,t)=>v+terms.unemployment[t]+terms.smoothing[t]);
  result.parts=Object.fromEntries(Object.entries(terms).map(([k,v])=>[k,v.reduce((s,x)=>s+x,0)]));
  result.total=result.loss.reduce((s,v)=>s+v,0);
  result.cumulative=result.loss.map((_,t)=>result.loss.slice(0,t+1).reduce((s,v)=>s+v,0));
  return result;
}
function linearSolve(matrix,rhs) {
  const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]]);
  for(let j=0;j<n;j++) {
    let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[pivot][j]))pivot=i;
    if(Math.abs(a[pivot][j])<1e-14)throw Error('Singular optimization system.');
    [a[j],a[pivot]]=[a[pivot],a[j]];
    for(let i=j+1;i<n;i++) {const q=a[i][j]/a[j][j];for(let k=j;k<=n;k++)a[i][k]-=q*a[j][k];}
  }
  const x=Array(n).fill(0);for(let i=n-1;i>=0;i--){x[i]=(a[i][n]-a[i].slice(i+1,n).reduce((s,v,k)=>s+v*x[i+1+k],0))/a[i][i];}
  return x;
}
function constraints(data,o) {
  const n=data.quarters.length-1, out=[];
  for(let t=0;t<n;t++)for(const sign of [1,-1]) {
    const bound=Array(n).fill(0);bound[t]=sign;
    out.push({a:bound,b:sign===1?o.maxRate:-o.minRate});
    const move=Array(n).fill(0);move[t]=sign;if(t)move[t-1]=-sign;
    out.push({a:move,b:o.maxMove+(t?0:sign*data.baseline.CR[0])});
  }
  return out;
}
export function feasible(data,rates,o,tol=1e-7) {
  return constraints(data,o).every(({a,b})=>dot(a,rates)<=b+tol);
}
function quadratic(data,o) {
  const n=data.quarters.length-1,b=data.baseline,H=Array.from({length:n},()=>Array(n).fill(0)),g=Array(n).fill(0);
  function add(row,offset,w) {for(let i=0;i<n;i++){g[i]+=2*w*offset*row[i];for(let j=0;j<n;j++)H[i][j]+=2*w*row[i]*row[j];}}
  for(const [k,w,target] of [['TMI',o.inflation,data.targets.inflation],['UR',o.unemployment,data.targets.nairu]])
    data.responses[k].forEach((row,t)=>add(row,b[k][t+1]-target-dot(row,b.CR.slice(1)),w));
  for(let t=0;t<n;t++){const row=Array(n).fill(0);row[t]=1;if(t)row[t-1]=-1;add(row,t?0:-b.CR[0],o.smoothing);}
  return {H,g};
}
export function optimizePath(data,o=DEFAULTS) {
  validate(o);
  const n=data.quarters.length-1, cs=constraints(data,o),{H,g}=quadratic(data,o);
  let prev=data.baseline.CR[0];
  let x=data.baseline.CR.slice(1).map(v=>{const lo=Math.max(o.minRate,prev-o.maxMove),hi=Math.min(o.maxRate,prev+o.maxMove);if(lo>hi)throw Error('These bounds cannot be reached from the starting cash rate in one quarter.');return prev=clamp(v,lo,hi);});
  let active=[],iterations=0,certificate=Infinity;
  const history=[evaluate(data,x,o).total];
  for(;iterations<1000;iterations++) {
    const grad=H.map((r,i)=>dot(r,x)+g[i]);
    const size=n+active.length,K=Array.from({length:size},()=>Array(size).fill(0));
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)K[i][j]=H[i][j]+(i===j?1e-11:0);
    active.forEach((c,k)=>cs[c].a.forEach((v,i)=>K[i][n+k]=K[n+k][i]=v));
    const solution=linearSolve(K,[...grad.map(v=>-v),...active.map(()=>0)]),p=solution.slice(0,n),lambda=solution.slice(n);
    if(Math.max(...p.map(Math.abs))<1e-8) {
      const worst=lambda.length?Math.min(...lambda):0;
      if(worst>=-1e-8){certificate=Math.max(...grad.map((v,i)=>Math.abs(v+active.reduce((s,c,k)=>s+lambda[k]*cs[c].a[i],0))));break;}
      active.splice(lambda.indexOf(worst),1);continue;
    }
    let alpha=1,blocking=-1;
    cs.forEach(({a,b},c)=>{if(active.includes(c))return;const ap=dot(a,p);if(ap>1e-12){const candidate=Math.max(0,(b-dot(a,x))/ap);if(candidate<alpha){alpha=candidate;blocking=c;}}});
    x=x.map((v,i)=>v+alpha*p[i]);
    if(blocking>=0)active.push(blocking);
    history.push(evaluate(data,x,o).total);
  }
  if(!feasible(data,x,o)||!Number.isFinite(certificate)||certificate>1e-6)throw Error('The path optimizer did not converge. Try a positive smoothing weight.');
  return {method:'path',...evaluate(data,x,o),rates:x,iterations,certificate,history};
}
export function simulateRule(data,theta,o=DEFAULTS) {
  const [rho,pi,u,momentum]=theta,b=data.baseline,n=b.CR.length-1;
  const rates=[],inflation=[b.TMI[0]],unemployment=[b.UR[0]],delta=[];
  for(let t=0;t<n;t++) {
    const P=data.responses.TMI[t],U=data.responses.UR[t];
    const p0=b.TMI[t+1]+dot(P.slice(0,t),delta)-P[t]*b.CR[t+1];
    const u0=b.UR[t+1]+dot(U.slice(0,t),delta)-U[t]*b.CR[t+1];
    const last=t?rates[t-1]:b.CR[0],lag2=t>=1?unemployment[t-1]:b.UR[0];
    // pi_t and u_t depend on i_t, so solve the contemporaneous scalar equation.
    const constant=rho*last+(1-rho)*(o.neutral+(1+pi)*p0-pi*data.targets.inflation-u*(u0-data.targets.nairu))-momentum*(u0-lag2);
    const feedback=(1-rho)*((1+pi)*P[t]-u*U[t])-momentum*U[t];
    const lo=Math.max(o.minRate,last-o.maxMove),hi=Math.min(o.maxRate,last+o.maxMove);
    if(lo>hi||Math.abs(1-feedback)<1e-8)throw Error('Infeasible policy rule.');
    const rate=clamp(constant/(1-feedback),lo,hi);
    rates.push(rate);delta.push(rate-b.CR[t+1]);inflation.push(p0+P[t]*rate);unemployment.push(u0+U[t]*rate);
  }
  return {rates,...evaluate(data,rates,o)};
}
function halton(i,b){let x=0,f=1;while(i>0){f/=b;x+=f*(i%b);i=Math.floor(i/b);}return x;}
function nelderMead(start,fn) {
  const dim=4,limit=[1,5,5,5],project=x=>x.map((v,i)=>clamp(v,0,limit[i]));
  const make=x=>({x:project(x),f:fn(project(x))});
  let simplex=[make(start),...start.map((_,i)=>make(start.map((v,j)=>j===i?clamp(v+(v>.9*limit[j]?-.08:.08)*limit[j],0,limit[j]):v)))];
  for(let it=0;it<900;it++) {
    simplex.sort((a,b)=>a.f-b.f);const best=simplex[0],worst=simplex[dim];
    if(Math.max(...simplex.map(s=>Math.max(...s.x.map((v,i)=>Math.abs(v-best.x[i])/limit[i]))))<2e-7)break;
    const centroid=start.map((_,i)=>simplex.slice(0,dim).reduce((s,p)=>s+p.x[i]/dim,0));
    const reflected=make(centroid.map((v,i)=>2*v-worst.x[i]));
    if(reflected.f<best.f){const expanded=make(centroid.map((v,i)=>v+2*(reflected.x[i]-v)));simplex[dim]=expanded.f<reflected.f?expanded:reflected;}
    else if(reflected.f<simplex[dim-1].f)simplex[dim]=reflected;
    else {
      const outside=reflected.f<worst.f,point=outside?reflected:worst;
      const contracted=make(centroid.map((v,i)=>v+.5*(point.x[i]-v)));
      if(contracted.f<(outside?reflected.f:worst.f))simplex[dim]=contracted;
      else simplex=simplex.map((s,k)=>k?make(s.x.map((v,i)=>(v+best.x[i])/2)):s);
    }
  }
  return simplex.sort((a,b)=>a.f-b.f)[0];
}
export function optimizeRule(data,o=DEFAULTS) {
  validate(o);let calls=0,best=Infinity,history=[];
  const fn=theta=>{calls++;let loss;try{loss=simulateRule(data,theta,o).total;}catch{return Infinity;}if(loss<best){best=loss;history.push(loss);}return loss;};
  const seeds=[[.7,.5,1,0],[.4,.1,2.1,0],[1,0,0,0],[0,0,0,0],[.9,0,0,0]];
  for(let k=1;k<=384;k++)seeds.push([halton(k,2),5*halton(k,3),5*halton(k,5),5*halton(k,7)]);
  const ranked=seeds.map(x=>({x,f:fn(x)})).sort((a,b)=>a.f-b.f);
  let winner=ranked[0];
  // Include boundary seeds even when not among the best initial draws.
  for(const x of [...ranked.slice(0,12).map(s=>s.x),...seeds.slice(0,5)]) {
    const candidate=nelderMead(x,fn);if(candidate.f<winner.f)winner=candidate;
  }
  if(!Number.isFinite(winner.f))throw Error('No feasible rule for these rate limits.');
  const result=simulateRule(data,winner.x,o);
  return {method:'rule',...result,coefficients:winner.x,calls,history};
}
export function policyCSV(data,result,o) {
  const baseline=evaluate(data,data.baseline.CR.slice(1),o);
  const rows=[['Method',result.method==='path'?'Quarter-by-quarter path':'Simple policy rule'],['Forecast vintage',data.vintage],
    ...Object.entries(o).map(([k,v])=>[k,v]),['Inflation target',data.targets.inflation],['NAIRU',data.targets.nairu],
    ['Total baseline loss',baseline.total],['Total policy loss',result.total],
    ...(result.coefficients?[['Rule coefficients: inertia, inflation, unemployment, momentum',...result.coefficients]]:[]),
    ['Quarter','Cash rate baseline (%)','Cash rate policy (%)','Trimmed mean baseline (%)','Trimmed mean policy (%)','Unemployment baseline (%)','Unemployment policy (%)','Baseline loss','Policy loss']];
  data.quarters.forEach((q,t)=>rows.push([q,baseline.CR[t],result.CR[t],baseline.TMI[t],result.TMI[t],baseline.UR[t],result.UR[t],t?baseline.loss[t-1]:'',t?result.loss[t-1]:'']));
  return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
}
