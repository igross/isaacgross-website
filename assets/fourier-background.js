// Decorative Fourier Australia. Geometry: Natural Earth, public domain.
(async () => {
  'use strict';
  const canvas = document.getElementById('fourier-background');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  let coefficients;
  try {
    const response = await fetch('/assets/fourier-australia.json?v=1');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    coefficients = await response.json();
  } catch (error) {
    console.warn('Decorative Fourier background could not load.', error);
    return;
  }
  const sequence = [...Array.from({length:30}, (_,i)=>i+1),40,50,60,70,80,90,100,
    ...Array.from({length:9}, (_,i)=>(i+2)*100)];
  const milestones = new Set([1,5,10,20,30,50,100]);
  const durations = sequence.map(n=>n<=10?2.6:n<=30?1.35:0.8);
  const starts = [0];
  for (const duration of durations) starts.push(starts.at(-1)+duration);
  const drawEnd=starts.at(-1), hold=3, reset=2, cycle=drawEnd+hold+reset;
  const resolution=4096, paths=coefficients.map(()=>({}));
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  // Yield between small batches so preparation never monopolises the page.
  for (let c=0;c<coefficients.length;c++) {
    const {center,terms}=coefficients[c];
    const x=new Float64Array(resolution+1).fill(center[0]);
    const y=new Float64Array(resolution+1).fill(center[1]);
    for (let term=0;term<1000;term++) {
      const [k,re,im]=terms[term];
      for(let j=0;j<=resolution;j++) {
        const angle=j/resolution*2*Math.PI*k, cos=Math.cos(angle),sin=Math.sin(angle);
        x[j]+=re*cos-im*sin;y[j]+=re*sin+im*cos;
      }
      if(sequence.includes(term+1)) {
        const full=new Path2D();full.moveTo(x[0],y[0]);
        for(let j=0;j<=resolution;j++) {
          if(j)full.lineTo(x[j],y[j]);
          minX=Math.min(minX,x[j]);maxX=Math.max(maxX,x[j]);
          minY=Math.min(minY,y[j]);maxY=Math.max(maxY,y[j]);
        }
        paths[c][term+1]={x:x.slice(),y:y.slice(),full};
      }
      if(term%20===19) await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const ease=t=>t*t*(3-2*t);
  let width=0,height=0,scale=1,dpr=1,elapsed=0,last=null,painted=null,raf=0;
  function position() {
    if(reduce.matches || elapsed>=drawEnd) return {i:sequence.length-1,n:1000,p:1};
    let i=0;while(i<sequence.length-1 && elapsed>=starts[i+1])i++;
    return {i,n:sequence[i],p:(elapsed-starts[i])/durations[i]};
  }
  function stroke(path,fraction,opacity,lineWidth,tip=false) {
    if(opacity<=0 || fraction<=0)return;
    ctx.globalAlpha=opacity;ctx.lineWidth=lineWidth/scale;
    if(fraction>=1) {ctx.stroke(path.full);return;}
    const end=fraction*resolution,stop=Math.floor(end);
    ctx.beginPath();ctx.moveTo(path.x[0],path.y[0]);
    for(let j=1;j<=stop;j++)ctx.lineTo(path.x[j],path.y[j]);
    const f=end-stop;
    const x=path.x[stop]+(path.x[stop+1]-path.x[stop])*f;
    const y=path.y[stop]+(path.y[stop+1]-path.y[stop])*f;
    ctx.lineTo(x,y);ctx.stroke();
    if(tip) {ctx.beginPath();ctx.arc(x,y,1.8/scale,0,2*Math.PI);ctx.fill();}
  }
  function draw() {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.translate(width/2,height*.53);ctx.scale(scale,scale);
    ctx.translate(-(minX+maxX)/2,-(minY+maxY)/2);
    ctx.strokeStyle=ctx.fillStyle='#527264';ctx.lineCap=ctx.lineJoin='round';
    const {i,n,p}=position();
    const fade=!reduce.matches && elapsed>drawEnd+hold?1-ease(Math.min(1,(elapsed-drawEnd-hold)/reset)):1;
    for(let c=0;c<paths.length;c++) {
      for(let previous=0;previous<i;previous++) {
        const old=sequence[previous],age=i-previous-1+p;
        if(age>22 && !milestones.has(old))continue;
        let opacity=Math.max(milestones.has(old)?.18:0,.28*Math.exp(-age/5));
        if(previous===i-1)opacity+=(.95-.28)*(1-ease(Math.min(1,p/.22)));
        const island=c===0?1:ease(Math.max(0,Math.min(1,(old-6)/5)));
        stroke(paths[c][old],1,opacity*fade*island,1.05);
      }
      const island=c===0?1:ease(Math.max(0,Math.min(1,(n-7+p)/5)));
      stroke(paths[c][n],Math.min(1,p/.94),.95*fade*island,1.7,true);
    }
    ctx.globalAlpha=1;canvas.dataset.n=String(n);
  }
  function resize() {
    width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    scale=Math.min(Math.min(width*.9,1150)/(maxX-minX),height*.84/(maxY-minY));
    draw();
  }
  function tick(now) {
    if(last!==null)elapsed=(elapsed+Math.min((now-last)/1000,.1))%cycle;
    last=now;
    if(painted===null || now-painted>=1000/30) {draw();painted=now;}
    raf=requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(raf);last=null;painted=null;
    if(reduce.matches)draw();
    else if(!document.hidden)raf=requestAnimationFrame(tick);
  }
  resize();addEventListener('resize',resize);
  document.addEventListener('visibilitychange',sync);reduce.addEventListener('change',sync);sync();
})();
