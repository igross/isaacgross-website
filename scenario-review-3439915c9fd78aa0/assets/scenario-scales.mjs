import {scenario} from './scenario-engine.mjs';
// One reference domain per forecast variable, independent of active selections.
// Include both directions of every example from both models, plus baseline.
export function fixedScales(data) {
  const bounds=Object.fromEntries(Object.entries(data.baseline).map(([key,b])=>[key,[Math.min(...b.values),Math.max(...b.values)]]));
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
