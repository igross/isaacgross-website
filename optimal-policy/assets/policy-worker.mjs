import {optimizePath,optimizeRule} from './policy-engine.mjs?v=1';
onmessage=({data:{id,data,settings,method}})=>{
  try {postMessage({id,result:(method==='rule'?optimizeRule:optimizePath)(data,settings)});}
  catch(error){postMessage({id,error:error.message});}
};
