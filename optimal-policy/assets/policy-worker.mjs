import {optimizePath,optimizeRule} from './policy-engine.mjs?v=2';
onmessage=({data:{id,data,settings}})=>{
  try {postMessage({id,result:{path:optimizePath(data,settings),rule:optimizeRule(data,settings)}});}
  catch(error){postMessage({id,error:error.message});}
};
