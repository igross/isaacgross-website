// Bergmann & Tran (2018), Table 1. Coefficients predict SVR discounts in bp.
export const COEFFICIENTS = Object.freeze({intercept:95.5,months:-0.8,amount:3.3,amountSquared:-0.1,lvr:0.1,lvrOver80:-0.02,lmi:-8,income:0.05,lti:-0.4,apartment:1.8,broker:4.5,fullDoc:13.3,nonMetro:-6.1,notPayg:-2.9});
export const TYPES = Object.freeze({owner_pi:0,owner_io:-8.5,investor_pi:15.3,investor_io:8.8});
export const PURPOSES = Object.freeze({existing:0,refinance:1.3,new:0.1,construction:-8,other:-9.8});
export const REFERENCE = Object.freeze({amount:600000,income:150000,lvr:80,months:24,type:'owner_pi',purpose:'existing',lmi:false,apartment:false,broker:false,fullDoc:true,nonMetro:false,notPayg:false});
export function validate(p) {
 const errors=[];
 for(const [key,min,max,label] of [['amount',10000,1650000,'Original loan amount'],['income',1000,10000000,'Annual income'],['lvr',1,100,'Original LVR'],['months',0,600,'Loan age']]) {
  if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<min||p[key]>max) errors.push(`${label}: enter a number from ${min.toLocaleString('en-AU')} to ${max.toLocaleString('en-AU')}.`);
 }
 if(!Object.hasOwn(TYPES,p.type)||!Object.hasOwn(PURPOSES,p.purpose)) errors.push('Choose a valid loan type and purpose.');
 for(const key of ['lmi','apartment','broker','fullDoc','nonMetro','notPayg']) if(typeof p[key]!=='boolean') errors.push(`Missing choice: ${key}.`);
 return errors;
}
export function discountTerms(p) {
 const c=COEFFICIENTS,a=p.amount/100000;
 return [
  {key:'months',label:'Loan age',bp:c.months*Math.min(p.months,47)},
  {key:'type',label:'Loan type',bp:TYPES[p.type]},
  {key:'amount',label:'Original loan size',bp:c.amount*a+c.amountSquared*a*a},
  {key:'lvr',label:'Original LVR',bp:c.lvr*p.lvr+c.lvrOver80*p.lvr*(p.lvr>80?1:0)},
  {key:'lmi',label:'Mortgage insurance',bp:c.lmi*Number(p.lmi)},
  {key:'income',label:'Income & loan-to-income',bp:c.income*p.income/10000+c.lti*p.amount/p.income},
  {key:'apartment',label:'Property type',bp:c.apartment*Number(p.apartment)},
  {key:'broker',label:'Mortgage broker',bp:c.broker*Number(p.broker)},
  {key:'fullDoc',label:'Income documentation',bp:c.fullDoc*Number(p.fullDoc)},
  {key:'purpose',label:'Loan purpose',bp:PURPOSES[p.purpose]},
  {key:'nonMetro',label:'Property location',bp:c.nonMetro*Number(p.nonMetro)},
  {key:'notPayg',label:'Employment type',bp:c.notPayg*Number(p.notPayg)}
 ];
}
export function estimate(p,market,reference=REFERENCE) {
 const errors=[...validate(p),...validate(reference)];
 if(errors.length) return {errors};
 const baseline=market.rates[p.type]?.rate;
 if(!Number.isFinite(baseline)) return {errors:['The RBA benchmark is unavailable.']};
 // Reference matches loan type: current F6 type levels replace historical type pricing.
 // Intercept, type coefficient and common institution/state effects cancel in differences.
 const ref={...reference,type:p.type},rt=discountTerms(ref),terms=discountTerms(p);
 const adjustments=terms.filter(t=>t.key!=='type').map(t=>({key:t.key,label:t.label,bp:rt.find(r=>r.key===t.key).bp-t.bp}));
 const adjustmentBp=adjustments.reduce((s,t)=>s+t.bp,0);
 return {errors:[],baseline,adjustments,adjustmentBp,rate:baseline+adjustmentBp/100,ageCapped:p.months>47||ref.months>47};
}
export function compare(actual,expected) {
 if(typeof actual!=='number'||!Number.isFinite(actual)||actual<=0||actual>30||!Number.isFinite(expected)) return null;
 const gapBp=(actual-expected)*100;
 return {gapBp,direction:Math.abs(gapBp)<0.5?'close':gapBp>0?'above':'below'};
}
