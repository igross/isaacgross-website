// Cash-rate levels follow the 0.10, 0.35, 0.60, 0.85 percentage-point lattice.
export function cashRateAxis(values) {
 const finite=values.filter(Number.isFinite);
 if(!finite.length)throw new Error('Cash-rate axis requires finite values.');
 const step=.25,origin=.10;
 const low=Math.min(...finite),high=Math.max(...finite);
 let a=Math.floor((low-origin)/step+1e-8),b=Math.ceil((high-origin)/step-1e-8);
 if(a===b){a--;b++;}
 const ticks=Array.from({length:b-a+1},(_,i)=>Number((origin+(a+i)*step).toFixed(2)));
 return {lo:ticks[0]-.035,hi:ticks.at(-1)+.035,ticks,step};
}
