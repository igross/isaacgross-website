import {scenario} from './scenario-engine.mjs?v=4';
// One reference domain per forecast variable, independent of active selections.
// Include both directions of every example from both models, plus baseline.
export function fixedScales(data) {
  const bounds=Object.fromEntries(Object.entries(data.baseline).map(([key,b])=>[key,[Math.min(...b.values.filter(Number.isFinite)),Math.max(...b.values.filter(Number.isFinite))]]));
  for(const model of data.models)for(const preset of model.presets)for(const sign of [-1,1]){
    const paths=scenario(data,model,{[preset.shock]:sign*preset.amount});
    for(const [key,path] of Object.entries(paths))for(const value of path.values){
      if(Number.isFinite(value)){bounds[key][0]=Math.min(bounds[key][0],value);bounds[key][1]=Math.max(bounds[key][1],value);}
    }
  }
  return Object.fromEntries(Object.entries(bounds).map(([key,[lo,hi]])=>{
    const pad=Math.max((hi-lo)*.15,.25),span=hi-lo+2*pad;
    const power=10**Math.floor(Math.log10(span/4));
    const step=[1,2,2.5,5,10].map(v=>v*power).find(v=>v>=span/4);
    return [key,[Math.floor((lo-pad)/step)*step,Math.ceil((hi+pad)/step)*step]];
  }));
}

export function axisTicks(lo,hi) {
  const target=(hi-lo)/4;
  const power=10**Math.floor(Math.log10(target));
  const step=[1,2,2.5,5,10].map(v=>v*power).find(v=>v>=target);
  const ticks=[];
  for(let i=Math.ceil(lo/step-1e-9);i<=Math.floor(hi/step+1e-9);i++)ticks.push(Number((i*step).toPrecision(12)));
  return ticks;
}
