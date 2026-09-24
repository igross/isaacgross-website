(async()=>{
 const canvas=document.querySelector('#rate-background');if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 let data;try{const r=await fetch('/assets/cash-rate-history.json?v=20260924-ten');if(!r.ok)return;data=await r.json();}catch{return;}
 const day=86400000,year=365.25*day,stamp=s=>Date.parse(s+'T00:00:00Z');
 const frames=data.frames.map(f=>({...f,t:stamp(f.date)})),actual=data.actual.map(([d,v])=>[stamp(d),v]);
 const start=stamp('2000-01-01'),end=frames.at(-1).t+10*year;
 const max=Math.ceil(frames.reduce((m,f)=>Math.max(m,...(f.forward||[])),Math.max(...actual.map(a=>a[1]))));
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let width=0,height=0,raf=0,elapsed=0,last=0,index=0;
 const x=t=>(t-start)/(end-start)*width,y=v=>height*.85-v/max*height*.65;
 const ghosts=[];let quarter='';frames.forEach((f,i)=>{if(!f.forward)return;const q=f.date.slice(0,4)+Math.floor((Number(f.date.slice(5,7))-1)/3);if(q!==quarter){ghosts.push(i);quarter=q;}});
 function forward(f){ctx.beginPath();f.forward.forEach((v,j)=>{const px=x(f.t+data.horizons[j]*year),py=y(v);j?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();}
 function draw(){
  ctx.clearRect(0,0,width,height);const f=frames[index];
  ctx.lineWidth=1;ctx.strokeStyle='rgba(42,99,127,.22)';ctx.setLineDash([]);
  for(const i of ghosts){if(i>=index)break;forward(frames[i]);}
  ctx.beginPath();let prev=null;
  for(const [t,v] of actual){if(t>f.t)break;if(prev===null)ctx.moveTo(x(t),y(v));else{ctx.lineTo(x(t),y(prev));ctx.lineTo(x(t),y(v));}prev=v;}
  if(prev!==null)ctx.lineTo(x(f.t),y(prev));ctx.strokeStyle='rgba(22,98,126,.75)';ctx.lineWidth=2;ctx.stroke();
  if(f.forward){const g=ctx.createLinearGradient(x(f.t),0,x(f.t+10*year),0);g.addColorStop(0,'rgba(174,113,52,.85)');g.addColorStop(1,'rgba(174,113,52,.08)');ctx.strokeStyle=g;ctx.lineWidth=1.5;ctx.setLineDash([6,5]);forward(f);ctx.setLineDash([]);}
 }
 function resize(){width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
 function tick(now){if(last)elapsed+=now-last;last=now;index=Math.min(frames.length-1,Math.floor((elapsed%42000)/36720*(frames.length-1)));draw();raf=requestAnimationFrame(tick);}
 function sync(){cancelAnimationFrame(raf);last=0;if(reduce.matches){index=frames.length-1;draw();}else if(!document.hidden)raf=requestAnimationFrame(tick);}
 resize();addEventListener('resize',resize);document.addEventListener('visibilitychange',sync);reduce.addEventListener('change',sync);sync();
})();
